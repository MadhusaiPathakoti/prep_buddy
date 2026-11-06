import { shuffle, type MCQQuestion } from './generators'

/**
 * Ranking & Order (SBI PO Prelims + Mains style).
 *
 *  - "Positions": rows / class ranks with a few clues — find the total, the people between, a position.
 *    Every puzzle is checked by a solver that tries every possible row length and arrangement, and is
 *    only used when the clues give exactly ONE answer.
 *  - "Ordering": 5–8 people compared on height / age / weight / marks / salary through mixed clues
 *    (comparisons, "not the tallest", "exactly two between", "immediately taller", …). Every set is
 *    checked against all n! orders and is only used when exactly ONE order fits; clues that are not
 *    needed are dropped, so every clue matters.
 */

export type RankingDifficulty = 'easy' | 'medium' | 'hard' | 'mixed'
export type RankingType = 'mixed' | 'positions' | 'ordering'
type Level = 'easy' | 'medium' | 'hard'

const rnd = (n: number) => Math.floor(Math.random() * n)
const chance = (p: number) => Math.random() < p
const pick = <T,>(a: readonly T[]): T => a[rnd(a.length)]
const between = (lo: number, hi: number) => lo + rnd(hi - lo + 1)

const NAMES = ['Amit', 'Bhavna', 'Chirag', 'Deepa', 'Farhan', 'Geeta', 'Harsh', 'Isha', 'Kunal', 'Lata', 'Manish', 'Nikita', 'Rohan', 'Sneha', 'Tushar', 'Vidya']

function ord(k: number): string {
  const v = k % 100
  if (v >= 11 && v <= 13) return `${k}th`
  return `${k}${['th', 'st', 'nd', 'rd'][k % 10 < 4 ? k % 10 : 0]}`
}
const ORDINAL_WORDS = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth']

const mkId = (p: string) => `rk-${p}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`

// =====================================================================
// Positions
// =====================================================================

type Skin = 'row' | 'class'

type Fact =
  | { t: 'L'; p: number; k: number } // k-th from the left / top
  | { t: 'R'; p: number; k: number } // k-th from the right / bottom
  | { t: 'N'; n: number }
  | { t: 'LT'; a: number; b: number } // a is to the left of (ranks above) b
  | { t: 'BT'; a: number; b: number; m: number } // exactly m between a and b
  | { t: 'GAP'; a: number; b: number; d: number } // b is d places right of / below a
  | { t: 'SWAP'; a: number; b: number; k: number } // after a and b swap, a is k-th from the left
  | { t: 'ENDS'; p: number; k: number } // after the first and last leave, p is k-th from the right
  | { t: 'JOINR'; j: number; p: number; k: number } // after j join on the right, p is k-th from the right

type Ask = { t: 'N' } | { t: 'BETWEEN'; a: number; b: number } | { t: 'POS'; p: number; side: 'L' | 'R' }

interface Spec {
  skin: Skin
  persons: string[]
  facts: Fact[]
  ask: Ask
}

/** Every answer the clues allow, found by trying every row length and arrangement. */
function solveAll(spec: Spec, maxN = 170): Set<number> {
  const answers = new Set<number>()
  const P = spec.persons.length
  const fixedN = spec.facts.find((f) => f.t === 'N') as { n: number } | undefined
  for (let N = fixedN ? fixedN.n : 2; N <= (fixedN ? fixedN.n : maxN); N++) {
    // domain of each person: honour the "k-th from the left / right" facts first
    const dom: number[][] = []
    for (let i = 0; i < P; i++) {
      let d = Array.from({ length: N }, (_, x) => x + 1)
      for (const f of spec.facts) {
        if (f.t === 'L' && f.p === i) d = d.filter((x) => x === f.k)
        if (f.t === 'R' && f.p === i) d = d.filter((x) => N + 1 - x === f.k)
      }
      dom.push(d)
    }
    const pos = new Array<number>(P).fill(0)
    const rec = (i: number) => {
      if (answers.size > 1) return
      if (i === P) {
        if (holds(spec, N, pos)) answers.add(answerOf(spec.ask, N, pos))
        return
      }
      for (const x of dom[i]) {
        // distinct people occupy distinct places
        if (pos.slice(0, i).includes(x)) continue
        pos[i] = x
        rec(i + 1)
      }
    }
    rec(0)
    if (answers.size > 1) break
  }
  return answers
}

