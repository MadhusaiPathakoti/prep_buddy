// SBI PO Mains-level word-problem generators, set A: percentage, profit-loss, ratio-partnership, ages-averages,
// interest, number-system.  Every template chains 2-4 concepts, is designed backwards from clean integers, and
// cross-checks its key with a second (forward / substitution) computation via `ensure`.
// The verifier (scripts/verify-mains-qarithA.ts) re-solves each question by brute force from the tagged inputs.
import type { Rng } from '../../rng'
import type { Group, MockDifficulty, QuantTopicId, QuestionDraft, TopicGenerator } from '../../types'
import { fmtNum } from '../../options'
import { F, Reject, decStr, disp, ensure, fracStr, fadd, fdiv, feq, fint, fmul, fsub, fval, gcd, lcm, need, nq, pickMen, pickNames, ratioStr, rstep, strQ, terminating } from '../util'
import type { Frac, Tpl } from '../util'

// ---------------------------------------------------------------- verifier side-channel (inputs only, never part of the output)
export interface MainsMeta {
  t: string
  p: Record<string, number | number[]>
}
const META = new WeakMap<QuestionDraft, MainsMeta>()
export function mainsArithMeta(q: QuestionDraft): MainsMeta | undefined {
  return META.get(q)
}
function tag(q: QuestionDraft, t: string, p: Record<string, number | number[]>): QuestionDraft {
  META.set(q, { t, p })
  return q
}

// ---------------------------------------------------------------- small helpers
const P = (n: number): Frac => F(n)
const pc = (x: number | Frac): string => (typeof x === 'number' ? fmtNum(x, 2) : decStr(x, 8))
const L = (...l: string[]): string => l.join('\n')
const rs = (n: number | Frac): string => `₹${pc(n)}`

// ============================================================================ PERCENTAGE
/** Ratio of groups + literacy percentages, population hidden behind a difference. */
function pctLiteracy(rng: Rng): QuestionDraft {
  const [m, f] = rng.pick([[3, 2], [5, 4], [7, 5], [4, 3], [5, 3], [3, 1], [2, 1], [7, 3]] as const)
  const p = rng.pick([40, 45, 50, 55, 60, 65, 70, 75, 80])
  const q = rng.pick([30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90])
  need(f * q !== m * p, 'literates must differ')
  const femMore = f * q > m * p
  const k = rng.int(2, 30)
  const T = 100 * (m + f) * k
  const litM = m * k * p
  const litF = f * k * q
  const D = Math.abs(litF - litM)
  const Tb = fdiv(P(D * 100 * (m + f)), P(Math.abs(f * q - m * p)))
  ensure(fint(Tb) && Tb.n === T, 'literacy population mismatch')
  const ans = T - litM - litF
  const place = rng.pick(['Ramgarh', 'Kaveripur', 'Sundarpur', 'Nandipur', 'Lakshmipur', 'Bhimavaram'])
  const stem = `In ${place}, the ratio of males to females is ${m} : ${f}. ${p}% of the males and ${q}% of the females are literate. If the number of literate ${femMore ? 'females' : 'males'} is ${D} more than the number of literate ${femMore ? 'males' : 'females'}, how many people of ${place} are illiterate?`
  const why = L(
    `Let males = ${m}y and females = ${f}y.`,
    `Literate males = ${p}% of ${m}y = ${pc((p * m) / 100)}y; literate females = ${q}% of ${f}y = ${pc((q * f) / 100)}y.`,
    `Difference = (${Math.max(f * q, m * p)} − ${Math.min(f * q, m * p)})/100 × y = ${D} ⇒ y = ${100 * k}.`,
    `Population = (${m} + ${f}) × ${100 * k} = ${T}; literate = (${m * p} + ${f * q})/100 × ${100 * k} = ${litM + litF}.`,
    `Illiterate = ${T} − ${litM + litF} = ${ans}`,
  )
  return tag(nq(rng, 'percentage', stem, ans, [T, litM + litF, fdiv(P(T * (200 - p - q)), P(200)), T - litM], why), 'pct-literacy', { m, f, p, q, D, femMore: femMore ? 1 : 0 })
}

/** Invalid votes + a hypothetical shift of the winner's votes; total polled is hidden two steps away. */
function pctElectionShift(rng: Rng): QuestionDraft {
  const i = rng.pick([5, 8, 10, 12, 15, 20, 25])
  const p = rng.pick([55, 60, 65, 70, 75])
  const y = rng.pick([10, 15, 20, 25, 30, 40])
  const T = rstep(rng, 4000, 40000, 1000)
  need((T * (100 - i)) % 100 === 0, 'valid votes not integral')
  const V = (T * (100 - i)) / 100
  need((V * p) % 100 === 0, 'winner votes not integral')
  const w = (V * p) / 100
  const l = V - w
  need((w * y) % 100 === 0, 'shifted votes not integral')
  const s = (w * y) / 100
  const D = l + s - (w - s)
  need(D > 0, 'loser must win after the shift')
  const marginPct = F(100 - 2 * p, 100) // loser minus winner share, before shift
  const shiftPct = F(2 * p * y, 10000)
  const net = fadd(marginPct, shiftPct)
  const Vb = fdiv(P(D), net)
  const Tb = fdiv(fmul(Vb, P(100)), P(100 - i))
  ensure(feq(Vb, P(V)) && feq(Tb, P(T)), 'election shift mismatch')
  const bad = fdiv(P(D), fadd(marginPct, F(2 * y, 100)))
  const stem = `In an election between two candidates, ${i}% of the votes polled were invalid and the winner got ${p}% of the valid votes. Had ${y}% of the winner's votes gone to the other candidate instead, the loser would have won by ${D} votes. How many votes were polled in all?`
  const sh = fmul(F(p * (100 - y), 100), P(1))
  const why = L(
    `Let valid votes = x. Winner = ${p}% of x, loser = ${100 - p}% of x.`,
    `After ${y}% of the winner's votes shift: winner = ${p}% × ${100 - y}% = ${pc(sh)}% of x; loser = ${100 - p}% + ${p}% × ${y}% = ${pc(fadd(P(100 - p), F(p * y, 100)))}% of x.`,
    `Loser − winner = (${pc(fadd(P(100 - p), F(p * y, 100)))} − ${pc(sh)})% of x = ${pc(fmul(net, P(100)))}% of x = ${D} ⇒ x = ${V}.`,
    `Valid votes are ${100 - i}% of votes polled ⇒ votes polled = ${V} × 100/${100 - i} = ${T}.`,
  )
  return tag(nq(rng, 'percentage', stem, T, [V, fdiv(fmul(bad, P(100)), P(100 - i)), w, fdiv(P(V * 100), P(100 + i))], why), 'pct-election-shift', { i, p, y, D })
}

/** Price/consumption changes on two items with a spending ratio: net change in the family's total expenditure. */
function pctExpenditure(rng: Rng): QuestionDraft {
  const [u, v] = rng.pick([[3, 2], [2, 1], [3, 1], [4, 3], [5, 3], [1, 1], [3, 4], [2, 3]] as const)
  const a = rng.pick([10, 20, 25, 30, 40, 50])
  const c = rng.pick([10, 20, 25, 30])
  const b = rng.pick([10, 20, 25, 30, 40])
  const d = rng.pick([10, 20, 25, 30, 50])
  const sf = F((100 + a) * (100 - c), 10000)
  const rf = F((100 - b) * (100 + d), 10000)
  const f = fdiv(fadd(fmul(P(u), sf), fmul(P(v), rf)), P(u + v))
  const ch = fmul(fsub(f, P(1)), P(100))
  need(ch.n !== 0 && terminating(ch, 2), 'net change unclean')
  const up = ch.n > 0
  const mag = F(Math.abs(ch.n), ch.d)
  // independent check: simulate with 10000-unit budget shares
  const U = u * 10000
  const V2 = v * 10000
  const newTotal = (U * (100 + a) * (100 - c)) / 10000 + (V2 * (100 - b) * (100 + d)) / 10000
  ensure(Math.abs(((newTotal - U - V2) / (U + V2)) * 100 - fval(ch)) < 1e-9, 'expenditure mismatch')
  const sugar = rng.pick(['sugar', 'wheat', 'tea', 'edible oil'])
  const rice = rng.pick(['rice', 'pulses', 'milk', 'ghee'])
  const base = `A family spends on ${sugar} and ${rice} in the ratio ${u} : ${v}. The price of ${sugar} rises by ${a}% and that of ${rice} falls by ${b}%. In response, the family cuts its consumption of ${sugar} by ${c}% and raises its consumption of ${rice} by ${d}%.`
  const whyHead = [
    `Take the old spends as ${u}k on ${sugar} and ${v}k on ${rice}.`,
    `New spend on ${sugar} = ${u}k × ${100 + a}/100 × ${100 - c}/100 = ${pc(fmul(P(u), sf))}k.`,
    `New spend on ${rice} = ${v}k × ${100 - b}/100 × ${100 + d}/100 = ${pc(fmul(P(v), rf))}k.`,
    `New total = ${pc(fadd(fmul(P(u), sf), fmul(P(v), rf)))}k against old ${u + v}k.`,
  ]
  if (rng.chance(0.5)) {
    const dir = (x: number): string => `${pc(Math.abs(x))}% ${x >= 0 ? 'increase' : 'decrease'}`
    const wrongs = [
      (u * a - v * b) / (u + v),
      ((fval(sf) - 1 + fval(rf) - 1) * 100) / 2,
      ((v * (fval(sf) - 1) + u * (fval(rf) - 1)) * 100) / (u + v),
      -fval(ch),
      fval(ch) * 2,
    ].map((x) => dir(Math.round(x * 100) / 100))
    return tag(strQ(rng, { topic: 'percentage', stem: `${base} What is the net change in the family's total monthly expenditure on the two items?`, correct: dir(fval(ch)), wrong: wrongs, why: L(...whyHead, `Change = (${pc(f)} − 1) × 100 = ${decStr(ch, 2).replace('-', '−')}%, i.e. a ${decStr(mag, 2)}% ${up ? 'increase' : 'decrease'}.`) }), 'pct-expenditure-change', { u, v, a, b, c, d })
  }
  const E = rstep(rng, 20000, 90000, 100 * (u + v))
  const Fn = fmul(P(E), f)
  need(fint(Fn), 'new expenditure not integral')
  return tag(nq(rng, 'percentage', `${base} If the family originally spent ₹${E} in total on the two items per month, what is its new monthly expenditure on them?`, Fn, [E, fdiv(fmul(P(E), P(100 + a - b)), P(100)), fmul(P(E), fadd(sf, rf)), fdiv(fmul(P(E), P(200 + a - c + d - b)), P(200))], L(...whyHead, `Original: ${u}k + ${v}k = ${E} ⇒ k = ${pc(F(E, u + v))}.`, `New total = ${pc(fadd(fmul(P(u), sf), fmul(P(v), rf)))} × ${pc(F(E, u + v))} = ${rs(Fn)}`), { pre: '₹' }), 'pct-expenditure-amount', { u, v, a, b, c, d, E })
}

/** Three sections with ratio of maximum marks; marks / percentage needed in the last to meet an overall cut-off. */
function pctSections(rng: Rng): QuestionDraft {
  const [a, b, c] = rng.pick([[2, 3, 5], [3, 4, 5], [1, 2, 2], [2, 2, 1], [3, 3, 4], [1, 1, 2], [2, 3, 3], [4, 3, 3]] as const)
  const unit = rng.pick([20, 25, 40, 50])
  const M1 = a * unit
  const M2 = b * unit
  const M3 = c * unit
  const T = M1 + M2 + M3
  const s1 = rng.pick([40, 45, 50, 55, 60, 65, 70, 75, 80])
  const s2 = rng.pick([35, 40, 45, 50, 55, 60, 65, 70, 75, 80])
  const q = rng.pick([40, 45, 50, 55, 60, 65])
  need((M1 * s1) % 100 === 0 && (M2 * s2) % 100 === 0 && (T * q) % 100 === 0, 'marks not integral')
  const got = (M1 * s1) / 100 + (M2 * s2) / 100
  const req = (T * q) / 100 - got
  need(req > 0 && req < M3, 'needed marks unreasonable')
  const reqPct = F(req * 100, M3)
  need(terminating(reqPct, 2), 'percentage unclean')
  ensure(Math.abs((got + req) / T - q / 100) < 1e-12, 'qualifying total mismatch')
  const nm = pickNames(rng, 1)[0]
  const head = `An examination has three sections with maximum marks in the ratio ${a} : ${b} : ${c}, the total being ${T}. ${nm} scored ${s1}% in the first section and ${s2}% in the second. The qualifying criterion is ${q}% of the total marks.`
  const why = L(
    `Section maxima: ${M1}, ${M2}, ${M3}.`,
    `Marks scored: ${s1}% of ${M1} = ${(M1 * s1) / 100}; ${s2}% of ${M2} = ${(M2 * s2) / 100}; total so far = ${got}.`,
    `Qualifying marks = ${q}% of ${T} = ${(T * q) / 100}.`,
    `Needed in third section = ${(T * q) / 100} − ${got} = ${req}.`,
  )
  if (rng.chance(0.5)) return tag(nq(rng, 'percentage', `${head} How many marks must ${nm} score in the third section to qualify?`, req, [fdiv(P(q * M3), P(100)), req + unit / 5, (3 * q * M3) / 100 - (s1 * M3) / 100, Math.max(1, req - unit / 2)], why), 'pct-sections-marks', { M1, M2, M3, s1, s2, q })
  return tag(nq(rng, 'percentage', `${head} What minimum percentage of marks must ${nm} score in the third section to qualify?`, reqPct, [q, 3 * q - s1 - s2, fval(reqPct) + 5, (req * 100) / T], L(why, `Percentage needed = ${req}/${M3} × 100 = ${pc(reqPct)}%`), { post: '%' }), 'pct-sections-pct', { M1, M2, M3, s1, s2, q })
}

/** Chain of "x% more / y% less" relationships between three salaries, plus later hikes and cuts. */
function pctSalaryChain(rng: Rng): QuestionDraft {
  const x = rng.pick([10, 20, 25, 40, 50, 60])
  const y = rng.pick([10, 20, 25, 30, 40, 50])
  const z = rng.pick([10, 20, 25, 30, 40])
  const w = rng.pick([5, 10, 15, 20, 25])
  const C = rstep(rng, 8000, 60000, 500)
  const B = fdiv(P(C * (100 - y)), P(100))
  const A = fdiv(fmul(B, P(100 + x)), P(100))
  need(fint(B) && fint(A), 'salaries not integral')
  const nB = fdiv(fmul(B, P(100 + z)), P(100))
  const nC = fdiv(P(C * (100 - w)), P(100))
  need(fint(nB) && fint(nC), 'new salaries not integral')
  const S = A.n + C
  const total = A.n + nB.n + nC.n
  const Cb = fdiv(P(S), fadd(P(1), fdiv(fmul(P(100 - y), P(100 + x)), P(10000))))
  ensure(Cb.n === C && Cb.d === 1, 'salary chain mismatch')
  const [n1, n2, n3] = pickMen(rng, 3)
  const stem = `${n1}'s salary is ${x}% more than ${n2}'s salary, and ${n2}'s salary is ${y}% less than ${n3}'s salary. ${n1} and ${n3} together earn ₹${S}. If ${n2} gets a ${z}% hike and ${n3}'s salary is cut by ${w}%, what is the new combined salary of the three?`
  const why = L(
    `Let ${n3}'s salary = x. Then ${n2} = ${100 - y}% of x = ${pc(F(100 - y, 100))}x and ${n1} = ${100 + x}% of that = ${pc(F((100 - y) * (100 + x), 10000))}x.`,
    `${n1} + ${n3} = (${pc(F((100 - y) * (100 + x), 10000))} + 1)x = ${S} ⇒ x = ${C}.`,
    `${n2} = ${pc(B)}, ${n1} = ${pc(A)}.`,
    `New ${n2} = ${pc(B)} × ${100 + z}/100 = ${pc(nB)}; new ${n3} = ${C} × ${100 - w}/100 = ${pc(nC)}.`,
    `Combined = ${pc(A)} + ${pc(nB)} + ${pc(nC)} = ${rs(total)}`,
  )
  return tag(nq(rng, 'percentage', stem, total, [S, A.n + B.n + C, A.n + nB.n + C, S + nB.n], why, { pre: '₹' }), 'pct-salary-chain', { x, y, z, w, S })
}

