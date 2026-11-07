// Vercel serverless function (Node runtime) behind the "Mocks" module's English section.
//
//   POST {action:'generate', topic, difficulty:'medium'|'hard', count, seed?}  ->  {groups, meta}
//   POST {action:'solve', items:[{id, topic, passage?, stem, options[5]}], avoidModel?}  ->  {results, model}
//
// "generate" asks Gemini to WRITE questions (one JSON schema per topic) and converts them, in code, into
// the app's Group[] contract (src/lib/mocks/types.ts). Everything that can be built deterministically IS
// built in code rather than trusted to the model: option shuffling and the answer index, A-D/1-4 letters,
// para-jumble shuffles and distractor orders, word-swap faulty sentences and pair options, match-the-column
// matchings, vocabulary-in-context stems, cloze numbering. Every raw item is also run through structural and
// hygiene checks here; failures are dropped (and counted in meta.dropped).
//
// "solve" is the independent blind check: it receives the question material WITHOUT the key or explanation
// and returns the model's chosen option plus an "ambiguous" flag. It prefers the model that did NOT generate
// the batch. The client (src/lib/mocks/english/index.ts) keeps only items where the blind answer equals the
// key and the solver did not flag ambiguity.
//
// Env: at least one provider key: GEMINI_API_KEY, GROQ_API_KEY, MISTRAL_API_KEY, OPENROUTER_API_KEY (a provider is
// enabled only when its key is set). GEMINI_MODEL (optional: forces one Gemini model for both roles),
// MOCK_ENGLISH_GENERATE_MODELS / MOCK_ENGLISH_SOLVE_MODELS (optional comma-separated chains of "provider/model" ids,
// tried in order; a bare name means gemini). Solvers prefer another PROVIDER than the generator, then another model.
// Model health: every failure is classified (404 unavailable, 429 per-day quota, 429 per-minute, 5xx/timeout/network
// overload) and the model is skipped until its cooldown ends - in this instance's memory AND, via the client's
// skipModels list and the modelHealth updates in every reply, in the client's localStorage. A daily-quota error never
// causes a sleep: the next model in the chain is tried at once.
// Test-only knobs: MOCK_ENGLISH_GEMINI_TIMEOUT_MS, MOCK_ENGLISH_DEADLINE_MS, MOCK_ENGLISH_COOLDOWN_SCALE (multiplies
// this instance's own cooldown enforcement), MOCK_ENGLISH_ALLOW_RESET=1 (enables action "resetHealth"),
// MOCK_ENGLISH_MAX_BUDGET_WAIT_MS (longest wait for a token budget reset, default 15 s),
// MOCK_ENGLISH_MAX_TRANSIENT_COOLDOWN_MS (cap of the growing 5xx/timeout cooldown, default 10 minutes).

import { rateLimit } from './_lib/guard.js'

export const config = { maxDuration: 60 }

const TOPIC_IDS = ['rc', 'cloze', 'error-detection', 'para-jumble', 'fillers', 'word-swap', 'phrase-replacement', 'match-column']
const TOPIC_LABEL = {
  rc: 'Reading Comprehension',
  cloze: 'Cloze Test',
  'error-detection': 'Error Detection',
  'para-jumble': 'Para Jumble',
  fillers: 'Fillers',
  'word-swap': 'Word Swap',
  'phrase-replacement': 'Phrase Replacement',
  'match-column': 'Match the Column',
}
/** Per-call cap on `count` (rc/cloze count questions, not passages). */
const MAX_COUNT = { rc: 12, cloze: 8, 'error-detection': 10, 'para-jumble': 8, fillers: 10, 'word-swap': 8, 'phrase-replacement': 10, 'match-column': 6 }
const MAX_SOLVE_ITEMS = 24

const GENERATE_TEMPERATURE = 0.8
const SOLVE_TEMPERATURE = 0.1

/** Per-call budgets (ms): generate 20 s, solve 15 s (40 s for thinking models). The env knob overrides all (tests). */
/** "Thinking" models (gemini-3-flash-preview) need far longer than the others to solve a chunk. */
const isThinkingModel = (id) => /gemini-3-flash-preview|thinking/i.test(id)
const geminiTimeoutMs = (kind, id = '') => Number(process.env.MOCK_ENGLISH_GEMINI_TIMEOUT_MS) || (kind === 'solve' ? (isThinkingModel(id) ? 40000 : 15000) : 20000)
/** Whole-request budget: the function's maxDuration is 60 s and the client gives up at 58 s. */
const requestDeadlineMs = () => Number(process.env.MOCK_ENGLISH_DEADLINE_MS) || 56000
const modelOverride = () => (process.env.GEMINI_MODEL || '').trim()

// ---------------------------------------------------------------------------------------------------
// Text helpers
// ---------------------------------------------------------------------------------------------------

