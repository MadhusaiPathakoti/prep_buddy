import { shuffle, type MCQQuestion } from './generators'

/**
 * Syllogism (SBI PO Prelims + Mains style).
 *
 * Every verdict comes from an exhaustive "Venn" model check: each term is a circle, each non-empty
 * region of the diagram is either occupied or empty, and a conclusion *follows* only if it is true in
 * EVERY arrangement that fits the statements (a *possibility* needs just one). The usual exam
 * convention is applied: every term named in a statement has members ("All A are B" implies "Some A
 * are B"; "No A is B" implies "Some A are not B").
 *
 * The explanations come from a second, separate engine — forward-chaining syllogism rules — so a
 * "follows" answer always carries a written proof. A puzzle is only used when the two engines agree
 * (the model check says "follows" => the rules can prove it).
 */

export type SyllogismDifficulty = 'easy' | 'medium' | 'hard' | 'mixed'
export type SyllogismFormat = 'conclusions' | 'which-follows' | 'mixed'

type Form = 'A' | 'E' | 'I' | 'O' // All x are y · No x is y · Some x are y · Some x are not y
interface Prop {
  form: Form
  x: number
  y: number
}
interface Stmt {
  props: Prop[]
  few: boolean // "Only a few x are y" = Some x are y AND Some x are not y
}
interface Conc {
  pos: boolean // a "possibility" statement rather than a definite one
  form: 'A' | 'I' | 'O' | 'E'
  x: number
  y: number
}
interface Term {
  plural: string
  singular: string
}

const TERMS: Term[] = [
  ['pens', 'pen'], ['books', 'book'], ['tables', 'table'], ['chairs', 'chair'], ['roads', 'road'], ['trees', 'tree'],
  ['birds', 'bird'], ['flowers', 'flower'], ['stones', 'stone'], ['rivers', 'river'], ['cars', 'car'], ['houses', 'house'],
  ['bottles', 'bottle'], ['clocks', 'clock'], ['mangoes', 'mango'], ['doors', 'door'], ['boats', 'boat'], ['lamps', 'lamp'],
  ['coins', 'coin'], ['keys', 'key'], ['hills', 'hill'], ['cups', 'cup'], ['ropes', 'rope'], ['drums', 'drum'],
  ['plates', 'plate'], ['nails', 'nail'], ['boxes', 'box'], ['bags', 'bag'], ['shoes', 'shoe'], ['kites', 'kite'],
  ['towers', 'tower'], ['gates', 'gate'], ['wires', 'wire'], ['jars', 'jar'], ['maps', 'map'], ['bells', 'bell'],
  ['rings', 'ring'], ['sticks', 'stick'], ['shirts', 'shirt'], ['ovens', 'oven'], ['apples', 'apple'], ['engines', 'engine'],
].map(([plural, singular]) => ({ plural, singular }))

const ANSWERS = [
  'Only conclusion I follows',
  'Only conclusion II follows',
  'Either conclusion I or II follows',
  'Neither conclusion I nor II follows',
  'Both conclusions I and II follow',
] as const

// ---------- wording ----------

const article = (w: string) => (/^[aeiou]/.test(w) ? 'an' : 'a')

function propText(p: Prop, t: Term[]): string {
  const X = t[p.x]
  const Y = t[p.y]
  switch (p.form) {
    case 'A':
      return `All ${X.plural} are ${Y.plural}`
    case 'E':
      return `No ${X.singular} is ${article(Y.singular)} ${Y.singular}`
    case 'I':
      return `Some ${X.plural} are ${Y.plural}`
    case 'O':
      return `Some ${X.plural} are not ${Y.plural}`
  }
}

function stmtText(s: Stmt, t: Term[]): string {
  if (s.few) return `Only a few ${t[s.props[0].x].plural} are ${t[s.props[0].y].plural}`
  return propText(s.props[0], t)
}

