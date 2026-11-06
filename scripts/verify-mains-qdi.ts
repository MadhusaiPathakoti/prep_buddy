// Verification harness for the SBI-PO-Mains data-interpretation sets (src/lib/mocks/quant/mains/di.ts). Run:
//   npx tsx scripts/verify-mains-qdi.ts
// For every generator (di-table, di-bar, di-pie, di-line, di-caselet) over many seeds it checks the contract (exact count,
// assertGroup, determinism, option sanity, charset, uniform answer position) and then RE-DERIVES every key from the rendered
// stimulus with its own BigInt-rational evaluator (DI sets: the question recipe evaluated on the printed cells / text numbers;
// caselets: the printed statements solved as a linear system), independent of the generator's arithmetic.
import { createRng } from '../src/lib/mocks/rng'
import { assertGroup } from '../src/lib/mocks/validate'
import { MAINS_CASELET_META, MAINS_DI, MAINS_DI_META } from '../src/lib/mocks/quant/mains/di'
import type { Rc } from '../src/lib/mocks/quant/mains/di'
import type { Group, QuantTopicId, QuestionDraft, Stimulus } from '../src/lib/mocks/types'

const SEEDS = Number(process.env.SEEDS ?? 320)
const TOPICS: QuantTopicId[] = ['di-table', 'di-bar', 'di-pie', 'di-line', 'di-caselet']
const COUNTS = [5, 10, 5, 3, 10, 7, 1, 5]

const failures: string[] = []
const fail = (msg: string): void => {
  if (failures.length < 40) failures.push(msg)
  else if (failures.length === 40) failures.push('... (more failures suppressed)')
}

// ------------------------------------------------------------------ exact rationals (BigInt)
const bgcd = (a: bigint, b: bigint): bigint => {
  a = a < 0n ? -a : a
  b = b < 0n ? -b : b
  while (b) [a, b] = [b, a % b]
  return a
}
class Q {
  n: bigint
  d: bigint
  constructor(n: bigint, d: bigint = 1n) {
    if (d === 0n) throw new Error('division by zero')
    if (d < 0n) {
      n = -n
      d = -d
    }
    const g = bgcd(n, d) || 1n
    this.n = n / g
    this.d = d / g
  }
  static of(x: number | string): Q {
    const s = String(x).replace('−', '-')
    const m = /^(-?)(\d+)(?:\.(\d+))?$/.exec(s)
    if (!m) throw new Error(`bad number ${s}`)
    const frac = m[3] ?? ''
    const n = BigInt(m[2] + frac)
    return new Q(m[1] ? -n : n, 10n ** BigInt(frac.length))
  }
  add(o: Q): Q {
    return new Q(this.n * o.d + o.n * this.d, this.d * o.d)
  }
  sub(o: Q): Q {
    return new Q(this.n * o.d - o.n * this.d, this.d * o.d)
  }
  mul(o: Q): Q {
    return new Q(this.n * o.n, this.d * o.d)
  }
  div(o: Q): Q {
    return new Q(this.n * o.d, this.d * o.n)
  }
  eq(o: Q): boolean {
    return this.n === o.n && this.d === o.d
  }
  cmp(o: Q): number {
    const x = this.n * o.d - o.n * this.d
    return x > 0n ? 1 : x < 0n ? -1 : 0
  }
  num(): number {
    return Number(this.n) / Number(this.d)
  }
  isInt(): boolean {
    return this.d === 1n
  }
  /** nearest integer, halves away from zero (only used when the fractional part is not .5) */
  round(): bigint {
    const twice = 2n * this.n + this.d
    const den = 2n * this.d
    let q = twice / den
    if (twice % den !== 0n && twice < 0n) q -= 1n
    return q
  }
}

