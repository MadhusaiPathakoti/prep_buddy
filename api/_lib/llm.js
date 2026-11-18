// A small client for the free AI providers the question bank uses (Groq, Gemini, Mistral), all asked for a single JSON object.
// Model ids are written "provider/model", e.g. "groq/openai/gpt-oss-120b" or "gemini/gemini-3-flash-preview".
// A provider is used only when its API key is set on the server. Upstream error text is never returned to browsers.

const PROVIDERS = {
  groq: { keyEnv: 'GROQ_API_KEY', base: 'https://api.groq.com/openai/v1' },
  mistral: { keyEnv: 'MISTRAL_API_KEY', base: 'https://api.mistral.ai/v1' },
  gemini: { keyEnv: 'GEMINI_API_KEY' },
}

const SYSTEM = 'You are a careful quantitative-aptitude expert. Reply with one JSON object and nothing else.'

export const providerOf = (id) => String(id).split('/')[0]
const modelOf = (id) => String(id).slice(String(id).indexOf('/') + 1)
export const isEnabled = (id) => !!PROVIDERS[providerOf(id)] && !!process.env[PROVIDERS[providerOf(id)].keyEnv]

/** Parses JSON, tolerating markdown fences or chatter around it. Returns undefined when there is no JSON object. */
export function parseJsonLoose(text) {
  const stripped = String(text ?? '').replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  try {
    return JSON.parse(stripped)
  } catch {
    const a = stripped.indexOf('{')
    const b = stripped.lastIndexOf('}')
    if (a >= 0 && b > a) {
      try {
        return JSON.parse(stripped.slice(a, b + 1))
      } catch {
        /* fall through */
      }
    }
  }
  return undefined
}

const fail = (id, cls, error) => ({ ok: false, id, cls, error })

/** Failure class for an HTTP status: quota (rate or daily limit), unavailable (bad key / model gone), overload (server trouble), bad-output. */
function classify(id, status) {
  if (status === 429 || status === 402) return fail(id, 'quota', `${providerOf(id)} limit reached.`)
  if (status === 401 || status === 403 || status === 404) return fail(id, 'unavailable', `${providerOf(id)} is not available.`)
  if (status === 400) return fail(id, 'bad-output', `${providerOf(id)} rejected the request.`)
  return fail(id, 'overload', `${providerOf(id)} is having trouble (${status}).`)
}

async function callOpenAICompat(id, prompt, { timeoutMs, maxTokens, temperature, effort }) {
  const provider = PROVIDERS[providerOf(id)]
  const model = modelOf(id)
  const reasoning = /gpt-oss/i.test(model)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    // gpt-oss models think before answering, and that thinking is paid from the same max_tokens allowance as the JSON;
    // with too little left Groq answers 400 with an empty failed_generation. Retry once with low effort and more room.
    const send = (reasoningEffort, extraTokens) =>
      fetch(`${provider.base}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env[provider.keyEnv]}` },
        body: JSON.stringify({
          model,
          messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: prompt }],
          temperature,
          response_format: { type: 'json_object' },
          max_tokens: maxTokens + extraTokens,
          ...(reasoning ? { reasoning_effort: reasoningEffort } : {}),
        }),
        signal: controller.signal,
      })
    let res
    try {
      res = await send(effort, 0)
      if (res.status === 400 && reasoning) {
        const peek = await res.clone().text().catch(() => '')
        if (/"failed_generation"\s*:\s*""/.test(peek)) res = await send('low', 1500)
      }
    } catch (err) {
      return err && err.name === 'AbortError' ? fail(id, 'timeout', `${providerOf(id)} took too long to respond.`) : fail(id, 'network', `Could not reach ${providerOf(id)}.`)
    }
    if (!res.ok) {
      console.error(`[qb-llm] ${id} responded ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}`)
      return classify(id, res.status)
    }
    const data = await res.json().catch(() => null)
    const choice = data?.choices?.[0]
    if (choice?.finish_reason === 'length') return fail(id, 'bad-output', 'The answer was cut off.')
    const parsed = parseJsonLoose(choice?.message?.content)
    return parsed && typeof parsed === 'object' ? { ok: true, id, json: parsed } : fail(id, 'bad-output', 'The answer was not JSON.')
  } finally {
    clearTimeout(timer)
  }
}

async function callGemini(id, prompt, { timeoutMs, temperature }) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    let res
    try {
      res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelOf(id))}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM }] },
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: 'application/json', temperature, maxOutputTokens: 8192 },
        }),
        signal: controller.signal,
      })
    } catch (err) {
      return err && err.name === 'AbortError' ? fail(id, 'timeout', 'gemini took too long to respond.') : fail(id, 'network', 'Could not reach gemini.')
    }
    if (!res.ok) {
      console.error(`[qb-llm] ${id} responded ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}`)
      return classify(id, res.status)
    }
    const data = await res.json().catch(() => null)
    const cand = data?.candidates?.[0]
    if (cand?.finishReason === 'MAX_TOKENS') return fail(id, 'bad-output', 'The answer was cut off.')
    const text = (cand?.content?.parts ?? []).filter((p) => p && typeof p.text === 'string' && !p.thought).map((p) => p.text).join('')
    const parsed = parseJsonLoose(text)
    return parsed && typeof parsed === 'object' ? { ok: true, id, json: parsed } : fail(id, 'bad-output', 'The answer was not JSON.')
  } finally {
    clearTimeout(timer)
  }
}

/** One call to one model. Never throws; returns {ok:true, id, json} or {ok:false, id, cls, error}. */
export function callJson(id, prompt, { timeoutMs = 30000, maxTokens = 3000, temperature = 0.1, effort = 'medium' } = {}) {
  if (!isEnabled(id)) return Promise.resolve(fail(id, 'unavailable', `${providerOf(id)} is not set up.`))
  return providerOf(id) === 'gemini' ? callGemini(id, prompt, { timeoutMs, temperature }) : callOpenAICompat(id, prompt, { timeoutMs, maxTokens, temperature, effort })
}

/**
 * Tries the models in order until one returns JSON that `accept` likes ({ok:true,...} or {ok:false,error}).
 * Stops when `deadline` (ms since 1970) is too close. Returns {ok:true, id, ...accepted} or {ok:false, failures:[{id, cls, error}]}.
 */
export async function firstValid(chain, prompt, accept, { deadline, perCallMs = 22000, ...options } = {}) {
  const failures = []
  for (const id of chain) {
    if (!isEnabled(id)) continue
    const remaining = deadline - Date.now()
    if (remaining < 4000) {
      failures.push({ id, cls: 'timeout', error: 'Out of time.' })
      break
    }
    const out = await callJson(id, prompt, { ...options, timeoutMs: Math.min(perCallMs, remaining) })
    if (!out.ok) {
      failures.push({ id, cls: out.cls, error: out.error })
      continue
    }
    const accepted = accept(out.json)
    if (accepted.ok) return { ok: true, id, ...accepted }
    failures.push({ id, cls: 'bad-output', error: accepted.error })
  }
  return { ok: false, failures }
}