function holds(spec: Spec, N: number, pos: number[]): boolean {
  for (const f of spec.facts) {
    switch (f.t) {
      case 'L':
        if (pos[f.p] !== f.k) return false
        break
      case 'R':
        if (N + 1 - pos[f.p] !== f.k) return false
        break
      case 'N':
        if (N !== f.n) return false
        break
      case 'LT':
        if (!(pos[f.a] < pos[f.b])) return false
        break
      case 'BT':
        if (Math.abs(pos[f.a] - pos[f.b]) - 1 !== f.m) return false
        break
      case 'GAP':
        if (pos[f.b] - pos[f.a] !== f.d) return false
        break
      case 'SWAP':
        if (pos[f.b] !== f.k) return false // a takes b's old place
        break
      case 'ENDS':
        if (pos[f.p] === 1 || pos[f.p] === N) return false
        if (N - pos[f.p] !== f.k) return false
        break
      case 'JOINR':
        if (N + f.j + 1 - pos[f.p] !== f.k) return false
        break
    }
  }
  return true
}

function answerOf(ask: Ask, N: number, pos: number[]): number {
  if (ask.t === 'N') return N
  if (ask.t === 'BETWEEN') return Math.abs(pos[ask.a] - pos[ask.b]) - 1
  return ask.side === 'L' ? pos[ask.p] : N + 1 - pos[ask.p]
}

interface Built {
  spec: Spec
  answer: number
  why: string
  traps: number[]
}

function names(count: number): string[] {
  return shuffle(NAMES).slice(0, count)
}

function famTotal(skin: Skin, level: Level): Built {
  const N = between(15, level === 'easy' ? 60 : 90)
  const a = between(4, N - 3)
  const b = N + 1 - a
  const [P] = names(1)
  const unit = skin === 'row' ? 'from the left' : 'from the top'
  const unit2 = skin === 'row' ? 'from the right' : 'from the bottom'
  return {
    spec: { skin, persons: [P], facts: [{ t: 'L', p: 0, k: a }, { t: 'R', p: 0, k: b }], ask: { t: 'N' } },
    answer: N,
    why: `${P} is ${ord(a)} ${unit} and ${ord(b)} ${unit2}. Total = ${a} + ${b} − 1 = ${N} (${P} is counted in both).`,
    traps: [a + b, a + b - 2, a + b + 1],
  }
}

function famBetween(skin: Skin, level: Level): Built {
  const N = between(25, level === 'easy' ? 60 : 99)
  const pa = between(3, Math.floor(N / 2) - 2)
  const qb = between(3, Math.floor(N / 2) - 2)
  const pb = N + 1 - qb
  const [A, B] = names(2)
  const gap = pb - pa - 1
  return {
    spec: { skin, persons: [A, B], facts: [{ t: 'N', n: N }, { t: 'L', p: 0, k: pa }, { t: 'R', p: 1, k: qb }], ask: { t: 'BETWEEN', a: 0, b: 1 } },
    answer: gap,
    why: `${B} is ${ord(qb)} from the ${skin === 'row' ? 'right' : 'bottom'}, so ${B} is ${N} + 1 − ${qb} = ${ord(pb)} from the ${skin === 'row' ? 'left' : 'top'}. Between = ${pb} − ${pa} − 1 = ${gap}.`,
    traps: [pb - pa, pb - pa + 1, N - pa - qb, N - pa - qb + 2],
  }
}

function famGapTotal(skin: Skin): Built {
  const pa = between(5, 30)
  const m = between(2, 12)
  const qb = between(5, 30)
  const pb = pa + m + 1
  const N = pb + qb - 1
  const [A, B] = names(2)
  const left = skin === 'row' ? 'left' : 'top'
  const right = skin === 'row' ? 'right' : 'bottom'
  return {
    spec: {
      skin,
      persons: [A, B],
      facts: [{ t: 'L', p: 0, k: pa }, { t: 'R', p: 1, k: qb }, { t: 'LT', a: 0, b: 1 }, { t: 'BT', a: 0, b: 1, m }],
      ask: { t: 'N' },
    },
    answer: N,
    why: `${B} is ${pa} + ${m} + 1 = ${ord(pb)} from the ${left}. Total = ${pb} + ${qb} − 1 = ${N}, since ${B} is also ${ord(qb)} from the ${right}.`,
    traps: [pa + m + qb, pb + qb, pb + qb - 2, pa + m + qb + 1],
  }
}

