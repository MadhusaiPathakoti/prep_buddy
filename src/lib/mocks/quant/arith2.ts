// Simple & Compound Interest, Time & Work, Time-Speed-Distance, Mixture & Alligation.
import type { Rng } from '../rng'
import type { Group, MockDifficulty, QuestionDraft } from '../types'
import { F, Reject, decStr, ensure, fadd, fdiv, feq, fint, fmul, fsub, fval, gcd, genSingles, inr, lcm, need, nq, pickMen, pickNames, ratioStr, rstep, strQ, terminating } from './util'
import type { Frac, Tpl } from './util'

const P = (n: number): Frac => F(n)
const pc = (n: number | Frac): string => (typeof n === 'number' ? String(n) : decStr(n, 2))
const lcmAll = (xs: number[]): number => xs.reduce((a, b) => lcm(a, b), 1)

// ============================================================================ INTEREST
const RATES = [4, 5, 6, 8, 10, 12, 15, 20]

function siBasic(rng: Rng, d: MockDifficulty): QuestionDraft {
  const Pn = rstep(rng, 1000, d === 'hard' ? 40000 : 20000, 500)
  const r = rng.pick(RATES)
  const t = rng.int(2, d === 'hard' ? 9 : 6)
  const si = (Pn * r * t) / 100
  need(Number.isInteger(si), 'unclean')
  const nm = pickMen(rng, 1)[0]
  const form = rng.int(0, 3)
  let si2 = 0
  for (let y = 0; y < t; y++) si2 += (Pn * r) / 100
  ensure(si2 === si, 'simple interest mismatch')
  if (form === 0) return nq(rng, 'interest', `${nm} invested ${inr(Pn)} at ${r}% per annum simple interest for ${t} years. What is the total amount he gets at the end of ${t} years?`, Pn + si, [si, Pn + si / t, Pn + (Pn * r * (t + 1)) / 100], `SI = ${Pn} × ${r} × ${t}/100 = ${si}.\nAmount = ${Pn} + ${si} = ${inr(Pn + si)}.`, { pre: '₹' })
  if (form === 1) return nq(rng, 'interest', `A sum of ${inr(Pn)} becomes ${inr(Pn + si)} in ${t} years at simple interest. What is the rate of interest per annum?`, r, [r + 2, r - 1 > 0 ? r - 1 : r + 3, (si * 100) / (Pn + si) / t, r * 2], `SI = ${Pn + si} − ${Pn} = ${si}.\nRate = ${si} × 100/(${Pn} × ${t}) = ${r}%.`, { post: '%' })
  if (form === 2) return nq(rng, 'interest', `At what rate of simple interest per annum will ${inr(Pn)} earn ${inr(si)} in ${t} years?`, r, [r + 1, r + 3, r * 2, si / Pn], `Rate = ${si} × 100/(${Pn} × ${t}) = ${r}%.`, { post: '%' })
  return nq(rng, 'interest', `In how many years will ${inr(Pn)} earn a simple interest of ${inr(si)} at ${r}% per annum?`, t, [t + 1, t - 1 > 0 ? t - 1 : t + 2, t * 2, si / Pn], `Time = ${si} × 100/(${Pn} × ${r}) = ${t} years.`, { post: ' years' })
}

function ciAmount(Pn: number, r: number, n: number): { amt: Frac; years: Frac[] } {
  const g = F(100 + r, 100)
  let cur = P(Pn)
  const years: Frac[] = []
  for (let i = 0; i < n; i++) {
    cur = fmul(cur, g)
    years.push(cur)
  }
  return { amt: cur, years }
}
/** P multiple that makes the compound amount an integer. */
function ciPrincipal(rng: Rng, r: number, n: number, lo: number, hi: number): number {
  const reduced = F(100 + r, 100)
  const step = lcm(reduced.d ** n, 100)
  return rstep(rng, lo, hi, step)
}

function ciBasic(rng: Rng, d: MockDifficulty): QuestionDraft {
  const r = rng.pick(d === 'hard' ? [5, 10, 20, 25] : [5, 10, 20])
  const n = d === 'hard' ? rng.int(2, 3) : 2
  const Pn = ciPrincipal(rng, r, n, 800, d === 'hard' ? 60000 : 30000)
  const { amt, years } = ciAmount(Pn, r, n)
  need(fint(amt), 'amount not integral')
  ensure(feq(amt, fdiv(fmul(P(Pn), P((100 + r) ** n)), P(100 ** n))), 'compound interest mismatch')
  const ci = amt.n - Pn
  const si = (Pn * r * n) / 100
  const form = rng.int(0, 1)
  const why = `Amount after ${n} years = ${Pn} × (${100 + r}/100)^${n} = ${years.map((y) => pc(y)).join(' → ')}.\nCI = ${amt.n} − ${Pn} = ${ci}.`
  if (form === 0) return nq(rng, 'interest', `What is the compound interest on ${inr(Pn)} at ${r}% per annum for ${n} years?`, ci, [si, amt.n, (Pn * r * (n + 1)) / 100, ci + 100], why, { pre: '₹' })
  return nq(rng, 'interest', `What amount will ${inr(Pn)} become in ${n} years at ${r}% per annum compounded annually?`, amt, [Pn + si, ci, Pn + si + 100], why, { pre: '₹' })
}

function ciSiDiff(rng: Rng, d: MockDifficulty): QuestionDraft {
  const r = rng.pick([5, 10, 15, 20, 25])
  const three = d === 'hard' && rng.chance(0.5)
  const n = three ? 3 : 2
  const step = three ? lcm(100 ** 3 / gcd(100 ** 3, r * r * (300 + r)), 100) : 10000 / gcd(10000, r * r)
  const Pn = rstep(rng, 2000, 40000, Math.max(100, step))
  const ci = fsub(ciAmount(Pn, r, n).amt, P(Pn))
  const si = P((Pn * r * n) / 100)
  const diff = fsub(ci, si)
  need(fint(diff) && diff.n > 0, 'difference not integral')
  const formula = three ? fdiv(P(Pn * r * r * (300 + r)), P(1000000)) : fdiv(P(Pn * r * r), P(10000))
  ensure(feq(diff, formula), 'CI-SI difference mismatch')
  const form = rng.int(0, three ? 0 : 2)
  if (form === 0) return nq(rng, 'interest', `What is the difference between the compound interest and the simple interest on ${inr(Pn)} at ${r}% per annum for ${n} years?`, diff, [si, ci, fdiv(P(Pn * r), P(100)), fadd(diff, P(Pn / 100))], three ? `CI − SI (3 years) = P(r/100)²(3 + r/100) = ${Pn} × (${r}/100)² × (3 + ${r}/100) = ${inr(diff.n)}.` : `CI − SI (2 years) = P(r/100)² = ${Pn} × (${r}/100)² = ${inr(diff.n)}.`, { pre: '₹' })
  if (form === 1) return nq(rng, 'interest', `The difference between the compound interest and the simple interest on a certain sum at ${r}% per annum for 2 years is ${inr(diff.n)}. What is the sum?`, Pn, [fdiv(P(diff.n * 100), P(r)), diff.n * 100, fdiv(P(diff.n * 10000), P(r * r * 2)), Pn + 1000], `CI − SI = P(r/100)² ⇒ ${diff.n} = P × (${r}/100)².\nP = ${diff.n} × 10000/${r * r} = ${inr(Pn)}.`, { pre: '₹' })
  return nq(rng, 'interest', `The difference between the compound interest and the simple interest on ${inr(Pn)} for 2 years is ${inr(diff.n)}. What is the rate of interest per annum?`, r, [r * 2, r / 2, r + 5, fdiv(P(diff.n * 100), P(Pn)).n], `CI − SI = P(r/100)² ⇒ ${diff.n} = ${Pn} × r²/10000.\nr² = ${(diff.n * 10000) / Pn} ⇒ r = ${r}%.`, { post: '%' })
}

function siTwoAmounts(rng: Rng): QuestionDraft {
  for (let tries = 0; tries < 200; tries++) {
    const Pn = rstep(rng, 2000, 30000, 500)
    const r = rng.pick(RATES)
    const t1 = rng.int(2, 4)
    const t2 = t1 + rng.int(1, 3)
    const yearly = (Pn * r) / 100
    if (!Number.isInteger(yearly)) continue
    const a1 = Pn + yearly * t1
    const a2 = Pn + yearly * t2
    ensure((a2 - a1) / (t2 - t1) === yearly && a1 - t1 * yearly === Pn, 'two-amount SI mismatch')
    const ask = rng.int(0, 1)
    if (ask === 0) return nq(rng, 'interest', `A sum of money amounts to ${inr(a1)} in ${t1} years and to ${inr(a2)} in ${t2} years at simple interest. What is the sum?`, Pn, [yearly, a1 - yearly, a1 - t2 * yearly + 500, a1], `SI for ${t2 - t1} year${t2 - t1 > 1 ? 's' : ''} = ${a2} − ${a1} = ${a2 - a1}, so SI for 1 year = ${yearly}.\nSum = ${a1} − ${t1} × ${yearly} = ${inr(Pn)}.`, { pre: '₹' })
    return nq(rng, 'interest', `A sum of money amounts to ${inr(a1)} in ${t1} years and to ${inr(a2)} in ${t2} years at simple interest. What is the rate of interest per annum?`, r, [r + 2, r - 1, (yearly * 100) / a1, r * 2], `SI for 1 year = (${a2} − ${a1})/${t2 - t1} = ${yearly}.\nSum = ${a1} − ${t1} × ${yearly} = ${Pn}.\nRate = ${yearly} × 100/${Pn} = ${r}%.`, { post: '%' })
  }
  throw new Reject('si two amounts')
}

