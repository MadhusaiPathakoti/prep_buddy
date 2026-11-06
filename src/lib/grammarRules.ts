import { GRAMMAR_RULES } from '../data/grammarRules'

export const GRAMMAR_GAME_ID = 'grammar-rules'

export const GRAMMAR_CATEGORIES = [
  'Pronouns',
  'Subject-Verb Agreement',
  'Verbs & Tenses',
  'Conditionals',
  'Nouns & Articles',
  'Adjectives & Adverbs',
  'Prepositions',
  'Conjunctions',
  'Redundancy & Word Usage',
  'Sentence Structure',
] as const

export type GrammarCategory = (typeof GRAMMAR_CATEGORIES)[number]

export interface GrammarRule {
  id: number
  title: string
  category: GrammarCategory
  /** One-line version of the rule, used as the "remember this" line. */
  summary: string
  explanation: string
  /** Incorrect sentences with their corrected form. */
  pairs: { wrong: string; right: string }[]
  /** Further correct example sentences. */
  correct: string[]
  uncertain?: boolean
}

export const RULES: GrammarRule[] = GRAMMAR_RULES

export function getRule(id: number): GrammarRule | undefined {
  return RULES.find((r) => r.id === id)
}

export function shuffle<T>(items: T[]): T[] {
  const a = [...items]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// ─── Progress / spaced repetition ────────────────────────────────────────────

const PROGRESS_KEY = 'prepbuddy:grammar-rules:progress'
const DAY_MS = 24 * 60 * 60 * 1000
/** Days until a rule resurfaces, indexed by its Leitner box (0 = missed → due now). */
const INTERVAL_DAYS = [0, 1, 3, 7, 14, 30]
const MAX_BOX = INTERVAL_DAYS.length - 1

export interface RuleProgress {
  box: number
  learned: boolean
  seen: number
  right: number
  wrong: number
  lastWrong: boolean
  lastSeen: number
  due: number
}

export type RuleStatus = 'new' | 'struggling' | 'learning' | 'strong' | 'mastered'

export const STATUS_LABEL: Record<RuleStatus, string> = {
  new: 'Not started',
  struggling: 'Needs work',
  learning: 'Learning',
  strong: 'Strong',
  mastered: 'Mastered',
}

/** Tailwind classes for each status, shared by the map tiles, legend and lists. */
export const STATUS_STYLE: Record<RuleStatus, string> = {
  new: 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 ring-slate-200 dark:ring-slate-600',
  struggling: 'bg-rose-100 dark:bg-rose-500/20 text-rose-700 dark:text-rose-300 ring-rose-300 dark:ring-rose-500/40',
  learning: 'bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300 ring-amber-300 dark:ring-amber-500/40',
  strong: 'bg-sky-100 dark:bg-sky-500/20 text-sky-700 dark:text-sky-300 ring-sky-300 dark:ring-sky-500/40',
  mastered: 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 ring-emerald-300 dark:ring-emerald-500/40',
}

export type ProgressMap = Record<number, RuleProgress>

export function loadProgress(): ProgressMap {
  try {
    const raw = localStorage.getItem(PROGRESS_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

function saveProgress(map: ProgressMap) {
  try {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(map))
  } catch {
    // localStorage unavailable — progress just won't persist
  }
}

function blank(): RuleProgress {
  return { box: 0, learned: false, seen: 0, right: 0, wrong: 0, lastWrong: false, lastSeen: 0, due: 0 }
}

/** Record one answer for a rule: right answers climb a box, a miss drops it back to "due now". */
export function recordAnswer(ruleId: number, wasCorrect: boolean) {
  const map = loadProgress()
  const p = { ...blank(), ...map[ruleId] }
  const now = Date.now()
  p.seen += 1
  p.lastSeen = now
  if (wasCorrect) {
    p.right += 1
    p.lastWrong = false
    p.box = Math.min(MAX_BOX, p.box + 1)
  } else {
    p.wrong += 1
    p.lastWrong = true
    p.box = 0
  }
  p.due = now + INTERVAL_DAYS[p.box] * DAY_MS
  map[ruleId] = p
  saveProgress(map)
}

/** Mark a rule as read-and-checked in Rule Lab: it enters the review cycle at box 1. */
export function markLearned(ruleId: number) {
  const map = loadProgress()
  const p = { ...blank(), ...map[ruleId] }
  const now = Date.now()
  p.learned = true
  p.lastWrong = false
  p.box = Math.max(p.box, 1)
  p.lastSeen = now
  p.due = now + INTERVAL_DAYS[p.box] * DAY_MS
  map[ruleId] = p
  saveProgress(map)
}

export function resetProgress() {
  try {
    localStorage.removeItem(PROGRESS_KEY)
  } catch {
    // ignore
  }
}

export function getStatus(p: RuleProgress | undefined): RuleStatus {
  if (!p || (p.seen === 0 && !p.learned)) return 'new'
  if (p.lastWrong) return 'struggling'
  if (p.box >= MAX_BOX) return 'mastered'
  if (p.box >= 3) return 'strong'
  return 'learning'
}

/** A rule is due for review once it has been started and its review date has passed. */
export function isDue(p: RuleProgress | undefined, now = Date.now()): boolean {
  if (!p || (p.seen === 0 && !p.learned)) return false
  return p.due <= now
}

export interface ProgressSummary {
  total: number
  byStatus: Record<RuleStatus, number>
  due: number
}

export function summarize(map: ProgressMap): ProgressSummary {
  const byStatus: Record<RuleStatus, number> = { new: 0, struggling: 0, learning: 0, strong: 0, mastered: 0 }
  let due = 0
  for (const r of RULES) {
    byStatus[getStatus(map[r.id])] += 1
    if (isDue(map[r.id])) due += 1
  }
  return { total: RULES.length, byStatus, due }
}

// ─── Question builders ───────────────────────────────────────────────────────

export interface SpotQuestion {
  id: string
  ruleId: number
  /** 'broken' shows an incorrect sentence; 'illustrates' shows a correct one. */
  kind: 'broken' | 'illustrates'
  sentence: string
  /** The corrected sentence, for 'broken' questions. */
  fix?: string
  options: { ruleId: number; title: string }[]
}

export type SpotScope = 'all' | 'due' | 'weak' | GrammarCategory

function pickOptions(rule: GrammarRule): { ruleId: number; title: string }[] {
  const seenTitles = new Set([rule.title.toLowerCase()])
  const distractors: GrammarRule[] = []
  const sameCategory = shuffle(RULES.filter((r) => r.id !== rule.id && r.category === rule.category))
  const others = shuffle(RULES.filter((r) => r.id !== rule.id && r.category !== rule.category))
  for (const r of [...sameCategory, ...others]) {
    if (distractors.length === 3) break
    const t = r.title.toLowerCase()
    if (seenTitles.has(t)) continue
    seenTitles.add(t)
    distractors.push(r)
  }
  return shuffle([rule, ...distractors]).map((r) => ({ ruleId: r.id, title: r.title }))
}

function questionFor(rule: GrammarRule): SpotQuestion | null {
  const wantBroken = rule.pairs.length > 0 && (rule.correct.length === 0 || Math.random() < 0.8)
  if (wantBroken) {
    const pair = rule.pairs[Math.floor(Math.random() * rule.pairs.length)]
    return {
      id: `${rule.id}-b-${pair.wrong.slice(0, 12)}`,
      ruleId: rule.id,
      kind: 'broken',
      sentence: pair.wrong,
      fix: pair.right,
      options: pickOptions(rule),
    }
  }
  const pool = rule.correct.length > 0 ? rule.correct : rule.pairs.map((p) => p.right)
  if (pool.length === 0) return null
  const sentence = pool[Math.floor(Math.random() * pool.length)]
  return { id: `${rule.id}-i-${sentence.slice(0, 12)}`, ruleId: rule.id, kind: 'illustrates', sentence, options: pickOptions(rule) }
}

export function isSpotScope(value: string | null): value is SpotScope {
  return value === 'all' || value === 'due' || value === 'weak' || (GRAMMAR_CATEGORIES as readonly string[]).includes(value ?? '')
}

/** The rules a scope covers, struggling/due ones first, then unseen ones, shuffled within each tier. */
export function rankRules(scope: SpotScope): GrammarRule[] {
  const progress = loadProgress()
  let pool = RULES
  if (scope === 'due') pool = RULES.filter((r) => isDue(progress[r.id]))
  else if (scope === 'weak') pool = RULES.filter((r) => getStatus(progress[r.id]) === 'struggling')
  else if (scope !== 'all') pool = RULES.filter((r) => r.category === scope)

  const priority = (r: GrammarRule) => {
    const p = progress[r.id]
    const status = getStatus(p)
    if (status === 'struggling') return 0
    if (isDue(p)) return 1
    if (status === 'new') return 2
    return 3
  }
  // Shuffle first so equal-priority rules come out in a different order every session.
  return shuffle(pool).sort((a, b) => priority(a) - priority(b))
}

/** Pick which rules to drill: scope first, then due/struggling rules ahead of unseen ones. */
export function buildSpotQuestions(scope: SpotScope, count: number): SpotQuestion[] {
  const ranked = rankRules(scope)
  const questions: SpotQuestion[] = []
  for (const rule of ranked.slice(0, count)) {
    const q = questionFor(rule)
    if (q) questions.push(q)
  }
  return shuffle(questions)
}

export interface CheckQuestion {
  id: string
  sentence: string
  isCorrect: boolean
  /** Shown after answering — the corrected sentence when this one was wrong. */
  fix?: string
}

/** The quick "is this sentence correct?" check that gates a rule as learned in Rule Lab. */
export function buildRuleCheck(rule: GrammarRule, size = 3): CheckQuestion[] {
  const bad: CheckQuestion[] = rule.pairs.map((p, i) => ({ id: `w${i}`, sentence: p.wrong, isCorrect: false, fix: p.right }))
  const good: CheckQuestion[] = [
    ...rule.pairs.map((p, i) => ({ id: `r${i}`, sentence: p.right, isCorrect: true })),
    ...rule.correct.map((c, i) => ({ id: `c${i}`, sentence: c, isCorrect: true })),
  ]
  const badPick = shuffle(bad)
  const goodPick = shuffle(good)
  const wantBad = Math.min(badPick.length, Math.ceil(size / 2))
  const picked = [...badPick.slice(0, wantBad), ...goodPick.slice(0, size - wantBad)]
  // Top up from whichever side has spare sentences if one side ran short.
  const spare = [...badPick.slice(wantBad), ...goodPick.slice(size - wantBad)]
  while (picked.length < size && spare.length > 0) picked.push(spare.shift()!)
  return shuffle(picked)
}

// ─── Fix-It Flip Cards ───────────────────────────────────────────────────────

export interface FixCard {
  id: string
  ruleId: number
  wrong: string
  right: string
}

/** One wrong sentence per rule (only rules that show an Incorrect example can be fixed). */
export function buildFixCards(scope: SpotScope, count: number): FixCard[] {
  const cards: FixCard[] = []
  for (const rule of rankRules(scope)) {
    if (cards.length >= count) break
    if (rule.pairs.length === 0) continue
    const pair = rule.pairs[Math.floor(Math.random() * rule.pairs.length)]
    cards.push({ id: `${rule.id}-${pair.wrong.slice(0, 12)}`, ruleId: rule.id, wrong: pair.wrong, right: pair.right })
  }
  return shuffle(cards)
}

/** Loose comparison so a typed fix that matches the book ignoring case/punctuation/spacing counts. */
export function normalizeSentence(s: string): string {
  return s
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[^a-z0-9' ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// ─── Rule Duel ───────────────────────────────────────────────────────────────

export interface DuelItem {
  id: string
  ruleId: number
  sentence: string
  isCorrect: boolean
  fix?: string
}

/** A shuffled stream of correct/incorrect sentences, drawn from up to 2 per rule across the scope. */
export function buildDuelItems(scope: SpotScope, count: number): DuelItem[] {
  const items: DuelItem[] = []
  let n = 0
  for (const rule of rankRules(scope)) {
    const wrongs = shuffle(rule.pairs)
    const rights = shuffle([...rule.pairs.map((p) => p.right), ...rule.correct])
    if (wrongs[0]) items.push({ id: `d${n++}`, ruleId: rule.id, sentence: wrongs[0].wrong, isCorrect: false, fix: wrongs[0].right })
    if (rights[0]) items.push({ id: `d${n++}`, ruleId: rule.id, sentence: rights[0], isCorrect: true })
    if (items.length >= count) break
  }
  return shuffle(items).slice(0, count)
}

// ─── Rule Sorting ────────────────────────────────────────────────────────────

export interface SortItem {
  id: string
  sentence: string
  isCorrect: boolean
  fix?: string
}

export interface SortRound {
  ruleId: number
  items: SortItem[]
}

/** One round per rule: a mixed handful of right and wrong sentences to sort into two buckets. */
export function buildSortRounds(scope: SpotScope, rounds: number, perRound = 6): SortRound[] {
  const out: SortRound[] = []
  for (const rule of rankRules(scope)) {
    if (out.length >= rounds) break
    if (rule.pairs.length === 0) continue
    const half = Math.floor(perRound / 2)
    const bad = shuffle(rule.pairs).slice(0, half)
    const goodPool = shuffle([...rule.pairs.map((p) => p.right), ...rule.correct])
    const good = goodPool.slice(0, perRound - bad.length)
    const items: SortItem[] = [
      ...bad.map((p, i) => ({ id: `w${i}`, sentence: p.wrong, isCorrect: false, fix: p.right })),
      ...good.map((s, i) => ({ id: `g${i}`, sentence: s, isCorrect: true })),
    ]
    if (items.length >= 2) out.push({ ruleId: rule.id, items: shuffle(items) })
  }
  return out
}