// ------------------------------------------------------------------ independent stimulus reader / recipe evaluator
function cell(st: Stimulus, rc: Extract<Rc, { t: 'ref' }>): Q {
  const p = st.parts[rc.p]
  let x: number | string
  if (p.kind === 'table') x = p.rows[rc.r][rc.c]
  else if (p.kind === 'bar' || p.kind === 'line') x = p.series[rc.r].values[rc.c]
  else if (p.kind === 'pie') x = p.slices[rc.c].value
  else throw new Error('ref into text part')
  const s = String(x).replace('−', '-').replace(/^\+/, '').replace(/%$/, '')
  return Q.of(s)
}
function ratCell(st: Stimulus, rc: Extract<Rc, { t: 'rat' }>): Q {
  const p = st.parts[rc.p]
  if (p.kind !== 'table') throw new Error('rat outside table')
  const m = /^(\d+) : (\d+)$/.exec(String(p.rows[rc.r][rc.c]))
  if (!m) throw new Error('bad ratio cell')
  return Q.of(m[rc.s + 1])
}
function allText(st: Stimulus): string[] {
  const out: string[] = []
  if (st.directions) out.push(st.directions)
  for (const p of st.parts) {
    if ('heading' in p && p.heading) out.push(p.heading)
    if (p.kind === 'text') out.push(...p.paragraphs)
    else if (p.kind === 'table') {
      out.push(...p.columns)
      if (p.note) out.push(p.note)
    } else if (p.kind === 'bar' || p.kind === 'line') out.push(...p.series.map((s) => s.name))
  }
  return out
}
function numberInText(st: Stimulus, n: number): boolean {
  const re = new RegExp(`(^|[^0-9.])${String(n).replace('.', '\\.')}([^0-9]|\\.(?![0-9])|$)`)
  return allText(st).some((s) => re.test(s))
}
function ev(rc: Rc, st: Stimulus): Q {
  switch (rc.t) {
    case 'num':
      return Q.of(rc.v)
    case 'txt':
      if (!numberInText(st, rc.v)) throw new Error(`text number ${rc.v} not present in the stimulus`)
      return Q.of(rc.v)
    case 'ref':
      return cell(st, rc)
    case 'rat':
      return ratCell(st, rc)
    case 'op': {
      const a = ev(rc.a, st)
      const b = ev(rc.b, st)
      return rc.o === '+' ? a.add(b) : rc.o === '-' ? a.sub(b) : rc.o === '*' ? a.mul(b) : a.div(b)
    }
  }
}
function shape(rc: Rc): { leaves: number; ops: number } {
  if (rc.t === 'op') {
    const a = shape(rc.a)
    const b = shape(rc.b)
    return { leaves: a.leaves + b.leaves, ops: a.ops + b.ops + 1 }
  }
  return { leaves: rc.t === 'num' ? 0 : 1, ops: 0 }
}

// ------------------------------------------------------------------ caselet: independent linear solve
function solve(rows: number[][], rhs: number[], n: number): Q[] {
  const m: Q[][] = rows.map((r, i) => [...r.map((x) => Q.of(x)), Q.of(rhs[i])])
  let rank = 0
  for (let c = 0; c < n && rank < m.length; c++) {
    let p = -1
    for (let i = rank; i < m.length; i++) {
      if (m[i][c].n !== 0n) {
        p = i
        break
      }
    }
    if (p < 0) continue
    ;[m[rank], m[p]] = [m[p], m[rank]]
    const pv = m[rank][c]
    m[rank] = m[rank].map((x) => x.div(pv))
    for (let i = 0; i < m.length; i++) {
      if (i !== rank && m[i][c].n !== 0n) {
        const f = m[i][c]
        m[i] = m[i].map((x, j) => x.sub(f.mul(m[rank][j])))
      }
    }
    rank++
  }
  if (rank !== n) throw new Error(`caselet system has rank ${rank} < ${n}`)
  for (let i = rank; i < m.length; i++) if (m[i][n].n !== 0n) throw new Error('caselet system inconsistent')
  return Array.from({ length: n }, (_, c) => m[c][n])
}
const dot = (a: number[], s: Q[]): Q => a.reduce((acc, x, i) => acc.add(Q.of(x).mul(s[i])), Q.of(0))