function famSwap(skin: Skin, level: Level): Built {
  const N = between(30, 95)
  const pa = between(4, N - 10)
  let pb = between(4, N - 5)
  if (Math.abs(pb - pa) < 4) pb = Math.min(N - 3, pa + 5 + rnd(10))
  const qb = N + 1 - pb
  const [A, B] = names(2)
  const askTotal = chance(level === 'hard' ? 0.35 : 0.55)
  const left = skin === 'row' ? 'left' : 'top'
  const right = skin === 'row' ? 'right' : 'bottom'
  if (askTotal) {
    return {
      spec: { skin, persons: [A, B], facts: [{ t: 'L', p: 0, k: pa }, { t: 'R', p: 1, k: qb }, { t: 'SWAP', a: 0, b: 1, k: pb }], ask: { t: 'N' } },
      answer: N,
      why: `After swapping, ${A} stands where ${B} stood, so ${B} was ${ord(pb)} from the ${left}. ${B} is ${ord(qb)} from the ${right}, so total = ${pb} + ${qb} − 1 = ${N}.`,
      traps: [pb + qb, pa + qb - 1, pb + qb - 2, pb + qb + 1],
    }
  }
  const gap = Math.abs(pb - pa) - 1
  return {
    spec: { skin, persons: [A, B], facts: [{ t: 'L', p: 0, k: pa }, { t: 'SWAP', a: 0, b: 1, k: pb }], ask: { t: 'BETWEEN', a: 0, b: 1 } },
    answer: gap,
    why: `${A} moves from ${ord(pa)} to ${ord(pb)} (${B}'s place), so ${B} was ${ord(pb)}. Between = |${pb} − ${pa}| − 1 = ${gap}.`,
    traps: [gap + 1, gap + 2, Math.abs(pb - pa) + 1, gap - 1],
  }
}

function famRankGap(): Built {
  const r = between(5, 25)
  const d = between(3, 14)
  const q = between(4, 25)
  const N = r + d + q - 1
  const [P, Q] = names(2)
  return {
    spec: { skin: 'class', persons: [P, Q], facts: [{ t: 'L', p: 0, k: r }, { t: 'GAP', a: 0, b: 1, d }, { t: 'R', p: 1, k: q }], ask: { t: 'N' } },
    answer: N,
    why: `${Q} ranks ${r} + ${d} = ${ord(r + d)} from the top and ${ord(q)} from the bottom. Total = ${r + d} + ${q} − 1 = ${N}.`,
    traps: [r + d + q, r + d + q - 2, r + q + d - 1 + 1, r + q - 1],
  }
}

function famEnds(skin: Skin): Built {
  const pa = between(5, 40)
  const k = between(5, 40)
  const N = pa + k
  const [A] = names(1)
  const right = skin === 'row' ? 'right' : 'bottom'
  const left = skin === 'row' ? 'left' : 'top'
  return {
    spec: { skin, persons: [A], facts: [{ t: 'L', p: 0, k: pa }, { t: 'ENDS', p: 0, k: k }], ask: { t: 'N' } },
    answer: N,
    why: `With both ends removed, ${A} is ${ord(k)} from the ${right}, so before that ${A} was ${k} + 1 = ${ord(k + 1)} from the ${right}. Total = ${pa} + ${k + 1} − 1 = ${N} (${A} is ${ord(pa)} from the ${left}).`,
    traps: [pa + k + 1, pa + k - 1, pa + k + 2, pa + k - 2],
  }
}

function famJoin(skin: Skin): Built {
  const pa = between(5, 40)
  const j = between(3, 12)
  const N = between(pa + 6, pa + 40)
  const k = N + j + 1 - pa
  const [A] = names(1)
  const right = skin === 'row' ? 'right' : 'bottom'
  const left = skin === 'row' ? 'left' : 'top'
  return {
    spec: { skin, persons: [A], facts: [{ t: 'L', p: 0, k: pa }, { t: 'JOINR', j, p: 0, k }], ask: { t: 'N' } },
    answer: N,
    why: `${A} is ${ord(k)} from the ${right} in the longer line, so originally ${ord(k - j)} from the ${right} (the ${j} newcomers are behind). Total = ${pa} + ${k - j} − 1 = ${N} (${A} is ${ord(pa)} from the ${left}).`,
    traps: [pa + k - 1, pa + k + j - 1, pa + k - j + 1, pa + k - j],
  }
}

