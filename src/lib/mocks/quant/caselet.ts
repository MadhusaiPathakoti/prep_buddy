// DI caselets: two- and three-set Venn data and two-level percentage/ratio data given in a paragraph.
// Region counts / people counts are chosen first (backwards design); the paragraph states the derived figures, and
// each question carries a recipe over the *stated* numbers that must reproduce the independently known region value.
// The result-analysis "workings" re-express the paragraph as a complete table.
import type { Rng } from '../rng'
import type { Group, MockDifficulty, Stimulus } from '../types'
import { F, Reject, ensure, feq, fval, need, rstep, wpick } from './util'
import type { Frac } from './util'
import { WORKINGS_META, fv, lit, txt, vabs, vadd, vdiv, vmul, vsub, vsum, finish } from './di'
import type { Cand, V } from './di'

const frac = (n: number): Frac => F(n)

interface Q {
  id: string
  stem: string
  kind: 'int' | 'dec' | 'pct' | 'ratio'
  v?: V
  ratio?: [V, V]
  /** independently known value(s) from the region/people counts */
  expect: number | [number, number]
  wrong: V[]
  /** worked solution, one element per step ("{R}" = the result) */
  steps: string[]
}

function toCand(q: Q): Cand {
  if (q.kind === 'ratio') {
    const [a, b] = q.ratio as [V, V]
    const [ea, eb] = q.expect as [number, number]
    ensure(feq(a.val, frac(ea)) && feq(b.val, frac(eb)), `caselet ${q.id}: ratio recipe disagrees with region counts`)
    return { id: q.id, stem: q.stem, kind: 'ratio', ratio: q.ratio, wrong: [], steps: q.steps }
  }
  const v = q.v as V
  const exp = q.expect as number
  const same = q.kind === 'pct' ? Math.abs(fval(v.val) - exp) < 1e-9 : feq(v.val, frac(exp))
  ensure(same, `caselet ${q.id}: recipe ${fv(v)} disagrees with region count ${exp}`)
  return { id: q.id, stem: q.stem, kind: q.kind, v, wrong: q.wrong, steps: q.steps }
}

const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1)
/** Replaces a trailing "= value" by "= {R}" (the result placeholder finish() fills in). */
const R = (s: string, val: number): string => {
  const tail = `= ${val}`
  ensure(s.endsWith(tail), `caselet step does not end with ${tail}: ${s}`)
  return `${s.slice(0, s.length - tail.length)}= {R}`
}

// ------------------------------------------------------------------ two-set Venn
interface Set2 {
  unit: string
  intro: (T: number) => string
  inA: string
  inB: string
  both: string
  onlyA: string
  onlyB: string
  either: string
  neither: string
  one: string
  alsoB: string
  alsoA: string
}
const SETS2: Set2[] = [
  { unit: 'students', intro: (T) => `In a school of ${T} students`, inA: 'play cricket', inB: 'play football', both: 'play both cricket and football', onlyA: 'play only cricket', onlyB: 'play only football', either: 'play at least one of the two games', neither: 'play neither of the two games', one: 'play exactly one of the two games', alsoB: 'also play football', alsoA: 'also play cricket' },
  { unit: 'people', intro: (T) => `In a survey of ${T} people`, inA: 'drink tea', inB: 'drink coffee', both: 'drink both tea and coffee', onlyA: 'drink only tea', onlyB: 'drink only coffee', either: 'drink at least one of tea and coffee', neither: 'drink neither tea nor coffee', one: 'drink exactly one of tea and coffee', alsoB: 'also drink coffee', alsoA: 'also drink tea' },
  { unit: 'employees', intro: (T) => `In an office with ${T} employees`, inA: 'know Hindi', inB: 'know English', both: 'know both Hindi and English', onlyA: 'know only Hindi', onlyB: 'know only English', either: 'know at least one of the two languages', neither: 'know neither of the two languages', one: 'know exactly one of the two languages', alsoB: 'also know English', alsoA: 'also know Hindi' },
  { unit: 'students', intro: (T) => `Out of ${T} students of a coaching institute`, inA: 'opted for Mathematics', inB: 'opted for Reasoning', both: 'opted for both Mathematics and Reasoning', onlyA: 'opted for only Mathematics', onlyB: 'opted for only Reasoning', either: 'opted for at least one of the two subjects', neither: 'opted for neither of the two subjects', one: 'opted for exactly one of the two subjects', alsoB: 'also opted for Reasoning', alsoA: 'also opted for Mathematics' },
]