// ------------------------------------------------------------------ per-question key check
const EXTRA = new Set([...'−√∛≤≥≠₹→∴⇒≈π²³'])
const okChar = (ch: string): boolean => {
  const c = ch.charCodeAt(0)
  return c === 10 || (c >= 32 && c <= 126) || (c >= 160 && c <= 255) || EXTRA.has(ch)
}
function checkChars(label: string, s: string): void {
  const bad = [...s].filter((ch) => !okChar(ch)).join('')
  if (bad) fail(`${label}: disallowed characters "${bad}"`)
}
const reduceRatio = (a: Q, b: Q): string | null => {
  if (!a.isInt() || !b.isInt() || a.n <= 0n || b.n <= 0n) return null
  const g = bgcd(a.n, b.n)
  return `${a.n / g} : ${b.n / g}`
}
function optionNumber(opt: string, pre: string, post: string): Q {
  let s = opt
  if (pre && s.startsWith(pre)) s = s.slice(pre.length)
  if (post && s.endsWith(post)) s = s.slice(0, s.length - post.length)
  return Q.of(s.trim())
}

interface KeyInfo {
  heavy: boolean
  id: string
  lookup: boolean
}
function checkKey(topic: QuantTopicId, st: Stimulus, q: QuestionDraft, where: string): KeyInfo {
  const given = q.options[q.answer]
  const cm = MAINS_CASELET_META.get(q)
  if (cm) {
    const sol = solve(cm.cons.flatMap((c) => c.rows), cm.cons.flatMap((c) => c.rhs), cm.n)
    // printed statements must really contain the numbers of the equations
    const text = (st.parts[0].kind === 'text' ? st.parts[0].paragraphs.join(' ') : '')
    for (const c of cm.cons) {
      if (!text.includes(c.text)) fail(`${where}: statement not printed: ${c.text}`)
      if (c.rows.length === 1 && c.rhs[0] !== 0 && !numberInText(st, c.rhs[0])) fail(`${where}: statement number ${c.rhs[0]} missing`)
    }
    const nm = dot(cm.num, sol)
    const nz = cm.num.filter((x) => x !== 0).length + (cm.den ? cm.den.filter((x) => x !== 0).length : 0)
    if (cm.kind === 'ratio') {
      const want = reduceRatio(nm, dot(cm.den as number[], sol))
      if (want !== given) fail(`${where}: ratio key ${given} but independent solve gives ${want}`)
    } else if (cm.kind === 'int') {
      if (!nm.eq(Q.of(given))) fail(`${where}: key ${given} but independent solve gives ${nm.num()}`)
    } else {
      const val = nm.mul(Q.of(100)).div(dot(cm.den as number[], sol))
      const pct = given.replace('%', '')
      if (MAINS_DI_META.get(q)?.approx) {
        if (BigInt(pct) !== val.round() || Math.abs(val.num() - Number(pct)) > 0.5) fail(`${where}: approx key ${given} vs ${val.num()}`)
      } else if (!val.eq(Q.of(pct))) fail(`${where}: pct key ${given} vs ${val.num()}`)
    }
    // a caselet question is a plain lookup only when its form is literally one of the printed single-equation statements
    const stated = cm.kind === 'int' && cm.cons.some((c) => c.rows.length === 1 && c.rhs[0] !== 0 && c.rows[0].length === cm.num.length && c.rows[0].every((x, i) => x === cm.num[i]))
    return { heavy: nz >= 3, id: cm.id, lookup: stated }
  }
  const meta = MAINS_DI_META.get(q)
  if (!meta) {
    fail(`${where}: question has no recipe metadata`)
    return { heavy: false, id: '?', lookup: true }
  }
  const sh = meta.rcs.map(shape)
  const heavy = sh.reduce((a, s) => a + s.leaves, 0) >= 3 && sh.reduce((a, s) => a + s.ops, 0) >= 2
  const lookup = sh.every((s) => s.ops === 0)
  if (meta.kind === 'value') {
    const exact = ev(meta.rcs[0], st)
    const num = optionNumber(given, meta.pre ?? '', meta.post ?? '')
    if (meta.approx) {
      if (num.n * 1n !== exact.round() * (num.d === 1n ? 1n : 0n) || !num.isInt()) fail(`${where}: approx key ${given} vs exact ${exact.num()}`)
      if (Math.abs(exact.num() - num.num()) > 0.5) fail(`${where}: approx key ${given} too far from ${exact.num()}`)
      for (const [i, o] of q.options.entries()) {
        if (i !== q.answer && Math.abs(optionNumber(o, meta.pre ?? '', meta.post ?? '').num() - num.num()) < 2) fail(`${where}: option ${o} within 2 of the approx key`)
      }
    } else if (!num.eq(exact)) fail(`${where}: key ${given} but recipe on the rendered stimulus gives ${exact.num()}`)
  } else if (meta.kind === 'ratio') {
    const want = reduceRatio(ev(meta.rcs[0], st), ev(meta.rcs[1], st))
    if (want !== given) fail(`${where}: ratio key ${given} but recipe gives ${want}`)
  } else {
    const vals = meta.rcs.map((r) => ev(r, st))
    let best = 0
    vals.forEach((v, i) => {
      if (meta.extreme === 'max' ? v.cmp(vals[best]) > 0 : v.cmp(vals[best]) < 0) best = i
    })
    const ties = vals.filter((v) => v.eq(vals[best])).length
    if (ties !== 1) fail(`${where}: tie for the extreme`)
    if ((meta.labels as string[])[best] !== given) fail(`${where}: label key ${given} but recipe gives ${(meta.labels as string[])[best]}`)
  }
  void topic
  return { heavy, id: meta.id, lookup }
}

