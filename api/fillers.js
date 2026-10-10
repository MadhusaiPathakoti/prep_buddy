// Vercel serverless function (Node runtime). Generates "Single Filler" practice questions —
// a sentence with one blank and 3 candidate words, where the test-taker must judge which
// subset of the 3 genuinely fits. The fixed-template answer-option logic lives client-side in
// src/lib/fillers.ts. Reuses the same GEMINI_API_KEY as api/lookup.js and api/phraseRearrangement.js.

const GENRE_INSTRUCTIONS = {
  editorial:
    'a formal editorial/opinion-style sentence on education, personal growth, technology, the environment, or public policy (avoid politically divisive or controversial claims)',
  news: 'a news or current-affairs style sentence about a government scheme, policy update, institution, or public announcement (illustrative and plausible, not claimed as a real-time-verified fact)',
  generalKnowledge: 'a general-knowledge sentence (geography, history, economics, records, firsts, or culture)',
  scienceNature: 'a science or nature sentence (physics, biology, chemistry, geology, astronomy, or the human body)',
  biography: 'a biographical sentence about a well-known historical or contemporary figure and one of their achievements',
  fiction: 'a short narrative or descriptive sentence, as if drawn from a short story or novel (no need to name a book or author)',
  poetry: 'a single vivid, lightly figurative descriptive sentence in a poetic, literary register, but still one complete grammatical sentence',
}

const GENRES = Object.keys(GENRE_INSTRUCTIONS)

function buildPrompt(genre, difficulty, count) {
  const lengthHint =
    difficulty === 'hard'
      ? '20 to 32 words, using sophisticated vocabulary and testing fine distinctions between near-synonyms or commonly confused words/collocations'
      : '12 to 22 words, using everyday-to-moderate vocabulary for a competitive-exam aspirant at intermediate level'

  return `You write English "Single Filler" practice questions for Indian competitive bank/government exams (like SBI PO/IBPS): a sentence has exactly one blank, and three candidate words/phrases are given — the test-taker must judge which of the three actually fit the blank, both grammatically and contextually (zero, one, two, or all three can be correct).

Generate exactly ${count} DIFFERENT standalone questions. Each sentence must be ${GENRE_INSTRUCTIONS[genre]}.
Each sentence must be ${lengthHint}, grammatically complete apart from the blank, and in formal written English. Avoid graphic violence, sexual content, or other distressing subject matter.

For each question:
- Write the sentence with the blank marked as exactly five underscores "_____", appearing exactly once.
- Give exactly 3 candidate words or short phrases that could plausibly go in the blank.
- Judge which of the 3 are genuinely correct (grammatically AND contextually/idiomatically correct in that exact sentence) — this can be 0, 1, 2, or all 3. Vary this across the ${count} questions, weighted mostly toward exactly 1 or exactly 2 correct, with a couple where all 3 work.
- In most questions, at least one candidate should be a close, plausible-looking distractor (a near-synonym, a similar-sounding word, or a word with the wrong connotation/collocation) that does NOT actually fit, so the puzzle is genuinely challenging rather than obvious.

Respond with ONLY a JSON object (no markdown fences, no extra commentary) in exactly this shape:
{"questions": [{"topic": "a 2-4 word topic label", "sentence": "The sentence with _____ in it.", "options": ["word1", "word2", "word3"], "correctIndices": [0]}]}
"correctIndices" holds the 0-based indices (into "options") of every candidate that is genuinely correct — an empty array if none of the three fit.
The "questions" array must have exactly ${count} items, each "options" array must have exactly 3 distinct non-empty strings, and no two questions should reuse the same sentence or topic.`
}

// Without an explicit override, race both models at once (see api/lookup.js for why) rather
// than falling back sequentially after a failure/timeout.
const MODEL_CANDIDATES = process.env.GEMINI_MODEL ? [process.env.GEMINI_MODEL] : ['gemini-3.5-flash', 'gemini-3.5-flash-lite']

// Mirrors api/phraseRearrangement.js's reasoning: each request must land well inside Vercel's
// default serverless function limit, and the client (src/lib/fillersApi.ts) compensates for a
// large question count with several small, concurrency-capped batches rather than one slow call.
const GEMINI_TIMEOUT_MS = 7000

/** Calls one Gemini model. Returns {ok:true, questions} on a usable batch, or {ok:false, ...} otherwise. */
async function callGeminiModel(model, apiKey, prompt, count) {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS)

  let geminiRes
  try {
    geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
    const detail = await geminiRes.text().catch(() => '')
    return { ok: false, status: 502, error: `Gemini request failed (${geminiRes.status}).`, detail: detail.slice(0, 500) }
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

  const raw = Array.isArray(parsed.questions) ? parsed.questions : []
  const questions = raw
    .filter((q) => {
      if (!q || typeof q.topic !== 'string' || typeof q.sentence !== 'string') return false
      if ((q.sentence.match(/_+/g) || []).length !== 1) return false
      if (!Array.isArray(q.options) || q.options.length !== 3) return false
      if (!q.options.every((o) => typeof o === 'string' && o.trim().length > 0)) return false
      if (!Array.isArray(q.correctIndices)) return false
      if (!q.correctIndices.every((i) => Number.isInteger(i) && i >= 0 && i <= 2)) return false
      return true
    })
    .slice(0, count)
    .map((q) => ({
      topic: q.topic.slice(0, 60),
      sentence: q.sentence.trim().slice(0, 400),
      options: q.options.map((o) => o.trim().slice(0, 60)),
      correctIndices: [...new Set(q.correctIndices)].sort(),
    }))

  if (questions.length === 0) return { ok: false, status: 502, error: 'Gemini returned no usable questions.' }

  return { ok: true, questions }
}

/** Resolves as soon as any promise settles with {ok:true}; only resolves with a failure once every one of them has failed. */
function firstSuccessful(promises) {
  return new Promise((resolve) => {
    let remaining = promises.length
    let lastFailure
    for (const p of promises) {
      p.then((outcome) => {
        if (outcome.ok) {
          resolve(outcome)
          return
        }
        lastFailure = outcome
        remaining -= 1
        if (remaining === 0) resolve(lastFailure)
      })
    }
  })
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  const genre = typeof req.query.genre === 'string' ? req.query.genre : ''
  if (!GENRES.includes(genre)) {
    res.status(400).json({ error: `"genre" must be one of: ${GENRES.join(', ')}` })
    return
  }
  const difficulty = req.query.difficulty === 'hard' ? 'hard' : 'medium'
  const count = Math.min(Math.max(parseInt(req.query.count, 10) || 1, 1), 6)

  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    res.status(500).json({ error: 'GEMINI_API_KEY is not configured on the server.' })
    return
  }

  const prompt = buildPrompt(genre, difficulty, count)
  const outcome = await firstSuccessful(MODEL_CANDIDATES.map((model) => callGeminiModel(model, apiKey, prompt, count)))

  if (!outcome.ok) {
    const { status, error, detail } = outcome
    res.status(status).json(detail ? { error, detail } : { error })
    return
  }

  res.status(200).json({ questions: outcome.questions })
}