/** Overlapping failures: percentages of failures in two subjects and both, a count of "exactly one" students. */
function pctVenn(rng: Rng): QuestionDraft {
  const x = rng.pick([20, 25, 30, 35, 40, 45])
  const y = rng.pick([15, 20, 25, 30, 35])
  const z = rng.pick([5, 10, 15])
  need(z < Math.min(x, y) && x + y - z < 80, 'venn percentages unsuitable')
  const T = rstep(rng, 400, 4000, 100)
  need((T * (x + y - 2 * z)) % 100 === 0 && (T * (x - z)) % 100 === 0, 'counts not integral')
  const K = (T * (x + y - 2 * z)) / 100
  const both = (T * (100 - x - y + z)) / 100
  const mOnly = (T * (x - z)) / 100
  const Tb = (K * 100) / (x + y - 2 * z)
  ensure(Tb === T, 'venn total mismatch')
  const subj = rng.pick([['Mathematics', 'English'], ['Reasoning', 'Quantitative Aptitude'], ['Physics', 'Chemistry']])
  const stem = `In an examination, ${x}% of the students failed in ${subj[0]}, ${y}% failed in ${subj[1]} and ${z}% failed in both subjects. If ${K} students passed in exactly one of the two subjects, `
  const head = [
    `Failed in exactly one subject = (${x} − ${z}) + (${y} − ${z}) = ${x + y - 2 * z}% of all students.`,
    `Since passing exactly one subject means failing exactly the other, ${x + y - 2 * z}% of total = ${K} ⇒ total = ${T}.`,
  ]
  if (rng.chance(0.5)) return tag(nq(rng, 'percentage', `${stem}how many passed in both subjects?`, both, [(T * (100 - x - y)) / 100, K, T - K, (K * (100 - x - y + z)) / (x + y - z)], L(...head, `Failed in at least one = ${x} + ${y} − ${z} = ${x + y - z}%, so passed both = ${100 - x - y + z}% of ${T} = ${both}.`)), 'pct-venn-both', { x, y, z, K })
  return tag(nq(rng, 'percentage', `${stem}how many failed in ${subj[0]} only?`, mOnly, [(T * x) / 100, (K * x) / (x + y), K - mOnly, (T * (y - z)) / 100], L(...head, `Failed in ${subj[0]} only = (${x} − ${z})% of ${T} = ${mOnly}.`)), 'pct-venn-only', { x, y, z, K })
}

/** Three successive yearly changes known only through the present figure: difference with the figure 3 years ago. */
function pctPopulationReverse(rng: Rng): QuestionDraft {
  const a = rng.pick([10, 20, 25, 30, 40, 50])
  const b = rng.pick([10, 20, 25, 30, 40, 50])
  const c = rng.pick([10, 20, 25, 30, 50])
  const P0 = rstep(rng, 4000, 60000, 400)
  const P1 = fdiv(P(P0 * (100 + a)), P(100))
  const P2 = fdiv(fmul(P1, P(100 - b)), P(100))
  const P3 = fdiv(fmul(P2, P(100 + c)), P(100))
  need(fint(P1) && fint(P2) && fint(P3), 'population chain unclean')
  const N = P3.n
  const back = fdiv(P(N * 10 ** 6), P((100 + a) * (100 - b) * (100 + c)))
  ensure(fint(back) && back.n === P0, 'population reverse mismatch')
  need(N !== P0, 'no difference')
  const diff = Math.abs(N - P0)
  const place = rng.pick(['a town', 'a village', 'a colony', 'a city ward'])
  const stem = `The population of ${place} grew by ${a}% in the first year, fell by ${b}% in the second year and grew by ${c}% in the third year. If its present population is ${N}, what is the difference between the present population and the population three years ago?`
  const why = L(
    `Present = P × ${100 + a}/100 × ${100 - b}/100 × ${100 + c}/100 = ${pc(F((100 + a) * (100 - b) * (100 + c), 10 ** 6))}P.`,
    `P = ${N} ÷ ${pc(F((100 + a) * (100 - b) * (100 + c), 10 ** 6))} = ${P0}.`,
    `Difference = |${N} − ${P0}| = ${diff}`,
  )
  const wrongNet = fdiv(P(N * Math.abs(a - b + c)), P(100))
  return tag(nq(rng, 'percentage', stem, diff, [wrongNet, P1.n - P0, Math.abs(P2.n - P0), (N * (a + c - b)) / 100 + 100], why), 'pct-population-reverse', { a, b, c, N })
}

/** Income, rent, food, travel as successive percentages of what is left; next year's changes; new savings. */
function pctIncomeSavings(rng: Rng): QuestionDraft {
  const a = rng.pick([20, 25, 30, 40])
  const b = rng.pick([20, 25, 30, 40, 50])
  const c = rng.pick([10, 20, 25, 40])
  const x = rng.pick([10, 15, 20, 25])
  const y = rng.pick([10, 20, 25, 40])
  const z = rng.pick([5, 10, 15, 20, 30])
  const I = rstep(rng, 20000, 100000, 1000)
  const rent = (I * a) / 100
  const rest1 = I - rent
  const food = (rest1 * b) / 100
  const rest2 = rest1 - food
  const trav = (rest2 * c) / 100
  const S0 = rest2 - trav
  need(Number.isInteger(rent) && Number.isInteger(food) && Number.isInteger(trav), 'expenditure not integral')
  const Ib = fdiv(P(S0 * 10 ** 6), P((100 - a) * (100 - b) * (100 - c)))
  ensure(fint(Ib) && Ib.n === I, 'income reverse mismatch')
  const nI = (I * (100 + x)) / 100
  const nRent = (rent * (100 + y)) / 100
  const nOther = ((food + trav) * (100 + z)) / 100
  need(Number.isInteger(nI) && Number.isInteger(nRent) && Number.isInteger(nOther), 'new figures not integral')
  const nS = nI - nRent - nOther
  need(nS > 0, 'savings must stay positive')
  const nm = pickMen(rng, 1)[0]
  const stem = `${nm} spends ${a}% of his monthly income on rent, ${b}% of the remainder on food and ${c}% of what is then left on travel, saving the rest, which is ₹${S0}. Next year his income rises by ${x}%, his rent rises by ${y}% and his combined spending on food and travel rises by ${z}%. How much will he save per month next year?`
  const why = L(
    `Savings = ${100 - a}% × ${100 - b}% × ${100 - c}% of income = ${pc(F((100 - a) * (100 - b) * (100 - c), 10 ** 6))} × income = ${S0} ⇒ income = ${I}.`,
    `Rent = ${rent}; food = ${b}% of ${rest1} = ${food}; travel = ${c}% of ${rest2} = ${trav}.`,
    `New income = ${I} × ${100 + x}/100 = ${nI}; new rent = ${rent} × ${100 + y}/100 = ${nRent}; new food + travel = ${food + trav} × ${100 + z}/100 = ${nOther}.`,
    `New savings = ${nI} − ${nRent} − ${nOther} = ${rs(nS)}`,
  )
  return tag(nq(rng, 'percentage', stem, nS, [(S0 * (100 + x)) / 100, nI - rent - food - trav, nI - nRent - (food + trav), nS + (rent * y) / 100], why, { pre: '₹' }), 'pct-income-savings', { a, b, c, x, y, z, S0 })
}

export const PCT_A: Tpl[] = [
  { name: 'pct-literacy', gen: (r) => pctLiteracy(r) },
  { name: 'pct-election-shift', gen: (r) => pctElectionShift(r) },
  { name: 'pct-expenditure', gen: (r) => pctExpenditure(r) },
  { name: 'pct-sections', gen: (r) => pctSections(r) },
  { name: 'pct-salary-chain', gen: (r) => pctSalaryChain(r) },
  { name: 'pct-venn', gen: (r) => pctVenn(r) },
  { name: 'pct-population-reverse', gen: (r) => pctPopulationReverse(r) },
  { name: 'pct-income-savings', gen: (r) => pctIncomeSavings(r) },
]

// ============================================================================ PROFIT & LOSS
/** "x% profit" / "y% loss" text answers (direction is part of the answer, so the sign is a trap). */
const plText = (x: number): string => (x >= 0 ? `${fmtNum(x, 2)}% profit` : `${fmtNum(-x, 2)}% loss`)
function plQ(rng: Rng, stem: string, ans: Frac, wrongs: number[], why: string): QuestionDraft {
  need(terminating(ans, 2) && ans.n !== 0, 'profit/loss percentage unclean')
  const a = fval(ans)
  const ws = [...wrongs, -a, Math.abs(a) + 2.5, Math.abs(a) + 5, -(Math.abs(a) + 2.5)].filter((x) => x > -100).map((x) => plText(Math.round(x * 100) / 100))
  return strQ(rng, { topic: 'profit-loss', stem, correct: plText(a), wrong: ws, why: L(why, `Overall result = ${plText(a)}`) })
}

/** Two articles with a profit and a loss: unknown cost solved from the total cost and the net gain/loss. */
function plTwoArticles(rng: Rng): QuestionDraft {
  const rates = [5, 8, 10, 12, 15, 20, 25, 30, 40]
  const p = rng.pick(rates)
  const q = rng.pick(rates)
  const a = rstep(rng, 1000, 12000, 500)
  const b = rstep(rng, 1000, 12000, 500)
  need(a !== b, 'equal costs')
  const T = a + b
  need((a * p - b * q) % 100 === 0, 'net not integral')
  const G = (a * p - b * q) / 100
  const ab = fdiv(P(100 * G + T * q), P(p + q))
  ensure(fint(ab) && ab.n === a, 'two-article mismatch')
  const [pr, ls] = rng.pick([['a washing machine', 'a microwave oven'], ['a tablet', 'a printer'], ['a sofa set', 'a dining table'], ['a camera', 'a speaker system']])
  const res = G > 0 ? `an overall profit of ₹${G}` : G < 0 ? `an overall loss of ₹${-G}` : 'neither profit nor loss overall'
  const the = pr.replace(/^an? /, 'the ')
  const stem = `A dealer bought ${pr} and ${ls} for ₹${T} in all. He sold ${the} at a profit of ${p}% and ${ls.replace(/^an? /, 'the ')} at a loss of ${q}%, and made ${res}. What was the cost price of ${the}?`
  const why = L(
    `Let the cost of ${the} be ₹x; then ${ls.replace(/^an? /, 'the ')} cost ₹(${T} − x).`,
    `Net gain: ${p}% of x − ${q}% of (${T} − x) = ${G < 0 ? '−' : ''}${Math.abs(G)}.`,
    `${p}x − ${q}(${T} − x) = ${100 * G} ⇒ ${p + q}x = ${100 * G + T * q}.`,
    `x = ${100 * G + T * q}/${p + q} = ${a}`,
  )
  return tag(nq(rng, 'profit-loss', stem, a, [b, T / 2, (T * q) / (p + q), (T * p) / (p + q)], why, { pre: '₹' }), 'pl-two-articles', { p, q, T, G })
}

/** Marked price, two successive discounts versus one discount: hidden CP from the extra profit. */
function plDiscountCompare(rng: Rng): QuestionDraft {
  const m = rng.pick([20, 25, 30, 40, 50, 60, 75])
  const d1 = rng.pick([5, 10, 15, 20, 25])
  const d2 = rng.pick([5, 10, 15, 20, 25])
  const d3 = rng.pick([10, 12, 15, 18, 20, 24, 25, 30])
  const sp2f = F((100 - d1) * (100 - d2), 10000)
  const sp1f = F(100 - d3, 100)
  need(fval(sp1f) > fval(sp2f), 'single discount must be smaller')
  const c = rstep(rng, 2000, 40000, 2000)
  const mpv = fdiv(P(c * (100 + m)), P(100))
  const G = fmul(mpv, fsub(sp1f, sp2f))
  need(fint(G), 'extra gain not integral')
  const cb = fdiv(G, fmul(F(100 + m, 100), fsub(sp1f, sp2f)))
  ensure(fint(cb) && cb.n === c, 'discount compare mismatch')
  const stem = `A shopkeeper marks an article ${m}% above its cost price. He allows successive discounts of ${d1}% and ${d2}% to a customer. Had he allowed a single discount of ${d3}% instead, he would have earned ₹${G.n} more. What is the cost price of the article?`
  const why = L(
    `Let CP = ₹x, so marked price = ${pc(F(100 + m, 100))}x.`,
    `Successive discounts: SP1 = ${pc(F(100 + m, 100))}x × ${pc(F(100 - d1, 100))} × ${pc(F(100 - d2, 100))} = ${pc(fmul(F(100 + m, 100), sp2f))}x.`,
    `Single discount: SP2 = ${pc(F(100 + m, 100))}x × ${pc(sp1f)} = ${pc(fmul(F(100 + m, 100), sp1f))}x.`,
    `SP2 − SP1 = ${pc(fmul(F(100 + m, 100), fsub(sp1f, sp2f)))}x = ${G.n} ⇒ x = ${c}`,
  )
  const eqDisc = d1 + d2
  const wrongA = fdiv(G, fmul(F(100 + m, 100), fsub(sp1f, F(100 - eqDisc, 100))))
  return tag(nq(rng, 'profit-loss', stem, c, [fval(mpv), G.n * 10, fval(wrongA), fdiv(P(G.n * 100), P(d3 - d1 - d2 > 0 ? d3 - d1 - d2 : 10))], why, { pre: '₹' }), 'pl-discount-compare', { m, d1, d2, d3, G: G.n })
}

/** A stock sold in three lots (profit lot, loss lot, remainder): selling price of the remainder for a target overall profit. */
function plLots(rng: Rng): QuestionDraft {
  const Q = rstep(rng, 200, 1000, 100)
  const c = rstep(rng, 20, 80, 5)
  const f1 = rng.pick([20, 25, 30, 40])
  const f2 = rng.pick([20, 25, 30])
  const rem = 100 - f1 - f2
  need(rem >= 20, 'remainder too small')
  const p1 = rng.pick([10, 15, 20, 25])
  const l2 = rng.pick([5, 10, 12, 15, 20])
  const g = rng.pick([8, 10, 12, 15, 20])
  const q1 = (Q * f1) / 100
  const q2 = (Q * f2) / 100
  const q3 = (Q * rem) / 100
  need(Number.isInteger(q1) && Number.isInteger(q2) && Number.isInteger(q3), 'lots not integral')
  const R1 = fdiv(P(q1 * c * (100 + p1)), P(100))
  const R2 = fdiv(P(q2 * c * (100 - l2)), P(100))
  const target = fdiv(P(Q * c * (100 + g)), P(100))
  const s = fdiv(fsub(fsub(target, R1), R2), P(q3))
  need(terminating(s, 2) && fval(s) > 0, 'remainder price unclean')
  ensure(feq(fadd(fadd(R1, R2), fmul(s, P(q3))), target), 'lot revenue mismatch')
  const item = rng.pick(['rice', 'wheat', 'pulses', 'sugar', 'basmati rice'])
  const stem = `A trader bought ${Q} kg of ${item} at ₹${c} per kg. He sold ${f1}% of it at a profit of ${p1}% and another ${f2}% at a loss of ${l2}%. At what price per kg must he sell the remaining quantity so that he earns an overall profit of ${g}%?`
  const why = L(
    `Total cost = ${Q} × ${c} = ₹${Q * c}; required total SP = ${100 + g}% of ${Q * c} = ₹${pc(target)}.`,
    `Lot 1: ${q1} kg at ${100 + p1}% of ₹${c} ⇒ ₹${pc(R1)}.  Lot 2: ${q2} kg at ${100 - l2}% of ₹${c} ⇒ ₹${pc(R2)}.`,
    `Needed from the remaining ${q3} kg = ${pc(target)} − ${pc(R1)} − ${pc(R2)} = ₹${pc(fsub(fsub(target, R1), R2))}.`,
    `Price per kg = ${pc(fsub(fsub(target, R1), R2))}/${q3} = ₹${pc(s)}`,
  )
  const naive = fdiv(P(c * (100 + g)), P(100))
  return tag(nq(rng, 'profit-loss', stem, s, [fval(naive), fval(s) + c / 10, fval(fdiv(fsub(fsub(target, R1), R2), P(Q))), fval(s) - c / 10], why, { pre: '₹' }), 'pl-lots', { Q, c, f1, f2, p1, l2, g })
}