function venn2(rng: Rng, d: MockDifficulty): { stimulus: Stimulus; qs: Q[] } {
  const set = rng.pick(SETS2)
  const T = rstep(rng, 300, 1000, 100)
  const pa = rstep(rng, 30, 70, 5)
  const pb = rstep(rng, 30, 70, 5)
  const A = (T * pa) / 100
  const B = (T * pb) / 100
  const AB = rstep(rng, 20, Math.min(A, B) - 20, 10)
  const union = A + B - AB
  need(union <= T - 30 && AB >= 20 && A - AB >= 20 && B - AB >= 20, 'region sizes unsuitable')
  const none = T - union
  const usePct = d === 'hard'
  const aTxt = usePct ? `${pa}% of them ${set.inA}` : `${A} ${set.inA}`
  const bTxt = usePct ? `${pb}% of them ${set.inB}` : `${B} ${set.inB}`
  const text = `${set.intro(T)}, ${aTxt} and ${bTxt}. ${AB} ${set.unit} ${set.both}.`
  const tT = txt(T)
  const vA = usePct ? vdiv(vmul(txt(pa), tT), lit(100)) : txt(A)
  const vB = usePct ? vdiv(vmul(txt(pb), tT), lit(100)) : txt(B)
  const vAB = txt(AB)
  const onlyA = vsub(vA, vAB)
  const onlyB = vsub(vB, vAB)
  const either = vsub(vadd(vA, vB), vAB)
  const neither = vsub(tT, either)
  const one = vsub(vadd(vA, vB), vmul(lit(2), vAB))
  const stimulus: Stimulus = {
    directions: 'Read the following information carefully and answer the questions that follow.',
    parts: [{ kind: 'text', paragraphs: [text] }],
    workings: [
      {
        kind: 'table',
        heading: `Data in tabular form (A = ${set.unit} who ${set.inA}, B = ${set.unit} who ${set.inB})`,
        columns: ['Group', `Number of ${set.unit}`],
        rows: [['Only A', A - AB], ['Both A and B', AB], ['Only B', B - AB], ['Neither A nor B', none], ['Total', T], ['n(A) = only A + both', A], ['n(B) = only B + both', B]],
      },
    ],
  }
  WORKINGS_META.set(stimulus, { kind: 'venn2' })
  const given = usePct
    ? `Let A = ${set.unit} who ${set.inA} and B = ${set.unit} who ${set.inB}.\nn(A) = ${pa}% of ${T} = ${pa} × ${T} ÷ 100 = ${A}; n(B) = ${pb}% of ${T} = ${pb} × ${T} ÷ 100 = ${B}\nn(A and B) = ${AB}; Total = ${T}`
    : `Let A = ${set.unit} who ${set.inA} and B = ${set.unit} who ${set.inB}.\nGiven: n(A) = ${A}, n(B) = ${B}, n(A and B) = ${AB}, Total = ${T}`
  const stepU = `n(A or B) = n(A) + n(B) − n(A and B) = ${A} + ${B} − ${AB} = ${union}`
  const stepNone = `Neither = Total − n(A or B) = ${T} − ${union} = ${none}`
  const stepOA = `Only A = n(A) − n(A and B) = ${A} − ${AB} = ${A - AB}`
  const stepOB = `Only B = n(B) − n(A and B) = ${B} − ${AB} = ${B - AB}`
  const qs: Q[] = [
    { id: 'onlyA', stem: `How many ${set.unit} ${set.onlyA}?`, kind: 'int', v: onlyA, expect: A - AB, wrong: [vA, vsub(vA, vB)], steps: [given, R(stepOA, A - AB)] },
    { id: 'onlyB', stem: `How many ${set.unit} ${set.onlyB}?`, kind: 'int', v: onlyB, expect: B - AB, wrong: [vB], steps: [given, R(stepOB, B - AB)] },
    { id: 'either', stem: `How many ${set.unit} ${set.either}?`, kind: 'int', v: either, expect: union, wrong: [vadd(vA, vB)], steps: [given, R(stepU, union)] },
    { id: 'neither', stem: `How many ${set.unit} ${set.neither}?`, kind: 'int', v: neither, expect: none, wrong: [vsub(tT, vadd(vA, vB))], steps: [given, stepU, R(stepNone, none)] },
    { id: 'one', stem: `How many ${set.unit} ${set.one}?`, kind: 'int', v: one, expect: A + B - 2 * AB, wrong: [either], steps: [given, stepOA, stepOB, `Exactly one = only A + only B = ${A - AB} + ${B - AB} = {R}`] },
    { id: 'pctNeither', stem: `What percent of the ${set.unit} ${set.neither}?`, kind: 'pct', v: vmul(vdiv(neither, tT), lit(100)), expect: (none * 100) / T, wrong: [], steps: [given, stepU, stepNone, `Required % = (neither ÷ total) × 100 = (${none} ÷ ${T}) × 100 = {R}`] },
    { id: 'ratioOnly', stem: `What is the ratio of the number of ${set.unit} who ${set.onlyA} to the number of ${set.unit} who ${set.onlyB}?`, kind: 'ratio', ratio: [onlyA, onlyB], expect: [A - AB, B - AB], wrong: [], steps: [given, stepOA, stepOB, `Required ratio = only A : only B = ${A - AB} : ${B - AB}`] },
    { id: 'alsoB', stem: `What percent of the ${set.unit} who ${set.inA} ${set.alsoB}?`, kind: 'pct', v: vmul(vdiv(vAB, vA), lit(100)), expect: (AB * 100) / A, wrong: [vmul(vdiv(vAB, vB), lit(100))], steps: [given, `Those in A who are also in B = n(A and B) = ${AB}; base = n(A) = ${A}`, `Required % = (n(A and B) ÷ n(A)) × 100 = (${AB} ÷ ${A}) × 100 = {R}`] },
    { id: 'diffOnly', stem: `What is the difference between the number of ${set.unit} who ${set.onlyA} and the number who ${set.onlyB}?`, kind: 'int', v: vabs(onlyA, onlyB), expect: Math.abs(A - B), wrong: [vadd(onlyA, onlyB)], steps: [given, stepOA, stepOB, `Difference = ${Math.max(A, B) - AB} − ${Math.min(A, B) - AB} = {R}`] },
  ]
  return { stimulus, qs: qs.filter((q) => q.id !== 'diffOnly' || A !== B) }
}

