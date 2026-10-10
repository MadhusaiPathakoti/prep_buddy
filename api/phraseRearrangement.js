// Vercel serverless function (Node runtime). Generates genre-specific sentences for the
// "Phrase Rearrangement" game, each pre-split by Gemini into 5 ordered, reconstructable
// parts — the actual shuffle-into-options puzzle logic lives client-side in
// src/lib/phraseRearrangement.ts. Reuses the same GEMINI_API_KEY as api/lookup.js.

const GENRE_INSTRUCTIONS = {
  editorial:
    'a formal editorial/opinion-style statement on education, personal growth, technology, the environment, or public policy (avoid politically divisive or controversial claims)',
  news: 'a news or current-affairs style statement about a government scheme, policy update, institution, or public announcement (illustrative and plausible, not claimed as a real-time-verified fact)',
  generalKnowledge: 'a general-knowledge trivia fact (geography, history, economics, records, firsts, or culture)',
  scienceNature: 'a science or nature fact (physics, biology, chemistry, geology, astronomy, or the human body)',
  biography: 'a biographical fact about a well-known historical or contemporary figure and one of their achievements',
  fiction: 'a short narrative or descriptive sentence, as if drawn from a short story or novel (no need to name a book or author)',
  poetry:
    'a single vivid, lightly figurative descriptive sentence in a poetic, literary register (imagery-rich, but still one complete grammatical sentence, not verse with line breaks)',
}

const GENRES = Object.keys(GENRE_INSTRUCTIONS)

function buildPrompt(genre, difficulty, count) {
  const lengthHint =
    difficulty === 'hard'
      ? '35 to 50 words, containing at least two subordinate or relative clauses, for an advanced-level reader'
      : '20 to 28 words, moderately complex, for a competitive-exam aspirant at intermediate level'

  return `You write English "Phrase Rearrangement" practice questions for Indian competitive bank/government exams (like SBI PO/IBPS), where a sentence is split into 5 jumbled parts that the test-taker must reorder.

Generate exactly ${count} DIFFERENT standalone sentences. Each must be ${GENRE_INSTRUCTIONS[genre]}.
Each sentence must be ${lengthHint}, factually plausible, grammatically complete, and in formal written English.

For each sentence, split it into exactly 5 ordered parts/clauses (in correct reading order) such that:
- Concatenating the 5 parts with a single space in order 1-5 reproduces the exact original sentence, including punctuation (a comma may fall at the end of a part).
- Each part is a self-contained phrase or clause of roughly 5 to 12 words (longer for the "hard" sentence length) — never a single word, never half a word.
- The parts are not ordered in an obviously-only-one-way manner that makes reconstruction trivial by word count alone — vary where the subject, verb, and modifying clauses fall across the 5 parts.
- Part 1 starts with a capital letter; the final part ends with the sentence's closing punctuation (usually a period).

Respond with ONLY a JSON object (no markdown fences, no extra commentary) in exactly this shape:
{"sentences": [{"topic": "a 2-4 word topic label", "parts": ["part 1 text", "part 2 text", "part 3 text", "part 4 text", "part 5 text"]}]}
The "sentences" array must have exactly ${count} items, every item's "parts" array must have exactly 5 non-empty strings, and no two sentences should share the same topic or near-identical wording.`
}

// Without an explicit override, race both models at once (see api/lookup.js for why) rather
// than falling back sequentially after a failure/timeout.
const MODEL_CANDIDATES = process.env.GEMINI_MODEL ? [process.env.GEMINI_MODEL] : ['gemini-3.5-flash', 'gemini-3.5-flash-lite']

// Generating several structured sentences takes longer than a single word lookup, and hard
// sentences (35-50 words each) take longer still — but each request must land well inside
// Vercel's default serverless function limit. The client compensates by splitting a large
// question count into several small batches (smaller still for hard) rather than asking for
// everything in one slow call, and caps how many batches run at once (see
// src/lib/phraseRearrangementApi.ts) so a big session doesn't trip Gemini's rate limit either.
const GEMINI_TIMEOUT_MS = 8500

/** Calls one Gemini model. Returns {ok:true, sentences} on a usable batch, or {ok:false, ...} otherwise. */
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

  const raw = Array.isArray(parsed.sentences) ? parsed.sentences : []
  const sentences = raw
    .filter(
      (s) =>
        s &&
        typeof s.topic === 'string' &&
        Array.isArray(s.parts) &&
        s.parts.length === 5 &&
        s.parts.every((p) => typeof p === 'string' && p.trim().length > 0),
    )
    .slice(0, count)
    .map((s) => ({ topic: s.topic.slice(0, 60), parts: s.parts.map((p) => p.trim().slice(0, 200)) }))

  if (sentences.length === 0) return { ok: false, status: 502, error: 'Gemini returned no usable sentences.' }

  return { ok: true, sentences }
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

  res.status(200).json({ sentences: outcome.sentences })
}