/** Maps stray typography to the WinAnsi-safe set the PDF writer supports. */
function sanitize(s) {
  let t = typeof s === 'string' ? s : s == null ? '' : String(s)
  t = t.replace(/\*\*/g, '')
  t = t.replace(/[​-‍⁠﻿­]/g, '')
  t = t.replace(/[ -   \t]/g, ' ')
  t = t.replace(/…/g, '...').replace(/[‐‑‒]/g, '-').replace(/―/g, '—')
  t = t.replace(/\r\n?/g, '\n')
  return t
}
/** Single-line clean text. */
const line = (s) => sanitize(s).replace(/\s+/g, ' ').trim()
/** Characters the PDF writer can render (after sanitize). */
const ALLOWED_TEXT = /^[\n\x20-\x7e\xa1-\xff−√≤≥≠₹→∴‘’“”–—•]*$/
const HYGIENE =
  /```|`|\*|<\/?[a-z][^>]*>|as an ai\b|language model|\bTODO\b|\bTBD\b|lorem ipsum|\[\s*(?:insert|blank|placeholder|option|passage|your)|\{\{|\}\}|\bundefined\b|\bNaN\b|\[object/i

/** Returns a reason string if the text is unusable, else ''. `allowBlank` permits runs of underscores. */
function textProblem(s, allowBlank = false) {
  if (typeof s !== 'string' || !s.trim()) return 'empty text'
  if (!ALLOWED_TEXT.test(s)) return 'unsupported character'
  if (HYGIENE.test(s)) return 'placeholder/markdown text'
  if (!allowBlank && /_{2,}/.test(s)) return 'stray blank marker'
  return ''
}

const wordCount = (s) => (s.trim() ? s.trim().split(/\s+/).length : 0)
const normKey = (s) => s.toLowerCase().replace(/[^a-z0-9À-ÿ]+/g, ' ').trim()
function jaccard(a, b) {
  const sa = new Set(normKey(a).split(' '))
  const sb = new Set(normKey(b).split(' '))
  let inter = 0
  for (const x of sa) if (sb.has(x)) inter++
  const union = sa.size + sb.size - inter
  return union === 0 ? 0 : inter / union
}
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const isInt = (n) => Number.isInteger(n)
/** Options that point at each other ("All of the above") must keep their order. */
const POSITIONAL_OPTION = /\b(?:above|below|none of (?:these|the)|all of (?:these|the)|both (?:the )?(?:statements|options)|previous option|(?:option|options)\s*[a-e1-5])\b/i
/** Explanations of shuffled-option topics must not cite option letters. */
const CITES_OPTION = /\b(?:option|choice|answer)\s*\(?[A-E1-5]\)?(?![a-z])/gi
/** Model output for "no error / already correct" comes in several spellings. */
const nullish = (v) => (v === null || v === -1 || v === 'null' || v === 'none' || v === 'None' || v === 'No error' ? null : v)

// ---------------------------------------------------------------------------------------------------
// Seeded RNG (mulberry32), for themes, shuffles and deterministic distractors
// ---------------------------------------------------------------------------------------------------

function hashSeed(v) {
  const s = String(v)
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function makeRng(seed) {
  let a = seed >>> 0
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const int = (min, max) => min + Math.floor(next() * (max - min + 1))
  const shuffle = (arr) => {
    const out = arr.slice()
    for (let i = out.length - 1; i > 0; i--) {
      const j = int(0, i)
      ;[out[i], out[j]] = [out[j], out[i]]
    }
    return out
  }
  return { next, int, shuffle, pick: (arr) => arr[int(0, arr.length - 1)], chance: (p) => next() < p }
}

/** Shuffles options, keeping the last `fixedTail` options in place; returns the new options and answer index. */
function shuffleOptions(rng, options, answer, fixedTail = 0) {
  const head = options.slice(0, options.length - fixedTail)
  const tail = options.slice(options.length - fixedTail)
  const order = rng.shuffle(head.map((_, i) => i))
  const shuffled = order.map((i) => head[i])
  const newAnswer = answer < head.length ? order.indexOf(answer) : answer
  return { options: [...shuffled, ...tail], answer: newAnswer }
}

/** Cycles through a shuffled copy of `list` so consecutive items get different entries. */
function themeDealer(rng, list) {
  let deck = []
  return () => {
    if (deck.length === 0) deck = rng.shuffle(list)
    return deck.pop()
  }
}

const PASSAGE_THEMES = [
  'the role of a central bank in controlling inflation',
  'digital payments and financial inclusion in small towns',
  'the economics of renewable energy adoption',
  'urban migration and its effect on housing',
  'artificial intelligence and the future of clerical work',
  'rural credit and the cooperative banking tradition',
  'climate change and the insurance industry',
  'the gig economy and job security',
  'sustainable agriculture and food security',
  'public health spending and economic productivity',
  'the growth of e-commerce and local retailers',
  'cybersecurity and consumer trust in online banking',
  'the ethics of automation in finance',
  'water scarcity and urban planning',
  'microfinance and women entrepreneurs',
  'education reform and skill development',
  'the importance of financial literacy for young adults',
  'electric vehicles and the transition away from fossil fuels',
  'globalisation and the resilience of supply chains',
  'regulation versus innovation in financial technology',
  'tourism and its environmental footprint',
  'the shrinking attention span in a connected world',
  'the future of cash in a digital economy',
  'waste management and the circular economy',
  'demographic change and pension systems',
  'the value of public libraries in the internet age',
  'infrastructure investment and long-term growth',
  'consumer debt and household savings habits',
  'biodiversity loss and its economic cost',
  'remote work and the redesign of cities',
]
const SENTENCE_THEMES = [
  'office and workplace life',
  'banking and customer service',
  'a village or small-town setting',
  'education and examinations',
  'public transport and travel',
  'health and wellness',
  'agriculture and weather',
  'technology and gadgets',
  'sports and fitness',
  'markets and trade',
  'environment and wildlife',
  'government schemes and public services',
  'family and community events',
  'science and discovery',
  'city planning and housing',
  'arts, books and culture',
  'disaster preparedness and safety',
  'business and entrepreneurship',
  'history and heritage',
  'food and festivals',
]

const DIFFICULTY_TEXT = {
  hard: 'PO level (HARD): finer points of grammar and idiom, subtler collocations and inference, longer and more complex sentences, abstract vocabulary.',
  medium: 'Clerk level (MEDIUM): common grammar rules, everyday and standard business vocabulary, direct and clearly signposted logic.',
}

function header(topic, difficulty, count, seed) {
  return `You are a senior paper-setter for the English Language section of Indian bank PO and Clerk prelims (SBI PO, IBPS PO, SBI Clerk, IBPS Clerk). An independent expert will solve every question you write WITHOUT seeing your answer key. Any question whose key is debatable, that has two defensible options, or whose wording is unnatural or ungrammatical (outside the one intended error) is thrown away. Write only items you are completely sure about, and re-check every key before you output it.

Task: mock-english / topic=${topic} / difficulty=${difficulty} / items=${count} / seed=${seed}
Difficulty: ${DIFFICULTY_TEXT[difficulty]}

Global rules:
- Original text only. No real named people, companies or institutions; no real statistics, dates or events presented as fact; nothing politically divisive, violent or distressing.
- Plain text only: no markdown, no asterisks, no HTML, no emoji, no non-Latin scripts. Straight quotes and apostrophes are fine.
- Every explanation is 1-3 sentences and names the rule or quotes the evidence that fixes the key.
- Vary vocabulary, sentence openings and subject matter; follow the per-item plan exactly.
`
}

// ---------------------------------------------------------------------------------------------------
// Topic definitions: plan (per-item instructions), schema, prompt text, and builder (raw JSON -> Groups)
// ---------------------------------------------------------------------------------------------------

const RC_KINDS = ['main-idea', 'inference', 'true', 'not-true', 'tone', 'vocab-synonym', 'vocab-antonym', 'may-be-true']
const RC_KIND_TEXT = {
  'main-idea': 'main idea / best title / central theme of the passage',
  inference: 'inference: what can be concluded or inferred, answerable only from the passage',
  true: 'which of the following statements is TRUE according to the passage',
  'not-true': 'which of the following statements is NOT true / cannot be inferred according to the passage (the stem must contain the word NOT in capitals)',
  tone: "the author's tone, attitude or purpose",
  'vocab-synonym': 'vocabulary in context: a word that occurs in the passage; the key is the option closest in meaning to it AS USED there (give "targetWord", the exact word as it appears in the passage)',
  'vocab-antonym': 'vocabulary in context: a word that occurs in the passage; the key is the option most opposite in meaning to it AS USED there (give "targetWord", the exact word as it appears in the passage)',
  'may-be-true': 'which statement is definitely true / may be true / can be inferred, judged only on the passage',
}
const RC_DIRECTIONS = 'Read the following passage carefully and answer the questions given below it.'

const RC_SCHEMA = `{"passages":[{"paragraphs":["paragraph 1","paragraph 2"],"questions":[{"kind":"main-idea|inference|true|not-true|tone|vocab-synonym|vocab-antonym|may-be-true","targetWord":"vocab kinds only: the single word exactly as it appears in the passage, otherwise empty string","stem":"the full question text (for vocab kinds write a short placeholder, it is replaced)","options":["option 1","option 2","option 3","option 4","option 5"],"correctIndex":0,"explanation":"..."}]}]}`

function rcPlan({ rng, count }) {
  const base = ['main-idea', 'inference', 'true', 'not-true', 'tone', 'vocab-synonym', 'vocab-antonym', 'inference', 'may-be-true', 'true', 'inference', 'not-true']
  const kinds = count <= base.length ? base.slice(0, count) : [...base, ...Array.from({ length: count - base.length }, () => rng.pick(RC_KINDS))]
  return kinds.map((k, i) => `Question ${i + 1}: ${RC_KIND_TEXT[k]}`)
}

function rcPrompt(ctx) {
  const { difficulty, count, rng } = ctx
  const theme = rng.pick(PASSAGE_THEMES)
  const genre = rng.pick(['an analytical essay', 'an editorial', 'an explanatory article', 'a reflective essay', 'a report-style feature'])
  const length =
    difficulty === 'hard'
      ? 'between 380 and 450 words in 3 or 4 paragraphs: dense, abstract, argumentative, with qualifications and contrast (inference-heavy)'
      : 'between 250 and 320 words in 2 or 3 paragraphs: clear, direct, with simpler vocabulary and straightforward structure'
  return `Write ONE original reading-comprehension passage of ${genre} on this theme: ${theme}. Length: ${length}. Then write exactly ${count} questions on it, in this plan:
${rcPlan(ctx).join('\n')}

Rules:
- Every question must be answerable ONLY from the passage: no outside knowledge. Exactly one option is correct; the other four must be clearly wrong or clearly less supported by the passage (not merely "less good"), and each must be tempting only through a plausible misreading.
- Each question has EXACTLY 5 distinct options. Never use "All of the above", "None of the above" or options that refer to other options. Options of a "true / NOT true" question are full statements.
- Do not write a question whose answer simply repeats one sentence word for word, and do not reuse the same fact in two questions.
- A vocabulary question's targetWord must be a single word that really occurs in the passage; its five options are single words (or two-word phrases), the target itself is not among them, and the key fits the word's meaning in that sentence.
- Never cite an option by letter or number in an explanation (options are shuffled afterwards); quote the passage instead.
- The passage must be ${difficulty === 'hard' ? 'at least 380' : 'at least 250'} words. Count carefully.
- Every question stem is a real question ending in "?" (or an unfinished sentence ending in ":"), never a statement. NEVER use True / False / Yes / No as options. All five options of a question have the same form and similar length (all full statements, or all short phrases).
- Never repeat a sentence of the passage as the stem.
- Put the key at varying positions (correctIndex 0-4).${
    difficulty === 'hard'
      ? `
HARD-level requirements (PO prelims):
- The passage is about 430 words (at least 380), dense and argumentative, with qualifications.
- Every distractor must be a TEMPTING MISREADING: it reuses the passage's own words but overstates, reverses, generalises or misattributes a claim. No absurd, off-topic or obviously extreme options anywhere (tone options must all be plausible attitudes a careful reader could argue for).
- At least 2 inference questions must require combining TWO different sentences of the passage; none may be answerable from one sentence alone.`
      : ''
  }

Respond with ONLY a JSON object (no markdown fences) in exactly this shape:
${RC_SCHEMA}`
}

const CLOZE_SCHEMA = `{"passages":[{"text":"the passage with blanks written exactly as (1) ______ , (2) ______ and so on, numbered in order of appearance","blanks":[{"n":1,"options":["word 1","word 2","word 3","word 4","word 5"],"correctIndex":0,"explanation":"..."}]}]}`

function clozePrompt({ difficulty, count, rng }) {
  const theme = rng.pick(PASSAGE_THEMES)
  const kinds = rng.shuffle(['a grammar-driven blank (verb form, preposition, conjunction or article)', 'a vocabulary/collocation-driven blank', 'a meaning/connective-driven blank (contrast, cause, addition)', 'a collocation or idiom-driven blank', 'a grammar-driven blank (verb form, preposition, conjunction or article)', 'a vocabulary/collocation-driven blank', 'a meaning-driven blank', 'a collocation-driven blank'])
  return `Write ONE original cloze passage of 150 to 200 words on this theme: ${theme}. It must contain exactly ${count} numbered blanks, written exactly as "(1) ______", "(2) ______" ... "(${count}) ______" (six underscores), numbered in order of appearance and spread across the passage. Do not put a blank in the first sentence's opening words. The passage must read as natural prose once the correct words are filled in.
Blank plan: ${kinds.slice(0, count).map((k, i) => `(${i + 1}) ${k}`).join('; ')}.

For each blank give EXACTLY 5 distinct options (single words, or one fixed two-word phrase) and the key. The correct word must be the ONLY one that fits that slot by grammar, collocation AND meaning: the other four must be definitely wrong in that exact context (wrong form, wrong collocation or contradicting the sense), never a near-synonym that would also be acceptable. Tests of difficulty: ${difficulty === 'hard' ? 'subtle collocations and connectives, close word forms' : 'common words, clear grammatical or sense cues'}.
Never cite an option by letter or number in an explanation (options are shuffled afterwards).

Respond with ONLY a JSON object (no markdown fences) in exactly this shape:
${CLOZE_SCHEMA}`
}

const ED_CATEGORIES = {
  medium: ['subject-verb agreement', 'wrong tense or verb form', 'wrong preposition', 'article (a/an/the) error', 'pronoun agreement or case', 'singular/plural noun error', 'wrong comparative or superlative', 'adjective used for adverb (or vice versa)', 'wrong conjunction', 'wrong verb form after a modal or "to"'],
  hard: ['subject-verb agreement across a long or compound subject', 'tense sequence', 'subjunctive or conditional error (if / wish / suggest that)', 'faulty parallelism', 'wrong dependent preposition', 'double comparative or wrong comparative construction', 'inverted structure after "hardly", "no sooner", "scarcely"', 'pronoun-antecedent disagreement', 'misplaced or dangling modifier', 'wrong participle or gerund form', 'neither/nor, either/or, one of the / each of agreement', 'wrong use of "much / many / few / less / fewer"'],
}
const ED_SCHEMA = `{"items":[{"variant":"parts","parts":["part (a)","part (b)","part (c)","part (d)"],"errorPartIndex":2,"explanation":"..."},{"variant":"sentences","sentences":["s1","s2","s3","s4","s5"],"correctIndex":3,"explanation":"..."}]}`

function edPlan({ rng, difficulty, count, noError }) {
  const cats = themeDealer(rng, ED_CATEGORIES[difficulty])
  const ctx = themeDealer(rng, SENTENCE_THEMES)
  const lines = []
  for (let i = 1; i <= count; i++) {
    const r = rng.next()
    if (r < 0.2 && count >= 3) {
      lines.push(`Item ${i}: variant "sentences" - five versions of the same idea (context: ${ctx()}); exactly ONE is fully correct and each of the other four has a DIFFERENT clear grammatical error (e.g. ${cats()}; ${cats()}).`)
    } else if (r < 0.32 && noError !== false) {
      lines.push(`Item ${i}: variant "parts" - context: ${ctx()}; NO error: all four parts are fully correct (errorPartIndex null).`)
    } else {
      const part = rng.pick(['a', 'b', 'c', 'd'])
      lines.push(`Item ${i}: variant "parts" - context: ${ctx()}; error category: ${cats()}; the error is in part (${part}) (errorPartIndex ${'abcd'.indexOf(part)}).`)
    }
  }
  return lines
}

function edPrompt(ctx) {
  const { difficulty, count } = ctx
  const length = difficulty === 'hard' ? '28 to 45 words' : '18 to 30 words'
  return `Write exactly ${count} Error Detection items. Plan:
${edPlan(ctx).join('\n')}

Rules for variant "parts": the sentence (${length}) is split into 4 consecutive parts (each at least 2 words) that join with single spaces into ONE complete, natural sentence that starts with a capital letter and whose last part ends with the full stop (never a fragment, never an unnatural sentence; do not split inside a fixed phrase). Either exactly one part contains ONE unambiguous grammatical error (a rule about grammar, never style, spelling, punctuation or idiom preference, and not a matter on which standard English authorities differ), or no part does. The error must lie within a single part, and the other three parts must be flawless. Do not mark or flag the error in the text. In the explanation, name the rule, quote the faulty words and give the fix.
Rules for variant "sentences": five complete sentences of 12 to 25 words about the same idea; exactly one is grammatically correct.
Never produce an item where a careful reader could defend a second part as erroneous, or where "no error" could be debated.

Respond with ONLY a JSON object (no markdown fences) in exactly this shape:
${ED_SCHEMA}`
}

const PJ_SCHEMA = `{"items":[{"sentences":["opening sentence","second sentence","..."],"explanation":"..."}]}`

function pjPlan({ rng, difficulty, count }) {
  const ctx = themeDealer(rng, PASSAGE_THEMES)
  const lines = []
  for (let i = 1; i <= count; i++) {
    const n = difficulty === 'hard' ? (rng.chance(0.6) ? 6 : 5) : rng.chance(0.4) ? 6 : 5
    lines.push(`Item ${i}: ${n} sentences, theme: ${ctx()}.`)
  }
  return lines
}

function pjPrompt(ctx) {
  const { difficulty, count } = ctx
  const lengthHint =
    difficulty === 'hard'
      ? '16 to 30 words per sentence, with subtle links (implied cause and effect, contrast, a "this/such/these" reference back to an earlier idea)'
      : '12 to 22 words per sentence, with clear linking cues (a pronoun referring back, a connector such as "However" or "Therefore", or an obvious chronological order)'
  return `Write exactly ${count} Para Jumble items. Each is a short coherent paragraph, given as its sentences in the CORRECT order (the system shuffles and labels them afterwards). Plan:
${pjPlan(ctx).join('\n')}

Rules:
- ${lengthHint}.
- Sentence 1 introduces the topic on its own: it makes sense with nothing before it and does NOT start with a pronoun, "This", "Such", "However", "Moreover" or any word needing an antecedent.
- Every later sentence clearly depends on what precedes it (a pronoun or "this/such" reference, a connector, a continuation of an argument, a time sequence) so that exactly ONE order is coherent. Include at least one mandatory pair of sentences that must be adjacent (for example a statement followed by the sentence beginning "This ..." that refers to it). Never write sentences that could be swapped without changing the meaning.
- Each sentence is complete, ends with its own full stop, and does not carry a label like "A." or "1.".
- In the explanation, refer to sentences ONLY by quoting their first few words, NEVER by letter or number.

Respond with ONLY a JSON object (no markdown fences) in exactly this shape:
${PJ_SCHEMA}`
}

const FILLERS_SCHEMA = `{"items":[{"type":"single","sentence":"sentence with exactly one ______ blank","options":["w1","w2","w3","w4","w5"],"correctIndex":0,"explanation":"..."},{"type":"double","sentence":"sentence with (A) ______ and (B) ______ blanks","options":[["w1a","w1b"],["w2a","w2b"],["w3a","w3b"],["w4a","w4b"],["w5a","w5b"]],"correctIndex":0,"explanation":"..."}]}`

function fillersPlan({ rng, count }) {
  const ctx = themeDealer(rng, SENTENCE_THEMES)
  return Array.from({ length: count }, (_, i) => `Item ${i + 1}: ${rng.chance(0.55) ? 'single' : 'double'} filler, context: ${ctx()}.`)
}

function fillersPrompt(ctx) {
  const { difficulty, count } = ctx
  const style = difficulty === 'hard' ? '25 to 40 words with abstract vocabulary and subtle collocation or contrast cues' : '18 to 28 words with clear grammatical or sense cues'
  return `Write exactly ${count} Fillers items (sentence completion). Plan:
${fillersPlan(ctx).join('\n')}

Rules:
- Sentence length ${style}.
- "single": the sentence has exactly ONE blank written "______" and 5 distinct single-word options. "double": the sentence has exactly TWO blanks, written "(A) ______" and "(B) ______" in order, and 5 distinct word PAIRS as options (each pair is [word for A, word for B]).
- Exactly ONE option (or pair) makes the sentence grammatical, natural and meaningful; each of the other four must be definitely wrong (wrong grammar, wrong collocation, or contradicting the sense) - not merely weaker. In double fillers, wrong pairs must fail because at least one word is wrong in its slot, and no two pairs may both work; every individual word in a pair must look plausible, and no pair repeats the same word in both slots.
- Do not use a word that already appears in the sentence as an option. Never cite an option by letter or number in an explanation (options are shuffled afterwards).

Respond with ONLY a JSON object (no markdown fences) in exactly this shape:
${FILLERS_SCHEMA}`
}

const WS_SCHEMA = `{"items":[{"tokens":["The","government","has","launched","a","new","scheme."],"marked":["government","launched","new","scheme"],"swap":[0,2],"explanation":"..."},{"tokens":["..."],"marked":["...","...","...","..."],"swap":null,"explanation":"..."}]}`

function wsPlan({ rng, count, noError }) {
  const ctx = themeDealer(rng, SENTENCE_THEMES)
  return Array.from({ length: count }, (_, i) => `Item ${i + 1}: ${rng.chance(0.12) && noError !== false ? 'NO interchange needed (swap null)' : 'one interchange needed'}, context: ${ctx()}.`)
}

function wsPrompt(ctx) {
  const { difficulty, count } = ctx
  const style = difficulty === 'hard' ? '20 to 32 words, with abstract vocabulary and a long sentence structure' : '14 to 24 words, with a simple structure'
  return `Write exactly ${count} Word Swap (word interchange) items. Plan:
${wsPlan(ctx).join('\n')}

How an item works: you give the CORRECT, natural sentence (${style}) as "tokens" (its words in order, with punctuation attached to the word it follows, e.g. "scheme."). You choose FOUR words in it to be marked: "marked" lists those four words themselves, exactly as they appear in "tokens", in order of appearance. The marked words must be plain lowercase words (no capital letters, no attached punctuation, never the first token) and must be words whose positions matter: nouns, verbs, adjectives, adverbs, prepositions. If the plan says "one interchange needed", set "swap" to [a, b]: two positions inside the "marked" list (0 to 3, a not equal b) whose words the system will exchange in the sentence shown to students; the exchange must leave a sentence that is clearly ungrammatical or nonsensical, and putting the two words back must be the ONLY single exchange of two marked words that gives a correct sentence. Never choose two words whose exchange would still make a sensible sentence (for example two interchangeable nouns), and never choose two identical words. If the plan says "NO interchange needed", set "swap" to null (the correct sentence is shown as it is).
The explanation states the rule or meaning clue; do NOT mention marker numbers or indices, quote the words instead.

Respond with ONLY a JSON object (no markdown fences) in exactly this shape:
${WS_SCHEMA}`
}

const PR_SCHEMA = `{"items":[{"variant":"replace","before":"words before the phrase","phrase":"the phrase to be replaced","after":"words after the phrase, with the closing punctuation","options":["replacement 1","replacement 2","replacement 3","replacement 4"],"correctIndex":1,"explanation":"..."},{"variant":"usage","sentence":"sentence with one ______ blank","options":["phrase 1","phrase 2","phrase 3","phrase 4","phrase 5"],"correctIndex":0,"explanation":"..."}]}`

function prPlan({ rng, count, noError }) {
  const ctx = themeDealer(rng, SENTENCE_THEMES)
  const lines = []
  for (let i = 1; i <= count; i++) {
    const r = rng.next()
    if (r < 0.2 && count >= 3) lines.push(`Item ${i}: variant "usage" - fill the blank with the right phrasal verb / fixed phrase, context: ${ctx()}.`)
    else if (r < 0.32 && noError !== false) lines.push(`Item ${i}: variant "replace" - the original phrase is ALREADY CORRECT (correctIndex null; all four options are worse), context: ${ctx()}.`)
    else lines.push(`Item ${i}: variant "replace" - the original phrase contains a genuine error and exactly one option fixes it, context: ${ctx()}.`)
  }
  return lines
}

function prPrompt(ctx) {
  const { difficulty, count } = ctx
  const style = difficulty === 'hard' ? '24 to 38 words, finer grammar/idiom points (tense sequence, conditionals, parallelism, dependent prepositions, comparatives)' : '16 to 26 words, common grammar/idiom points (tense, agreement, prepositions, articles, phrasal verbs)'
  return `Write exactly ${count} Phrase Replacement items. Plan:
${prPlan(ctx).join('\n')}

Rules:
- Sentence length ${style}.
- variant "replace": the sentence is split into "before", "phrase" (a highlighted phrase of 2 to 7 words) and "after" (including the closing punctuation); before + phrase + after (joined by spaces) is the sentence shown, with the phrase in CAPITALS. Give EXACTLY 4 replacement phrases for the phrase. If the plan says the phrase has an error, exactly ONE replacement makes the whole sentence correct and the other three leave it wrong or clearly worse; the original phrase must not be among the options. If the phrase is already correct, "correctIndex" is null and ALL four options are wrong or clearly worse. ("No correction required" is added by the system as the fifth option: do not include it.)
- variant "usage": the sentence has one blank "______"; give 5 distinct phrases (phrasal verbs or fixed expressions such as look after / bring up / take after / look into / call off); exactly one fits by meaning and grammar and the other four are definitely wrong in this sentence.
- The question must test a rule or an idiom with one defensible answer: avoid items that depend on style or a debatable convention. Never cite an option by letter or number in an explanation (options are shuffled afterwards).

Respond with ONLY a JSON object (no markdown fences) in exactly this shape:
${PR_SCHEMA}`
}

const MC_SCHEMA = `{"items":[{"pairs":[{"begin":"first half of sentence 1","end":"second half of sentence 1."},{"begin":"...","end":"..."},{"begin":"...","end":"..."},{"begin":"...","end":"..."}],"explanation":"..."}]}`

function mcPrompt(ctx) {
  const { difficulty, count, rng } = ctx
  const deal = themeDealer(rng, SENTENCE_THEMES)
  const style = difficulty === 'hard' ? 'finer links: tense/aspect agreement, correlative conjunctions (not only ... but also, no sooner ... than), subjunctive, cause and contrast' : 'clear links: simple conjunctions, tense agreement, obvious cause/effect'
  return `Write exactly ${count} Match the Column items. Each item has 4 pairs. Contexts: ${Array.from({ length: count }, (_, i) => `item ${i + 1}: ${deal()}`).join('; ')}.

Each pair is one complete sentence split in two: "begin" (the first half, no end punctuation, 4 to 12 words) and "end" (the second half, finishing the sentence with a full stop, 3 to 14 words). The system shuffles the endings into Column II and asks the student to match each beginning (1-4) with its ending (A-D). Requirements:
- Each beginning must be completable ONLY by its own ending (grammar - tense, number, conjunction, voice - and meaning), and each ending must be clearly unsuitable for the other three beginnings. Use ${style}.
- The four sentences of an item are about different things, so no beginning is vaguely compatible with two endings. Never start two beginnings the same way.
- The explanation lists the four correct sentences in full (join each begin and end) and states the link that fixes each. Do not use numbers or letters in the explanation.

Respond with ONLY a JSON object (no markdown fences) in exactly this shape:
${MC_SCHEMA}`
}

// ---------------------------------------------------------------------------------------------------
// Builders: raw model JSON -> Group[] (returns {groups, drops[]}); everything structural is built here
// ---------------------------------------------------------------------------------------------------

const asArray = (v) => (Array.isArray(v) ? v : [])

/** Reads 5 options out of raw input; returns {options} or {problem}. */
function readOptions(raw, { maxWords = 40 } = {}) {
  if (!Array.isArray(raw) || raw.length !== 5) return { problem: 'options must be 5' }
  const options = raw.map((o) => line(o))
  for (const o of options) {
    const p = textProblem(o)
    if (p) return { problem: `option: ${p}` }
    if (wordCount(o) > maxWords) return { problem: 'option too long' }
  }
  if (new Set(options.map(normKey)).size !== 5) return { problem: 'duplicate options' }
  return { options }
}

/** A missing explanation is not fatal (fillExplanations adds a plain one); option letters are neutralised because
 *  options are shuffled after the model wrote the text. */
function readExplanation(raw, { shuffled = false, maxLen = 700 } = {}) {
  let e = line(raw)
  if (shuffled) e = e.replace(CITES_OPTION, 'the keyed option')
  const p = e ? textProblem(e) : ''
  if (p) return { problem: `explanation: ${p}` }
  return { explanation: e.length >= 8 ? e.slice(0, maxLen) : '' }
}

const wordIn = (text, phrase) => new RegExp(`(?<![A-Za-z])${esc(phrase)}(?![A-Za-z])`, 'i').test(text)

/** Replaces a model explanation that names a different option / part than the key (or contradicts a no-error key). */
function sanitizeExplanations(topic, groups) {
  if (topic === 'word-swap' || topic === 'para-jumble' || topic === 'match-column') return
  for (const g of groups) {
    for (const q of g.questions) {
      const e = q.explanation || ''
      const key = q.options[q.answer]
      let bad = false
      let replacement = ''
      if (topic === 'error-detection' && q.options[4] === 'No error') {
        const letters = [...e.matchAll(/\(([a-d])\)/gi)].map((m) => m[1].toLowerCase())
        if (q.answer < 4) {
          bad = letters.length > 0 && !letters.includes('abcd'[q.answer])
          const part = new RegExp(`\\(${'abcd'[q.answer]}\\) (.*?)(?= \\([a-d]\\) |$)`, 's').exec(q.stem)?.[1] ?? ''
          replacement = `Part (${'abcd'[q.answer]}) contains the grammatical error: "${part.trim()}".`
        } else {
          bad = /\b(error|incorrect|wrong|should be|instead of)\b/i.test(e) && !/\b(no error|correct|grammatical|sound)\b/i.test(e)
          replacement = 'All four parts are grammatically correct as written.'
        }
      } else {
        const others = q.options.filter((o, i) => i !== q.answer && o.length >= 3 && !POSITIONAL_OPTION.test(o))
        bad = !!e && !wordIn(e, key) && others.some((o) => wordIn(e, o))
        replacement =
          topic === 'phrase-replacement' && q.answer === 4 && q.options[4] === 'No correction required'
            ? 'The original phrase is already correct.'
            : topic === 'rc'
              ? `The passage best supports: "${key.slice(0, 280)}"`
              : topic === 'error-detection'
                ? `Correct sentence: ${key}`
                : `Best fit: ${key}.`
      }
      if (bad) q.explanation = replacement
    }
  }
}

function fillExplanations(groups) {
  for (const g of groups) {
    for (const q of g.questions) {
      q.explanation = q.explanation.trim()
      if (q.explanation.length < 8) q.explanation = `The correct answer is ${q.options[q.answer]}.`
    }
  }
}

const BARE_BOOL = /^(?:true|false|yes|no)[.!]?$/i
/** Shape checks for a non-vocabulary RC question: a real question/completion stem, no bare True/False options,
 *  homogeneous options, and a stem that is not a sentence lifted from the passage. */
function rcQuestionShape(stem, options, passage) {
  if (/[.!]\s*$/.test(stem)) return 'rc stem is a statement, not a question'
  if (options.some((o) => BARE_BOOL.test(o))) return 'rc options contain a bare True/False/Yes/No'
  const wcs = options.map(wordCount)
  const lo = Math.min(...wcs)
  const hi = Math.max(...wcs)
  if ((lo <= 2 && hi >= 7) || (lo <= 3 && hi >= 4 * lo && hi >= 8)) return 'rc options are not homogeneous (single words next to sentences)'
  const stemWords = normKey(stem).split(' ')
  const norm = normKey(passage)
  for (const sent of passage.split(/(?<=[.!?])\s+/)) if (wordCount(sent) >= 8 && jaccard(stem, sent) >= 0.8) return 'rc stem restates a passage sentence'
  for (let i = 0; i + 12 <= stemWords.length; i++) if (norm.includes(stemWords.slice(i, i + 12).join(' '))) return 'rc stem restates a passage sentence'
  return ''
}

function buildRc(parsed, ctx) {
  const groups = []
  const drops = []
  const lo = ctx.difficulty === 'hard' ? 250 : 170
  const hi = ctx.difficulty === 'hard' ? 560 : 420
  for (const p of asArray(parsed?.passages)) {
    let paragraphs = Array.isArray(p?.paragraphs) ? p.paragraphs.map(line) : typeof p?.passage === 'string' ? sanitize(p.passage).split(/\n+/).map(line) : []
    paragraphs = paragraphs.filter(Boolean)
    const body = paragraphs.join(' ')
    const wc = wordCount(body)
    const bad = paragraphs.map((x) => textProblem(x)).find(Boolean)
    if (!paragraphs.length || paragraphs.length > 6) {
      drops.push('rc: bad paragraph count')
      continue
    }
    if (bad) {
      drops.push(`rc passage: ${bad}`)
      continue
    }
    if (wc < lo || wc > hi) {
      drops.push(`rc passage length ${wc} outside ${lo}-${hi}`)
      continue
    }
    const questions = []
    const seenStems = []
    const seenTargets = new Set()
    for (const q of asArray(p?.questions)) {
      const kind = typeof q?.kind === 'string' ? q.kind : ''
      if (!RC_KINDS.includes(kind)) {
        drops.push('rc q: unknown kind')
        continue
      }
      const opts = readOptions(q.options, { maxWords: 45 })
      if (opts.problem) {
        drops.push(`rc q: ${opts.problem}`)
        continue
      }
      if (!isInt(q.correctIndex) || q.correctIndex < 0 || q.correctIndex > 4) {
        drops.push('rc q: bad correctIndex')
        continue
      }
      const ex = readExplanation(q.explanation, { shuffled: true })
      if (ex.problem) {
        drops.push(`rc q: ${ex.problem}`)
        continue
      }
      let stem
      if (kind === 'vocab-synonym' || kind === 'vocab-antonym') {
        const target = line(q.targetWord)
        if (!/^[A-Za-z][A-Za-z'-]{2,24}$/.test(target)) {
          drops.push('rc vocab: bad targetWord')
          continue
        }
        if (!new RegExp(`(?<![A-Za-z'-])${esc(target)}(?![A-Za-z'-])`, 'i').test(body)) {
          drops.push('rc vocab: target not in passage')
          continue
        }
        if (seenTargets.has(target.toLowerCase())) {
          drops.push('rc vocab: duplicate target')
          continue
        }
        if (opts.options.some((o) => o.length > 40 || wordCount(o) > 3 || normKey(o) === normKey(target))) {
          drops.push('rc vocab: options must be short and exclude the target')
          continue
        }
        seenTargets.add(target.toLowerCase())
        const rel = kind === 'vocab-synonym' ? 'similar in meaning to' : 'opposite in meaning to'
        stem = `Which of the following words is most ${rel} the word “${target}” as used in the passage?`
      } else {
        stem = line(q.stem)
        const sp = textProblem(stem)
        if (sp || stem.length < 20 || stem.length > 420) {
          drops.push(`rc q: stem ${sp || 'length'}`)
          continue
        }
        if (kind === 'not-true' && !/\b(?:not|false|incorrect|except|cannot|never|untrue)\b/i.test(stem)) {
          drops.push('rc not-true: stem lacks NOT')
          continue
        }
        const shape = rcQuestionShape(stem, opts.options, body)
        if (shape) {
          drops.push(shape)
          continue
        }
        if (seenStems.some((s) => jaccard(s, stem) >= 0.9)) {
          drops.push('rc q: near-duplicate stem')
          continue
        }
        seenStems.push(stem)
      }
      let options = opts.options
      let answer = q.correctIndex
      if (!options.some((o) => POSITIONAL_OPTION.test(o))) ({ options, answer } = shuffleOptions(ctx.buildRng, options, answer))
      questions.push({ topic: 'rc', stem, options, answer, explanation: ex.explanation })
    }
    if (questions.length === 0) {
      drops.push('rc passage: no usable questions')
      continue
    }
    groups.push({ stimulus: { directions: RC_DIRECTIONS, parts: [{ kind: 'text', paragraphs }] }, questions })
  }
  return { groups, drops }
}

const CLOZE_DIRECTIONS =
  'In the following passage, some of the words have been left out, each of which is indicated by a number. Find the suitable word from the options given against each number and fill up the blanks with appropriate words to make the passage meaningful.'

function buildCloze(parsed, ctx) {
  const groups = []
  const drops = []
  for (const p of asArray(parsed?.passages)) {
    const text = sanitize(p?.text)
    const normalised = text.replace(/\(\s*(\d{1,2})\s*\)\s*_{2,}/g, (_, n) => `(${Number(n)}) ______`)
    const paragraphs = normalised.split(/\n+/).map(line).filter(Boolean)
    const joined = paragraphs.join(' ')
    const bad = paragraphs.map((x) => textProblem(x, true)).find(Boolean)
    if (!paragraphs.length || bad) {
      drops.push(`cloze passage: ${bad || 'empty'}`)
      continue
    }
    const nums = [...joined.matchAll(/\((\d{1,2})\) ______/g)].map((m) => Number(m[1]))
    const n = nums.length
    if (n < 1 || n > 10 || nums.some((x, i) => x !== i + 1)) {
      drops.push('cloze: blank numbers not contiguous 1..N in order')
      continue
    }
    if (joined.replace(/\(\d{1,2}\) ______/g, '').includes('__')) {
      drops.push('cloze: malformed blank marker')
      continue
    }
    const wc = wordCount(joined.replace(/\(\d{1,2}\) ______/g, 'x'))
    if (wc < 90 || wc > 300) {
      drops.push(`cloze passage length ${wc}`)
      continue
    }
    const blanks = asArray(p?.blanks)
    const byN = new Map(blanks.filter((b) => b && typeof b === 'object').map((b, i) => [isInt(b.n) ? b.n : i + 1, b]))
    if (byN.size !== n || !nums.every((k) => byN.has(k))) {
      drops.push('cloze: blanks list does not match passage')
      continue
    }
    const questions = []
    let ok = true
    for (const k of nums) {
      const b = byN.get(k)
      const opts = readOptions(b.options, { maxWords: 3 })
      const ex = readExplanation(b.explanation, { shuffled: true })
      const problem = opts.problem || ex.problem || (!isInt(b.correctIndex) || b.correctIndex < 0 || b.correctIndex > 4 ? 'bad correctIndex' : '')
      if (problem) {
        drops.push(`cloze blank ${k}: ${problem}`)
        ok = false
        break
      }
      const shuffled = shuffleOptions(ctx.buildRng, opts.options, b.correctIndex)
      questions.push({ topic: 'cloze', stem: `Select the most appropriate word to fill blank (${k}).`, options: shuffled.options, answer: shuffled.answer, explanation: ex.explanation })
    }
    if (!ok) continue
    groups.push({ stimulus: { directions: CLOZE_DIRECTIONS, parts: [{ kind: 'text', paragraphs }] }, questions })
  }
  return { groups, drops }
}

const ED_DIRECTIONS =
  'Read each sentence to find out whether there is any grammatical error in it. The error, if any, will be in one part of the sentence. Select the part with the error as your answer. If there is no error, select “No error”.'
const ED_OPTIONS = ['(a)', '(b)', '(c)', '(d)', 'No error']

function buildErrorDetection(parsed, ctx) {
  const groups = []
  const drops = []
  const seen = new Set()
  for (const it of asArray(parsed?.items)) {
    const ex = readExplanation(it?.explanation, { shuffled: it?.variant === 'sentences' })
    if (ex.problem) {
      drops.push(`ed: ${ex.problem}`)
      continue
    }
    if (it?.variant === 'sentences') {
      const sentences = asArray(it.sentences).map(line)
      const problem = sentences.map((s) => textProblem(s)).find(Boolean)
      if (sentences.length !== 5 || problem) {
        drops.push(`ed sentences: ${problem || 'need 5'}`)
        continue
      }
      if (new Set(sentences.map(normKey)).size !== 5 || sentences.some((s) => wordCount(s) < 6 || wordCount(s) > 40)) {
        drops.push('ed sentences: duplicates or bad length')
        continue
      }
      if (!isInt(it.correctIndex) || it.correctIndex < 0 || it.correctIndex > 4) {
        drops.push('ed sentences: bad correctIndex')
        continue
      }
      const sh = shuffleOptions(ctx.buildRng, sentences, it.correctIndex)
      groups.push({ questions: [{ topic: 'error-detection', stem: 'Which of the following sentences is grammatically correct and meaningful?', options: sh.options, answer: sh.answer, explanation: ex.explanation }] })
      continue
    }
    const parts = asArray(it?.parts).map(line)
    const problem = parts.map((s) => textProblem(s)).find(Boolean)
    if (parts.length !== 4 || problem || parts.some((s) => !s)) {
      drops.push(`ed parts: ${problem || 'need 4 non-empty parts'}`)
      continue
    }
    if (parts.some((s) => /\([a-d]\)/i.test(s) || /[[\]]/.test(s))) {
      drops.push('ed parts: contains part labels or brackets')
      continue
    }
    const joinedSentence = parts.join(' ')
    const total = wordCount(joinedSentence)
    if (total < 12 || total > 60) {
      drops.push('ed parts: sentence length')
      continue
    }
    if (!/^[A-Z"\u201c\u2018]/.test(joinedSentence) || !/[.!?]["\u201d]?$/.test(joinedSentence) || parts.some((x) => wordCount(x) < 2)) {
      drops.push('ed parts: not one complete sentence (capital start, closing full stop, parts of 2+ words)')
      continue
    }
    const err = nullish(it.errorPartIndex)
    if (!(err === null || (isInt(err) && err >= 0 && err <= 3))) {
      drops.push('ed parts: bad errorPartIndex')
      continue
    }
    const key = normKey(parts.join(' '))
    if (seen.has(key)) {
      drops.push('ed parts: duplicate sentence')
      continue
    }
    seen.add(key)
    const stem = `${ED_DIRECTIONS}\n\n(a) ${parts[0]} (b) ${parts[1]} (c) ${parts[2]} (d) ${parts[3]}`
    groups.push({ questions: [{ topic: 'error-detection', stem, options: ED_OPTIONS.slice(), answer: err === null ? 4 : err, explanation: ex.explanation }] })
  }
  return { groups, drops }
}

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F']
const POSITION_WORD = { 1: 'FIRST', 2: 'SECOND', 3: 'THIRD', 4: 'FOURTH', 5: 'FIFTH', 6: 'SIXTH' }

/** Distinct permutations of `base` (a string of distinct letters), each different from base, built by plausible slips. */
function distractorOrders(rng, base, need) {
  const out = new Set()
  const arr = base.split('')
  const n = arr.length
  let guard = 0
  while (out.size < need && guard++ < 400) {
    const c = arr.slice()
    const mode = rng.int(0, 3)
    if (mode === 0) {
      const i = rng.int(0, n - 2)
      ;[c[i], c[i + 1]] = [c[i + 1], c[i]]
    } else if (mode === 1) {
      const i = rng.int(0, n - 1)
      let j = rng.int(0, n - 1)
      if (j === i) j = (i + 1) % n
      ;[c[i], c[j]] = [c[j], c[i]]
    } else if (mode === 2) {
      const i = rng.int(0, n - 1)
      const [x] = c.splice(i, 1)
      c.splice(rng.int(0, n - 1), 0, x)
    } else {
      const i = rng.int(0, n - 3)
      const tail = c.splice(i + 1, 2).reverse()
      c.splice(i + 1, 0, ...tail)
    }
    const s = c.join('')
    if (s !== base) out.add(s)
  }
  // Fallback: random shuffles (always enough distinct permutations exist for n >= 5).
  while (out.size < need) {
    const s = rng.shuffle(arr).join('')
    if (s !== base) out.add(s)
  }
  return [...out].slice(0, need)
}

const firstWords = (t, n) => t.split(/\s+/).slice(0, n).join(' ')
/** "The coherent order is ECBFAD: "Banks have..." -> "This shift..." ..." plus the asked position, built in code. */
function paraJumbleExplanation(order, sentences, stem) {
  const flow = sentences.map((x) => `"${firstWords(x, 5)}..."`).join(' \u2192 ')
  const m = /should be the (\w+) sentence/.exec(stem)
  const pos = m ? Number(Object.keys(POSITION_WORD).find((k) => POSITION_WORD[k] === m[1])) : 0
  return `The coherent order is ${order}: ${flow}.${pos ? ` The ${POSITION_WORD[pos]} sentence is ${order[pos - 1]}.` : ''}`
}

function buildParaJumble(parsed, ctx) {
  const groups = []
  const drops = []
  const seen = new Set()
  const rng = ctx.buildRng
  for (const it of asArray(parsed?.items ?? parsed?.paragraphs)) {
    const sentences = asArray(it?.sentences).map((s) => line(s).replace(/^(?:[A-F]|\d)[.):]\s+/, ''))
    const ex = readExplanation(it?.explanation)
    const problem = sentences.map((s) => textProblem(s)).find(Boolean) || ex.problem
    const n = sentences.length
    if (n < 5 || n > 6 || problem) {
      drops.push(`pj: ${problem || 'need 5 or 6 sentences'}`)
      continue
    }
    if (new Set(sentences.map(normKey)).size !== n || sentences.some((s) => wordCount(s) < 5 || wordCount(s) > 45 || !/[.!?"”]$/.test(s))) {
      drops.push('pj: duplicate, short/long or unterminated sentence')
      continue
    }
    if (/^(?:this|such|these|those|however|moreover|but|hence|thus|therefore|he|she|they)\b/i.test(sentences[0])) {
      drops.push('pj: opener needs an antecedent')
      continue
    }
    const key = normKey(sentences.join(' '))
    if (seen.has(key)) {
      drops.push('pj: duplicate paragraph')
      continue
    }
    seen.add(key)
    // display[k] = index (in correct order) of the sentence shown with label LETTERS[k]
    let display = rng.shuffle(sentences.map((_, i) => i))
    for (let t = 0; t < 30 && display.every((v, i) => v === i); t++) display = rng.shuffle(display)
    const labelOf = (idx) => LETTERS[display.indexOf(idx)]
    const correctOrder = sentences.map((_, i) => labelOf(i)).join('')
    const lettersUsed = LETTERS.slice(0, n)
    const list = display.map((idx, k) => `${LETTERS[k]}. ${sentences[idx]}`).join('\n')
    const names = lettersUsed.slice(0, -1).join(', ') + ' and ' + lettersUsed[n - 1]
    let stem
    let options
    let answer
    if (rng.chance(0.7)) {
      const distractors = distractorOrders(rng, correctOrder, 4)
      const sh = shuffleOptions(rng, [correctOrder, ...distractors], 0)
      options = sh.options
      answer = sh.answer
      stem = `Rearrange the following sentences ${names} to form a meaningful and coherent paragraph, and choose the option that gives the correct order.\n\n${list}`
    } else {
      const pos = rng.pick(n === 5 ? [1, 2, 3, 4, 5] : [1, 3, 4, 5, 6])
      const correctLetter = correctOrder[pos - 1]
      const others = rng.shuffle(lettersUsed.filter((l) => l !== correctLetter)).slice(0, 4)
      const sh = shuffleOptions(rng, [correctLetter, ...others], 0)
      options = sh.options
      answer = sh.answer
      stem = `The sentences ${names} given below are jumbled. Rearrange them to form a meaningful and coherent paragraph, and then decide which sentence should be the ${POSITION_WORD[pos]} sentence of the paragraph.\n\n${list}`
    }
    groups.push({ questions: [{ topic: 'para-jumble', stem, options, answer, explanation: paraJumbleExplanation(correctOrder, sentences, stem) }] })
  }
  return { groups, drops }
}

const BLANK_RUN = /(?:\(\s*(?:[AB]|[12]|i{1,2})\s*\)\s*)?_{2,}/g
const FILLER_SINGLE_STEM = 'Choose the word that, when filled in the blank, makes the sentence meaningful and grammatically correct.'
const FILLER_DOUBLE_STEM = 'Choose the pair of words that, when filled in the blanks (A) and (B) in that order, makes the sentence meaningful and grammatically correct.'

function buildFillers(parsed, ctx) {
  const groups = []
  const drops = []
  const seen = new Set()
  for (const it of asArray(parsed?.items)) {
    const type = it?.type === 'double' ? 'double' : it?.type === 'single' ? 'single' : ''
    const raw = line(it?.sentence)
    const sp = textProblem(raw, true)
    const ex = readExplanation(it?.explanation, { shuffled: true })
    if (!type || sp || ex.problem) {
      drops.push(`fillers: ${!type ? 'bad type' : sp || ex.problem}`)
      continue
    }
    const runs = raw.match(BLANK_RUN) || []
    if (runs.length !== (type === 'double' ? 2 : 1)) {
      drops.push('fillers: blank count does not match type')
      continue
    }
    let k = 0
    const sentence = raw.replace(BLANK_RUN, () => (type === 'double' ? `(${k++ === 0 ? 'A' : 'B'}) ______` : '______'))
    if (wordCount(sentence.replace(/\([AB]\) ______|______/g, 'x')) < 8 || sentence.length > 400) {
      drops.push('fillers: sentence too short/long')
      continue
    }
    if (!isInt(it.correctIndex) || it.correctIndex < 0 || it.correctIndex > 4) {
      drops.push('fillers: bad correctIndex')
      continue
    }
    let options
    if (type === 'single') {
      const o = readOptions(it.options, { maxWords: 3 })
      if (o.problem || o.options.some((x) => x.includes(','))) {
        drops.push(`fillers single: ${o.problem || 'comma in option'}`)
        continue
      }
      options = o.options
    } else {
      const pairs = asArray(it.options).map((p) => (Array.isArray(p) && p.length === 2 ? p.map(line) : null))
      if (pairs.length !== 5 || pairs.some((p) => !p || p.some((w) => !w || wordCount(w) > 3 || w.includes(',') || textProblem(w)))) {
        drops.push('fillers double: options must be 5 pairs of words')
        continue
      }
      options = pairs.map((p) => `${p[0]}, ${p[1]}`)
      if (new Set(options.map(normKey)).size !== 5 || pairs.some((p) => normKey(p[0]) === normKey(p[1]))) {
        drops.push('fillers double: duplicate pair or repeated word')
        continue
      }
    }
    const key = normKey(sentence)
    if (seen.has(key)) {
      drops.push('fillers: duplicate sentence')
      continue
    }
    seen.add(key)
    const sh = shuffleOptions(ctx.buildRng, options, it.correctIndex)
    groups.push({ questions: [{ topic: 'fillers', stem: `${type === 'double' ? FILLER_DOUBLE_STEM : FILLER_SINGLE_STEM}\n\n${sentence}`, options: sh.options, answer: sh.answer, explanation: ex.explanation }] })
  }
  return { groups, drops }
}

const WS_DIRECTIONS =
  'In the following sentence, four words are marked (1), (2), (3) and (4). Two of the marked words may need to be interchanged to make the sentence meaningful and grammatically correct. Select the option that gives the numbers of the two words to be interchanged. If no interchange is required, select “No interchange required”.'
const NO_INTERCHANGE = 'No interchange required'
const WS_PAIRS = [
  [0, 1],
  [0, 2],
  [0, 3],
  [1, 2],
  [1, 3],
  [2, 3],
]

/** "marked" may be token indices or the marked words themselves (easier for a model to get right). */
function resolveMarked(tokens, raw) {
  if (raw.every(isInt)) return raw
  const out = []
  let from = 1
  for (const w of raw) {
    if (typeof w !== 'string') return []
    const target = w.trim().toLowerCase()
    const idx = tokens.findIndex((t, i) => i >= from && t.toLowerCase() === target)
    if (idx < 0) return []
    out.push(idx)
    from = idx + 1
  }
  return out
}

function buildWordSwap(parsed, ctx) {
  const groups = []
  const drops = []
  const seen = new Set()
  const rng = ctx.buildRng
  for (const it of asArray(parsed?.items)) {
    const tokens = asArray(it?.tokens).map((t) => line(t))
    const marked = resolveMarked(tokens, asArray(it?.marked))
    const ex = readExplanation(it?.explanation)
    const problem = ex.problem || tokens.map((t) => textProblem(t)).find(Boolean)
    if (problem || tokens.length < 8 || tokens.length > 42 || tokens.some((t) => t.includes(' '))) {
      drops.push(`ws: ${problem || 'bad tokens'}`)
      continue
    }
    if (marked.length !== 4 || !marked.every(isInt) || marked.some((m, i) => m < 1 || m >= tokens.length || (i > 0 && m <= marked[i - 1]))) {
      drops.push('ws: marked must be 4 increasing token indices (not the first token)')
      continue
    }
    if (marked.some((m) => !/^[a-z][a-z'-]{1,20}$/.test(tokens[m]))) {
      drops.push('ws: marked tokens must be plain lowercase words')
      continue
    }
    if (new Set(marked.map((m) => tokens[m])).size !== 4) {
      drops.push('ws: marked words must be distinct')
      continue
    }
    const swap = it.swap
    let pair = null
    if (swap !== null && swap !== undefined) {
      if (!Array.isArray(swap) || swap.length !== 2 || !swap.every((x) => isInt(x) && x >= 0 && x <= 3) || swap[0] === swap[1]) {
        drops.push('ws: bad swap')
        continue
      }
      pair = [Math.min(...swap), Math.max(...swap)]
    }
    const shown = tokens.slice()
    if (pair) {
      const a = marked[pair[0]]
      const b = marked[pair[1]]
      ;[shown[a], shown[b]] = [shown[b], shown[a]]
    }
    const sentence = shown.map((t, i) => (marked.includes(i) ? `(${marked.indexOf(i) + 1})${t}` : t)).join(' ')
    const correct = tokens.join(' ')
    const key = normKey(correct)
    if (seen.has(key)) {
      drops.push('ws: duplicate sentence')
      continue
    }
    seen.add(key)
    const pairText = (p) => `(${p[0] + 1}) and (${p[1] + 1})`
    const others = rng.shuffle(WS_PAIRS.filter((p) => !(pair && p[0] === pair[0] && p[1] === pair[1])))
    const chosen = pair ? rng.shuffle([pair, ...others.slice(0, 3)]) : others.slice(0, 4)
    const options = [...chosen.map(pairText), NO_INTERCHANGE]
    const answer = pair ? chosen.findIndex((p) => p[0] === pair[0] && p[1] === pair[1]) : 4
    // Built in code: model explanations of swaps were often garbled or contradicted the key.
    const explanation = pair ? `Interchanging (${pair[0] + 1}) "${shown[marked[pair[0]]]}" and (${pair[1] + 1}) "${shown[marked[pair[1]]]}" gives: ${correct}` : `The sentence is already correct as written: ${correct}`
    groups.push({ questions: [{ topic: 'word-swap', stem: `${WS_DIRECTIONS}\n\n${sentence}`, options, answer, explanation: explanation.slice(0, 900) }] })
  }
  return { groups, drops }
}

const PR_DIRECTIONS =
  'In the following sentence, a part is given in CAPITAL letters. Choose the option that replaces it so that the sentence becomes grammatically correct and meaningful. If the sentence is correct as it is, select “No correction required”.'
const PU_DIRECTIONS = 'Choose the phrase that, when filled in the blank, makes the sentence meaningful and grammatically correct.'
const NO_CORRECTION = 'No correction required'

function buildPhraseReplacement(parsed, ctx) {
  const groups = []
  const drops = []
  const seen = new Set()
  for (const it of asArray(parsed?.items)) {
    const ex = readExplanation(it?.explanation, { shuffled: true })
    if (ex.problem) {
      drops.push(`pr: ${ex.problem}`)
      continue
    }
    if (it?.variant === 'usage') {
      const sentence = line(it.sentence)
      const sp = textProblem(sentence, true)
      const o = readOptions(it.options, { maxWords: 5 })
      if (sp || o.problem || (sentence.match(/_{2,}/g) || []).length !== 1 || !isInt(it.correctIndex) || it.correctIndex < 0 || it.correctIndex > 4) {
        drops.push(`pr usage: ${sp || o.problem || 'need one blank and a valid key'}`)
        continue
      }
      const clean = sentence.replace(/_{2,}/, '______')
      const key = normKey(clean)
      if (seen.has(key)) {
        drops.push('pr usage: duplicate')
        continue
      }
      seen.add(key)
      const sh = shuffleOptions(ctx.buildRng, o.options, it.correctIndex)
      groups.push({ questions: [{ topic: 'phrase-replacement', stem: `${PU_DIRECTIONS}\n\n${clean}`, options: sh.options, answer: sh.answer, explanation: ex.explanation }] })
      continue
    }
    const before = line(it?.before)
    const phrase = line(it?.phrase)
    const after = line(it?.after)
    const problem = [before, phrase, after].map((s, i) => (s || i !== 0 ? textProblem(s || 'x') : '')).find(Boolean)
    const o = asArray(it?.options)
    const options = o.map(line)
    if (problem || !phrase || !after || wordCount(phrase) < 1 || wordCount(phrase) > 9) {
      drops.push(`pr replace: ${problem || 'bad before/phrase/after'}`)
      continue
    }
    if (options.length !== 4 || options.some((x) => textProblem(x) || wordCount(x) > 10) || new Set(options.map(normKey)).size !== 4) {
      drops.push('pr replace: need 4 distinct options')
      continue
    }
    if (options.some((x) => normKey(x) === normKey(phrase) || normKey(x) === normKey(NO_CORRECTION))) {
      drops.push('pr replace: option equals original or "No correction"')
      continue
    }
    const ci = nullish(it.correctIndex)
    if (!(ci === null || (isInt(ci) && ci >= 0 && ci <= 3))) {
      drops.push('pr replace: bad correctIndex')
      continue
    }
    const sentence = [before, phrase.toUpperCase(), after].filter(Boolean).reduce((acc, part) => (acc ? acc + (/^[,.;:!?)]/.test(part) ? '' : ' ') + part : part), '')
    const key = normKey(sentence)
    if (seen.has(key)) {
      drops.push('pr replace: duplicate')
      continue
    }
    seen.add(key)
    const sh = shuffleOptions(ctx.buildRng, options, ci === null ? 4 : ci)
    groups.push({
      questions: [{ topic: 'phrase-replacement', stem: `${PR_DIRECTIONS}\n\n${sentence}`, options: [...sh.options, NO_CORRECTION], answer: ci === null ? 4 : sh.answer, explanation: ex.explanation }],
    })
  }
  return { groups, drops }
}

const MC_DIRECTIONS =
  'Match each sentence beginning in Column I with its ending in Column II so that four meaningful and grammatically correct sentences are formed. Select the option that gives the correct matching.'

function permutations(arr) {
  if (arr.length <= 1) return [arr]
  return arr.flatMap((x, i) => permutations([...arr.slice(0, i), ...arr.slice(i + 1)]).map((p) => [x, ...p]))
}
const ALL_MATCHINGS = permutations([0, 1, 2, 3])

function buildMatchColumn(parsed, ctx) {
  const groups = []
  const drops = []
  const seen = new Set()
  const rng = ctx.buildRng
  for (const it of asArray(parsed?.items)) {
    const pairs = asArray(it?.pairs).map((p) => ({ begin: line(p?.begin).replace(/[.]$/, ''), end: line(p?.end) }))
    const ex = readExplanation(it?.explanation)
    const problem = ex.problem || pairs.map((p) => textProblem(p.begin) || textProblem(p.end)).find(Boolean)
    if (pairs.length !== 4 || problem) {
      drops.push(`mc: ${problem || 'need 4 pairs'}`)
      continue
    }
    if (new Set(pairs.map((p) => normKey(p.begin))).size !== 4 || new Set(pairs.map((p) => normKey(p.end))).size !== 4) {
      drops.push('mc: duplicate beginnings or endings')
      continue
    }
    if (pairs.some((p) => wordCount(p.begin) < 3 || wordCount(p.begin) > 18 || wordCount(p.end) < 2 || wordCount(p.end) > 20)) {
      drops.push('mc: half-sentence length')
      continue
    }
    if (new Set(pairs.map((p) => normKey(p.begin).split(' ').slice(0, 2).join(' '))).size < 2) {
      drops.push('mc: beginnings too similar')
      continue
    }
    const key = normKey(pairs.map((p) => p.begin).join(' '))
    if (seen.has(key)) {
      drops.push('mc: duplicate')
      continue
    }
    seen.add(key)
    // Column II order: colOrder[k] = index of the pair whose ending sits at letter k.
    const colOrder = rng.shuffle([0, 1, 2, 3])
    const letterOfPair = (i) => LETTERS[colOrder.indexOf(i)]
    const fmt = (assign) => assign.map((letterIdx, i) => `${i + 1}-${LETTERS[letterIdx]}`).join(', ')
    const correct = [0, 1, 2, 3].map((i) => colOrder.indexOf(i))
    const wrong = rng.shuffle(ALL_MATCHINGS.filter((m) => m.some((v, i) => v !== correct[i]))).slice(0, 4)
    const sh = shuffleOptions(rng, [fmt(correct), ...wrong.map(fmt)], 0)
    const col1 = pairs.map((p, i) => `${i + 1}. ${p.begin}`).join('\n')
    const col2 = colOrder.map((pi, k) => `${LETTERS[k]}. ${pairs[pi].end}`).join('\n')
    groups.push({
      questions: [{ topic: 'match-column', stem: `${MC_DIRECTIONS}\n\nColumn I\n${col1}\n\nColumn II\n${col2}`, options: sh.options, answer: sh.answer, explanation: `Correct matching: ${pairs.map((pr, i) => `${i + 1}-${letterOfPair(i)}: ${pr.begin} ${pr.end}`).join(' | ')}`.slice(0, 1200) }],
    })
  }
  return { groups, drops }
}

const TOPIC_DEFS = {
  rc: { prompt: rcPrompt, build: buildRc },
  cloze: { prompt: clozePrompt, build: buildCloze },
  'error-detection': { prompt: edPrompt, build: buildErrorDetection },
  'para-jumble': { prompt: pjPrompt, build: buildParaJumble },
  fillers: { prompt: fillersPrompt, build: buildFillers },
  'word-swap': { prompt: wsPrompt, build: buildWordSwap },
  'phrase-replacement': { prompt: prPrompt, build: buildPhraseReplacement },
  'match-column': { prompt: mcPrompt, build: buildMatchColumn },
}

// ---------------------------------------------------------------------------------------------------
// Solve prompt + parsing
// ---------------------------------------------------------------------------------------------------

const SOLVE_RULES = {
  rc: 'Reading comprehension: use ONLY the passage. An option is acceptable only if it is fully supported by the passage and correctly answers this question (for a "NOT true" question: only options the passage contradicts or does not support). For vocabulary-in-context decide the meaning from that sentence.',
  cloze: 'Cloze: put each option into the blank; an option is acceptable only if the sentence is then fully grammatical, the collocation natural and the meaning right in the passage.',
  'error-detection': 'Error detection: for each part (a)-(d) judge whether it contains a real grammatical error (agreement, tense, preposition, article, pronoun, parallelism, comparison, modifiers). A part option is acceptable only if that part really has an error; "No error" only if none of the four parts does. If the sentence is unnatural or a fragment even apart from any intended error, set ambiguous. For "which sentence is correct" items only fully correct sentences are acceptable.',
  'para-jumble': 'Para jumble: work out the coherent order yourself FIRST (opening sentence with no antecedent, pronoun and connector dependencies, mandatory pairs, conclusion), then judge each option: acceptable only if that order (or that sentence in that position) gives a fully coherent paragraph.',
  fillers: 'Fillers: put each option (or pair, in order) into the blank(s); acceptable only if the sentence is grammatical, natural and meaningful. If several options all read well, ALL of them are acceptable.',
  'word-swap': 'Word swap: for each option interchange the named pair and read the resulting sentence: acceptable only if the sentence becomes correct and sensible; "No interchange required" only if the sentence as shown is already fine.',
  'phrase-replacement': 'Phrase replacement: substitute each option for the capitalised phrase (or into the blank): acceptable only if the whole sentence is then grammatical and natural; "No correction required" only if the original already is.',
  'match-column': 'Match the column: for each option check all four joined sentences: acceptable only if every pair is grammatical and meaningful.',
}

function buildSolvePrompt(items) {
  const passages = []
  const passageIdx = new Map()
  for (const it of items) {
    if (it.passage && !passageIdx.has(it.passage)) {
      passageIdx.set(it.passage, passages.length + 1)
      passages.push(it.passage)
    }
  }
  const topics = [...new Set(items.map((i) => i.topic))]
  const itemBlocks = items.map((it) => {
    const p = it.passage ? `P${passageIdx.get(it.passage)}` : 'none'
    const opts = it.options.map((o, i) => `${LETTERS[i]}) ${o}`).join('\n')
    return `### ITEM ${it.id}\nTopic: ${TOPIC_LABEL[it.topic] || it.topic}\nPassage: ${p}\nQuestion:\n${it.stem}\nOptions:\n${opts}`
  })
  return `You are an expert solver and quality checker for the English Language section of Indian bank PO and Clerk prelims. Solve each item independently, as a top-scoring candidate would. You are NOT given an answer key.

Task: mock-english / solve / items=${items.length}

For every item:
1. Judge EACH option on its own: would choosing it be fully correct (the sentence, blank, passage question, swap or matching is completely right and natural with it)? List the letters of every such option in "acceptable" (it may be empty, one letter or several). Be strict: an option that is merely passable, awkward, less natural or only partly right is NOT acceptable.
2. "answer" is your single best option letter (A-E); it must be in "acceptable" unless no option is acceptable.
3. Set "ambiguous": true ONLY if the item itself is faulty (unclear, ungrammatical outside the intended point, or needing outside knowledge). Several acceptable options are reported through "acceptable", not through "ambiguous".

Topic rules:
${topics.map((t) => `- ${SOLVE_RULES[t] || ''}`).join('\n')}

Respond with ONLY a JSON object (no markdown fences): {"results":[{"id":"<item id>","answer":"A","acceptable":["A"],"ambiguous":false}]} with exactly one entry per item, using the item ids given.
${passages.length ? `\nPASSAGES\n${passages.map((p, i) => `[P${i + 1}]\n${p}`).join('\n\n')}\n` : ''}
ITEMS
${itemBlocks.join('\n\n')}`
}

/** "acceptable" may be an array of letters or a string like "A, C"; returns sorted option indexes, or null if absent. */
function parseAcceptable(v) {
  if (v === undefined || v === null) return null
  const letters = Array.isArray(v) ? v.map((x) => String(x)).join('') : String(v)
  const set = new Set([...letters.toUpperCase()].filter((c) => 'ABCDE'.includes(c)).map((c) => 'ABCDE'.indexOf(c)))
  return [...set].sort()
}

function parseSolveResults(parsed, items) {
  const raw = asArray(parsed?.results)
  const byId = new Map(raw.filter((r) => r && (typeof r.id === 'string' || typeof r.id === 'number')).map((r) => [String(r.id), r]))
  return items.map((it) => {
    const r = byId.get(it.id)
    const letter = typeof r?.answer === 'string' ? r.answer.trim().toUpperCase().replace(/[^A-E]/g, '') : ''
    const idx = letter.length === 1 ? 'ABCDE'.indexOf(letter) : -1
    return {
      id: it.id,
      answer: idx >= 0 ? idx : null,
      acceptable: parseAcceptable(r?.acceptable),
      ambiguous: r?.ambiguous === true || r?.ambiguous === 'true' || r === undefined || idx < 0,
    }
  })
}

// ---------------------------------------------------------------------------------------------------
// Gemini plumbing
// ---------------------------------------------------------------------------------------------------

function extractText(data) {
  const cand = data?.candidates?.[0]
  const parts = cand?.content?.parts
  if (!Array.isArray(parts)) return ''
  return parts
    .filter((p) => p && typeof p.text === 'string' && !p.thought)
    .map((p) => p.text)
    .join('')
    .trim()
}

/** Parses JSON, tolerating markdown fences or leading/trailing chatter. Returns undefined on failure. */
function parseJsonLoose(text) {
  const stripped = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
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

// ---------------------------------------------------------------------------------------------------
// Providers, model chains and health
// ---------------------------------------------------------------------------------------------------

/** A provider is enabled only when its key env var is set on the server. Model ids are "provider/model"; a bare
 *  name means gemini. */
const PROVIDERS = {
  gemini: { keyEnv: 'GEMINI_API_KEY', kind: 'gemini' },
  groq: { keyEnv: 'GROQ_API_KEY', kind: 'openai', base: 'https://api.groq.com/openai/v1', defaultTokensPerMinute: 8000 },
  mistral: { keyEnv: 'MISTRAL_API_KEY', kind: 'openai', base: 'https://api.mistral.ai/v1' },
  openrouter: { keyEnv: 'OPENROUTER_API_KEY', kind: 'openai', base: 'https://openrouter.ai/api/v1' },
}

const DEFAULT_GENERATE_CHAIN = [
  'groq/openai/gpt-oss-120b',
  'gemini/gemini-3-flash-preview',
  'groq/openai/gpt-oss-20b',
  'mistral/mistral-small-latest',
  'gemini/gemini-3.1-flash-lite',
  'gemini/gemini-3.5-flash-lite',
]
const DEFAULT_SOLVE_CHAIN = [
  'gemini/gemini-3-flash-preview',
  'groq/openai/gpt-oss-120b',
  'mistral/mistral-large-latest',
  'groq/openai/gpt-oss-20b',
  'gemini/gemini-3.1-flash-lite',
]

const DAY_MS = 86400000
const providerEnabled = (name) => !!PROVIDERS[name] && !!process.env[PROVIDERS[name].keyEnv]
const anyProviderEnabled = () => Object.keys(PROVIDERS).some(providerEnabled)

/** "groq/openai/gpt-oss-120b" -> {provider:'groq', model:'openai/gpt-oss-120b', id}; "gemini-3-flash" -> gemini. */
function parseModelId(raw) {
  const t = String(raw).trim()
  const i = t.indexOf('/')
  if (i > 0) {
    const prov = t.slice(0, i).toLowerCase()
    if (PROVIDERS[prov]) return { provider: prov, model: t.slice(i + 1), id: `${prov}/${t.slice(i + 1)}` }
  }
  return { provider: 'gemini', model: t, id: `gemini/${t}` }
}
const providerOf = (id) => parseModelId(id).provider

const listEnv = (name) =>
  (process.env[name] || '')
    .split(',')
    .map((m) => m.trim())
    .filter(Boolean)

/** Ordered, enabled model ids for a role: GEMINI_MODEL forces one Gemini model; else the env chain; else the defaults. */
function modelChain(role) {
  const forced = modelOverride()
  const raw = forced ? [forced] : listEnv(role === 'generate' ? 'MOCK_ENGLISH_GENERATE_MODELS' : 'MOCK_ENGLISH_SOLVE_MODELS')
  const list = raw.length ? raw : role === 'generate' ? DEFAULT_GENERATE_CHAIN : DEFAULT_SOLVE_CHAIN
  const out = []
  for (const r of list) {
    const m = parseModelId(r)
    if (providerEnabled(m.provider) && !out.includes(m.id)) out.push(m.id)
  }
  return out
}

const cooldownScale = () => {
  const raw = process.env.MOCK_ENGLISH_COOLDOWN_SCALE
  if (raw === undefined || raw === '') return 1
  const n = Number(raw)
  return Number.isFinite(n) && n >= 0 ? n : 1
}

/** This instance's memory of failing models (best effort: serverless instances come and go). */
const serverHealth = new Map()
const serverCooling = (model, now) => {
  const e = serverHealth.get(model)
  return !!e && e.until > now
}
/** Token budgets observed from rate-limit headers: id -> {limit, remaining, resetAt}. */
const budgets = new Map()
/** Calls in flight on this instance: id -> {count, tokens(estimated)}. */
const inflight = new Map()
const maxBudgetWaitMs = () => Number(process.env.MOCK_ENGLISH_MAX_BUDGET_WAIT_MS) || 15000

const estimateTokens = (prompt, expectedCompletion) => Math.ceil(prompt.length / 3.5) + expectedCompletion
const isGptOss = (model) => /gpt-oss/i.test(model)

/** Sums "1h2m3.5s" / "4.38s" / "250ms" style durations. */
function parseDurationMs(str) {
  if (!str) return 0
  let ms = 0
  for (const m of String(str).matchAll(/(\d+(?:\.\d+)?)\s*(ms|d|h|m|s)/g)) {
    const v = Number(m[1])
    ms += m[2] === 'ms' ? v : m[2] === 's' ? v * 1000 : m[2] === 'm' ? v * 60000 : m[2] === 'h' ? v * 3600000 : v * DAY_MS
  }
  return ms
}

/** x-ratelimit-* headers (Groq style) -> {limitTokens, remainingTokens, resetMs, limitRequests, remainingRequests}. */
function parseRateHeaders(res) {
  const h = (n) => res?.headers?.get?.(n)
  const num = (v) => {
    const x = Number(v)
    return v !== null && v !== undefined && v !== '' && Number.isFinite(x) ? x : null
  }
  const out = {
    limitTokens: num(h('x-ratelimit-limit-tokens')),
    remainingTokens: num(h('x-ratelimit-remaining-tokens')),
    resetMs: parseDurationMs(h('x-ratelimit-reset-tokens')),
    limitRequests: num(h('x-ratelimit-limit-requests')),
    remainingRequests: num(h('x-ratelimit-remaining-requests')),
  }
  return out.limitTokens !== null || out.remainingTokens !== null ? out : null
}

function parseErrorBody(text) {
  try {
    const j = JSON.parse(text)
    if (!j || typeof j !== 'object') return null
    return j.error && typeof j.error === 'object' ? j.error : typeof j.message === 'string' ? j : null
  } catch {
    return null
  }
}

/** Pulls quotaId / quotaValue / retryDelay out of Gemini's error.details (QuotaFailure + RetryInfo). */
function quotaInfo(err, text, res) {
  let quotaId = ''
  let quotaValue = ''
  let retryDelayMs = 0
  for (const d of Array.isArray(err?.details) ? err.details : []) {
    const v = Array.isArray(d?.violations) ? d.violations[0] : null
    if (v) {
      quotaId = String(v.quotaId || quotaId)
      quotaValue = String(v.quotaValue ?? quotaValue)
    }
    const m = /^(\d+(?:\.\d+)?)s$/.exec(String(d?.retryDelay || ''))
    if (m) retryDelayMs = Math.max(retryDelayMs, Number(m[1]) * 1000)
  }
  if (!retryDelayMs) {
    const m = /"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/.exec(text || '')
    if (m) retryDelayMs = Number(m[1]) * 1000
  }
  const h = Number(res?.headers?.get?.('retry-after'))
  if (Number.isFinite(h) && h > 0) retryDelayMs = Math.max(retryDelayMs, h * 1000)
  return { quotaId, quotaValue, retryDelayMs: Math.min(retryDelayMs, 7 * DAY_MS) }
}

/** OpenAI-compatible 429s: "... on tokens per minute (TPM): Limit 8000, Used N, Requested M. Please try again in 4.2s."
 *  (TPM/RPM -> short cooldown; TPD/RPD or an exhausted-quota error -> daily class). */
function openaiRateLimit(err, text, res) {
  const msg = String(err?.message || text || '')
  const delayText = /try again in\s+((?:\d+(?:\.\d+)?\s*(?:ms|d|h|m|s)\s*)+)/i.exec(msg)
  let retryDelayMs = delayText ? parseDurationMs(delayText[1]) : 0
  const h = Number(res?.headers?.get?.('retry-after'))
  if (Number.isFinite(h) && h > 0) retryDelayMs = Math.max(retryDelayMs, h * 1000)
  const dim = /\((TPM|TPD|RPM|RPD)\)/.exec(msg)?.[1] || ''
  const limit = /Limit\s+(\d+)/i.exec(msg)?.[1] || ''
  const daily = /^(TPD|RPD)$/.test(dim) || /per day|insufficient_quota|exceeded your current quota/i.test(msg + ' ' + String(err?.code || err?.type || ''))
  return { dim, limit, retryDelayMs: Math.min(retryDelayMs, 7 * DAY_MS), daily }
}

/** Failure classes: unavailable (404, unusable for JSON mode ...), quota-day, rate-minute, overload (5xx), timeout,
 *  network, bad-output (the model answered but the reply was unusable: no cooldown). cooldownMs is the BASE cooldown. */
function classifyHttpFailure(kind, status, text, res) {
  const err = parseErrorBody(text)
  if (status === 404 || (status >= 400 && status < 500 && status !== 429 && status !== 400 && /no longer available|is not found|not supported for generatecontent|model_not_found/i.test(String(err?.message || text)))) {
    return { cls: 'unavailable', cooldownMs: DAY_MS }
  }
  if (status === 400 && /failed to generate json|json_validate_failed|failed_generation/i.test(text)) {
    // failed_generation:"" means the model ran out of output tokens while reasoning (retryable); a non-empty one means it
    // produced something that is not JSON, which a model that cannot do JSON mode does every time.
    if (/"failed_generation"\s*:\s*""/.test(text)) return { cls: 'bad-output', cooldownMs: 0, note: 'reasoning-exhausted' }
    return { cls: 'unavailable', cooldownMs: DAY_MS, note: 'json-mode-unusable' }
  }
  if (status === 429 && kind === 'openai') {
    const q = openaiRateLimit(err, text, res)
    const perDay = q.daily || q.retryDelayMs > 10 * 60 * 1000
    return perDay
      ? { cls: 'quota-day', cooldownMs: Math.min(q.retryDelayMs || DAY_MS, DAY_MS), quotaId: q.dim, quotaValue: q.limit, retryDelayMs: q.retryDelayMs }
      : { cls: 'rate-minute', cooldownMs: Math.min(q.retryDelayMs > 0 ? Math.max(q.retryDelayMs, 1000) : 10000, 90000), quotaId: q.dim, quotaValue: q.limit, retryDelayMs: q.retryDelayMs }
  }
  if (status === 429) {
    const q = quotaInfo(err, text, res)
    const perDay = /PerDay/i.test(q.quotaId) || q.retryDelayMs > 10 * 60 * 1000
    return perDay
      ? { cls: 'quota-day', cooldownMs: Math.min(q.retryDelayMs || DAY_MS, DAY_MS), quotaId: q.quotaId, quotaValue: q.quotaValue, retryDelayMs: q.retryDelayMs }
      : { cls: 'rate-minute', cooldownMs: Math.min(q.retryDelayMs || 60000, 90000), quotaId: q.quotaId, quotaValue: q.quotaValue, retryDelayMs: q.retryDelayMs }
  }
  if (status === 401 || status === 403) return { cls: 'unavailable', cooldownMs: 60 * 60 * 1000 }
  if (status === 402) return { cls: 'quota-day', cooldownMs: DAY_MS }
  if (status === 400) return { cls: 'bad-output', cooldownMs: 0 }
  return { cls: 'overload', cooldownMs: 45000 }
}

/** Cooldown to report (and enforce here, scaled) for a failed attempt; repeats of transient failures grow. */
function recordFailure(model, out, now) {
  let ms = out.cooldownMs || 0
  const entry = serverHealth.get(model)
  const transient = out.cls === 'overload' || out.cls === 'timeout' || out.cls === 'network'
  const fails = transient ? (entry?.fails || 0) + 1 : 0
  if (transient) ms = Math.min(45000 * 2 ** (fails - 1), Number(process.env.MOCK_ENGLISH_MAX_TRANSIENT_COOLDOWN_MS) || 10 * 60 * 1000)
  if (ms > 0) serverHealth.set(model, { until: now + ms * cooldownScale(), cls: out.cls, fails })
  return ms
}

const bad = (model, error) => ({ ok: false, model, status: 502, error, cls: 'bad-output', cooldownMs: 0 })

/** One Gemini call. `accept(parsed)` returns {ok:true,...payload} or {ok:false,error}. Never throws. */
async function callGemini(id, model, prompt, temperature, accept, timeoutMs) {
  const apiKey = process.env.GEMINI_API_KEY
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    let res
    try {
      res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: 'application/json', temperature },
        }),
        signal: controller.signal,
      })
    } catch (err) {
      const aborted = err && err.name === 'AbortError'
      return { ok: false, model: id, status: aborted ? 504 : 502, error: aborted ? 'Gemini took too long to respond.' : 'Could not reach Gemini.', cls: aborted ? 'timeout' : 'network', cooldownMs: 45000 }
    }
    if (!res.ok) {
      const detail = String(await res.text().catch(() => ''))
      const c = classifyHttpFailure('gemini', res.status, detail, res)
      const label = c.cls === 'quota-day' ? 'Gemini daily quota used up.' : res.status === 429 ? 'Gemini rate limit reached.' : `Gemini request failed (${res.status}).`
      return { ok: false, model: id, status: res.status === 429 ? 429 : res.status === 404 ? 404 : 502, error: label, detail: detail.slice(0, 300), ...c }
    }
    let data
    try {
      data = await res.json()
    } catch (err) {
      const aborted = err && err.name === 'AbortError'
      return aborted ? { ok: false, model: id, status: 504, error: 'Gemini took too long to respond.', cls: 'timeout', cooldownMs: 45000 } : bad(id, 'Gemini returned an unreadable response.')
    }
    const tokens = Number(data?.usageMetadata?.totalTokenCount) || 0
    if (data?.candidates?.[0]?.finishReason === 'MAX_TOKENS') return bad(id, 'Gemini output was cut off.')
    const text = extractText(data)
    if (!text) return bad(id, 'Gemini returned no content.')
    const parsed = parseJsonLoose(text)
    if (parsed === undefined || parsed === null || typeof parsed !== 'object') return bad(id, 'Gemini returned malformed JSON.')
    const accepted = accept(parsed)
    if (!accepted.ok) return { ...bad(id, accepted.error), unusable: true }
    return { ok: true, model: id, tokens, ...accepted }
  } finally {
    clearTimeout(timer)
  }
}

/** One OpenAI-compatible chat call (Groq, Mistral, OpenRouter). reasoning_effort is sent only for gpt-oss models. */
async function callOpenAICompat(providerName, id, model, prompt, temperature, accept, timeoutMs, opts) {
  const prov = PROVIDERS[providerName]
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  const label = providerName
  try {
    // gpt-oss models "think" before answering and that reasoning is spent from the same max_tokens allowance, so a
    // tight cap leaves nothing for the JSON (Groq then answers 400 json_validate_failed with an empty failed_generation).
    const sendOnce = async (effort, extraTokens) => {
      const reasoning = isGptOss(model) ? Math.max(0, (REASONING_ALLOWANCE[effort || 'low'] || 0) - REASONING_ALLOWANCE.low) : 0 // the 'low' allowance is already in opts.maxTokens
      const body = {
        model,
        messages: [{ role: 'user', content: prompt }],
        temperature,
        response_format: { type: 'json_object' },
        max_tokens: Math.min(MAX_COMPLETION_TOKENS, opts.maxTokens + reasoning + extraTokens),
      }
      if (isGptOss(model) && effort && providerName !== 'openrouter') body.reasoning_effort = effort
      return fetch(`${prov.base}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env[prov.keyEnv]}` },
        body: JSON.stringify(body),
        signal: controller.signal,
      })
    }
    let res
    try {
      res = await sendOnce(opts.effort, 0)
      if (res.status === 400 && isGptOss(model)) {
        // Empty failed_generation = the reasoning used the whole allowance, not a model that cannot do JSON mode:
        // retry once, immediately, with minimal reasoning and more room.
        const peek = await res.clone().text().catch(() => '')
        if (/"failed_generation"\s*:\s*""/.test(peek)) res = await sendOnce('low', 1500)
      }
    } catch (err) {
      const aborted = err && err.name === 'AbortError'
      return { ok: false, model: id, status: aborted ? 504 : 502, error: aborted ? `${label} took too long to respond.` : `Could not reach ${label}.`, cls: aborted ? 'timeout' : 'network', cooldownMs: 45000 }
    }
    const rate = parseRateHeaders(res)
    if (!res.ok) {
      const detail = String(await res.text().catch(() => ''))
      const c = classifyHttpFailure('openai', res.status, detail, res)
      const msg = c.cls === 'quota-day' ? `${label} daily limit used up.` : res.status === 429 ? `${label} rate limit reached.` : c.note === 'json-mode-unusable' ? `${model} cannot produce JSON mode output.` : `${label} request failed (${res.status}).`
      return { ok: false, model: id, status: res.status === 429 ? 429 : res.status === 404 ? 404 : 502, error: msg, detail: detail.slice(0, 300), rate, ...c }
    }
    let data
    try {
      data = await res.json()
    } catch (err) {
      const aborted = err && err.name === 'AbortError'
      return aborted ? { ok: false, model: id, status: 504, error: `${label} took too long to respond.`, cls: 'timeout', cooldownMs: 45000 } : { ...bad(id, `${label} returned an unreadable response.`), rate }
    }
    const tokens = Number(data?.usage?.total_tokens) || 0
    const choice = data?.choices?.[0]
    if (choice?.finish_reason === 'length') return { ...bad(id, `${label} output was cut off.`), rate, tokens }
    const content = typeof choice?.message?.content === 'string' ? choice.message.content.trim() : ''
    if (!content) return { ...bad(id, `${label} returned no content.`), rate, tokens }
    const parsed = parseJsonLoose(content)
    if (parsed === undefined || parsed === null || typeof parsed !== 'object') return { ...bad(id, `${label} returned malformed JSON.`), rate, tokens }
    const accepted = accept(parsed)
    if (!accepted.ok) return { ...bad(id, accepted.error), unusable: true, rate, tokens }
    return { ok: true, model: id, tokens, rate, ...accepted }
  } finally {
    clearTimeout(timer)
  }
}