// ------------------------------------------------------------------ three-set Venn
interface Set3 {
  unit: string
  verb: string
  items: [string, string, string]
  kind: string
  intro: (T: number) => string
}
const SETS3: Set3[] = [
  { unit: 'students', verb: 'play', items: ['cricket', 'football', 'hockey'], kind: 'games', intro: (T) => `In a college of ${T} students` },
  { unit: 'people', verb: 'speak', items: ['Hindi', 'English', 'Tamil'], kind: 'languages', intro: (T) => `In a group of ${T} people` },
  { unit: 'employees', verb: 'know', items: ['Python', 'Java', 'SQL'], kind: 'programming languages', intro: (T) => `In a company with ${T} employees` },
  { unit: 'residents', verb: 'read', items: ['The Daily', 'The Chronicle', 'The Herald'], kind: 'newspapers', intro: (T) => `In a colony of ${T} residents` },
]

function venn3(rng: Rng): { stimulus: Stimulus; qs: Q[] } {
  const set = rng.pick(SETS3)
  const [i1, i2, i3] = set.items
  const r = {
    a: rstep(rng, 20, 120, 10),
    b: rstep(rng, 20, 120, 10),
    c: rstep(rng, 20, 120, 10),
    ab: rstep(rng, 10, 70, 10),
    bc: rstep(rng, 10, 70, 10),
    ac: rstep(rng, 10, 70, 10),
    abc: rstep(rng, 10, 50, 10),
    none: rstep(rng, 20, 100, 10),
  }
  const T = Object.values(r).reduce((x, y) => x + y, 0)
  const A = r.a + r.ab + r.ac + r.abc
  const B = r.b + r.ab + r.bc + r.abc
  const C = r.c + r.ac + r.bc + r.abc
  const AB = r.ab + r.abc
  const BC = r.bc + r.abc
  const AC = r.ac + r.abc
  const ABC = r.abc
  const text =
    `${set.intro(T)}, ${A} ${set.verb} ${i1}, ${B} ${set.verb} ${i2} and ${C} ${set.verb} ${i3}. ` +
    `${AB} ${set.verb} both ${i1} and ${i2}, ${BC} ${set.verb} both ${i2} and ${i3}, and ${AC} ${set.verb} both ${i1} and ${i3}. ` +
    `${ABC} ${set.verb} all the three ${set.kind}. (The figures for pairs include those who ${set.verb} all three ${set.kind}.)`
  const [vT, vA, vB, vC, vAB, vBC, vAC, vABC] = [T, A, B, C, AB, BC, AC, ABC].map(txt)
  const pairs = vsum([vAB, vBC, vAC])
  const onlyA = vadd(vsub(vA, vadd(vAB, vAC)), vABC)
  const exact2 = vsub(pairs, vmul(lit(3), vABC))
  const atLeast2 = vsub(pairs, vmul(lit(2), vABC))
  const union = vadd(vsub(vsum([vA, vB, vC]), pairs), vABC)
  const none = vsub(vT, union)
  const exact1 = vsub(vsum([vA, vB, vC]), vsub(vmul(lit(2), pairs), vmul(lit(3), vABC)))
  const onlyBC = vsub(vBC, vABC)
  const onlyC = vadd(vsub(vC, vadd(vBC, vAC)), vABC)
  const u = set.unit
  const v = set.verb
  const stimulus: Stimulus = {
    directions: 'Read the following information carefully and answer the questions that follow.',
    parts: [{ kind: 'text', paragraphs: [text] }],
    workings: [
      {
        kind: 'table',
        heading: `Data in tabular form (A = ${i1}, B = ${i2}, C = ${i3})`,
        columns: ['Group', `Number of ${u}`],
        rows: [
          [`Only ${i1} (A only)`, r.a],
          [`Only ${i2} (B only)`, r.b],
          [`Only ${i3} (C only)`, r.c],
          [`${i1} and ${i2} only`, r.ab],
          [`${i2} and ${i3} only`, r.bc],
          [`${i1} and ${i3} only`, r.ac],
          ['All three', r.abc],
          ['None of the three', r.none],
          ['Total', T],
          [`n(A) = all ${i1}`, A],
          [`n(B) = all ${i2}`, B],
          [`n(C) = all ${i3}`, C],
          [`n(A and B) = ${i1} and ${i2}, incl. all three`, AB],
          [`n(B and C) = ${i2} and ${i3}, incl. all three`, BC],
          [`n(A and C) = ${i1} and ${i3}, incl. all three`, AC],
          ['n(A and B and C)', ABC],
        ],
      },
    ],
  }
  WORKINGS_META.set(stimulus, { kind: 'venn3' })
  const given = `Let A = ${i1}, B = ${i2}, C = ${i3}. Given:\nn(A) = ${A}, n(B) = ${B}, n(C) = ${C}, Total = ${T}\nn(A and B) = ${AB}, n(B and C) = ${BC}, n(A and C) = ${AC}, n(A and B and C) = ${ABC}`
  const sOnlyA = `Only A = n(A) − n(A and B) − n(A and C) + n(A and B and C) = ${A} − ${AB} − ${AC} + ${ABC} = ${r.a}`
  const sOnlyB = `Only B = n(B) − n(A and B) − n(B and C) + n(A and B and C) = ${B} − ${AB} − ${BC} + ${ABC} = ${r.b}`
  const sOnlyC = `Only C = n(C) − n(A and C) − n(B and C) + n(A and B and C) = ${C} − ${AC} − ${BC} + ${ABC} = ${r.c}`
  const sExact2 = `Exactly two = [n(A and B) + n(B and C) + n(A and C)] − 3 × n(A and B and C) = (${AB} + ${BC} + ${AC}) − 3 × ${ABC} = ${r.ab + r.bc + r.ac}`
  const sUnion = `n(A or B or C) = n(A) + n(B) + n(C) − n(A and B) − n(B and C) − n(A and C) + n(A and B and C)\n= ${A} + ${B} + ${C} − ${AB} − ${BC} − ${AC} + ${ABC} = ${T - r.none}`
  const sNone = `None = Total − n(A or B or C) = ${T} − ${T - r.none} = ${r.none}`
  const qs: Q[] = [
    { id: 'onlyA', stem: `How many ${u} ${v} only ${i1}?`, kind: 'int', v: onlyA, expect: r.a, wrong: [vsub(vA, vAB), vsub(vA, vadd(vAB, vAC))], steps: [given, R(sOnlyA, r.a)] },
    { id: 'onlyC', stem: `How many ${u} ${v} only ${i3}?`, kind: 'int', v: onlyC, expect: r.c, wrong: [vsub(vC, vadd(vBC, vAC))], steps: [given, R(sOnlyC, r.c)] },
    { id: 'exact2', stem: `How many ${u} ${v} exactly two of the three ${set.kind}?`, kind: 'int', v: exact2, expect: r.ab + r.bc + r.ac, wrong: [pairs, atLeast2], steps: [given, R(sExact2, r.ab + r.bc + r.ac)] },
    { id: 'atLeast2', stem: `How many ${u} ${v} at least two of the three ${set.kind}?`, kind: 'int', v: atLeast2, expect: r.ab + r.bc + r.ac + r.abc, wrong: [exact2, pairs], steps: [given, `At least two = [n(A and B) + n(B and C) + n(A and C)] − 2 × n(A and B and C) = (${AB} + ${BC} + ${AC}) − 2 × ${ABC} = {R}`] },
    { id: 'none', stem: `How many ${u} ${v} none of the three ${set.kind}?`, kind: 'int', v: none, expect: r.none, wrong: [vsub(vT, vsum([vA, vB, vC]))], steps: [given, sUnion, R(sNone, r.none)] },
    { id: 'exact1', stem: `How many ${u} ${v} exactly one of the three ${set.kind}?`, kind: 'int', v: exact1, expect: r.a + r.b + r.c, wrong: [vsum([vA, vB, vC])], steps: [given, sOnlyA, sOnlyB, sOnlyC, `Exactly one = only A + only B + only C = ${r.a} + ${r.b} + ${r.c} = {R}`] },
    { id: 'onlyBC', stem: `How many ${u} ${v} ${i2} and ${i3} but not ${i1}?`, kind: 'int', v: onlyBC, expect: r.bc, wrong: [vBC], steps: [given, `B and C but not A = n(B and C) − n(A and B and C) = ${BC} − ${ABC} = {R}`] },
    { id: 'union', stem: `How many ${u} ${v} at least one of the three ${set.kind}?`, kind: 'int', v: union, expect: T - r.none, wrong: [vsum([vA, vB, vC])], steps: [given, R(sUnion, T - r.none)] },
    { id: 'ratio12', stem: `What is the ratio of the number of ${u} who ${v} exactly one of the three ${set.kind} to the number who ${v} exactly two of them?`, kind: 'ratio', ratio: [exact1, exact2], expect: [r.a + r.b + r.c, r.ab + r.bc + r.ac], wrong: [], steps: [given, sOnlyA, sOnlyB, sOnlyC, `Exactly one = ${r.a} + ${r.b} + ${r.c} = ${r.a + r.b + r.c}`, sExact2, `Required ratio = exactly one : exactly two = ${r.a + r.b + r.c} : ${r.ab + r.bc + r.ac}`] },
    { id: 'pctNone', stem: `What percent of the ${u} ${v} none of the three ${set.kind}?`, kind: 'pct', v: vmul(vdiv(none, vT), lit(100)), expect: (r.none * 100) / T, wrong: [], steps: [given, sUnion, sNone, `Required % = (none ÷ total) × 100 = (${r.none} ÷ ${T}) × 100 = {R}`] },
  ]
  return { stimulus, qs }
}