function famChain(skin: Skin): Built {
  const pa = between(3, 15)
  const m1 = between(2, 7)
  const m2 = between(2, 7)
  const qc = between(3, 15)
  const pb = pa + m1 + 1
  const pc = pb + m2 + 1
  const N = pc + qc - 1
  const [A, B, C] = names(3)
  const askBetween = chance(0.3)
  const facts: Fact[] = [
    { t: 'L', p: 0, k: pa },
    { t: 'LT', a: 0, b: 1 },
    { t: 'BT', a: 0, b: 1, m: m1 },
    { t: 'LT', a: 1, b: 2 },
    { t: 'BT', a: 1, b: 2, m: m2 },
  ]
  if (askBetween) {
    const ans = pc - pa - 1
    return {
      spec: { skin, persons: [A, B, C], facts, ask: { t: 'BETWEEN', a: 0, b: 2 } },
      answer: ans,
      why: `${m1} people between ${A} and ${B}, ${B} counted once, and ${m2} between ${B} and ${C}: ${m1} + 1 + ${m2} = ${ans} people between ${A} and ${C}.`,
      traps: [ans + 1, ans - 1, m1 + m2, m1 + m2 + 2],
    }
  }
  facts.push({ t: 'R', p: 2, k: qc })
  return {
    spec: { skin, persons: [A, B, C], facts, ask: { t: 'N' } },
    answer: N,
    why: `${B} is ${pa} + ${m1} + 1 = ${ord(pb)} and ${C} is ${pb} + ${m2} + 1 = ${ord(pc)} from the ${skin === 'row' ? 'left' : 'top'}. Total = ${pc} + ${qc} − 1 = ${N}.`,
    traps: [pc + qc, pc + qc - 2, pa + m1 + m2 + qc, pc + qc + 1],
  }
}

const FAMILIES: Record<Level, ((skin: Skin, level: Level) => Built)[]> = {
  easy: [famTotal, famTotal, famBetween],
  medium: [famBetween, famGapTotal, famSwap, famRankGap, famEnds],
  hard: [famSwap, famJoin, famChain, famGapTotal, famEnds, famChain],
}

// ----- text -----

function factText(f: Fact, s: Spec): string {
  const P = s.persons
  const row = s.skin === 'row'
  switch (f.t) {
    case 'L':
      return row ? `${P[f.p]} is ${ord(f.k)} from the left.` : `${P[f.p]} ranks ${ord(f.k)} from the top.`
    case 'R':
      return row ? `${P[f.p]} is ${ord(f.k)} from the right.` : `${P[f.p]} ranks ${ord(f.k)} from the bottom.`
    case 'N':
      return row ? `There are ${f.n} people in the row.` : `There are ${f.n} students in the class.`
    case 'LT':
      return row ? `${P[f.a]} stands to the left of ${P[f.b]}.` : `${P[f.a]} ranks higher than ${P[f.b]}.`
    case 'BT':
      return row ? `Exactly ${f.m} people stand between ${P[f.a]} and ${P[f.b]}.` : `Exactly ${f.m} students are ranked between ${P[f.a]} and ${P[f.b]}.`
    case 'GAP':
      return row ? `${P[f.b]} is ${f.d} places to the right of ${P[f.a]}.` : `${P[f.b]} is ${f.d} ranks below ${P[f.a]}.`
    case 'SWAP':
      return row
        ? `After ${P[f.a]} and ${P[f.b]} interchange their positions, ${P[f.a]} becomes ${ord(f.k)} from the left.`
        : `After ${P[f.a]} and ${P[f.b]} exchange ranks, ${P[f.a]} ranks ${ord(f.k)} from the top.`
    case 'ENDS':
      return row
        ? `If the first and the last person leave, ${P[f.p]} becomes ${ord(f.k)} from the right.`
        : `If the topper and the last-ranked student are removed, ${P[f.p]} ranks ${ord(f.k)} from the bottom.`
    case 'JOINR':
      return row
        ? `After ${f.j} more people join at the right end, ${P[f.p]} becomes ${ord(f.k)} from the right.`
        : `After ${f.j} more students join below the last rank, ${P[f.p]} ranks ${ord(f.k)} from the bottom.`
  }
}