function callProvider(id, prompt, temperature, accept, timeoutMs, opts) {
  const { provider, model } = parseModelId(id)
  return PROVIDERS[provider].kind === 'gemini' ? callGemini(id, model, prompt, temperature, accept, timeoutMs) : callOpenAICompat(provider, id, model, prompt, temperature, accept, timeoutMs, opts)
}

/** Remaining token budget for a model right now (server memory merged with what the client persisted), or null. */
function budgetState(id, now, clientBudgets) {
  const sources = [budgets.get(id), clientBudgets.get(id)].filter(Boolean)
  const live = sources.filter((x) => x.resetAt > now)
  if (live.length) {
    return { limit: Math.max(...live.map((x) => x.limit || 0)) || live[0].limit, remaining: Math.min(...live.map((x) => x.remaining)), resetAt: Math.max(...live.map((x) => x.resetAt)) }
  }
  if (sources.length && sources[0].limit) return { limit: sources[0].limit, remaining: sources[0].limit, resetAt: 0 }
  const def = PROVIDERS[providerOf(id)]?.defaultTokensPerMinute
  return def ? { limit: def, remaining: def, resetAt: 0 } : null
}

/** Whether a call costing `est` tokens fits the model's remaining budget (after calls already in flight). */
function fitInfo(id, est, now, clientBudgets) {
  const b = budgetState(id, now, clientBudgets)
  if (!b || !b.limit || est > b.limit) return { fits: true, waitMs: 0 }
  const used = inflight.get(id)?.tokens || 0
  if (est <= b.remaining - used) return { fits: true, waitMs: 0 }
  return { fits: false, waitMs: b.resetAt > now ? b.resetAt - now : 1500 }
}

