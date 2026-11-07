// Vercel serverless function (Node runtime). Generates "Cloze Test" passages — one coherent
// paragraph with several numbered blanks, each blank having 5 candidate words where exactly
// one fits grammatically and contextually. Unlike api/fillers.js or api/errorDetection.js,
// each call returns ONE passage (the blanks share a paragraph, so they can't be split into
// independent items) — the client (src/lib/clozeTestApi.ts) requests as many passages as needed
// to cover the chosen question count. Reuses the same GEMINI_API_KEY as the other English games.

import { rateLimit } from './_lib/guard.js'

const GENRE_INSTRUCTIONS = {
  editorial:
    'a formal editorial/opinion-style passage on education, personal growth, technology, the environment, or public policy (avoid politically divisive or controversial claims)',
  news: 'a news or current-affairs style passage about a government scheme, policy update, institution, or public announcement (illustrative and plausible, not claimed as a real-time-verified fact)',
  generalKnowledge: 'a general-knowledge passage (geography, history, economics, records, firsts, or culture)',
  scienceNature: 'a science or nature passage (physics, biology, chemistry, geology, astronomy, or the human body)',
  biography: 'a biographical passage about a well-known historical or contemporary figure and their achievements',
  fiction: 'a short narrative or descriptive passage, as if drawn from a short story or novel (no need to name a book or author)',
  poetry: 'a vivid, lightly figurative descriptive passage in a poetic, literary register, but still complete grammatical prose',
}

const GENRES = Object.keys(GENRE_INSTRUCTIONS)

// Hard passages are both longer and carry one extra blank, mirroring how the source material's
// denser literary sets ran to 7 blanks against the more expository sets' 6.
const BLANK_COUNT_BY_DIFFICULTY = { medium: 6, hard: 7 }

function buildPrompt(genre, difficulty) {
  const blankCount = BLANK_COUNT_BY_DIFFICULTY[difficulty]
  const lengthHint =
    difficulty === 'hard'
      ? 'roughly 200 to 260 words, in a literary/analytical register with varied sentence structures'
      : 'roughly 150 to 190 words, in a clear expository register for an intermediate-level competitive-exam aspirant'

  return `You write English "Cloze Test" practice passages for Indian competitive bank/government exams (like SBI PO/IBPS): one coherent paragraph with several blanks, each blank having 5 candidate words where exactly one fits both grammatically and contextually.

Generate ONE paragraph that is ${GENRE_INSTRUCTIONS[genre]}. The paragraph must be ${lengthHint} and contain EXACTLY ${blankCount} blanks, marked inline as {{1}}, {{2}}, ... {{${blankCount}}} in strict reading order (never skip or repeat a number, never put two markers back to back).

For each blank, give exactly 5 candidate words or short phrases — one genuinely correct in that exact context, and four plausible-looking distractors (near-synonyms, wrong connotation, wrong part of speech, or words that almost fit but subtly clash with the sentence's logic or tone). Also write a short explanation (1-2 sentences) naming why the correct word fits and briefly why the strongest distractor does not.

Respond with ONLY a JSON object (no markdown fences, no extra commentary) in exactly this shape:
{"topic": "a 2-4 word topic label", "paragraph": "Full paragraph text with {{1}}, {{2}}, etc. inline.", "blanks": [{"options": ["w1","w2","w3","w4","w5"], "correctIndex": 0, "explanation": "..."}]}
"blanks" must have exactly ${blankCount} items in order, each "options" array must have exactly 5 distinct non-empty strings, and "correctIndex" is the 0-based index of the one correct option.`
}

// Without an explicit override, race both models at once (see api/lookup.js for why) rather
// than falling back sequentially after a failure/timeout.
const MODEL_CANDIDATES = process.env.GEMINI_MODEL ? [process.env.GEMINI_MODEL] : ['gemini-3.5-flash', 'gemini-3.5-flash-lite']

// A full passage with 6-7 structured, explained blanks is a heavier generation task than the
// other English games' independent short sentences, so this gets a longer budget — still well
// inside Vercel's default serverless function limit.
const GEMINI_TIMEOUT_MS = 8500

function parseAndValidate(text, expectedBlankCount) {
  let parsed
  try {
    parsed = JSON.parse(text)
  } catch {
    return null
  }

  if (typeof parsed.topic !== 'string' || parsed.topic.trim() === '') return null
  if (typeof parsed.paragraph !== 'string' || parsed.paragraph.trim() === '') return null
  if (!Array.isArray(parsed.blanks) || parsed.blanks.length !== expectedBlankCount) return null

  const markers = [...parsed.paragraph.matchAll(/\{\{(\d+)\}\}/g)].map((m) => parseInt(m[1], 10))
  if (markers.length !== expectedBlankCount) return null
  for (let i = 0; i < markers.length; i++) {
    if (markers[i] !== i + 1) return null
  }

  for (const b of parsed.blanks) {
    if (!b || !Array.isArray(b.options) || b.options.length !== 5) return null
    if (!b.options.every((o) => typeof o === 'string' && o.trim().length > 0)) return null
    if (!Number.isInteger(b.correctIndex) || b.correctIndex < 0 || b.correctIndex > 4) return null
    if (typeof b.explanation !== 'string' || b.explanation.trim() === '') return null
  }

  return {
    topic: parsed.topic.trim().slice(0, 60),
    paragraph: parsed.paragraph.trim().slice(0, 2500),
    blanks: parsed.blanks.map((b) => ({
      options: b.options.map((o) => o.trim().slice(0, 60)),
      correctIndex: b.correctIndex,
      explanation: b.explanation.trim().slice(0, 400),
    })),
  }
}

/** Calls one Gemini model. Returns {ok:true, passage} on a usable passage, or {ok:false, ...} otherwise. */
async function callGeminiModel(model, apiKey, prompt, blankCount, parentSignal) {
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
        generationConfig: { responseMimeType: 'application/json', temperature: 0.9 },
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

  const passage = parseAndValidate(text, blankCount)
  if (!passage) return { ok: false, status: 502, error: 'Gemini returned a malformed or inconsistent passage.' }

  return { ok: true, passage }
}

/** Starts the first model; starts the next one only if the first has not answered within `hedgeMs` or has already failed. Resolves with the first usable answer (and cancels any request still running) — or, only once every model has failed, with the last failure. This keeps the speed of racing two models without paying for two calls every time. */
function firstSuccessful(starters, hedgeMs = 3000) {
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
  if (!(await rateLimit(req, res, { name: 'clozeTest', limit: 20 }))) return

  const genre = typeof req.query.genre === 'string' ? req.query.genre : ''
  if (!GENRES.includes(genre)) {
    res.status(400).json({ error: `"genre" must be one of: ${GENRES.join(', ')}` })
    return
  }
  const difficulty = req.query.difficulty === 'hard' ? 'hard' : 'medium'
  const blankCount = BLANK_COUNT_BY_DIFFICULTY[difficulty]

  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    res.status(500).json({ error: 'This feature is not available right now.' })
    return
  }

  const prompt = buildPrompt(genre, difficulty)
  const outcome = await firstSuccessful(MODEL_CANDIDATES.map((model) => (signal) => callGeminiModel(model, apiKey, prompt, blankCount, signal)))

  if (!outcome.ok) {
    const { status, error } = outcome
    res.status(status).json({ error })
    return
  }

  res.setHeader('Cache-Control', 'no-store')
  res.status(200).json({ passage: outcome.passage })
}