function concText(c: Conc, t: Term[]): string {
  if (!c.pos) return propText({ form: c.form, x: c.x, y: c.y }, t)
  const X = t[c.x]
  const Y = t[c.y]
  if (c.form === 'A') return `All ${X.plural} can be ${Y.plural}`
  if (c.form === 'I') return `Some ${X.plural} can be ${Y.plural}`
  return `Some ${X.plural} may not be ${Y.plural}`
}

// ---------- the Venn model check ----------

interface Analysis {
  k: number
  models: Int32Array
  xy: number[][] // bit-mask of regions lying inside both circles
  xny: number[][] // regions inside x but outside y
  /** One pass over the models: is "some x are y" / "some x are not y" true in all / in at least one? */
  allI: boolean[][]
  anyI: boolean[][]
  allO: boolean[][]
  anyO: boolean[][]
}

const MAX_FREE_REGIONS = 16

function analyse(stmts: Stmt[], k: number): Analysis | null {
  const R = (1 << k) - 1
  const xy: number[][] = []
  const xny: number[][] = []
  for (let a = 0; a < k; a++) {
    xy.push([])
    xny.push([])
    for (let b = 0; b < k; b++) {
      let both = 0
      let only = 0
      for (let r = 1; r <= R; r++) {
        const inA = (r >> a) & 1
        const inB = (r >> b) & 1
        if (inA && inB) both |= 1 << (r - 1)
        if (inA && !inB) only |= 1 << (r - 1)
      }
      xy[a].push(both)
      xny[a].push(only)
    }
  }
  let allowed = (R === 31 ? 0x7fffffff : (1 << R) - 1) | 0
  const need: number[] = [] // each mask must intersect the occupied regions
  for (let t = 0; t < k; t++) {
    let m = 0
    for (let r = 1; r <= R; r++) if ((r >> t) & 1) m |= 1 << (r - 1)
    need.push(m)
  }
  for (const s of stmts) {
    for (const p of s.props) {
      if (p.form === 'A') allowed &= ~xny[p.x][p.y]
      else if (p.form === 'E') allowed &= ~xy[p.x][p.y]
      else if (p.form === 'I') need.push(xy[p.x][p.y])
      else need.push(xny[p.x][p.y])
    }
  }
  let free = 0
  for (let m = allowed; m; m &= m - 1) free++
  if (free > MAX_FREE_REGIONS) return null
  const out: number[] = []
  let sub = allowed
  for (;;) {
    let ok = true
    for (const m of need) {
      if ((sub & m) === 0) {
        ok = false
        break
      }
    }
    if (ok) out.push(sub)
    if (sub === 0) break
    sub = (sub - 1) & allowed
  }
  if (out.length === 0) return null
  const models = Int32Array.from(out)
  const grid = () => Array.from({ length: k }, () => new Array<boolean>(k).fill(false))
  const an: Analysis = { k, models, xy, xny, allI: grid(), anyI: grid(), allO: grid(), anyO: grid() }
  for (let x = 0; x < k; x++) {
    for (let y = 0; y < k; y++) {
      let aI = true, nI = false, aO = true, nO = false
      for (const m of models) {
        const i = (m & xy[x][y]) !== 0
        const o = (m & xny[x][y]) !== 0
        if (i) nI = true
        else aI = false
        if (o) nO = true
        else aO = false
      }
      an.allI[x][y] = aI
      an.anyI[x][y] = nI
      an.allO[x][y] = aO
      an.anyO[x][y] = nO
    }
  }
  return an
}

function holdsIn(model: number, an: Analysis, form: Form, x: number, y: number): boolean {
  if (form === 'I') return (model & an.xy[x][y]) !== 0
  if (form === 'E') return (model & an.xy[x][y]) === 0
  if (form === 'O') return (model & an.xny[x][y]) !== 0
  return (model & an.xny[x][y]) === 0
}