// ------------------------------------------------------------------ two-level (ratio then percentages)
interface Pop {
  place: string
  unit: string
  g1: string
  g2: string
  trait: string
  traitAdj: string
  second?: { trait: string; label: string }
}
const POPS: Pop[] = [
  { place: 'In a company', unit: 'employees', g1: 'male', g2: 'female', trait: 'graduates', traitAdj: 'graduate', second: { trait: 'postgraduates', label: 'postgraduate' } },
  { place: 'In a college', unit: 'students', g1: 'boys', g2: 'girls', trait: 'hostellers', traitAdj: 'hostel', second: { trait: 'scholarship holders', label: 'scholarship' } },
  { place: 'In a town', unit: 'residents', g1: 'male', g2: 'female', trait: 'vegetarians', traitAdj: 'vegetarian', second: { trait: 'Jain', label: 'Jain' } },
]

function pop(rng: Rng, d: MockDifficulty): { stimulus: Stimulus; qs: Q[] } {
  const p = rng.pick(POPS)
  const [a, b] = rng.pick([[3, 2], [5, 3], [4, 3], [7, 5], [5, 4], [2, 1], [3, 1], [7, 3], [5, 2], [9, 7], [11, 9], [13, 7]])
  const m = rng.int(1, 4)
  const male = a * 20 * m
  const female = b * 20 * m
  const E = male + female
  const x = rstep(rng, 20, 80, 5)
  const y = rstep(rng, 20, 80, 5)
  const mT = (male * x) / 100
  const fT = (female * y) / 100
  need(Number.isInteger(mT) && Number.isInteger(fT) && E <= 3200, 'non-integer counts')
  const hard = d === 'hard'
  const u1 = rng.pick([20, 25, 40, 50, 60, 75, 80])
  const u2 = rng.pick([20, 25, 40, 50, 60, 75, 80])
  const mS = (mT * u1) / 100
  const fS = (fT * u2) / 100
  if (hard) need(Number.isInteger(mS) && Number.isInteger(fS) && mS > 0 && fS > 0, 'second level not integral')
  const g1 = p.g1
  const g2 = p.g2
  const tot = mT + fT
  let text = `${p.place}, there are ${E} ${p.unit}. The ratio of ${g1} to ${g2} ${p.unit} is ${a} : ${b}. ${x}% of the ${g1} ${p.unit} and ${y}% of the ${g2} ${p.unit} are ${p.trait}.`
  if (hard && p.second) text += ` Of the ${g1} ${p.trait}, ${u1}% are ${p.second.trait}, while ${u2}% of the ${g2} ${p.trait} are ${p.second.trait}.`
  const vE = txt(E)
  const vMale = vdiv(vmul(vE, txt(a)), vadd(txt(a), txt(b)))
  const vFemale = vdiv(vmul(vE, txt(b)), vadd(txt(a), txt(b)))
  const vMT = vdiv(vmul(vMale, txt(x)), lit(100))
  const vFT = vdiv(vmul(vFemale, txt(y)), lit(100))
  const vTot = vadd(vMT, vFT)
  const rows: (string | number)[][] = [
    ['Total', male, female, E],
    [cap(p.trait), mT, fT, tot],
    [`Not ${p.trait}`, male - mT, female - fT, E - tot],
  ]
  if (hard && p.second) {
    rows.push([cap(p.second.trait), mS, fS, mS + fS], [`${cap(p.trait)} but not ${p.second.trait}`, mT - mS, fT - fS, tot - mS - fS])
  }
  const stimulus: Stimulus = {
    directions: 'Read the following information carefully and answer the questions that follow.',
    parts: [{ kind: 'text', paragraphs: [text] }],
    workings: [{ kind: 'table', heading: `Data in tabular form (${p.unit})`, columns: ['', cap(g1), cap(g2), 'Total'], rows }],
  }
  WORKINGS_META.set(stimulus, { kind: 'pop', hard: hard && !!p.second })
  const sSum = `Sum of ratio terms = ${a} + ${b} = ${a + b}`
  const sSizes = `${cap(g1)} ${p.unit} = ${E} × ${a} ÷ ${a + b} = ${male}; ${cap(g2)} ${p.unit} = ${E} × ${b} ÷ ${a + b} = ${female}`
  const sM = `${cap(g1)} ${p.trait} = ${male} × ${x} ÷ 100 = ${mT}`
  const sF = `${cap(g2)} ${p.trait} = ${female} × ${y} ÷ 100 = ${fT}`
  const sTot = `Total ${p.trait} = ${mT} + ${fT} = ${tot}`
  const qs: Q[] = [
    { id: 'male', stem: `How many ${g1} ${p.unit} are there?`, kind: 'int', v: vMale, expect: male, wrong: [vFemale], steps: [sSum, `${cap(g1)} ${p.unit} = Total × ${a} ÷ ${a + b} = ${E} × ${a} ÷ ${a + b} = {R}`] },
    { id: 'female', stem: `How many ${g2} ${p.unit} are there?`, kind: 'int', v: vFemale, expect: female, wrong: [vMale], steps: [sSum, `${cap(g2)} ${p.unit} = Total × ${b} ÷ ${a + b} = ${E} × ${b} ÷ ${a + b} = {R}`] },
    { id: 'mT', stem: `How many ${g1} ${p.unit} are ${p.trait}?`, kind: 'int', v: vMT, expect: mT, wrong: [vMale], steps: [sSum, `${cap(g1)} ${p.unit} = ${E} × ${a} ÷ ${a + b} = ${male}`, R(sM, mT)] },
    { id: 'fT', stem: `How many ${g2} ${p.unit} are ${p.trait}?`, kind: 'int', v: vFT, expect: fT, wrong: [vFemale], steps: [sSum, `${cap(g2)} ${p.unit} = ${E} × ${b} ÷ ${a + b} = ${female}`, R(sF, fT)] },
    { id: 'tot', stem: `What is the total number of ${p.trait} in the ${p.place.replace('In a ', '').replace('In ', '')}?`, kind: 'int', v: vTot, expect: tot, wrong: [vabs(vMT, vFT)], steps: [sSum, sSizes, sM, sF, R(sTot, tot)] },
    { id: 'non', stem: `How many ${p.unit} are not ${p.trait}?`, kind: 'int', v: vsub(vE, vTot), expect: E - tot, wrong: [vTot], steps: [sSum, sSizes, sM, sF, sTot, `Not ${p.trait} = Total ${p.unit} − ${p.trait} = ${E} − ${tot} = {R}`] },
    { id: 'diff', stem: `What is the difference between the number of ${g1} ${p.trait} and the number of ${g2} ${p.trait}?`, kind: 'int', v: vabs(vMT, vFT), expect: Math.abs(mT - fT), wrong: [vTot], steps: [sSum, sSizes, sM, sF, `Difference = ${Math.max(mT, fT)} − ${Math.min(mT, fT)} = {R}`] },
    { id: 'ratioT', stem: `What is the ratio of ${g1} ${p.trait} to ${g2} ${p.trait}?`, kind: 'ratio', ratio: [vMT, vFT], expect: [mT, fT], wrong: [], steps: [sSum, sSizes, sM, sF, `Required ratio = ${g1} ${p.trait} : ${g2} ${p.trait} = ${mT} : ${fT}`] },
    { id: 'pctT', stem: `What percent of the total ${p.unit} are ${p.trait}?`, kind: 'pct', v: vmul(vdiv(vTot, vE), lit(100)), expect: (tot * 100) / E, wrong: [], steps: [sSum, sSizes, sM, sF, sTot, `Required % = (${p.trait} ÷ total ${p.unit}) × 100 = (${tot} ÷ ${E}) × 100 = {R}`] },
    { id: 'nonMale', stem: `How many ${g1} ${p.unit} are not ${p.trait}?`, kind: 'int', v: vsub(vMale, vMT), expect: male - mT, wrong: [vMT], steps: [sSum, `${cap(g1)} ${p.unit} = ${E} × ${a} ÷ ${a + b} = ${male}`, sM, `Not ${p.trait} among ${g1} = ${male} − ${mT} = {R}`] },
  ]
  if (hard && p.second) {
    const vMS = vdiv(vmul(vMT, txt(u1)), lit(100))
    const vFS = vdiv(vmul(vFT, txt(u2)), lit(100))
    const vS = vadd(vMS, vFS)
    const sMS = `${cap(g1)} ${p.second.trait} = ${mT} × ${u1} ÷ 100 = ${mS}`
    const sFS = `${cap(g2)} ${p.second.trait} = ${fT} × ${u2} ÷ 100 = ${fS}`
    qs.push(
      { id: 'mS', stem: `How many ${g1} ${p.unit} are ${p.second.trait}?`, kind: 'int', v: vMS, expect: mS, wrong: [vMT], steps: [sSum, `${cap(g1)} ${p.unit} = ${E} × ${a} ÷ ${a + b} = ${male}`, sM, R(sMS, mS)] },
      { id: 'fS', stem: `How many ${g2} ${p.unit} are ${p.second.trait}?`, kind: 'int', v: vFS, expect: fS, wrong: [vFT], steps: [sSum, `${cap(g2)} ${p.unit} = ${E} × ${b} ÷ ${a + b} = ${female}`, sF, R(sFS, fS)] },
      { id: 'sTot', stem: `What is the total number of ${p.second.trait} ${p.unit}?`, kind: 'int', v: vS, expect: mS + fS, wrong: [vabs(vMS, vFS)], steps: [sSum, sSizes, sM, sF, sMS, sFS, `Total ${p.second.trait} = ${mS} + ${fS} = {R}`] },
      { id: 'sNonF', stem: `How many ${g2} ${p.trait} are not ${p.second.trait}?`, kind: 'int', v: vsub(vFT, vFS), expect: fT - fS, wrong: [vFS], steps: [sSum, `${cap(g2)} ${p.unit} = ${E} × ${b} ÷ ${a + b} = ${female}`, sF, sFS, `${cap(g2)} ${p.trait} who are not ${p.second.trait} = ${fT} − ${fS} = {R}`] },
      { id: 'sRatio', stem: `What is the ratio of ${g1} ${p.second.trait} to ${g2} ${p.second.trait}?`, kind: 'ratio', ratio: [vMS, vFS], expect: [mS, fS], wrong: [], steps: [sSum, sSizes, sM, sF, sMS, sFS, `Required ratio = ${mS} : ${fS}`] },
      { id: 'sPct', stem: `What percent of the total ${p.unit} are ${p.second.trait}?`, kind: 'pct', v: vmul(vdiv(vS, vE), lit(100)), expect: ((mS + fS) * 100) / E, wrong: [], steps: [sSum, sSizes, sM, sF, sMS, sFS, `Total ${p.second.trait} = ${mS} + ${fS} = ${mS + fS}`, `Required % = (${p.second.trait} ÷ total ${p.unit}) × 100 = (${mS + fS} ÷ ${E}) × 100 = {R}`] },
    )
  }
  return { stimulus, qs }
}