function ciHalfYearly(rng: Rng): QuestionDraft {
  const r = rng.pick([8, 10, 20, 12, 16])
  const years = rng.pick([1, 1.5])
  const periods = years * 2
  const reduced = F(200 + r, 200)
  const Pn = rstep(rng, 2000, 40000, lcm(reduced.d ** periods, 100))
  let cur = P(Pn)
  for (let i = 0; i < periods; i++) cur = fmul(cur, reduced)
  need(fint(cur), 'not integral')
  ensure(feq(cur, fdiv(fmul(P(Pn), P((200 + r) ** periods)), P(200 ** periods))), 'half-yearly mismatch')
  const ci = cur.n - Pn
  const annual = ciAmount(Pn, r, Math.ceil(years)).amt
  const form = rng.int(0, 1)
  const why = `Rate per half-year = ${r / 2}%, number of half-years = ${periods}.\nAmount = ${Pn} × (${200 + r}/200)^${periods} = ${inr(cur.n)}.\nCI = ${cur.n} − ${Pn} = ${ci}.`
  if (form === 0) return nq(rng, 'interest', `What is the compound interest on ${inr(Pn)} at ${r}% per annum for ${years} ${years === 1 ? 'year' : 'years'}, interest being compounded half-yearly?`, ci, [cur.n, (Pn * r * years) / 100, annual.n - Pn, ci + 100], why, { pre: '₹' })
  return nq(rng, 'interest', `What amount will ${inr(Pn)} become in ${years} ${years === 1 ? 'year' : 'years'} at ${r}% per annum compounded half-yearly?`, cur, [fadd(P(Pn), P((Pn * r * years) / 100)), annual, P(ci)], why, { pre: '₹' })
}

function siDoubling(rng: Rng): QuestionDraft {
  const x = rng.pick([4, 5, 8, 10, 20, 25])
  const m = rng.pick([2, 3, 4])
  const form = rng.int(0, 2)
  if (form === 0) return nq(rng, 'interest', `At what rate of simple interest per annum will a sum of money become ${m} times itself in ${x} years?`, F((m - 1) * 100, x), [100 / x, (m - 1) * 10, m * 100 / x, (m - 1) * 100 / (x + 1)], `Interest = ${m - 1} × principal in ${x} years.\nRate = ${(m - 1) * 100}/${x} = ${pc(F((m - 1) * 100, x))}%.`, { post: '%' })
  if (form === 1) return nq(rng, 'interest', `A sum of money doubles itself in ${x} years at simple interest. In how many years will it become ${m + 1} times itself?`, m * x, [(m + 1) * x, x * 2, m * x + x, x + m], `Doubles in ${x} years ⇒ interest = principal in ${x} years.\nTo become ${m + 1} times, interest = ${m} × principal ⇒ ${m} × ${x} = ${m * x} years.`, { post: ' years' })
  const rr = F(100, x)
  return nq(rng, 'interest', `In how many years will a sum of money become ${m} times itself at ${pc(rr)}% per annum simple interest?`, F((m - 1) * x, 1), [x, m * x, (m - 1) * x + 2, (m + 1) * x], `Interest needed = ${m - 1} × principal.\nTime = ${(m - 1) * 100}/${pc(rr)} = ${(m - 1) * x} years.`, { post: ' years' })
}

function siSplit(rng: Rng): QuestionDraft {
  for (let tries = 0; tries < 300; tries++) {
    const p1 = rstep(rng, 2000, 20000, 500)
    const p2 = rstep(rng, 2000, 20000, 500)
    const r1 = rng.pick([4, 5, 6, 8, 10])
    const r2 = rng.pick([8, 10, 12, 15])
    if (r1 === r2 || p1 === p2) continue
    const X = p1 + p2
    const I = (p1 * r1 + p2 * r2) / 100
    if (!Number.isInteger(I)) continue
    ensure((I * 100 - X * r2) / (r1 - r2) === p1, 'split interest mismatch')
    const nm = pickNames(rng, 1)[0]
    return nq(rng, 'interest', `${nm} lent ${inr(X)} in two parts, one at ${r1}% and the other at ${r2}% per annum simple interest. If the total interest after 1 year is ${inr(I)}, what is the amount lent at ${r1}%?`, p1, [p2, X / 2, p1 + 1000, fdiv(P(I * 100), P(r1)).n], `Let the part at ${r1}% be x: ${r1}x/100 + ${r2}(${X} − x)/100 = ${I}.\n${r1}x + ${r2 * X} − ${r2}x = ${I * 100} ⇒ ${r2 - r1}x = ${r2 * X - I * 100}.\nx = ${inr(p1)}.`, { pre: '₹' })
  }
  throw new Reject('si split')
}

function ciInstalments(rng: Rng): QuestionDraft {
  const r = rng.pick([5, 10, 20, 25])
  const q = F(100, 100 + r)
  for (let tries = 0; tries < 200; tries++) {
    const I = rstep(rng, 500, 20000, 100) * 1
    const L = fmul(P(I), fadd(q, fmul(q, q)))
    if (!fint(L)) continue
    // second method: amortise
    let bal = L
    bal = fsub(fmul(bal, F(100 + r, 100)), P(I))
    bal = fsub(fmul(bal, F(100 + r, 100)), P(I))
    ensure(bal.n === 0, 'instalment schedule does not clear the loan')
    const nm = pickMen(rng, 1)[0]
    return nq(rng, 'interest', `${nm} borrowed ${inr(L.n)} at ${r}% per annum compound interest and agreed to repay it in two equal annual instalments. What is the amount of each instalment?`, I, [fdiv(P(L.n), P(2)), fdiv(fmul(P(L.n), F(100 + r, 100)), P(2)), I + 100, fadd(fdiv(P(L.n), P(2)), P(L.n * r / 100)).n], `Let each instalment be x: x/(1 + ${r}/100) + x/(1 + ${r}/100)² = ${L.n}.\nx × (${pc(q)} + ${pc(fmul(q, q))}) = ${L.n} ⇒ x = ${inr(I)}.`, { pre: '₹' })
  }
  throw new Reject('instalments')
}

function ciRateFromAmounts(rng: Rng): QuestionDraft {
  const r = rng.pick([5, 10, 20, 25])
  const n = 2
  const Pn = ciPrincipal(rng, r, 3, 800, 40000)
  const a2 = ciAmount(Pn, r, n).amt
  const a3 = ciAmount(Pn, r, n + 1).amt
  need(fint(a2) && fint(a3), 'unclean')
  const rate = fdiv(fmul(fsub(a3, a2), P(100)), a2)
  ensure(feq(rate, P(r)), 'rate from amounts mismatch')
  return nq(rng, 'interest', `A sum of money amounts to ${inr(a2.n)} in 2 years and to ${inr(a3.n)} in 3 years at compound interest (compounded annually). What is the rate of interest per annum?`, r, [r + 5, r - 2 > 0 ? r - 2 : r + 2, fdiv(P(100 * (a3.n - a2.n)), P(a3.n)).n, r * 2], `Interest for the 3rd year = ${a3.n} − ${a2.n} = ${a3.n - a2.n}, earned on ${a2.n}.\nRate = ${a3.n - a2.n}/${a2.n} × 100 = ${r}%.`, { post: '%' })
}

function ciSiRate(rng: Rng): QuestionDraft {
  const r = rng.pick([5, 10, 15, 20, 25])
  const Pn = rstep(rng, 2000, 40000, 10000 / gcd(10000, r * r))
  const si2 = (Pn * r * 2) / 100
  const diff = (Pn * r * r) / 10000
  need(Number.isInteger(diff), 'unclean')
  ensure((200 * diff) / si2 === r, 'ci-si rate mismatch')
  return nq(rng, 'interest', `The simple interest on a sum for 2 years is ${inr(si2)} and the difference between the compound interest and the simple interest for 2 years is ${inr(diff)}. What is the rate of interest per annum?`, r, [r * 2, r / 2, (diff * 100) / si2, r + 5], `CI − SI = P(r/100)² and SI = 2Pr/100.\nRatio (CI − SI)/SI = r/200 ⇒ r = 200 × ${diff}/${si2} = ${r}%.`, { post: '%' })
}

export const INTEREST_TPLS: Tpl[] = [
  { name: 'si-basic', d: 'medium', gen: siBasic },
  { name: 'ci-basic', gen: ciBasic },
  { name: 'ci-si-diff', gen: ciSiDiff },
  { name: 'si-twoamounts', gen: (r) => siTwoAmounts(r) },
  { name: 'ci-halfyearly', gen: (r) => ciHalfYearly(r) },
  { name: 'si-doubling', d: 'medium', gen: (r) => siDoubling(r) },
  { name: 'si-split', d: 'hard', gen: (r) => siSplit(r) },
  { name: 'ci-instalments', d: 'hard', gen: (r) => ciInstalments(r) },
  { name: 'ci-rate-from-amounts', gen: (r) => ciRateFromAmounts(r) },
  { name: 'ci-si-rate', d: 'hard', gen: (r) => ciSiRate(r) },
]