function holdsEverywhere(an: Analysis, form: Form, x: number, y: number): boolean {
  if (form === 'I') return an.allI[x][y]
  if (form === 'O') return an.allO[x][y]
  return form === 'E' ? !an.anyI[x][y] : !an.anyO[x][y]
}
function holdsSomewhere(an: Analysis, form: Form, x: number, y: number): boolean {
  if (form === 'I') return an.anyI[x][y]
  if (form === 'O') return an.anyO[x][y]
  return form === 'E' ? !an.allI[x][y] : !an.allO[x][y]
}

function popcount(n: number): number {
  let c = 0
  for (; n; n &= n - 1) c++
  return c
}

/** The simplest arrangement (fewest occupied regions) in which `form(x,y)` has the given truth value. */
function witness(an: Analysis, form: Form, x: number, y: number, truth: boolean): number | null {
  let best: number | null = null
  for (const m of an.models) {
    if (holdsIn(m, an, form, x, y) !== truth) continue
    if (best === null || popcount(m) < popcount(best)) best = m
  }
  return best
}

function describeArrangement(model: number, k: number, t: Term[]): string {
  const groups: string[] = []
  for (let r = 1; r < 1 << k; r++) {
    if (!(model & (1 << (r - 1)))) continue
    const names: string[] = []
    for (let i = 0; i < k; i++) if ((r >> i) & 1) names.push(t[i].plural)
    groups.push(`[${names.join(' + ')}]`)
  }
  return groups.join(' · ')
}

// ---------- the rule engine (for the written proofs) ----------

interface Fact {
  p: Prop
  kind: 'given' | 'few' | 'derived'
  from: string[]
  src: number // statement index, for 'few'
}

const keyOf = (p: Prop) => `${p.form}${p.x}>${p.y}`

function combine(a: Prop, b: Prop): Prop | null {
  const A = a.form
  const B = b.form
  if (A === 'A' && B === 'A' && a.y === b.x && a.x !== b.y) return { form: 'A', x: a.x, y: b.y }
  if (A === 'A' && B === 'E' && a.y === b.x && a.x !== b.y) return { form: 'E', x: a.x, y: b.y }
  if (A === 'I' && B === 'A' && a.y === b.x && a.x !== b.y) return { form: 'I', x: a.x, y: b.y }
  if (A === 'I' && B === 'E' && a.y === b.x && a.x !== b.y) return { form: 'O', x: a.x, y: b.y }
  if (A === 'A' && B === 'A' && a.x === b.x && a.y !== b.y) return { form: 'I', x: a.y, y: b.y }
  if (A === 'A' && B === 'E' && a.x === b.x && a.y !== b.y) return { form: 'O', x: a.y, y: b.y }
  if (A === 'A' && B === 'O' && a.y === b.y && a.x !== b.x) return { form: 'O', x: b.x, y: a.x }
  if (A === 'A' && B === 'O' && a.x === b.x && a.y !== b.y) return { form: 'O', x: a.y, y: b.y }
  return null
}

function convert(a: Prop): Prop[] {
  if (a.form === 'E')
    return [
      { form: 'E', x: a.y, y: a.x },
      { form: 'O', x: a.x, y: a.y },
      { form: 'O', x: a.y, y: a.x },
    ]
  if (a.form === 'I') return [{ form: 'I', x: a.y, y: a.x }]
  if (a.form === 'A')
    return [
      { form: 'I', x: a.x, y: a.y },
      { form: 'I', x: a.y, y: a.x },
    ]
  return []
}

function closure(stmts: Stmt[]): Map<string, Fact> {
  const facts = new Map<string, Fact>()
  const add = (p: Prop, f: Omit<Fact, 'p'>) => {
    const k = keyOf(p)
    if (facts.has(k)) return false
    facts.set(k, { p, ...f })
    return true
  }
  stmts.forEach((s, i) => {
    for (const p of s.props) add(p, s.few ? { kind: 'few', from: [], src: i } : { kind: 'given', from: [], src: i })
  })
  for (let changed = true; changed; ) {
    changed = false
    const cur = [...facts.values()]
    const fresh: [Prop, string[]][] = []
    for (const a of cur) {
      for (const p of convert(a.p)) fresh.push([p, [keyOf(a.p)]])
      for (const b of cur) {
        if (a === b) continue
        const p = combine(a.p, b.p)
        if (p) fresh.push([p, [keyOf(a.p), keyOf(b.p)]])
      }
    }
    for (const [p, from] of fresh) if (add(p, { kind: 'derived', from, src: -1 })) changed = true
  }
  return facts
}