/** Two grades mixed, some weight lost, sold per kg: selling price to earn a target profit on the whole. */
function plMixtureWastage(rng: Rng): QuestionDraft {
  const [u, v] = rng.pick([[1, 1], [3, 1], [2, 3], [1, 4], [3, 5], [7, 1], [1, 3], [3, 2]] as const)
  const a = rstep(rng, 40, 120, 4)
  const b = rstep(rng, 40, 120, 4)
  need(a !== b, 'equal grades')
  const w = rng.pick([20, 25, 36, 40, 50, 60])
  const g = rng.pick([10, 12, 15, 20, 25, 30, 40])
  const cost = fdiv(P(u * a + v * b), P(u + v))
  const S = fdiv(fmul(cost, P(100 + g)), P(100 - w))
  need(terminating(S, 2), 'selling price unclean')
  // independent check: 100 kg bought, (100 − w) kg sold at S
  const outlay = fmul(cost, P(100))
  const revenue = fmul(S, P(100 - w))
  ensure(feq(revenue, fdiv(fmul(outlay, P(100 + g)), P(100))), 'wastage mixture mismatch')
  const item = rng.pick(['tea leaves', 'dry fruits', 'coffee beans', 'spices'])
  const stem = `A merchant mixes two varieties of ${item} costing ₹${a} and ₹${b} per kg in the ratio ${u} : ${v}. During packing, ${w}% of the weight of the mixture is lost as dust and moisture. At what price per kg must he sell what is left to make an overall profit of ${g}%?`
  const why = L(
    `Cost per kg of the mixture = (${u} × ${a} + ${v} × ${b})/${u + v} = ₹${pc(cost)}.`,
    `Take 100 kg bought: cost = ₹${pc(outlay)}; only ${100 - w} kg remains to sell.`,
    `Required revenue = ${100 + g}% of ${pc(outlay)} = ₹${pc(fdiv(fmul(outlay, P(100 + g)), P(100)))}.`,
    `Price per kg = ${pc(fdiv(fmul(outlay, P(100 + g)), P(100)))}/${100 - w} = ₹${pc(S)}`,
  )
  return tag(nq(rng, 'profit-loss', stem, S, [fmul(cost, F(100 + g, 100)), fdiv(fmul(cost, P(100 + g + w)), P(100)), fval(cost), fdiv(fmul(cost, P(100 + g)), P(100 - w / 2))], why, { pre: '₹' }), 'pl-mixture-wastage', { u, v, a, b, w, g })
}

/** A -> B -> C -> D chain with profit, loss, profit; net gain of the first three is the last price minus A's cost. */
function plChain(rng: Rng): QuestionDraft {
  const p = rng.pick([10, 20, 25, 30, 40, 50])
  const q = rng.pick([10, 20, 25, 30, 40])
  const r = rng.pick([10, 20, 25, 40, 50])
  const a = rstep(rng, 2000, 40000, 400)
  const b = fdiv(P(a * (100 + p)), P(100))
  const c = fdiv(fmul(b, P(100 - q)), P(100))
  const d = fdiv(fmul(c, P(100 + r)), P(100))
  need(fint(b) && fint(c) && fint(d), 'chain not integral')
  const net = d.n - a
  need(net > 0, 'net must be a gain')
  ensure(net === b.n - a - (b.n - c.n) + (d.n - c.n), 'chain net mismatch')
  const ab = fdiv(P(d.n * 10 ** 6), P((100 + p) * (100 - q) * (100 + r)))
  ensure(fint(ab) && ab.n === a, 'chain reverse mismatch')
  const [n1, n2, n3, n4] = pickNames(rng, 4)
  const stem = `${n1} sold an article to ${n2} at a profit of ${p}%. ${n2} sold it to ${n3} at a loss of ${q}%, and ${n3} sold it to ${n4} at a profit of ${r}% for ₹${d.n}. What is the net profit made by ${n1}, ${n2} and ${n3} together?`
  const why = L(
    `Let ${n1}'s cost be x. ${n2} pays ${pc(F(100 + p, 100))}x.`,
    `${n3} pays ${pc(F(100 + p, 100))}x × ${pc(F(100 - q, 100))} = ${pc(F((100 + p) * (100 - q), 10000))}x; ${n4} pays ${pc(F((100 + p) * (100 - q) * (100 + r), 10 ** 6))}x = ${d.n} ⇒ x = ${a}.`,
    `Profits/losses: ${n1} +${b.n - a}, ${n2} −${b.n - c.n}, ${n3} +${d.n - c.n}.`,
    `Net = (${b.n} − ${a}) − (${b.n} − ${c.n}) + (${d.n} − ${c.n}) = ${d.n} − ${a} = ₹${net}`,
  )
  return tag(nq(rng, 'profit-loss', stem, net, [(d.n * Math.abs(p - q + r)) / 100, d.n - c.n, d.n - b.n, b.n - a + (d.n - c.n)], why, { pre: '₹' }), 'pl-chain', { p, q, r, d: d.n })
}

/** Dishonest weight plus marked-up price and discount: overall gain or loss. */
function plFalseWeight(rng: Rng): QuestionDraft {
  const m = rng.pick([20, 25, 30, 40, 50, 60, 80])
  const d = rng.pick([5, 10, 15, 20, 25, 30])
  const w = rng.pick([800, 900, 875, 960, 750, 625, 840, 920, 500])
  const ratio = fdiv(P(1000), P(w))
  const f = fmul(fmul(F(100 + m, 100), F(100 - d, 100)), ratio)
  const ch = fmul(fsub(f, P(1)), P(100))
  // independent check: 1000 g claimed per kg, only w g given; cost of w g at CP per kg = 1000*w/1000... use CP = 1000 per kg
  const revenue = (1000 * (100 + m) * (100 - d)) / 10000
  const cost = (w * 1000) / 1000
  need(Math.abs(((revenue - cost) / cost) * 100 - fval(ch)) < 1e-9, 'false weight check')
  const stem = `A dishonest shopkeeper marks his goods ${m}% above the cost price and then allows a discount of ${d}%. In addition, he uses a weight of ${w} g in place of 1 kg. What is his overall gain or loss percentage?`
  const why = L(
    `Take CP = ₹100 per kg. Marked price = ₹${100 + m}; selling price per claimed kg = ${100 + m} × ${pc(F(100 - d, 100))} = ₹${pc(F((100 + m) * (100 - d), 100))}.`,
    `For that price he actually delivers only ${w} g, whose cost = ₹${pc(F(w * 100, 1000))}.`,
    `Gain/loss % = (${pc(F((100 + m) * (100 - d), 100))} − ${pc(F(w, 10))})/${pc(F(w, 10))} × 100 = ${pc(ch)}%.`,
  )
  const noW = (100 + m) * (100 - d) / 100 - 100
  const onlyW = ((1000 - w) / w) * 100
  return tag(plQ(rng, stem, ch, [noW, onlyW, m - d + onlyW, m - d], why), 'pl-false-weight', { m, d, w })
}

/** "Buy x get y free" on a marked-up article with an additional discount. */
function plFreeOffer(rng: Rng): QuestionDraft {
  const m = rng.pick([20, 25, 30, 40, 50, 60, 75, 100])
  const d = rng.pick([0, 5, 10, 20, 25])
  const x = rng.int(2, 5)
  const y = rng.pick([1, 1, 2])
  const f = fdiv(P(x * (100 + m) * (100 - d)), P((x + y) * 10000))
  const ch = fmul(fsub(f, P(1)), P(100))
  const revenue = x * (100 + m) * (100 - d) // per (x + y) articles, in units of 1/10000 of CP
  need(Math.abs(((revenue / 10000 - (x + y)) / (x + y)) * 100 - fval(ch)) < 1e-9, 'free offer check')
  const disc = d === 0 ? '' : ` and also allows a ${d}% discount on the price of the articles that are paid for`
  const stem = `A shopkeeper marks every article ${m}% above its cost price and announces "buy ${x} get ${y} free"${disc}. What is his overall profit or loss percentage on the transaction?`
  const why = L(
    `Take CP of each article = ₹100 and consider ${x + y} articles (${x} paid + ${y} free).`,
    `Cost = ${(x + y) * 100}. Marked price of ${x} paid articles = ${x} × ${100 + m} = ${x * (100 + m)}${d ? `; after ${d}% discount = ${pc(F(x * (100 + m) * (100 - d), 100))}` : ''}.`,
    `Result % = (${pc(F(x * (100 + m) * (100 - d), 100))} − ${(x + y) * 100})/${(x + y) * 100} × 100 = ${pc(ch)}%.`,
  )
  return tag(plQ(rng, stem, ch, [m - (y * 100) / (x + y), m - d, (m * x) / (x + y), ((100 + m) * (100 - d)) / 100 - 100], why), 'pl-free-offer', { m, d, x, y })
}

/** SP difference between a gain and a loss gives the cost; then a mark-up and discount for a target profit. */
function plSpDifference(rng: Rng): QuestionDraft {
  const p = rng.pick([5, 10, 12, 15, 20, 25])
  const q = rng.pick([5, 10, 12, 15, 20, 25])
  const r = rng.pick([20, 25, 30, 40, 50])
  const d = rng.pick([10, 20, 25])
  const c = rstep(rng, 400, 8000, 100)
  const X = fdiv(P(c * (p + q)), P(100))
  need(fint(X), 'difference not integral')
  const spr = fdiv(P(c * (100 + r)), P(100))
  const mkp = fdiv(fmul(spr, P(100)), P(100 - d))
  need(fint(spr) && fint(mkp), 'marked price not integral')
  const cb = fdiv(P(X.n * 100), P(p + q))
  ensure(feq(cb, P(c)), 'sp difference mismatch')
  const stem = `A radio is sold at a profit of ${p}%. Had it been sold for ₹${X.n} less, there would have been a loss of ${q}%. The shopkeeper now wants an overall profit of ${r}% after allowing a discount of ${d}% on the marked price. At what price should the radio be marked?`
  const why = L(
    `Let CP = ₹x. SP at ${p}% profit − SP at ${q}% loss = (${p} + ${q})% of x = ${X.n} ⇒ x = ${X.n} × 100/${p + q} = ${c}.`,
    `Required SP = ${100 + r}% of ${c} = ₹${spr.n}.`,
    `SP = ${100 - d}% of marked price ⇒ marked price = ${spr.n} × 100/${100 - d} = ₹${mkp.n}`,
  )
  return tag(nq(rng, 'profit-loss', stem, mkp, [spr.n, (c * (100 + r + d)) / 100, fval(fdiv(P(X.n * 100), P(Math.abs(p - q) || 7))), c + X.n], why, { pre: '₹' }), 'pl-sp-difference', { p, q, r, d, X: X.n })
}

/** Repairs and transport on top of the purchase price; marked up, discounted; profit % on the total outlay. */
function plOverheads(rng: Rng): QuestionDraft {
  const t = rng.pick([5, 8, 10, 12, 15])
  const m = rng.pick([20, 25, 30, 40, 50])
  const d = rng.pick([5, 10, 15, 20])
  const TC = rng.pick([20000, 25000, 32000, 40000, 50000, 64000, 80000, 100000, 125000, 160000])
  const c = rstep(rng, Math.ceil((TC * 0.7) / (1 + t / 100) / 1000) * 1000, Math.floor((TC * 0.95) / (1 + t / 100) / 1000) * 1000, 1000)
  const base = (c * (100 + t)) / 100
  need(Number.isInteger(base), 'repair not integral')
  const T = TC - base
  need(T > 0 && T % 10 === 0, 'transport unsuitable')
  const sp = fdiv(P(c * (100 + m) * (100 - d)), P(10000))
  need(fint(sp), 'SP not integral')
  const pr = sp.n - TC
  need(pr > 0, 'must be a profit')
  const prof = F(pr * 100, TC)
  need(terminating(prof, 2), 'profit % unclean')
  ensure(TC === c + (c * t) / 100 + T, 'outlay mismatch')
  const nm = pickMen(rng, 1)[0]
  const thing = rng.pick(['a second-hand car', 'a used machine', 'an old motorcycle', 'a generator set'])
  const stem = `${nm} bought ${thing} for ₹${c}, spent ${t}% of the purchase price on repairs and ₹${T} on transport. He then marked it ${m}% above the purchase price and sold it after allowing a discount of ${d}%. What is his profit percentage on his total outlay?`
  const why = L(
    `Total outlay = ${c} + ${pc(F(c * t, 100))} + ${T} = ₹${TC}.`,
    `Marked price = ${100 + m}% of ${c} = ₹${pc(F(c * (100 + m), 100))}; SP = ${100 - d}% of that = ₹${sp.n}.`,
    `Profit = ${sp.n} − ${TC} = ₹${pr}.`,
    `Profit % = ${pr}/${TC} × 100 = ${pc(prof)}%`,
  )
  return tag(nq(rng, 'profit-loss', stem, prof, [fval(F(pr * 100, c)), m - d, fval(F((sp.n - c) * 100, c)), fval(prof) + 4], why, { post: '%' }), 'pl-overheads', { c, t, T, m, d })
}

export const PL_A: Tpl[] = [
  { name: 'pl-two-articles', gen: (r) => plTwoArticles(r) },
  { name: 'pl-discount-compare', gen: (r) => plDiscountCompare(r) },
  { name: 'pl-lots', gen: (r) => plLots(r) },
  { name: 'pl-mixture-wastage', gen: (r) => plMixtureWastage(r) },
  { name: 'pl-chain', gen: (r) => plChain(r) },
  { name: 'pl-false-weight', gen: (r) => plFalseWeight(r) },
  { name: 'pl-free-offer', gen: (r) => plFreeOffer(r) },
  { name: 'pl-sp-difference', gen: (r) => plSpDifference(r) },
  { name: 'pl-overheads', gen: (r) => plOverheads(r) },
]

// ============================================================================ RATIO & PARTNERSHIP
const gcdAll = (xs: number[]): number => xs.reduce((a, b) => gcd(a, b), 0) || 1

/** A (working partner, commission) + B + C who joins late: share of a given partner. */
function rpWorkingPartner(rng: Rng): QuestionDraft {
  const a = rstep(rng, 20000, 100000, 5000)
  const b = rstep(rng, 20000, 100000, 5000)
  const c = rstep(rng, 20000, 100000, 5000)
  need(a !== b && b !== c && a !== c, 'distinct capitals')
  const m = rng.int(2, 8)
  const w = rng.pick([10, 15, 20, 25])
  const wa = 12 * a
  const wb = 12 * b
  const wc = (12 - m) * c
  const g = gcdAll([wa, wb, wc])
  const [ra, rb, rc] = [wa / g, wb / g, wc / g]
  const W = ra + rb + rc
  const Pr = rstep(rng, 40000, 400000, 100 * W)
  const comm = (Pr * w) / 100
  const rem = Pr - comm
  const sA = (rem * ra) / W
  const sB = (rem * rb) / W
  const sC = (rem * rc) / W
  need([comm, rem, sA, sB, sC].every(Number.isInteger), 'shares not integral')
  // independent check: month-by-month capital accumulation
  let mA = 0
  let mB = 0
  let mC = 0
  for (let mo = 1; mo <= 12; mo++) {
    mA += a
    mB += b
    if (mo > m) mC += c
  }
  ensure(mA * rb === mB * ra && mC * ra === mA * rc && comm + sA + sB + sC === Pr, 'partnership weights mismatch')
  const [n1, n2, n3] = pickMen(rng, 3)
  const head = `${n1}, ${n2} and ${n3} run a business. ${n1} invests ₹${a} and ${n2} invests ₹${b} at the start, while ${n3} joins after ${m} months with ₹${c}. ${n1} manages the business and gets ${w}% of the annual profit as commission; the remaining profit is shared in the ratio of capital × time. The annual profit is ₹${Pr}.`
  const steps = [
    `Capital × months: ${n1} = ${a} × 12 = ${wa}; ${n2} = ${b} × 12 = ${wb}; ${n3} = ${c} × ${12 - m} = ${wc}.`,
    `Ratio = ${ratioStr(wa, wb, wc)}.`,
    `${n1}'s commission = ${w}% of ${Pr} = ${comm}; profit left to share = ${rem}.`,
  ]
  const form = rng.int(0, 2)
  if (form === 0) return tag(nq(rng, 'ratio-partnership', `${head} What is ${n3}'s share of the profit?`, sC, [sA, sB, (Pr * rc) / W, sC + comm], L(...steps, `${n3}'s share = ${rem} × ${rc}/${W} = ₹${sC}`), { pre: '₹' }), 'rp-working-c', { a, b, c, m, w, Pr })
  if (form === 1) return tag(nq(rng, 'ratio-partnership', `${head} What is the total amount ${n1} receives?`, comm + sA, [sA, (Pr * ra) / W + comm, comm, sB + comm], L(...steps, `${n1}'s profit share = ${rem} × ${ra}/${W} = ${sA}.`, `Total = ${comm} + ${sA} = ₹${comm + sA}`), { pre: '₹' }), 'rp-working-a', { a, b, c, m, w, Pr })
  const diff = comm + sA - sB
  need(diff > 0, 'difference must be positive')
  return tag(nq(rng, 'ratio-partnership', `${head} By how much does ${n1}'s total receipt exceed ${n2}'s share?`, diff, [sA - sB, comm, sA - sB + 2 * comm, comm + sA - sC], L(...steps, `${n1}'s total = ${comm} + ${rem} × ${ra}/${W} = ${comm + sA}; ${n2}'s share = ${rem} × ${rb}/${W} = ${sB}.`, `Difference = ${comm + sA} − ${sB} = ₹${diff}`), { pre: '₹' }), 'rp-working-diff', { a, b, c, m, w, Pr })
}

