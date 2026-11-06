// Verification harness for the SBI-PO-Mains reasoning generators in src/lib/mocks/reasoning/mains/logicA.ts
// (syllogism, inequality, blood-relation).
//
// Every key is re-derived here from the RENDERED text (stems/options), with code that does not share the generator's
// code path: own parsers, own model enumerators, own kinship definitions.
//   - syllogism : every Venn model (subset of allowed regions) is enumerated; options re-decided from all models.
//   - inequality: reachability-based allowed-relation sets per pair, cross-checked by brute-force assignment search (k <= 7).
//   - blood     : every family (all gender patterns x all name->position assignments, no symmetry breaking) consistent with the
//                 parsed puzzle text is enumerated and every option of every question is evaluated in every family.
//
// Usage: npx tsx scripts/verify-mains-rlogicA.ts [--seeds N] [--topic syllogism,inequality,blood-relation] [--no-samples]
import { createRng } from '../src/lib/mocks/rng'
import { assertGroup } from '../src/lib/mocks/validate'
import type { Group, QuestionDraft, ReasoningTopicId } from '../src/lib/mocks/types'
import { MAINS_LOGIC_A, generateBloodMainsWithProof } from '../src/lib/mocks/reasoning/mains/logicA'
import type { BloodProofA } from '../src/lib/mocks/reasoning/mains/logicA'

const argv = process.argv.slice(2)
const flag = (name: string): string | undefined => {
  const i = argv.indexOf(`--${name}`)
  return i >= 0 ? argv[i + 1] : undefined
}
const SEEDS = Number(flag('seeds') ?? 300)
const TOPIC_FILTER = flag('topic')?.split(',')
const NO_SAMPLES = argv.includes('--no-samples')

const OK_EXTRA = new Set('−√∛≤≥≠₹→∴⇒≈π²³'.split(''))
function badChars(s: string): string[] {
  const bad: string[] = []
  for (const ch of s) {
    const c = ch.codePointAt(0) as number
    if (c === 10 || (c >= 32 && c <= 126) || (c >= 160 && c <= 255) || OK_EXTRA.has(ch)) continue
    bad.push(ch)
  }
  return bad
}
function check(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg)
}
const ROMAN = ['I', 'II', 'III', 'IV', 'V']

// ================================================================================================ SYLLOGISM
const NOUN_PAIRS: [string, string][] = [
  ['pen', 'pens'], ['book', 'books'], ['table', 'tables'], ['chair', 'chairs'], ['road', 'roads'], ['car', 'cars'], ['bus', 'buses'],
  ['train', 'trains'], ['flower', 'flowers'], ['tree', 'trees'], ['fruit', 'fruits'], ['bird', 'birds'], ['cat', 'cats'], ['dog', 'dogs'],
  ['house', 'houses'], ['river', 'rivers'], ['lake', 'lakes'], ['clock', 'clocks'], ['watch', 'watches'], ['mobile', 'mobiles'],
  ['laptop', 'laptops'], ['bag', 'bags'], ['key', 'keys'], ['coin', 'coins'], ['ring', 'rings'], ['chain', 'chains'], ['bell', 'bells'],
  ['drum', 'drums'], ['kite', 'kites'], ['stone', 'stones'], ['mountain', 'mountains'], ['hill', 'hills'], ['plate', 'plates'],
  ['cup', 'cups'], ['spoon', 'spoons'], ['lamp', 'lamps'], ['box', 'boxes'], ['wall', 'walls'], ['door', 'doors'], ['window', 'windows'],
  ['ship', 'ships'], ['bridge', 'bridges'], ['garden', 'gardens'], ['temple', 'temples'], ['market', 'markets'], ['school', 'schools'],
]
const SINGULAR = new Map<string, string>()
for (const [s, p] of NOUN_PAIRS) {
  SINGULAR.set(s, s)
  SINGULAR.set(p, s)
}
interface PStmt {
  t: 'A' | 'E' | 'I' | 'O' | 'F'
  x: string
  y: string
  poss: boolean
}
function parseSylStmt(line: string): PStmt {
  const sg = (w: string): string => {
    const v = SINGULAR.get(w)
    check(v, `unknown noun ${w}`)
    return v
  }
  const tries: [RegExp, PStmt['t'], boolean][] = [
    [/^All (\w+) being (\w+) is a possibility$/, 'A', true],
    [/^No (\w+) being an? (\w+) is a possibility$/, 'E', true],
    [/^Some (\w+) being (\w+) is a possibility$/, 'I', true],
    [/^Some (\w+) not being (\w+) is a possibility$/, 'O', true],
    [/^All (\w+) are (\w+)$/, 'A', false],
    [/^No (\w+) is an? (\w+)$/, 'E', false],
    [/^Some (\w+) are not (\w+)$/, 'O', false],
    [/^Some (\w+) are (\w+)$/, 'I', false],
    [/^Only a few (\w+) are (\w+)$/, 'F', false],
  ]
  for (const [re, t, poss] of tries) {
    const m = re.exec(line.trim().replace(/\.$/, ''))
    if (m) return { t, x: sg(m[1]), y: sg(m[2]), poss }
  }
  throw new Error(`cannot parse syllogism statement "${line}"`)
}