/** Ordered list of proof lines for `target`, e.g. "Some pens are books + All books are tables ⇒ Some pens are tables". */
function proofSteps(target: string, facts: Map<string, Fact>, stmts: Stmt[], t: Term[]): string[] {
  const lines: string[] = []
  const seen = new Set<string>()
  const walk = (k: string) => {
    const f = facts.get(k)!
    if (f.kind === 'given' || seen.has(k)) return
    seen.add(k)
    if (f.kind === 'few') {
      lines.push(`${stmtText(stmts[f.src], t)} ⇒ ${propText(f.p, t)}`)
      return
    }
    f.from.forEach(walk)
    lines.push(`${f.from.map((x) => propText(facts.get(x)!.p, t)).join(' + ')} ⇒ ${propText(f.p, t)}`)
  }
  walk(target)
  return lines
}

// ---------- puzzle construction ----------

type Level = 'easy' | 'medium' | 'hard'

const rnd = (n: number) => Math.floor(Math.random() * n)
const chance = (p: number) => Math.random() < p

function weightedForm(level: Level): Form {
  const w: Record<Level, [Form, number][]> = {
    easy: [['A', 35], ['E', 20], ['I', 32], ['O', 13]],
    medium: [['A', 28], ['E', 22], ['I', 30], ['O', 20]],
    hard: [['A', 28], ['E', 24], ['I', 26], ['O', 22]],
  }
  let r = rnd(100)
  for (const [f, n] of w[level]) {
    if (r < n) return f
    r -= n
  }
  return 'A'
}

function makeStmt(level: Level, x: number, y: number): Stmt {
  if (level === 'hard' && chance(0.22)) {
    return { few: true, props: [{ form: 'I', x, y }, { form: 'O', x, y }] }
  }
  return { few: false, props: [{ form: weightedForm(level), x, y }] }
}

function makeStatements(level: Level): { stmts: Stmt[]; k: number } {
  if (level === 'easy') {
    const mid = rnd(3)
    const [o1, o2] = [0, 1, 2].filter((i) => i !== mid)
    const flip = () => chance(0.5)
    const a = flip() ? [o1, mid] : [mid, o1]
    const b = flip() ? [o2, mid] : [mid, o2]
    return { k: 3, stmts: shuffle([makeStmt('easy', a[0], a[1]), makeStmt('easy', b[0], b[1])]) }
  }
  const k = level === 'medium' ? 4 : chance(0.6) ? 4 : 5
  const edges: [number, number][] = []
  for (let i = 1; i < k; i++) edges.push([rnd(i), i])
  if (level === 'hard' && k === 4) {
    // a fourth statement between two terms that are not already linked directly
    const linked = new Set(edges.map(([a, b]) => `${a}-${b}`))
    const free: [number, number][] = []
    for (let a = 0; a < k; a++) for (let b = a + 1; b < k; b++) if (!linked.has(`${a}-${b}`)) free.push([a, b])
    if (free.length) edges.push(free[rnd(free.length)])
  }
  const stmts = edges.map(([a, b]) => (chance(0.5) ? makeStmt(level, a, b) : makeStmt(level, b, a)))
  return { k, stmts: shuffle(stmts) }
}

interface Cand {
  c: Conc
  follows: boolean
  /** Not forced, but could be true in some arrangement (a classic exam trap). */
  trap: boolean
  steps: number
  lines: string[] // proof (if it follows) or the blocking fact's proof (if it cannot be true)
  blockerText?: string
  witness: () => number | null
  alsoDefinite: boolean
}

const OPPOSITE: Record<Form, Form> = { A: 'O', O: 'A', I: 'E', E: 'I' }