/** Capital changes during the year (withdrawal / addition); difference of shares or total profit. */
function rpCapitalChanges(rng: Rng): QuestionDraft {
  const a = rstep(rng, 30000, 90000, 5000)
  const b = rstep(rng, 30000, 90000, 5000)
  const t1 = rng.int(3, 8)
  const t2 = rng.int(2, 9)
  const x1 = rstep(rng, 5000, a - 10000, 5000)
  const y2 = rstep(rng, 5000, 40000, 5000)
  const wA = a * t1 + (a - x1) * (12 - t1)
  const wB = b * t2 + (b + y2) * (12 - t2)
  need(wA !== wB, 'equal weights')
  const g = gcd(wA, wB)
  const [ra, rb] = [wA / g, wB / g]
  need(ra + rb <= 120, 'ratio too large')
  const Pr = rstep(rng, 20000, 600000, (ra + rb) * 100)
  const sA = (Pr * ra) / (ra + rb)
  const sB = (Pr * rb) / (ra + rb)
  need(Number.isInteger(sA) && Number.isInteger(sB), 'shares not integral')
  // independent month-by-month check
  let mA = 0
  let mB = 0
  for (let mo = 1; mo <= 12; mo++) {
    mA += mo <= t1 ? a : a - x1
    mB += mo <= t2 ? b : b + y2
  }
  ensure(mA === wA && mB === wB, 'capital-month mismatch')
  const D = Math.abs(sA - sB)
  const [n1, n2] = pickMen(rng, 2)
  const head = `${n1} and ${n2} start a business with ₹${a} and ₹${b} respectively. After ${t1} months ${n1} withdraws ₹${x1}, and after ${t2} months ${n2} adds ₹${y2} more to his capital.`
  const why = L(
    `${n1}: ${a} × ${t1} + ${a - x1} × ${12 - t1} = ${wA}.  ${n2}: ${b} × ${t2} + ${b + y2} × ${12 - t2} = ${wB}.`,
    `Profit-sharing ratio = ${ra} : ${rb} (difference of ${Math.abs(ra - rb)} parts out of ${ra + rb}).`,
  )
  if (rng.chance(0.5)) return tag(nq(rng, 'ratio-partnership', `${head} If the profit at the end of the year is ₹${Pr}, what is the difference between their shares?`, D, [Math.abs(ra - rb) * 100, (Pr * Math.abs(a - b)) / (a + b), Math.abs(sA - sB) + Pr / 10, sA], L(why, `Difference = ${Pr} × ${Math.abs(ra - rb)}/${ra + rb} = ₹${D}`), { pre: '₹' }), 'rp-capital-diff', { a, b, t1, t2, x1, y2, Pr })
  return tag(nq(rng, 'ratio-partnership', `${head} If the difference between their shares of profit at the end of the year is ₹${D}, what is the total profit?`, Pr, [D * (ra + rb), (D * (a + b)) / Math.abs(a - b), sA, D * Math.abs(ra - rb)], L(why, `Total profit = ${D} × ${ra + rb}/${Math.abs(ra - rb)} = ₹${Pr}`), { pre: '₹' }), 'rp-capital-total', { a, b, t1, t2, x1, y2, D })
}

/** Three people exchange money in two steps; the new three-term ratio fixes the total. */
function rpTransfers(rng: Rng): QuestionDraft {
  const a = rng.int(2, 9)
  const b = rng.int(2, 9)
  const c = rng.int(2, 9)
  const p = rng.int(1, 9)
  const q = rng.int(1, 9)
  const r = rng.int(1, 9)
  need(!(p * b === q * a && q * c === r * b), 'ratio unchanged')
  need(gcdAll([p, q, r]) === 1 && gcdAll([a, b, c]) === 1, 'ratios not in lowest terms')
  const l = lcm(a + b + c, p + q + r)
  const S = l * rng.int(1, 6) * rng.pick([10, 20, 50])
  need(S <= 60000, 'total too large')
  const k = S / (a + b + c)
  const m = S / (p + q + r)
  const x = a * k - p * m
  const y = b * k + x - q * m
  need(x > 0 && y > 0, 'transfers must be positive')
  const A1 = a * k - x
  const B1 = b * k + x - y
  const C1 = c * k + y
  ensure(A1 === p * m && B1 === q * m && C1 === r * m, 'transfer balances mismatch')
  const den = a * (p + q + r) - p * (a + b + c)
  need(den !== 0, 'degenerate')
  const kb = fdiv(P(x * (p + q + r)), P(den))
  ensure(feq(kb, P(k)), 'transfer solve mismatch (A)')
  const kc = fdiv(P(y * (p + q + r)), P(r * (a + b + c) - c * (p + q + r)))
  ensure(feq(kc, P(k)), 'transfer solve mismatch (C)')
  const [n1, n2, n3] = pickNames(rng, 3)
  const stem = `${n1}, ${n2} and ${n3} have sums of money in the ratio ${a} : ${b} : ${c}. ${n1} gives ₹${x} to ${n2}, and ${n2} then gives ₹${y} to ${n3}. The ratio of their amounts now is ${p} : ${q} : ${r}. What is the total money they have?`
  const why = L(
    `Let the original amounts be ${a}k, ${b}k, ${c}k; the total ${a + b + c}k does not change.`,
    `${n1} now has ${a}k − ${x} = ${p}/${p + q + r} of ${a + b + c}k.`,
    `(${a}(${p + q + r}) − ${p}(${a + b + c}))k = ${x} × ${p + q + r} ⇒ ${den}k = ${x * (p + q + r)} ⇒ k = ${k}.`,
    `Check with ${n3}: ${c}k + ${y} = ${C1} = ${r}/${p + q + r} of ${S}.`,
    `Total = ${a + b + c} × ${k} = ₹${S}`,
  )
  return tag(nq(rng, 'ratio-partnership', stem, S, [k, S + x + y, (a + b + c) * x, S - x], why, { pre: '₹' }), 'rp-transfers', { a, b, c, x, y, p, q, r })
}

/** Two years of profits with the capitals changing in year 2; one partner's total. */
function rpTwoYears(rng: Rng): QuestionDraft {
  const a = rstep(rng, 40000, 120000, 10000)
  const b = rstep(rng, 40000, 120000, 10000)
  need(a !== b, 'equal capitals')
  const x = rng.pick([10, 20, 25, 50])
  const y = rng.pick([10, 20, 25, 40, 50])
  const a2 = fdiv(P(a * (100 + x)), P(100))
  const b2 = fdiv(P(b * (100 - y)), P(100))
  need(fint(a2) && fint(b2), 'capitals not integral')
  const g1 = gcd(a, b)
  const g2 = gcd(a2.n, b2.n)
  const [r1a, r1b] = [a / g1, b / g1]
  const [r2a, r2b] = [a2.n / g2, b2.n / g2]
  need(r1a + r1b <= 40 && r2a + r2b <= 40, 'ratios too large')
  const Pr1 = rstep(rng, 20000, 150000, 100 * (r1a + r1b))
  const Pr2 = rstep(rng, 20000, 150000, 100 * (r2a + r2b))
  const y1 = (Pr1 * r1a) / (r1a + r1b)
  const y2 = (Pr2 * r2a) / (r2a + r2b)
  need(Number.isInteger(y1) && Number.isInteger(y2), 'shares not integral')
  const tot = y1 + y2
  const [n1, n2] = pickMen(rng, 2)
  const stem = `${n1} and ${n2} start a business with ₹${a} and ₹${b}. At the end of the first year the profit is ₹${Pr1}, shared in the ratio of their capitals. In the second year ${n1} increases his capital by ${x}% and ${n2} withdraws ${y}% of his capital, and the profit is ₹${Pr2}. What is ${n1}'s total share of profit over the two years?`
  const why = L(
    `Year 1 ratio = ${r1a} : ${r1b}; ${n1}'s share = ${Pr1} × ${r1a}/${r1a + r1b} = ${y1}.`,
    `Year 2 capitals: ${n1} = ${a} × ${100 + x}% = ${a2.n}; ${n2} = ${b} × ${100 - y}% = ${b2.n}; ratio = ${r2a} : ${r2b}.`,
    `${n1}'s share in year 2 = ${Pr2} × ${r2a}/${r2a + r2b} = ${y2}.`,
    `Total = ${y1} + ${y2} = ₹${tot}`,
  )
  return tag(nq(rng, 'ratio-partnership', stem, tot, [y1 + (Pr2 * r1a) / (r1a + r1b), Pr1 + Pr2 - tot, y2, (Pr1 + Pr2) / 2], why, { pre: '₹' }), 'rp-two-years', { a, b, x, y, Pr1, Pr2 })
}

/** Money divided in the inverse ratio of three numbers (a classic trap); a gift between two shares; a final amount. */
function rpInverse(rng: Rng): QuestionDraft {
  const trio = rng.sample([2, 3, 4, 5, 6, 8, 9, 10, 12], 3).sort((x, y) => x - y)
  const l = trio.reduce((u, v) => lcm(u, v), 1)
  const raw = trio.map((t) => l / t)
  const gg = gcdAll(raw)
  const parts = raw.map((v) => v / gg)
  const W = parts.reduce((s, v) => s + v, 0)
  const T = rstep(rng, 20000, 200000, 100 * W)
  const sh = parts.map((v) => (T * v) / W)
  need(sh.every(Number.isInteger), 'shares not integral')
  const h = rng.pick([10, 20, 25, 40, 50])
  const gi = rng.int(0, 2)
  const ri = rng.int(0, 2)
  need(gi !== ri, 'distinct giver/receiver')
  need((sh[gi] * h) % 100 === 0, 'gift not integral')
  const gift = (sh[gi] * h) / 100
  const fin = sh[ri] + gift
  const [n1, n2, n3] = pickMen(rng, 3)
  const nm = [n1, n2, n3]
  const stem = `₹${T} is divided among ${n1}, ${n2} and ${n3} in the ratio 1/${trio[0]} : 1/${trio[1]} : 1/${trio[2]}. Then ${nm[gi]} gives ${h}% of his share to ${nm[ri]}. How much does ${nm[ri]} have finally?`
  const direct = trio.map((t) => (T * t) / trio.reduce((s, v) => s + v, 0))
  const why = L(
    `Ratio 1/${trio[0]} : 1/${trio[1]} : 1/${trio[2]} = ${parts.join(' : ')} (multiplying by ${l / gg}); sum of parts = ${W}.`,
    `Shares: ${nm.map((n, i) => `${n} = ${T} × ${parts[i]}/${W} = ${sh[i]}`).join('; ')}.`,
    `${nm[gi]} gives ${h}% of ${sh[gi]} = ${gift}.`,
    `${nm[ri]} finally has ${sh[ri]} + ${gift} = ₹${fin}`,
  )
  return tag(nq(rng, 'ratio-partnership', stem, fin, [sh[ri], direct[ri] + (direct[gi] * h) / 100, sh[gi] - gift, sh[ri] - gift], why, { pre: '₹' }), 'rp-inverse', { trio, T, h, gi, ri })
}

/** Incomes and expenditures in ratios with equal savings; one income and expenditure then change. */
function rpIncomeExpenditure(rng: Rng): QuestionDraft {
  const a = rng.int(2, 9)
  const b = rng.int(2, 9)
  const c = rng.int(2, 9)
  const d = rng.int(2, 9)
  const det = b * c - a * d
  need(det !== 0 && gcd(a, b) === 1 && gcd(c, d) === 1 && a !== b && c !== d, 'degenerate ratios')
  const j = rng.int(1, 6)
  const unit = rng.pick([500, 1000, 2000])
  const S = Math.abs(det) * j
  const kk = fdiv(P(S * (c - d)), P(det))
  const mm = fdiv(P(S * (a - b)), P(det))
  need(fint(kk) && fint(mm) && kk.n > 0 && mm.n > 0, 'non-integral solution')
  const k = kk.n
  const m = mm.n
  need(a * k > c * m && b * k > d * m, 'savings positive')
  ensure(a * k - c * m === S && b * k - d * m === S, 'income-expenditure solve mismatch')
  const x = rng.pick([10, 20, 25, 30, 40])
  const y = rng.pick([5, 10, 15, 20, 25])
  const IQ = b * k * unit
  const EQ = d * m * unit
  need((IQ * x) % 100 === 0 && (EQ * y) % 100 === 0, 'new figures not integral')
  const nI = (IQ * (100 + x)) / 100
  const nE = (EQ * (100 + y)) / 100
  const nS = nI - nE
  need(nS > 0, 'new savings positive')
  const [n1, n2] = pickMen(rng, 2)
  const stem = `The incomes of ${n1} and ${n2} are in the ratio ${a} : ${b} and their expenditures are in the ratio ${c} : ${d}. Each saves ₹${S * unit}. Next year ${n2}'s income rises by ${x}% and his expenditure rises by ${y}%. What will be ${n2}'s savings next year?`
  const why = L(
    `Let incomes be ${a}p, ${b}p and expenditures ${c}q, ${d}q.`,
    `${a}p − ${c}q = ${S * unit} and ${b}p − ${d}q = ${S * unit}. Solving: p = ${S * unit}(${c} − ${d})/(${b}×${c} − ${a}×${d}) = ${k * unit}, q = ${S * unit}(${a} − ${b})/(${b}×${c} − ${a}×${d}) = ${m * unit}.`,
    `${n2}'s income = ${b} × ${k * unit} = ${IQ}; expenditure = ${d} × ${m * unit} = ${EQ}.`,
    `New income = ${IQ} × ${100 + x}% = ${nI}; new expenditure = ${EQ} × ${100 + y}% = ${nE}.`,
    `New savings = ${nI} − ${nE} = ₹${nS}`,
  )
  return tag(nq(rng, 'ratio-partnership', stem, nS, [S * unit, nI - EQ, IQ - nE, nS + (EQ * y) / 100], why, { pre: '₹' }), 'rp-income-expenditure', { a, b, c, d, S: S * unit, x, y })
}

/** Late partners: C's capital unknown, recovered from A's share and the total profit. */
function rpFindCapital(rng: Rng): QuestionDraft {
  const a = rstep(rng, 20000, 100000, 5000)
  const b = rstep(rng, 20000, 100000, 5000)
  const m1 = rng.int(2, 5)
  const m2 = rng.int(m1 + 1, 9)
  const c = rstep(rng, 20000, 120000, 5000)
  const wa = 12 * a
  const wb = (12 - m1) * b
  const wc = (12 - m2) * c
  const g = gcdAll([wa, wb, wc])
  const W = (wa + wb + wc) / g
  const Pr = rstep(rng, 30000, 300000, 100 * W)
  const sA = (Pr * (wa / g)) / W
  need(Number.isInteger(sA), 'share not integral')
  const Wb = fdiv(P(wa * Pr), P(sA)) // total weight
  const cb = fdiv(fsub(fsub(Wb, P(wa)), P(wb)), P(12 - m2))
  ensure(fint(cb) && cb.n === c, 'capital recovery mismatch')
  const [n1, n2, n3] = pickMen(rng, 3)
  const stem = `${n1} invests ₹${a} in a business at the beginning of the year. ${n2} joins after ${m1} months with ₹${b}, and ${n3} joins after ${m2} months. At the end of the year the total profit is ₹${Pr}, of which ${n1} gets ₹${sA}. How much did ${n3} invest?`
  const why = L(
    `${n1}'s weight = ${a} × 12 = ${wa}; ${n2}'s weight = ${b} × ${12 - m1} = ${wb}; ${n3}'s weight = c × ${12 - m2}.`,
    `${n1}'s share/Total profit = ${sA}/${Pr} ⇒ total weight = ${wa} × ${Pr}/${sA} = ${pc(Wb)}.`,
    `${n3}'s weight = ${pc(Wb)} − ${wa} − ${wb} = ${pc(fsub(fsub(Wb, P(wa)), P(wb)))}.`,
    `c = ${pc(fsub(fsub(Wb, P(wa)), P(wb)))}/${12 - m2} = ₹${c}`,
  )
  return tag(nq(rng, 'ratio-partnership', stem, c, [fval(fsub(fsub(Wb, P(wa)), P(wb))), fval(fdiv(fsub(fsub(Wb, P(wa)), P(wb)), P(12 - m1))), Pr - sA, c + 5000], why, { pre: '₹' }), 'rp-find-capital', { a, b, m1, m2, Pr, sA })
}

