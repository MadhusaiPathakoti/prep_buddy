// Probe the LLM models the Mocks English pipeline is configured to use, for every ENABLED provider.
//
// WHAT IT DOES
//   For each provider whose key env var is set (GEMINI_API_KEY, GROQ_API_KEY, MISTRAL_API_KEY, OPENROUTER_API_KEY):
//     1. lists the models your key can see (one GET; does not count against generate quotas), then
//     2. makes ONE tiny JSON-mode request to each model of that provider that is in the configured chains,
//        strictly one after another (never in parallel), and prints a table: provider/model, HTTP status, latency,
//        tokens used, the rate-limit headers (token / request limits and what remains), whether the reply was valid
//        JSON, and - for a 429 - which quota was hit (TPM / RPM per-minute, TPD / RPD per-day, or Gemini's quotaId)
//        and the retry delay.
//
// HOW TO RUN (spends ONE request of each probed model's quota - on free tiers run it sparingly)
//   bash:        GROQ_API_KEY=... GEMINI_API_KEY=... npx tsx scripts/probe-llm-models.ts
//   PowerShell:  $env:GROQ_API_KEY="..."; npx tsx scripts/probe-llm-models.ts
//   (keys in .env.local are NOT read by this script; export them in the shell)
//
// WHICH MODELS
//   The same chains the server uses: GEMINI_MODEL forces one Gemini model; otherwise MOCK_ENGLISH_GENERATE_MODELS and
//   MOCK_ENGLISH_SOLVE_MODELS ("provider/model" ids, comma separated; a bare name means gemini); otherwise the
//   defaults below (keep them in sync with DEFAULT_GENERATE_CHAIN / DEFAULT_SOLVE_CHAIN in api/mockEnglish.js).
//
// READING THE TABLE
//   200 + JSON yes   usable. Slow (> ~10 s for a tiny reply) will blow the 15-20 s per-call budgets.
//   429 TPD / RPD / PerDay   the DAILY limit is spent; retryDelay says when it resets. Retrying cannot help.
//   429 TPM / RPM            per-minute limit: wait about retryDelay, or use another model meanwhile.
//   400 + JSON no            the model cannot do JSON mode (the pipeline marks it unavailable for 24 h).
//   404                      the model does not exist for this key any more: remove it from the chain.
//   remaining tokens         Groq's binding limit is tokens per minute per model (~8000 on the free tier):
//                            the pipeline paces its calls against this number.
//
// Keys are read from the environment only and are never printed.

export const DEFAULT_GENERATE_CHAIN = [
  'groq/openai/gpt-oss-120b',
  'gemini/gemini-3-flash-preview',
  'groq/openai/gpt-oss-20b',
  'mistral/mistral-small-latest',
  'gemini/gemini-3.1-flash-lite',
  'gemini/gemini-3.5-flash-lite',
]
export const DEFAULT_SOLVE_CHAIN = ['gemini/gemini-3-flash-preview', 'groq/openai/gpt-oss-120b', 'mistral/mistral-large-latest', 'groq/openai/gpt-oss-20b', 'gemini/gemini-3.1-flash-lite']

export interface ProviderDef {
  keyEnv: string
  kind: 'gemini' | 'openai'
  base: string
}
export const PROVIDERS: Record<string, ProviderDef> = {
  gemini: { keyEnv: 'GEMINI_API_KEY', kind: 'gemini', base: 'https://generativelanguage.googleapis.com/v1beta' },
  groq: { keyEnv: 'GROQ_API_KEY', kind: 'openai', base: 'https://api.groq.com/openai/v1' },
  mistral: { keyEnv: 'MISTRAL_API_KEY', kind: 'openai', base: 'https://api.mistral.ai/v1' },
  openrouter: { keyEnv: 'OPENROUTER_API_KEY', kind: 'openai', base: 'https://openrouter.ai/api/v1' },
}

export interface ProbeRow {
  /** provider/model */
  id: string
  status: number | string
  ms: number
  tokens: number | null
  json: 'yes' | 'no' | '-'
  /** Rate-limit headers, e.g. "tokens 7416/8000, requests 999/1000". */
  limits?: string
  /** For a 429: the quota that was hit. */
  quota?: string
  note?: string
}

type Env = Record<string, string | undefined>
type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

export function parseId(raw: string): { provider: string; model: string; id: string } {
  const t = raw.trim()
  const i = t.indexOf('/')
  if (i > 0) {
    const p = t.slice(0, i).toLowerCase()
    if (PROVIDERS[p]) return { provider: p, model: t.slice(i + 1), id: `${p}/${t.slice(i + 1)}` }
  }
  return { provider: 'gemini', model: t, id: `gemini/${t}` }
}

const csv = (v: string | undefined) =>
  (v ?? '')
    .split(',')
    .map((m) => m.trim())
    .filter(Boolean)

export const enabledProviders = (env: Env = process.env) => Object.keys(PROVIDERS).filter((p) => !!env[PROVIDERS[p].keyEnv])