// ============================================================================ TIME & WORK
function daysTogether(rng: Rng, d: MockDifficulty): QuestionDraft {
  const n = d === 'hard' || rng.chance(0.4) ? 3 : 2
  for (let tries = 0; tries < 300; tries++) {
    const e = Array.from({ length: n }, () => rng.int(1, 12))
    const s = e.reduce((a, b) => a + b, 0)
    const W = lcmAll([...e, s]) * rng.int(1, 4)
    const days = e.map((x) => W / x)
    const tog = W / s
    if (days.some((x) => x < 5 || x > 90) || tog < 2 || tog > 40 || new Set(days).size < n) continue
    // second method: fractions
    const inv = days.reduce((acc, x) => fadd(acc, F(1, x)), F(0))
    ensure(feq(fdiv(P(1), inv), F(tog)), 'time-work mismatch between LCM and fraction methods')
    const nm = rng.chance(0.5) ? ['A', 'B', 'C'].slice(0, n) : pickNames(rng, n)
    const who = n === 2 ? `${nm[0]} and ${nm[1]}` : `${nm[0]}, ${nm[1]} and ${nm[2]}`
    const form = rng.int(0, 1)
    const why = `Take total work = LCM = ${W} units.\nEfficiencies: ${nm.map((x, i) => `${x} = ${W}/${days[i]} = ${e[i]}`).join(', ')}.\nTogether = ${s} units/day ⇒ ${W}/${s} = ${tog} days.`
    if (form === 0) return nq(rng, 'time-work', `${who} can complete a piece of work ${n === 2 ? 'alone ' : ''}in ${days.join(', ').replace(/, ([^,]*)$/, ' and $1')} days respectively. In how many days will they complete it working together?`, tog, [days[0], fval(F(days.reduce((a, b) => a + b, 0), n)), tog + 1, tog * 2], why, { post: ' days' })
    return nq(rng, 'time-work', `${nm[0]} can do a work in ${days[0]} days and ${nm[1]} in ${days[1]} days${n === 3 ? `, while ${nm[2]} can do it in ${days[2]} days` : ''}. If all of them work together, in how many days will the work be finished?`, tog, [fval(F(days.reduce((a, b) => a + b, 0), n)), Math.max(...days) - Math.min(...days), tog + 2, tog * 2], why, { post: ' days' })
  }
  throw new Reject('days together')
}

function leaves(rng: Rng): QuestionDraft {
  for (let tries = 0; tries < 400; tries++) {
    const eA = rng.int(1, 9)
    const eB = rng.int(1, 9)
    if (eA === eB) continue
    const W = lcmAll([eA, eB, eA + eB]) * rng.int(1, 4)
    const a = W / eA
    const b = W / eB
    const k = rng.int(2, 8)
    if ((W + eA * k) % (eA + eB) !== 0) continue
    const T = (W + eA * k) / (eA + eB)
    if (T <= k || T > 40 || a > 60 || b > 60 || a < 6 || b < 6) continue
    // second method: fractions
    const lhs = fadd(fmul(F(T - k), F(1, a)), fmul(F(T), F(1, b)))
    ensure(feq(lhs, F(1)), 'leaving-midway: schedule does not complete the work')
    const [pa, pb] = rng.chance(0.5) ? ['A', 'B'] : pickNames(rng, 2)
    return nq(rng, 'time-work', `${pa} and ${pb} can complete a work in ${a} days and ${b} days respectively. They start working together, but ${pa} leaves ${k} days before the work is completed. In how many days is the whole work completed?`, T, [Math.round((a * b) / (a + b)), T - 1, T + 2, a - k], `Total work = ${W} units; ${pa} = ${eA}/day, ${pb} = ${eB}/day.\n${pb} works all T days, ${pa} works (T − ${k}) days: ${eA}(T − ${k}) + ${eB}T = ${W}.\n${eA + eB}T = ${W + eA * k} ⇒ T = ${T} days.`, { post: ' days' })
  }
  throw new Reject('leaves')
}

function pipes(rng: Rng, d: MockDifficulty): QuestionDraft {
  for (let tries = 0; tries < 400; tries++) {
    const eA = rng.int(2, 9)
    const eB = rng.int(1, 8)
    const eC = rng.int(1, eA + eB - 1)
    const net = eA + eB - eC
    const W = lcmAll([eA, eB, eC, net]) * rng.int(1, 2)
    const a = W / eA
    const b = W / eB
    const c = W / eC
    const T = W / net
    if (a > 60 || b > 60 || c > 80 || T > 60 || T < 3 || a < 3 || b < 3 || c < 3) continue
    const inv = fsub(fadd(F(1, a), F(1, b)), F(1, c))
    ensure(feq(fdiv(P(1), inv), F(T)), 'pipes mismatch between methods')
    const form = rng.int(0, d === 'hard' ? 2 : 1)
    const why = `Tank capacity = LCM = ${W} units.\nA fills ${eA}/h, B fills ${eB}/h, C empties ${eC}/h.\nNet = ${eA} + ${eB} − ${eC} = ${net}/h.`
    if (form === 0) return nq(rng, 'time-work', `Pipe A can fill a tank in ${a} hours and pipe B in ${b} hours, while pipe C can empty the full tank in ${c} hours. If all three pipes are opened together, in how many hours will the tank be completely filled?`, T, [fval(F(a * b, a + b)), T + 1, T * 2, fval(F(a + b - c, 1))], `${why}\nTime = ${W}/${net} = ${T} hours.`, { post: ' hours' })
    if (form === 1) return nq(rng, 'time-work', `Pipes A and B can fill a tank in ${a} hours and ${b} hours respectively, while pipe C, fitted at the bottom, can empty the full tank in ${c} hours. If all three pipes are open, how long will it take to fill the empty tank?`, T, [fval(F(a * b, a + b)), T - 1 > 0 ? T - 1 : T + 3, T + 3, c - a], `${why}\nTime = ${W}/${net} = ${T} hours.`, { post: ' hours' })
    // leak: A alone a hours; with leak y hours; leak time?
    const eL = eC
    const withLeak = W / (eA - eL > 0 ? eA - eL : 1)
    if (eA - eL <= 0 || withLeak > 90) continue
    ensure(feq(fdiv(P(1), fsub(F(1, a), F(1, c))), F(withLeak)), 'leak mismatch')
    return nq(rng, 'time-work', `A tank is filled by a pipe in ${a} hours. Because of a leak in the bottom, it takes ${withLeak} hours to fill. In how many hours will the leak alone empty the full tank?`, c, [withLeak - a, withLeak, a + withLeak, fval(F(a * withLeak, a + withLeak))], `Capacity = ${W} units; pipe = ${eA}/h; with leak = ${W}/${withLeak} = ${eA - eL}/h.\nLeak = ${eA} − ${eA - eL} = ${eL}/h ⇒ ${W}/${eL} = ${c} hours.`, { post: ' hours' })
  }
  throw new Reject('pipes')
}

function efficiency(rng: Rng): QuestionDraft {
  for (let tries = 0; tries < 200; tries++) {
    const p = rng.pick([20, 25, 50, 60, 75, 100, 150, 40])
    const ratio = F(100 + p, 100)
    const u = ratio.n
    const v = ratio.d
    const T = rng.int(2, 14) * u
    const alone = ((u + v) * T) / u
    const other = ((u + v) * T) / v
    if (!Number.isInteger(alone) || !Number.isInteger(other) || alone > 80 || other > 120) continue
    ensure(feq(fadd(F(1, alone), F(1, other)), F(1, T)), 'efficiency mismatch')
    const nm = pickNames(rng, 2)
    if (rng.chance(0.5)) return nq(rng, 'time-work', `${nm[0]} is ${p}% more efficient than ${nm[1]}. Working together they can finish a job in ${T} days. In how many days can ${nm[0]} alone finish the job?`, alone, [other, T * 2, fval(F(T * (100 + p), 100)), T + p / 10], `Efficiency ratio ${nm[0]} : ${nm[1]} = ${100 + p} : 100 = ${u} : ${v}.\nTotal work = (${u} + ${v}) × ${T} = ${(u + v) * T} units.\n${nm[0]} alone = ${(u + v) * T}/${u} = ${alone} days.`, { post: ' days' })
    return nq(rng, 'time-work', `${nm[0]} is ${p}% more efficient than ${nm[1]}. Working together they can finish a job in ${T} days. In how many days can ${nm[1]} alone finish the job?`, other, [alone, T * 2, T + 10, fval(F(T * 100, 100 + p))], `Efficiency ratio ${nm[0]} : ${nm[1]} = ${u} : ${v}.\nTotal work = (${u} + ${v}) × ${T} = ${(u + v) * T} units.\n${nm[1]} alone = ${(u + v) * T}/${v} = ${other} days.`, { post: ' days' })
  }
  throw new Reject('efficiency')
}