export const RP_A: Tpl[] = [
  { name: 'rp-working-partner', gen: (r) => rpWorkingPartner(r) },
  { name: 'rp-capital-changes', gen: (r) => rpCapitalChanges(r) },
  { name: 'rp-transfers', gen: (r) => rpTransfers(r) },
  { name: 'rp-two-years', gen: (r) => rpTwoYears(r) },
  { name: 'rp-inverse', gen: (r) => rpInverse(r) },
  { name: 'rp-income-expenditure', gen: (r) => rpIncomeExpenditure(r) },
  { name: 'rp-find-capital', gen: (r) => rpFindCapital(r) },
]

// ============================================================================ AGES & AVERAGES
const reduce2 = (a: number, b: number): [number, number] => {
  const g = gcd(a, b)
  return [a / g, b / g]
}

/** Two ratio statements, one in the past and one in the future: solve a 2x2 system for the present ages. */
function agRatioPastFuture(rng: Rng): QuestionDraft {
  const x = rng.int(3, 10)
  const y = rng.int(3, 10)
  const q1 = rng.int(1, 8)
  const p1 = rng.int(q1 + 1, 9)
  const q2 = rng.int(1, 8)
  const p2 = rng.int(q2 + 1, 9)
  need(gcd(p1, q1) === 1 && gcd(p2, q2) === 1 && !(p1 === p2 && q1 === q2), 'ratios not in lowest terms')
  const det = -q1 * p2 + p1 * q2
  need(det !== 0, 'degenerate system')
  const c1 = (q1 - p1) * x
  const c2 = (p2 - q2) * y
  const Ab = fdiv(P(-c1 * p2 + c2 * p1), P(det))
  const Bb = fdiv(P(q1 * c2 - q2 * c1), P(det))
  need(fint(Ab) && fint(Bb), 'ages not integral')
  const A = Ab.n
  const B = Bb.n
  need(A <= 70 && B >= x + 4 && B >= 10 && A > B, 'ages unrealistic')
  ensure(q1 * (A - x) === p1 * (B - x) && q2 * (A + y) === p2 * (B + y), 'age system substitution mismatch')
  const z = rng.int(3, 12)
  const [n1, n2] = pickMen(rng, 2)
  const stem = `${x} years ago the ratio of the ages of ${n1} and ${n2} was ${p1} : ${q1}, and ${y} years from now it will be ${p2} : ${q2}. What will be the sum of their ages ${z} years from now?`
  const why = L(
    `Let present ages be a and b.`,
    `${q1}(a − ${x}) = ${p1}(b − ${x}) ⇒ ${q1}a − ${p1}b = ${disp(String(c1))}.`,
    `${q2}(a + ${y}) = ${p2}(b + ${y}) ⇒ ${q2}a − ${p2}b = ${disp(String(c2))}.`,
    `Solving the two equations: a = ${A}, b = ${B}.`,
    `Sum after ${z} years = ${A} + ${B} + 2 × ${z} = ${A + B + 2 * z}`,
  )
  return tag(nq(rng, 'ages-averages', stem, A + B + 2 * z, [A + B, A + B + z, A + B + 2 * z + x, A - x + B - x + 2 * z], why, { post: ' years' }), 'ag-ratio-past-future', { x, y, p1, q1, p2, q2, z })
}

/** Family averages across years: a child is born and an elder dies; present average of the family. */
function agFamily(rng: Rng): QuestionDraft {
  const n = rng.pick([4, 4, 5, 5, 6, 8, 10])
  const x = rng.int(6, 12)
  const A = rng.int(20, 40)
  const y = rng.int(1, 5)
  const z = rng.int(1, x - 1)
  const d = rng.int(x - z + 20, 85)
  const sum = n * (A + x) - (d + z) + y
  const avg = F(sum, n)
  need(terminating(avg, 2), 'average unclean')
  // independent check: build an explicit family of ages x years ago
  const deceased0 = d - (x - z)
  need(deceased0 >= 18, 'deceased too young')
  const restSum = n * A - deceased0
  need(restSum > (n - 1) * 10, 'family too young')
  const ages: number[] = []
  for (let i = 0; i < n - 1; i++) ages.push(Math.floor(restSum / (n - 1)) + (i < restSum % (n - 1) ? 1 : 0))
  const nowTotal = ages.reduce((s, v) => s + v + x, 0) + y
  ensure(nowTotal === sum, 'family sum mismatch')
  const stem = `The average age of a family of ${n} members ${x} years ago was ${A} years. Since then a child has been born, ${y} year${y === 1 ? '' : 's'} ago, and one member, who was ${d} years old at the time, died ${z} year${z === 1 ? '' : 's'} ago. What is the present average age of the family?`
  const why = L(
    `Total age ${x} years ago = ${n} × ${A} = ${n * A}.`,
    `Present total of all ${n} original members, had everyone lived = ${n * A} + ${n} × ${x} = ${n * (A + x)}.`,
    `The member who died would now be ${d} + ${z} = ${d + z} years old, so remove ${d + z}: ${n * (A + x)} − ${d + z} = ${n * (A + x) - d - z}.`,
    `Add the child's present age ${y}: ${n * (A + x) - d - z + y}.`,
    `Members now = ${n} − 1 + 1 = ${n}; average = ${n * (A + x) - d - z + y}/${n} = ${pc(avg)} years`,
  )
  return tag(nq(rng, 'ages-averages', stem, avg, [F(n * (A + x) - d + y, n), F(n * (A + x) - d - z, n), F(n * (A + x) - d - z, n - 1), F(n * A - d + y, n)], why, { post: ' years' }), 'ag-family', { n, x, A, y, z, d })
}

/** Two players (captain and a deputy who is k years older/younger) removed: captain's age from the drop in average. */
function agCaptain(rng: Rng): QuestionDraft {
  const team = rng.pick([[11, 'cricket team', 'captain', 'wicketkeeper'], [12, 'delegation', 'leader', 'secretary'], [15, 'committee', 'chairman', 'treasurer'], [20, 'office staff', 'manager', 'assistant manager']] as const)
  const n = team[0]
  const A = rng.int(24, 36)
  const R = A - rng.int(1, 3)
  const total = n * A - (n - 2) * R
  const c = Math.round(total / 2) + rng.int(-2, 2)
  const diff = total - 2 * c
  need(diff !== 0 && Math.abs(diff) <= 6 && c >= 26 && c <= 56, 'captain age unsuitable')
  const older = diff > 0
  const k = Math.abs(diff)
  const other = older ? c + k : c - k
  ensure(c + other + R * (n - 2) === n * A, 'captain total mismatch')
  const cb = (total + (older ? -k : k)) / 2
  ensure(cb === c, 'captain solve mismatch')
  const rel = older ? `${k} years older than` : `${k} years younger than`
  const stem = `The average age of a ${team[1]} of ${n} members is ${A} years. When the ${team[2]} and the ${team[3]}, who is ${rel} the ${team[2]}, are excluded, the average age of the remaining ${n - 2} members is ${R} years. What is the age of the ${team[2]}?`
  const why = L(
    `Total age of all ${n} = ${n} × ${A} = ${n * A}; total of the remaining ${n - 2} = ${n - 2} × ${R} = ${(n - 2) * R}.`,
    `Ages of ${team[2]} and ${team[3]} together = ${n * A} − ${(n - 2) * R} = ${total}.`,
    `Let the ${team[2]} be c: c + (c ${older ? '+' : '−'} ${k}) = ${total} ⇒ 2c = ${total + (older ? -k : k)}.`,
    `c = ${c} years`,
  )
  return tag(nq(rng, 'ages-averages', stem, c, [total / 2, c + k, c - k, total - (older ? 0 : 2 * k)], why, { post: ' years' }), 'ag-captain', { n, A, R, k, older: older ? 1 : 0 })
}

/** Averages mis-computed because of misread entries; the number of entries is hidden in the change of average. */
function agMisread(rng: Rng): QuestionDraft {
  const n = rng.int(10, 40)
  const e = rng.pick([0.5, 1, 1.5, 2, 2.5, 3])
  const delta = n * e
  need(Number.isInteger(delta) && delta >= 4, 'delta not integral')
  const A = rng.int(30, 75)
  const B = A + e
  const d1 = rng.int(1, delta - 1)
  const d2 = delta - d1
  const t1 = rng.int(40, 95)
  const t2 = rng.int(40, 95)
  const m1 = t1 - d1
  const m2 = t2 - d2
  need(m1 > 0 && m2 > 0 && t1 !== t2, 'misreads unsuitable')
  const nb = fdiv(P(t1 - m1 + (t2 - m2)), F(Math.round(e * 10), 10))
  ensure(fint(nb) && nb.n === n, 'count mismatch')
  const correct = n * B
  need(Number.isInteger(correct), 'correct sum not integral')
  const what = rng.pick(['marks', 'weights (in kg)', 'daily sales (in ₹ hundreds)'])
  const stem = `The average of a set of ${what} was calculated as ${A}. It was later found that two entries, ${t1} and ${t2}, had been wrongly read as ${m1} and ${m2}. If the correct average is ${pc(B)}, what is the correct sum of all the entries?`
  const why = L(
    `Error in the total = (${t1} − ${m1}) + (${t2} − ${m2}) = ${delta}.`,
    `Rise in average = ${pc(B)} − ${A} = ${pc(e)}, so number of entries = ${delta}/${pc(e)} = ${n}.`,
    `Correct sum = ${n} × ${pc(B)} = ${correct}`,
  )
  return tag(nq(rng, 'ages-averages', stem, correct, [n * A, correct + delta, n * A - delta, (n - 1) * B], why), 'ag-misread', { A, B: Math.round(B * 10), t1, t2, m1, m2 })
}

/** Father and two sons: sum of ages, multiple and gap fix the ages; years until a multiple relation. */
function agFatherSons(rng: Rng): QuestionDraft {
  const k = rng.pick([2, 3])
  const E = rng.int(12, 24)
  const p = rng.int(2, 7)
  const Y = E - p
  const F0 = k * E
  need(Y >= 5, 'younger too young')
  const S = F0 + E + Y
  const j = rng.pick([2, 3, 4])
  const tnum = F0 - j * Y
  need(tnum > 0 && tnum % (j - 1) === 0, 'years not integral')
  const t = tnum / (j - 1)
  need(t <= 40, 'too far away')
  ensure(F0 + t === j * (Y + t), 'father multiple mismatch')
  const Eb = (S + p) / (k + 2)
  ensure(Eb === E, 'elder solve mismatch')
  const stem = `The sum of the present ages of a father and his two sons is ${S} years. The father is ${k} times as old as the elder son, and the elder son is ${p} years older than the younger son. After how many years will the father be exactly ${j} times as old as the younger son?`
  const why = L(
    `Let the elder son be e; younger = e − ${p}; father = ${k}e.`,
    `${k}e + e + (e − ${p}) = ${S} ⇒ ${k + 2}e = ${S + p} ⇒ e = ${E}.`,
    `Ages: father ${F0}, elder ${E}, younger ${Y}.`,
    `${F0} + t = ${j}(${Y} + t) ⇒ ${F0 - j * Y} = ${j - 1}t ⇒ t = ${t}`,
  )
  return tag(nq(rng, 'ages-averages', stem, t, [t + p, F0 - j * Y, Math.abs(F0 - j * E) / (j - 1) || 7, t * 2], why, { post: ' years' }), 'ag-father-sons', { S, k, p, j })
}

/** Two successive replacements in a committee; the second newcomer's age from two averages. */
function agReplacement(rng: Rng): QuestionDraft {
  const n = rng.pick([4, 5, 10, 20, 25])
  const A = rng.int(35, 52)
  const t = rng.int(2, 6)
  const t2 = rng.int(2, 6)
  const p = rng.int(t + 50, 68)
  const q = rng.int(26, 45)
  need(q < p, 'newcomer must be younger')
  const B = F(n * (A + t) - p + q, n)
  need(terminating(B, 2), 'B unclean')
  const q2 = rng.int(26, 48)
  const B2 = fdiv(fadd(fmul(P(n), B), P(n * t2 - (q + t2) + q2)), P(n))
  need(terminating(B2, 2), 'B2 unclean')
  // independent chain: explicit total tracking
  let tot = n * A
  tot += n * t
  tot = tot - p + q
  ensure(Math.abs(tot - n * fval(B)) < 1e-9, 'stage 1 mismatch')
  tot += n * t2
  tot = tot - (q + t2) + q2
  ensure(Math.abs(tot - n * fval(B2)) < 1e-9, 'stage 2 mismatch')
  const qb = fadd(fsub(fmul(P(n), B), P(n * (A + t))), P(p))
  ensure(feq(qb, P(q)), 'newcomer solve mismatch')
  const stem = `The average age of the ${n} members of a committee is ${A} years. After ${t} years a member aged ${p} years retires and a new member joins, making the average age ${pc(B)} years. After a further ${t2} years the new member retires and another joins, and the average age becomes ${pc(B2)} years. What is the age of the last member at the time of joining?`
  const why = L(
    `Total after ${t} years = ${n} × (${A} + ${t}) = ${n * (A + t)}.`,
    `After replacement total = ${n} × ${pc(B)} = ${pc(fmul(P(n), B))}, so the first newcomer's age = ${pc(fmul(P(n), B))} − ${n * (A + t)} + ${p} = ${q}.`,
    `After a further ${t2} years total = ${pc(fmul(P(n), B))} + ${n} × ${t2} = ${pc(fadd(fmul(P(n), B), P(n * t2)))}; the first newcomer is now ${q} + ${t2} = ${q + t2}.`,
    `Final total = ${n} × ${pc(B2)} = ${pc(fmul(P(n), B2))} = ${pc(fadd(fmul(P(n), B), P(n * t2)))} − ${q + t2} + (age of last member)`,
    `Age of last member = ${q2} years`,
  )
  return tag(nq(rng, 'ages-averages', stem, q2, [q2 + t2, q2 - t2 > 0 ? q2 - t2 : q2 + 5, q2 + t, q], why, { post: ' years' }), 'ag-replacement', { n, A, t, t2, p, Bn: B.n, Bd: B.d, B2n: B2.n, B2d: B2.d })
}

/** Men and women with different average ages: the split from alligation, then men leave: new average of the men. */
function agMenWomen(rng: Rng): QuestionDraft {
  const n = rng.pick([20, 25, 40, 50])
  const nm = rng.int(8, n - 8)
  const nw = n - nm
  const M = rng.int(30, 48)
  const W = rng.int(24, M - 3)
  const A = F(nm * M + nw * W, n)
  need(terminating(A, 2), 'overall average unclean')
  const k = rng.int(2, 8)
  const e = rng.int(M + 2, M + 12)
  need(nm - k >= 5, 'too few men left')
  const newM = F(nm * M - k * e, nm - k)
  need(terminating(newM, 2), 'new men average unclean')
  const nmb = fdiv(fmul(P(n), fsub(A, P(W))), P(M - W))
  ensure(fint(nmb) && nmb.n === nm, 'alligation mismatch')
  const stem = `A group of ${n} persons consists of men and women. The average age of the men is ${M} years, that of the women is ${W} years and that of the whole group is ${pc(A)} years. If ${k} men, each aged ${e} years, leave the group, what is the average age of the remaining men?`
  const why = L(
    `Men : women = (${pc(A)} − ${W}) : (${M} − ${pc(A)}) = ${pc(fsub(A, P(W)))} : ${pc(fsub(P(M), A))} = ${ratioStr(nm, nw)}.`,
    `Number of men = ${n} × ${nm / gcd(nm, nw)}/${n / gcd(nm, nw)} = ${nm}.`,
    `Total age of men = ${nm} × ${M} = ${nm * M}; after ${k} men aged ${e} leave: ${nm * M} − ${k * e} = ${nm * M - k * e}.`,
    `Average = ${nm * M - k * e}/${nm - k} = ${pc(newM)} years`,
  )
  const wrongWomen = fdiv(P(nw * M - k * e), P(nw - k > 0 ? nw - k : 1))
  return tag(nq(rng, 'ages-averages', stem, newM, [F(nm * M - k * e, nm), fval(wrongWomen), fval(A) - k, (M * (nm - k) - e + M) / (nm - k)], why, { post: ' years' }), 'ag-men-women', { n, M, W, An: A.n, Ad: A.d, k, e })
}