// ------------------------------------------------------------------ run
const stripped = (g: Group[]): string => JSON.stringify(g)
let exitCode = 0
const samples: Record<string, { st: Stimulus; q: QuestionDraft }[]> = {}
const summary: string[] = []

for (const topic of TOPICS) {
  const gen = MAINS_DI[topic]
  if (!gen) {
    fail(`${topic}: generator missing`)
    continue
  }
  const pos = [0, 0, 0, 0, 0]
  const stems = new Set<string>()
  let nq = 0
  let ms = 0
  let nGroups = 0
  samples[topic] = []
  for (let seed = 1; seed <= SEEDS; seed++) {
    const count = COUNTS[seed % COUNTS.length]
    const t0 = performance.now()
    const groups = gen(createRng(seed * 7919 + 13), 'hard', count)
    ms += (performance.now() - t0) * (30 / count)
    const again = gen(createRng(seed * 7919 + 13), 'hard', count)
    if (stripped(groups) !== stripped(again)) fail(`${topic} seed ${seed}: not deterministic`)
    const total = groups.reduce((a, g) => a + g.questions.length, 0)
    if (total !== count) fail(`${topic} seed ${seed}: returned ${total} questions for count ${count}`)
    groups.forEach((g, gi) => {
      const where = `${topic} seed ${seed} set ${gi + 1}`
      nGroups++
      try {
        assertGroup(g, where)
      } catch (e) {
        fail((e as Error).message)
      }
      if (!g.stimulus) {
        fail(`${where}: set without stimulus`)
        return
      }
      if (g.questions.length > 5) fail(`${where}: set larger than 5`)
      if (JSON.stringify(g.stimulus).length > 6000) fail(`${where}: stimulus unusually large`)
      for (const s of allText(g.stimulus)) checkChars(`${where} stimulus`, s)
      const ids = new Set<string>()
      let anyHeavy = false
      g.questions.forEach((q, qi) => {
        const w = `${where} q${qi + 1}`
        nq++
        pos[q.answer]++
        stems.add(q.stem)
        checkChars(`${w} stem`, q.stem)
        q.options.forEach((o) => checkChars(`${w} option`, o))
        checkChars(`${w} explanation`, q.explanation)
        if (q.topic !== topic) fail(`${w}: wrong topic tag ${q.topic}`)
        if (!q.explanation.includes('\n')) fail(`${w}: explanation is not multi-line`)
        if (!q.explanation.trimEnd().endsWith(q.options[q.answer]) && !q.explanation.includes(`Correct answer: (${'ABCDE'[q.answer]})`)) fail(`${w}: explanation does not name the key`)
        if (new Set(q.options).size !== 5) fail(`${w}: duplicate options`)
        try {
          const info = checkKey(topic, g.stimulus as Stimulus, q, w)
          if (info.heavy) anyHeavy = true
          if (info.lookup) fail(`${w}: pure single-cell lookup (${info.id})`)
          if (ids.has(info.id)) fail(`${w}: question type ${info.id} repeated inside the set`)
          ids.add(info.id)
        } catch (e) {
          fail(`${w}: key check threw: ${(e as Error).message}`)
        }
        if (seed <= 6 && qi === 0 && gi === 0 && samples[topic].length < 3) samples[topic].push({ st: g.stimulus as Stimulus, q })
      })
      if (!anyHeavy && g.questions.length >= 3) fail(`${where}: no question needs 3+ lookups and 2+ operations`)
    })
  }
  const share = pos.map((p) => p / nq)
  for (const [i, s] of share.entries()) if (s < 0.12 || s > 0.28) fail(`${topic}: answer position ${'ABCDE'[i]} share ${(s * 100).toFixed(1)}% outside 12-28%`)
  summary.push(`${topic.padEnd(11)} sets=${String(nGroups).padStart(4)} questions=${String(nq).padStart(5)} ms/30q=${(ms / SEEDS).toFixed(1).padStart(5)} distinct-stems=${String(stems.size).padStart(5)} positions A-E=${share.map((s) => (s * 100).toFixed(0)).join('/')}%`)
}