/** Order the candidate models: solvers prefer another provider, then another model, then the same model; models that
 *  fit their token budget (and have < 2 calls in flight) come first, simultaneous calls are spread across providers
 *  (the client's `spread` hint = other calls in flight), and over-budget models go last. */
function orderCandidates(candidates, o) {
  let list = candidates.slice()
  if (o.kind === 'solve' && o.avoidId) {
    const ap = providerOf(o.avoidId)
    const rank = (id) => (providerOf(id) !== ap ? 0 : id !== o.avoidId ? 1 : 2)
    list = list
      .map((id, i) => ({ id, i, r: rank(id) }))
      .sort((x, y) => x.r - y.r || x.i - y.i)
      .map((x) => x.id)
  }
  const info = new Map(list.map((id) => [id, fitInfo(id, o.estFor(id), o.now, o.clientBudgets)]))
  if (o.kind === 'solve') {
    // Independence beats a free budget slot: within the same independence rank, models that fit come first, and a
    // preferred model that is merely over budget is waited for (see runChain) rather than replaced by the generator.
    const ap = o.avoidId ? providerOf(o.avoidId) : ''
    const rank = (id) => (!o.avoidId ? 0 : providerOf(id) !== ap ? 0 : id !== o.avoidId ? 1 : 2)
    const order = list
      .map((id, i) => ({ id, i, r: rank(id), f: info.get(id).fits ? 0 : 1, w: info.get(id).waitMs }))
      .sort((x, y) => x.r - y.r || x.f - y.f || x.w - y.w || x.i - y.i)
      .map((x) => x.id)
    return { order, info }
  }
  // Busy-ness only reorders generation; a solver's independence (other provider / model) matters more than a free slot.
  const busy = (id) => o.kind === 'generate' && (inflight.get(id)?.count || 0) >= 2
  let usable = list.filter((id) => info.get(id).fits && !busy(id))
  const busyList = list.filter((id) => info.get(id).fits && busy(id))
  const over = list.filter((id) => !info.get(id).fits).sort((x, y) => info.get(x).waitMs - info.get(y).waitMs)
  if (o.kind === 'generate' && o.spread > 0) {
    const provs = [...new Set(usable.map(providerOf))]
    if (provs.length > 1) {
      const pick = usable.find((id) => providerOf(id) === provs[o.spread % provs.length])
      if (pick) usable = [pick, ...usable.filter((id) => id !== pick)]
    }
  }
  return { order: [...usable, ...busyList, ...over], info }
}