/** Section marks: some low scorers move to another section; the donor's average rise gives their average; receiver's new average. */
function agSections(rng: Rng): QuestionDraft {
  const k = rng.int(3, 9)
  const remA = rng.pick([10, 20, 25])
  const n1 = remA + k
  const remB = rng.pick([10, 20, 25])
  const n2 = remB - k
  need(n2 >= 6, 'section B too small')
  const a1 = rng.int(48, 70)
  const x = rng.int(20, a1 - 8)
  const a1n = F(n1 * a1 - k * x, remA)
  need(terminating(a1n, 2), 'A new average unclean')
  const a2 = rng.int(45, 72)
  const newB = F(n2 * a2 + k * x, remB)
  need(terminating(newB, 2), 'B new average unclean')
  const xb = fdiv(fsub(P(n1 * a1), fmul(P(remA), a1n)), P(k))
  ensure(feq(xb, P(x)), 'transfer average mismatch')
  const stem = `Section A has ${n1} students with an average of ${a1} marks and Section B has ${n2} students with an average of ${a2} marks. ${k} students with the lowest marks are shifted from Section A to Section B, and the average of Section A becomes ${pc(a1n)}. What is the new average of Section B?`
  const why = L(
    `Total marks of A = ${n1} × ${a1} = ${n1 * a1}; after shifting, A has ${remA} students with total ${remA} × ${pc(a1n)} = ${pc(fmul(P(remA), a1n))}.`,
    `Marks of the ${k} shifted students = ${n1 * a1} − ${pc(fmul(P(remA), a1n))} = ${k * x}.`,
    `Total of B now = ${n2} × ${a2} + ${k * x} = ${n2 * a2 + k * x}, with ${remB} students.`,
    `New average of B = ${n2 * a2 + k * x}/${remB} = ${pc(newB)}`,
  )
  return tag(nq(rng, 'ages-averages', stem, newB, [(n2 * a2 + k * a1) / remB, (n2 * a2 + k * fval(a1n)) / remB, (a2 + fval(a1n)) / 2, (n2 * a2 + k * x) / n2], why), 'ag-sections', { n1, a1, k, remA, a1c: Math.round(fval(a1n) * 100), n2, a2 })
}

export const AG_A: Tpl[] = [
  { name: 'ag-ratio-past-future', gen: (r) => agRatioPastFuture(r) },
  { name: 'ag-family', gen: (r) => agFamily(r) },
  { name: 'ag-captain', gen: (r) => agCaptain(r) },
  { name: 'ag-misread', gen: (r) => agMisread(r) },
  { name: 'ag-father-sons', gen: (r) => agFatherSons(r) },
  { name: 'ag-replacement', gen: (r) => agReplacement(r) },
  { name: 'ag-men-women', gen: (r) => agMenWomen(r) },
  { name: 'ag-sections', gen: (r) => agSections(r) },
]

// ============================================================================ INTEREST (SI + CI chains)
const ciFactor = (r: number, n: number): Frac => F((100 + r) ** n, 100 ** n)

/** A sum split in a ratio: one part at SI, the other at CI; total interest gives the whole sum. */
function inSplitSum(rng: Rng): QuestionDraft {
  const [u, v] = rng.pick([[2, 3], [3, 2], [1, 2], [3, 5], [2, 1], [5, 3], [3, 4], [4, 1]] as const)
  const r1 = rng.pick([6, 8, 10, 12, 15])
  const t1 = rng.int(2, 5)
  const r2 = rng.pick([5, 10, 20, 25])
  const k = rstep(rng, 1000, 12000, 500)
  const si = fdiv(P(u * k * r1 * t1), P(100))
  const ci = fmul(P(v * k), fsub(ciFactor(r2, 2), P(1)))
  need(fint(si) && fint(ci), 'interest not integral')
  const I = si.n + ci.n
  // independent: unit-sum interest per unit of k, solved back
  const perK = fadd(F(u * r1 * t1, 100), fmul(P(v), fsub(ciFactor(r2, 2), P(1))))
  const kb = fdiv(P(I), perK)
  ensure(feq(kb, P(k)), 'split sum solve mismatch')
  const S = (u + v) * k
  const stem = `A sum of money is divided into two parts in the ratio ${u} : ${v}. The first part is lent at ${r1}% per annum simple interest for ${t1} years and the second part at ${r2}% per annum compound interest (compounded annually) for 2 years. If the total interest earned is ₹${I}, what is the total sum?`
  const why = L(
    `Let the parts be ${u}k and ${v}k.`,
    `SI on the first part = ${u}k × ${r1} × ${t1}/100 = ${pc(F(u * r1 * t1, 100))}k.`,
    `CI on the second part = ${v}k × ((${100 + r2}/100)² − 1) = ${v}k × ${pc(fsub(ciFactor(r2, 2), P(1)))} = ${pc(fmul(P(v), fsub(ciFactor(r2, 2), P(1))))}k.`,
    `Total interest = ${pc(perK)}k = ${I} ⇒ k = ${k}.`,
    `Sum = ${u} + ${v} = ${u + v} parts = ${u + v} × ${k} = ₹${S}`,
  )
  const bothSi = fdiv(P(I * 100 * (u + v)), P(u * r1 * t1 + v * r2 * 2))
  return tag(nq(rng, 'interest', stem, S, [fval(bothSi), k, S + (u + v) * 500, (S * 4) / 5], why, { pre: '₹' }), 'in-split-sum', { u, v, r1, t1, r2, I })
}

/** CI - SI (2 years) and SI (3 years) fix the rate and the sum; asked: CI for 3 years. */
function inDifferenceChain(rng: Rng): QuestionDraft {
  const r = rng.pick([5, 10, 20, 25])
  const Pn = rstep(rng, 4000, 120000, 1000)
  const D = fdiv(P(Pn * r * r), P(10000))
  const S3 = fdiv(P(Pn * 3 * r), P(100))
  const ci3 = fmul(P(Pn), fsub(ciFactor(r, 3), P(1)))
  need(fint(D) && fint(S3) && fint(ci3), 'amounts not integral')
  const rb = fdiv(P(300 * D.n), P(S3.n))
  ensure(feq(rb, P(r)), 'rate recovery mismatch')
  const Pb = fdiv(P(S3.n * 100), P(3 * r))
  ensure(feq(Pb, P(Pn)), 'principal recovery mismatch')
  const stem = `On a certain sum, the difference between the compound interest (compounded annually) and the simple interest for 2 years at the same rate is ₹${D.n}, while the simple interest for 3 years is ₹${S3.n}. What is the compound interest on the same sum for 3 years at that rate?`
  const why = L(
    `For 2 years, CI − SI = P(r/100)²; SI for 3 years = 3Pr/100.`,
    `Ratio: P(r/100)² ÷ (3Pr/100) = r/300 = ${D.n}/${S3.n} ⇒ r = ${r}%.`,
    `P = ${S3.n} × 100/(3 × ${r}) = ${Pn}.`,
    `CI for 3 years = ${Pn} × ((${100 + r}/100)³ − 1) = ${Pn} × ${pc(fsub(ciFactor(r, 3), P(1)))} = ₹${ci3.n}`,
  )
  return tag(nq(rng, 'interest', stem, ci3, [S3.n, (Pn * 3 * r * 2) / 100 + D.n, fval(fmul(P(Pn), fsub(ciFactor(r, 2), P(1)))), S3.n + D.n * 3], why, { pre: '₹' }), 'in-difference-chain', { D: D.n, S3: S3.n })
}

/** Equal annual instalments at compound interest after a down payment: instalment, or extra paid over the price. */
function inInstalments(rng: Rng): QuestionDraft {
  const r = rng.pick([5, 10, 20, 25])
  const n = rng.int(2, 3)
  const g = ciFactor(r, 1)
  const num = g.n ** n
  const lo = Math.ceil(4000 / num)
  const hi = Math.floor(60000 / num)
  need(hi >= lo, 'instalment range empty')
  const x = num * rng.int(lo, hi)
  let Ln = P(0)
  for (let i = 1; i <= n; i++) Ln = fadd(Ln, fdiv(P(x), F(g.n ** i, g.d ** i)))
  need(fint(Ln), 'loan not integral')
  const L0 = Ln.n
  // independent: roll the balance forward and require it to reach zero
  let bal = P(L0)
  for (let i = 0; i < n; i++) bal = fsub(fmul(bal, g), P(x))
  ensure(bal.n === 0, 'instalment schedule mismatch')
  const dp = rstep(rng, 2000, 20000, 1000)
  const C = L0 + dp
  const item = rng.pick(['a laptop', 'a motorcycle', 'a refrigerator', 'an LED television', 'a home theatre system'])
  const head = `${item[0].toUpperCase() + item.slice(1)} is priced at ₹${C}. A customer pays ₹${dp} as down payment and clears the balance in ${n} equal annual instalments, the first due one year after purchase, with interest at ${r}% per annum compounded annually.`
  const why = L(
    `Loan after down payment = ${C} − ${dp} = ₹${L0}.`,
    `Let each instalment be x: ${Array.from({ length: n }, (_, i) => `x/(${pc(g)})${i === 0 ? '' : '^' + (i + 1)}`).join(' + ')} = ${L0}.`,
    `x × ${fracStr(fdiv(P(L0), P(x)))} = ${L0} ⇒ x = ${L0} × ${fracStr(fdiv(P(x), P(L0)))} = ₹${x}.`,
  )
  const noInt = L0 / n
  const sim = (L0 + (L0 * r * n) / 100) / n
  if (rng.chance(0.5)) return tag(nq(rng, 'interest', `${head} What is the amount of each instalment?`, x, [noInt, sim, fval(fdiv(fmul(P(L0), F((100 + r) ** n, 100 ** n)), P(n))), x + Math.round(x / 20 / 10) * 10 + 10], why, { pre: '₹' }), 'in-instalments-x', { r, n, L0 })
  const extra = n * x - L0
  return tag(nq(rng, 'interest', `${head} How much more than the price does the customer pay in all?`, extra, [(L0 * r * n) / 100, n * x, extra + dp, fval(fmul(P(L0), fsub(ciFactor(r, n), P(1))))], L(why, `Total paid = ${dp} + ${n} × ${x} = ${dp + n * x}; extra over price = ${dp + n * x} − ${C} = ₹${extra}`), { pre: '₹' }), 'in-instalments-extra', { r, n, L0, dp })
}

/** Amounts after 2 and 3 years reveal the rate and the sum; SI for another period is asked. */
function inAmountsRevealRate(rng: Rng): QuestionDraft {
  const r = rng.pick([5, 10, 20, 25])
  const g = ciFactor(r, 1)
  const Pn = g.d ** 3 * rng.int(Math.ceil(3000 / g.d ** 3), Math.floor(60000 / g.d ** 3))
  const a2 = fmul(P(Pn), ciFactor(r, 2))
  const a3 = fmul(P(Pn), ciFactor(r, 3))
  need(fint(a2) && fint(a3), 'amounts not integral')
  const t = rng.int(4, 6)
  const rb = fdiv(P((a3.n - a2.n) * 100), P(a2.n))
  ensure(feq(rb, P(r)), 'rate from amounts mismatch')
  const Pb = fdiv(P(a2.n * 10000), P((100 + r) ** 2))
  ensure(feq(Pb, P(Pn)), 'principal from amounts mismatch')
  const si = (Pn * r * t) / 100
  need(Number.isInteger(si), 'SI not integral')
  const stem = `A sum of money amounts to ₹${a2.n} in 2 years and to ₹${a3.n} in 3 years at compound interest (compounded annually). What is the simple interest on the same sum for ${t} years at the same rate?`
  const why = L(
    `Interest earned in the 3rd year = ${a3.n} − ${a2.n} = ${a3.n - a2.n}, which is the rate on the amount after 2 years.`,
    `Rate = ${a3.n - a2.n}/${a2.n} × 100 = ${r}%.`,
    `Sum = ${a2.n} ÷ (${100 + r}/100)² = ${Pn}.`,
    `SI for ${t} years = ${Pn} × ${r} × ${t}/100 = ₹${si}`,
  )
  const ci = fmul(P(Pn), fsub(ciFactor(r, t), P(1)))
  return tag(nq(rng, 'interest', stem, si, [fval(ci), (a2.n * r * t) / 100, a3.n - a2.n, (Pn * r * (t + 1)) / 100], why, { pre: '₹' }), 'in-amounts-reveal', { a2: a2.n, a3: a3.n, t })
}

/** Annual vs half-yearly compounding gap reveals the sum; CI for 18 months compounded half-yearly is asked. */
function inHalfYearly(rng: Rng): QuestionDraft {
  const r = rng.pick([10, 20, 30, 40])
  const h = F(200 + r, 200)
  const Pn = rstep(rng, 8000, 160000, 8000)
  const D = fdiv(P(Pn * r * r), P(40000))
  need(fint(D), 'difference not integral')
  const ci = fmul(P(Pn), fsub(F(h.n ** 3, h.d ** 3), P(1)))
  need(fint(ci), 'CI not integral')
  // independent: exact amounts for 1 year half-yearly vs annual
  const half = fmul(P(Pn), F(h.n ** 2, h.d ** 2))
  const ann = fmul(P(Pn), F(100 + r, 100))
  ensure(feq(fsub(half, ann), D), 'half-yearly gap mismatch')
  const Pb = fdiv(P(D.n * 40000), P(r * r))
  ensure(feq(Pb, P(Pn)), 'sum recovery mismatch')
  const stem = `The difference between the amounts on a certain sum for one year at ${r}% per annum, compounded half-yearly and compounded annually, is ₹${D.n}. What is the compound interest on the same sum for 18 months at the same rate, compounded half-yearly?`
  const why = L(
    `Half-yearly amount − annual amount = P[(1 + ${r}/200)² − (1 + ${r}/100)] = P × (${r}/200)² = ${pc(F(r * r, 40000))}P.`,
    `${pc(F(r * r, 40000))}P = ${D.n} ⇒ P = ₹${Pn}.`,
    `18 months = 3 half-years at ${r / 2}% each: amount = ${Pn} × (${200 + r}/200)³ = ${pc(fmul(P(Pn), F(h.n ** 3, h.d ** 3)))}.`,
    `CI = ${pc(fmul(P(Pn), F(h.n ** 3, h.d ** 3)))} − ${Pn} = ₹${ci.n}`,
  )
  const annualWay = fmul(P(Pn), fsub(fmul(ciFactor(r, 1), F(200 + r, 200)), P(1)))
  return tag(nq(rng, 'interest', stem, ci, [fval(annualWay), (Pn * r * 3) / 200, fval(fmul(P(Pn), fsub(F(h.n ** 2, h.d ** 2), P(1)))), D.n * 100], why, { pre: '₹' }), 'in-half-yearly', { r, D: D.n })
}

/** SI part and CI part earn equal interest: split the total in the right ratio. */
function inEqualInterest(rng: Rng): QuestionDraft {
  const r1 = rng.pick([6, 8, 10, 12, 15])
  const t1 = rng.int(2, 5)
  const r2 = rng.pick([5, 10, 20, 25])
  const [u, v] = reduce2(r2 * (200 + r2), 100 * r1 * t1)
  need(u + v <= 70 && u !== v, 'ratio too large')
  const k = rng.int(2, 40) * 100
  const S = (u + v) * k
  const p1 = u * k
  const p2 = v * k
  const si = fdiv(P(p1 * r1 * t1), P(100))
  const ci = fmul(P(p2), fsub(ciFactor(r2, 2), P(1)))
  ensure(feq(si, ci), 'equal-interest mismatch')
  const askSecond = rng.chance(0.5)
  const ans = askSecond ? p2 : p1
  const stem = `A sum of ₹${S} is divided into two parts. The first part is lent at ${r1}% per annum simple interest for ${t1} years and the second at ${r2}% per annum compound interest (compounded annually) for 2 years, and both earn the same interest. What is the ${askSecond ? 'second' : 'first'} part?`
  const why = L(
    `SI on part 1 = p1 × ${r1} × ${t1}/100 = ${pc(F(r1 * t1, 100))}p1.`,
    `CI on part 2 = p2 × ((${100 + r2}/100)² − 1) = ${pc(fsub(ciFactor(r2, 2), P(1)))}p2.`,
    `Equal interest ⇒ p1 : p2 = ${pc(fsub(ciFactor(r2, 2), P(1)))} : ${pc(F(r1 * t1, 100))} = ${u} : ${v}.`,
    `${askSecond ? 'Second' : 'First'} part = ${S} × ${askSecond ? v : u}/${u + v} = ₹${ans}`,
  )
  const swapped = askSecond ? p1 : p2
  const bothSi = (S * (askSecond ? r1 * t1 : r2 * 2)) / (r1 * t1 + r2 * 2)
  return tag(nq(rng, 'interest', stem, ans, [swapped, bothSi, S / 2, (S * (askSecond ? 1 : 2)) / 3], why, { pre: '₹' }), 'in-equal-interest', { r1, t1, r2, S, second: askSecond ? 1 : 0 })
}

