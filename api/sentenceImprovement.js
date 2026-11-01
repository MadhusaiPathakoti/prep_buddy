// Vercel serverless function (Node runtime). Generates "Sentence Improvement" practice
// questions: a sentence with one underlined part, four candidate replacements for that part, and
// a verdict on which one (if any) makes the sentence correct — plus a grammar explanation. The
// fixed "No correction required" option and the shuffling happen client-side
// (src/lib/sentenceImprovement.ts). Reuses the same GEMINI_API_KEY as the other English games.

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
      ? '22 to 35 words, with finer points of grammar and idiom (tense sequence, conditionals and the subjunctive, parallelism, dependent prepositions, comparatives, word order, subject-verb agreement across a long subject)'
      : '15 to 25 words, testing common grammar points (tense, agreement, prepositions, articles, pronoun reference, comparatives)'

  return `You write English "Sentence Improvement" practice questions for Indian competitive bank/government exams (like SBI PO/IBPS): one part of a sentence is underlined, and the test-taker must choose the replacement that makes the sentence grammatically correct, or "No correction required" if it is already correct.

Generate exactly ${count} DIFFERENT standalone questions. Each sentence must be ${GENRE_INSTRUCTIONS[genre]}, ${lengthHint}.
Avoid graphic violence, sexual content, or other distressing subject matter.

Each question is split into three pieces that join back into one full sentence:
- "before": the words before the underlined part (may be empty if the sentence starts with it),
- "target": the underlined part, a phrase of roughly 2 to 8 words,
- "after": the words after the underlined part, including the sentence's closing punctuation.

Then give EXACTLY 4 replacement options for the target.

For roughly 4 out of 5 questions, the original target contains a genuine error. Then EXACTLY ONE of the 4 options must make the whole sentence correct, and the other 3 must each leave the sentence wrong or clearly worse (a different error, wrong idiom, wrong tense, awkward or ungrammatical) — never two options that are both acceptable. The original target must NOT appear among the options.
For the remaining questions, the original target is already correct. Then ALL 4 options must make the sentence wrong or clearly worse, and "correctIndex" is null.

Vary the error types and vary which option is the right one.

For each question also write a short explanation (2-3 sentences): name the grammar rule involved, say what is wrong with the original (or why it is already correct), and why the right option fits (or why the options fail).

Respond with ONLY a JSON object (no markdown fences, no extra commentary) in exactly this shape:
{"questions": [{"topic": "a 2-4 word topic label", "before": "words before ", "target": "the underlined part", "after": " words after.", "options": ["option 1", "option 2", "option 3", "option 4"], "correctIndex": 0, "explanation": "..."}]}
"correctIndex" is the 0-based index (0-3) of the one correct replacement, or null if the original is already correct.
The "questions" array must have exactly ${count} items, each "options" array must have exactly 4 distinct non-empty strings, and no two questions should reuse the same sentence or topic.`
}

// Without an explicit override, race both models at once (see api/lookup.js for why) rather
// than falling back sequentially after a failure/timeout.
const MODEL_CANDIDATES = process.env.GEMINI_MODEL ? [process.env.GEMINI_MODEL] : ['gemini-3.5-flash', 'gemini-3.5-flash-lite']

// Mirrors the other English games: each request must land well inside Vercel's default function
// limit, and the client (src/lib/sentenceImprovementApi.ts) splits a big question count into
// small, concurrency-capped batches rather than one slow call.
const GEMINI_TIMEOUT_MS = 7500

const norm = (s) => s.trim().toLowerCase().replace(/\s+/g, ' ')

function isValidQuestion(q) {
  if (!q || typeof q.topic !== 'string' || q.topic.trim() === '') return false
  if (typeof q.before !== 'string' || typeof q.after !== 'string') return false
  if (typeof q.target !== 'string' || q.target.trim() === '') return false
  if (typeof q.explanation !== 'string' || q.explanation.trim() === '') return false
  if (!Array.isArray(q.options) || q.options.length !== 4) return false
  if (!q.options.every((o) => typeof o === 'string' && o.trim().length > 0)) return false
  const normalized = q.options.map(norm)
  // Duplicate options, or an option identical to the original, would make the answer ambiguous.
  if (new Set(normalized).size !== 4) return false
  if (normalized.includes(norm(q.target))) return false
  if (q.correctIndex !== null && !(Number.isInteger(q.correctIndex) && q.correctIndex >= 0 && q.correctIndex <= 3)) return false
  return true
}

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
    .filter(isValidQuestion)
    .slice(0, count)
    .map((q) => ({
      topic: q.topic.trim().slice(0, 60),
      // Spacing around the underlined part is meaningful, so before/after are not trimmed here.
      before: q.before.slice(0, 300),
      target: q.target.trim().slice(0, 120),
      after: q.after.slice(0, 300),
      options: q.options.map((o) => o.trim().slice(0, 120)),
      correctIndex: q.correctIndex,
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
