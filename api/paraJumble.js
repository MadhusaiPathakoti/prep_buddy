// Vercel serverless function (Node runtime). Generates "Para Jumble" practice paragraphs — a
// coherent paragraph of 5 (medium) or 6 (hard) sentences, returned in their CORRECT order along
// with a short explanation of the logical flow. The shuffling into lettered sentences and the
// answer-option construction happen client-side (src/lib/paraJumble.ts). Reuses the same
// GEMINI_API_KEY as the other English games' endpoints.

const GENRE_INSTRUCTIONS = {
  editorial:
    'a formal editorial/opinion-style paragraph on education, personal growth, technology, the environment, or public policy (avoid politically divisive or controversial claims)',
  news: 'a news or current-affairs style paragraph about a government scheme, policy update, institution, or public announcement (illustrative and plausible, not claimed as a real-time-verified fact)',
  generalKnowledge: 'a general-knowledge paragraph (geography, history, economics, records, firsts, or culture)',
  scienceNature: 'a science or nature paragraph (physics, biology, chemistry, geology, astronomy, or the human body)',
  biography: 'a biographical paragraph about a well-known historical or contemporary figure and their achievements',
  fiction: 'a short narrative paragraph, as if drawn from a short story or novel (no need to name a book or author)',
  poetry: 'a vivid, lightly figurative descriptive paragraph in a poetic, literary register, but still plain prose',
}

const GENRES = Object.keys(GENRE_INSTRUCTIONS)

const SENTENCE_COUNT_BY_DIFFICULTY = { medium: 5, hard: 6 }

function buildPrompt(genre, difficulty, count) {
  const sentenceCount = SENTENCE_COUNT_BY_DIFFICULTY[difficulty]
  const lengthHint =
    difficulty === 'hard'
      ? '15 to 28 words per sentence, with the logical links between sentences kept subtle (implied cause and effect, contrast, a pronoun or "this/such" reference back to an earlier idea)'
      : '12 to 20 words per sentence, with clear linking cues (a pronoun referring back, a connector such as "However", "Therefore", "For instance", or an obvious chronological order)'

  return `You write English "Para Jumble" practice questions for Indian competitive bank/government exams (like SBI PO/IBPS): a coherent paragraph is split into sentences, shuffled, and the test-taker must restore the original order.

Generate exactly ${count} DIFFERENT paragraphs. Each must be ${GENRE_INSTRUCTIONS[genre]}.
Each paragraph has EXACTLY ${sentenceCount} sentences, in their correct order, ${lengthHint}.

Requirements for every paragraph:
- Sentence 1 must introduce the topic on its own: it must make sense with nothing before it, and must not start with a pronoun, "This", "Such", "However" or any other word that needs an antecedent.
- Every later sentence must clearly depend on what came before it (a pronoun reference, a connector, a continuation of an argument, or a time sequence), so there is exactly ONE sensible order. Do not write sentences that could be swapped without changing the meaning.
- Each sentence is complete and ends with its own full stop; no sentence is split across items.
- Avoid graphic violence, sexual content, or other distressing subject matter.

For each paragraph also write a short explanation (2-3 sentences) of the logical flow that fixes the order. IMPORTANT: refer to sentences only by quoting their first few words (for example: the sentence beginning "However, the results…"), NEVER by letter or by number, because the sentences will be shuffled and relabelled before the student sees them.

Respond with ONLY a JSON object (no markdown fences, no extra commentary) in exactly this shape:
{"paragraphs": [{"topic": "a 2-4 word topic label", "sentences": ["sentence 1", "sentence 2", "..."], "explanation": "..."}]}
The "paragraphs" array must have exactly ${count} items, each "sentences" array must have exactly ${sentenceCount} non-empty strings in correct order, and no two paragraphs should share a topic.`
}

// Without an explicit override, race both models at once (see api/lookup.js for why) rather
// than falling back sequentially after a failure/timeout.
const MODEL_CANDIDATES = process.env.GEMINI_MODEL ? [process.env.GEMINI_MODEL] : ['gemini-3.5-flash', 'gemini-3.5-flash-lite']

// Several full paragraphs with explanations is a heavy generation, so each call gets a longer
// budget than the short-sentence games — still well inside Vercel's default function limit. The
// client (src/lib/paraJumbleApi.ts) asks for only 2-3 paragraphs per call and runs a few calls
// at once, rather than one huge slow call.
const GEMINI_TIMEOUT_MS = 8500

/** Calls one Gemini model. Returns {ok:true, paragraphs} on a usable batch, or {ok:false, ...} otherwise. */
async function callGeminiModel(model, apiKey, prompt, count, sentenceCount) {
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

  const raw = Array.isArray(parsed.paragraphs) ? parsed.paragraphs : []
  const paragraphs = raw
    .filter((p) => {
      if (!p || typeof p.topic !== 'string' || p.topic.trim() === '') return false
      if (typeof p.explanation !== 'string' || p.explanation.trim() === '') return false
      if (!Array.isArray(p.sentences) || p.sentences.length !== sentenceCount) return false
      if (!p.sentences.every((s) => typeof s === 'string' && s.trim().length > 0)) return false
      // Two identical sentences would make the correct order ambiguous.
      return new Set(p.sentences.map((s) => s.trim().toLowerCase())).size === sentenceCount
    })
    .slice(0, count)
    .map((p) => ({
      topic: p.topic.trim().slice(0, 60),
      sentences: p.sentences.map((s) => s.trim().slice(0, 400)),
      explanation: p.explanation.trim().slice(0, 700),
    }))

  if (paragraphs.length === 0) return { ok: false, status: 502, error: 'Gemini returned no usable paragraphs.' }

  return { ok: true, paragraphs }
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
  const sentenceCount = SENTENCE_COUNT_BY_DIFFICULTY[difficulty]
  const count = Math.min(Math.max(parseInt(req.query.count, 10) || 1, 1), 3)

  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    res.status(500).json({ error: 'GEMINI_API_KEY is not configured on the server.' })
    return
  }

  const prompt = buildPrompt(genre, difficulty, count)
  const outcome = await firstSuccessful(MODEL_CANDIDATES.map((model) => callGeminiModel(model, apiKey, prompt, count, sentenceCount)))

  if (!outcome.ok) {
    const { status, error, detail } = outcome
    res.status(status).json(detail ? { error, detail } : { error })
    return
  }

  res.status(200).json({ paragraphs: outcome.paragraphs })
}