/** Borrow at CI (with a processing fee), lend at SI: the lending rate from the net gain. */
function inBorrowLend(rng: Rng): QuestionDraft {
  const r1 = rng.pick([5, 10, 20, 25])
  const f = rng.pick([1, 2, 3, 4])
  const r2 = rng.int(r1 + 2, 30)
  const g = ciFactor(r1, 1)
  const Pn = g.d ** 2 * rng.int(Math.ceil(6000 / g.d ** 2), Math.floor(80000 / g.d ** 2))
  need((Pn * f) % 100 === 0 && (Pn * r2 * 2) % 100 === 0, 'amounts not integral')
  const ci = fmul(P(Pn), fsub(ciFactor(r1, 2), P(1)))
  need(fint(ci), 'CI not integral')
  const fee = (Pn * f) / 100
  const earn = (Pn * r2 * 2) / 100
  const G = earn - ci.n - fee
  need(G > 0, 'gain must be positive')
  const rb = fdiv(P((G + ci.n + fee) * 100), P(2 * Pn))
  ensure(feq(rb, P(r2)), 'lending rate mismatch')
  const nm = pickMen(rng, 1)[0]
  const stem = `${nm} borrows ₹${Pn} for 2 years at ${r1}% per annum compound interest (compounded annually) and pays a processing fee of ${f}% of the loan at the start. He lends the whole amount for 2 years at simple interest and gains ₹${G} overall after clearing the loan. At what rate per annum did he lend?`
  const why = L(
    `CI payable = ${Pn} × ((${100 + r1}/100)² − 1) = ₹${ci.n}; processing fee = ${f}% of ${Pn} = ₹${fee}.`,
    `Total cost = ${ci.n} + ${fee} = ₹${ci.n + fee}.`,
    `SI earned = total cost + gain = ${ci.n + fee} + ${G} = ₹${earn}.`,
    `Rate = ${earn} × 100/(${Pn} × 2) = ${r2}%`,
  )
  const noFee = ((G + ci.n) * 100) / (2 * Pn)
  const siBorrow = ((G + (Pn * r1 * 2) / 100 + fee) * 100) / (2 * Pn)
  return tag(nq(rng, 'interest', stem, r2, [noFee, siBorrow, ((G + ci.n + fee) * 100) / Pn, r2 + 2], why, { post: '%' }), 'in-borrow-lend', { r1, f, Pn, G })
}

/** Different rate in each of three years; the principal and interest from the final amount. */
function inVariableRates(rng: Rng): QuestionDraft {
  const rs3 = [rng.pick([10, 20, 25, 50]), rng.pick([10, 20, 25, 50]), rng.pick([10, 20, 25, 50])]
  need(new Set(rs3).size >= 2, 'rates must differ')
  const k = rng.int(2, 60)
  const Pn = k * 100
  const A = fdiv(P(Pn * (100 + rs3[0]) * (100 + rs3[1]) * (100 + rs3[2])), P(10 ** 6))
  need(fint(A) && A.n - Pn > 0, 'amount not integral')
  const Pb = fdiv(P(A.n * 10 ** 6), P((100 + rs3[0]) * (100 + rs3[1]) * (100 + rs3[2])))
  ensure(feq(Pb, P(Pn)), 'variable-rate principal mismatch')
  // independent: year-by-year roll-forward
  let cur = P(Pn)
  for (const r of rs3) cur = fdiv(fmul(cur, P(100 + r)), P(100))
  ensure(feq(cur, A), 'variable-rate roll-forward mismatch')
  const I = A.n - Pn
  const avgCi = Pn * ((1 + (rs3[0] + rs3[1] + rs3[2]) / 300) ** 3 - 1)
  const stem = `A sum of money is invested at compound interest for 3 years at ${rs3[0]}%, ${rs3[1]}% and ${rs3[2]}% per annum for the 1st, 2nd and 3rd years respectively. If it amounts to ₹${A.n}, how much interest does it earn?`
  const why = L(
    `Amount = P × ${100 + rs3[0]}/100 × ${100 + rs3[1]}/100 × ${100 + rs3[2]}/100 = ${pc(F((100 + rs3[0]) * (100 + rs3[1]) * (100 + rs3[2]), 10 ** 6))}P.`,
    `P = ${A.n} ÷ ${pc(F((100 + rs3[0]) * (100 + rs3[1]) * (100 + rs3[2]), 10 ** 6))} = ₹${Pn}.`,
    `Interest = ${A.n} − ${Pn} = ₹${I}`,
  )
  return tag(nq(rng, 'interest', stem, I, [Pn, avgCi, (Pn * (rs3[0] + rs3[1] + rs3[2])) / 100, I + Pn / 10], why, { pre: '₹' }), 'in-variable-rates', { r1: rs3[0], r2: rs3[1], r3: rs3[2], A: A.n })
}

export const IN_A: Tpl[] = [
  { name: 'in-split-sum', gen: (r) => inSplitSum(r) },
  { name: 'in-difference-chain', gen: (r) => inDifferenceChain(r) },
  { name: 'in-instalments', gen: (r) => inInstalments(r) },
  { name: 'in-amounts-reveal', gen: (r) => inAmountsRevealRate(r) },
  { name: 'in-half-yearly', gen: (r) => inHalfYearly(r) },
  { name: 'in-equal-interest', gen: (r) => inEqualInterest(r) },
  { name: 'in-borrow-lend', gen: (r) => inBorrowLend(r) },
  { name: 'in-variable-rates', gen: (r) => inVariableRates(r) },
]

// ============================================================================ NUMBER SYSTEM
const lcmAll = (xs: number[]): number => xs.reduce((a, b) => lcm(a, b), 1)
const digitSum = (n: number): number => String(n).split('').reduce((s, c) => s + Number(c), 0)
const countMult = (l: number, lo: number, hi: number): number => Math.floor(hi / l) - Math.floor((lo - 1) / l)

/** Remainders that are all "s short of the divisor", plus an extra divisibility condition: least such number. */
function nsShortBy(rng: Rng): QuestionDraft {
  const ds = rng.sample([6, 8, 9, 10, 12, 14, 15, 16, 18, 20, 21, 24, 25, 28, 30], 3)
  const l = lcmAll(ds)
  need(l >= 60 && l <= 1500 && ds.every((x, i) => ds.every((y, j) => i === j || y % x !== 0)), 'lcm out of range or redundant divisor')
  const s = rng.int(1, 5)
  need(s < Math.min(...ds), 'shortfall too large')
  const d = rng.pick([7, 11, 13, 17, 19, 23, 29])
  need(gcd(d, l) === 1, 'divisor not coprime to lcm')
  let m = 1
  while ((l * m - s) % d !== 0) m++
  const N = l * m - s
  // independent: scan upwards
  let scan = 1
  while (!(scan % d === 0 && ds.every((x) => scan % x === x - s))) scan++
  ensure(scan === N, 'least number mismatch')
  const stem = `What is the smallest number which, when divided by ${ds[0]}, ${ds[1]} and ${ds[2]}, leaves remainders ${ds[0] - s}, ${ds[1] - s} and ${ds[2] - s} respectively, and is exactly divisible by ${d}?`
  const why = L(
    `Every remainder is ${s} less than its divisor, so N + ${s} is divisible by ${ds[0]}, ${ds[1]} and ${ds[2]}.`,
    `LCM(${ds.join(', ')}) = ${l}, so N = ${l}m − ${s}.`,
    `N must also be a multiple of ${d}. Since ${l} leaves remainder ${l % d} on division by ${d}, ${l}m − ${s} is a multiple of ${d} when ${l % d}m leaves remainder ${s % d} on division by ${d}; the smallest positive m that does this is m = ${m}.`,
    `N = ${l} × ${m} − ${s} = ${N}`,
  )
  return tag(nq(rng, 'number-system', stem, N, [l - s, l * d - s, N + l, N - l > 0 ? N - l : N + 2 * l, l * (m + 1) - s], why), 'ns-short-by', { ds, s, d })
}

/** Greatest divisor leaving given remainders (HCF of the reduced numbers); remainder of the sum of the three numbers. */
function nsGreatestDivisor(rng: Rng): QuestionDraft {
  const H = rng.int(13, 60)
  const rem = [rng.int(1, H - 1), rng.int(1, H - 1), rng.int(1, H - 1)]
  const xs = [rng.int(4, 40), rng.int(4, 40), rng.int(4, 40)]
  need(new Set(xs).size === 3 && gcd(gcd(xs[0], xs[1]), xs[2]) === 1, 'multipliers unsuitable')
  need(new Set(rem).size >= 2, 'remainders identical')
  const nums = xs.map((x, i) => H * x + rem[i])
  const hcfRed = gcd(gcd(nums[0] - rem[0], nums[1] - rem[1]), nums[2] - rem[2])
  ensure(hcfRed === H, 'HCF mismatch')
  const sumRem = rem[0] + rem[1] + rem[2]
  const ans = sumRem % H
  need(ans > 0 && sumRem >= H, 'remainder trivial')
  // independent: largest divisor found by search
  let best = 0
  for (let g = 1; g <= 200; g++) if (nums.every((nn, i) => nn % g === rem[i]) && g > Math.max(...rem)) best = g
  ensure(best === H, 'greatest divisor search mismatch')
  const stem = `The greatest number which divides ${nums[0]}, ${nums[1]} and ${nums[2]} leaving remainders ${rem[0]}, ${rem[1]} and ${rem[2]} respectively is H. What is the remainder when the sum of the three given numbers is divided by H?`
  const why = L(
    `H divides ${nums[0]} − ${rem[0]} = ${nums[0] - rem[0]}, ${nums[1]} − ${rem[1]} = ${nums[1] - rem[1]} and ${nums[2]} − ${rem[2]} = ${nums[2] - rem[2]}, so H = HCF = ${H}.`,
    `Sum of the numbers = ${nums[0] + nums[1] + nums[2]} = a multiple of ${H} plus (${rem[0]} + ${rem[1]} + ${rem[2]}) = ${sumRem}.`,
    `Remainder = ${sumRem} mod ${H} = ${ans}`,
  )
  const wrongHcfAll = gcd(gcd(nums[0], nums[1]), nums[2])
  return tag(nq(rng, 'number-system', stem, ans, [sumRem, (nums[0] + nums[1] + nums[2]) % wrongHcfAll, H - ans, ans + H / 2 > H ? ans + 3 : Math.round(ans + H / 2)], why), 'ns-greatest-divisor', { nums, rem })
}

/** Largest five-digit number leaving a common remainder when divided by three numbers: sum of its digits. */
function nsLargestFiveDigit(rng: Rng): QuestionDraft {
  const ds = rng.sample([8, 9, 10, 12, 15, 16, 18, 20, 21, 24, 25, 28, 30, 35, 36, 40], 3)
  const l = lcmAll(ds)
  need(l >= 80 && l <= 3000 && ds.every((x, i) => ds.every((y, j) => i === j || y % x !== 0)), 'lcm out of range or redundant divisor')
  const r = rng.int(2, Math.min(...ds) - 1)
  const N = l * Math.floor((99999 - r) / l) + r
  let scan = 99999
  while (!ds.every((x) => scan % x === r)) scan--
  ensure(scan === N, 'largest number mismatch')
  const ans = digitSum(N)
  const noRem = l * Math.floor(99999 / l)
  const stem = `What is the sum of the digits of the largest five-digit number which leaves a remainder of ${r} when divided by each of ${ds[0]}, ${ds[1]} and ${ds[2]}?`
  const why = L(
    `LCM(${ds.join(', ')}) = ${l}; the number has the form ${l}k + ${r}.`,
    `Largest five-digit number is 99999: 99999 − ${r} = ${99999 - r} = ${l} × ${Math.floor((99999 - r) / l)} + ${(99999 - r) % l}, so k = ${Math.floor((99999 - r) / l)}.`,
    `N = ${l} × ${Math.floor((99999 - r) / l)} + ${r} = ${N}.`,
    `Sum of digits = ${String(N).split('').join(' + ')} = ${ans}`,
  )
  return tag(nq(rng, 'number-system', stem, ans, [digitSum(noRem), digitSum(N - l), digitSum(noRem - l + r), digitSum(N - r)], why), 'ns-largest-five-digit', { ds, r })
}

/** A five-digit number with two missing digits divisible by a composite number: value of a linear expression. */
function nsMissingDigits(rng: Rng): QuestionDraft {
  const D = rng.pick([36, 45, 72, 88, 99])
  const pos = rng.sample([0, 1, 2, 3, 4], 2).sort((a, b) => a - b)
  const digs = Array.from({ length: 5 }, () => rng.int(0, 9))
  if (!pos.includes(0)) digs[0] = rng.int(1, 9)
  const build = (x: number, y: number): number => {
    const t = digs.slice()
    t[pos[0]] = x
    t[pos[1]] = y
    return Number(t.join(''))
  }
  const sols: [number, number][] = []
  for (let x = pos[0] === 0 ? 1 : 0; x <= 9; x++) for (let y = 0; y <= 9; y++) if (build(x, y) % D === 0) sols.push([x, y])
  need(sols.length === 1, 'digits not unique')
  const [x, y] = sols[0]
  const t = digs.map(String)
  t[pos[0]] = 'x'
  t[pos[1]] = 'y'
  const pattern = t.join('')
  const [cx, cy] = rng.pick([[2, 1], [1, 2], [3, 1], [1, 3], [3, 2]] as const)
  const ans = cx * x + cy * y
  const N = build(x, y)
  const parts: Record<number, string[]> = {
    36: ['4', '9'],
    45: ['5', '9'],
    72: ['8', '9'],
    88: ['8', '11'],
    99: ['9', '11'],
  }
  const [f1, f2] = parts[D]
  const stem = `If the five-digit number ${pattern} is exactly divisible by ${D}, what is the value of ${cx === 1 ? '' : cx}x + ${cy === 1 ? '' : cy}y?`
  const known = digs.filter((_, i) => !pos.includes(i)).reduce((sum, v) => sum + v, 0)
  const sign = (i: number): number => (i % 2 === 0 ? 1 : -1)
  const knownAlt = digs.reduce((sum, v, i) => (pos.includes(i) ? sum : sum + sign(i) * v), 0)
  const testLine = (f: string): string =>
    f === '9'
      ? `Divisibility by 9: digit sum x + y + ${known} must be a multiple of 9.`
      : f === '11'
        ? `Divisibility by 11: (sum of digits at odd places) − (sum of digits at even places) = ${sign(pos[0]) === 1 ? 'x' : '−x'} ${sign(pos[1]) === 1 ? '+' : '−'} y ${knownAlt >= 0 ? '+' : '−'} ${Math.abs(knownAlt)} (or its negative), which must be 0 or a multiple of 11.`
        : `Divisibility by ${f}: the last ${f === '8' ? 'three' : 'two'} digits of ${pattern} must form a multiple of ${f}${f === '5' ? ' (last digit 0 or 5)' : ''}.`
  const why = L(
    `${D} = ${f1} × ${f2} (co-prime), so the number must be divisible by both ${f1} and ${f2}.`,
    testLine(f1),
    testLine(f2),
    `Checking the digit pairs (0 to 9) against both tests, the only pair that works is x = ${x}, y = ${y}, giving ${N} = ${D} × ${N / D}.`,
    `${cx === 1 ? '' : cx + ' × '}${x} + ${cy === 1 ? '' : cy + ' × '}${y} = ${ans}`,
  )
  return tag(nq(rng, 'number-system', stem, ans, [cx * y + cy * x, x + y, cx * x + cy * y + 9, Math.abs(ans - 9)], why), 'ns-missing-digits', { D, pattern: digs.concat(pos), cx, cy })
}