/** Tries the chain in order, one model at a time: models in cooldown (the client's skipModels or this instance's own
 *  memory) are skipped, over-budget models are skipped (or waited for when the reset is near), and after any failure the
 *  next model starts immediately. Stops early when too little of the request deadline is left. */
async function runChain(chain, run, o) {
  const now0 = Date.now()
  const skipped = []
  const candidates = []
  for (const m of chain) {
    if (o.skip.has(m)) skipped.push({ model: m, by: 'client' })
    else if (serverCooling(m, now0)) skipped.push({ model: m, by: 'server' })
    else if (o.excludeProviders && o.excludeProviders.has(providerOf(m))) skipped.push({ model: m, by: 'excluded' })
    else candidates.push(m)
  }
  const { order } = orderCandidates(candidates, { kind: o.kind, avoidId: o.avoidId, spread: o.spread || 0, estFor: o.estFor, now: now0, clientBudgets: o.clientBudgets })
  const attempts = []
  const modelHealth = []
  const budgetUpdates = []
  let last = null
  let infra = false
  let retryAfterMs = 0
  for (const id of order) {
    const budgetMs = geminiTimeoutMs(o.kind, id)
    let remaining = o.deadlineAt - Date.now()
    if (attempts.length > 0 && remaining < Math.min(3000, budgetMs)) break
    // Over the model's token budget: re-check every few hundred ms (other replies refresh the numbers) and wait for
    // the reset only if it is near; otherwise skip the model and tell the client when it will have room again.
    // Re-check right now: earlier attempts in this loop took time and other requests may have claimed the budget since.
    let fi = fitInfo(id, o.estFor(id), Date.now(), o.clientBudgets)
    const waitStart = Date.now()
    let skippedForBudget = false
    while (!fi.fits) {
      const waitedSoFar = Date.now() - waitStart
      remaining = o.deadlineAt - Date.now()
      if (fi.waitMs + waitedSoFar > maxBudgetWaitMs() || remaining < fi.waitMs + Math.min(5000, budgetMs)) {
        skipped.push({ model: id, by: 'budget' })
        modelHealth.push({ model: id, cls: 'rate-minute', cooldownMs: Math.max(fi.waitMs, 1000) })
        infra = true
        skippedForBudget = true
        break
      }
      await new Promise((r) => setTimeout(r, Math.max(20, Math.min(fi.waitMs, 300))))
      fi = fitInfo(id, o.estFor(id), Date.now(), o.clientBudgets)
    }
    if (skippedForBudget) continue
    remaining = o.deadlineAt - Date.now()
    const timeoutMs = Math.max(Math.min(500, budgetMs), Math.min(budgetMs, remaining - 300))
    const slot = inflight.get(id) || { count: 0, tokens: 0 }
    const est = o.estFor(id)
    slot.count++
    slot.tokens += est
    inflight.set(id, slot)
    const t0 = Date.now()
    let out
    try {
      out = await run(id, timeoutMs, { effort: o.kind === 'solve' ? (id === o.avoidId ? 'medium' : 'low') : 'low' })
    } finally {
      slot.count--
      slot.tokens -= est
    }
    attempts.push({ model: id, status: out.ok ? 200 : out.status, ms: Date.now() - t0, class: out.ok ? 'ok' : out.cls, tokens: out.tokens || 0 })
    if (out.rate && out.rate.limitTokens) {
      const now = Date.now()
      const remainingTokens = out.rate.remainingTokens ?? out.rate.limitTokens
      budgets.set(id, { limit: out.rate.limitTokens, remaining: remainingTokens, resetAt: now + (out.rate.resetMs || 0) })
      budgetUpdates.push({ model: id, limit: out.rate.limitTokens, remaining: remainingTokens, resetMs: out.rate.resetMs || 0 })
    }
    if (out.ok) {
      serverHealth.delete(id)
      modelHealth.push({ model: id, cls: 'ok' })
      const independence = !o.avoidId ? 'unknown' : providerOf(id) !== providerOf(o.avoidId) ? 'provider' : id !== o.avoidId ? 'model' : 'same'
      return { ...out, attempts, modelHealth, budgets: budgetUpdates, chain, skipped, independence }
    }
    last = out
    if (out.cls !== 'bad-output') {
      infra = true
      const cooldownMs = recordFailure(id, out, Date.now())
      modelHealth.push({ model: id, cls: out.cls, cooldownMs, quotaId: out.quotaId, quotaValue: out.quotaValue, retryDelayMs: out.retryDelayMs })
    }
    retryAfterMs = Math.max(retryAfterMs, out.retryDelayMs || 0)
  }
  const allBadOutput = last && !infra
  return {
    ok: false,
    // 404 is reserved for "the route does not exist" on the client, so an unavailable model is reported as 503.
    status: allBadOutput ? 502 : last ? (last.status === 404 ? 503 : last.status) : 503,
    error: last ? last.error : 'Every configured model is cooling down, over its token budget or unavailable.',
    detail: last?.detail,
    unusable: allBadOutput ? !!last.unusable : false,
    code: allBadOutput ? 'unusable' : !attempts.length && skipped.length > 0 && skipped.every((x) => x.by === 'excluded') ? 'no-alternative' : 'no-model',
    retryAfterMs,
    attempts,
    modelHealth,
    budgets: budgetUpdates,
    chain,
    skipped,
  }
}