// ------------------------------------------------------------------ public
export function genCaselet(rng: Rng, d: MockDifficulty, count: number): Group[] {
  const groups: Group[] = []
  let left = count
  while (left > 0) {
    const n = Math.min(5, left)
    let made: Group | null = null
    for (let tries = 0; tries < 80 && !made; tries++) {
      try {
        const kind = wpick<string>(rng, d === 'hard' ? [['venn3', 40], ['pop', 40], ['venn2', 20]] : [['venn2', 45], ['pop', 55]])
        const { stimulus, qs } = kind === 'venn3' ? venn3(rng) : kind === 'venn2' ? venn2(rng, d) : pop(rng, d)
        const order = rng.shuffle(qs)
        const out = []
        const used = new Set<string>()
        for (const q of order) {
          if (out.length >= n) break
          if (used.has(q.id)) continue
          try {
            const draft = finish(rng, toCand(q), stimulus, 'di-caselet')
            if (draft) {
              out.push(draft)
              used.add(q.id)
            }
          } catch (e) {
            if (!(e instanceof Reject)) throw e
          }
        }
        if (out.length === n) made = { stimulus, questions: out }
      } catch (e) {
        if (!(e instanceof Reject)) throw e
      }
    }
    if (!made) throw new Error('di-caselet: could not build a set')
    groups.push(made)
    left -= n
  }
  return groups
}