/** Consecutive integers / evens / odds / multiples: given the sum of squares, ask a cube sum, product or square difference. */
function nsConsecutive(rng: Rng): QuestionDraft {
  const kind = rng.pick([['consecutive positive integers', 1], ['consecutive even numbers', 2], ['consecutive odd numbers', 2], ['consecutive multiples of 3', 3], ['consecutive multiples of 5', 5]] as const)
  const step = kind[1]
  const cnt = rng.pick([3, 3, 4])
  let first = rng.int(3, 30)
  if (kind[0].includes('odd') && first % 2 === 0) first++
  if (kind[0].includes('even') && first % 2 === 1) first++
  if (step === 3 || step === 5) first = step * rng.int(2, 12)
  const nums = Array.from({ length: cnt }, (_, i) => first + step * i)
  const S2 = nums.reduce((s, v) => s + v * v, 0)
  // independent: search for the first term
  let found = -1
  for (let a = 1; a <= 400 && found < 0; a++) {
    let sq = 0
    for (let i = 0; i < cnt; i++) sq += (a + step * i) ** 2
    if (sq === S2) found = a
  }
  ensure(found === first, 'consecutive search mismatch')
  const sumI = (cnt * (cnt - 1)) / 2
  const sumI2 = nums.reduce((s, _, i) => s + i * i, 0)
  const qb = 2 * step * sumI
  const qc = S2 - step * step * sumI2
  const disc = qb * qb + 4 * cnt * qc
  const rt = Math.round(Math.sqrt(disc))
  ensure(rt * rt === disc && (-qb + rt) / (2 * cnt) === first, 'quadratic mismatch')
  const form = rng.int(0, 2)
  const hi = nums[cnt - 1]
  let ask: string
  let ans: number
  let wr: number[]
  let last: string
  if (form === 0) {
    ask = 'the sum of the cubes of these numbers'
    ans = nums.reduce((s, v) => s + v ** 3, 0)
    wr = [nums.reduce((s, v) => s + v, 0) ** 2, S2 * hi, ans - first ** 3 + (first + 1) ** 3, nums.reduce((s, v) => s * v, 1)]
    last = `Sum of cubes = ${nums.map((v) => `${v}³`).join(' + ')} = ${nums.map((v) => v ** 3).join(' + ')} = ${ans}`
  } else if (form === 1) {
    ask = 'the product of the smallest and the largest numbers'
    ans = first * hi
    wr = [first * nums[1], hi * nums[cnt - 2], nums[1] * hi, first + hi]
    last = `Product = ${first} × ${hi} = ${ans}`
  } else {
    ask = 'the difference between the squares of the largest and the smallest numbers'
    ans = hi * hi - first * first
    wr = [hi - first, hi * hi - nums[1] ** 2, (hi + first) * step, nums[1] ** 2 - first * first]
    last = `Difference = ${hi}² − ${first}² = ${hi * hi} − ${first * first} = ${ans}`
  }
  const stem = `The sum of the squares of ${cnt} ${kind[0]} is ${S2}. What is ${ask}?`
  const why = L(
    `Let the numbers be ${nums.map((_, i) => (i === 0 ? 'x' : `x + ${step * i}`)).join(', ')}.`,
    `Sum of squares: ${cnt}x² + ${qb}x + ${step * step * sumI2} = ${S2} ⇒ ${cnt}x² + ${qb}x − ${qc} = 0.`,
    `Discriminant = ${qb}² + 4 × ${cnt} × ${qc} = ${disc} = ${rt}², so x = (−${qb} + ${rt})/${2 * cnt} = ${first}.`,
    `The numbers are ${nums.join(', ')}.`,
    last,
  )
  return tag(nq(rng, 'number-system', stem, ans, wr, why), 'ns-consecutive', { step, cnt, S2, form })
}

/** Three-digit number from digit sum, a digit ratio and the drop on reversing: sum of the number and its reverse. */
function nsReversal(rng: Rng): QuestionDraft {
  const k = rng.pick([2, 3, 4])
  const c = rng.int(1, Math.floor(9 / k))
  const a = k * c
  const b = rng.int(0, 9)
  const S = a + b + c
  const D = 99 * (a - c)
  const N = 100 * a + 10 * b + c
  const R = 100 * c + 10 * b + a
  // independent: scan all three-digit numbers
  const hits: number[] = []
  for (let n = 100; n <= 999; n++) {
    const h = Math.floor(n / 100)
    const u = n % 10
    const rev = u * 100 + (Math.floor(n / 10) % 10) * 10 + h
    if (digitSum(n) === S && h === k * u && n - rev === D) hits.push(n)
  }
  ensure(hits.length === 1 && hits[0] === N, 'reversal search mismatch')
  const ans = N + R
  const stem = `In a three-digit number the sum of the digits is ${S}, the hundreds digit is ${k} times the units digit, and the number obtained by reversing the digits is ${D} less than the original number. What is the sum of the original number and the reversed number?`
  const why = L(
    `Let the digits be h, t, u with h = ${k}u.`,
    `Original − reversed = (100h + 10t + u) − (100u + 10t + h) = 99(h − u) = ${D} ⇒ h − u = ${a - c}.`,
    `${k}u − u = ${a - c} ⇒ u = ${c}, h = ${a}; digit sum ${S} ⇒ t = ${S} − ${a} − ${c} = ${b}.`,
    `Number = ${N}, reversed = ${R}.`,
    `Sum = ${N} + ${R} = ${ans}`,
  )
  return tag(nq(rng, 'number-system', stem, ans, [N, R, 2 * N - D, 101 * (a + c) + 10 * b], why), 'ns-reversal', { S, k, D })
}

/** Remainders of large powers (cyclicity) combined by sum or product. */
function nsPowerRemainder(rng: Rng): QuestionDraft {
  const m = rng.pick([7, 9, 11, 12, 13, 17, 19])
  const A = rng.int(2, 14)
  const B = rng.int(2, 14)
  const e1 = rng.int(40, 1500)
  const e2 = rng.int(40, 1500)
  need(A % m !== 0 && B % m !== 0 && A !== B, 'bases unsuitable')
  const prod = rng.chance(0.5)
  const powmod = (b: number, e: number): number => {
    let r = 1
    let x = b % m
    let k = e
    while (k > 0) {
      if (k & 1) r = (r * x) % m
      x = (x * x) % m
      k >>= 1
    }
    return r
  }
  const cyc = (b: number): { seq: number[]; mu: number; lam: number } => {
    const seq: number[] = []
    const seen = new Map<number, number>()
    let v = b % m
    while (!seen.has(v)) {
      seen.set(v, seq.length)
      seq.push(v)
      v = (v * b) % m
    }
    const mu = seen.get(v) as number
    return { seq, mu, lam: seq.length - mu }
  }
  const at = (b: number, e: number): { val: number; idx: number } => {
    const c = cyc(b)
    const idx = e - 1 < c.mu ? e - 1 : c.mu + ((e - 1 - c.mu) % c.lam)
    return { val: c.seq[idx], idx }
  }
  const r1 = at(A, e1).val
  const r2 = at(B, e2).val
  ensure(r1 === powmod(A, e1) && r2 === powmod(B, e2), 'power cycle mismatch')
  const ans = prod ? (r1 * r2) % m : (r1 + r2) % m
  need(ans !== 0 && r1 > 1 && r2 > 1, 'trivial remainder')
  const c1 = cyc(A)
  const c2 = cyc(B)
  const wrongSwap = prod ? (r1 + r2) % m : (r1 * r2) % m
  const op = prod ? '×' : '+'
  const stem = `What is the remainder when ${A}^${e1} ${op} ${B}^${e2} is divided by ${m}?`
  const why = L(
    `Powers of ${A} leave remainders ${c1.seq.join(', ')} when divided by ${m}${c1.mu > 0 ? ` (cycle of length ${c1.lam} after the first ${c1.mu} term${c1.mu > 1 ? 's' : ''})` : ` (repeating with period ${c1.lam})`}.`,
    `${A}^${e1}: position ${e1} ⇒ remainder ${r1}.`,
    `Powers of ${B} leave remainders ${c2.seq.join(', ')} when divided by ${m}${c2.mu > 0 ? ` (cycle of length ${c2.lam} after the first ${c2.mu} term${c2.mu > 1 ? 's' : ''})` : ` (repeating with period ${c2.lam})`}.`,
    `${B}^${e2}: position ${e2} ⇒ remainder ${r2}.`,
    `Remainder = (${r1} ${op} ${r2}) mod ${m} = ${ans}`,
  )
  const pool = [wrongSwap, r1, r2, (A * B) % m, (ans + 1) % m, (ans + m - 1) % m, 1, 2, 3, 0].filter((v) => v !== ans)
  return tag(strQ(rng, { topic: 'number-system', stem, correct: String(ans), wrong: [...new Set(pool)].map(String), why, none: 0.1 }), 'ns-power-remainder', { m, A, B, e1, e2, prod: prod ? 1 : 0 })
}

/** Inclusion-exclusion counts of multiples in a range ("but not by", or "exactly one of"). */
function nsCounting(rng: Rng): QuestionDraft {
  const [a, b, c] = rng.sample([2, 3, 4, 5, 6, 7, 8, 9, 10, 12], 3)
  const lo = rng.int(50, 400)
  const hi = rng.int(1500, 4000)
  const lab = rng.int(0, 1)
  const lab1 = lcm(a, b)
  const lab2 = lcm(lab1, c)
  need(lab1 <= 120, 'lcm too large')
  let ans: number
  let stem: string
  let why: string
  let wr: number[]
  if (lab === 0) {
    need(lab2 !== lab1, 'c divides lcm')
    ans = countMult(lab1, lo, hi) - countMult(lab2, lo, hi)
    stem = `How many integers from ${lo} to ${hi} (both inclusive) are divisible by both ${a} and ${b} but not by ${c}?`
    why = L(
      `Divisible by both ${a} and ${b} ⇒ multiples of LCM = ${lab1}: int(${hi}/${lab1}) − int(${lo - 1}/${lab1}) = ${Math.floor(hi / lab1)} − ${Math.floor((lo - 1) / lab1)} = ${countMult(lab1, lo, hi)}.`,
      `Of these, those also divisible by ${c} are multiples of LCM(${a}, ${b}, ${c}) = ${lab2}: ${Math.floor(hi / lab2)} − ${Math.floor((lo - 1) / lab2)} = ${countMult(lab2, lo, hi)}.`,
      `Required count = ${countMult(lab1, lo, hi)} − ${countMult(lab2, lo, hi)} = ${ans}`,
    )
    wr = [countMult(lab1, lo, hi), countMult(lab1, lo, hi) - countMult(c, lo, hi), countMult(lab2, lo, hi), ans + countMult(lab2, lo, hi) * 2]
  } else {
    ans = countMult(a, lo, hi) + countMult(b, lo, hi) - 2 * countMult(lab1, lo, hi)
    stem = `How many integers from ${lo} to ${hi} (both inclusive) are divisible by exactly one of ${a} and ${b}?`
    why = L(
      `Multiples of ${a}: ${Math.floor(hi / a)} − ${Math.floor((lo - 1) / a)} = ${countMult(a, lo, hi)}; multiples of ${b}: ${Math.floor(hi / b)} − ${Math.floor((lo - 1) / b)} = ${countMult(b, lo, hi)}.`,
      `Multiples of both = multiples of LCM ${lab1}: ${countMult(lab1, lo, hi)}.`,
      `Exactly one = ${countMult(a, lo, hi)} + ${countMult(b, lo, hi)} − 2 × ${countMult(lab1, lo, hi)} = ${ans}`,
    )
    wr = [countMult(a, lo, hi) + countMult(b, lo, hi) - countMult(lab1, lo, hi), countMult(a, lo, hi) + countMult(b, lo, hi), countMult(lab1, lo, hi), ans + countMult(lab1, lo, hi)]
  }
  need(ans > 5, 'count too small')
  // independent brute force
  let brute = 0
  for (let n = lo; n <= hi; n++) {
    const da = n % a === 0
    const db = n % b === 0
    if (lab === 0 ? da && db && n % c !== 0 : da !== db) brute++
  }
  ensure(brute === ans, 'counting mismatch')
  return tag(nq(rng, 'number-system', stem, ans, wr, why), 'ns-counting', { a, b, c, lo, hi, lab })
}

/** HCF, LCM and sum of two numbers determine them: ask the larger number or the difference of squares. */
function nsHcfLcm(rng: Rng): QuestionDraft {
  const h = rng.int(6, 36)
  const p = rng.int(3, 12)
  const q = rng.int(p + 1, 15)
  need(gcd(p, q) === 1, 'not co-prime')
  const lcmv = h * p * q
  const S = h * (p + q)
  const A = h * p
  const B = h * q
  // independent: search pairs with the given HCF, LCM and sum
  let found: [number, number] | null = null
  for (let x = h; x <= S; x += h) {
    const y = S - x
    if (y > x && y % h === 0 && gcd(x, y) === h && lcm(x, y) === lcmv) found = [x, y]
  }
  ensure(found !== null && found[0] === A && found[1] === B, 'hcf/lcm search mismatch')
  const askLarge = rng.chance(0.5)
  const ans = askLarge ? B : B * B - A * A
  const stem = `The HCF of two numbers is ${h}, their LCM is ${lcmv} and their sum is ${S}. What is ${askLarge ? 'the larger number' : 'the difference between the squares of the two numbers'}?`
  const why = L(
    `Numbers are ${h}p and ${h}q with p, q co-prime. LCM = ${h}pq = ${lcmv} ⇒ pq = ${p * q}.`,
    `Sum = ${h}(p + q) = ${S} ⇒ p + q = ${p + q}.`,
    `p, q are the roots of t² − ${p + q}t + ${p * q} = 0 ⇒ p = ${p}, q = ${q}; numbers = ${A} and ${B}.`,
    askLarge ? `Larger number = ${B}` : `Difference of squares = ${B}² − ${A}² = ${B * B} − ${A * A} = ${ans}`,
  )
  return tag(nq(rng, 'number-system', stem, ans, askLarge ? [A, h * (p + q) - A + h, lcmv / h, S / 2 + h] : [(B - A) * (B - A), B * B + A * A, S * h, (B - A) * S + h], why), 'ns-hcf-lcm', { h, lcmv, S, askLarge: askLarge ? 1 : 0 })
}

export const NS_A: Tpl[] = [
  { name: 'ns-short-by', gen: (r) => nsShortBy(r) },
  { name: 'ns-greatest-divisor', gen: (r) => nsGreatestDivisor(r) },
  { name: 'ns-largest-five-digit', gen: (r) => nsLargestFiveDigit(r) },
  { name: 'ns-missing-digits', gen: (r) => nsMissingDigits(r) },
  { name: 'ns-consecutive', gen: (r) => nsConsecutive(r) },
  { name: 'ns-reversal', gen: (r) => nsReversal(r) },
  { name: 'ns-power-remainder', gen: (r) => nsPowerRemainder(r) },
  { name: 'ns-counting', gen: (r) => nsCounting(r) },
  { name: 'ns-hcf-lcm', gen: (r) => nsHcfLcm(r) },
]

// ============================================================================ registry
/** Like `genSingles` (cycling shuffled templates, no repeated stems) but with a larger retry cap: the mains templates are strict. */
function genMains(rng: Rng, count: number, tpls: Tpl[]): Group[] {
  const out: Group[] = []
  const seen = new Set<string>()
  let order: Tpl[] = []
  while (out.length < count) {
    if (!order.length) order = rng.shuffle(tpls)
    const t = order.pop() as Tpl
    let q: QuestionDraft | null = null
    for (let i = 0; i < 1500 && !q; i++) {
      try {
        const c = t.gen(rng, 'hard')
        if (!seen.has(c.stem)) q = c
      } catch (e) {
        if (!(e instanceof Reject)) throw e
      }
    }
    if (!q) throw new Error(`mains template "${t.name}" could not produce a question`)
    seen.add(q.stem)
    out.push({ questions: [q] })
  }
  return out
}

const gen =
  (tpls: Tpl[]): TopicGenerator =>
  (rng: Rng, _d: MockDifficulty, count: number): Group[] =>
    genMains(rng, count, tpls)

/** Mains-level generators (always the hardest tier; `difficulty` is ignored). */
export const MAINS_ARITH_A: Partial<Record<QuantTopicId, TopicGenerator>> = {
  percentage: gen(PCT_A),
  'profit-loss': gen(PL_A),
  'ratio-partnership': gen(RP_A),
  'ages-averages': gen(AG_A),
  interest: gen(IN_A),
  'number-system': gen(NS_A),
}

/** Template names per topic (used by the verifier for coverage). */
export const MAINS_ARITH_A_TEMPLATES: Record<string, string[]> = {
  percentage: PCT_A.map((t) => t.name),
  'profit-loss': PL_A.map((t) => t.name),
  'ratio-partnership': RP_A.map((t) => t.name),
  'ages-averages': AG_A.map((t) => t.name),
  interest: IN_A.map((t) => t.name),
  'number-system': NS_A.map((t) => t.name),
}