function askText(a: Ask, s: Spec): string {
  const row = s.skin === 'row'
  if (a.t === 'N') return row ? 'How many people are there in the row?' : 'How many students are there in the class?'
  if (a.t === 'BETWEEN') return row ? `How many people stand between ${s.persons[a.a]} and ${s.persons[a.b]}?` : `How many students are ranked between ${s.persons[a.a]} and ${s.persons[a.b]}?`
  return row ? `What is ${s.persons[a.p]}'s position from the ${a.side === 'L' ? 'left' : 'right'} end?` : `What is ${s.persons[a.p]}'s rank from the ${a.side === 'L' ? 'top' : 'bottom'}?`
}

function numberOptions(answer: number, traps: number[]): string[] {
  const set = new Set<number>([answer])
  for (const t of shuffle(traps)) if (set.size < 5 && t > 0 && t !== answer) set.add(t)
  for (const d of shuffle([1, -1, 2, -2, 3, -3, 4, 5])) if (set.size < 5 && answer + d > 0) set.add(answer + d)
  return shuffle([...set]).map(String)
}

function buildPositions(level: Level): MCQQuestion | null {
  const skin: Skin = chance(0.5) ? 'row' : 'class'
  const built = pick(FAMILIES[level])(skin, level)
  const { spec, answer } = built
  // the clues must pin down exactly this answer
  const solved = solveAll(spec)
  if (solved.size !== 1 || !solved.has(answer)) return null
  const intro = skin === 'row' ? 'Some people are standing in a row.' : 'Some students are ranked in a class by their marks (rank 1 is the highest).'
  const facts = level === 'easy' ? spec.facts : shuffle(spec.facts)
  // clue sentences that name N first read more naturally
  const ordered = [...facts].sort((x, y) => (x.t === 'N' ? -1 : 0) - (y.t === 'N' ? -1 : 0))
  return {
    id: mkId('p'),
    instruction: `Ranking · positions · ${level}`,
    context: `${intro}\n${ordered.map((f) => factText(f, spec)).join('\n')}`,
    term: askText(spec.ask, spec),
    correctMeaning: String(answer),
    options: numberOptions(answer, built.traps),
    hint: 'Draw the line of people with the given positions marked on it. A person counted from both ends is counted twice, so subtract 1.',
    explanation: built.why,
  }
}

// =====================================================================
// Ordering
// =====================================================================

interface Attr {
  measure: string
  isMore: string
  isLess: string
  topWord: string
  bottomWord: string
  /** "are taller than" / "scored more than" for counting questions */
  areMore: string
  areLess: string
}

const ATTRS: Attr[] = [
  { measure: 'height', isMore: 'is taller than', isLess: 'is shorter than', topWord: 'tallest', bottomWord: 'shortest', areMore: 'are taller than', areLess: 'are shorter than' },
  { measure: 'age', isMore: 'is older than', isLess: 'is younger than', topWord: 'oldest', bottomWord: 'youngest', areMore: 'are older than', areLess: 'are younger than' },
  { measure: 'weight', isMore: 'is heavier than', isLess: 'is lighter than', topWord: 'heaviest', bottomWord: 'lightest', areMore: 'are heavier than', areLess: 'are lighter than' },
  { measure: 'marks', isMore: 'scored more than', isLess: 'scored less than', topWord: 'highest scorer', bottomWord: 'lowest scorer', areMore: 'scored more than', areLess: 'scored less than' },
  { measure: 'salary', isMore: 'earns more than', isLess: 'earns less than', topWord: 'highest earner', bottomWord: 'lowest earner', areMore: 'earn more than', areLess: 'earn less than' },
]

type Stmt =
  | { t: 'GT'; a: number; b: number } // a > b
  | { t: 'COMP'; a: number; b: number; c: number } // c > a > b
  | { t: 'NOTTOP'; a: number }
  | { t: 'NOTBOT'; a: number }
  | { t: 'TOP'; a: number }
  | { t: 'BOT'; a: number }
  | { t: 'BETWEEN'; a: number; b: number; k: number }
  | { t: 'ADJ'; a: number; b: number } // b is directly below a
  | { t: 'ONLY'; a: number; k: number; more: boolean } // exactly k people are more / less than a