/** Model ids to probe: the union of the generate and solve chains, limited to enabled providers, in chain order. */
export function configuredModels(env: Env = process.env): string[] {
  const forced = (env.GEMINI_MODEL ?? '').trim()
  const gen = forced ? [forced] : csv(env.MOCK_ENGLISH_GENERATE_MODELS)
  const solve = forced ? [forced] : csv(env.MOCK_ENGLISH_SOLVE_MODELS)
  const all = [...(gen.length ? gen : DEFAULT_GENERATE_CHAIN), ...(solve.length ? solve : DEFAULT_SOLVE_CHAIN)].map((r) => parseId(r))
  const enabled = new Set(enabledProviders(env))
  return [...new Set(all.filter((m) => enabled.has(m.provider)).map((m) => m.id))]
}

const num = (v: string | null | undefined) => (v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v)) ? Number(v) : null)

function describeLimits(h: Headers): string | undefined {
  const lt = num(h.get('x-ratelimit-limit-tokens'))
  const rt = num(h.get('x-ratelimit-remaining-tokens'))
  const lr = num(h.get('x-ratelimit-limit-requests'))
  const rr = num(h.get('x-ratelimit-remaining-requests'))
  const reset = h.get('x-ratelimit-reset-tokens')
  const parts = [lt !== null && `tokens ${rt ?? '?'}/${lt}${reset ? ` (resets in ${reset})` : ''}`, lr !== null && `requests ${rr ?? '?'}/${lr}`].filter(Boolean)
  return parts.length ? parts.join(', ') : undefined
}

function quotaSummary(text: string, headers: Headers): string {
  const retryAfter = headers.get('retry-after')
  try {
    const j = JSON.parse(text) as { error?: { message?: string; details?: Record<string, unknown>[] }; message?: string }
    const err = j.error ?? j
    const msg = String(err.message ?? '')
    const dim = /\((TPM|TPD|RPM|RPD)\)/.exec(msg)?.[1]
    const limit = /Limit\s+(\d+)/i.exec(msg)?.[1]
    const again = /try again in\s+([0-9hmsd.\s]+?)(?:\.\s|\.$|$)/i.exec(msg)?.[1]
    let id = ''
    let value = ''
    let delay = ''
    for (const d of (j.error?.details ?? []) as Record<string, unknown>[]) {
      const v = (d.violations as { quotaId?: string; quotaValue?: string }[] | undefined)?.[0]
      if (v) {
        id = v.quotaId ?? id
        value = String(v.quotaValue ?? value)
      }
      if (typeof d.retryDelay === 'string') delay = d.retryDelay
    }
    const parts = [dim && `quota=${dim}`, id && `quotaId=${id}`, (limit || value) && `limit=${limit || value}`, (again || delay) && `retryDelay=${(again || delay).trim()}`, retryAfter && `retry-after=${retryAfter}s`].filter(Boolean)
    return parts.join(' ') || msg.slice(0, 90) || 'no quota details in body'
  } catch {
    return retryAfter ? `retry-after=${retryAfter}s` : 'unparseable error body'
  }
}

