// Vercel serverless function (Node runtime). Keeps the Gemini API key server-side —
// it must never be shipped to the browser, unlike the public Firebase config.
//
// Set GEMINI_API_KEY in the Vercel project's Environment Variables (Settings -> Environment
// Variables), then redeploy. Get a free key at https://aistudio.google.com/apikey.
// By default this tries gemini-3.5-flash, then falls back to gemini-3.5-flash-lite if that
// fails. Set GEMINI_MODEL to pin a single specific model instead (skips the fallback).

import { rateLimit } from './_lib/guard.js'

function parseList(raw) {
  if (typeof raw !== 'string' || raw.trim() === '') return null
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 20)
}

function buildPrompt(term, candidateSynonyms, candidateAntonyms) {
  const base = `You are a dictionary for a competitive-exam English study app. Define the English word, idiom, or phrase: "${term}".
If this is a naturally inflected or personalized form of a known idiom or phrasal verb — a pronoun swapped (e.g. "one's" -> "his", "her", "my", "their"), or the verb conjugated for tense/number (e.g. "cash in one's chips" -> "cashed in his chips" or "cashes in her chips") — recognize it as that idiom and define its established idiomatic meaning; don't treat it as unrecognized just because it isn't the exact dictionary headword.`

  if (!candidateSynonyms && !candidateAntonyms) {
    return `${base}
Respond with ONLY a JSON object (no markdown fences, no extra text) in exactly this shape:
{"meaning": "a single clear one-sentence definition", "example": "one natural sentence that uses the exact phrase \\"${term}\\"", "partOfSpeech": "noun, verb, adjective, or adverb - or an empty string if it's an idiom or multi-word phrase with no single part of speech"}
Respond with {"error": "not found"} only if "${term}" (or the base idiom it's a natural variant of) genuinely isn't a real, recognizable English word, idiom, or phrase.`
  }

  // List-validation mode: also check a user-proposed synonym/antonym list, since a person
  // typing free-form words can put a word in the wrong list, misspell it, or list something
  // that's neither (e.g. "increase" as both a synonym and antonym of "abate").
  return `${base}
A user proposed these as synonyms of "${term}": ${JSON.stringify(candidateSynonyms ?? [])}
A user proposed these as antonyms of "${term}": ${JSON.stringify(candidateAntonyms ?? [])}

Review both lists carefully:
- Remove any word that is not actually a real synonym/antonym of "${term}" (including a word listed under the wrong one, e.g. an antonym mistakenly listed as a synonym).
- Fix obvious misspellings (e.g. "Dimish" -> "Diminish") rather than dropping them.
- Remove exact duplicates within a list.
- If a corrected list ends up with fewer than 2 words, add 1-2 more well-known, clearly correct synonyms/antonyms so each list has a reasonable set — but never invent one if none genuinely exist.
- For every word you removed or changed, add one short plain-English note explaining why (e.g. "Removed 'Increase' from synonyms — it's actually an antonym of abate").

Respond with ONLY a JSON object (no markdown fences, no extra text) in exactly this shape:
{"meaning": "a single clear one-sentence definition", "example": "one natural sentence that uses the exact word \\"${term}\\"", "partOfSpeech": "noun, verb, adjective, or adverb", "synonyms": ["corrected synonym list"], "antonyms": ["corrected antonym list"], "corrections": ["short notes about what changed, empty array if nothing changed"]}
If "${term}" is not a real, recognizable English word, respond with exactly: {"error": "not found"}`
}

// Without an explicit override, ask the fuller "flash" model and the lite tier (the one this
// app has already confirmed works) AT THE SAME TIME rather than one after the other — a
// sequential retry after the first one fails or times out was exactly what pushed a single
// lookup past 12 seconds. Racing them means the total cost is whichever one answers first,
// not the sum of both. A lone "not found" verdict from one doesn't end the race by itself,
// since that's a real chance THAT model was simply wrong about it — only if every candidate
// comes back empty-handed does the whole lookup fail.
const MODEL_CANDIDATES = process.env.GEMINI_MODEL ? [process.env.GEMINI_MODEL] : ['gemini-3.5-flash', 'gemini-3.5-flash-lite']