// ---------------------------------------------------------------------------------------------------
// Request handling
// ---------------------------------------------------------------------------------------------------

function readBody(req) {
  const b = req.body
  if (b && typeof b === 'object' && !Buffer.isBuffer(b)) return b
  if (typeof b === 'string' || Buffer.isBuffer(b)) {
    try {
      const parsed = JSON.parse(String(b))
      return parsed && typeof parsed === 'object' ? parsed : null
    } catch {
      return null
    }
  }
  return null
}

function validateSolveItems(raw) {
  if (!Array.isArray(raw) || raw.length < 1) return { error: '"items" must be a non-empty array.' }
  if (raw.length > MAX_SOLVE_ITEMS) return { error: `At most ${MAX_SOLVE_ITEMS} items per solve call.` }
  const items = []
  const ids = new Set()
  for (let i = 0; i < raw.length; i++) {
    const r = raw[i]
    const where = `items[${i}]`
    if (!r || typeof r !== 'object') return { error: `${where} must be an object.` }
    if (typeof r.id !== 'string' || !r.id || r.id.length > 40 || ids.has(r.id)) return { error: `${where}.id must be a unique non-empty string (max 40 chars).` }
    ids.add(r.id)
    if (!TOPIC_IDS.includes(r.topic)) return { error: `${where}.topic is invalid.` }
    if (typeof r.stem !== 'string' || r.stem.trim().length < 4 || r.stem.length > 4000) return { error: `${where}.stem is invalid.` }
    if (r.passage !== undefined && (typeof r.passage !== 'string' || r.passage.length > 8000)) return { error: `${where}.passage is invalid.` }
    if (!Array.isArray(r.options) || r.options.length !== 5 || r.options.some((o) => typeof o !== 'string' || !o.trim() || o.length > 500)) return { error: `${where}.options must be 5 non-empty strings.` }
    items.push({
      id: r.id,
      topic: r.topic,
      passage: r.passage ? sanitize(r.passage).trim() : '',
      stem: sanitize(r.stem).trim(),
      options: r.options.map((o) => line(o)),
    })
  }
  return { items }
}