function wages(rng: Rng): QuestionDraft {
  for (let tries = 0; tries < 300; tries++) {
    const e = [rng.int(2, 9), rng.int(2, 9), rng.int(2, 9)]
    const g = e.reduce((a, b) => gcd(a, b), 0)
    if (g !== 1 || new Set(e).size < 3) continue
    const s = e.reduce((a, b) => a + b, 0)
    const W = lcmAll(e)
    const days = e.map((x) => W / x)
    if (days.some((x) => x > 60 || x < 4)) continue
    const unit = rng.int(2, 25) * 20
    const total = s * unit
    const nm = pickNames(rng, 3)
    const i = rng.int(0, 2)
    ensure(Math.abs((total * e[i]) / s - e[i] * unit) < 1e-9, 'wages share mismatch')
    return nq(rng, 'time-work', `${nm[0]}, ${nm[1]} and ${nm[2]} can complete a work in ${days[0]}, ${days[1]} and ${days[2]} days respectively. They work together on it and are paid ${inr(total)} in all. What is the share of ${nm[i]}?`, e[i] * unit, [(total * (s - e[i])) / (2 * s), total / 3, e[i] * unit + 100, total * e[(i + 1) % 3] / s], `Efficiencies (LCM = ${W}): ${e.join(' : ')}.\nWages are shared in the ratio of work done = ${e.join(' : ')}.\n${nm[i]}'s share = ${total} × ${e[i]}/${s} = ${inr(e[i] * unit)}.`, { pre: '₹' })
  }
  throw new Reject('wages')
}

function alternate(rng: Rng): QuestionDraft {
  for (let tries = 0; tries < 300; tries++) {
    const eA = rng.int(2, 9)
    const eB = rng.int(1, 8)
    if (eA === eB) continue
    const s = eA + eB
    const W = lcmAll([eA, eB, s]) * rng.int(1, 3)
    const a = W / eA
    const b = W / eB
    if (a > 60 || b > 60 || a < 4 || b < 4 || W / s > 30) continue
    const days = (2 * W) / s
    // second method: simulate day by day
    let done = 0
    let t = 0
    while (done < W) {
      done += t % 2 === 0 ? eA : eB
      t++
    }
    ensure(done === W && t === days, 'alternate-day simulation disagrees')
    return nq(rng, 'time-work', `A can do a piece of work in ${a} days and B can do it in ${b} days. They work on alternate days, starting with A. In how many days will the work be completed?`, days, [Math.round((a * b) / (a + b)), days + 1, days - 1 > 0 ? days - 1 : days + 2, a + b], `Total work = ${W} units; A = ${eA}/day, B = ${eB}/day.\nIn 2 days they do ${s} units; ${W}/${s} = ${W / s} such cycles = ${days} days.`, { post: ' days' })
  }
  throw new Reject('alternate')
}

function partial(rng: Rng): QuestionDraft {
  for (let tries = 0; tries < 300; tries++) {
    const a = rng.pick([10, 12, 15, 16, 20, 24, 25, 30, 40])
    const b = rng.pick([12, 15, 18, 20, 24, 30, 36, 40, 45, 60])
    const x = rng.int(2, a - 2)
    const rest = fmul(fsub(F(1), F(x, a)), P(b))
    if (!fint(rest) || a === b) continue
    const nm = pickNames(rng, 2)
    return nq(rng, 'time-work', `${nm[0]} alone can complete a work in ${a} days and ${nm[1]} alone in ${b} days. ${nm[0]} works for ${x} days and then leaves. In how many more days can ${nm[1]} finish the remaining work?`, rest, [x, fval(fmul(F(x, a), P(b))), fval(rest) + 2, a - x], `Work done by ${nm[0]} = ${x}/${a}; remaining = ${a - x}/${a}.\n${nm[1]} takes ${b} × ${a - x}/${a} = ${pc(rest)} days.`, { post: ' days' })
  }
  throw new Reject('partial')
}

function manDays(rng: Rng, d: MockDifficulty): QuestionDraft {
  if (d === 'hard' && rng.chance(0.5)) {
    for (let tries = 0; tries < 300; tries++) {
      // x men = y women in work rate
      const em = rng.int(2, 5)
      const ew = rng.int(1, em - 1)
      if (gcd(em, ew) !== 1) continue
      const m1 = ew * rng.int(1, 3)
      const w1 = em * rng.int(1, 3)
      const D = rng.int(6, 24)
      // m1 men take D days  => work = m1*em*D ; w1 women should equal same capacity: need m1*em == w1*ew
      if (m1 * em !== w1 * ew) continue
      const m2 = rng.int(2, 8)
      const w2 = rng.int(2, 8)
      const W = m1 * em * D
      const rate = m2 * em + w2 * ew
      if (W % rate !== 0) continue
      const D2 = W / rate
      if (D2 < 2 || D2 > 40) continue
      ensure(F(W, rate).n === D2, 'men/women work mismatch')
      return nq(rng, 'time-work', `${m1} men or ${w1} women can complete a work in ${D} days. In how many days can ${m2} men and ${w2} women together complete the same work?`, D2, [Math.round((m1 * D) / (m2 + w2)), D2 + 2, D2 - 1 > 0 ? D2 - 1 : D2 + 3, D], `${m1} men = ${w1} women ⇒ 1 man = ${w1}/${m1} women = ${pc(F(w1, m1))} women.\n${m2} men + ${w2} women = ${pc(fadd(fmul(P(m2), F(w1, m1)), P(w2)))} women.\nWork = ${w1} × ${D} woman-days ⇒ days = ${w1 * D}/${pc(fadd(fmul(P(m2), F(w1, m1)), P(w2)))} = ${D2}.`, { post: ' days' })
    }
    throw new Reject('men women')
  }
  for (let tries = 0; tries < 300; tries++) {
    const M = rng.int(2, 20) * 2
    const D = rng.int(4, 30)
    const h = rng.int(5, 9)
    const M2 = rng.int(2, 20) * 2
    const h2 = rng.int(5, 10)
    if (M === M2 && h === h2) continue
    const num = M * D * h
    if (num % (M2 * h2) !== 0) continue
    const D2 = num / (M2 * h2)
    if (D2 < 2 || D2 > 60) continue
    ensure(M * D * h === M2 * D2 * h2, 'man-days mismatch')
    return nq(rng, 'time-work', `${M} men can complete a work in ${D} days working ${h} hours a day. In how many days can ${M2} men complete the same work working ${h2} hours a day?`, D2, [Math.round((M * D) / M2), D2 + 2, D2 * 2, D], `Men × days × hours = constant.\n${M} × ${D} × ${h} = ${M2} × x × ${h2} ⇒ x = ${num}/${M2 * h2} = ${D2} days.`, { post: ' days' })
  }
  throw new Reject('man days')
}

function threePairs(rng: Rng): QuestionDraft {
  for (let tries = 0; tries < 500; tries++) {
    const eA = rng.int(1, 9)
    const eB = rng.int(1, 9)
    const eC = rng.int(1, 9)
    if (new Set([eA, eB, eC]).size < 3) continue
    const s1 = eA + eB
    const s2 = eB + eC
    const s3 = eC + eA
    const S = eA + eB + eC
    const W = lcmAll([s1, s2, s3, S, eA, eB, eC])
    const dab = W / s1
    const dbc = W / s2
    const dca = W / s3
    const tog = W / S
    if (W > 400 || [dab, dbc, dca, tog].some((x) => x > 60 || x < 3)) continue
    const aAlone = W / eA
    if (aAlone > 130) continue
    // second method: fractions: 2(1/A+1/B+1/C) = 1/dab + 1/dbc + 1/dca
    const half = fdiv(fadd(fadd(F(1, dab), F(1, dbc)), F(1, dca)), P(2))
    ensure(feq(half, F(S, W)), 'pair-work total rate mismatch')
    ensure(feq(fsub(half, F(1, dbc)), F(eA, W)), 'pair-work A rate mismatch')
    if (rng.chance(0.5)) return nq(rng, 'time-work', `A and B together can do a work in ${dab} days, B and C together in ${dbc} days, and C and A together in ${dca} days. In how many days can A, B and C together do the work?`, tog, [fval(F(dab * dbc * dca, dab * dbc + dbc * dca + dca * dab)), Math.round((dab + dbc + dca) / 3), tog + 2, tog * 2], `Total work = ${W} units.\n(A+B) = ${s1}, (B+C) = ${s2}, (C+A) = ${s3} units/day.\n2(A+B+C) = ${s1 + s2 + s3} ⇒ A+B+C = ${S} units/day.\nDays = ${W}/${S} = ${tog}.`, { post: ' days' })
    return nq(rng, 'time-work', `A and B together can do a work in ${dab} days, B and C together in ${dbc} days, and C and A together in ${dca} days. In how many days can A alone do the work?`, aAlone, [tog, dab, dca * 2, W / eB], `Total work = ${W} units.\n(A+B) = ${s1}, (B+C) = ${s2}, (C+A) = ${s3} units/day.\nA+B+C = ${S}; A = ${S} − ${s2} = ${eA} units/day.\nDays = ${W}/${eA} = ${aAlone}.`, { post: ' days' })
  }
  throw new Reject('three pairs')
}

export const TIMEWORK_TPLS: Tpl[] = [
  { name: 'tw-together', gen: daysTogether },
  { name: 'tw-leaves', gen: (r) => leaves(r) },
  { name: 'tw-pipes', gen: pipes },
  { name: 'tw-efficiency', gen: (r) => efficiency(r) },
  { name: 'tw-wages', gen: (r) => wages(r) },
  { name: 'tw-alternate', gen: (r) => alternate(r) },
  { name: 'tw-partial', gen: (r) => partial(r) },
  { name: 'tw-mandays', gen: manDays },
  { name: 'tw-threepairs', d: 'hard', gen: (r) => threePairs(r) },
]