/** pos[i] = 0 for the top person. */
function stmtHolds(s: Stmt, pos: number[] | Int8Array, n: number): boolean {
  switch (s.t) {
    case 'GT':
      return pos[s.a] < pos[s.b]
    case 'COMP':
      return pos[s.c] < pos[s.a] && pos[s.a] < pos[s.b]
    case 'NOTTOP':
      return pos[s.a] !== 0
    case 'NOTBOT':
      return pos[s.a] !== n - 1
    case 'TOP':
      return pos[s.a] === 0
    case 'BOT':
      return pos[s.a] === n - 1
    case 'BETWEEN':
      return Math.abs(pos[s.a] - pos[s.b]) - 1 === s.k
    case 'ADJ':
      return pos[s.b] === pos[s.a] + 1
    case 'ONLY':
      return s.more ? pos[s.a] === s.k : n - 1 - pos[s.a] === s.k
  }
}

const numWord = (k: number) => ['no', 'one', 'two', 'three', 'four', 'five', 'six'][k]

function stmtText(s: Stmt, who: string[], at: Attr): string {
  const w = (i: number) => who[i]
  switch (s.t) {
    case 'GT':
      return `${w(s.a)} ${at.isMore} ${w(s.b)}.`
    case 'COMP':
      return `${w(s.a)} ${at.isMore} ${w(s.b)} but ${at.isLess} ${w(s.c)}.`
    case 'NOTTOP':
      return `${w(s.a)} is not the ${at.topWord}.`
    case 'NOTBOT':
      return `${w(s.a)} is not the ${at.bottomWord}.`
    case 'TOP':
      return `${w(s.a)} is the ${at.topWord}.`
    case 'BOT':
      return `${w(s.a)} is the ${at.bottomWord}.`
    case 'BETWEEN':
      return `Exactly ${numWord(s.k)} ${s.k === 1 ? 'person is' : 'people are'} between ${w(s.a)} and ${w(s.b)} in ${at.measure}.`
    case 'ADJ':
      return `${w(s.a)} ${at.isMore} ${w(s.b)}, and nobody is between them in ${at.measure}.`
    case 'ONLY':
      return `Exactly ${numWord(s.k)} ${s.k === 1 ? `person ${s.more ? at.isMore : at.isLess}` : `people ${s.more ? at.areMore : at.areLess}`} ${w(s.a)}.`
  }
}

const WEIGHTS: Record<Level, [Stmt['t'], number][]> = {
  easy: [['GT', 50], ['COMP', 30], ['NOTTOP', 6], ['NOTBOT', 6], ['TOP', 4], ['BOT', 4]],
  medium: [['GT', 28], ['COMP', 22], ['NOTTOP', 7], ['NOTBOT', 7], ['ADJ', 12], ['BETWEEN', 12], ['ONLY', 12]],
  hard: [['GT', 10], ['COMP', 14], ['NOTTOP', 8], ['NOTBOT', 8], ['ADJ', 16], ['BETWEEN', 24], ['ONLY', 20]],
}

function randomStmt(kind: Stmt['t'], n: number): Stmt {
  const pickN = (count: number) => shuffle(Array.from({ length: n }, (_, i) => i)).slice(0, count)
  switch (kind) {
    case 'GT': {
      const [a, b] = pickN(2)
      return { t: 'GT', a, b }
    }
    case 'COMP': {
      const [a, b, c] = pickN(3)
      return { t: 'COMP', a, b, c }
    }
    case 'NOTTOP':
    case 'NOTBOT':
    case 'TOP':
    case 'BOT':
      return { t: kind, a: pickN(1)[0] }
    case 'BETWEEN': {
      const [a, b] = pickN(2)
      return { t: 'BETWEEN', a, b, k: rnd(Math.min(4, n - 2)) + 1 }
    }
    case 'ADJ': {
      const [a, b] = pickN(2)
      return { t: 'ADJ', a, b }
    }
    case 'ONLY':
      return { t: 'ONLY', a: pickN(1)[0], k: rnd(Math.min(4, n - 1)) + 1, more: chance(0.5) }
  }
}

function weightedKind(level: Level): Stmt['t'] {
  let r = rnd(100)
  for (const [k, w] of WEIGHTS[level]) {
    if (r < w) return k
    r -= w
  }
  return 'GT'
}