/** Expected completion size (tokens) of a generate call, used for budget pacing and max_tokens. */
function expectedGenerateTokens(topic, count) {
  if (topic === 'rc') return 750 + count * 150
  if (topic === 'cloze') return 320 + count * 110
  if (topic === 'para-jumble') return count * 280
  if (topic === 'match-column') return count * 230
  return count * 170
}
const expectedSolveTokens = (items) => items * 18 + 250
/** Extra max_tokens for gpt-oss models' hidden reasoning, by reasoning_effort. */
const REASONING_ALLOWANCE = { low: 700, medium: 1800, high: 3500 }
const MAX_COMPLETION_TOKENS = 8000
/** max_tokens for OpenAI-compatible calls: generous enough not to truncate, small enough not to reserve a whole TPM bucket. */
const maxTokensFor = (expected, id) => Math.min(7000, Math.max(600, Math.round(expected * 1.4) + (isGptOss(parseModelId(id).model) ? REASONING_ALLOWANCE.low : 0)))
/** Tokens a call reserves against the model's budget: prompt + max_tokens for OpenAI-compatible providers (what they count), prompt + expected completion otherwise. */
const estimateFor = (id, prompt, expected) => (PROVIDERS[providerOf(id)].kind === 'openai' ? Math.ceil(prompt.length / 3.5) + maxTokensFor(expected, id) : estimateTokens(prompt, expected))