// ------------------------------------------------------------------ report
const fmtSt = (st: Stimulus): string =>
  st.parts
    .map((p) => {
      if (p.kind === 'text') return p.paragraphs.join('\n')
      if (p.kind === 'table') return `[table] ${p.heading ?? ''}\n${p.columns.join(' | ')}\n${p.rows.map((r) => r.join(' | ')).join('\n')}${p.note ? `\n(${p.note})` : ''}`
      if (p.kind === 'pie') return `[pie] ${p.heading ?? ''}: ${p.slices.map((s) => `${s.label}=${s.value}`).join(', ')}`
      return `[${p.kind}${p.kind === 'bar' && p.stacked ? ' stacked' : ''}] ${p.heading ?? ''}: ${p.categories.join(', ')}; ${p.series.map((s) => `${s.name}: ${s.values.join(', ')}`).join('; ')}`
    })
    .join('\n')
for (const topic of TOPICS) {
  console.log(`\n=================== ${topic}: 3 sample questions ===================`)
  for (const { st, q } of samples[topic] ?? []) {
    console.log(`\n--- stimulus ---\n${fmtSt(st)}`)
    console.log(`Q: ${q.stem}\n${q.options.map((o, i) => `  (${'ABCDE'[i]}) ${o}`).join('\n')}\n${q.explanation}`)
  }
}
console.log('\n=================== summary ===================')
summary.forEach((s) => console.log(s))
if (failures.length) {
  console.log(`\nFAILURES (${failures.length}):`)
  failures.forEach((f) => console.log(`  - ${f}`))
  exitCode = 1
} else console.log(`\nALL CHECKS PASSED (${SEEDS} seeds x ${TOPICS.length} generators, counts ${[...new Set(COUNTS)].join('/')}; keys re-derived independently).`)
process.exit(exitCode)