// ============================================================================ SPEED, TIME, DISTANCE
function trainPlatform(rng: Rng): QuestionDraft {
  const vms = rng.pick([10, 15, 20, 25, 30])
  const kmph = (vms * 18) / 5
  const t1 = rng.int(6, 20)
  const L = vms * t1
  const t2 = rng.int(t1 + 4, t1 + 25)
  const Pl = vms * t2 - L
  need(L >= 60 && L <= 600 && Pl >= 80 && Pl <= 900 && L % 10 === 0 && Pl % 10 === 0, 'lengths unsuitable')
  ensure(((L + Pl) * 18) / (5 * t2) === kmph, 'train speed mismatch')
  const form = rng.int(0, 2)
  if (form === 0) return nq(rng, 'speed-distance', `A ${L} m long train crosses a ${Pl} m long platform in ${t2} seconds. What is the speed of the train in km/h?`, kmph, [((L + Pl) / t2), (L / t2) * 3.6, kmph + 9, ((L + Pl) * 18) / (5 * t1)], `Distance covered = ${L} + ${Pl} = ${L + Pl} m in ${t2} s.\nSpeed = ${L + Pl}/${t2} = ${vms} m/s = ${vms} × 18/5 = ${kmph} km/h.`, { post: ' km/h' })
  if (form === 1) return nq(rng, 'speed-distance', `A train crosses a pole in ${t1} seconds and a ${Pl} m long platform in ${t2} seconds. What is the length of the train (in metres)?`, L, [Pl, L + 20, (Pl * t1) / t2, L - 20], `Let speed = v. Length = ${t1}v and Length + ${Pl} = ${t2}v.\n(${t2} − ${t1})v = ${Pl} ⇒ v = ${vms} m/s.\nLength = ${t1} × ${vms} = ${L} m.`, { post: ' m' })
  return nq(rng, 'speed-distance', `A ${L} m long train running at ${kmph} km/h crosses a platform in ${t2} seconds. What is the length of the platform (in metres)?`, Pl, [L, (kmph * t2) / 3.6 + 20, Pl + 50, vms * t2], `Speed = ${kmph} km/h = ${kmph} × 5/18 = ${vms} m/s.\nDistance covered in ${t2} s = ${vms * t2} m = train + platform.\nPlatform = ${vms * t2} − ${L} = ${Pl} m.`, { post: ' m' })
}

function trainsTwo(rng: Rng, d: MockDifficulty): QuestionDraft {
  for (let tries = 0; tries < 300; tries++) {
    const opposite = d === 'hard' ? rng.chance(0.5) : rng.chance(0.65)
    const u = rng.pick([5, 10, 15, 20, 25, 30, 35, 40])
    const rel = (u * 18) / 5
    let v1: number
    let v2: number
    if (opposite) {
      v1 = rng.int(Math.ceil(rel * 0.3), Math.floor(rel * 0.7))
      v2 = rel - v1
    } else {
      v2 = rng.int(20, 80)
      v1 = v2 + rel
    }
    if (v1 < 10 || v2 < 10 || v1 > 120 || v2 > 120 || v1 === v2) continue
    const t = rng.int(6, 30)
    const total = u * t
    if (total % 10 !== 0 || total < 150 || total > 900) continue
    const L1 = rstep(rng, 50, total - 50, 10)
    const L2 = total - L1
    if (L2 < 50) continue
    const relSpeed = opposite ? v1 + v2 : v1 - v2
    ensure(((L1 + L2) * 18) / (5 * relSpeed) === t, 'two-train crossing mismatch')
    const form = rng.int(0, 1)
    const dir = opposite ? 'in opposite directions' : 'in the same direction'
    if (form === 0) return nq(rng, 'speed-distance', `Two trains of lengths ${L1} m and ${L2} m run on parallel tracks ${dir} at ${v1} km/h and ${v2} km/h respectively. In how many seconds will they cross each other completely?`, t, [((L1 + L2) * 18) / (5 * (opposite ? Math.abs(v1 - v2) : v1 + v2)), t + 2, t - 1, t * 2], `Relative speed = ${opposite ? `${v1} + ${v2}` : `${v1} − ${v2}`} = ${relSpeed} km/h = ${relSpeed} × 5/18 = ${u} m/s.\nTime = (${L1} + ${L2})/${u} = ${t} s.`, { post: ' seconds' })
    return nq(rng, 'speed-distance', `Two trains running ${dir} at ${v1} km/h and ${v2} km/h cross each other in ${t} seconds. If the length of the first train is ${L1} m, what is the length of the second train (in metres)?`, L2, [L1 + L2, L2 + 20, L2 - 20, u * t - 2 * L1 > 0 ? u * t - 2 * L1 : L2 + 50], `Relative speed = ${relSpeed} km/h = ${u} m/s.\nTotal length = ${u} × ${t} = ${total} m.\nSecond train = ${total} − ${L1} = ${L2} m.`, { post: ' m' })
  }
  throw new Reject('two trains')
}

function boat(rng: Rng, d: MockDifficulty): QuestionDraft {
  for (let tries = 0; tries < 300; tries++) {
    const s = rng.int(2, 6)
    const b = rng.int(s + 3, 20)
    const down = b + s
    const up = b - s
    if (up < 2) continue
    const D = lcm(down, up) * rng.int(1, 2)
    const t1 = D / down
    const t2 = D / up
    if (D > 240 || t1 < 2 || t2 > 24) continue
    ensure((D / t1 + D / t2) / 2 === b && (D / t1 - D / t2) / 2 === s, 'boat mismatch')
    const form = rng.int(0, d === 'hard' ? 3 : 2)
    if (form === 0) return nq(rng, 'speed-distance', `A boat covers ${D} km downstream in ${t1} hours and the same distance upstream in ${t2} hours. What is the speed of the boat in still water (in km/h)?`, b, [s, down, up, (down + up) / 2 + 2], `Downstream speed = ${D}/${t1} = ${down} km/h; upstream speed = ${D}/${t2} = ${up} km/h.\nStill water = (${down} + ${up})/2 = ${b} km/h.`, { post: ' km/h' })
    if (form === 1) return nq(rng, 'speed-distance', `The downstream speed of a boat is ${down} km/h and its upstream speed is ${up} km/h. What is the speed of the stream (in km/h)?`, s, [b, down - up, (down + up) / 2 - 1, s + 1], `Stream = (${down} − ${up})/2 = ${s} km/h.`, { post: ' km/h' })
    if (form === 2) return nq(rng, 'speed-distance', `A boat goes ${D} km upstream in ${t2} hours. If the speed of the stream is ${s} km/h, how long will it take to cover ${D} km downstream?`, t1, [t2, t1 + 1, D / b, t2 - t1], `Upstream speed = ${D}/${t2} = ${up} km/h ⇒ still water = ${up} + ${s} = ${b} km/h.\nDownstream speed = ${b} + ${s} = ${down} km/h.\nTime = ${D}/${down} = ${t1} hours.`, { post: ' hours' })
    return nq(rng, 'speed-distance', `The speed of a boat in still water is ${b} km/h and the speed of the stream is ${s} km/h. A man rows ${D} km upstream and returns to the starting point. What is the total time taken (in hours)?`, t1 + t2, [(2 * D) / b, t2, t1 + t2 + 2, D / s], `Upstream time = ${D}/${up} = ${t2} h; downstream time = ${D}/${down} = ${t1} h.\nTotal = ${t2} + ${t1} = ${t1 + t2} hours.`, { post: ' hours' })
  }
  throw new Reject('boat')
}

function avgSpeed(rng: Rng, d: MockDifficulty): QuestionDraft {
  const veh = rng.pick(['A car', 'A bus', 'A truck', 'A motorbike', 'A taxi'])
  for (let tries = 0; tries < 300; tries++) {
    const v1 = rng.int(3, 24) * 5
    const v2 = rng.int(3, 24) * 5
    if (v1 === v2) continue
    if (d === 'medium' || rng.chance(0.5)) {
      const avg = fdiv(P(2 * v1 * v2), P(v1 + v2))
      if (!terminating(avg, 1)) continue
      const D = lcm(v1, v2) * rng.int(1, 2)
      const tot = fadd(F(D, v1), F(D, v2))
      ensure(feq(fdiv(P(2 * D), tot), avg), 'average speed mismatch')
      if (D > 600) continue
      return nq(rng, 'speed-distance', `${veh} covers ${D} km at ${v1} km/h and returns the same ${D} km at ${v2} km/h. What is its average speed for the whole journey (in km/h)?`, avg, [(v1 + v2) / 2, v1, v2, fval(avg) + 3], `Total distance = ${2 * D} km.\nTime = ${D}/${v1} + ${D}/${v2} = ${pc(tot)} h.\nAverage speed = ${2 * D}/${pc(tot)} = ${pc(avg)} km/h.`, { post: ' km/h' })
    }
    const d1 = lcm(v1, v2) * rng.int(1, 3)
    const d2 = lcm(v1, v2) * rng.int(1, 3)
    if (d1 === d2 || d1 + d2 > 900) continue
    const avg = fdiv(P(d1 + d2), fadd(F(d1, v1), F(d2, v2)))
    if (!terminating(avg, 1)) continue
    return nq(rng, 'speed-distance', `A person travels ${d1} km at ${v1} km/h and then another ${d2} km at ${v2} km/h. What is his average speed for the entire journey (in km/h)?`, avg, [(v1 + v2) / 2, (v1 * d1 + v2 * d2) / (d1 + d2), fval(avg) + 2, fval(avg) - 2], `Time = ${d1}/${v1} + ${d2}/${v2} = ${pc(fadd(F(d1, v1), F(d2, v2)))} h.\nAverage speed = ${d1 + d2}/${pc(fadd(F(d1, v1), F(d2, v2)))} = ${pc(avg)} km/h.`, { post: ' km/h' })
  }
  throw new Reject('avg speed')
}