const NO_ERROR_TOPICS = new Set(['error-detection', 'phrase-replacement', 'word-swap'])
const MANDATORY_ERRORS_NOTE = "- MANDATORY-ERRORS: every item in this batch must contain a real error that needs fixing; write NO 'no error', 'already correct' or 'no interchange' item.\n"

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader?.('Allow', 'POST')
    res.status(405).json({ error: 'Method not allowed' })
    return
  }
  // generous (a mock paper makes several calls) but finite: one visitor cannot drain the shared model quota
  if (!(await rateLimit(req, res, { name: 'mockEnglish', limit: 40 }))) return
  const body = readBody(req)
  if (!body) {
    res.status(400).json({ error: 'Request body must be a JSON object.' })
    return
  }
  if (body.action === 'resetHealth' && process.env.MOCK_ENGLISH_ALLOW_RESET === '1') {
    serverHealth.clear()
    budgets.clear()
    inflight.clear()
    res.status(200).json({ ok: true })
    return
  }
  const action = body.action
  if (action !== 'generate' && action !== 'solve') {
    res.status(400).json({ error: '"action" must be "generate" or "solve".' })
    return
  }

  let job
  if (action === 'generate') {
    const { topic, difficulty } = body
    if (!TOPIC_IDS.includes(topic)) {
      res.status(400).json({ error: `"topic" must be one of: ${TOPIC_IDS.join(', ')}` })
      return
    }
    if (difficulty !== 'medium' && difficulty !== 'hard') {
      res.status(400).json({ error: '"difficulty" must be "medium" or "hard".' })
      return
    }
    const rawCount = typeof body.count === 'string' && /^\d+$/.test(body.count) ? Number(body.count) : body.count
    if (!isInt(rawCount) || rawCount < 1) {
      res.status(400).json({ error: '"count" must be a positive integer.' })
      return
    }
    const seed = body.seed
    if (seed !== undefined && !((typeof seed === 'number' && Number.isFinite(seed)) || (typeof seed === 'string' && seed.length > 0 && seed.length <= 64))) {
      res.status(400).json({ error: '"seed" must be a finite number or a string of at most 64 characters.' })
      return
    }
    const count = Math.min(rawCount, MAX_COUNT[topic])
    const seedNum = seed === undefined ? Math.floor(Math.random() * 0xffffffff) : hashSeed(seed)
    job = { action, topic, difficulty, count, seedNum, noError: body.noError !== false }
  } else {
    const v = validateSolveItems(body.items)
    if (v.error) {
      res.status(400).json({ error: v.error })
      return
    }
    if (body.avoidModel !== undefined && (typeof body.avoidModel !== 'string' || body.avoidModel.length > 80)) {
      res.status(400).json({ error: '"avoidModel" must be a string.' })
      return
    }
    const ex = body.excludeProviders
    if (ex !== undefined && (!Array.isArray(ex) || ex.length > 5 || ex.some((x) => typeof x !== 'string' || !PROVIDERS[x]))) {
      res.status(400).json({ error: '"excludeProviders" must be an array of provider names.' })
      return
    }
    job = { action, items: v.items, avoidModel: body.avoidModel, excludeProviders: new Set(ex || []) }
  }

  const skipRaw = body.skipModels
  if (skipRaw !== undefined && (!Array.isArray(skipRaw) || skipRaw.length > 20 || skipRaw.some((m) => typeof m !== 'string' || !m || m.length > 80))) {
    res.status(400).json({ error: '"skipModels" must be an array of at most 20 model names.' })
    return
  }
  const skip = new Set((skipRaw || []).map((m) => parseModelId(m).id))

  if (!anyProviderEnabled()) {
    res.status(500).json({ error: 'This feature is not available right now.' })
    return
  }
  const budgetsRaw = body.budgets
  const clientBudgets = new Map()
  if (budgetsRaw !== undefined) {
    if (!Array.isArray(budgetsRaw) || budgetsRaw.length > 20) {
      res.status(400).json({ error: '"budgets" must be an array of at most 20 entries.' })
      return
    }
    const nowB = Date.now()
    for (const e of budgetsRaw) {
      if (!e || typeof e.model !== 'string' || !Number.isFinite(e.remaining) || !Number.isFinite(e.limit) || !Number.isFinite(e.resetMs)) continue
      clientBudgets.set(e.model, { limit: e.limit, remaining: e.remaining, resetAt: nowB + Math.max(0, e.resetMs) })
    }
  }
  const spread = Number.isInteger(body.spread) && body.spread > 0 ? Math.min(body.spread, 8) : 0

  const startedAt = Date.now()
  const deadlineAt = startedAt + requestDeadlineMs()
  let outcome
  if (job.action === 'generate') {
    const def = TOPIC_DEFS[job.topic]
    const ctx = { difficulty: job.difficulty, count: job.count, rng: makeRng(job.seedNum), buildRng: makeRng(job.seedNum ^ 0x9e3779b9), noError: job.noError }
    const mandatory = job.noError === false && NO_ERROR_TOPICS.has(job.topic) ? MANDATORY_ERRORS_NOTE : ''
    const prompt = `${header(job.topic, job.difficulty, job.count, job.seedNum)}${mandatory}\n${def.prompt(ctx)}`
    const accept = (parsed) => {
      const built = def.build(parsed, ctx)
      sanitizeExplanations(job.topic, built.groups)
      fillExplanations(built.groups)
      return built.groups.length ? { ok: true, groups: built.groups, dropped: built.drops.slice(0, 25), droppedCount: built.drops.length } : { ok: false, error: `The model returned no usable ${TOPIC_LABEL[job.topic]} items.` }
    }
    const expected = expectedGenerateTokens(job.topic, job.count)
    outcome = await runChain(
      modelChain('generate'),
      (id, timeoutMs) => callProvider(id, prompt, GENERATE_TEMPERATURE, accept, timeoutMs, { effort: 'low', maxTokens: maxTokensFor(expected, id) }),
      { kind: 'generate', deadlineAt, skip, spread, estFor: (id) => estimateFor(id, prompt, expected), clientBudgets },
    )
    if (outcome.ok) {
      res.status(200).json({ groups: outcome.groups, meta: { model: outcome.model, topic: job.topic, difficulty: job.difficulty, requested: job.count, dropped: outcome.dropped, droppedCount: outcome.droppedCount, attempts: outcome.attempts, modelHealth: outcome.modelHealth, budgets: outcome.budgets, chain: outcome.chain, skipped: outcome.skipped, ms: Date.now() - startedAt } })
      return
    }
  } else {
    const prompt = buildSolvePrompt(job.items)
    const accept = (parsed) => {
      const results = parseSolveResults(parsed, job.items)
      return results.some((r) => r.answer !== null) ? { ok: true, results } : { ok: false, error: 'The solver returned no usable answers.' }
    }
    const expected = expectedSolveTokens(job.items.length)
    outcome = await runChain(
      modelChain('solve'),
      (id, timeoutMs, ro) => callProvider(id, prompt, SOLVE_TEMPERATURE, accept, timeoutMs, { effort: ro.effort, maxTokens: maxTokensFor(expected, id) }),
      { kind: 'solve', deadlineAt, skip, excludeProviders: job.excludeProviders, avoidId: job.avoidModel ? parseModelId(job.avoidModel).id : '', estFor: (id) => estimateFor(id, prompt, expected), clientBudgets },
    )
    if (outcome.ok) {
      res.status(200).json({ results: outcome.results, model: outcome.model, meta: { attempts: outcome.attempts, modelHealth: outcome.modelHealth, budgets: outcome.budgets, chain: outcome.chain, skipped: outcome.skipped, independence: outcome.independence, ms: Date.now() - startedAt } })
      return
    }
  }

  const { status, error, detail, retryAfterMs, attempts, unusable, code, modelHealth, chain, skipped, budgets: budgetUpdates } = outcome
  const payload = { error, code, chain, attempts, skipped, modelHealth, budgets: budgetUpdates, ms: Date.now() - startedAt }
  // upstream detail stays in the server log; the browser only gets a generic message
  if (detail) console.error(`[mockEnglish] ${code || status}: ${String(detail).slice(0, 300)}`)
  // The model answered but nothing in it passed the checks: a quality problem, not an outage.
  if (unusable) payload.unusable = true
  if (status === 429 && retryAfterMs > 0) {
    payload.retryAfterMs = retryAfterMs
    res.setHeader?.('Retry-After', String(Math.ceil(retryAfterMs / 1000)))
  }
  res.status(status || 502).json(payload)
}

// ---------------------------------------------------------------------------------------------------
// Pure builders for curated content (used by scripts/build-english-seed.ts and the tests; the handler's
// generate path runs exactly the same builders on model output)
// ---------------------------------------------------------------------------------------------------

/** Builds the final client Groups from compact content of ONE topic ({passages} for rc/cloze, {items} otherwise).
 *  Deterministic for a given seed. Returns {groups, drops}: every rejected item is explained in `drops`. */
export function buildCompact(topic, parsed, { difficulty = 'medium', seed = 0, count = 1 } = {}) {
  const def = TOPIC_DEFS[topic]
  if (!def) throw new Error(`unknown topic "${topic}"`)
  const seedNum = hashSeed(seed)
  const ctx = { difficulty, count, rng: makeRng(seedNum), buildRng: makeRng(seedNum ^ 0x9e3779b9), noError: true }
  const built = def.build(parsed, ctx)
  sanitizeExplanations(topic, built.groups)
  fillExplanations(built.groups)
  return built
}

/** Builds ONE compact item (an rc/cloze passage, or a single question item). Returns {group, drops}; group is null if the
 *  item was rejected by the server validators. */
export function buildCompactItem(topic, item, opts = {}) {
  const parsed = topic === 'rc' || topic === 'cloze' ? { passages: [item] } : { items: [item] }
  const { groups, drops } = buildCompact(topic, parsed, opts)
  return { group: groups[0] ?? null, drops }
}

export const COMPACT_TOPICS = TOPIC_IDS
export { sanitize as sanitizeText, textProblem, rcQuestionShape, hashSeed }