function buildCands(an: Analysis, stmts: Stmt[], facts: Map<string, Fact>, t: Term[]): Cand[] {
  const given = new Set(stmts.filter((s) => !s.few).map((s) => keyOf(s.props[0])))
  const out: Cand[] = []
  const k = an.k
  for (let x = 0; x < k; x++) {
    for (let y = 0; y < k; y++) {
      if (x === y) continue
      for (const form of ['A', 'E', 'I', 'O'] as Form[]) {
        const p: Prop = { form, x, y }
        const key = keyOf(p)
        const all = holdsEverywhere(an, form, x, y)
        const any = all || holdsSomewhere(an, form, x, y)
        // ---- definite conclusion ----
        if (!given.has(key)) {
          if (all) {
            const f = facts.get(key)
            if (f) {
              const lines = proofSteps(key, facts, stmts, t)
              out.push({ c: { pos: false, form, x, y }, follows: true, trap: false, steps: lines.length, lines, witness: () => null, alsoDefinite: true })
            }
          } else {
            let lines: string[] = []
            let blockerText: string | undefined
            const opp = facts.get(keyOf({ form: OPPOSITE[form], x, y }))
            if (!any && opp) {
              lines = proofSteps(keyOf(opp.p), facts, stmts, t)
              blockerText = propText(opp.p, t)
            }
            if (any || opp) {
              out.push({ c: { pos: false, form, x, y }, follows: false, trap: any, steps: 0, lines, blockerText, witness: () => witness(an, form, x, y, false), alsoDefinite: false })
            }
          }
        }
        // ---- possibility conclusion (only A, I, O forms are used) ----
        if (form === 'A' || form === 'I' || form === 'O') {
          if (any) {
            const definite = all && facts.has(key)
            if (!all || definite) {
              out.push({ c: { pos: true, form, x, y }, follows: true, trap: false, steps: 0, lines: definite ? proofSteps(key, facts, stmts, t) : [], witness: () => (definite ? null : witness(an, form, x, y, true)), alsoDefinite: definite })
            }
          } else {
            // cannot be true: the statements force the opposite
            const blocker = form === 'A' ? (facts.get(keyOf({ form: 'O', x, y })) ?? facts.get(keyOf({ form: 'E', x, y }))) : form === 'I' ? facts.get(keyOf({ form: 'E', x, y })) : facts.get(keyOf({ form: 'A', x, y }))
            if (blocker) {
              out.push({ c: { pos: true, form, x, y }, follows: false, trap: false, steps: 0, lines: proofSteps(keyOf(blocker.p), facts, stmts, t), blockerText: propText(blocker.p, t), witness: () => null, alsoDefinite: false })
            }
          }
        }
      }
    }
  }
  return out
}

const MIN_STEPS: Record<Level, number> = { easy: 1, medium: 2, hard: 3 }
const POSSIBILITY_RATE: Record<Level, number> = { easy: 0, medium: 0.3, hard: 0.45 }

const pickOne = <T,>(arr: T[]): T | null => (arr.length ? arr[rnd(arr.length)] : null)

const sameTerms = (a: Conc, b: Conc) => (a.x === b.x && a.y === b.y) || (a.x === b.y && a.y === b.x)
function complementary(a: Conc, b: Conc): boolean {
  if (a.pos || b.pos) return false
  if ((a.form === 'I' && b.form === 'E') || (a.form === 'E' && b.form === 'I')) return sameTerms(a, b)
  if ((a.form === 'A' && b.form === 'O') || (a.form === 'O' && b.form === 'A')) return a.x === b.x && a.y === b.y
  return false
}

