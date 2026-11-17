// Shared Gemini helpers for the serverless functions (the leading underscore keeps this file from becoming a route).

/**
 * Calls one Gemini model and returns {ok:true, result} when `extract(parsedJson)` yields something usable, otherwise
 * {ok:false, status, error}. Upstream error text is logged on the server and never returned to the browser.
 * `thinkingBudget: 0` switches the model's hidden "thinking" off — much faster for plain transcription.
 */
export async function callGeminiJson(model, apiKey, prompt, { extract, timeoutMs = 9000, temperature = 1, seed, parentSignal, images = [], thinkingBudget }) {
  const controller = new AbortController()
  parentSignal?.addEventListener('abort', () => controller.abort(), { once: true })
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

  const send = (withThinking) =>
    fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        // `images` is optional: [{ mimeType, data(base64) }] placed before the text so the model reads the picture first
        contents: [{ parts: [...images.map((img) => ({ inlineData: { mimeType: img.mimeType, data: img.data } })), { text: prompt }] }],
        generationConfig: { responseMimeType: 'application/json', temperature, topP: 0.95, ...(Number.isInteger(seed) ? { seed } : {}), ...(withThinking ? { thinkingConfig: { thinkingBudget } } : {}) },
      }),
      signal: controller.signal,
    })

  let res
  try {
    const wantsThinkingOff = Number.isInteger(thinkingBudget)
    res = await send(wantsThinkingOff)
    // some models (e.g. the "lite" ones) reject a thinking setting: ask again without it
    if (res.status === 400 && wantsThinkingOff) res = await send(false)
  } catch (err) {
    const timedOut = err && err.name === 'AbortError'
    return { ok: false, status: 504, error: timedOut ? 'Gemini took too long to respond.' : 'Could not reach Gemini.' }
  } finally {
    clearTimeout(timeoutId)
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    console.error(`[gemini] ${model} responded ${res.status}: ${detail.slice(0, 300)}`)
    return { ok: false, status: 502, error: `Gemini request failed (${res.status}).` }
  }

  const data = await res.json().catch(() => null)
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text
  if (!text) return { ok: false, status: 502, error: 'Gemini returned no content.' }

  let parsed
  try {
    parsed = JSON.parse(text)
  } catch {
    return { ok: false, status: 502, error: 'Gemini returned malformed JSON.' }
  }

  const result = extract(parsed)
  if (!result) return { ok: false, status: 502, error: 'Gemini returned no usable content.' }
  return { ok: true, result }
}

/**
 * Starts the first model; starts the next only if the first has not answered within `hedgeMs` or has already failed.
 * Resolves with the first usable answer (cancelling anything still running), or, once every model has failed, the last failure.
 */
export function firstSuccessful(starters, hedgeMs = 3500) {
  return new Promise((resolve) => {
    const race = new AbortController()
    let started = 0
    let failed = 0
    let done = false
    let lastFailure
    let timer
    const startNext = () => {
      if (done || started >= starters.length) return
      clearTimeout(timer)
      const run = starters[started++](race.signal)
      if (started < starters.length) timer = setTimeout(startNext, hedgeMs)
      run.then((outcome) => {
        if (done) return
        if (outcome.ok) {
          done = true
          clearTimeout(timer)
          race.abort()
          resolve(outcome)
          return
        }
        lastFailure = outcome
        failed += 1
        if (failed === starters.length) {
          done = true
          clearTimeout(timer)
          resolve(lastFailure)
        } else {
          startNext()
        }
      })
    }
    startNext()
  })
}