interface Sat {
  none: boolean
  m: number // mask over `regs` indices
}
function sylModelCheck(prem: PStmt[], terms: string[]): { regs: number[]; models: number[]; atom: (s: PStmt) => Sat[] } {
  const k = terms.length
  const ti = (w: string) => terms.indexOf(w)
  // region r (bit t = member of term t); regions forbidden by a universal premise are removed (one individual would violate it)
  const forbidden = (r: number): boolean =>
    prem.some((p) => {
      const x = (r >> ti(p.x)) & 1
      const y = (r >> ti(p.y)) & 1
      return (p.t === 'A' && x && !y) || (p.t === 'E' && x && y)
    })
  const regs: number[] = []
  for (let r = 1; r < 1 << k; r++) if (!forbidden(r)) regs.push(r)
  check(regs.length <= 20, `too many regions ${regs.length}`)
  const maskOver = (pred: (r: number) => boolean): number => {
    let m = 0
    regs.forEach((r, i) => {
      if (pred(r)) m |= 1 << i
    })
    return m
  }
  const atom = (s: PStmt): Sat[] => {
    const x = ti(s.x)
    const y = ti(s.y)
    const xy = maskOver((r) => !!((r >> x) & 1) && !!((r >> y) & 1))
    const xny = maskOver((r) => !!((r >> x) & 1) && !((r >> y) & 1))
    switch (s.t) {
      case 'A':
        return [{ none: true, m: xny }]
      case 'E':
        return [{ none: true, m: xy }]
      case 'I':
        return [{ none: false, m: xy }]
      case 'O':
        return [{ none: false, m: xny }]
      default:
        return [{ none: false, m: xy }, { none: false, m: xny }]
    }
  }
  const needSome: number[] = []
  for (const p of prem) for (const a of atom(p)) if (!a.none) needSome.push(a.m)
  for (let t = 0; t < k; t++) needSome.push(maskOver((r) => !!((r >> t) & 1)))
  const models: number[] = []
  const R = regs.length
  for (let s = 1; s < 1 << R; s++) if (needSome.every((m) => (s & m) !== 0)) models.push(s)
  return { regs, models, atom }
}