function meeting(rng: Rng): QuestionDraft {
  for (let tries = 0; tries < 300; tries++) {
    const va = rng.int(3, 14) * 5
    const vb = rng.int(3, 14) * 5
    if (va === vb) continue
    const t = rng.int(2, 9)
    const D = (va + vb) * t
    if (D > 900) continue
    const nm = pickNames(rng, 2)
    ensure(va * t + vb * t === D, 'meeting mismatch')
    if (rng.chance(0.5)) return nq(rng, 'speed-distance', `Two cities are ${D} km apart. ${nm[0]} starts from city P towards city Q at ${va} km/h and at the same time ${nm[1]} starts from Q towards P at ${vb} km/h. After how many hours will they meet?`, t, [D / Math.abs(va - vb), t + 1, t - 1 > 0 ? t - 1 : t + 2, D / Math.max(va, vb)], `Relative speed = ${va} + ${vb} = ${va + vb} km/h.\nTime = ${D}/${va + vb} = ${t} hours.`, { post: ' hours' })
    return nq(rng, 'speed-distance', `Two cities P and Q are ${D} km apart. ${nm[0]} starts from P towards Q at ${va} km/h and at the same time ${nm[1]} starts from Q towards P at ${vb} km/h. At what distance from P will they meet (in km)?`, va * t, [vb * t, D / 2, va * t + 20, D / (va + vb)], `Time to meet = ${D}/${va + vb} = ${t} hours.\nDistance from P = ${va} × ${t} = ${va * t} km.`, { post: ' km' })
  }
  throw new Reject('meeting')
}

const cap1 = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1)

function chase(rng: Rng): QuestionDraft {
  const [slow, fast] = rng.pick([['bus', 'car'], ['truck', 'jeep'], ['cyclist', 'motorbike'], ['goods train', 'express train'], ['cart', 'tractor'], ['lorry', 'taxi']])
  const an = (w: string): string => (/^[aeiou]/.test(w) ? `an ${w}` : `a ${w}`)
  for (let tries = 0; tries < 300; tries++) {
    const v1 = rng.int(4, 20) * 5
    const v2 = v1 + rng.int(1, 6) * 5
    const gap = rng.int(1, 6)
    const lead = v1 * gap
    if (lead % (v2 - v1) !== 0) continue
    const t = lead / (v2 - v1)
    if (t > 12 || t < 1) continue
    const dist = v2 * t
    ensure(v1 * (t + gap) === v2 * t, 'chase mismatch')
    if (rng.chance(0.5)) return nq(rng, 'speed-distance', `${cap1(an(slow))} leaves a station at ${v1} km/h. ${gap} hour${gap > 1 ? 's' : ''} later, ${an(fast)} leaves the same station in the same direction at ${v2} km/h. After how many hours of the ${fast}'s start will it overtake the ${slow}?`, t, [lead / v2, t + 1, lead / v1, gap * 2], `Head start of the ${slow} = ${v1} × ${gap} = ${lead} km.\nRelative speed = ${v2} − ${v1} = ${v2 - v1} km/h.\nTime = ${lead}/${v2 - v1} = ${t} hours.`, { post: ' hours' })
    return nq(rng, 'speed-distance', `${cap1(an(slow))} leaves a station at ${v1} km/h. ${gap} hour${gap > 1 ? 's' : ''} later, ${an(fast)} leaves the same station in the same direction at ${v2} km/h. At what distance from the station will the ${fast} overtake the ${slow} (in km)?`, dist, [lead, v1 * t, dist + v1, dist - 10], `Head start of the ${slow} = ${v1} × ${gap} = ${lead} km; relative speed = ${v2 - v1} km/h.\nTime = ${lead}/${v2 - v1} = ${t} hours.\nDistance = ${v2} × ${t} = ${dist} km.`, { post: ' km' })
  }
  throw new Reject('chase')
}

function lateEarly(rng: Rng): QuestionDraft {
  for (let tries = 0; tries < 400; tries++) {
    const v1 = rng.pick([3, 4, 5, 6, 8, 10, 12, 15, 20, 30, 40, 45, 50, 60])
    const v2 = v1 + rng.pick([1, 2, 3, 4, 5, 10, 15, 20])
    const D = rng.int(2, 30) * 2
    const num = 60 * D * (v2 - v1)
    if (num % (v1 * v2) !== 0) continue
    const tot = num / (v1 * v2)
    if (tot < 6 || tot > 60) continue
    const late = rng.int(2, tot - 2)
    const early = tot - late
    ensure(feq(fmul(fsub(F(D, v1), F(D, v2)), P(60)), P(tot)), 'late/early mismatch')
    const nm = pickMen(rng, 1)[0]
    return nq(rng, 'speed-distance', `${nm} walking at ${v1} km/h reaches his destination ${late} minutes late. Walking at ${v2} km/h he reaches ${early} minutes early. What is the distance to the destination (in km)?`, D, [D / 2, (v1 + v2) / 2, D + 2, tot], `Time difference = ${late} + ${early} = ${tot} min = ${tot}/60 h.\nD/${v1} − D/${v2} = ${tot}/60 ⇒ D × ${v2 - v1}/${v1 * v2} = ${tot}/60.\nD = ${D} km.`, { post: ' km' })
  }
  throw new Reject('late early')
}

function speedRatio(rng: Rng): QuestionDraft {
  for (let tries = 0; tries < 200; tries++) {
    const [a, b] = rng.pick([[4, 5], [3, 4], [2, 3], [5, 6], [3, 5], [5, 8], [7, 9]])
    const T = rng.int(2, 12) * a
    const extra = (T * (b - a)) / a
    if (!Number.isInteger(extra)) continue
    ensure((T * b) / a - T === extra, 'speed ratio mismatch')
    const nm = pickMen(rng, 1)[0]
    return nq(rng, 'speed-distance', `${nm} walks at ${a}/${b} of his usual speed and reaches his office ${extra} minutes late. What is his usual time to reach the office (in minutes)?`, T, [T + extra, extra * 2, (extra * b) / a, T - extra], `New speed = ${a}/${b} of usual ⇒ new time = ${b}/${a} of usual time.\nExtra time = (${b}/${a} − 1) × usual = ${b - a}/${a} × usual = ${extra}.\nUsual time = ${extra} × ${a}/${b - a} = ${T} minutes.`, { post: ' minutes' })
  }
  throw new Reject('speed ratio')
}

function race(rng: Rng): QuestionDraft {
  const nm = pickNames(rng, 2)
  for (let tries = 0; tries < 200; tries++) {
    const vb = rng.pick([4, 5, 8, 10, 20, 25])
    const gap = rng.int(2, 20)
    const lead = vb * gap
    if (lead >= 400 || lead < 10) continue
    const tb = 1000 / vb
    const ta = tb - gap
    if (ta <= 0 || !Number.isInteger(ta)) continue
    ensure(1000 - lead === vb * ta, 'race mismatch')
    return nq(rng, 'speed-distance', `In a 1 km race, ${nm[0]} beats ${nm[1]} by ${lead} metres or by ${gap} seconds. What is the time taken by ${nm[0]} to finish the race (in seconds)?`, ta, [tb, gap, ta + gap * 2, (1000 - lead) / vb + 5], `${nm[1]} covers ${lead} m in ${gap} s ⇒ ${nm[1]}'s speed = ${lead}/${gap} = ${vb} m/s.\n${nm[1]}'s time = 1000/${vb} = ${tb} s.\n${nm[0]}'s time = ${tb} − ${gap} = ${ta} s.`, { post: ' seconds' })
  }
  throw new Reject('race')
}

export const SPEED_TPLS: Tpl[] = [
  { name: 'sd-trainplatform', gen: (r) => trainPlatform(r) },
  { name: 'sd-trains', gen: trainsTwo },
  { name: 'sd-boat', gen: boat },
  { name: 'sd-avgspeed', gen: avgSpeed },
  { name: 'sd-meeting', gen: (r) => meeting(r) },
  { name: 'sd-chase', gen: (r) => chase(r) },
  { name: 'sd-lateearly', d: 'hard', gen: (r) => lateEarly(r) },
  { name: 'sd-speedratio', gen: (r) => speedRatio(r) },
  { name: 'sd-race', d: 'hard', gen: (r) => race(r) },
]