/** Every ordering of 0..n-1 as position arrays (pos[person] = place). */
function allOrders(n: number): Int8Array[] {
  const out: Int8Array[] = []
  const cur = new Int8Array(n)
  const used = new Array<boolean>(n).fill(false)
  const rec = (i: number) => {
    if (i === n) {
      out.push(Int8Array.from(cur))
      return
    }
    for (let p = 0; p < n; p++) {
      if (used[p]) continue
      used[p] = true
      cur[i] = p
      rec(i + 1)
      used[p] = false
    }
  }
  rec(0)
  return out
}

const ORDER_CACHE = new Map<number, Int8Array[]>()
const ordersFor = (n: number) => {
  let o = ORDER_CACHE.get(n)
  if (!o) {
    o = allOrders(n)
    ORDER_CACHE.set(n, o)
  }
  return o
}

const SIZES: Record<Level, [number, number]> = { easy: [5, 5], medium: [6, 6], hard: [7, 8] }

interface OrderPuzzle {
  who: string[]
  attr: Attr
  order: number[] // order[place] = person index, place 0 = top
  pos: Int8Array
  stmts: Stmt[]
}

function makeOrderPuzzle(level: Level): OrderPuzzle | null {
  const [lo, hi] = SIZES[level]
  const n = between(lo, hi)
  const who = shuffle(NAMES).slice(0, n)
  const attr = pick(ATTRS)
  const truth = shuffle(Array.from({ length: n }, (_, i) => i)) // truth[place] = person
  const pos = new Int8Array(n)
  truth.forEach((person, place) => (pos[person] = place))
  let alive = ordersFor(n)
  const stmts: Stmt[] = []
  for (let tries = 0; tries < 400 && alive.length > 1 && stmts.length < 16; tries++) {
    const s = randomStmt(weightedKind(level), n)
    if (!stmtHolds(s, pos, n)) continue
    const next = alive.filter((o) => stmtHolds(s, o, n))
    if (next.length === alive.length) continue
    alive = next
    stmts.push(s)
  }
  if (alive.length !== 1) return null
  // drop clues that are not needed
  for (let i = stmts.length - 1; i >= 0; i--) {
    const rest = stmts.filter((_, j) => j !== i)
    const count = ordersFor(n).filter((o) => rest.every((s) => stmtHolds(s, o, n))).length
    if (count === 1) stmts.splice(i, 1)
  }
  if (stmts.length < (level === 'easy' ? 3 : level === 'medium' ? 4 : 5)) return null
  return { who, attr, order: truth, pos, stmts }
}