// Without a timeout, a slow/stuck Gemini response has nothing to cut it off — the request
// would just ride all the way up to Vercel's own platform-level function limit (up to 60s),
// which is what a "taking way too long" report usually turns out to be. Kept tight since the
// whole add-a-word flow (this call, then a Firestore write) needs to land well under 5s.
const GEMINI_TIMEOUT_MS = 4000

/** Calls one Gemini model. Returns {ok:true, parsed} on a usable answer, or {ok:false, ...} for any failure — including a "not found" verdict, which is also worth retrying on a different model. */
async function callGeminiModel(model, apiKey, prompt, parentSignal) {
  const controller = new AbortController()
  parentSignal?.addEventListener('abort', () => controller.abort(), { once: true })
  const timeoutId = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS)

  let geminiRes
  try {
    geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: 'application/json', temperature: 0.2 },
      }),
      signal: controller.signal,
    })
  } catch (err) {
    const timedOut = err && err.name === 'AbortError'
    return { ok: false, status: 504, error: timedOut ? 'Gemini took too long to respond.' : 'Could not reach Gemini.' }
  } finally {
    clearTimeout(timeoutId)
  }

  if (!geminiRes.ok) {
    // upstream detail stays in the server log; the browser only gets a generic message
    const detail = await geminiRes.text().catch(() => '')
    console.error(`[gemini] ${model} responded ${geminiRes.status}: ${detail.slice(0, 300)}`)
    return { ok: false, status: 502, error: `Gemini request failed (${geminiRes.status}).` }
  }

  const data = await geminiRes.json()
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text
  if (!text) return { ok: false, status: 502, error: 'Gemini returned no content.' }

  let parsed
  try {
    parsed = JSON.parse(text)
  } catch {
    return { ok: false, status: 502, error: 'Gemini returned malformed JSON.' }
  }

  if (parsed.error || typeof parsed.meaning !== 'string' || typeof parsed.example !== 'string' || !parsed.meaning || !parsed.example) {
    return { ok: false, status: 404, error: 'not found' }
  }

  return { ok: true, parsed }
}

/** Starts the first model; starts the next one only if the first has not answered within `hedgeMs` or has already failed. Resolves with the first usable answer (and cancels any request still running) — or, only once every model has failed, with the last failure. This keeps the speed of racing two models without paying for two calls every time. */
function firstSuccessful(starters, hedgeMs = 1800) {
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

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }
  if (!(await rateLimit(req, res, { name: 'lookup', limit: 30 }))) return

  const term = typeof req.query.term === 'string' ? req.query.term.trim() : ''
  if (!term || term.length > 200) {
    res.status(400).json({ error: 'Missing or invalid "term" query parameter.' })
    return
  }
  const candidateSynonyms = parseList(req.query.synonyms)
  const candidateAntonyms = parseList(req.query.antonyms)
  const listMode = candidateSynonyms !== null || candidateAntonyms !== null

  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    res.status(500).json({ error: 'This feature is not available right now.' })
    return
  }

  const prompt = buildPrompt(term, candidateSynonyms, candidateAntonyms)

  const outcome = await firstSuccessful(MODEL_CANDIDATES.map((model) => (signal) => callGeminiModel(model, apiKey, prompt, signal)))

  if (!outcome.ok) {
    const { status, error } = outcome
    res.status(status).json({ error })
    return
  }

  const { parsed } = outcome
  const result = {
    meaning: parsed.meaning.slice(0, 500),
    example: parsed.example.slice(0, 500),
    partOfSpeech: typeof parsed.partOfSpeech === 'string' ? parsed.partOfSpeech.slice(0, 30) : '',
  }

  if (listMode) {
    result.synonyms = Array.isArray(parsed.synonyms) ? parsed.synonyms.filter((s) => typeof s === 'string').slice(0, 20) : []
    result.antonyms = Array.isArray(parsed.antonyms) ? parsed.antonyms.filter((s) => typeof s === 'string').slice(0, 20) : []
    result.corrections = Array.isArray(parsed.corrections) ? parsed.corrections.filter((s) => typeof s === 'string').slice(0, 10) : []
  }

  res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=604800')
  res.status(200).json(result)
}
