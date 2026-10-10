// Vercel serverless function (Node runtime). Generates "Error Detection" practice questions —
// a sentence split into 4 parts (a)-(d), at most one of which has a grammatical error, plus a
// student-facing explanation of the grammar rule involved. Reuses the same GEMINI_API_KEY as
// api/lookup.js, api/phraseRearrangement.js and api/fillers.js.

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
      ? '30 to 45 words total, using sophisticated vocabulary and sentence structures (subordinate clauses, participial phrases, passive voice)'
      : '20 to 32 words total, moderately complex, for a competitive-exam aspirant at intermediate level'

  return `You write English "Error Detection" practice questions for Indian competitive bank/government exams (like SBI PO/IBPS): a sentence is split into 4 consecutive parts (a)-(d), and at most one part contains a grammatical error — the test-taker must identify which part (or recognize there is no error).

Generate exactly ${count} DIFFERENT standalone questions. Each sentence must be ${GENRE_INSTRUCTIONS[genre]}.
Each sentence must be ${lengthHint}, split into exactly 4 parts that concatenate, in order with a single space between them, into one complete, coherent sentence.

For roughly 4 out of 5 questions, introduce EXACTLY ONE genuine grammatical error into one of the 4 parts — for example: subject-verb agreement, incorrect tense or verb form, wrong preposition, pronoun-antecedent disagreement (their/there/they're, its/it's), article errors (a/an/the), faulty parallelism, incorrect comparative/superlative, a misused apostrophe, or a singular/plural mismatch (e.g. "thousand of" instead of "thousands of", "all walk of life" instead of "all walks of life"). Keep the other 3 parts completely correct. For the remaining questions, make all 4 parts fully correct with no error at all.
Vary which of the 4 parts (a, b, c, or d) holds the error across the question set, and vary the error type — don't repeat the same error type or position too often.

For each question, also write a short, clear explanation (2-3 sentences) a student can learn from: name the specific grammar rule that was broken, quote the exact erroneous phrase, and give the corrected phrase. If there is no error, instead briefly confirm why the sentence is grammatically sound.

Respond with ONLY a JSON object (no markdown fences, no extra commentary) in exactly this shape:
{"questions": [{"topic": "a 2-4 word topic label", "parts": ["part a text", "part b text", "part c text", "part d text"], "errorPartIndex": 0, "explanation": "..."}]}
"errorPartIndex" is the 0-based index (0=a, 1=b, 2=c, 3=d) of the part containing the error, or null if the sentence has no error.
The "questions" array must have exactly ${count} items, each "parts" array must have exactly 4 non-empty strings, and no two questions should reuse the same sentence or topic.`
}

// Without an explicit override, race both models at once (see api/lookup.js for why) rather
// than falling back sequentially after a failure/timeout.
const MODEL_CANDIDATES = process.env.GEMINI_MODEL ? [process.env.GEMINI_MODEL] : ['gemini-3.5-flash', 'gemini-3.5-flash-lite']

// Mirrors api/phraseRearrangement.js and api/fillers.js's reasoning: each request must land
// well inside Vercel's default serverless function limit, and the client
// (src/lib/errorDetectionApi.ts) compensates for a large question count with several small,
// concurrency-capped batches rather than one slow call.
const GEMINI_TIMEOUT_MS = 7500

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
      if (!q || typeof q.topic !== 'string' || typeof q.explanation !== 'string' || q.explanation.trim() === '') return false
      if (!Array.isArray(q.parts) || q.parts.length !== 4) return false
      if (!q.parts.every((p) => typeof p === 'string' && p.trim().length > 0)) return false
      const idx = q.errorPartIndex
      if (idx !== null && !(Number.isInteger(idx) && idx >= 0 && idx <= 3)) return false
      return true
    })
    .slice(0, count)
    .map((q) => ({
      topic: q.topic.slice(0, 60),
      parts: q.parts.map((p) => p.trim().slice(0, 200)),
      errorPartIndex: q.errorPartIndex === null ? null : q.errorPartIndex,
      explanation: q.explanation.trim().slice(0, 600),
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