// ============================================================================ MIXTURE & ALLIGATION
function alligation(rng: Rng, d: MockDifficulty): QuestionDraft {
  for (let tries = 0; tries < 300; tries++) {
    const a = rng.int(2, 12) * 10
    const b = a + rng.int(2, 8) * 5
    const c = rng.int(a / 5 + 1, b / 5 - 1) * 5
    if (c <= a || c >= b) continue
    const x = b - c
    const y = c - a
    const g = gcd(x, y)
    if (x / g > 12 || y / g > 12) continue
    const nmA = rng.pick(['tea', 'rice', 'sugar', 'wheat', 'coffee'])
    const form = d === 'hard' ? rng.int(0, 1) : 0
    ensure(x * a + y * b === c * (x + y), 'alligation mismatch')
    if (form === 0) return strQ(rng, { topic: 'mixture-alligation', stem: `In what ratio must ${nmA} costing ${inr(a)} per kg be mixed with ${nmA} costing ${inr(b)} per kg so that the mixture is worth ${inr(c)} per kg?`, correct: ratioStr(x, y), wrong: [ratioStr(y, x), ratioStr(c - a + 1, b - c), ratioStr(b, a), ratioStr(x + 1, y + 1), ratioStr(x, y + 2), ratioStr(x + 2, y)], why: `Alligation: cheaper : dearer = (${b} − ${c}) : (${c} − ${a}) = ${x} : ${y} = ${ratioStr(x, y)}.`, none: 0.12 })
    const qty = (x / g + y / g) * rng.int(2, 8)
    const cheap = (qty * x) / (x + y)
    if (!Number.isInteger(cheap)) continue
    return nq(rng, 'mixture-alligation', `${nmA[0].toUpperCase() + nmA.slice(1)} costing ${inr(a)} per kg is mixed with ${nmA} costing ${inr(b)} per kg to make ${qty} kg of mixture worth ${inr(c)} per kg. How many kg of the cheaper variety is used?`, cheap, [qty - cheap, qty / 2, cheap + 2, (qty * y) / (x + y) + 1], `Cheaper : dearer = ${b} − ${c} : ${c} − ${a} = ${x} : ${y}.\nCheaper = ${qty} × ${x}/${x + y} = ${cheap} kg.`, { post: ' kg' })
  }
  throw new Reject('alligation')
}

function milkWaterAdd(rng: Rng): QuestionDraft {
  for (let tries = 0; tries < 300; tries++) {
    const [a, b] = rng.pick([[3, 2], [4, 1], [5, 3], [3, 1], [7, 3], [2, 1], [5, 2], [4, 3]])
    const k = rng.int(2, 12) * 2
    const milk = a * k
    const water = b * k
    const [p, q] = rng.pick([[3, 4], [2, 3], [1, 1], [3, 5], [1, 2], [2, 5], [4, 5], [3, 2]])
    if (milk * q % p !== 0) continue
    const addWater = (milk * q) / p - water
    if (addWater <= 0 || addWater > 120) continue
    const total = milk + water
    ensure(milk * q === p * (water + addWater), 'milk-water ratio mismatch')
    return nq(rng, 'mixture-alligation', `A ${total} litre mixture contains milk and water in the ratio ${a} : ${b}. How many litres of water must be added to make the ratio of milk to water ${p} : ${q}?`, addWater, [Math.abs(milk - water), addWater + 5, water, (milk * q) / p], `Milk = ${total} × ${a}/${a + b} = ${milk} L; water = ${water} L.\nMilk stays ${milk} L: ${milk} : (${water} + x) = ${p} : ${q} ⇒ ${water} + x = ${(milk * q) / p}.\nx = ${addWater} litres.`, { post: ' litres' })
  }
  throw new Reject('milk water')
}

function replacement(rng: Rng, d: MockDifficulty): QuestionDraft {
  for (let tries = 0; tries < 400; tries++) {
    const x = rng.int(6, 40) * 5
    const y = rng.int(1, Math.floor(x / 10)) * 5
    const times = d === 'hard' ? rng.int(2, 3) : 2
    // milk left = x * ((x-y)/x)^times
    let left = F(x)
    for (let i = 0; i < times; i++) left = fmul(left, F(x - y, x))
    if (!fint(left)) continue
    ensure(feq(left, fdiv(P((x - y) ** times), P(x ** (times - 1)))), 'replacement mismatch')
    const water = x - left.n
    const form = rng.int(0, 1)
    const word = times === 2 ? 'twice' : 'three times'
    const stem = `A vessel contains ${x} litres of pure milk. ${y} litres of milk is taken out and replaced with water. This process is repeated ${word === 'twice' ? 'once more' : 'twice more'}.`
    const why = `Milk left = ${x} × (1 − ${y}/${x})^${times} = ${x} × (${x - y}/${x})^${times} = ${left.n} litres.\nWater = ${x} − ${left.n} = ${water} litres.`
    if (form === 0) return nq(rng, 'mixture-alligation', `${stem} How many litres of milk are there in the vessel finally?`, left, [water, x - y, x - times * y, left.n + 5], why, { post: ' litres' })
    return strQ(rng, { topic: 'mixture-alligation', stem: `${stem} What is the final ratio of milk to water in the vessel?`, correct: ratioStr(left.n, water), wrong: [ratioStr(water, left.n), ratioStr(x - y, y), ratioStr(left.n + 5, water), ratioStr(left.n, water + 5), ratioStr(x, left.n), ratioStr(left.n + 1, water + 1)], why: `${why}\nRatio = ${left.n} : ${water} = ${ratioStr(left.n, water)}.`, none: 0.12 })
  }
  throw new Reject('replacement')
}

function concentration(rng: Rng, d: MockDifficulty): QuestionDraft {
  for (let tries = 0; tries < 400; tries++) {
    const p = rng.pick([10, 15, 20, 25, 30, 40])
    const q = p + rng.pick([10, 15, 20, 25, 30, 40])
    const r = rng.int(p / 5 + 1, q / 5 - 1) * 5
    if (r <= p || r >= q || q > 100) continue
    const x = rng.int(2, 12) * 5
    // y litres of q% to add to x litres of p% for r%:  y = x (r-p)/(q-r)
    const y = fdiv(P(x * (r - p)), P(q - r))
    if (!fint(y) || y.n > 150) continue
    ensure((x * p + y.n * q) * 1 === r * (x + y.n), 'concentration mismatch')
    if (d === 'hard' || rng.chance(0.5)) return nq(rng, 'mixture-alligation', `How many litres of a ${q}% acid solution must be added to ${x} litres of a ${p}% acid solution to obtain a ${r}% acid solution?`, y, [x, y.n + 5, fdiv(P(x * (q - r)), P(r - p)), fval(y) / 2], `Alligation: (${q} − ${r}) : (${r} − ${p}) = ${q - r} : ${r - p} for ${p}% : ${q}% solutions.\n${x} L of ${p}% needs ${x} × ${r - p}/${q - r} = ${y.n} L of ${q}%.`, { post: ' litres' })
    const y2 = rng.int(2, 10) * 5
    const conc = fdiv(P(x * p + y2 * q), P(x + y2))
    if (!terminating(conc, 1)) continue
    return nq(rng, 'mixture-alligation', `${x} litres of a ${p}% acid solution is mixed with ${y2} litres of a ${q}% acid solution. What is the percentage of acid in the mixture?`, conc, [(p + q) / 2, fval(conc) + 3, fval(conc) - 3, (x * p + y2 * q) / 100], `Acid = ${x} × ${p}% + ${y2} × ${q}% = ${(x * p) / 100} + ${(y2 * q) / 100} = ${(x * p + y2 * q) / 100} litres.\nVolume = ${x + y2} litres.\nConcentration = ${pc(conc)}%.`, { post: '%' })
  }
  throw new Reject('concentration')
}

function profitMix(rng: Rng): QuestionDraft {
  for (let tries = 0; tries < 400; tries++) {
    const a = rng.int(6, 16) * 5
    const b = a + rng.int(2, 8) * 5
    const m = rng.int(1, 6)
    const n = rng.int(1, 6)
    if (m === n || gcd(m, n) !== 1) continue
    const cost = fdiv(P(m * a + n * b), P(m + n))
    const pct = rng.pick([10, 20, 25, 12.5, 40, 50])
    const sp = fmul(cost, F(Math.round((100 + pct) * 10), 1000))
    if (!fint(cost) || !fint(sp) || sp.n <= cost.n) continue
    ensure(feq(fdiv(fsub(sp, cost), cost), F(Math.round(pct * 10), 1000)), 'mix profit mismatch')
    if (rng.chance(0.5)) return nq(rng, 'mixture-alligation', `A trader mixes two varieties of rice costing ${inr(a)} per kg and ${inr(b)} per kg in the ratio ${m} : ${n}. At what price per kg should he sell the mixture to earn a profit of ${pct}%?`, sp, [cost, fadd(cost, P(pct)), (a + b) / 2, sp.n + 2], `Cost of mixture = (${m} × ${a} + ${n} × ${b})/${m + n} = ${inr(cost.n)} per kg.\nSP = ${cost.n} × (100 + ${pct})/100 = ${inr(sp.n)} per kg.`, { pre: '₹' })
    return nq(rng, 'mixture-alligation', `Two varieties of rice costing ${inr(a)} per kg and ${inr(b)} per kg are mixed in the ratio ${m} : ${n}. If the mixture is sold at ${inr(sp.n)} per kg, what is the profit percentage?`, F(Math.round(pct * 10), 10), [pct / 2, pct + 5, (sp.n - (a + b) / 2) * 100 / ((a + b) / 2), pct + 10], `Cost price of mixture = (${m} × ${a} + ${n} × ${b})/${m + n} = ${inr(cost.n)} per kg.\nProfit % = (${sp.n} − ${cost.n})/${cost.n} × 100 = ${pc(F(Math.round(pct * 10), 10))}%.`, { post: '%' })
  }
  throw new Reject('profit mix')
}