function explainOne(label: string, cd: Cand, an: Analysis, t: Term[]): string {
  const subject = concText(cd.c, t)
  if (!cd.c.pos) {
    if (cd.follows) return `${label} follows — ${cd.lines.join('; ')}.`
    if (cd.blockerText) return `${label} does not follow — the statements actually give "${cd.blockerText}" (${cd.lines.join('; ') || 'stated directly'}).`
    return `${label} does not follow — it is not forced. A consistent picture where "${subject}" is false: ${describeArrangement(cd.witness()!, an.k, t)}.`
  }
  if (cd.follows) {
    if (cd.alsoDefinite) return `${label} is true — it even follows definitely (${cd.lines.join('; ') || 'stated directly'}), so it certainly can be true.`
    return `${label} is a genuine possibility — the statements do not rule it out. A consistent picture where it is true: ${describeArrangement(cd.witness()!, an.k, t)}.`
  }
  return `${label} cannot be true — the statements force "${cd.blockerText}" (${cd.lines.join('; ') || 'stated directly'}).`
}

const HINTS = [
  'Draw one circle per term. A "Some" conclusion needs a statement that guarantees an overlap; an "All"/"No" conclusion must hold in every possible drawing.',
  'Try to draw a picture in which the conclusion is false — if you can, it does not follow. Possibility statements only need ONE picture where they hold.',
  'Chain statements through the common term. "All + All" gives All, "All + No" gives No, "Some + All" gives Some, "Some + No" gives Some-not.',
]