function descTextV(set: number[], either: [number, number] | null, n: number, v: { one: string; many: string; none: string; all: string }): string {
  const labels = set.slice().sort((a, b) => a - b).map((i) => ROMAN[i])
  const jn = (xs: string[]) => (xs.length <= 1 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`)
  if (either) {
    const e = `either ${ROMAN[either[0]]} or ${ROMAN[either[1]]}`
    if (!labels.length) return `${e[0].toUpperCase()}${e.slice(1)} ${v.one}`
    return `Only ${jn([...labels, e])} ${v.many}`
  }
  if (labels.length === 0) return v.none
  if (labels.length === n) return v.all
  return `Only ${jn(labels)} ${labels.length === 1 ? v.one : v.many}`
}

function verifySyllogism(q: QuestionDraft): string {
  const lines = q.stem.split('\n')
  const si = lines.indexOf('Statements:')
  check(si >= 0, 'no Statements:')
  let ci = lines.indexOf('Conclusions:')
  const stmtEnd = ci >= 0 ? ci : lines.length - 1
  const prem = lines.slice(si + 1, stmtEnd).map(parseSylStmt)
  check(prem.length >= 4 && prem.length <= 5, `premise count ${prem.length}`)
  check(prem.every((p) => !p.poss), 'premise parsed as possibility')
  const terms: string[] = []
  for (const p of prem) for (const w of [p.x, p.y]) if (!terms.includes(w)) terms.push(w)
  check(terms.length === 4 || terms.length === 5, `term count ${terms.length}`)
  const { models, atom } = sylModelCheck(prem, terms)
  check(models.length > 0, 'premises inconsistent')
  const holds = (m: number, a: Sat[]) => a.every((s) => (s.none ? (m & s.m) === 0 : (m & s.m) !== 0))
  const allIn = (s: PStmt) => models.every((m) => holds(m, atom(s)))
  const anyIn = (s: PStmt) => models.some((m) => holds(m, atom(s)))
  const status = (s: PStmt) => (s.poss ? anyIn(s) : allIn(s))
  const stem0 = lines[0]
  if (ci >= 0) {
    const concl = lines.slice(ci + 1).map((l) => parseSylStmt(l.replace(/^[IV]+\.\s*/, '')))
    const N = concl.length
    check(N >= 2 && N <= 5, 'conclusion count')
    const st = concl.map(status)
    const follow = st.map((v, i) => (v ? i : -1)).filter((i) => i >= 0)
    // complementary pairs: exactly one of the two is true in every model (both definite conclusions, neither follows)
    const pairs: [number, number][] = []
    for (let i = 0; i < N; i++)
      for (let j = i + 1; j < N; j++) {
        if (st[i] || st[j] || concl[i].poss || concl[j].poss) continue
        if (models.every((m) => holds(m, atom(concl[i])) !== holds(m, atom(concl[j])))) pairs.push([i, j])
      }
    check(pairs.length <= 1, 'more than one either-or pair')
    const either = pairs[0] ?? null
    if (N === 2) {
      let ans: number
      if (st[0] && st[1]) ans = 4
      else if (st[0]) ans = 0
      else if (st[1]) ans = 1
      else if (either) ans = 2
      else {
        ans = 3
        const cover = models.every((m) => (!concl[0].poss && holds(m, atom(concl[0]))) || (!concl[1].poss && holds(m, atom(concl[1]))))
        check(!cover, 'debatable joint cover (neither follows but they exhaust all models)')
      }
      check(q.answer === ans, `two-conclusion key ${q.answer} != recomputed ${ans}`)
      check(q.options[2] === 'Either conclusion I or II follows' && q.options.length === 5, 'standard options changed')
      return `two:${ans}`
    }
    const isPoss = concl.every((c) => c.poss)
    check(isPoss || concl.every((c) => !c.poss), 'mixed possibility set')
    const verbs = isPoss
      ? { one: 'is a possibility', many: 'are possibilities', none: 'None is a possibility', all: 'All are possibilities' }
      : { one: 'follows', many: 'follow', none: 'None follows', all: 'All follow' }
    const expected = descTextV(follow, isPoss ? null : either, N, verbs)
    check(q.options[q.answer] === expected, `set key "${q.options[q.answer]}" != recomputed "${expected}"`)
    check(q.options.filter((o) => o === expected).length === 1, 'duplicate expected option')
    return `${isPoss ? 'poss' : 'set'}:${N}`
  }
  // single-answer forms: options are conclusions
  const opts = q.options.map(parseSylStmt)
  check(opts.every((o) => !o.poss), 'possibility option')
  const flagStem = lines[lines.length - 1]
  if (/definitely follows/.test(flagStem)) {
    const def = opts.map(allIn)
    check(def.filter(Boolean).length === 1 && def[q.answer], `"definitely follows": ${def.filter(Boolean).length} definite options, key ${q.answer} def=${def[q.answer]}`)
    return 'one'
  }
  check(/NEVER be true/.test(flagStem), `unknown single-answer stem "${flagStem}"`)
  const impossible = opts.map((o) => !anyIn(o))
  check(impossible.filter(Boolean).length === 1 && impossible[q.answer], `"never true": ${impossible.filter(Boolean).length} impossible options`)
  void stem0
  return 'never'
}

// ================================================================================================ INEQUALITY
type R5 = '>' | '<' | '≥' | '≤' | '='
const PHRASE: Record<string, R5> = {
  'X is greater than Y': '>',
  'X is neither smaller than nor equal to Y': '>',
  'X is smaller than Y': '<',
  'X is neither greater than nor equal to Y': '<',
  'X is either greater than or equal to Y': '≥',
  'X is not smaller than Y': '≥',
  'X is either smaller than or equal to Y': '≤',
  'X is not greater than Y': '≤',
  'X is equal to Y': '=',
  'X is neither greater than nor smaller than Y': '=',
}
// relation as set of orderings of (a,b): bit0 a<b, bit1 a=b, bit2 a>b
const ORD: Record<R5, number> = { '<': 1, '=': 2, '>': 4, '≤': 3, '≥': 6 }

function verifyInequality(q: QuestionDraft): string {
  const lines = q.stem.split('\n')
  const sym = new Map<string, R5>()
  const raw = new Set<string>(['>', '<', '≥', '≤', '='])
  let coded = false
  for (const l of lines) {
    const m = /^'X (\S+) Y' means '(.*)'\.$/.exec(l)
    if (m) {
      coded = true
      const rel = PHRASE[m[2]]
      check(rel, `unknown meaning "${m[2]}"`)
      check(!sym.has(m[1]), 'duplicate symbol')
      sym.set(m[1], rel)
    }
  }
  if (coded) check(sym.size === 4 || sym.size === 5, `legend has ${sym.size} symbols`)
  check(new Set([...sym.values()]).size === sym.size, 'two symbols with the same meaning')
  const dec = (s: string): R5 => {
    if (coded) {
      const r = sym.get(s)
      check(r, `undefined symbol ${s}`)
      return r
    }
    check(raw.has(s), `bad symbol ${s}`)
    return s as R5
  }
  const si = lines.indexOf('Statements:')
  check(si >= 0, 'no Statements')
  let end = lines.findIndex((l, i) => i > si && (l === 'Conclusions:' || /^(Which of the following)/.test(l)))
  check(end > si, 'no end of statements')
  const letters: string[] = []
  const idx = (l: string) => {
    let i = letters.indexOf(l)
    if (i < 0) {
      letters.push(l)
      i = letters.length - 1
    }
    return i
  }
  const edges: { a: number; rel: R5; b: number }[] = []
  for (const line of lines.slice(si + 1, end)) {
    const tok = line.trim().split(/\s+/)
    check(tok.length % 2 === 1 && tok.length >= 3, `bad chain "${line}"`)
    for (let i = 0; i + 2 < tok.length + 0; i += 2) edges.push({ a: idx(tok[i]), rel: dec(tok[i + 1]), b: idx(tok[i + 2]) })
  }
  const k = letters.length
  check(edges.length >= 7 && edges.length <= 9, `statement symbol count ${edges.length}`)
  check(k >= 7 && k <= 10, `letter count ${k}`)
  // reachability closure by BFS over (node, strictSeen)
  const adj: { to: number; strict: boolean }[][] = Array.from({ length: k }, () => [])
  const addLe = (u: number, v: number, strict: boolean) => adj[u].push({ to: v, strict })
  for (const e of edges) {
    if (e.rel === '>') addLe(e.b, e.a, true)
    else if (e.rel === '≥') addLe(e.b, e.a, false)
    else if (e.rel === '<') addLe(e.a, e.b, true)
    else if (e.rel === '≤') addLe(e.a, e.b, false)
    else {
      addLe(e.a, e.b, false)
      addLe(e.b, e.a, false)
    }
  }
  const leq: boolean[][] = Array.from({ length: k }, () => new Array<boolean>(k).fill(false))
  const lt: boolean[][] = Array.from({ length: k }, () => new Array<boolean>(k).fill(false))
  for (let s = 0; s < k; s++) {
    const seen = new Set<string>([`${s}0`])
    const stack: [number, number][] = [[s, 0]]
    while (stack.length) {
      const [u, st] = stack.pop() as [number, number]
      leq[s][u] = true
      if (st) lt[s][u] = true
      for (const e of adj[u]) {
        const ns = st || e.strict ? 1 : 0
        const key = `${e.to}${ns}`
        if (seen.has(key)) continue
        seen.add(key)
        stack.push([e.to, ns])
      }
    }
  }
  for (let i = 0; i < k; i++) check(!lt[i][i], 'statements inconsistent')
  // allowed orderings of the pair (a,b)
  const allowed = (a: number, b: number): number => (leq[b][a] ? 0 : 1) | (!lt[a][b] && !lt[b][a] ? 2 : 0) | (leq[a][b] ? 0 : 4)
  interface PC {
    a: number
    rel: R5
    b: number
  }
  const parseCon = (s: string): PC => {
    const tok = s.trim().split(/\s+/)
    check(tok.length === 3, `bad expression "${s}"`)
    return { a: idx(tok[0]), rel: dec(tok[1]), b: idx(tok[2]) }
  }
  const entailed = (c: PC) => (allowed(c.a, c.b) & ~ORD[c.rel]) === 0
  const impossible = (c: PC) => (allowed(c.a, c.b) & ORD[c.rel]) === 0
  const adjacent = (a: number, b: number) => edges.some((e) => (e.a === a && e.b === b) || (e.a === b && e.b === a))

  // independent brute-force confirmation for small instances
  if (k <= 7) {
    const val = new Array<number>(k).fill(0)
    const rel2 = (r: R5, x: number, y: number) => (r === '>' ? x > y : r === '<' ? x < y : r === '≥' ? x >= y : r === '≤' ? x <= y : x === y)
    const sat: number[][] = []
    const dfs = (i: number): void => {
      if (i === k) {
        sat.push(val.slice())
        return
      }
      for (let v = 0; v < k; v++) {
        val[i] = v
        let ok = true
        for (const e of edges) if (e.a <= i && e.b <= i && !rel2(e.rel, val[e.a], val[e.b])) ok = false
        if (ok) dfs(i + 1)
      }
    }
    dfs(0)
    check(sat.length > 0, 'brute force: no satisfying assignment')
    for (let a = 0; a < k; a++)
      for (let b = 0; b < k; b++) {
        if (a === b) continue
        let mask = 0
        for (const v of sat) mask |= v[a] < v[b] ? 1 : v[a] === v[b] ? 2 : 4
        check(mask === allowed(a, b), 'reachability disagrees with brute force')
      }
  }

  const stdOpts = ['Only conclusion I is true', 'Only conclusion II is true', 'Either conclusion I or II is true', 'Neither conclusion I nor II is true', 'Both conclusions I and II are true']
  const ci = lines.indexOf('Conclusions:')
  if (ci >= 0) {
    const concl = lines.slice(ci + 1).map((l) => parseCon(l.replace(/^[IV]+\.\s*/, '')))
    const N = concl.length
    for (const c of concl) check(!adjacent(c.a, c.b), 'conclusion on directly stated pair')
    const ent = concl.map(entailed)
    // either-or: same pair, neither entailed, exactly one holds in every allowed ordering
    const pairs: [number, number][] = []
    for (let i = 0; i < N; i++)
      for (let j = i + 1; j < N; j++) {
        if (ent[i] || ent[j]) continue
        if (!((concl[i].a === concl[j].a && concl[i].b === concl[j].b) || (concl[i].a === concl[j].b && concl[i].b === concl[j].a))) continue
        const flipMask = (c: PC, a: number): number => {
          const o = ORD[c.rel]
          return c.a === a ? o : ((o & 1 ? 4 : 0) | (o & 2) | (o & 4 ? 1 : 0))
        }
        const al = allowed(concl[i].a, concl[i].b)
        const m1 = flipMask(concl[i], concl[i].a) & al
        const m2 = flipMask(concl[j], concl[i].a) & al
        if ((m1 | m2) === al && (m1 & m2) === 0) pairs.push([i, j])
        else check(!((m1 | m2) === al), 'debatable overlapping cover')
      }
    check(pairs.length <= 1, 'several either-or pairs')
    const follow = ent.map((v, i) => (v ? i : -1)).filter((i) => i >= 0)
    if (N === 2) {
      const ans = ent[0] && ent[1] ? 4 : ent[0] ? 0 : ent[1] ? 1 : pairs.length ? 2 : 3
      check(q.answer === ans, `two-conclusion key ${q.answer} != ${ans}`)
      check(q.options.every((o, i) => o === stdOpts[i]), 'standard options changed')
      return `two:${ans}`
    }
    const expected = descTextV(follow, pairs[0] ?? null, N, { one: 'is true', many: 'are true', none: 'None is true', all: 'All are true' })
    check(q.options[q.answer] === expected, `key "${q.options[q.answer]}" != recomputed "${expected}"`)
    return `sub${N}`
  }
  const last = lines[lines.length - 1]
  const opts = q.options.map(parseCon)
  for (const c of opts) check(!adjacent(c.a, c.b), 'option on directly stated pair')
  if (/definitely true/.test(last)) {
    const e = opts.map(entailed)
    check(e.filter(Boolean).length === 1 && e[q.answer], `${e.filter(Boolean).length} definitely-true options`)
    return 'tf'
  }
  check(/NEVER be true/.test(last), `unknown stem "${last}"`)
  const imp = opts.map(impossible)
  check(imp.filter(Boolean).length === 1 && imp[q.answer], `${imp.filter(Boolean).length} impossible options`)
  return 'tfalse'
}

// ================================================================================================ BLOOD RELATIONS
const PRIM8 = ['father', 'mother', 'son', 'daughter', 'brother', 'sister', 'husband', 'wife']
const GENDERED = [
  ...PRIM8, 'paternal grandfather', 'paternal grandmother', 'maternal grandfather', 'maternal grandmother', 'grandson', 'granddaughter', 'paternal uncle',
  'maternal uncle', 'paternal aunt', 'maternal aunt', 'uncle', 'aunt', 'nephew', 'niece', 'brother-in-law', 'sister-in-law', 'father-in-law', 'mother-in-law',
  'son-in-law', 'daughter-in-law',
]
const NEUTRAL = ['sibling', 'cousin', 'child', 'parent', 'grandparent', 'grandchild', 'spouse']
const ALL_ANS = [...GENDERED, 'cousin']
const PLURALS: Record<string, string> = {
  brothers: 'brother', sisters: 'sister', cousins: 'cousin', sons: 'son', daughters: 'daughter', nephews: 'nephew', nieces: 'niece', grandsons: 'grandson',
  granddaughters: 'granddaughter', 'paternal uncles': 'paternal uncle', 'paternal aunts': 'paternal aunt', 'maternal uncles': 'maternal uncle', 'maternal aunts': 'maternal aunt',
}

/** A concrete family: person p (position id) has parents list, spouse (or -1), male flag. */
interface Fam {
  n: number
  male: boolean[]
  par: number[][]
  spouse: number[]
}
function famFrom(k: number, m: number, g: number[], bitsOfPattern: number): Fam {
  // positions: 0 husband, 1 wife; kids 2..k+1; spouses of first m kids; grandchildren.
  const n = 2 + k + m + g.reduce((a, b) => a + b, 0)
  const male = new Array<boolean>(n).fill(false)
  const par: number[][] = Array.from({ length: n }, () => [])
  const spouse = new Array<number>(n).fill(-1)
  male[0] = true
  spouse[0] = 1
  spouse[1] = 0
  let b = 0
  for (let i = 0; i < k; i++) {
    male[2 + i] = ((bitsOfPattern >> b++) & 1) === 1
    par[2 + i] = [0, 1]
  }
  for (let i = 0; i < m; i++) {
    const s = 2 + k + i
    male[s] = !male[2 + i]
    spouse[s] = 2 + i
    spouse[2 + i] = s
  }
  let next = 2 + k + m
  for (let i = 0; i < m; i++)
    for (let j = 0; j < g[i]; j++) {
      male[next] = ((bitsOfPattern >> b++) & 1) === 1
      par[next] = [2 + i, 2 + k + i]
      next++
    }
  return { n, male, par, spouse }
}

const isPar = (f: Fam, p: number, c: number): boolean => f.par[c].includes(p)
const sibOf = (f: Fam, a: number, b: number): boolean => a !== b && f.par[a].length > 0 && f.par[a].some((p) => f.par[b].includes(p))
const allP = (f: Fam): number[] => Array.from({ length: f.n }, (_, i) => i)

function relHolds(f: Fam, term: string, x: number, y: number): boolean {
  const P = allP(f)
  const M = f.male[x]
  const gp = (a: number, b: number) => P.some((p) => isPar(f, p, b) && isPar(f, a, p)) // a is a grandparent of b
  const parOfY = P.filter((p) => isPar(f, p, y))
  switch (term) {
    case 'father':
      return isPar(f, x, y) && M
    case 'mother':
      return isPar(f, x, y) && !M
    case 'son':
      return isPar(f, y, x) && M
    case 'daughter':
      return isPar(f, y, x) && !M
    case 'brother':
      return sibOf(f, x, y) && M
    case 'sister':
      return sibOf(f, x, y) && !M
    case 'husband':
      return f.spouse[y] === x && M
    case 'wife':
      return f.spouse[y] === x && !M
    case 'paternal grandfather':
      return M && P.some((p) => isPar(f, p, y) && f.male[p] && isPar(f, x, p))
    case 'paternal grandmother':
      return !M && P.some((p) => isPar(f, p, y) && f.male[p] && isPar(f, x, p))
    case 'maternal grandfather':
      return M && P.some((p) => isPar(f, p, y) && !f.male[p] && isPar(f, x, p))
    case 'maternal grandmother':
      return !M && P.some((p) => isPar(f, p, y) && !f.male[p] && isPar(f, x, p))
    case 'grandson':
      return M && gp(y, x)
    case 'granddaughter':
      return !M && gp(y, x)
    case 'paternal uncle':
      return M && parOfY.some((p) => f.male[p] && sibOf(f, x, p))
    case 'maternal uncle':
      return M && parOfY.some((p) => !f.male[p] && sibOf(f, x, p))
    case 'paternal aunt':
      return !M && parOfY.some((p) => f.male[p] && sibOf(f, x, p))
    case 'maternal aunt':
      return !M && parOfY.some((p) => !f.male[p] && sibOf(f, x, p))
    case 'uncle':
      return M && f.spouse[x] >= 0 && parOfY.some((p) => sibOf(f, f.spouse[x], p))
    case 'aunt':
      return !M && f.spouse[x] >= 0 && parOfY.some((p) => sibOf(f, f.spouse[x], p))
    case 'nephew':
    case 'niece':
      return (term === 'nephew') === M && f.par[x].some((p) => sibOf(f, p, y) || (f.spouse[y] >= 0 && sibOf(f, p, f.spouse[y])))
    case 'cousin':
      return x !== y && f.par[x].some((p) => parOfY.some((q) => sibOf(f, p, q)))
    case 'brother-in-law':
    case 'sister-in-law': {
      if ((term === 'brother-in-law') !== M) return false
      return (f.spouse[x] >= 0 && sibOf(f, f.spouse[x], y)) || (f.spouse[y] >= 0 && sibOf(f, x, f.spouse[y]))
    }
    case 'father-in-law':
      return M && f.spouse[y] >= 0 && isPar(f, x, f.spouse[y])
    case 'mother-in-law':
      return !M && f.spouse[y] >= 0 && isPar(f, x, f.spouse[y])
    case 'son-in-law':
      return M && f.spouse[x] >= 0 && isPar(f, y, f.spouse[x])
    case 'daughter-in-law':
      return !M && f.spouse[x] >= 0 && isPar(f, y, f.spouse[x])
    case 'sibling':
      return sibOf(f, x, y)
    case 'spouse':
      return f.spouse[y] === x
    case 'parent':
      return isPar(f, x, y)
    case 'child':
      return isPar(f, y, x)
    case 'grandparent':
      return gp(x, y)
    case 'grandchild':
      return gp(y, x)
  }
  throw new Error(`unknown term ${term}`)
}
/** wider everyday readings (used to make sure no wrong option is definitely true under them) */
function relBroad(f: Fam, term: string, x: number, y: number): boolean {
  if (relHolds(f, term, x, y)) return true
  if (term === 'uncle') return relHolds(f, 'paternal uncle', x, y) || relHolds(f, 'maternal uncle', x, y)
  if (term === 'aunt') return relHolds(f, 'paternal aunt', x, y) || relHolds(f, 'maternal aunt', x, y)
  if (term === 'brother-in-law') return f.male[x] && f.spouse[x] >= 0 && f.spouse[y] >= 0 && sibOf(f, f.spouse[x], f.spouse[y])
  if (term === 'sister-in-law') return !f.male[x] && f.spouse[x] >= 0 && f.spouse[y] >= 0 && sibOf(f, f.spouse[x], f.spouse[y])
  return false
}
function funcOf(f: Fam, term: string, y: number): number {
  const P = allP(f)
  const found = P.filter((x) => (term === 'spouse' ? f.spouse[y] === x : relHolds(f, term, x, y)))
  check(found.length <= 1, `functional term ${term} not unique`)
  return found.length ? found[0] : -1
}

type ParsedClue =
  | { k: 'rel'; term: string; x: string; y: string }
  | { k: 'only'; sex: string; x: string; y: string; via: string }
function parseClueLine(line: string, legend: Map<string, string>): ParsedClue[] {
  let m = /^([A-Z]) is the only (son|daughter|child) of ([A-Z])'s ([a-z ]+)\.$/.exec(line)
  if (m) return [{ k: 'only', sex: m[2], x: m[1], y: m[3], via: m[4] }]
  m = /^([A-Z]) is married to ([A-Z])\.$/.exec(line)
  if (m) return [{ k: 'rel', term: 'spouse', x: m[1], y: m[2] }]
  m = /^([A-Z]) is a (sibling|cousin|child|parent|grandparent|grandchild) of ([A-Z])\.$/.exec(line)
  if (m) return [{ k: 'rel', term: m[2], x: m[1], y: m[3] }]
  m = /^([A-Z]) is the ([a-z -]+) of ([A-Z])\.$/.exec(line)
  if (m) return [{ k: 'rel', term: m[2], x: m[1], y: m[3] }]
  const tok = line.replace(/\.$/, '').split(' ')
  if (legend.size && tok.length >= 3 && tok.length % 2 === 1) {
    const out: ParsedClue[] = []
    for (let i = 0; i + 2 < tok.length; i += 2) {
      const term = legend.get(tok[i + 1])
      check(term, `unknown operator in "${line}"`)
      out.push({ k: 'rel', term, x: tok[i], y: tok[i + 2] })
    }
    return out
  }
  throw new Error(`cannot parse clue "${line}"`)
}

function bloodVerify(g: Group, proof: BloodProofA): number {
  const paras = ((g.stimulus as NonNullable<Group['stimulus']>).parts[0] as { paragraphs: string[] }).paragraphs
  const nm = /^(\d+) persons - ([A-Z, ]+) - form one family/.exec(paras[0])
  check(nm && Number(nm[1]) === proof.n, 'structure paragraph n')
  const names = nm[2].split(', ')
  check(names.length === proof.n && new Set(names).size === proof.n, 'names')
  check(new RegExp(`with ${['no', 'one', 'two', 'three', 'four'][proof.k]} children`).test(paras[1]), 'structure text k')
  const legend = new Map<string, string>()
  for (const p of paras) {
    if (!p.startsWith('In a certain code language: ')) continue
    for (const part of p.slice('In a certain code language: '.length).split('. A chain')[0].split('; ')) {
      const mm = /^'P (\S+) Q' means 'P is the ([a-z]+) of Q'$/.exec(part)
      check(mm, `legend "${part}"`)
      legend.set(mm[1], mm[2])
    }
  }
  const sp = paras.find((p) => p.startsWith('Statements:')) as string
  const clueLines = sp.split('\n').slice(1).map((l) => l.replace(/^\d+\.\s*/, ''))
  const clues = clueLines.flatMap((l) => parseClueLine(l, legend))
  // person order for DFS: first appearance
  const order: string[] = []
  for (const c of clues) for (const w of [c.x, c.y]) if (!order.includes(w)) order.push(w)
  check(order.length === proof.n, `clues mention ${order.length} of ${proof.n} persons`)
  const pos = (w: string) => order.indexOf(w)
  const at = clues.map((c) => Math.max(pos(c.x), pos(c.y)))
  const nbits = proof.k + proof.g.reduce((a, b) => a + b, 0)
  // every model: (family, assignment of names to positions)
  const models: { fam: Fam; at: Int8Array }[] = []
  for (let pat = 0; pat < 1 << nbits; pat++) {
    const fam = famFrom(proof.k, proof.m, proof.g, pat)
    const assign = new Int8Array(order.length).fill(-1) // order index -> position
    const used = new Array<boolean>(fam.n).fill(false)
    const ok = (c: ParsedClue): boolean => {
      const x = assign[pos(c.x)]
      const y = assign[pos(c.y)]
      if (c.k === 'rel') return relHolds(fam, c.term, x, y)
      const z = funcOf(fam, c.via, y)
      if (z < 0) return false
      const kids = allP(fam).filter((s) => isPar(fam, z, s) && (c.sex === 'child' || fam.male[s] === (c.sex === 'son')))
      return kids.length === 1 && kids[0] === x
    }
    const dfs = (d: number): void => {
      if (d === order.length) {
        models.push({ fam, at: Int8Array.from(assign) })
        check(models.length < 60000, 'verifier model explosion')
        return
      }
      for (let s = 0; s < fam.n; s++) {
        if (used[s]) continue
        assign[d] = s
        used[s] = true
        let good = true
        for (let ci = 0; ci < clues.length; ci++)
          if (at[ci] === d && !ok(clues[ci])) {
            good = false
            break
          }
        if (good) dfs(d + 1)
        used[s] = false
        assign[d] = -1
      }
    }
    dfs(0)
  }
  check(models.length > 0, 'no model satisfies the clues')
  const P = (w: string): number => {
    const i = pos(w)
    check(i >= 0, `unknown person ${w}`)
    return i
  }
  const pt = (m: { at: Int8Array }, w: string) => m.at[P(w)]
  const stat = (f: (m: { fam: Fam; at: Int8Array }) => boolean): 'all' | 'some' | 'none' => {
    let t = 0
    for (const m of models) if (f(m)) t++
    return t === 0 ? 'none' : t === models.length ? 'all' : 'some'
  }
  let checked = 0
  for (const q of g.questions) {
    const stem = q.stem
    const optTxt = q.options
    let m: RegExpExecArray | null
    const termOf = (o: string) => o.charAt(0).toLowerCase() + o.slice(1)
    if ((m = /^How is ([A-Z]) related to (?:the ([a-z -]+) of )?([A-Z])\?$/.exec(stem))) {
      const [, X, via, Y] = m
      const claim = (term: string) => (mm: { fam: Fam; at: Int8Array }) => {
        const sy = via ? funcOf(mm.fam, via, pt(mm, Y)) : pt(mm, Y)
        if (sy < 0 || sy === pt(mm, X)) return false
        return relHolds(mm.fam, term, pt(mm, X), sy)
      }
      const broad = (term: string) => (mm: { fam: Fam; at: Int8Array }) => {
        const sy = via ? funcOf(mm.fam, via, pt(mm, Y)) : pt(mm, Y)
        if (sy < 0 || sy === pt(mm, X)) return false
        return relBroad(mm.fam, term, pt(mm, X), sy)
      }
      const defTerms = ALL_ANS.filter((t) => stat(claim(t)) === 'all')
      if (optTxt[q.answer] === 'Cannot be determined') {
        check(defTerms.length === 0, `CBD keyed but ${defTerms.join(',')} holds in all models`)
        for (const o of optTxt) if (o !== 'Cannot be determined') check(stat(broad(termOf(o))) !== 'all', `option ${o} definite under CBD key`)
      } else {
        const key = termOf(optTxt[q.answer])
        check(stat(claim(key)) === 'all', `key "${key}" does not hold in all ${models.length} models`)
        for (const [i, o] of optTxt.entries()) {
          if (i === q.answer) continue
          if (o === 'Cannot be determined') continue
          check(stat(broad(termOf(o))) !== 'all', `wrong option "${o}" is definitely true under a broad reading`)
        }
      }
    } else if ((m = /^How many (.+) does ([A-Z]) have in the family\?$/.exec(stem))) {
      const term = PLURALS[m[1]]
      check(term, `plural ${m[1]}`)
      const counts = new Set<number>()
      for (const mm of models) {
        let c = 0
        for (const w of order) if (w !== m[2] && relHolds(mm.fam, term, pt(mm, w), pt(mm, m[2]))) c++
        counts.add(c)
      }
      checkCount(counts, optTxt, q.answer)
    } else if ((m = /^How many (male members|female members|mothers|fathers) are there in the family\?$/.exec(stem))) {
      const counts = new Set<number>()
      for (const mm of models) {
        const f = mm.fam
        const P2 = allP(f)
        let c = 0
        if (m[1] === 'male members') c = P2.filter((p) => f.male[p]).length
        else if (m[1] === 'female members') c = P2.filter((p) => !f.male[p]).length
        else if (m[1] === 'mothers') c = P2.filter((p) => !f.male[p] && P2.some((ch) => isPar(f, p, ch))).length
        else c = P2.filter((p) => f.male[p] && P2.some((ch) => isPar(f, p, ch))).length
        counts.add(c)
      }
      checkCount(counts, optTxt, q.answer)
    } else if ((m = /^Who among the following is the ([a-z -]+) of ([A-Z])\?$/.exec(stem))) {
      const [, term, Y] = m
      const defs = optTxt.map((o) => stat((mm) => relHolds(mm.fam, term, pt(mm, o), pt(mm, Y))) === 'all')
      check(defs.filter(Boolean).length === 1 && defs[q.answer], `who: ${defs.filter(Boolean).length} definite options`)
      for (const [i, o] of optTxt.entries()) if (i !== q.answer) check(stat((mm) => relBroad(mm.fam, term, pt(mm, o), pt(mm, Y))) !== 'all', 'who: wrong option definite (broad)')
    } else if (stem === 'Which of the following statements is definitely true?') {
      const parsed = optTxt.map((o) => parseClueLine(`${o}.`, legend))
      const defs = parsed.map((cl) => stat((mm) => cl.every((c) => c.k === 'rel' && relHolds(mm.fam, c.term, pt(mm, c.x), pt(mm, c.y)))) === 'all')
      check(defs.filter(Boolean).length === 1 && defs[q.answer], `statements: ${defs.filter(Boolean).length} definite options`)
      for (const [i, cl] of parsed.entries()) if (i !== q.answer) check(stat((mm) => cl.every((c) => c.k === 'rel' && relBroad(mm.fam, c.term, pt(mm, c.x), pt(mm, c.y)))) !== 'all', 'statement wrong option definite (broad)')
    } else if (stem === 'Which of the following expressions is definitely true?') {
      check(legend.size === 5, 'coded question without a 5-operator legend')
      const parsed = optTxt.map((o) => parseClueLine(`${o}.`, legend))
      const defs = parsed.map((cl) => stat((mm) => cl.every((c) => c.k === 'rel' && relHolds(mm.fam, c.term, pt(mm, c.x), pt(mm, c.y)))) === 'all')
      check(defs.filter(Boolean).length === 1 && defs[q.answer], `coded: ${defs.filter(Boolean).length} definite options`)
    } else throw new Error(`unrecognised blood stem "${stem}"`)
    checked++
  }
  void NEUTRAL
  return checked
}
function checkCount(counts: Set<number>, opts: string[], answer: number): void {
  if (opts[answer] === 'Cannot be determined') {
    check(counts.size > 1, 'CBD keyed but the count is the same in all models')
    for (const o of opts) if (o !== 'Cannot be determined') check(Number.isInteger(Number(o)), 'non-numeric option')
    return
  }
  check(counts.size === 1 && [...counts][0] === Number(opts[answer]), `count key ${opts[answer]} != models ${[...counts].join('/')}`)
  for (const [i, o] of opts.entries()) if (i !== answer && o !== 'Cannot be determined') check(Number(o) !== Number(opts[answer]), 'duplicate numeric option')
}

// ================================================================================================ harness
interface Spec {
  id: ReasoningTopicId
  counts: (seed: number) => number
  verify: (q: QuestionDraft) => string
}
const SPECS: Spec[] = [
  { id: 'syllogism', counts: (s) => 1 + (s % 8), verify: verifySyllogism },
  { id: 'inequality', counts: (s) => 1 + (s % 8), verify: verifyInequality },
  { id: 'blood-relation', counts: (s) => [3, 5, 3, 10, 7, 4][s % 6], verify: () => '' },
]

function main(): void {
  const failures: string[] = []
  const lastLines: string[] = []
  for (const spec of SPECS) {
    if (TOPIC_FILTER && !TOPIC_FILTER.includes(spec.id)) continue
    const gen = MAINS_LOGIC_A[spec.id]
    check(gen, `no generator for ${spec.id}`)
    const posCount = [0, 0, 0, 0, 0]
    let totalQ = 0
    const stems = new Set<string>()
    const kinds = new Map<string, number>()
    const t0 = Date.now()
    let cleanSeeds = 0
    const samples: QuestionDraft[][] = []
    for (let seed = 1; seed <= SEEDS; seed++) {
      const count = spec.counts(seed)
      try {
        const groups = gen(createRng(seed), 'hard', count)
        const again = gen(createRng(seed), 'hard', count)
        check(JSON.stringify(groups) === JSON.stringify(again), 'non-deterministic output for the same seed')
        const n = groups.reduce((a, g) => a + g.questions.length, 0)
        check(n === count, `count ${n} != ${count}`)
        const qs: QuestionDraft[] = []
        groups.forEach((g, gi) => {
          assertGroup(g, `${spec.id} seed ${seed} g${gi}`)
          for (const q of g.questions) {
            check(q.topic === spec.id, 'wrong topic id')
            const bad = badChars(`${q.stem}${q.options.join('')}${q.explanation}${JSON.stringify(g.stimulus ?? '')}`.replace(/\\n/g, ''))
            check(bad.length === 0, `disallowed characters ${bad.join(' ')}`)
            check(q.explanation.includes(`Correct answer: (${'ABCDE'[q.answer]}) ${q.options[q.answer]}`), 'explanation lacks the matching "Correct answer" line')
            check(q.explanation.split('\n').length >= 3, 'explanation too short')
            posCount[q.answer]++
            totalQ++
            stems.add(q.stem)
            qs.push(q)
          }
        })
        if (spec.id === 'blood-relation') {
          const { groups: g2, proofs } = generateBloodMainsWithProof(createRng(seed), 'hard', count)
          check(JSON.stringify(g2) === JSON.stringify(groups), 'proof twin differs from registry output')
          g2.forEach((g, i) => {
            bloodVerify(g, proofs[i])
            kinds.set('set', (kinds.get('set') ?? 0) + 1)
          })
        } else
          for (const q of qs) {
            const kd = spec.verify(q)
            kinds.set(kd, (kinds.get(kd) ?? 0) + 1)
          }
        if (samples.length < 3 && seed % 7 === 1) samples.push(qs)
        cleanSeeds++
      } catch (e) {
        failures.push(`${spec.id} seed ${seed}: ${(e as Error).message}`)
        if (failures.length > 25) break
      }
    }
    const ms = Date.now() - t0
    // timing: average ms to generate 30 questions
    for (let r = 0; r < 2; r++) gen(createRng(8000 + r), 'hard', 30)
    const tt = Date.now()
    const reps = spec.id === 'blood-relation' ? 8 : 20
    for (let r = 0; r < reps; r++) gen(createRng(9000 + r), 'hard', 30)
    const per30 = (Date.now() - tt) / reps
    const pct = posCount.map((c) => (totalQ ? c / totalQ : 0))
    if (pct.some((p) => p < 0.12 || p > 0.28)) failures.push(`${spec.id}: answer position distribution outside 12-28%: ${pct.map((p) => `${(p * 100).toFixed(1)}%`).join(' ')}`)
    const line = `${spec.id.padEnd(15)} seeds ok ${cleanSeeds}/${SEEDS}  questions ${totalQ}  distinct stems ${stems.size}  avg ${per30.toFixed(1)} ms per 30 questions  total ${ms} ms  positions A-E ${pct.map((p) => `${(p * 100).toFixed(0)}%`).join(' ')}  kinds ${[...kinds.entries()].map(([k, v]) => `${k}=${v}`).join(' ')}`
    console.log(line)
    lastLines.push(line)
    if (per30 > 200) failures.push(`${spec.id}: ${per30.toFixed(0)} ms per 30 questions exceeds the 200 ms budget`)
    if (!NO_SAMPLES) {
      console.log(`\n===== samples: ${spec.id} =====`)
      let shown = 0
      for (const set of samples) {
        for (const q of set) {
          if (shown++ >= 3) break
          console.log(`\n${q.stem}\n${q.options.map((o, i) => `  ${'ABCDE'[i]}) ${o}`).join('\n')}\nExplanation:\n${q.explanation}`)
        }
        if (shown >= 3) break
      }
      if (spec.id === 'blood-relation') {
        const g = gen(createRng(11), 'hard', 5)[0]
        console.log(`\n----- blood-relation set (seed 11) -----\n${((g.stimulus as NonNullable<Group['stimulus']>).parts[0] as { paragraphs: string[] }).paragraphs.join('\n')}`)
        for (const q of g.questions.slice(0, 3)) console.log(`\n${q.stem}\n${q.options.map((o, i) => `  ${'ABCDE'[i]}) ${o}`).join('\n')}\nExplanation:\n${q.explanation}`)
      }
      console.log('')
    }
  }
  console.log('\n===== SUMMARY =====')
  for (const l of lastLines) console.log(l)
  if (failures.length) {
    console.log(`\nFAILURES (${failures.length}):`)
    for (const f of failures.slice(0, 25)) console.log(`  - ${f}`)
    process.exit(1)
  }
  console.log('\nAll checks passed.')
}
main()