function orderQuestions(level: Level, count: number): MCQQuestion[] | null {
  const p = makeOrderPuzzle(level)
  if (!p) return null
  const { who, attr, order, pos, stmts } = p
  const n = who.length
  const setId = Math.random().toString(36).slice(2, 7)
  const context = `${n} people (${who.join(', ')}) are compared on ${attr.measure}:\n${stmts.map((s) => stmtText(s, who, attr)).join('\n')}`
  const fullOrder = order.map((i) => who[i]).join(' > ')
  const placeWord = (place: number, fromTop: boolean) => {
    const k = fromTop ? place : n - 1 - place
    return k === 0 ? (fromTop ? attr.topWord : attr.bottomWord) : `${ORDINAL_WORDS[k]} ${fromTop ? attr.topWord : attr.bottomWord}`
  }
  const out: MCQQuestion[] = []
  const usedKinds = new Set<string>()
  let guard = 0
  while (out.length < count && guard++ < 60) {
    const kind = pick(['kth', 'kth', 'count', 'between', 'true', 'adjacent'] as const)
    if (usedKinds.has(kind) && guard < 30) continue
    let q: MCQQuestion | null = null
    const base = { id: `rk-o-${setId}-${out.length}`, instruction: `Ranking · ordering · ${level}`, context, hint: 'Combine the clues into one line from the top to the bottom, then answer from that line.' }
    if (kind === 'kth') {
      const fromTop = chance(0.5)
      const place = rnd(n)
      const person = order[place]
      if (level !== 'easy' && (place === 0 || place === n - 1) && chance(0.6)) continue
      const options = shuffle([person, ...shuffle(order.filter((x) => x !== person)).slice(0, 4)]).map((i) => who[i])
      q = { ...base, term: `Who is the ${placeWord(place, fromTop)}?`, correctMeaning: who[person], options, explanation: `Order (${attr.topWord} → ${attr.bottomWord}): ${fullOrder}\n${who[person]} is the ${placeWord(place, fromTop)}.` }
    } else if (kind === 'count') {
      const person = rnd(n)
      const more = chance(0.5)
      const answer = more ? pos[person] : n - 1 - pos[person]
      const opts = shuffle(Array.from({ length: n }, (_, i) => i)).slice(0, 5)
      if (!opts.includes(answer)) opts[0] = answer
      if (new Set(opts).size !== 5) continue
      q = { ...base, term: `How many people ${more ? attr.areMore : attr.areLess} ${who[person]}?`, correctMeaning: String(answer), options: shuffle(opts).map(String), explanation: `Order (${attr.topWord} → ${attr.bottomWord}): ${fullOrder}\n${answer} ${answer === 1 ? 'person is' : 'people are'} ${more ? 'above' : 'below'} ${who[person]}.` }
    } else if (kind === 'between') {
      const candidates: [number, number][] = []
      for (let i = 0; i + 2 < n; i++) candidates.push([order[i], order[i + 2]])
      const [a, b] = pick(candidates)
      const mid = order[(pos[a] + pos[b]) / 2]
      const options = shuffle([mid, ...shuffle(order.filter((x) => x !== mid)).slice(0, 4)])
      if (options.length < 5) continue
      q = { ...base, term: `Who is exactly between ${who[a]} and ${who[b]} in ${attr.measure}?`, correctMeaning: who[mid], options: options.map((i) => who[i]), explanation: `Order (${attr.topWord} → ${attr.bottomWord}): ${fullOrder}\n${who[mid]} stands between ${who[a]} and ${who[b]}.` }
    } else if (kind === 'adjacent') {
      const place = rnd(n - 1)
      const person = order[place]
      const target = order[place + 1]
      const options = shuffle([target, ...shuffle(order.filter((x) => x !== target)).slice(0, 4)])
      q = { ...base, term: `Who ${attr.isLess} ${who[person]} with nobody in between?`, correctMeaning: who[target], options: options.map((i) => who[i]), explanation: `Order (${attr.topWord} → ${attr.bottomWord}): ${fullOrder}\n${who[target]} comes straight after ${who[person]}.` }
    } else {
      // "which statement is true": one true, four false
      const truths: Stmt[] = []
      const falses: Stmt[] = []
      for (let t = 0; t < 300 && (truths.length < 3 || falses.length < 12); t++) {
        const s = randomStmt(pick(['GT', 'COMP', 'BETWEEN', 'ONLY', 'ADJ', 'NOTTOP', 'NOTBOT'] as const), n)
        ;(stmtHolds(s, pos, n) ? truths : falses).push(s)
      }
      if (truths.length < 1 || falses.length < 4) continue
      const chosen = [pick(truths), ...falses.slice(0, 4)]
      const texts = chosen.map((s) => stmtText(s, who, attr))
      if (new Set(texts).size !== 5) continue
      q = { ...base, term: 'Which of the following is true?', correctMeaning: texts[0], options: shuffle(texts), explanation: `Order (${attr.topWord} → ${attr.bottomWord}): ${fullOrder}\n"${texts[0]}" is the only one that matches this order.` }
    }
    if (q) {
      usedKinds.add(kind)
      out.push(q)
    }
  }
  return out.length === count ? out : null
}

// =====================================================================
// entry point
// =====================================================================

export function generateRankingQuestions(difficulty: RankingDifficulty, type: RankingType, count: number): MCQQuestion[] {
  const out: MCQQuestion[] = []
  let guard = 0
  while (out.length < count && guard++ < count * 80) {
    const level: Level = difficulty === 'mixed' ? (['easy', 'medium', 'hard'] as Level[])[out.length % 3] : difficulty
    const kind = type === 'mixed' ? (chance(0.5) ? 'positions' : 'ordering') : type
    if (kind === 'positions') {
      const q = buildPositions(level)
      if (q) out.push(q)
    } else {
      const set = orderQuestions(level, Math.min(3, count - out.length))
      if (set) out.push(...set)
    }
  }
  return out.slice(0, count)
}