/** Models the key can see (ids without prefixes), or null when the list call fails. */
export async function listModels(provider: string, apiKey: string, fetchImpl: FetchLike = fetch): Promise<string[] | null> {
  const def = PROVIDERS[provider]
  try {
    const res =
      def.kind === 'gemini'
        ? await fetchImpl(`${def.base}/models?pageSize=200`, { headers: { 'x-goog-api-key': apiKey } })
        : await fetchImpl(`${def.base}/models`, { headers: { Authorization: `Bearer ${apiKey}` } })
    if (!res.ok) return null
    if (def.kind === 'gemini') {
      const data = (await res.json()) as { models?: { name?: string; supportedGenerationMethods?: string[] }[] }
      return (data.models ?? []).filter((m) => m.supportedGenerationMethods?.includes('generateContent') && m.name).map((m) => String(m.name).replace(/^models\//, ''))
    }
    const data = (await res.json()) as { data?: { id?: string }[] }
    return (data.data ?? []).map((m) => String(m.id)).filter(Boolean)
  } catch {
    return null
  }
}

const PROMPT = 'Reply with exactly this JSON and nothing else: {"ok": true}'

/** One tiny JSON-mode request to one model. */
export async function probeModel(id: string, apiKey: string, fetchImpl: FetchLike = fetch, timeoutMs = 30000): Promise<ProbeRow> {
  const { provider, model } = parseId(id)
  const def = PROVIDERS[provider]
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  const t0 = Date.now()
  try {
    const res =
      def.kind === 'gemini'
        ? await fetchImpl(`${def.base}/models/${encodeURIComponent(model)}:generateContent`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
            body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: PROMPT }] }], generationConfig: { responseMimeType: 'application/json', temperature: 0 } }),
            signal: controller.signal,
          })
        : await fetchImpl(`${def.base}/chat/completions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
            body: JSON.stringify({ model, messages: [{ role: 'user', content: PROMPT }], temperature: 0, max_tokens: 60, response_format: { type: 'json_object' }, ...(/gpt-oss/i.test(model) ? { reasoning_effort: 'low' } : {}) }),
            signal: controller.signal,
          })
    const ms = Date.now() - t0
    const text = await res.text()
    const limits = describeLimits(res.headers)
    if (!res.ok) {
      const row: ProbeRow = { id, status: res.status, ms, tokens: null, json: '-', limits }
      if (res.status === 429) row.quota = quotaSummary(text, res.headers)
      else {
        try {
          const j = JSON.parse(text) as { error?: { message?: string }; message?: string }
          row.note = String(j.error?.message ?? j.message ?? '').slice(0, 90)
        } catch {
          row.note = text.slice(0, 90)
        }
        if (res.status === 400 && /json/i.test(row.note ?? '')) row.json = 'no'
      }
      return row
    }
    let json: ProbeRow['json'] = 'no'
    let tokens: number | null = null
    try {
      const body = JSON.parse(text) as Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
      let reply = ''
      if (def.kind === 'gemini') {
        reply = ((body.candidates?.[0]?.content?.parts ?? []) as { text?: string; thought?: boolean }[]).filter((p) => !p.thought).map((p) => p.text ?? '').join('')
        tokens = num(String(body.usageMetadata?.totalTokenCount ?? ''))
      } else {
        reply = String(body.choices?.[0]?.message?.content ?? '')
        tokens = num(String(body.usage?.total_tokens ?? ''))
      }
      JSON.parse(reply)
      json = 'yes'
    } catch {
      /* not JSON */
    }
    return { id, status: res.status, ms, tokens, json, limits }
  } catch (err) {
    const aborted = err instanceof Error && err.name === 'AbortError'
    return { id, status: aborted ? 'timeout' : 'network', ms: Date.now() - t0, tokens: null, json: '-', note: aborted ? `no reply within ${timeoutMs / 1000}s` : 'could not reach the provider' }
  } finally {
    clearTimeout(timer)
  }
}

export function formatProbeTable(rows: ProbeRow[], listed: Record<string, string[] | null>): string {
  const lines = [`${'provider/model'.padEnd(40)}${'HTTP'.padEnd(9)}${'latency'.padEnd(10)}${'tokens'.padEnd(8)}${'JSON'.padEnd(6)}details`]
  for (const r of rows) {
    const { provider, model } = parseId(r.id)
    const seen = listed[provider]
    const details = [r.limits, r.quota, r.note, seen && !seen.includes(model) ? 'not in the provider model list' : ''].filter(Boolean).join(' | ')
    lines.push(`${r.id.padEnd(40)}${String(r.status).padEnd(9)}${`${r.ms} ms`.padEnd(10)}${String(r.tokens ?? '-').padEnd(8)}${r.json.padEnd(6)}${details}`)
  }
  return lines.join('\n')
}

/** Lists models per enabled provider, then probes the configured models sequentially. Returns the printable report. */
export async function runProbe(
  env: Env = process.env,
  fetchImpl: FetchLike = fetch,
  timeoutMs = 30000,
): Promise<{ rows: ProbeRow[]; listed: Record<string, string[] | null>; report: string }> {
  const providers = enabledProviders(env)
  const listed: Record<string, string[] | null> = {}
  const headerLines: string[] = []
  for (const p of providers) {
    listed[p] = await listModels(p, env[PROVIDERS[p].keyEnv]!, fetchImpl)
    headerLines.push(listed[p] ? `${p}: ${listed[p]!.length} models listed${p === 'gemini' ? ' (generateContent only)' : ''}` : `${p}: could not list models (the list request failed)`)
  }
  const rows: ProbeRow[] = []
  for (const id of configuredModels(env)) rows.push(await probeModel(id, env[PROVIDERS[parseId(id).provider].keyEnv]!, fetchImpl, timeoutMs))
  const disabled = Object.keys(PROVIDERS).filter((p) => !providers.includes(p))
  const report = `${headerLines.join('\n') || 'No provider key is set.'}${disabled.length ? `\n(not enabled, no key: ${disabled.join(', ')})` : ''}\n\n${formatProbeTable(rows, listed)}`
  return { rows, listed, report }
}

async function main() {
  if (enabledProviders().length === 0) {
    console.error('Set at least one of GEMINI_API_KEY, GROQ_API_KEY, MISTRAL_API_KEY, OPENROUTER_API_KEY in the environment (keys are never printed).')
    process.exit(2)
  }
  const models = configuredModels()
  console.log(`Probing ${models.length} configured model(s), one tiny request each, one at a time: ${models.join(', ')}\n`)
  const { report } = await runProbe()
  console.log(report)
}

if (process.argv[1] && /probe-llm-models\.[tj]s$/.test(process.argv[1].replace(/\\/g, '/'))) {
  main().catch((e) => {
    console.error('Probe failed:', e instanceof Error ? e.message : e)
    process.exit(1)
  })
}