function buildConclusions(level: Level, target: number): MCQQuestion | null {
  const { stmts, k } = makeStatements(level)
  const an = analyse(stmts, k)
  if (!an) return null
  const t = shuffle(TERMS).slice(0, k)
  const facts = closure(stmts)
  const all = buildCands(an, stmts, facts, t)
  const minSteps = MIN_STEPS[level]
  const followsPool = (pos: boolean) => all.filter((c) => c.follows && c.c.pos === pos && (pos || c.steps >= minSteps))
  // a genuine possibility is better practice than a definite conclusion in disguise
  const goodPos = (list: Cand[]) => { const g = list.filter((c) => !c.alsoDefinite); return g.length && chance(0.8) ? g : list }
  const notPool = (pos: boolean) => {
    const list = all.filter((c) => !c.follows && c.c.pos === pos)
    const traps = list.filter((c) => c.trap)
    return traps.length && chance(0.7) ? traps : list
  }

  let c1: Cand | null = null
  let c2: Cand | null = null
  const wantPossibility = () => chance(POSSIBILITY_RATE[level])

  if (target === 2) {
    // "Either": an opposite pair, neither of which follows on its own
    const pairs: [Cand, Cand][] = []
    const nots = all.filter((c) => !c.follows && !c.c.pos && c.trap)
    for (const a of nots) for (const b of nots) if (a !== b && complementary(a.c, b.c)) pairs.push([a, b])
    const pair = pickOne(pairs)
    if (!pair) return null
    ;[c1, c2] = pair
  } else {
    // targets 0 and 1 both mean "exactly one follows"; which slot it lands in is decided by a coin flip below
    const wantFirst = target === 0 || target === 1 || target === 4
    const wantSecond = target === 4
    const draw = (follow: boolean): Cand | null => {
      const pos = wantPossibility()
      const pool = follow ? (pos ? goodPos(followsPool(true)) : followsPool(false)) : notPool(pos)
      return pickOne(pool) ?? pickOne(follow ? followsPool(false) : notPool(false))
    }
    c1 = draw(wantFirst)
    c2 = draw(wantSecond)
    if (!c1 || !c2 || c1 === c2) return null
    if (target < 2 && chance(0.5)) [c1, c2] = [c2, c1]
    if (sameTerms(c1.c, c2.c)) return null
    // no accidental "Either": two opposite conclusions that both fail
    if (complementary(c1.c, c2.c) && !c1.follows && !c2.follows) return null
    // a pair that rules itself out with a contradictory pair of verdicts is fine; identical wording is not
    if (concText(c1.c, t) === concText(c2.c, t)) return null
  }

  const labelIdx = c1.follows && c2.follows ? 4 : c1.follows ? 0 : c2.follows ? 1 : 3
  const answerIdx = target === 2 ? 2 : labelIdx
  if (target !== 2 && (target < 2 ? labelIdx > 1 : labelIdx !== target)) return null

  const lines: string[] = []
  const explained = [explainOne('I', c1, an, t), explainOne('II', c2, an, t)]
  lines.push(...explained)
  if (target === 2) lines[0] = `Neither I nor II is forced on its own, but they are opposites of each other — one of them must be true, so Either follows.\n${explained[0]}\n${explained[1]}`
  lines.push(`Answer: ${ANSWERS[answerIdx]}.`)

  return {
    id: `syl-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    instruction: `Syllogism · ${level}`,
    context: `Statements:\n${stmts.map((s, i) => `${i + 1}. ${stmtText(s, t)}.`).join('\n')}`,
    term: `I. ${concText(c1.c, t)}.\nII. ${concText(c2.c, t)}.`,
    correctMeaning: ANSWERS[answerIdx],
    options: [...ANSWERS],
    hint: HINTS[rnd(HINTS.length)],
    explanation: lines.join('\n'),
  }
}

function buildWhichFollows(level: Level): MCQQuestion | null {
  const { stmts, k } = makeStatements(level)
  const an = analyse(stmts, k)
  if (!an) return null
  const t = shuffle(TERMS).slice(0, k)
  const facts = closure(stmts)
  const all = buildCands(an, stmts, facts, t).filter((c) => !c.c.pos)
  const correct = pickOne(all.filter((c) => c.follows && c.steps >= MIN_STEPS[level]))
  if (!correct) return null
  const nots = all.filter((c) => !c.follows)
  const traps = shuffle(nots.filter((c) => c.trap))
  const rest = shuffle(nots.filter((c) => !c.trap))
  const wrong: Cand[] = []
  const texts = new Set([concText(correct.c, t)])
  for (const c of [...traps.slice(0, 3), ...rest, ...traps.slice(3)]) {
    const txt = concText(c.c, t)
    if (texts.has(txt)) continue
    texts.add(txt)
    wrong.push(c)
    if (wrong.length === 4) break
  }
  if (wrong.length < 4) return null
  const options = shuffle([correct, ...wrong]).map((c) => `${concText(c.c, t)}.`)
  const correctText = `${concText(correct.c, t)}.`
  const lines = [
    `Follows: ${correctText} — ${correct.lines.join('; ')}.`,
    ...wrong.map((c) => explainOne(`"${concText(c.c, t)}"`, c, an, t).replace(' does not follow — ', ' does not follow: ')),
  ]
  return {
    id: `syl-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    instruction: `Syllogism · ${level}`,
    context: `Statements:\n${stmts.map((s, i) => `${i + 1}. ${stmtText(s, t)}.`).join('\n')}`,
    term: 'Which conclusion definitely follows?',
    correctMeaning: correctText,
    options,
    hint: HINTS[rnd(HINTS.length)],
    explanation: lines.join('\n'),
  }
}

/** Weighted so that every answer position turns up, with "Either" at a realistic ~12%. */
function pickTarget(): number {
  const r = rnd(100)
  if (r < 22) return 0
  if (r < 44) return 1
  if (r < 56) return 2
  if (r < 78) return 3
  return 4
}

export function generateSyllogismQuestions(difficulty: SyllogismDifficulty, format: SyllogismFormat, count: number): MCQQuestion[] {
  const out: MCQQuestion[] = []
  let guard = 0
  while (out.length < count && guard < count * 40) {
    guard++
    const level: Level = difficulty === 'mixed' ? (['easy', 'medium', 'hard'] as Level[])[out.length % 3] : difficulty
    const fmt = format === 'mixed' ? (chance(0.7) ? 'conclusions' : 'which-follows') : format
    // Stick with one target answer until a puzzle supports it — otherwise the easy-to-build answers ("Neither", "Either") would dominate.
    const target = pickTarget()
    for (let attempt = 0; attempt < 60; attempt++) {
      const q = fmt === 'conclusions' ? buildConclusions(level, target) : buildWhichFollows(level)
      if (q) {
        out.push(q)
        break
      }
    }
  }
  return out
}