function twoVessels(rng: Rng): QuestionDraft {
  for (let tries = 0; tries < 300; tries++) {
    const [a1, b1] = rng.pick([[3, 1], [2, 1], [3, 2], [4, 1], [5, 3], [7, 3]])
    const [a2, b2] = rng.pick([[2, 3], [1, 3], [1, 4], [2, 5], [4, 5], [1, 1]])
    const v1 = rng.int(2, 12) * (a1 + b1)
    const v2 = rng.int(2, 12) * (a2 + b2)
    if (v1 === v2 || v1 > 120 || v2 > 120) continue
    const milk = (v1 * a1) / (a1 + b1) + (v2 * a2) / (a2 + b2)
    const water = v1 + v2 - milk
    if (!Number.isInteger(milk) || !Number.isInteger(water)) continue
    const g = gcd(milk, water)
    if (milk / g > 40 || water / g > 40 || milk === water) continue
    if (rng.chance(0.5)) return strQ(rng, { topic: 'mixture-alligation', stem: `Vessel A contains ${v1} litres of a milk and water mixture in the ratio ${a1} : ${b1} and vessel B contains ${v2} litres of a mixture in the ratio ${a2} : ${b2}. If the two mixtures are poured together, what is the ratio of milk to water in the new mixture?`, correct: ratioStr(milk, water), wrong: [ratioStr(water, milk), ratioStr(a1 + a2, b1 + b2), ratioStr(milk + 2, water), ratioStr(milk, water + 4), ratioStr(milk + 5, water + 3), ratioStr(v1, v2)], why: `Milk in A = ${(v1 * a1) / (a1 + b1)} L, water in A = ${(v1 * b1) / (a1 + b1)} L.\nMilk in B = ${(v2 * a2) / (a2 + b2)} L, water in B = ${(v2 * b2) / (a2 + b2)} L.\nTotal milk = ${milk} L, water = ${water} L ⇒ ${ratioStr(milk, water)}.`, none: 0.12 })
    return nq(rng, 'mixture-alligation', `Vessel A contains ${v1} litres of a milk and water mixture in the ratio ${a1} : ${b1} and vessel B contains ${v2} litres of a mixture in the ratio ${a2} : ${b2}. If both are mixed together, how many litres of water are there in the mixture?`, water, [milk, (v1 + v2) / 2, water + 5, (v1 * b1) / (a1 + b1)], `Water in A = ${(v1 * b1) / (a1 + b1)} L; water in B = ${(v2 * b2) / (a2 + b2)} L.\nTotal water = ${water} litres.`, { post: ' litres' })
  }
  throw new Reject('two vessels')
}

function removeAdd(rng: Rng): QuestionDraft {
  for (let tries = 0; tries < 600; tries++) {
    const V = rng.int(4, 16) * 10
    const milkPct = rng.pick([40, 50, 60, 75, 80])
    const out = rng.int(1, 4) * 10
    const addW = rng.pick([0, 10, 20])
    const addM = rng.pick([0, 5, 10, 15, 20])
    if (addW === 0 && addM === 0) continue
    const milk0 = (V * milkPct) / 100
    if (!Number.isInteger(milk0)) continue
    const milkAfter = fmul(P(milk0), F(V - out, V))
    const milk = fadd(milkAfter, P(addM))
    const vol = V - out + addW + addM
    const pct = fdiv(fmul(milk, P(100)), P(vol))
    if (!fint(milkAfter) || !terminating(pct, 1) || vol <= 0 || out >= V) continue
    const water = fsub(P(vol), milk)
    ensure(fint(water) && water.n > 0, 'removeAdd water')
    return nq(rng, 'mixture-alligation', `A mixture of ${V} litres contains ${milkPct}% milk and the rest water. ${out} litres of the mixture is removed and then ${addW ? `${addW} litres of water` : ''}${addW && addM ? ' and ' : ''}${addM ? `${addM} litres of milk` : ''} ${addW && addM ? 'are' : 'is'} added. What is the percentage of milk in the final mixture?`, pct, [milkPct, fval(pct) + 5, fval(pct) - 5, fval(fdiv(fmul(P(milk0), P(100)), P(vol)))], `Milk initially = ${milkPct}% of ${V} = ${milk0} L.\nAfter removing ${out} L, milk = ${milk0} × ${V - out}/${V} = ${pc(milkAfter)} L.\nMilk now = ${pc(milkAfter)} + ${addM} = ${pc(milk)} L; total volume = ${V} − ${out} + ${addW} + ${addM} = ${vol} L.\nMilk % = ${pc(milk)}/${vol} × 100 = ${pc(pct)}%.`, { post: '%' })
  }
  throw new Reject('remove add')
}

function weightedPrice(rng: Rng): QuestionDraft {
  for (let tries = 0; tries < 300; tries++) {
    const a = rng.int(6, 16) * 5
    const b = rng.int(6, 16) * 5
    if (a === b) continue
    const m = rng.int(1, 7)
    const n = rng.int(1, 7)
    if (m === n || gcd(m, n) !== 1) continue
    const mean = fdiv(P(m * a + n * b), P(m + n))
    if (!terminating(mean, 1)) continue
    return nq(rng, 'mixture-alligation', `Two types of wheat costing ${inr(a)} per kg and ${inr(b)} per kg are mixed in the ratio ${m} : ${n}. What is the cost of the mixture per kg?`, mean, [(a + b) / 2, fval(mean) + 2, fval(mean) - 2, (m * a + n * b) / (m * n)], `Cost per kg = (${m} × ${a} + ${n} × ${b})/(${m} + ${n}) = ${m * a + n * b}/${m + n} = ${inr(pc(mean))}.`, { pre: '₹' })
  }
  throw new Reject('weighted price')
}

function alloys(rng: Rng): QuestionDraft {
  for (let tries = 0; tries < 400; tries++) {
    const [c1, z1] = rng.pick([[3, 2], [2, 3], [1, 4], [4, 1], [3, 5], [5, 3], [7, 3]])
    const [c2, z2] = rng.pick([[1, 1], [2, 1], [1, 2], [3, 1], [3, 2], [2, 3]])
    const m = rng.int(1, 4) * (c1 + z1)
    const n = rng.int(1, 4) * (c2 + z2)
    if (m === n) continue
    const cu = fadd(fmul(P(m), F(c1, c1 + z1)), fmul(P(n), F(c2, c2 + z2)))
    const zn = fsub(P(m + n), cu)
    if (!fint(cu) || !fint(zn) || cu.n === zn.n) continue
    const g = gcd(cu.n, zn.n)
    if (cu.n / g > 40 || zn.n / g > 40) continue
    return strQ(rng, { topic: 'mixture-alligation', stem: `Two alloys contain copper and zinc in the ratios ${c1} : ${z1} and ${c2} : ${z2}. ${m} kg of the first alloy and ${n} kg of the second alloy are melted together. What is the ratio of copper to zinc in the new alloy?`, correct: ratioStr(cu.n, zn.n), wrong: [ratioStr(zn.n, cu.n), ratioStr(c1 + c2, z1 + z2), ratioStr(cu.n + 2, zn.n), ratioStr(cu.n, zn.n + 3), ratioStr(m, n), ratioStr(cu.n + 4, zn.n - 1 > 0 ? zn.n - 1 : zn.n + 2)], why: `Copper in first = ${m} × ${c1}/${c1 + z1} = ${pc(fmul(P(m), F(c1, c1 + z1)))} kg; in second = ${n} × ${c2}/${c2 + z2} = ${pc(fmul(P(n), F(c2, c2 + z2)))} kg.\nTotal copper = ${cu.n} kg; zinc = ${m + n} − ${cu.n} = ${zn.n} kg.\nRatio = ${ratioStr(cu.n, zn.n)}.`, none: 0.12 })
  }
  throw new Reject('alloys')
}

export const MIXTURE_TPLS: Tpl[] = [
  { name: 'mx-alligation', gen: alligation },
  { name: 'mx-milkwater', gen: (r) => milkWaterAdd(r) },
  { name: 'mx-replacement', gen: replacement },
  { name: 'mx-concentration', gen: concentration },
  { name: 'mx-profitmix', gen: (r) => profitMix(r) },
  { name: 'mx-twovessels', gen: (r) => twoVessels(r) },
  { name: 'mx-removeadd', d: 'hard', gen: (r) => removeAdd(r) },
  { name: 'mx-weightedprice', d: 'medium', gen: (r) => weightedPrice(r) },
  { name: 'mx-alloys', d: 'hard', gen: (r) => alloys(r) },
]

export function genInterest(rng: Rng, d: MockDifficulty, count: number): Group[] {
  return genSingles(rng, d, count, INTEREST_TPLS)
}
export function genTimeWork(rng: Rng, d: MockDifficulty, count: number): Group[] {
  return genSingles(rng, d, count, TIMEWORK_TPLS)
}
export function genSpeedDistance(rng: Rng, d: MockDifficulty, count: number): Group[] {
  return genSingles(rng, d, count, SPEED_TPLS)
}
export function genMixture(rng: Rng, d: MockDifficulty, count: number): Group[] {
  return genSingles(rng, d, count, MIXTURE_TPLS)
}
