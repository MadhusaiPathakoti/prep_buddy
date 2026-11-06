// SBI PO Mains-level word-problem generators for Time & Work, Speed-Distance, Mixture & Alligation,
// Mensuration and Probability / P&C.  Every template chains 2-4 concepts, is designed backwards from clean
// numbers, and is cross-checked inside the generator by a second, independent method (`ensure`).
// Each returned question is also registered in MAINS_B_META (template name + raw parameters) so the
// verification script can recompute the key from scratch.
import type { Rng } from '../../rng'
import type { Group, MockDifficulty, QuantTopicId, QuestionDraft, TopicGenerator } from '../../types'
import { F, Reject, choose, decStr, ensure, fact, fadd, fcmp, fdiv, feq, fint, fmul, fsub, fval, gcd, genSingles, inr, lcm, need, nq, pickMen, ratioStr, rstep, strQ, terminating } from '../util'
import type { Frac, Tpl } from '../util'

const P = (n: number): Frac => F(n)
/** Exact decimal (<= 2 places) when the value terminates, otherwise the fraction n/d. */
const S = (f: Frac): string => (terminating(f, 2) ? decStr(f, 2) : `${f.n}/${f.d}`)
const lcmAll = (xs: number[]): number => xs.reduce((a, b) => lcm(a, b), 1)
const sum = (xs: number[]): number => xs.reduce((a, b) => a + b, 0)
const fnum = (f: Frac): number => fval(f)
const PI = F(22, 7)

export interface MainsBMeta {
  tpl: string
  p: Record<string, unknown>
}
/** Template name + raw parameters of every question produced here (used only by the verification script). */
export const MAINS_B_META = new WeakMap<object, MainsBMeta>()
function tag(q: QuestionDraft, tpl: string, p: Record<string, unknown>): QuestionDraft {
  MAINS_B_META.set(q, { tpl, p })
  return q
}
const NONE = 0.05
const fracOf = (f: Frac): string => `${f.n}/${f.d}`

// ============================================================================ TIME & WORK
const DAYS = [6, 8, 9, 10, 12, 15, 18, 20, 24, 30, 36, 40, 45, 60]
const TW = 'time-work' as const

/** Three workers take turns, one per day, in a shuffled order. */
function twAlternate(rng: Rng): QuestionDraft {
  const d = rng.sample(DAYS, 3)
  const L = lcmAll(d)
  need(L <= 360, 'lcm')
  const u = d.map((x) => L / x)
  const ord = rng.shuffle([0, 1, 2])
  const nm = pickMen(rng, 3)
  const seq = ord.map((i) => u[i])
  const cycle = sum(seq)
  // method 1: day-by-day exact simulation
  let done = 0
  let day = 0
  let t1 = F(0)
  for (;;) {
    const w = seq[day % 3]
    if (done + w >= L) {
      t1 = fadd(P(day), F(L - done, w))
      break
    }
    done += w
    day++
    need(day < 90, 'too long')
  }
  // method 2: full cycles + remainder walk
  const k = Math.ceil(L / cycle) - 1
  need(k >= 2, 'too few cycles')
  let rem = L - k * cycle
  let t2 = F(3 * k)
  const walk: string[] = []
  for (let i = 0; i < 3; i++) {
    if (rem <= seq[i]) {
      t2 = fadd(t2, fadd(P(i), F(rem, seq[i])))
      walk.push(`Day ${3 * k + i + 1}: ${nm[ord[i]]} needs only ${rem} of his ${seq[i]} units, i.e. ${S(F(rem, seq[i]))} of a day.`)
      break
    }
    walk.push(`Day ${3 * k + i + 1}: ${nm[ord[i]]} does ${seq[i]} units; ${rem - seq[i]} units remain.`)
    rem -= seq[i]
  }
  ensure(feq(t1, t2), 'alternate-days: simulation and cycle method disagree')
  need(terminating(t1, 2), 'unclean time')
  const T = fnum(t1)
  const why = [
    `Total work = LCM(${d.join(', ')}) = ${L} units.`,
    `Efficiency per day: ${nm.map((n, i) => `${n} = ${L}/${d[i]} = ${u[i]}`).join(', ')}.`,
    `One cycle (${ord.map((i) => nm[i]).join(', ')}) = ${seq.join(' + ')} = ${cycle} units in 3 days.`,
    `${k} full cycles = ${3 * k} days ⇒ ${k * cycle} units done, ${L - k * cycle} units left.`,
    ...walk,
    `Total time = ${S(t1)} days.`,
  ].join('\n')
  const stem = `${nm[0]}, ${nm[1]} and ${nm[2]} can complete a piece of work alone in ${d[0]}, ${d[1]} and ${d[2]} days respectively. They work in turns, one person each day, in the order ${ord.map((i) => nm[i]).join(', ')}, and this cycle keeps repeating. In how many days will the work be completed?`
  const q = nq(rng, TW, stem, t1, [F(3 * L, cycle), Math.ceil(T), 3 * k + 3, Math.floor(T), T + 1], why, { post: ' days', none: NONE })
  return tag(q, 'tw-alternate', { d, ord })
}

/** Three workers start together; two of them leave before the end. */
function twLeave(rng: Rng): QuestionDraft {
  const d = rng.sample(DAYS, 3)
  const L = lcmAll(d)
  need(L <= 240, 'lcm')
  const u = d.map((x) => L / x)
  const nm = pickMen(rng, 3)
  const xa = rng.int(1, 6)
  const xb = rng.int(1, 6)
  need(xa !== xb, 'same leave time')
  const s = sum(u)
  const T = F(L + xa * u[0] + xb * u[1], s)
  need(T.d <= 2 && fnum(T) >= Math.max(xa, xb) + 2, 'unclean T')
  const found: number[] = []
  for (let h = 2; h <= 400; h++) {
    const t = h / 2
    const w = t * u[2] + Math.max(0, t - xa) * u[0] + Math.max(0, t - xb) * u[1]
    if (Math.abs(w - L) < 1e-9) found.push(t)
  }
  ensure(found.length === 1 && found[0] === fnum(T), 'leave-midway: brute-force search disagrees')
  const ask = rng.int(0, 1)
  const Tn = fnum(T)
  const why = [
    `Total work = LCM(${d.join(', ')}) = ${L} units; efficiencies: ${nm.map((n, i) => `${n} = ${u[i]}`).join(', ')}.`,
    `Let the work finish in T days: ${nm[2]} works all T days, ${nm[0]} works (T − ${xa}) days and ${nm[1]} works (T − ${xb}) days.`,
    `${u[2]}T + ${u[0]}(T − ${xa}) + ${u[1]}(T − ${xb}) = ${L}`,
    `${s}T = ${L} + ${u[0] * xa} + ${u[1] * xb} = ${L + u[0] * xa + u[1] * xb} ⇒ T = ${S(T)} days.`,
    ask === 0 ? `So the work is completed in ${S(T)} days.` : `${nm[1]} worked for T − ${xb} = ${S(fsub(T, P(xb)))} days.`,
  ].join('\n')
  const stem =
    `${nm[0]}, ${nm[1]} and ${nm[2]} can complete a work in ${d[0]}, ${d[1]} and ${d[2]} days respectively. They start the work together, but ${nm[0]} leaves ${xa} day${xa > 1 ? 's' : ''} before the work is finished and ${nm[1]} leaves ${xb} day${xb > 1 ? 's' : ''} before it is finished, while ${nm[2]} works till the end. ` +
    (ask === 0 ? 'In how many days was the whole work completed?' : `For how many days did ${nm[1]} work?`)
  const ans = ask === 0 ? T : fsub(T, P(xb))
  const wrong = ask === 0 ? [F(L, s), Tn - xa, Tn + xb, F(L + xa * u[0], s), Tn - 1] : [Tn, Tn - xa, Tn - xb - 1, Tn - xb + 1]
  const q = nq(rng, TW, stem, ans, wrong, why, { post: ' days', none: NONE })
  return tag(q, 'tw-leave', { d, xa, xb, ask })
}

/** Pair-times -> individual rates; one worker leaves; wages in proportion to work. */
let WAGE_TRIPLES: { L: number; u: number[] }[] | null = null
/** (L; efficiencies) with every individual and every pairwise time an integer number of days (computed once, no randomness). */
function wageTriples(): { L: number; u: number[] }[] {
  if (WAGE_TRIPLES) return WAGE_TRIPLES
  const out: { L: number; u: number[] }[] = []
  for (const L of [24, 30, 36, 40, 48, 60, 72, 80, 90, 96, 120, 144, 180, 240, 360]) {
    const divs: number[] = []
    for (let x = 1; x <= L; x++) if (L % x === 0 && L / x >= 6 && L / x <= 90) divs.push(x)
    for (const a of divs) for (const b of divs) for (const c of divs) {
      if (!(a < b && b < c)) continue
      if ([a + b, b + c, a + c].every((x) => L % x === 0 && L / x >= 4)) out.push({ L, u: [a, b, c] })
    }
  }
  WAGE_TRIPLES = out
  return out
}

function twWages(rng: Rng): QuestionDraft {
  const pickT = rng.pick(wageTriples())
  const L = pickT.L
  const u = rng.shuffle(pickT.u)
  const pu = [u[0] + u[1], u[1] + u[2], u[0] + u[2]] // AB, BC, AC
  need(pu.every((x) => L % x === 0), 'pair days not integral')
  const pd = pu.map((x) => L / x)
  need(pd.every((x) => x >= 4), 'pair too fast')
  const s = sum(u)
  const nm = pickMen(rng, 3)
  const leaver = rng.int(0, 2)
  const asked = rng.int(0, 2)
  const full = F(L, s)
  const tMax = Math.ceil(fnum(full)) - 1
  need(tMax >= 2, 'too short')
  const t = rng.int(2, tMax)
  const rem = F(L - t * s, s - u[leaver])
  need(rem.n > 0, 'finished early')
  const Ttot = fadd(P(t), rem)
  const work = u.map((x, i) => (i === leaver ? F(t * x, L) : fdiv(fmul(Ttot, P(x)), P(L))))
  const tot = work.reduce(fadd, F(0))
  ensure(feq(tot, F(1)), 'wages: individual works do not add up to the whole')
  // second method: recover individual efficiencies from the pair data
  const L2 = lcmAll(pd)
  const [ab, bc, ac] = pd.map((x) => L2 / x)
  const half = F(ab + bc + ac, 2)
  const rec = [fsub(half, P(bc)), fsub(half, P(ac)), fsub(half, P(ab))]
  rec.forEach((r, i) => ensure(feq(fdiv(r, P(L2)), F(u[i], L)), 'wages: recovered rate differs'))
  const wq = work[asked]
  const W = rstep(rng, 2000, 60000, lcm(wq.d, 100)) // W must be a multiple of the denominator of the work share
  const share = fmul(P(W), wq)
  need(fint(share), 'share not integral')
  const allShares = work.map((x) => fmul(P(W), x))
  ensure(feq(allShares.reduce(fadd, F(0)), P(W)), 'wages do not add to total')
  const mistakeSum = fdiv(fmul(P(W), P(u[asked])), P(s))
  const stem =
    `${nm[0]} and ${nm[1]} together can finish a job in ${pd[0]} days, ${nm[1]} and ${nm[2]} together in ${pd[1]} days, and ${nm[0]} and ${nm[2]} together in ${pd[2]} days. All three start the job together, but after ${t} days ${nm[leaver]} leaves and the other two complete the job. If the total wages of ${inr(W)} are divided in proportion to the work done by each, how much does ${nm[asked]} get?`
  const why = [
    `In 1 day: ${nm[0]}+${nm[1]} = 1/${pd[0]}, ${nm[1]}+${nm[2]} = 1/${pd[1]}, ${nm[0]}+${nm[2]} = 1/${pd[2]}.`,
    `Take total work = LCM(${pd.join(', ')}) = ${L2} units: pair efficiencies = ${ab}, ${bc}, ${ac}.`,
    `Sum of all three = (${ab} + ${bc} + ${ac})/2 = ${S(half)} units/day, so ${nm[0]} = ${S(rec[0])}, ${nm[1]} = ${S(rec[1])}, ${nm[2]} = ${S(rec[2])} units/day.`,
    `All three together do ${S(fmul(half, P(t)))} units in ${t} days; ${S(fsub(P(L2), fmul(half, P(t))))} units remain for the two who stay (${S(fsub(half, rec[leaver]))} units/day) ⇒ ${S(rem)} more days.`,
    `${nm[leaver]} works ${t} days; the others work ${S(Ttot)} days each.`,
    `Work done by ${nm[asked]} = ${S(fmul(wq, P(L2)))} units, i.e. ${fracOf(wq)} of the whole job.`,
    `Wage of ${nm[asked]} = ${inr(W)} × ${fracOf(wq)} = ${inr(share.n)}.`,
  ].join('\n')
  const daysAsked = asked === leaver ? P(t) : Ttot
  const daysShare = fdiv(fmul(P(W), daysAsked), fadd(P(t), fmul(P(2), Ttot)))
  const q = nq(rng, TW, stem, share, [mistakeSum, F(W, 3), daysShare, fadd(share, P(Math.round(W / 20)))], why, { pre: '₹', none: NONE })
  return tag(q, 'tw-wages', { pd, t, leaver, asked, W })
}

/** Efficiency chain ("p% more efficient", "q% less efficient") with a mid-way replacement. */
function twEfficiency(rng: Rng): QuestionDraft {
  const ec = rng.pick([20, 25, 30, 40, 50, 60, 80, 100])
  const q = rng.pick([10, 20, 25, 30, 40, 50])
  const p = rng.pick([20, 25, 40, 50, 60, 75, 100])
  const eb = (ec * (100 - q)) / 100
  need(Number.isInteger(eb), 'eb')
  const ea = (eb * (100 + p)) / 100
  need(Number.isInteger(ea), 'ea')
  const nm = pickMen(rng, 3)
  const dC = rng.pick([12, 15, 16, 18, 20, 24, 25, 30, 36, 40])
  const W = ec * dC
  const m = rng.int(2, 8)
  need(W - m * (ea + eb) > 0, 'finished before swap')
  const rem = F(W - m * (ea + eb), eb + ec)
  need(rem.d <= 2 && fnum(rem) >= 2, 'unclean rem')
  // second method: day-by-day
  let done = P(0)
  for (let i = 0; i < m; i++) done = fadd(done, P(ea + eb))
  let days = F(0)
  while (fcmp(done, P(W)) < 0) {
    const need1 = fsub(P(W), done)
    const perDay = P(eb + ec)
    if (fcmp(need1, perDay) <= 0) {
      days = fadd(days, fdiv(need1, perDay))
      done = P(W)
    } else {
      days = fadd(days, P(1))
      done = fadd(done, perDay)
    }
  }
  ensure(feq(days, rem), 'efficiency chain: day-by-day disagrees')
  const total = fadd(P(m), rem)
  const ask = rng.int(0, 1)
  const wrongRem = [F(W - m * (ea + eb), ea + eb), F(W - m * (ea + eb), ea + eb + ec), F(W - m * (ea + eb), ea + ec), F(W - m * ea, eb + ec)]
  const why = [
    `Let ${nm[2]}'s efficiency = ${ec}. ${nm[1]} is ${q}% less efficient ⇒ ${nm[1]} = ${ec} × ${100 - q}/100 = ${eb}.`,
    `${nm[0]} is ${p}% more efficient than ${nm[1]} ⇒ ${nm[0]} = ${eb} × ${100 + p}/100 = ${ea}.`,
    `Total work = ${nm[2]}'s rate × days = ${ec} × ${dC} = ${W} units.`,
    `${nm[0]} and ${nm[1]} work ${m} days: ${m} × (${ea} + ${eb}) = ${m * (ea + eb)} units; remaining = ${W - m * (ea + eb)} units.`,
    `Now ${nm[1]} and ${nm[2]} work: ${eb} + ${ec} = ${eb + ec} units/day ⇒ ${W - m * (ea + eb)}/${eb + ec} = ${S(rem)} days.`,
    ask === 0 ? `Remaining time = ${S(rem)} days.` : `Total time = ${m} + ${S(rem)} = ${S(total)} days.`,
  ].join('\n')
  const stem = `${nm[0]} is ${p}% more efficient than ${nm[1]}, and ${nm[1]} is ${q}% less efficient than ${nm[2]}. ${nm[2]} alone can finish a work in ${dC} days. ${nm[0]} and ${nm[1]} start the work together and after ${m} days ${nm[0]} is replaced by ${nm[2]}. ${ask === 0 ? 'In how many more days will the remaining work be finished?' : 'In how many days in total will the work be finished?'}`
  const wrongs = ask === 0 ? wrongRem : wrongRem.map((x) => fadd(x, P(m)))
  const qq = nq(rng, TW, stem, ask === 0 ? rem : total, [...wrongs, ask === 0 ? total : rem], why, { post: ' days', none: NONE })
  return tag(qq, 'tw-efficiency', { ec, q, p, dC, m, ask })
}

const HRS = [4, 5, 6, 8, 9, 10, 12, 15, 18, 20, 24, 30]
/** Two filling pipes and a leak; a pipe closed / leak plugged after some hours; tank may start part-full. */
function twPipesLeak(rng: Rng): QuestionDraft {
  const [a, b] = rng.sample(HRS, 2)
  const c = rng.pick(HRS)
  const L = lcmAll([a, b, c])
  need(L <= 360, 'lcm')
  const uA = L / a
  const uB = L / b
  const uC = L / c
  const f0 = rng.pick([F(0), F(1, 4), F(1, 5), F(1, 6), F(1, 3)])
  const v0 = fmul(P(L), f0)
  need(fint(v0), 'start volume')
  const n1 = uA + uB - uC
  need(n1 > 0, 'never fills')
  const variant = rng.int(0, 2) // 0 leak plugged, 1 B closed, 2 A closed
  const n2 = variant === 0 ? uA + uB : variant === 1 ? uA - uC : uB - uC
  need(n2 > 0, 'stalls in phase 2')
  const t = rng.int(1, 6)
  const v1 = fadd(v0, P(n1 * t))
  need(fcmp(v1, P(L)) < 0, 'filled in phase 1')
  const more = fdiv(fsub(P(L), v1), P(n2))
  need(terminating(more, 2) && fnum(more) >= 1, 'unclean more')
  // second method: forward piecewise volume at T = t + more must equal capacity exactly
  const T = fadd(P(t), more)
  const vol = fadd(fadd(v0, fmul(P(n1), P(t))), fmul(P(n2), fsub(T, P(t))))
  ensure(feq(vol, P(L)), 'pipes+leak: forward volume check failed')
  const ask = rng.int(0, 1)
  const closed = variant === 0 ? 'the leak is plugged' : variant === 1 ? 'pipe B is closed' : 'pipe A is closed'
  const startTxt = f0.n === 0 ? 'an empty tank' : `a tank that is already ${f0.n}/${f0.d} full`
  const stem = `Pipes A and B can fill a tank in ${a} hours and ${b} hours respectively, and a leak at the bottom can empty the full tank in ${c} hours. All three are working on ${startTxt}. After ${t} hour${t > 1 ? 's' : ''}, ${closed}. ${ask === 0 ? 'How many more hours are needed to fill the tank completely?' : 'In how many hours in total is the tank filled completely?'}`
  const why = [
    `Capacity = LCM(${a}, ${b}, ${c}) = ${L} units: A = +${uA}/h, B = +${uB}/h, leak = −${uC}/h.`,
    `First ${t} h (all working): net = ${uA} + ${uB} − ${uC} = ${n1}/h ⇒ ${t * n1} units${f0.n === 0 ? '' : ` added to the initial ${S(v0)}`} = ${S(v1)} units.`,
    `Remaining = ${L} − ${S(v1)} = ${S(fsub(P(L), v1))} units.`,
    `After that net = ${variant === 0 ? `${uA} + ${uB}` : variant === 1 ? `${uA} − ${uC}` : `${uB} − ${uC}`} = ${n2}/h ⇒ ${S(fsub(P(L), v1))}/${n2} = ${S(more)} hours.`,
    ask === 0 ? `More time = ${S(more)} hours.` : `Total = ${t} + ${S(more)} = ${S(T)} hours.`,
  ].join('\n')
  const wrongMore = [fdiv(fsub(P(L), v1), P(n1)), fdiv(fsub(P(L), v0), P(n1)), fdiv(fsub(P(L), fmul(P(uA + uB), P(t))), P(n2)), fdiv(P(L), P(n2))]
  const qq = nq(rng, TW, stem, ask === 0 ? more : T, ask === 0 ? [...wrongMore, T] : [...wrongMore.map((x) => fadd(x, P(t))), more], why, { post: ' hours', none: NONE })
  return tag(qq, 'tw-pipes-leak', { a, b, c, f0: [f0.n, f0.d], t, variant, ask })
}

/** Pipes opened one at a time for an hour each in rotation. */
function twPipesRotate(rng: Rng): QuestionDraft {
  const [a, b] = rng.sample(HRS, 2)
  const c = rng.pick(HRS)
  const L = lcmAll([a, b, c])
  need(L <= 240, 'lcm')
  const r = [L / a, L / b, -(L / c)]
  const ord = rng.shuffle([0, 1, 2])
  const seq = ord.map((i) => r[i])
  need(seq[0] > 0, 'starts with emptying')
  const net = sum(seq)
  need(net > 0, 'never fills')
  let pre = 0
  let maxPre = -Infinity
  for (let i = 0; i < 3; i++) {
    pre += seq[i]
    need(pre >= 0, 'would empty below zero')
    maxPre = Math.max(maxPre, pre)
  }
  // method 1: hour-by-hour simulation
  let vol = 0
  let h = 0
  let t1 = F(0)
  for (;;) {
    const rate = seq[h % 3]
    if (rate > 0 && vol + rate >= L) {
      t1 = fadd(P(h), F(L - vol, rate))
      break
    }
    vol += rate
    h++
    need(h < 120, 'too long')
  }
  // method 2: closed form using the best prefix of a cycle
  const k = Math.max(0, Math.ceil((L - maxPre) / net))
  let v2 = k * net
  let t2 = F(0)
  for (let i = 0; i < 3; i++) {
    if (seq[i] > 0 && v2 + seq[i] >= L) {
      t2 = fadd(P(3 * k + i), F(L - v2, seq[i]))
      break
    }
    v2 += seq[i]
  }
  ensure(feq(t1, t2), 'rotating pipes: methods disagree')
  need(terminating(t1, 2) && fnum(t1) >= 6, 'unclean')
  const T = fnum(t1)
  const nameP = ['A', 'B', 'C']
  const stem = `Pipes A and B can fill an empty tank in ${a} hours and ${b} hours respectively, while pipe C can empty a full tank in ${c} hours. The pipes are opened one at a time for one hour each in the order ${ord.map((i) => nameP[i]).join(', ')}, ${nameP[ord[0]]}, ${nameP[ord[1]]}, ${nameP[ord[2]]}, ... and so on. After how many hours will the tank be full?`
  const why = [
    `Capacity = LCM(${a}, ${b}, ${c}) = ${L} units: A = +${r[0]}, B = +${r[1]}, C = −${-r[2]} units per hour.`,
    `One 3-hour cycle (${ord.map((i) => nameP[i]).join(', ')}) adds ${seq.map((x) => (x < 0 ? `(−${-x})` : x)).join(' + ')} = ${net} units; the best level reached inside a cycle is ${maxPre} units above its start.`,
    `The tank fills in cycle ${k + 1}: after ${k} full cycles (${3 * k} hours) there are ${k * net} units.`,
    `Then hour by hour: the level reaches ${L} units after ${S(fsub(t1, P(3 * k)))} more hours.`,
    `Total = ${3 * k} + ${S(fsub(t1, P(3 * k)))} = ${S(t1)} hours.`,
  ].join('\n')
  const q = nq(rng, TW, stem, t1, [F(3 * L, net), Math.ceil(T), Math.floor(T), Math.round((3 * L) / net) + 1, T + 1], why, { post: ' hours', none: NONE })
  return tag(q, 'tw-pipes-rotate', { a, b, c, ord })
}

/** Men/women efficiency ratio, then the workforce changes mid-way. */
function twMenWomen(rng: Rng): QuestionDraft {
  const [rM, rW] = rng.pick([[5, 3], [3, 2], [4, 3], [5, 4], [3, 1], [7, 4]]) // work per man-day, per woman-day
  const A = rng.int(6, 18)
  const B = rng.int(6, 20)
  const D = rng.int(12, 30)
  const Wk = (A * rM + B * rW) * D
  const t = rng.int(4, 10)
  const x = rng.int(1, A - 3)
  const y = rng.int(2, 8)
  const r1 = A * rM + B * rW
  const r2 = (A - x) * rM + (B + y) * rW
  const left = Wk - t * r1
  need(left > 0, 'done early')
  const rem = F(left, r2)
  need(rem.d <= 2 && fnum(rem) >= 2, 'unclean')
  // second method: day-by-day exact
  let done = P(0)
  for (let i = 0; i < t; i++) done = fadd(done, P(r1))
  let days = F(0)
  while (fcmp(done, P(Wk)) < 0) {
    const need1 = fsub(P(Wk), done)
    if (fcmp(need1, P(r2)) <= 0) {
      days = fadd(days, fdiv(need1, P(r2)))
      done = P(Wk)
    } else {
      days = fadd(days, P(1))
      done = fadd(done, P(r2))
    }
  }
  ensure(feq(days, rem), 'men-women: day-by-day disagrees')
  const ask = rng.int(0, 1)
  const ans = ask === 0 ? rem : fadd(P(t), rem)
  const rev1 = A * rW + B * rM
  const rev2 = (A - x) * rW + (B + y) * rM
  const wrongRem = [F(Wk - t * rev1, rev2), F(left, r1), F(Wk - t * A * rM - t * B * rW, A * rM + (B + y) * rW), F(Wk - t * r1, (A - x) * rM + B * rW)]
  const wrongs = ask === 0 ? [...wrongRem, F(D - t)] : [...wrongRem.map((w) => fadd(w, P(t))), P(D)]
  const stem2 = `The daily work of ${rW} ${rW === 1 ? 'man' : 'men'} equals the daily work of ${rM} women. ${A} men and ${B} women together can complete a job in ${D} days. They start the job together, but after ${t} days ${x} men leave and ${y} more women join. ${ask === 0 ? 'In how many more days will the remaining job be completed?' : 'In how many days in total will the job be completed?'}`
  const why = [
    `${rW} ${rW === 1 ? 'man' : 'men'} = ${rM} women (daily work) ⇒ 1 man : 1 woman = ${rM} : ${rW}. Take 1 man = ${rM} units/day and 1 woman = ${rW} unit${rW > 1 ? 's' : ''}/day.`,
    `Daily work of the initial group = ${A} × ${rM} + ${B} × ${rW} = ${r1} units; total job = ${r1} × ${D} = ${Wk} units.`,
    `In ${t} days: ${t} × ${r1} = ${t * r1} units; remaining = ${left} units.`,
    `New group = ${A - x} men + ${B + y} women = ${A - x} × ${rM} + ${B + y} × ${rW} = ${r2} units/day.`,
    `Remaining days = ${left}/${r2} = ${S(rem)}${ask === 0 ? '' : `; total = ${t} + ${S(rem)} = ${S(fadd(P(t), rem))}`} days.`,
  ].join('\n')
  const q = nq(rng, TW, stem2, ans, wrongs, why, { post: ' days', none: NONE })
  return tag(q, 'tw-menwomen', { rM, rW, A, B, D, t, x, y, ask })
}

export const TW_TPLS: Tpl[] = [
  { name: 'tw-alternate', gen: (r) => twAlternate(r) },
  { name: 'tw-leave', gen: (r) => twLeave(r) },
  { name: 'tw-wages', gen: (r) => twWages(r) },
  { name: 'tw-efficiency', gen: (r) => twEfficiency(r) },
  { name: 'tw-pipes-leak', gen: (r) => twPipesLeak(r) },
  { name: 'tw-pipes-rotate', gen: (r) => twPipesRotate(r) },
  { name: 'tw-menwomen', gen: (r) => twMenWomen(r) },
]

// ============================================================================ SPEED, DISTANCE & TIME
const SD = 'speed-distance' as const
const KMH_M = F(5, 18) // km/h -> m/s

/** Boat round trip: total time and the up:down time ratio give both speeds. */
function sdBoatRatio(rng: Rng): QuestionDraft {
  const s = rng.int(2, 8)
  const b = rng.int(s + 3, 20)
  const up = b - s
  const dn = b + s
  const D = lcm(up, dn) * rng.int(1, 3)
  need(D >= 40 && D <= 600, 'distance range')
  const T = fadd(F(D, up), F(D, dn))
  const g = gcd(up, dn)
  const rU = dn / g // time upstream : time downstream = down speed : up speed
  const rD = up / g
  need(rU !== rD, 'degenerate')
  // solver path: split the total time in the given ratio
  const tDn = fdiv(fmul(T, P(rD)), P(rU + rD))
  const tUp = fdiv(fmul(T, P(rU)), P(rU + rD))
  const downS = fdiv(P(D), tDn)
  const upS = fdiv(P(D), tUp)
  const stream = fdiv(fsub(downS, upS), P(2))
  const boat = fdiv(fadd(downS, upS), P(2))
  ensure(feq(stream, P(s)) && feq(boat, P(b)), 'boat ratio: recovered speeds differ')
  const ask = rng.int(0, 2)
  let ans: Frac
  let wrong: (number | Frac)[]
  let tail: string
  const avg = fdiv(P(2 * D), T)
  if (ask === 0) {
    ans = P(s)
    tail = 'What is the speed of the stream?'
    wrong = [P(b), downS.n, upS.n, fsub(downS, upS), avg]
  } else if (ask === 1) {
    ans = P(b)
    tail = 'What is the speed of the boat in still water?'
    wrong = [P(s), downS.n, upS.n, avg, fadd(P(b), P(s))]
  } else {
    ans = F(2 * D, b)
    need(terminating(ans, 2), 'unclean')
    tail = `How many hours will the boat take to cover ${2 * D} km in still water?`
    wrong = [fdiv(P(2 * D), P(up)), fdiv(P(2 * D), P(dn)), T, fdiv(P(2 * D), avg)]
  }
  const why = [
    `Upstream time : downstream time = ${rU} : ${rD}, total ${S(T)} h ⇒ upstream time = ${S(tUp)} h, downstream time = ${S(tDn)} h.`,
    `Downstream speed = ${D}/${S(tDn)} = ${S(downS)} km/h; upstream speed = ${D}/${S(tUp)} = ${S(upS)} km/h.`,
    `Boat in still water = (${S(downS)} + ${S(upS)})/2 = ${b} km/h; stream = (${S(downS)} − ${S(upS)})/2 = ${s} km/h.`,
    ask === 2 ? `Time in still water = ${2 * D}/${b} = ${S(ans)} hours.` : `Required value = ${S(ans)}${ask === 0 ? ' km/h' : ' km/h'}.`,
  ].join('\n')
  const stem = `A boat takes ${S(T)} hours to go ${D} km downstream and come back to the starting point. The time taken upstream is to the time taken downstream as ${rU} : ${rD}. ${tail}`
  const q = nq(rng, SD, stem, ans, wrong, why, { post: ask === 2 ? ' hours' : ' km/h', none: NONE })
  return tag(q, 'sd-boat-ratio', { s, b, D, ask })
}

/** Two boat journeys give two simultaneous equations in 1/(upstream) and 1/(downstream). */
function sdBoatSystem(rng: Rng): QuestionDraft {
  const s = rng.int(2, 8)
  const b = rng.int(s + 3, 18)
  const up = b - s
  const dn = b + s
  const x1 = up * rng.int(2, 9)
  const y1 = dn * rng.int(2, 9)
  const x2 = up * rng.int(2, 9)
  const y2 = dn * rng.int(2, 9)
  const det = x1 * y2 - x2 * y1
  need(det !== 0, 'singular')
  const T1 = fadd(F(x1, up), F(y1, dn))
  const T2 = fadd(F(x2, up), F(y2, dn))
  need(terminating(T1, 2) && terminating(T2, 2), 'unclean times')
  // Cramer's rule for p = 1/up, q = 1/dn
  const pN = fdiv(fsub(fmul(T1, P(y2)), fmul(T2, P(y1))), P(det))
  const qN = fdiv(fsub(fmul(P(x1), T2), fmul(P(x2), T1)), P(det))
  const upS = fdiv(P(1), pN)
  const dnS = fdiv(P(1), qN)
  ensure(feq(upS, P(up)) && feq(dnS, P(dn)), 'boat system: Cramer solution differs')
  const ask = rng.int(0, 1)
  const ans = ask === 0 ? P(s) : P(b)
  const why = [
    `Let upstream speed = u and downstream speed = v (km/h). Time = distance/speed.`,
    `${x1}/u + ${y1}/v = ${S(T1)} and ${x2}/u + ${y2}/v = ${S(T2)}.`,
    `Put 1/u = p, 1/v = q: ${x1}p + ${y1}q = ${S(T1)}, ${x2}p + ${y2}q = ${S(T2)}.`,
    `Solving: p = 1/${up}, q = 1/${dn} ⇒ u = ${up} km/h, v = ${dn} km/h.`,
    ask === 0 ? `Speed of stream = (v − u)/2 = (${dn} − ${up})/2 = ${s} km/h.` : `Speed in still water = (v + u)/2 = (${dn} + ${up})/2 = ${b} km/h.`,
  ].join('\n')
  const stem = `A boat covers ${x1} km upstream and ${y1} km downstream in ${S(T1)} hours, and ${x2} km upstream and ${y2} km downstream in ${S(T2)} hours. What is the ${ask === 0 ? 'speed of the stream' : 'speed of the boat in still water'}?`
  const q = nq(rng, SD, stem, ans, ask === 0 ? [P(b), P(up), P(dn), P(dn - up)] : [P(s), P(up), P(dn), P(b + s - 1)], why, { post: ' km/h', none: NONE })
  return tag(q, 'sd-boat-system', { s, b, x1, y1, x2, y2, ask })
}

/** Train length from pole / platform data, then crossing another train. */
function sdTrains(rng: Rng): QuestionDraft {
  const kmh = [36, 45, 54, 63, 72, 81, 90, 99, 108]
  let [kA, kB] = rng.sample(kmh, 2)
  const same = rng.chance(0.4)
  if (same && kA < kB) [kA, kB] = [kB, kA] // the faster train overtakes
  const vA = fmul(P(kA), KMH_M)
  const vB = fmul(P(kB), KMH_M)
  // A: L_A = v_A × t_A, with t_A a multiple of the denominator of v_A so that L_A is an integer
  const jA = rng.int(Math.ceil(100 / vA.n), Math.floor(400 / vA.n))
  const tA = vA.d * jA
  need(tA >= 6 && tA <= 40, 'tA')
  const LA = vA.n * jA
  const plat = rstep(rng, 150, 450, 50)
  const jB = rng.int(Math.ceil((plat + 100) / vB.n), Math.floor((plat + 350) / vB.n))
  const tB = vB.d * jB
  need(tB >= 10 && tB <= 60, 'tB')
  const LB = vB.n * jB - plat
  need(LB >= 100 && LB <= 350, 'LB')
  const rel = same ? fsub(vA, vB) : fadd(vA, vB)
  const t = fdiv(P(LA + LB), rel)
  need(terminating(t, 2) && fnum(t) >= 4, 'unclean t')
  // second method: check the platform equation and solve crossing by relative distance covered in time t
  ensure(feq(fdiv(P(LB + plat), vB), P(tB)), 'trains: platform equation')
  ensure(feq(fmul(rel, t), P(LA + LB)), 'trains: relative distance')
  const wrongOpp = fdiv(P(LA + LB), fadd(vA, vB))
  const dv = fsub(vA, vB)
  const wrongSame = fdiv(P(LA + LB), fcmp(dv, P(0)) < 0 ? fsub(P(0), dv) : dv)
  const stem = `Train A, ${LA} m long, crosses a pole in ${tA} seconds. Train B, running at ${kB} km/h, crosses a platform ${plat} m long in ${tB} seconds. ${same ? 'If both trains run on parallel tracks in the same direction, how many seconds will the faster train take to completely overtake the slower one?' : 'If both trains run on parallel tracks in opposite directions, how many seconds will they take to cross each other completely?'}`
  const why = [
    `Speed of A = ${LA}/${tA} = ${S(vA)} m/s = ${kA} km/h.`,
    `Speed of B = ${kB} × 5/18 = ${S(vB)} m/s. Crossing the platform: (L_B + ${plat}) = ${S(vB)} × ${tB} = ${S(fmul(vB, P(tB)))} ⇒ L_B = ${LB} m.`,
    same ? `Relative speed (same direction) = ${S(vA)} − ${S(vB)} = ${S(rel)} m/s.` : `Relative speed (opposite directions) = ${S(vA)} + ${S(vB)} = ${S(rel)} m/s.`,
    `Distance to be covered = ${LA} + ${LB} = ${LA + LB} m.`,
    `Time = ${LA + LB}/${S(rel)} = ${S(t)} seconds.`,
  ].join('\n')
  const wrong = [same ? wrongOpp : wrongSame, fdiv(P(LA + LB + plat), rel), fdiv(P(LB), rel), fdiv(P(LA), rel)]
  const q = nq(rng, SD, stem, t, wrong, why, { post: ' seconds', none: NONE })
  return tag(q, 'sd-trains', { kA, kB, tA, tB, plat, same })
}

/** Two travellers: late start of one and a halt of the other; where do they meet? */
function sdMeeting(rng: Rng): QuestionDraft {
  const a = rng.pick([30, 36, 40, 45, 48, 50, 54, 60])
  const b = rng.pick([30, 36, 40, 45, 48, 50, 54, 60])
  const h = rng.pick([30, 60, 90, 120]) // minutes B starts later
  const sMin = rng.pick([15, 20, 30, 40, 45]) // minutes A halts
  const t = rng.int(6, 16) / 2 // hours since A's start at the meeting moment
  const sH = F(sMin, 60)
  const hH = F(h, 60)
  const D = fadd(fmul(P(a), fsub(F(Math.round(t * 2), 2), sH)), fmul(P(b), fsub(F(Math.round(t * 2), 2), hH)))
  need(fint(D) && D.n >= 120 && D.n <= 600, 'distance')
  const xh = rng.int(1, 4) // hours A travels before halting
  const tF = F(Math.round(t * 2), 2)
  need(fcmp(fadd(P(xh), sH), tF) <= 0 && t > h / 60, 'halt must end before meeting')
  const x = a * xh
  // piecewise positions at time t
  const posA = (tt: Frac): Frac => (fcmp(tt, P(xh)) <= 0 ? fmul(P(a), tt) : fcmp(tt, fadd(P(xh), sH)) <= 0 ? P(x) : fmul(P(a), fsub(tt, sH)))
  const posB = (tt: Frac): Frac => (fcmp(tt, hH) <= 0 ? P(0) : fmul(P(b), fsub(tt, hH)))
  ensure(feq(fadd(posA(tF), posB(tF)), D), 'meeting: piecewise positions do not close the gap')
  // earlier moment must still have a gap (strictly increasing sum)
  ensure(fcmp(fadd(posA(fsub(tF, F(1, 60))), posB(fsub(tF, F(1, 60)))), D) < 0, 'meeting: not the first meeting')
  const dA = posA(tF)
  const dB = posB(tF)
  const ask = rng.int(0, 1)
  const [nA, nB] = pickMen(rng, 2)
  const stem = `Towns P and Q are ${D.n} km apart. At 6:00 a.m., ${nA} leaves P for Q at ${a} km/h. ${nB} leaves Q for P at ${b} km/h, ${h} minutes after ${nA} has left. After covering ${x} km, ${nA} halts for ${sMin} minutes for tea and then continues at the same speed. At what distance from ${ask === 0 ? 'P' : 'Q'} will they meet?`
  const t0 = fdiv(P(D.n), P(a + b))
  const wrongNoHalt = fdiv(fmul(fadd(P(D.n), fmul(P(b), hH)), P(a)), P(a + b))
  const ans = ask === 0 ? dA : dB
  const why = [
    `Let them meet T hours after 6:00 a.m. ${nA} travels (T − ${sMin}/60) hours of actual motion since he halted ${sMin} minutes (the halt is over before they meet).`,
    `${nB} travels (T − ${h}/60) hours.`,
    `${a}(T − ${S(sH)}) + ${b}(T − ${S(hH)}) = ${D.n}`,
    `${a + b}T = ${D.n} + ${S(fmul(P(a), sH))} + ${S(fmul(P(b), hH))} = ${S(fadd(fadd(P(D.n), fmul(P(a), sH)), fmul(P(b), hH)))} ⇒ T = ${S(tF)} hours.`,
    `Distance from P = ${a} × (${S(tF)} − ${S(sH)}) = ${S(dA)} km; distance from Q = ${b} × (${S(tF)} − ${S(hH)}) = ${S(dB)} km.`,
  ].join('\n')
  const wrong = ask === 0 ? [dB, fmul(P(a), t0), wrongNoHalt, fdiv(fmul(P(D.n), P(a)), P(a + b)), fmul(P(a), tF)] : [dA, fmul(P(b), t0), fdiv(fmul(P(D.n), P(b)), P(a + b)), fmul(P(b), tF)]
  const q = nq(rng, SD, stem, ans, wrong, why, { post: ' km', none: NONE })
  return tag(q, 'sd-meeting', { a, b, h, sMin, xh, tTwice: Math.round(t * 2), ask })
}

const SPEEDS = [20, 24, 25, 30, 32, 36, 40, 45, 48, 50, 60, 64, 72, 75, 80, 90]
const FR3: [Frac, Frac, Frac][] = [
  [F(1, 3), F(1, 4), F(5, 12)],
  [F(1, 2), F(1, 4), F(1, 4)],
  [F(2, 5), F(3, 10), F(3, 10)],
  [F(1, 5), F(2, 5), F(2, 5)],
  [F(1, 4), F(1, 3), F(5, 12)],
  [F(3, 5), F(1, 5), F(1, 5)],
]

/** Average speed over three distance fractions at different speeds, including a halt. */
function sdAvg3(rng: Rng): QuestionDraft {
  const fr = rng.pick(FR3)
  const D = rstep(rng, 120, 600, 60)
  const v = rng.sample(SPEEDS, 3)
  const d = fr.map((f) => fmul(f, P(D)))
  need(d.every(fint), 'leg distance')
  const times = d.map((x, i) => fdiv(x, P(v[i])))
  const T = times.reduce(fadd, F(0))
  const halt = rng.shuffle([10, 12, 15, 18, 20, 24, 30, 36, 40, 45, 48]).find((h) => terminating(fdiv(P(D), fadd(T, F(h, 60))), 2)) as number
  need(halt !== undefined, 'no halt makes the average clean')
  const total = fadd(T, F(halt, 60))
  const avg = fdiv(P(D), total)
  // second method: float re-computation
  const tf = d.map((x, i) => fnum(x) / v[i])
  ensure(Math.abs(D / (sum(tf) + halt / 60) - fnum(avg)) < 1e-9, 'avg3: float recomputation differs')
  const am = F(sum(v), 3)
  const noHalt = fdiv(P(D), T)
  const wtd = fr.reduce((acc, f, i) => fadd(acc, fmul(f, P(v[i]))), F(0))
  const fr3 = fr.map((f) => `${f.n}/${f.d}`)
  const nm = pickMen(rng, 1)[0]
  const stem = `${nm} drives from his home to a town ${D} km away. He covers the first ${fr3[0]} of the distance at ${v[0]} km/h, the next ${fr3[1]} of the distance at ${v[1]} km/h and the remaining distance at ${v[2]} km/h. He also takes a rest of ${halt} minutes on the way. What is his average speed for the whole journey including the rest?`
  const why = [
    `Leg distances: ${d.map((x) => x.n).join(' km, ')} km.`,
    `Leg times: ${d.map((x, i) => `${x.n}/${v[i]} = ${S(times[i])} h`).join(', ')}.`,
    `Driving time = ${S(T)} h; adding the rest of ${halt} min = ${S(F(halt, 60))} h gives total time = ${S(total)} h.`,
    `Average speed = total distance/total time = ${D}/${S(total)} = ${S(avg)} km/h.`,
  ].join('\n')
  const q = nq(rng, SD, stem, avg, [am, noHalt, wtd, fdiv(P(3), v.reduce((acc, x) => fadd(acc, F(1, x)), F(0)))], why, { post: ' km/h', none: NONE })
  return tag(q, 'sd-avg3', { fr: fr.map((f) => [f.n, f.d]), D, v, halt })
}

/** Overall average speed is given; find the speed over the last stretch. */
function sdAvgFind(rng: Rng): QuestionDraft {
  const v = rng.sample(SPEEDS.filter((x) => x % 2 === 0), 3)
  const t = [rng.int(2, 6) / 2, rng.int(2, 6) / 2, rng.int(2, 6) / 2]
  const d = v.map((x, i) => x * t[i])
  need(d.every(Number.isInteger), 'integer legs')
  const halt = rng.pick([0, 12, 15, 20, 30, 45])
  const D = sum(d)
  const T = F(Math.round(sum(t) * 2), 2)
  const total = fadd(T, F(halt, 60))
  const avg = fdiv(P(D), total)
  need(terminating(avg, 1), 'unclean avg')
  // solver path: total time from average, subtract known parts
  const t3 = fsub(fsub(fsub(fdiv(P(D), avg), F(halt, 60)), F(Math.round(t[0] * 2), 2)), F(Math.round(t[1] * 2), 2))
  const v3 = fdiv(P(d[2]), t3)
  ensure(feq(v3, P(v[2])), 'avg-find: recovered speed differs')
  const nm = pickMen(rng, 1)[0]
  const haltTxt = halt === 0 ? '' : ` including a halt of ${halt} minutes`
  const stem = `${nm} travels ${D} km. He covers the first ${d[0]} km at ${v[0]} km/h and the next ${d[1]} km at ${v[1]} km/h, and the remaining ${d[2]} km at a constant speed. If his average speed for the whole journey${haltTxt} was ${S(avg)} km/h, at what speed did he cover the last ${d[2]} km?`
  const why = [
    `Total time = distance/average speed = ${D}/${S(avg)} = ${S(fdiv(P(D), avg))} h.`,
    `Time for first two parts = ${d[0]}/${v[0]} + ${d[1]}/${v[1]} = ${t[0]} + ${t[1]} = ${t[0] + t[1]} h${halt === 0 ? '' : `; halt = ${S(F(halt, 60))} h`}.`,
    `Time for last part = ${S(fdiv(P(D), avg))} − ${t[0] + t[1]}${halt === 0 ? '' : ` − ${S(F(halt, 60))}`} = ${S(t3)} h.`,
    `Speed on last part = ${d[2]}/${S(t3)} = ${v[2]} km/h.`,
  ].join('\n')
  const noHaltT3 = fsub(fsub(fdiv(P(D), avg), F(Math.round(t[0] * 2), 2)), F(Math.round(t[1] * 2), 2))
  const q = nq(rng, SD, stem, P(v[2]), [fsub(fmul(P(3), avg), P(v[0] + v[1])), fdiv(P(d[2]), noHaltT3), avg, F(v[0] + v[1], 2)], why, { post: ' km/h', none: NONE })
  return tag(q, 'sd-avg-find', { v, t, halt })
}

/** Races: chained starts or "beats by metres / seconds" with unit conversion. */
function sdRace(rng: Rng): QuestionDraft {
  const [nA, nB, nC] = pickMen(rng, 3)
  if (rng.chance(0.5)) {
    const R = 1000
    const x = rstep(rng, 40, 200, 10)
    const y = rstep(rng, 40, 200, 10)
    const R2 = rng.pick([400, 500, 800, 1200, 1500, 2000])
    const cRun = fdiv(fmul(P((R - x) * (R - y)), P(R2)), P(R * R)) // C's distance when A runs R2
    need(fint(cRun), 'unclean')
    const start = R2 - cRun.n
    // second method: speeds as ratios, finishing time check
    const vA = 1
    const vB = (R - x) / R
    const vC = (vB * (R - y)) / R
    ensure(Math.abs(R2 - (R2 * vC) / vA - start) < 1e-6, 'race: speed-ratio check')
    const stem = `In a ${R} m race, ${nA} can give ${nB} a start of ${x} m, and ${nB} can give ${nC} a start of ${y} m. How much start can ${nA} give ${nC} in a ${R2} m race?`
    const why = [
      `When ${nA} runs ${R} m, ${nB} runs ${R - x} m ⇒ ${nB}'s speed = ${(R - x)}/${R} of ${nA}'s.`,
      `When ${nB} runs ${R} m, ${nC} runs ${R - y} m ⇒ ${nC}'s speed = ${(R - y)}/${R} of ${nB}'s.`,
      `${nC}'s speed = ${R - x}/${R} × ${R - y}/${R} of ${nA}'s = ${S(F((R - x) * (R - y), R * R))} of ${nA}'s.`,
      `When ${nA} runs ${R2} m, ${nC} runs ${R2} × ${S(F((R - x) * (R - y), R * R))} = ${cRun.n} m.`,
      `Start given = ${R2} − ${cRun.n} = ${start} m.`,
    ].join('\n')
    const q = nq(rng, SD, stem, P(start), [x + y, ((x + y) * R2) / R, (x * R2) / R + y, R2 - cRun.n + 10], why, { post: ' m', none: NONE })
    return tag(q, 'sd-race-chain', { R, x, y, R2 })
  }
  const vB = rng.pick([4, 5, 6, 8, 10])
  const tt = rng.pick([5, 6, 8, 10, 12, 15])
  const x = vB * tt
  const R = rng.pick([200, 400, 500, 800, 1000, 1500])
  const tB = F(R, vB)
  const tA = fsub(tB, P(tt))
  need(tA.n > 0, 'A slower?')
  const vAkm = fmul(fdiv(P(R), tA), F(18, 5))
  need(terminating(vAkm, 2) && fnum(vAkm) > 6 && fnum(vAkm) < 45, 'unclean')
  const ask = rng.int(0, 1)
  const stem = `In a ${R} m race, ${nA} beats ${nB} by ${x} m or by ${tt} seconds. ${ask === 0 ? `How long does ${nA} take to complete the race?` : `What is ${nA}'s speed in km/h?`}`
  const why = [
    `${nB} covers ${x} m in the ${tt} seconds by which he loses ⇒ ${nB}'s speed = ${x}/${tt} = ${vB} m/s.`,
    `${nB}'s time for ${R} m = ${R}/${vB} = ${S(tB)} s.`,
    `${nA}'s time = ${S(tB)} − ${tt} = ${S(tA)} s.`,
    ask === 0 ? `${nA} takes ${S(tA)} seconds.` : `${nA}'s speed = ${R}/${S(tA)} m/s = ${R}/${S(tA)} × 18/5 = ${S(vAkm)} km/h.`,
  ].join('\n')
  const vAms = fdiv(P(R), tA)
  const wrong = ask === 0 ? [tB, fadd(tB, P(tt)), F(R - x, vB), fdiv(P(R), P(vB + tt))] : [vAms, fmul(P(vB), F(18, 5)), fmul(fdiv(P(R), tB), F(18, 5)), fmul(fdiv(P(R), fadd(tB, P(tt))), F(18, 5))]
  const q = nq(rng, SD, stem, ask === 0 ? tA : vAkm, wrong, why, { post: ask === 0 ? ' seconds' : ' km/h', none: NONE })
  return tag(q, 'sd-race-time', { vB, tt, R, ask })
}

/** Circular track: meeting times in opposite / same direction. */
function sdCircular(rng: Rng): QuestionDraft {
  const a = rng.int(4, 12)
  const b = rng.int(2, a - 1)
  const l0 = lcm(a + b, a - b)
  const kLo = Math.ceil(150 / l0)
  const kHi = Math.floor(2000 / l0)
  need(kHi >= kLo, 'length')
  const C = l0 * rng.int(kLo, kHi)
  const t1 = C / (a + b)
  const t2 = C / (a - b)
  need(Number.isInteger(t1) && Number.isInteger(t2) && t1 !== t2, 'times')
  // solver path
  const Cs = fdiv(fmul(P(2 * a), P(t1 * t2)), P(t1 + t2))
  const bs = fdiv(fmul(P(a), P(t2 - t1)), P(t2 + t1))
  ensure(feq(Cs, P(C)) && feq(bs, P(b)), 'circular: recovered values differ')
  ensure(C === (a + b) * t1 && C === (a - b) * t2, 'circular: plug-back')
  const ask = rng.int(0, 1)
  const [nA, nB] = pickMen(rng, 2)
  const stem = `${nA} and ${nB} start together from the same point of a circular track and run at different speeds. When they run in opposite directions they meet for the first time after ${t1} seconds, and when they run in the same direction the faster runner ${nA} overtakes ${nB} for the first time after ${t2} seconds. If ${nA} runs at ${a} m/s, ${ask === 0 ? 'what is the length of the track?' : `what is the speed of ${nB} in km/h?`}`
  const why = [
    `Let the track length = C and ${nB}'s speed = b m/s.`,
    `Opposite directions: C = (${a} + b) × ${t1}. Same direction: C = (${a} − b) × ${t2}.`,
    `(${a} + b) × ${t1} = (${a} − b) × ${t2} ⇒ b(${t1} + ${t2}) = ${a}(${t2} − ${t1}) ⇒ b = ${a} × ${t2 - t1}/${t1 + t2} = ${b} m/s.`,
    ask === 0 ? `C = (${a} + ${b}) × ${t1} = ${C} m.` : `Speed = ${b} × 18/5 = ${S(fmul(P(b), F(18, 5)))} km/h.`,
  ].join('\n')
  const wrong = ask === 0 ? [(a + b) * t2, (a - b) * t1, a * t1, a * t2, Math.round((a * (t1 + t2)) / 2)] : [fmul(P(b + 1), F(18, 5)), P(b), fmul(P(a - b), F(18, 5)), fmul(P(a), F(18, 5))]
  const q = nq(rng, SD, stem, ask === 0 ? P(C) : fmul(P(b), F(18, 5)), wrong, why, { post: ask === 0 ? ' m' : ' km/h', none: NONE })
  return tag(q, 'sd-circular', { a, b, t1, t2, ask })
}

/** A train passes two men (same / opposite direction): find length, speed or platform time. */
function sdTwoMen(rng: Rng): QuestionDraft {
  const v = rng.pick([45, 54, 63, 72, 81, 90, 99, 108])
  const s1 = rng.pick([3, 6, 9, 12])
  const s2 = rng.pick([3, 6, 9, 12])
  const r1 = fmul(P(v - s1), KMH_M)
  const r2 = fmul(P(v + s2), KMH_M)
  // length must be a multiple of both denominators so that both passing times are whole seconds
  const step = lcm(r1.n, r2.n)
  const L = rstep(rng, 100, 450, step)
  const t1f = fdiv(P(L), r1)
  const t2f = fdiv(P(L), r2)
  need(fint(t1f) && fint(t2f) && t2f.n < t1f.n && t2f.n >= 6 && t1f.n <= 60, 'times')
  const t1 = t1f.n
  const t2 = t2f.n
  // solver path: (v − s1')t1 = (v + s2')t2 ⇒ v(t1 − t2) = s1' t1 + s2' t2
  const s1m = fmul(P(s1), KMH_M)
  const s2m = fmul(P(s2), KMH_M)
  const vm = fdiv(fadd(fmul(s1m, P(t1)), fmul(s2m, P(t2))), P(t1 - t2))
  ensure(feq(fmul(vm, F(18, 5)), P(v)), 'two men: recovered speed differs')
  const ask = rng.int(0, 2)
  const plat = rstep(rng, 100, 400, 50)
  const [qs, ans, post, wrong] = ((): [string, Frac, string, (number | Frac)[]] => {
    if (ask === 0) return ['What is the length of the train?', P(L), ' m', [fmul(vm, P(t1)), fmul(vm, P(t2)), fmul(fadd(vm, s1m), P(t1)), fmul(fsub(vm, s2m), P(t2)), L + 50]]
    if (ask === 1) return ['What is the speed of the train in km/h?', P(v), ' km/h', [fmul(fadd(s1m, s2m), F(18, 5)), v - s1, v + s2, fmul(fdiv(P(L), P(t1)), F(18, 5)), fmul(fdiv(P(L), P(t2)), F(18, 5))]]
    const tp = fdiv(P(L + plat), vm)
    return [`How many seconds will the train take to cross a platform ${plat} m long?`, tp, ' seconds', [fdiv(P(L + plat), r1), fdiv(P(plat), vm), fdiv(P(L + plat), r2), fdiv(P(L), vm)]]
  })()
  if (ask === 2) need(terminating(ans, 2), 'unclean platform time')
  const stem = `A train passes a man walking at ${s1} km/h in the same direction as the train in ${t1} seconds, and another man walking at ${s2} km/h in the opposite direction in ${t2} seconds. ${qs}`
  const why = [
    `Man speeds: ${s1} km/h = ${S(s1m)} m/s and ${s2} km/h = ${S(s2m)} m/s. Let the train's speed = v m/s and its length = L m.`,
    `Same direction: L = (v − ${S(s1m)}) × ${t1}. Opposite direction: L = (v + ${S(s2m)}) × ${t2}.`,
    `(v − ${S(s1m)}) × ${t1} = (v + ${S(s2m)}) × ${t2} ⇒ v(${t1 - t2}) = ${S(fmul(s1m, P(t1)))} + ${S(fmul(s2m, P(t2)))} ⇒ v = ${S(vm)} m/s = ${v} km/h.`,
    `L = (${S(vm)} − ${S(s1m)}) × ${t1} = ${L} m.`,
    ask === 2 ? `Time to cross the platform = (${L} + ${plat})/${S(vm)} = ${S(ans)} seconds.` : `Required value = ${S(ans)}${post}.`,
  ].join('\n')
  const q = nq(rng, SD, stem, ans, wrong, why, { post, none: NONE })
  return tag(q, 'sd-twomen', { v, s1, s2, t1, ask, plat })
}

export const SD_TPLS: Tpl[] = [
  { name: 'sd-boat-ratio', gen: (r) => sdBoatRatio(r) },
  { name: 'sd-boat-system', gen: (r) => sdBoatSystem(r) },
  { name: 'sd-trains', gen: (r) => sdTrains(r) },
  { name: 'sd-meeting', gen: (r) => sdMeeting(r) },
  { name: 'sd-avg3', gen: (r) => sdAvg3(r) },
  { name: 'sd-avg-find', gen: (r) => sdAvgFind(r) },
  { name: 'sd-race', gen: (r) => sdRace(r) },
  { name: 'sd-circular', gen: (r) => sdCircular(r) },
  { name: 'sd-twomen', gen: (r) => sdTwoMen(r) },
]

// ============================================================================ MIXTURE & ALLIGATION
const MX = 'mixture-alligation' as const

/** Ratio of two exact quantities in lowest integer terms. */
function rat(a: Frac, b: Frac): string {
  need(a.n > 0 && b.n > 0, 'non-positive part')
  const m = lcm(a.d, b.d)
  return ratioStr(a.n * (m / a.d), b.n * (m / b.d))
}
/** Wrong-ratio pool for a milk:water answer: swapped, naive-method ratios, and small perturbations. */
function ratioWrongs(milk: Frac, water: Frac, naive: Frac[], total: Frac): string[] {
  const out: string[] = [rat(water, milk)]
  for (const m of naive) {
    if (m.n > 0 && fcmp(m, total) < 0) out.push(rat(m, fsub(total, m)))
  }
  const base = rat(milk, water).split(' : ').map(Number)
  const [a, b] = base
  out.push(`${a + 1} : ${b}`, `${a} : ${b + 1}`, `${a + 2} : ${b}`, `${a} : ${b + 2}`, `${a + 1} : ${b + 1}`, `${a * 2} : ${b + 1}`)
  return out
}

/** Pure milk, two successive removals/replacements by water (different amounts), optional top-up. */
function mxReplaceTwice(rng: Rng): QuestionDraft {
  const V = rstep(rng, 40, 240, 20)
  const fracs = [F(1, 5), F(1, 4), F(1, 3), F(2, 5), F(1, 2), F(1, 6), F(1, 10), F(3, 10)]
  const f1 = rng.pick(fracs)
  const f2 = rng.pick(fracs)
  const x1 = fmul(f1, P(V))
  const x2 = fmul(f2, P(V))
  need(fint(x1) && fint(x2) && x1.n >= 5 && x2.n >= 5, 'amounts')
  // method 1: explicit milk/water bookkeeping after each draw
  let milk = P(V)
  let water = P(0)
  for (const x of [x1, x2]) {
    const keep = fdiv(fsub(P(V), x), P(V))
    milk = fmul(milk, keep)
    water = fadd(fmul(water, keep), x)
  }
  // method 2: closed form V(1 − f1)(1 − f2)
  const closed = fmul(P(V), fmul(fsub(P(1), f1), fsub(P(1), f2)))
  ensure(feq(milk, closed) && feq(fadd(milk, water), P(V)), 'replace-twice: bookkeeping vs closed form')
  need(fint(milk), 'milk not integral')
  const ask = rng.int(0, 2)
  const extra = rstep(rng, 10, 40, 10)
  const m1 = fsub(P(V), x1)
  const m2 = milk
  const naiveMilk = [fsub(fsub(P(V), x1), x2), m1, fmul(P(V), fsub(fsub(P(1), f1), f2))]
  let stem = `A vessel contains ${V} litres of pure milk. ${x1.n} litres of milk is drawn out and replaced by water. Then ${x2.n} litres of the mixture is drawn out and again replaced by water. `
  let why = [
    `After the 1st replacement: milk = ${V} × (${V} − ${x1.n})/${V} = ${S(m1)} L, water = ${x1.n} L.`,
    `The 2nd draw removes ${x2.n}/${V} of the mixture, so milk left = ${S(m1)} × (${V} − ${x2.n})/${V} = ${S(m2)} L.`,
    `Water = ${V} − ${S(m2)} = ${S(water)} L.`,
  ]
  if (ask === 0) {
    stem += 'How many litres of milk are now in the vessel?'
    why.push(`Milk in the vessel = ${S(m2)} litres.`)
    return tag(nq(rng, MX, stem, m2, [...naiveMilk, fadd(m2, P(x1.n))], why.join('\n'), { post: ' litres', none: NONE }), 'mx-replace-twice', { V, x1: x1.n, x2: x2.n, ask, extra })
  }
  if (ask === 1) {
    stem += 'What is the ratio of milk to water in the final mixture?'
    why.push(`Milk : water = ${S(m2)} : ${S(water)} = ${rat(m2, water)}.`)
    const wrongs = ratioWrongs(m2, water, naiveMilk, P(V))
    const correct = rat(m2, water)
    return tag(strQ(rng, { topic: MX, stem, correct, wrong: wrongs, why: why.join('\n'), none: NONE }), 'mx-replace-twice', { V, x1: x1.n, x2: x2.n, ask, extra })
  }
  stem += `Now ${extra} litres of pure milk is added to the vessel. What is the ratio of milk to water now?`
  const mF = fadd(m2, P(extra))
  why.push(`After adding ${extra} L of milk: milk = ${S(m2)} + ${extra} = ${S(mF)} L, water = ${S(water)} L.`, `Milk : water = ${rat(mF, water)}.`)
  const wrongs = ratioWrongs(mF, water, [...naiveMilk.map((x) => fadd(x, P(extra))), m2], P(V + extra))
  return tag(strQ(rng, { topic: MX, stem, correct: rat(mF, water), wrong: wrongs, why: why.join('\n'), none: NONE }), 'mx-replace-twice', { V, x1: x1.n, x2: x2.n, ask, extra })
}

const RATIOS: [number, number][] = [[3, 2], [4, 1], [5, 3], [7, 3], [2, 3], [1, 4], [3, 5], [5, 1], [1, 2], [2, 1], [4, 3], [5, 2]]

/** Two vessels with different milk:water ratios mixed in a third, then water added. */
function mxTwoVessels(rng: Rng): QuestionDraft {
  const [a, b] = rng.pick(RATIOS)
  const [c, d] = rng.pick(RATIOS)
  need(a * d !== b * c, 'same ratio')
  const s1 = a + b
  const s2 = c + d
  const x = s1 * rng.int(2, 6)
  const y = s2 * rng.int(2, 6)
  const V1 = x + rstep(rng, 10, 50, 10)
  const V2 = y + rstep(rng, 10, 50, 10)
  const addWater = rng.chance(0.5)
  const z = rstep(rng, 10, 40, 10)
  const milk = fadd(F(x * a, s1), F(y * c, s2))
  const water = fadd(F(x * b, s1), F(y * d, s2))
  ensure(feq(fadd(milk, water), P(x + y)), 'two vessels: parts do not add to total')
  const milkF = addWater ? milk : fadd(milk, P(z))
  const waterF = addWater ? fadd(water, P(z)) : water
  const total = fadd(milkF, waterF)
  const ask = rng.int(0, 1)
  const nm = pickMen(rng, 1)[0]
  const pct = fdiv(fmul(milkF, P(100)), total)
  const stem = `Vessel A contains ${V1} litres of a milk-water mixture in the ratio ${a} : ${b} and vessel B contains ${V2} litres of a mixture in the ratio ${c} : ${d}. ${nm} pours ${x} litres from A and ${y} litres from B into an empty vessel and then adds ${z} litres of ${addWater ? 'water' : 'pure milk'}. ${ask === 0 ? 'What is the ratio of milk to water in the new mixture?' : 'What is the percentage of milk in the new mixture?'}`
  const why = [
    `Milk from A = ${x} × ${a}/${s1} = ${S(F(x * a, s1))} L, water from A = ${S(F(x * b, s1))} L.`,
    `Milk from B = ${y} × ${c}/${s2} = ${S(F(y * c, s2))} L, water from B = ${S(F(y * d, s2))} L.`,
    `Mixture: milk = ${S(milk)} L, water = ${S(water)} L. After adding ${z} L of ${addWater ? 'water' : 'milk'}: milk = ${S(milkF)} L, water = ${S(waterF)} L, total = ${S(total)} L.`,
    ask === 0 ? `Milk : water = ${rat(milkF, waterF)}.` : `Milk % = ${S(milkF)}/${S(total)} × 100 = ${S(pct)}%.`,
  ].join('\n')
  const wrongMilk = [fadd(F(V1 * a, s1), F(V2 * c, s2)), fadd(milkF, P(z)), milk]
  if (ask === 0) {
    const wr = ratioWrongs(milkF, waterF, wrongMilk, P(Math.round(fnum(total))))
    return tag(strQ(rng, { topic: MX, stem, correct: rat(milkF, waterF), wrong: wr, why, none: NONE }), 'mx-two-vessels', { a, b, c, d, x, y, z, addWater, ask })
  }
  need(terminating(pct, 2), 'unclean percent')
  const wrongPct = [fdiv(fmul(milk, P(100)), P(x + y)), fdiv(fmul(milkF, P(100)), P(x + y)), fdiv(fmul(milkF, P(100)), fadd(total, P(z))), fdiv(fmul(waterF, P(100)), total)]
  return tag(nq(rng, MX, stem, pct, wrongPct, why, { post: '%', none: NONE }), 'mx-two-vessels', { a, b, c, d, x, y, z, addWater, ask })
}

/** Three varieties in a ratio, some weight lost, selling price / profit%. */
function mxThreeVarieties(rng: Rng): QuestionDraft {
  const costs = rng.sample([24, 28, 32, 36, 40, 44, 48, 52, 56, 60, 64, 72, 80, 96], 3)
  const rt = rng.pick([[1, 2, 3], [2, 3, 5], [1, 3, 4], [2, 2, 1], [3, 2, 5], [1, 1, 2], [4, 3, 3], [2, 5, 3]])
  const tot = sum(rt)
  const mean = F(rt.reduce((acc, r, i) => acc + r * costs[i], 0), tot)
  const loss = rng.pick([10, 20, 25, 10, 20])
  const eff = fdiv(fmul(mean, P(100)), P(100 - loss))
  const ask = rng.int(0, 1)
  const nm = pickMen(rng, 1)[0]
  const k = 20 // simulate 20 lots
  const Q = tot * k
  const cost = P(rt.reduce((acc, r, i) => acc + r * k * costs[i], 0))
  const left = fmul(P(Q), F(100 - loss, 100))
  const descr = `${nm} mixes three varieties of rice costing ₹${costs[0]}, ₹${costs[1]} and ₹${costs[2]} per kg in the ratio ${rt.join(' : ')}. During cleaning, ${loss}% of the weight of the mixture is lost and he sells the rest. `
  const base = [
    `Take ${rt.join(' + ')} = ${tot} kg of the mixture: cost = ${rt.map((r, i) => `${r} × ${costs[i]}`).join(' + ')} = ₹${S(fmul(mean, P(tot)))}, i.e. ₹${S(mean)} per kg.`,
    `After a ${loss}% loss only ${100 - loss}% of the weight is left to sell, so effective cost per kg of saleable mixture = ${S(mean)} × 100/${100 - loss} = ₹${S(eff)}.`,
  ]
  if (ask === 0) {
    const g = rng.pick([10, 12, 15, 20, 25, 30])
    const Sp = fdiv(fmul(eff, P(100 + g)), P(100))
    need(fint(Sp), 'price not integral')
    // second method: whole-lot revenue must give exactly g% over cost
    const rev = fmul(left, Sp)
    ensure(feq(rev, fdiv(fmul(cost, P(100 + g)), P(100))), 'three varieties: revenue check')
    const stem = descr + `At what price per kg should he sell the remaining mixture to earn a profit of ${g}% on his total cost?`
    const why = [...base, `Selling price = ${S(eff)} × ${100 + g}/100 = ₹${Sp.n} per kg.`].join('\n')
    const wrong = [fdiv(fmul(mean, P(100 + g)), P(100)), fdiv(fmul(F(sum(costs), 3), P(100 + g)), P(100)), fdiv(fmul(eff, P(100)), P(100 - g)), fadd(Sp, P(2))]
    return tag(nq(rng, MX, stem, Sp, wrong, why, { pre: '₹', none: NONE }), 'mx-three-var', { costs, rt, loss, g, ask })
  }
  const lo = Math.ceil(fnum(eff) * 1.05)
  const hi = Math.floor(fnum(eff) * 1.45)
  need(hi >= lo, 'range')
  const Sp = P(rng.int(lo, hi))
  const profit = fdiv(fmul(fsub(Sp, eff), P(100)), eff)
  need(terminating(profit, 2), 'unclean profit')
  const rev = fmul(left, Sp)
  ensure(feq(fdiv(fmul(fsub(rev, cost), P(100)), cost), profit), 'three varieties: lot profit check')
  const stem = descr + `If he sells the remaining mixture at ₹${Sp.n} per kg, what is his profit percentage?`
  const why = [...base, `Profit % = (${Sp.n} − ${terminating(eff, 2) ? S(eff) : `(${S(eff)})`})/${terminating(eff, 2) ? S(eff) : `(${S(eff)})`} × 100 = ${S(profit)}%.`].join('\n')
  const wrong = [fdiv(fmul(fsub(Sp, mean), P(100)), mean), fdiv(fmul(fsub(Sp, eff), P(100)), Sp), fadd(profit, P(loss)), fsub(profit, P(loss))]
  return tag(nq(rng, MX, stem, profit, wrong, why, { post: '%', none: NONE }), 'mx-three-var', { costs, rt, loss, Sp: Sp.n, ask })
}

/** Two varieties, mixture sold at a price giving g% profit: ratio / quantity by alligation. */
function mxAllegationProfit(rng: Rng): QuestionDraft {
  const costs = rng.sample([40, 50, 60, 70, 80, 90, 100, 110, 120, 130, 140, 160, 180, 200], 2).sort((p, q) => p - q)
  const [a, b] = costs
  const [x, y] = rng.pick([[1, 2], [2, 3], [3, 2], [2, 1], [3, 1], [1, 3], [3, 4], [4, 3], [1, 4], [4, 1], [3, 5], [5, 3]])
  const c = F(x * a + y * b, x + y)
  const g = rng.pick([10, 15, 20, 25, 30, 40, 12.5])
  const Sp = fdiv(fmul(c, F(Math.round(g * 10) + 1000, 10)), P(100))
  need(fint(Sp), 'selling price not integral')
  // solver path: CP of mixture back from S, then alligation
  const cp = fdiv(fmul(Sp, P(100)), F(Math.round(g * 10) + 1000, 10))
  ensure(feq(cp, c), 'alligation: CP recovery')
  const ratio = fdiv(fsub(P(b), cp), fsub(cp, P(a))) // cheaper : dearer
  ensure(feq(ratio, F(x, y)), 'alligation: cross ratio')
  const ask = rng.int(0, 1)
  const Qk = (x + y) * rng.int(4, 12)
  const R = Sp.n * Qk
  const nm = pickMen(rng, 1)[0]
  const gTxt = String(g)
  const cheapQ = F(Qk * x, x + y)
  const stem = `${nm} mixes two varieties of tea costing ₹${a} and ₹${b} per kg and sells the mixture at a profit of ${gTxt}%. ` + (ask === 0 ? `If he sells ${Qk} kg of the mixture for a total of ₹${R}, how many kg of the cheaper variety does it contain?` : `If he sells the mixture at ₹${Sp.n} per kg, in what ratio (cheaper : dearer) did he mix the two varieties?`)
  const why = [
    ask === 0 ? `Selling price per kg = ${R}/${Qk} = ₹${Sp.n}.` : `Selling price per kg = ₹${Sp.n}.`,
    `Cost price of the mixture per kg = ${Sp.n} × 100/${100 + g} = ₹${S(c)} (profit ${gTxt}%).`,
    `Alligation: cheaper : dearer = (${b} − ${S(c)}) : (${S(c)} − ${a}) = ${S(fsub(P(b), c))} : ${S(fsub(c, P(a)))} = ${x} : ${y}.`,
    ask === 0 ? `Cheaper variety = ${Qk} × ${x}/${x + y} = ${S(cheapQ)} kg.` : `Ratio = ${x} : ${y}.`,
  ].join('\n')
  if (ask === 0) {
    need(terminating(cheapQ, 2), 'unclean')
    return tag(nq(rng, MX, stem, cheapQ, [F(Qk * y, x + y), F(Qk, 2), F(Qk * (x + 1), x + y + 1), F(Qk * x, y)], why, { post: ' kg', none: NONE }), 'mx-allig-profit', { a, b, x, y, g, Qk, ask })
  }
  const correct = `${x} : ${y}`
  // trap: treating the selling price as the cost price of the mixture
  const trap = fcmp(Sp, P(a)) > 0 && fcmp(Sp, P(b)) < 0 ? rat(fsub(P(b), Sp), fsub(Sp, P(a))) : `${x * 2 + 1} : ${y}`
  const wr = [`${y} : ${x}`, `${x + 1} : ${y}`, `${x} : ${y + 1}`, `${x + y} : ${x}`, trap]
  return tag(strQ(rng, { topic: MX, stem, correct, wrong: wr, why, none: NONE }), 'mx-allig-profit', { a, b, x, y, g, Qk, ask })
}

/** Ratio changes after a replacement; solve the original quantity, then continue the process. */
function mxRatioSolve(rng: Rng): QuestionDraft {
  const [a, b] = rng.pick([[3, 2], [4, 1], [5, 3], [7, 3], [3, 1], [5, 2], [2, 1], [4, 3], [5, 1], [7, 2]])
  const V = rstep(rng, 40, 200, 10)
  const x = rstep(rng, 5, Math.floor(V / 2), 5)
  const milk0 = F(V * a, a + b)
  const milk1 = fmul(milk0, F(V - x, V))
  const water1 = fsub(P(V), milk1)
  need(fint(milk1) && milk1.n > 0 && water1.n > 0, 'milk1')
  const rs = rat(milk1, water1).split(' : ').map(Number)
  const [c, d] = rs
  need(c + d <= 24 && c / d !== a / b, 'ratio size')
  // solver path: (V − x)·a/(a+b) = V·c/(c+d)  ⇒  V = x·a(c+d)/(a(c+d) − c(a+b))
  const den = a * (c + d) - c * (a + b)
  need(den > 0, 'denominator')
  const Vs = F(x * a * (c + d), den)
  ensure(feq(Vs, P(V)), 'ratio-solve: recovered V differs')
  const ask = rng.int(0, 1)
  const nm = pickMen(rng, 1)[0]
  const base = [
    `Let the original quantity be V litres: milk = ${a}V/${a + b}, water = ${b}V/${a + b}.`,
    `${x} L of the mixture removed takes out ${x} × ${a}/${a + b} = ${S(F(x * a, a + b))} L of milk; replacing it with water leaves milk = ${a}V/${a + b} − ${S(F(x * a, a + b))}.`,
    `New ratio ${c} : ${d} ⇒ milk = ${c}V/${c + d}. So ${a}V/${a + b} − ${c}V/${c + d} = ${S(F(x * a, a + b))}.`,
    `V × ${den}/${(a + b) * (c + d)} = ${S(F(x * a, a + b))} ⇒ V = ${V} litres.`,
  ]
  if (ask === 0) {
    const stem = `A vessel contains a mixture of milk and water in the ratio ${a} : ${b}. When ${x} litres of the mixture is drawn out and replaced by water, the ratio of milk to water becomes ${c} : ${d}. What was the original quantity of the mixture in the vessel?`
    const why = [...base, `Original quantity = ${V} litres.`].join('\n')
    return tag(nq(rng, MX, stem, P(V), [V - x, V + x, F(x * (c + d), 1), F(x * (a + b), 1), (V * 3) / 2], why, { post: ' litres', none: NONE }), 'mx-ratio-solve', { a, b, x, V, ask, y: 0 })
  }
  const y = rstep(rng, 5, Math.floor(V / 2), 5)
  const milk2 = fmul(milk1, F(V - y, V))
  need(fint(milk2) && y !== x, 'milk2')
  const stem = `${nm} has a vessel containing a mixture of milk and water in the ratio ${a} : ${b}. When ${x} litres of the mixture is drawn out and replaced by water, the ratio of milk to water becomes ${c} : ${d}. ${y} litres of this new mixture is then taken out and sold. How many litres of milk are left in the vessel?`
  const why = [...base, `Milk after replacement = ${S(milk1)} L out of ${V} L.`, `Selling ${y} L removes ${y}/${V} of the milk: milk left = ${S(milk1)} × ${V - y}/${V} = ${S(milk2)} L.`].join('\n')
  return tag(nq(rng, MX, stem, milk2, [fsub(milk1, P(y)), fmul(milk1, F(V - y, V + y)), fmul(milk0, F(V - y, V)), fsub(milk0, P(y))], why, { post: ' litres', none: NONE }), 'mx-ratio-solve', { a, b, x, V, ask, y })
}

/** Milkman adds water and sells in two lots at different prices: profit % or the missing price. */
function mxMilkman(rng: Rng): QuestionDraft {
  const V = rstep(rng, 20, 100, 10)
  const w = rstep(rng, 5, Math.floor(V / 2), 5)
  const c = rstep(rng, 30, 80, 2)
  const M = V + w
  const f1 = rng.pick([F(1, 2), F(3, 5), F(2, 5), F(1, 4), F(3, 4)])
  const q1 = fmul(f1, P(M))
  need(fint(q1), 'lot size')
  const q2 = fsub(P(M), q1)
  const s1 = c + rng.int(0, 14)
  const s2 = c + rng.int(-4, 20)
  const rev = fadd(fmul(q1, P(s1)), fmul(q2, P(s2)))
  const cost = P(V * c)
  const profit = fdiv(fmul(fsub(rev, cost), P(100)), cost)
  need(fcmp(profit, P(5)) > 0 && fcmp(profit, P(90)) < 0 && terminating(profit, 1), 'profit range')
  // second method: per-litre average realisation
  const avgPrice = fadd(fmul(f1, P(s1)), fmul(fsub(P(1), f1), P(s2)))
  ensure(feq(fmul(avgPrice, P(M)), rev), 'milkman: revenue mismatch')
  const ask = rng.int(0, 1)
  const nm = pickMen(rng, 1)[0]
  const stemBase = `${nm} buys ${V} litres of milk at ₹${c} per litre and mixes ${w} litres of water in it. He sells ${f1.n}/${f1.d} of the mixture at ₹${s1} per litre`
  const base = [
    `Total mixture = ${V} + ${w} = ${M} L; cost = ${V} × ${c} = ₹${V * c}.`,
    `First lot = ${M} × ${f1.n}/${f1.d} = ${q1.n} L; second lot = ${q2.n} L.`,
  ]
  if (ask === 0) {
    const stem = `${stemBase} and the rest at ₹${s2} per litre. What is his overall profit percentage?`
    const why = [...base, `Revenue = ${q1.n} × ${s1} + ${q2.n} × ${s2} = ₹${rev.n}.`, `Profit = ${rev.n} − ${V * c} = ₹${rev.n - V * c}; profit % = ${rev.n - V * c}/${V * c} × 100 = ${S(profit)}%.`].join('\n')
    const noWaterRev = fdiv(fmul(fsub(rev, cost), P(100)), rev)
    return tag(nq(rng, MX, stem, profit, [noWaterRev, fdiv(fmul(fsub(F(s1 + s2, 2), P(c)), P(100)), P(c)), fdiv(fmul(P(w), P(100)), P(V)), fadd(profit, P(5))], why, { post: '%', none: NONE }), 'mx-milkman', { V, w, c, f1: [f1.n, f1.d], s1, s2, ask })
  }
  const stem = `${stemBase}. At what price per litre must he sell the remaining mixture so that his overall profit is ${S(profit)}%?`
  const target = fdiv(fmul(cost, fadd(P(100), profit)), P(100))
  const s2s = fdiv(fsub(target, fmul(q1, P(s1))), q2)
  ensure(feq(s2s, P(s2)), 'milkman: recovered price differs')
  const why = [...base, `Required revenue = ${V * c} × (100 + ${S(profit)})/100 = ₹${S(target)}.`, `Revenue from the first lot = ${q1.n} × ${s1} = ₹${q1.n * s1}; needed from the second lot = ₹${S(fsub(target, fmul(q1, P(s1))))}.`, `Price per litre = ${S(fsub(target, fmul(q1, P(s1))))}/${q2.n} = ₹${s2}.`].join('\n')
  return tag(nq(rng, MX, stem, P(s2), [fdiv(fsub(target, fmul(q1, P(s1))), P(M)), fdiv(fmul(P(c), fadd(P(100), profit)), P(100)), s2 + 2, s2 - 2, s1], why, { pre: '₹', none: NONE }), 'mx-milkman', { V, w, c, f1: [f1.n, f1.d], s1, s2, ask })
}

/** The same quantity replaced twice; given the final milk (or final ratio) find the quantity replaced each time. */
function mxFindReplaced(rng: Rng): QuestionDraft {
  const V = rstep(rng, 40, 200, 20)
  const f = rng.pick([F(1, 5), F(1, 4), F(1, 3), F(1, 10), F(2, 5), F(1, 2), F(3, 5)])
  const x = fmul(f, P(V))
  need(fint(x), 'x')
  const keep = fsub(P(1), f)
  const M = fmul(P(V), fmul(keep, keep))
  need(fint(M) && M.n > 0, 'final milk')
  // solver path: (1 − f)² = M/V must be a perfect square ratio; recover f
  const isq = (n: number): number => Math.round(Math.sqrt(n))
  const r = F(M.n, V)
  need(isq(r.n) ** 2 === r.n && isq(r.d) ** 2 === r.d, 'not a perfect square')
  const fRec = fsub(P(1), F(isq(r.n), isq(r.d)))
  ensure(feq(fmul(fRec, P(V)), x), 'find-replaced: recovered amount differs')
  const ask = rng.int(0, 1)
  const water = fsub(P(V), M)
  const nm = pickMen(rng, 1)[0]
  let stem: string
  if (ask === 0) {
    stem = `A vessel contains ${V} litres of pure milk. ${nm} draws out some milk and replaces it with an equal quantity of water. He repeats the same operation once more with the same quantity. If ${M.n} litres of milk is now left in the vessel, how many litres were drawn out each time?`
  } else {
    const rr = rat(M, water)
    stem = `A vessel contains ${V} litres of pure milk. ${nm} draws out some milk and replaces it with an equal quantity of water. He repeats the same operation once more with the same quantity. If the final ratio of milk to water is ${rr}, how many litres were drawn out each time?`
  }
  const why = [
    `Let x litres be replaced each time. After each operation milk becomes (1 − x/${V}) times its previous value.`,
    `Milk left = ${V} × (1 − x/${V})².`,
    ask === 0 ? `${V} × (1 − x/${V})² = ${M.n} ⇒ (1 − x/${V})² = ${M.n}/${V} = ${r.n}/${r.d} ⇒ 1 − x/${V} = ${isq(r.n)}/${isq(r.d)}.` : `Milk : total = ${M.n} : ${V} = ${r.n} : ${r.d}, so (1 − x/${V})² = ${r.n}/${r.d} ⇒ 1 − x/${V} = ${isq(r.n)}/${isq(r.d)}.`,
    `x/${V} = ${f.n}/${f.d} ⇒ x = ${x.n} litres.`,
  ].join('\n')
  const wrong = [fdiv(fsub(P(V), M), P(2)), fsub(P(V), M), fdiv(fsub(P(V), M), P(3)), fsub(P(V), x)]
  return tag(nq(rng, MX, stem, x, wrong, why, { post: ' litres', none: NONE }), 'mx-find-replaced', { V, f: [f.n, f.d], ask })
}

export const MX_TPLS: Tpl[] = [
  { name: 'mx-replace-twice', gen: (r) => mxReplaceTwice(r) },
  { name: 'mx-two-vessels', gen: (r) => mxTwoVessels(r) },
  { name: 'mx-three-var', gen: (r) => mxThreeVarieties(r) },
  { name: 'mx-allig-profit', gen: (r) => mxAllegationProfit(r) },
  { name: 'mx-ratio-solve', gen: (r) => mxRatioSolve(r) },
  { name: 'mx-milkman', gen: (r) => mxMilkman(r) },
  { name: 'mx-find-replaced', gen: (r) => mxFindReplaced(r) },
]

// ============================================================================ MENSURATION (π = 22/7 throughout)
const ME = 'mensuration' as const
const PI_NOTE = '(Take π = 22/7.)'
const sq = (f: Frac): Frac => fmul(f, f)
const cube = (f: Frac): Frac => fmul(f, sq(f))
const PIF = 22 / 7
const fabs = (f: Frac): Frac => (f.n < 0 ? F(-f.n, f.d) : f)

/** Solid made of cylinder + cone (on one face) + hemisphere (on the other), recast into smaller solids. */
function meRecast(rng: Rng): QuestionDraft {
  for (let tries = 0; tries < 80; tries++) {
    const r = rng.pick([7, 14, 21])
    const h = rng.int(3, 14)
    const hc = rng.pick([6, 9, 12, 15, 18, 21, 24])
    const Vcyl = fmul(PI, fmul(sq(P(r)), P(h)))
    const Vcone = fdiv(fmul(PI, fmul(sq(P(r)), P(hc))), P(3))
    const Vhemi = fdiv(fmul(PI, fmul(P(2), cube(P(r)))), P(3))
    const V = fadd(fadd(Vcyl, Vcone), Vhemi)
    const form = rng.int(0, 1)
    const r0 = P(r)
    let stem: string
    let n: Frac
    let why: string[]
    let wrong: (number | Frac)[]
    const head = `A solid is made by joining a cone of height ${hc} cm to one end and a hemisphere to the other end of a solid cylinder, all three having the same radius ${r} cm; the cylindrical part is ${h} cm high. `
    const build = [
      `Volume of the cylinder = πr²h = 22/7 × ${r}² × ${h} = ${S(Vcyl)} cm³.`,
      `Volume of the cone = (1/3)πr²h = (1/3) × 22/7 × ${r}² × ${hc} = ${S(Vcone)} cm³.`,
      `Volume of the hemisphere = (2/3)πr³ = (2/3) × 22/7 × ${r}³ = ${S(Vhemi)} cm³.`,
      `Total volume = ${S(Vcyl)} + ${S(Vcone)} + ${S(Vhemi)} = ${S(V)} cm³.`,
    ]
    if (form === 0) {
      const dd = rng.pick([2, 3, 4, 6, 7, 14, 21])
      const rho = F(dd, 2)
      const Vs = fdiv(fmul(P(4), fmul(PI, cube(rho))), P(3))
      n = fdiv(V, Vs)
      if (!fint(n) || n.n < 6 || n.n > 600) continue
      // second method: float sum of the three parts / float sphere volume
      const fl = (PIF * r * r * h + (PIF * r * r * hc) / 3 + (2 * PIF * r ** 3) / 3) / ((4 * PIF * (dd / 2) ** 3) / 3)
      ensure(Math.abs(fl - n.n) < 1e-6, 'recast spheres: float check')
      stem = head + `It is melted and recast into small solid spheres of diameter ${dd} cm each. How many such spheres can be made? ${PI_NOTE}`
      why = [...build, `Volume of one sphere = (4/3)π(${S(rho)})³ = ${S(Vs)} cm³.`, `Number of spheres = ${S(V)} ÷ ${terminating(Vs, 2) ? S(Vs) : `(${S(Vs)})`} = ${n.n}.`]
      const wrongHemi = fdiv(fadd(fadd(Vcyl, Vcone), fdiv(fmul(PI, fmul(P(4), cube(r0))), P(3))), Vs)
      wrong = [fdiv(fadd(fadd(Vcyl, fmul(PI, fmul(sq(r0), P(hc)))), Vhemi), Vs), wrongHemi, fdiv(V, fdiv(fmul(P(4), fmul(PI, cube(P(dd)))), P(3))), fdiv(fadd(Vcyl, Vcone), Vs), fdiv(V, fmul(PI, cube(rho)))]
      return tag(nq(rng, ME, stem, n, wrong, why.join('\n'), { none: NONE }), 'me-recast', { r, h, hc, dd, form })
    }
    // wire: drawn into a uniform wire of given diameter (mm); answer length in metres
    const wd = rng.pick([2, 4, 7, 14])
    const wr = F(wd, 20) // radius in cm
    const len = fdiv(V, fmul(PI, sq(wr))) // cm
    const lenM = fdiv(len, P(100))
    if (!terminating(lenM, 2) || fnum(lenM) < 10 || fnum(lenM) > 5000) continue
    const fl = (PIF * r * r * h + (PIF * r * r * hc) / 3 + (2 * PIF * r ** 3) / 3) / (PIF * (wd / 20) ** 2) / 100
    ensure(Math.abs(fl - fnum(lenM)) < 1e-6, 'recast wire: float check')
    stem = head + `It is melted and drawn into a uniform cylindrical wire of diameter ${wd} mm. What is the length of the wire in metres? ${PI_NOTE}`
    why = [...build, `Wire radius = ${wd}/2 mm = ${S(wr)} cm.`, `Length = V/(πr²) = ${S(V)}/(22/7 × ${S(sq(wr))}) = ${S(len)} cm = ${S(lenM)} m.`]
    wrong = [fdiv(len, P(10)), len, fdiv(fdiv(V, fmul(PI, sq(F(wd, 10)))), P(100)), fdiv(fdiv(fadd(Vcyl, Vcone), fmul(PI, sq(wr))), P(100))]
    return tag(nq(rng, ME, stem, lenM, wrong, why.join('\n'), { post: ' m', none: NONE }), 'me-recast', { r, h, hc, wd, form })
  }
  throw new Reject('recast: no clean combination')
}

const TRIPLES: [number, number, number][] = [[7, 24, 25], [14, 48, 50], [21, 28, 35], [28, 21, 35], [35, 12, 37], [21, 72, 75], [21, 20, 29]]

/** Tent = cylinder + cone; canvas with wastage; priced per m^2 or per metre of canvas of a given width. */
function meTent(rng: Rng): QuestionDraft {
  const [r, hc, l] = rng.pick(TRIPLES)
  ensure(Math.hypot(r, hc) === l, 'tent: slant height triple')
  const h = rng.int(3, 12)
  const area = fmul(PI, fadd(fmul(P(2 * r), P(h)), fmul(P(r), P(l)))) // 2πrh + πrl
  ensure(Math.abs(PIF * (2 * r * h + r * l) - fnum(area)) < 1e-6, 'tent: float area')
  need(fint(area), 'area')
  const w = rng.pick([5, 10, 20, 25])
  const used = fdiv(fmul(area, P(100 + w)), P(100))
  const form = rng.int(0, 1)
  const nm = pickMen(rng, 1)[0]
  const head = `${nm} makes a tent in the shape of a cylinder of radius ${r} m and height ${h} m surmounted by a cone of the same radius and vertical height ${hc} m. `
  const why = [
    `Slant height of the cone = √(${r}² + ${hc}²) = ${l} m.`,
    `Curved area of the cylinder = 2πrh = 2 × 22/7 × ${r} × ${h} = ${S(fmul(PI, P(2 * r * h)))} m².`,
    `Curved area of the cone = πrl = 22/7 × ${r} × ${l} = ${S(fmul(PI, P(r * l)))} m².`,
    `Canvas needed for the tent = ${S(area)} m²; with ${w}% extra for wastage = ${S(area)} × ${100 + w}/100 = ${S(used)} m².`,
  ]
  if (form === 0) {
    const rate = rng.pick([12, 15, 20, 24, 25, 30, 35, 40])
    const cost = fmul(used, P(rate))
    need(fint(cost), 'cost not integral')
    const stem = head + `Canvas is bought with ${w}% extra for wastage at ₹${rate} per m². What is the total cost of the canvas? ${PI_NOTE}`
    why.push(`Cost = ${S(used)} × ${rate} = ₹${cost.n}.`)
    const wrong = [fmul(area, P(rate)), fmul(fadd(area, fmul(PI, sq(P(r)))), P(rate)), fmul(fmul(PI, fadd(fmul(P(2 * r), P(h)), fmul(P(r), P(hc)))), fmul(P(rate), F(100 + w, 100))), fmul(fmul(used, P(rate)), F(100 + w, 100))]
    return tag(nq(rng, ME, stem, cost, wrong, why.join('\n'), { pre: '₹', none: NONE }), 'me-tent', { r, hc, l, h, w, form, rate })
  }
  const wid = rng.pick([2, 4, 5])
  const rate = rng.pick([20, 25, 30, 40, 50, 60])
  const length = fdiv(used, P(wid))
  const cost = fmul(length, P(rate))
  need(fint(cost), 'cost not integral')
  const stem = head + `The canvas used is ${wid} m wide, ${w}% extra is bought for wastage, and it costs ₹${rate} per metre of length. What is the total cost of the canvas? ${PI_NOTE}`
  why.push(`Length of canvas = ${S(used)}/${wid} = ${S(length)} m.`, `Cost = ${S(length)} × ${rate} = ₹${cost.n}.`)
  const wrong = [fmul(fdiv(area, P(wid)), P(rate)), fmul(used, P(rate)), fmul(fdiv(fmul(PI, fadd(fmul(P(2 * r), P(h)), fmul(P(r), P(hc)))), P(wid)), fmul(P(rate), F(100 + w, 100))), fmul(fdiv(used, P(2 * wid)), P(rate))]
  return tag(nq(rng, ME, stem, cost, wrong, why.join('\n'), { pre: '₹', none: NONE }), 'me-tent', { r, hc, l, h, w, form, rate, wid })
}

/** Circular park with a path around it: fencing the outer edge + paving the path. */
function mePath(rng: Rng): QuestionDraft {
  const R = 7 * rng.int(2, 8)
  const w = rng.int(2, 6)
  const r = R - w
  need(r >= 7, 'inner radius')
  const fence = rng.pick([8, 10, 12, 15, 16, 20, 25])
  const pave = rng.pick([14, 21, 28, 35, 42, 49, 56, 20, 30, 40])
  const circ = fmul(PI, P(2 * R))
  const ring = fmul(PI, fsub(sq(P(R)), sq(P(r))))
  // second method: ring = π w (R + r) with floats
  ensure(Math.abs(PIF * w * (R + r) - fnum(ring)) < 1e-6, 'path: ring area')
  const total = fadd(fmul(circ, P(fence)), fmul(ring, P(pave)))
  need(fint(total), 'total not integral')
  const nm = pickMen(rng, 1)[0]
  const ask = rng.int(0, 1)
  const stem = `A circular park of radius ${r} m is surrounded by a path ${w} m wide. ${nm} wants to fence the outer boundary of the path at ₹${fence} per metre and to pave the path at ₹${pave} per m². ${ask === 0 ? 'What is the total cost of fencing and paving?' : 'What is the cost of paving alone?'} ${PI_NOTE}`
  const why = [
    `Outer radius = ${r} + ${w} = ${R} m.`,
    `Outer circumference = 2πR = 2 × 22/7 × ${R} = ${S(circ)} m; fencing cost = ${S(circ)} × ${fence} = ₹${S(fmul(circ, P(fence)))}.`,
    `Area of path = π(R² − r²) = 22/7 × (${R * R} − ${r * r}) = ${S(ring)} m²; paving cost = ${S(ring)} × ${pave} = ₹${S(fmul(ring, P(pave)))}.`,
    ask === 0 ? `Total cost = ${S(fmul(circ, P(fence)))} + ${S(fmul(ring, P(pave)))} = ₹${total.n}.` : `Paving cost = ₹${S(fmul(ring, P(pave)))}.`,
  ].join('\n')
  const ans = ask === 0 ? total : fmul(ring, P(pave))
  if (ask === 1) need(fint(ans), 'paving integral')
  const innerCirc = fmul(PI, P(2 * r))
  const wrong =
    ask === 0
      ? [fadd(fmul(innerCirc, P(fence)), fmul(ring, P(pave))), fadd(fmul(circ, P(fence)), fmul(fmul(PI, sq(P(R))), P(pave))), fadd(fmul(circ, P(fence)), fmul(fmul(PI, fmul(P(w), P(w))), P(pave))), fmul(circ, P(fence))]
      : [fmul(fmul(PI, sq(P(R))), P(pave)), fmul(fmul(PI, fmul(P(w), P(w))), P(pave)), fmul(fmul(PI, fmul(P(2 * r), P(w))), P(pave)), fmul(fmul(PI, sq(P(r))), P(pave))]
  return tag(nq(rng, ME, stem, ans, wrong, why, { pre: '₹', none: NONE }), 'me-path', { r, w, fence, pave, ask })
}

/** Rectangular plot with an inside border path and a circular pond in the remaining part. */
function meRectPond(rng: Rng): QuestionDraft {
  const L = rstep(rng, 40, 120, 4)
  const B = rstep(rng, 30, 100, 2)
  const w = rng.int(2, 5)
  const iL = L - 2 * w
  const iB = B - 2 * w
  const rp = rng.pick([7, 14])
  need(Math.min(iL, iB) > 2 * rp + 4, 'pond must fit')
  const pPath = rng.pick([20, 25, 30, 40, 45, 50])
  const pGrass = rng.pick([4, 5, 6, 8, 10, 12, 15])
  const path = L * B - iL * iB
  ensure(path === 2 * w * (L + B - 2 * w), 'rect-pond: path area two ways')
  const pond = fmul(PI, sq(P(rp)))
  const grass = fsub(P(iL * iB), pond)
  const total = fadd(P(path * pPath), fmul(grass, P(pGrass)))
  need(fint(total), 'total integral')
  const ask = rng.int(0, 1)
  const stem = `A rectangular plot is ${L} m long and ${B} m wide. A ${w} m wide path is laid inside the plot all along its boundary. In the middle of the remaining inner rectangle there is a circular pond of radius ${rp} m. The path is paved at ₹${pPath} per m² and the rest of the inner area, except the pond, is covered with grass at ₹${pGrass} per m². ${ask === 0 ? 'What is the total cost?' : 'What is the cost of the grass alone?'} ${PI_NOTE}`
  const why = [
    `Inner rectangle = (${L} − 2 × ${w}) × (${B} − 2 × ${w}) = ${iL} × ${iB} = ${iL * iB} m².`,
    `Area of path = ${L} × ${B} − ${iL * iB} = ${path} m²; paving cost = ${path} × ${pPath} = ₹${path * pPath}.`,
    `Pond area = πr² = 22/7 × ${rp}² = ${S(pond)} m²; grass area = ${iL * iB} − ${S(pond)} = ${S(grass)} m²; grass cost = ${S(grass)} × ${pGrass} = ₹${S(fmul(grass, P(pGrass)))}.`,
    ask === 0 ? `Total cost = ${path * pPath} + ${S(fmul(grass, P(pGrass)))} = ₹${total.n}.` : `Grass cost = ₹${S(fmul(grass, P(pGrass)))}.`,
  ].join('\n')
  const ans = ask === 0 ? total : fmul(grass, P(pGrass))
  const wrong =
    ask === 0
      ? [fadd(P(path * pPath), fmul(P(iL * iB), P(pGrass))), fadd(P(path * pPath), fmul(fadd(grass, pond), P(pGrass))), fadd(P(2 * w * (L + B) * pPath), fmul(grass, P(pGrass))), fadd(P(path * pPath), fmul(fsub(P(L * B), pond), P(pGrass)))]
      : [fmul(P(iL * iB), P(pGrass)), fmul(fsub(P(L * B), pond), P(pGrass)), fmul(pond, P(pGrass)), fmul(fsub(P(iL * iB), fmul(P(2), pond)), P(pGrass))]
  return tag(nq(rng, ME, stem, ans, wrong, why, { pre: '₹', none: NONE }), 'me-rect-pond', { L, B, w, rp, pPath, pGrass, ask })
}

/** Rope-grazing area: extra area when the rope is lengthened (corner = quarter circle, mid-side = semicircle). */
function meGrazing(rng: Rng): QuestionDraft {
  const l = rng.pick([7, 14, 21, 28])
  const e = rng.pick([7, 14, 21])
  const l2 = l + e
  const corner = rng.chance(0.5)
  const k = corner ? 4 : 2
  const Bf = l2 + rng.int(6, 20)
  const Lf = 2 * l2 + 20 + rng.int(0, 10) // longer side, long enough for the semicircle too
  const a1 = fdiv(fmul(PI, sq(P(l))), P(k))
  const a2 = fdiv(fmul(PI, sq(P(l2))), P(k))
  const extra = fsub(a2, a1)
  ensure(Math.abs((PIF * (l2 * l2 - l * l)) / k - fnum(extra)) < 1e-9, 'grazing: float extra area')
  const ask = rng.int(0, 2)
  const rate = rng.pick([2, 4, 5, 6, 8, 10])
  const nm = pickMen(rng, 1)[0]
  const place = corner ? 'to a corner' : 'to the middle of one of the longer sides'
  const stem = `A horse is tied ${place} of a rectangular field ${Lf} m × ${Bf} m by a rope ${l} m long and can graze only inside the field. ${nm} later lengthens the rope by ${e} m. ${ask === 0 ? 'By how many m² does the grazing area increase?' : ask === 1 ? `If the grass is worth ₹${rate} per m², what is the value of the extra grass the horse can now graze?` : 'By what percentage does the grazing area increase?'} ${PI_NOTE}`
  const frac = corner ? '1/4' : '1/2'
  const why = [
    `The horse grazes ${corner ? 'a quarter-circle' : 'a semicircle'} (${frac} of a circle) inside the field.`,
    `Old area = ${frac} × 22/7 × ${l}² = ${S(a1)} m²; new rope = ${l} + ${e} = ${l2} m ⇒ new area = ${frac} × 22/7 × ${l2}² = ${S(a2)} m².`,
    `Increase = ${S(a2)} − ${S(a1)} = ${S(extra)} m².`,
  ]
  if (ask === 0) {
    why.push(`Extra area = ${S(extra)} m².`)
    return tag(nq(rng, ME, stem, extra, [a2, fdiv(fmul(PI, sq(P(e))), P(k)), fmul(extra, P(2)), fmul(extra, F(1, 2)), fdiv(fmul(PI, sq(P(e))), P(1))], why.join('\n'), { post: ' m²', none: NONE }), 'me-grazing', { l, e, corner, ask, rate })
  }
  if (ask === 1) {
    const val = fmul(extra, P(rate))
    need(terminating(val, 2), 'unclean')
    why.push(`Value = ${S(extra)} × ${rate} = ₹${S(val)}.`)
    return tag(nq(rng, ME, stem, val, [fmul(a2, P(rate)), fmul(fdiv(fmul(PI, sq(P(e))), P(k)), P(rate)), fmul(a1, P(rate)), fmul(fmul(extra, P(2)), P(rate))], why.join('\n'), { pre: '₹', none: NONE }), 'me-grazing', { l, e, corner, ask, rate })
  }
  const pct = fdiv(fmul(extra, P(100)), a1)
  need(terminating(pct, 2), 'unclean pct')
  why.push(`Increase % = ${S(extra)}/${S(a1)} × 100 = ${S(pct)}%.`)
  return tag(nq(rng, ME, stem, pct, [fmul(F(e, l), P(100)), fdiv(fmul(extra, P(100)), a2), fmul(F(l2, l), P(100)), fadd(pct, P(100))], why.join('\n'), { post: '%', none: NONE }), 'me-grazing', { l, e, corner, ask, rate })
}

/** Circle <-> square / rectangle relations: region between shapes, wire re-bending. */
function meShapes(rng: Rng): QuestionDraft {
  const form = rng.int(0, 2)
  const k = rng.int(1, 5)
  const r = 7 * k
  const circA = fmul(PI, sq(P(r)))
  const nm = pickMen(rng, 1)[0]
  const rate = rng.pick([5, 6, 8, 10, 12, 15, 20])
  if (form === 0) {
    // square inscribed in a circle: area between circle and square, painted at a rate
    const sqA = 2 * r * r
    const region = fsub(circA, P(sqA))
    ensure(Math.abs(PIF * r * r - sqA - fnum(region)) < 1e-9, 'inscribed: region float')
    const cost = fmul(region, P(rate))
    need(fint(cost), 'cost')
    const stem = `A square is inscribed in a circular lawn of radius ${r} m. ${nm} plants flowers in the portion of the lawn lying outside the square, at a cost of ₹${rate} per m². What is the total cost? ${PI_NOTE}`
    const why = [
      `Diagonal of the square = diameter = ${2 * r} m ⇒ area of square = (diagonal)²/2 = ${(2 * r) ** 2}/2 = ${sqA} m².`,
      `Area of circle = πr² = 22/7 × ${r}² = ${S(circA)} m².`,
      `Area outside the square = ${S(circA)} − ${sqA} = ${S(region)} m².`,
      `Cost = ${S(region)} × ${rate} = ₹${cost.n}.`,
    ].join('\n')
    const wrong = [fmul(circA, P(rate)), fmul(fabs(fsub(circA, P(4 * r * r))), P(rate)), fmul(fsub(circA, P(r * r)), P(rate)), fmul(fabs(fsub(P(r * r), circA)), P(rate))]
    return tag(nq(rng, ME, stem, cost, wrong, why, { pre: '₹', none: NONE }), 'me-shapes', { form, r, rate })
  }
  if (form === 1) {
    // circle inscribed in a square plot: four corners
    const side = 2 * r
    const corners = fsub(P(side * side), circA)
    const cost = fmul(corners, P(rate))
    need(fint(cost), 'cost')
    const stem = `A circular pond of radius ${r} m is dug in a square plot so that it touches all four sides of the plot. The remaining four corner portions are to be turfed at ₹${rate} per m². What is the cost of turfing? ${PI_NOTE}`
    const why = [
      `Side of the square plot = diameter of the pond = ${side} m ⇒ area = ${side * side} m².`,
      `Area of the pond = 22/7 × ${r}² = ${S(circA)} m².`,
      `Area of the four corners = ${side * side} − ${S(circA)} = ${S(corners)} m².`,
      `Cost = ${S(corners)} × ${rate} = ₹${cost.n}.`,
    ].join('\n')
    const wrong = [fmul(circA, P(rate)), fmul(fabs(fsub(P(r * r), circA)), P(rate)), fmul(P(side * side), P(rate)), fmul(fabs(fsub(P(2 * r * r), circA)), P(rate))]
    return tag(nq(rng, ME, stem, cost, wrong, why, { pre: '₹', none: NONE }), 'me-shapes', { form, r, rate })
  }
  // wire: circle -> rectangle with ratio, compare areas
  const C = fmul(P(2 * r), PI) // = 44k
  const half = fdiv(C, P(2))
  const [a, b] = rng.pick([[7, 4], [6, 5], [8, 3], [9, 2], [3, 2], [5, 3], [2, 1], [3, 1]])
  const Ls = fdiv(fmul(half, P(a)), P(a + b))
  const Bs = fdiv(fmul(half, P(b)), P(a + b))
  need(fint(Ls) && fint(Bs), 'sides')
  const rectA = fmul(Ls, Bs)
  const diff = fsub(circA, rectA)
  need(diff.n > 0, 'circle must be larger')
  ensure(Ls.n * 2 + Bs.n * 2 === C.n, 'wire: rectangle perimeter equals wire length')
  const stem = `A wire in the form of a circle of radius ${r} cm is bent into a rectangle whose sides are in the ratio ${a} : ${b}. By how many cm² is the area of the circle more than the area of the rectangle? ${PI_NOTE}`
  const why = [
    `Length of wire = circumference = 2πr = 2 × 22/7 × ${r} = ${C.n} cm.`,
    `Perimeter of rectangle = ${C.n} ⇒ L + B = ${S(half)}. Sides in the ratio ${a} : ${b} ⇒ L = ${Ls.n} cm, B = ${Bs.n} cm.`,
    `Area of rectangle = ${Ls.n} × ${Bs.n} = ${rectA.n} cm²; area of circle = 22/7 × ${r}² = ${S(circA)} cm².`,
    `Difference = ${S(circA)} − ${rectA.n} = ${S(diff)} cm².`,
  ].join('\n')
  const wrong = [fadd(circA, rectA), fabs(fsub(circA, fmul(fdiv(C, P(4)), fdiv(C, P(4))))), rectA, fabs(fsub(circA, fmul(P(4), rectA)))]
  return tag(nq(rng, ME, stem, diff, wrong, why, { post: ' cm²', none: NONE }), 'me-shapes', { form, r, a, b })
}

/** Water from a cylindrical pipe fills a rectangular tank (unit conversions, part-filled tank). */
function mePipeTank(rng: Rng): QuestionDraft {
  for (let tries = 0; tries < 80; tries++) {
    const kk = rng.pick([1, 2, 3])
    const rad = 7 * kk // pipe radius, cm
    const v = rng.pick([3, 6, 9, 12, 15, 18])
    const t = rng.int(15, 150)
    const f0 = rng.pick([F(0), F(1, 5), F(1, 4), F(1, 3), F(1, 2)])
    // volume that flows in t minutes, in m^3 = π r² (cm²) × v km/h → (v × 100000/60) cm/min × t / 10^6
    const flow = fdiv(fmul(fmul(PI, sq(P(rad))), fmul(P(v), P(t))), P(600))
    const tank = fdiv(flow, fsub(P(1), f0))
    if (!fint(tank) || tank.n < 24 || tank.n > 900) continue
    // split the tank volume into three realistic dimensions
    const opts: [number, number, number][] = []
    for (let L = 3; L <= 30; L++) for (let B = 3; B <= L; B++) if (tank.n % (L * B) === 0) {
      const H = tank.n / (L * B)
      if (H >= 2 && H <= 6) opts.push([L, B, H])
    }
    if (!opts.length) continue
    const [L, B, H] = rng.pick(opts)
    // second method: metres-based flow, float
    const radM = rad / 100
    const rateM3PerMin = PIF * radM * radM * ((v * 1000) / 60)
    const need2 = L * B * H * (1 - fnum(f0))
    ensure(Math.abs(need2 / rateM3PerMin - t) < 1e-6, 'pipe-tank: float time check')
    const startTxt = f0.n === 0 ? 'completely empty' : `${f0.n}/${f0.d} full`
    const stem = `Water flows out of a pipe of diameter ${2 * rad} cm at ${v} km/h into a rectangular tank ${L} m long, ${B} m wide and ${H} m high, which is ${startTxt}. How many minutes will it take to fill the tank completely? ${PI_NOTE}`
    const why = [
      `Radius of pipe = ${rad} cm = ${rad / 100} m; speed = ${v} km/h = ${S(F(v * 1000, 60))} m/min.`,
      `Water delivered per minute = π r² × speed = 22/7 × (${rad / 100})² × ${S(F(v * 1000, 60))} = ${S(fdiv(flow, P(t)))} m³.`,
      `Volume still to be filled = ${L} × ${B} × ${H} × ${f0.n === 0 ? '1' : `(1 − ${f0.n}/${f0.d})`} = ${S(flow)} m³.`,
      `Time = ${S(flow)}/${S(fdiv(flow, P(t)))} = ${t} minutes.`,
    ].join('\n')
    const rateF = fdiv(flow, P(t))
    const wrong = [fdiv(P(L * B * H), rateF), fdiv(P(t), P(4)), fmul(P(t), P(2)), fdiv(P(t), P(60)), fmul(P(t), F(3, 2))]
    return tag(nq(rng, ME, stem, P(t), wrong, why, { post: ' minutes', none: NONE }), 'me-pipe-tank', { rad, v, L, B, H, f0: [f0.n, f0.d] })
  }
  throw new Reject('pipe-tank: no clean combination')
}

/** Solids dropped into a cylindrical vessel; rise of water level or number of balls. */
function meBalls(rng: Rng): QuestionDraft {
  for (let tries = 0; tries < 120; tries++) {
    const R = 7 * rng.int(1, 3)
    const rho = rng.pick([3, 6, 9, 12, 7, 14])
    const n = rng.int(2, 15)
    const withCone = rng.chance(0.6)
    const rc = rng.pick([3, 6, 7, 9, 14, 21])
    const hc = rng.pick([6, 9, 12, 14, 15, 18, 21])
    const Vsph = fmul(P(n), fdiv(fmul(P(4), fmul(PI, cube(P(rho)))), P(3)))
    const Vcone = withCone ? fdiv(fmul(PI, fmul(sq(P(rc)), P(hc))), P(3)) : P(0)
    const Vtot = fadd(Vsph, Vcone)
    const rise = fdiv(Vtot, fmul(PI, sq(P(R))))
    if (!terminating(rise, 2) || fnum(rise) < 0.5 || fnum(rise) > 25) continue
    // second method: floats
    const fl = (n * ((4 * PIF * rho ** 3) / 3) + (withCone ? (PIF * rc * rc * hc) / 3 : 0)) / (PIF * R * R)
    ensure(Math.abs(fl - fnum(rise)) < 1e-9, 'balls: float rise check')
    const ask = rng.int(0, 1)
    const coneTxt = withCone ? `, and a solid cone of base radius ${rc} cm and height ${hc} cm,` : ','
    const parts = [
      `Volume of ${n} spheres = ${n} × (4/3) × 22/7 × ${rho}³ = ${S(Vsph)} cm³.`,
      ...(withCone ? [`Volume of the cone = (1/3) × 22/7 × ${rc}² × ${hc} = ${S(Vcone)} cm³.`] : []),
      `Total volume of solids = ${S(Vtot)} cm³ (all fully submerged, so this equals the volume of water displaced).`,
    ]
    if (ask === 0) {
      const stem = `${n} solid iron spheres, each of radius ${rho} cm${coneTxt} are completely dropped into a cylindrical vessel of base radius ${R} cm that contains water. By how many cm does the water level rise? ${PI_NOTE}`
      const why = [...parts, `Rise = volume/(πR²) = ${S(Vtot)}/(22/7 × ${R}²) = ${S(rise)} cm.`].join('\n')
      const wrong = [fdiv(Vtot, fmul(fmul(PI, P(2)), sq(P(R)))), fdiv(fadd(fmul(P(n), fmul(fmul(P(4), PI), sq(P(rho)))), Vcone), fmul(PI, sq(P(R)))), fdiv(Vsph, fmul(PI, sq(P(R)))), fdiv(Vtot, fmul(PI, sq(P(2 * R)))), fdiv(fadd(fmul(P(n), fmul(PI, cube(P(rho)))), Vcone), fmul(PI, sq(P(R))))]
      return tag(nq(rng, ME, stem, rise, wrong, why, { post: ' cm', none: NONE }), 'me-balls', { R, rho, n, withCone, rc, hc, ask })
    }
    const stem2 = `Some solid iron spheres, each of radius ${rho} cm${coneTxt} are completely dropped into a cylindrical vessel of base radius ${R} cm containing water, and the water level rises by exactly ${S(rise)} cm. How many spheres were dropped? ${PI_NOTE}`
    const why = [`Volume of water displaced = πR² × rise = 22/7 × ${R}² × ${S(rise)} = ${S(Vtot)} cm³.`, ...(withCone ? [`Volume of the cone = (1/3) × 22/7 × ${rc}² × ${hc} = ${S(Vcone)} cm³, so spheres account for ${S(Vtot)} − ${S(Vcone)} = ${S(Vsph)} cm³.`] : []), `Volume of one sphere = (4/3) × 22/7 × ${rho}³ = ${S(fdiv(Vsph, P(n)))} cm³.`, `Number of spheres = ${S(Vsph)}/${S(fdiv(Vsph, P(n)))} = ${n}.`].join('\n')
    const oneSph = fdiv(Vsph, P(n))
    const wrong = [fdiv(Vtot, oneSph).n, n + 1, n - 1, n * 2, fdiv(Vsph, fmul(oneSph, P(2))).n]
    return tag(nq(rng, ME, stem2, P(n), wrong, why, { none: NONE }), 'me-balls', { R, rho, n, withCone, rc, hc, ask })
  }
  throw new Reject('balls: no clean combination')
}

export const ME_TPLS: Tpl[] = [
  { name: 'me-recast', gen: (r) => meRecast(r) },
  { name: 'me-tent', gen: (r) => meTent(r) },
  { name: 'me-path', gen: (r) => mePath(r) },
  { name: 'me-rect-pond', gen: (r) => meRectPond(r) },
  { name: 'me-grazing', gen: (r) => meGrazing(r) },
  { name: 'me-shapes', gen: (r) => meShapes(r) },
  { name: 'me-pipe-tank', gen: (r) => mePipeTank(r) },
  { name: 'me-balls', gen: (r) => meBalls(r) },
]

// ============================================================================ PROBABILITY & PERMUTATION-COMBINATION
const PB = 'probability-pnc' as const
const WOMEN = ['Pooja', 'Neha', 'Priya', 'Anita', 'Sunita', 'Meena', 'Rekha', 'Kavita', 'Divya', 'Sneha']
const fr = (n: number, d: number): string => (d === 0 ? '0' : `${n / gcd(n, d)}/${d / gcd(n, d)}`)
/** Integer counts -> Fracs (drops non-integers). */
const PW = (xs: number[]): Frac[] => xs.filter((x) => Number.isInteger(x) && x > 0).map(P)
const P_ = (n: number, k: number): number => (k < 0 || k > n ? 0 : fact(n) / fact(n - k))

/** Calls fn for every k-subset of 0..n-1. */
function eachSubset(n: number, k: number, fn: (s: number[]) => void): void {
  const cur: number[] = []
  const rec = (start: number): void => {
    if (cur.length === k) {
      fn(cur)
      return
    }
    for (let i = start; i < n; i++) {
      cur.push(i)
      rec(i + 1)
      cur.pop()
    }
  }
  rec(0)
}
/** Calls fn for every permutation of the given items (as arrays). */
function eachPerm<T>(items: T[], fn: (p: T[]) => void): void {
  const used = new Array(items.length).fill(false)
  const cur: T[] = []
  const rec = (): void => {
    if (cur.length === items.length) {
      fn(cur)
      return
    }
    for (let i = 0; i < items.length; i++) {
      if (used[i]) continue
      used[i] = true
      cur.push(items[i])
      rec()
      cur.pop()
      used[i] = false
    }
  }
  rec()
}

/** Probability-as-fraction question: wrong fractions come from the supplied mistakes plus neighbours of the key. */
function probQ(rng: Rng, stem: string, fav: number, tot: number, wr: Frac[], why: string): QuestionDraft {
  need(fav > 0 && fav < tot, 'degenerate probability')
  const correct = fr(fav, tot)
  const cands: string[] = []
  for (const f of wr) if (f.n > 0 && fcmp(f, P(1)) < 0) cands.push(`${f.n}/${f.d}`)
  for (const dlt of [1, -1, 2, -2, 3]) {
    const nn = fav + dlt
    if (nn > 0 && nn < tot) cands.push(fr(nn, tot))
  }
  cands.push(fr(fav, tot + 1), fr(fav + 1, tot + 1), fr(tot - fav, tot))
  return strQ(rng, { topic: PB, stem, correct, wrong: cands, why, none: NONE })
}

const termList = (js: number[], mk: (j: number) => [string, number]): { text: string; total: number } => {
  const parts = js.map(mk)
  return { text: parts.map((p) => p[0]).join(' + '), total: parts.reduce((a, p) => a + p[1], 0) }
}

/** Committee selection with at-least/at-most/together/apart/chair conditions (count or probability). */
function pbCommittee(rng: Rng): QuestionDraft {
  const m = rng.int(4, 8)
  const w = rng.int(3, 6)
  const k = rng.int(4, 5)
  const n = m + w
  need(n <= 12 && k < n - 1 && w >= 2, 'sizes')
  const variant = rng.int(0, 3)
  const [mA, mB] = pickMen(rng, 2)
  const [wA] = rng.sample(WOMEN, 1)
  const inSet = (s: number[], x: number): boolean => s.includes(x)
  const wc = (s: number[]): number => s.filter((x) => x >= m).length
  let weight: (s: number[]) => number
  let formula: number
  let cond: string
  let lines: string[]
  let wrongCounts: number[]
  let probOk = true
  let param = 0
  if (variant === 0) {
    const r = rng.int(1, Math.min(3, w, k - 1))
    param = r
    const js = Array.from({ length: k - r + 1 }, (_, i) => r + i).filter((j) => j <= w && k - j <= m)
    const t1 = termList(js, (j) => [`C(${w},${j})×C(${m},${k - j}) = ${choose(w, j) * choose(m, k - j)}`, choose(w, j) * choose(m, k - j)])
    const js2 = js.filter((j) => j >= 1 && k - j >= 1)
    const t2 = termList(js2, (j) => [`C(${w - 1},${j - 1})×C(${m - 1},${k - j - 1}) = ${choose(w - 1, j - 1) * choose(m - 1, k - j - 1)}`, choose(w - 1, j - 1) * choose(m - 1, k - j - 1)])
    formula = t1.total - t2.total
    weight = (s) => (wc(s) >= r && !(inSet(s, 0) && inSet(s, m)) ? 1 : 0)
    cond = `has at least ${r} ${r > 1 ? 'women' : 'woman'} and ${mA} and ${wA} do not both serve on it`
    lines = [
      `Committees with at least ${r} women (j women, ${k} − j men): ${t1.text} = ${t1.total}.`,
      `Committees with at least ${r} women in which both ${mA} and ${wA} are present (choose the other ${k - 2} from ${m - 1} men and ${w - 1} women): ${t2.text} = ${t2.total}.`,
      `Required = ${t1.total} − ${t2.total} = ${formula}.`,
    ]
    wrongCounts = [t1.total, t2.total, t1.total + t2.total, choose(n, k) - t2.total]
  } else if (variant === 1) {
    const u = rng.int(1, 2)
    param = u
    const js = Array.from({ length: u + 1 }, (_, j) => j)
    const tIn = termList(js, (j) => [`C(${w},${j})×C(${m - 2},${k - 2 - j}) = ${choose(w, j) * choose(m - 2, k - 2 - j)}`, choose(w, j) * choose(m - 2, k - 2 - j)])
    const tOut = termList(js, (j) => [`C(${w},${j})×C(${m - 2},${k - j}) = ${choose(w, j) * choose(m - 2, k - j)}`, choose(w, j) * choose(m - 2, k - j)])
    formula = tIn.total + tOut.total
    weight = (s) => (wc(s) <= u && inSet(s, 0) === inSet(s, 1) ? 1 : 0)
    cond = `has at most ${u} ${u > 1 ? 'women' : 'woman'} and the two men ${mA} and ${mB} are either both in it or both left out`
    lines = [
      `Case 1 – ${mA} and ${mB} both in: choose the other ${k - 2} from ${m - 2} men and ${w} women with at most ${u} women: ${tIn.text} = ${tIn.total}.`,
      `Case 2 – both left out: choose all ${k} from ${m - 2} men and ${w} women with at most ${u} women: ${tOut.text} = ${tOut.total}.`,
      `Required = ${tIn.total} + ${tOut.total} = ${formula}.`,
    ]
    wrongCounts = [tIn.total, tOut.total, tIn.total + tOut.total + choose(w, 1) * choose(m - 2, k - 1), 2 * tIn.total]
  } else if (variant === 2) {
    const j = rng.int(2, Math.min(w, k - 1))
    param = j
    need(m - 1 >= k - j, 'enough men')
    formula = choose(w - 1, j - 1) * choose(m - 1, k - j)
    weight = (s) => (wc(s) === j && inSet(s, m) && !inSet(s, 0) ? 1 : 0)
    cond = `has exactly ${j} women, ${wA} is always included and ${mA} is never included`
    lines = [
      `${wA} is fixed in, so choose the other ${j - 1} women from the remaining ${w - 1}: C(${w - 1},${j - 1}) = ${choose(w - 1, j - 1)}.`,
      `${mA} is excluded, so choose the ${k - j} ${k - j === 1 ? 'man' : 'men'} from the remaining ${m - 1}: C(${m - 1},${k - j}) = ${choose(m - 1, k - j)}.`,
      `Required = ${choose(w - 1, j - 1)} × ${choose(m - 1, k - j)} = ${formula}.`,
    ]
    wrongCounts = [choose(w, j) * choose(m, k - j), choose(w - 1, j - 1) * choose(m, k - j), choose(w, j - 1) * choose(m - 1, k - j), choose(w - 1, j) * choose(m - 1, k - j)]
  } else {
    probOk = false
    const js = Array.from({ length: k - 2 }, (_, i) => i + 1).filter((j) => j <= w && k - j <= m)
    const t = termList(js, (j) => [`${j}×C(${w},${j})×C(${m},${k - j}) = ${j * choose(w, j) * choose(m, k - j)}`, j * choose(w, j) * choose(m, k - j)])
    formula = t.total
    weight = (s) => (wc(s) >= 1 && s.length - wc(s) >= 2 ? wc(s) : 0)
    cond = ''
    lines = [`For j women (1 ≤ j ≤ ${k - 2}, so that there are at least 2 men) the members can be chosen in C(${w},j) × C(${m},${k} − j) ways and the chairperson can be any of the j women.`, `Total = ${t.text} = ${t.total}.`]
    wrongCounts = [js.reduce((a, j) => a + choose(w, j) * choose(m, k - j), 0), t.total * k, js.reduce((a, j) => a + choose(w, j) * choose(m, k - j), 0) * w, Math.round(t.total / 2)]
  }
  // independent brute force over all committees
  let brute = 0
  eachSubset(n, k, (s) => {
    brute += weight(s)
  })
  ensure(brute === formula, 'committee: brute-force count differs from formula')
  const tot = choose(n, k)
  const ask = probOk && rng.chance(0.5) ? 1 : 0
  const base = variant === 3 ? `A committee of ${k} members is to be formed from ${m} men and ${w} women. The committee must have at least 2 men and at least 1 woman, and one of the women members is to be appointed its chairperson.` : `A committee of ${k} members is to be formed from ${m} men (including ${mA}${variant === 1 ? ` and ${mB}` : ''}) and ${w} women (including ${wA}). `
  if (variant === 3) {
    const stem = base + ' In how many ways can the committee, together with its chairperson, be selected?'
    return tag(nq(rng, PB, stem, P(formula), PW(wrongCounts), lines.join('\n'), { none: NONE }), 'pb-committee', { m, w, k, variant, ask: 0, param })
  }
  if (ask === 0) {
    const stem = base + `In how many ways can the committee be formed if it ${cond}?`
    return tag(nq(rng, PB, stem, P(formula), PW(wrongCounts), lines.join('\n'), { none: NONE }), 'pb-committee', { m, w, k, variant, ask, param })
  }
  const stem = base + `If the committee is chosen at random from all possible committees, what is the probability that it ${cond}?`
  const why = [...lines, `Total committees = C(${n},${k}) = ${tot}.`, `Probability = ${formula}/${tot}${fr(formula, tot) === `${formula}/${tot}` ? '' : ` = ${fr(formula, tot)}`}.`].join('\n')
  return tag(probQ(rng, stem, formula, tot, wrongCounts.map((c) => F(c, tot > c ? tot : tot + c)), why), 'pb-committee', { m, w, k, variant, ask, param })
}

const VOWELS = new Set(['A', 'E', 'I', 'O', 'U'])
const WORDS = ['MACHINE', 'PLAYING', 'CHARITY', 'PICTURE', 'KITCHEN', 'PAINTER', 'HOSTILE', 'MARKING', 'FLOWERS', 'CAPTION', 'LOGICAL', 'BALLOON', 'CARTOON', 'ANAGRAM', 'MISSION', 'LETTER', 'BANANA', 'TOMATO', 'POTATO', 'MONKEY', 'DOCTOR']

/** Arrangements of the letters of a word with vowel/consonant conditions (count or probability). */
function pbLetters(rng: Rng): QuestionDraft {
  const word = rng.pick(WORDS)
  const letters = word.split('')
  const n = letters.length
  const isV = letters.map((ch) => VOWELS.has(ch))
  const v = isV.filter(Boolean).length
  const c = n - v
  need(v >= 2 && c >= 2, 'need both kinds')
  const mult = new Map<string, number>()
  for (const ch of letters) mult.set(ch, (mult.get(ch) ?? 0) + 1)
  const vMultFact = [...mult].filter(([ch]) => VOWELS.has(ch)).reduce((a, [, k]) => a * fact(k), 1)
  const cMultFact = [...mult].filter(([ch]) => !VOWELS.has(ch)).reduce((a, [, k]) => a * fact(k), 1)
  const allMult = vMultFact * cMultFact
  const conds = ['together', 'apart', 'odd', 'startC-endV', 'firstLastC'] as const
  const cond = rng.pick(conds)
  let pat: number
  let text: string
  let patWhy: string
  if (cond === 'together') {
    pat = n - v + 1
    text = 'all the vowels come together'
    patWhy = `Treat the ${v} vowels as one block: block + ${c} consonants = ${c + 1} units, so the block can occupy ${n - v + 1} positions in the pattern.`
  } else if (cond === 'apart') {
    pat = choose(c + 1, v)
    text = 'no two vowels are adjacent'
    patWhy = `Arrange the ${c} consonants first; the ${v} vowels go into ${c + 1} gaps (one per gap): C(${c + 1},${v}) = ${pat} patterns.`
  } else if (cond === 'odd') {
    pat = choose(Math.ceil(n / 2), v)
    text = 'all the vowels occupy odd-numbered positions'
    patWhy = `There are ${Math.ceil(n / 2)} odd positions (1, 3, 5, ...), so the vowel positions can be chosen in C(${Math.ceil(n / 2)},${v}) = ${pat} ways.`
  } else if (cond === 'startC-endV') {
    pat = choose(n - 2, v - 1)
    text = 'the word begins with a consonant and ends with a vowel'
    patWhy = `First place is a consonant, last is a vowel; the remaining ${v - 1} vowels take ${v - 1} of the ${n - 2} middle places: C(${n - 2},${v - 1}) = ${pat} patterns.`
  } else {
    pat = choose(n - 2, v)
    text = 'the first and the last letters are both consonants'
    patWhy = `The two end places are consonants, so all ${v} vowels lie among the ${n - 2} middle places: C(${n - 2},${v}) = ${pat} patterns.`
  }
  need(pat > 0, 'impossible condition')
  const vArr = fact(v) / vMultFact
  const cArr = fact(c) / cMultFact
  const formula = pat * vArr * cArr
  // independent brute force over all index permutations
  const pred = (t: boolean[]): boolean => {
    if (cond === 'together') {
      const idx = t.map((x, i) => (x ? i : -1)).filter((i) => i >= 0)
      return idx[idx.length - 1] - idx[0] === idx.length - 1
    }
    if (cond === 'apart') return t.every((x, i) => !(x && t[i + 1]))
    if (cond === 'odd') return t.every((x, i) => !x || i % 2 === 0)
    if (cond === 'startC-endV') return !t[0] && t[n - 1]
    return !t[0] && !t[n - 1]
  }
  need(n <= 7, 'brute-force size')
  let bruteIdx = 0
  eachPerm(isV.map((_, i) => i), (p) => {
    if (pred(p.map((i) => isV[i]))) bruteIdx++
  })
  ensure(bruteIdx / allMult === formula, 'letters: brute-force arrangement count differs')
  const total = fact(n) / allMult
  const ask = rng.int(0, 1)
  const rep = [...mult].filter(([, k]) => k > 1).map(([ch, k]) => `${ch} appears ${k} times`)
  const letterTxt = `the letters of the word ${word}${rep.length ? ` (${rep.join(', ')})` : ''}`
  const why = [
    `${word}: ${n} letters – ${v} vowels (${letters.filter((_, i) => isV[i]).join(', ')}) and ${c} consonants (${letters.filter((_, i) => !isV[i]).join(', ')}).`,
    patWhy,
    `Vowels can be arranged among themselves in ${v}!${vMultFact > 1 ? `/${vMultFact}` : ''} = ${vArr} ways; consonants in ${c}!${cMultFact > 1 ? `/${cMultFact}` : ''} = ${cArr} ways.`,
    `Favourable arrangements = ${pat} × ${vArr} × ${cArr} = ${formula}.`,
  ]
  if (ask === 0) {
    const stem = `In how many different ways can ${letterTxt} be arranged so that ${text}?`
    const wrong = [total - formula, formula / vArr, formula / cArr, pat * fact(v) * fact(c), fact(n - v + 1) * fact(v)].filter((x) => Number.isInteger(x))
    return tag(nq(rng, PB, stem, P(formula), PW(wrong), why.join('\n'), { none: NONE }), 'pb-letters', { word, cond, ask })
  }
  const stem = `All the distinct arrangements of ${letterTxt} are written down. If one arrangement is chosen at random, what is the probability that ${text}?`
  why.push(`Total arrangements = ${n}!${allMult > 1 ? `/${allMult}` : ''} = ${total}.`, `Probability = ${formula}/${total} = ${fr(formula, total)}.`)
  return tag(probQ(rng, stem, formula, total, [F(total - formula, total), F(formula, fact(n)), F(Math.min(formula + vArr, total - 1), total)], why.join('\n')), 'pb-letters', { word, cond, ask })
}

type CntEvent = { text: string; test: (i: number, j: number, l: number) => boolean }
const COLOURS = ['red', 'blue', 'green']

/** Balls drawn without replacement from three colours, optional conditional event. */
function pbBalls(rng: Rng): QuestionDraft {
  const cnt = [rng.int(3, 6), rng.int(3, 6), rng.int(2, 5)]
  const n = sum(cnt)
  need(n <= 14, 'size')
  const k = rng.chance(0.65) ? 3 : 4
  const evA: CntEvent[] = [
    { text: 'all the balls are of different colours', test: (i, j, l) => k === 3 && i === 1 && j === 1 && l === 1 },
    { text: 'exactly two balls are red', test: (i) => i === 2 },
    { text: 'at least two balls are red', test: (i) => i >= 2 },
    { text: 'at least one ball of each colour is drawn', test: (i, j, l) => k === 4 && i >= 1 && j >= 1 && l >= 1 },
    { text: 'exactly two balls are blue', test: (_i, j) => j === 2 },
    { text: 'exactly two balls are of the same colour', test: (i, j, l) => k === 3 && Math.max(i, j, l) === 2 },
  ]
  const evB: CntEvent[] = [
    { text: 'no green ball is drawn', test: (_i, _j, l) => l === 0 },
    { text: 'at least one blue ball is drawn', test: (_i, j) => j >= 1 },
    { text: 'at least one red ball is drawn', test: (i) => i >= 1 },
  ]
  const A = rng.pick(evA)
  const conditional = rng.chance(0.55)
  const B = conditional ? rng.pick(evB) : null
  const comps: [number, number, number][] = []
  for (let i = 0; i <= Math.min(k, cnt[0]); i++) for (let j = 0; j <= Math.min(k - i, cnt[1]); j++) {
    const l = k - i - j
    if (l >= 0 && l <= cnt[2]) comps.push([i, j, l])
  }
  const wgt = (c: [number, number, number]): number => choose(cnt[0], c[0]) * choose(cnt[1], c[1]) * choose(cnt[2], c[2])
  const favA = comps.filter((c) => A.test(...c))
  const space = B ? comps.filter((c) => B.test(...c)) : comps
  const fav = favA.filter((c) => !B || B.test(...c))
  const favW = sum(fav.map(wgt))
  const totW = sum(space.map(wgt))
  need(favW > 0 && favW < totW && fav.length > 0, 'degenerate')
  // independent brute force over ball subsets
  const colourOf: number[] = []
  cnt.forEach((c, ci) => {
    for (let q = 0; q < c; q++) colourOf.push(ci)
  })
  let bf = 0
  let bt = 0
  eachSubset(n, k, (s) => {
    const cc = [0, 0, 0]
    for (const x of s) cc[colourOf[x]]++
    if (!B || B.test(cc[0], cc[1], cc[2])) {
      bt++
      if (A.test(cc[0], cc[1], cc[2])) bf++
    }
  })
  ensure(bf === favW && bt === totW, 'balls: brute-force subset count differs')
  // classic wrong answers: with replacement, ignoring the condition, joint probability
  const withRepl = favA.reduce((acc, c) => fadd(acc, fmul(F(fact(k), fact(c[0]) * fact(c[1]) * fact(c[2])), fmul(fmul(F(cnt[0] ** c[0], n ** c[0]), F(cnt[1] ** c[1], n ** c[1])), F(cnt[2] ** c[2], n ** c[2])))), F(0))
  const plainA = F(sum(favA.map(wgt)), choose(n, k))
  const joint = F(favW, choose(n, k))
  const bag = `A bag contains ${cnt[0]} red, ${cnt[1]} blue and ${cnt[2]} green balls. ${k} balls are drawn at random one after another without replacement. `
  const q1 = B ? `Given that ${B.text}, what is the probability that ${A.text}?` : `What is the probability that ${A.text}?`
  const termTxt = (cs: [number, number, number][]): string => cs.map((c) => `(${c.map((x, i) => `${x} ${COLOURS[i][0].toUpperCase()}`).join(', ')}): ${choose(cnt[0], c[0])}×${choose(cnt[1], c[1])}×${choose(cnt[2], c[2])} = ${wgt(c)}`).join('; ')
  const why = [
    `Drawing ${k} balls one after another without replacement gives the same probabilities as choosing a set of ${k} balls from ${n}; total = C(${n},${k}) = ${choose(n, k)}.`,
    B ? `Condition “${B.text}”: ${termTxt(space)} ⇒ n(B) = ${totW}.` : '',
    `Favourable${B ? ' (condition and event both hold)' : ''}: ${termTxt(fav)} ⇒ ${favW}.`,
    B ? `P = ${favW}/${totW} = ${fr(favW, totW)}.` : `P = ${favW}/${choose(n, k)} = ${fr(favW, choose(n, k))}.`,
  ]
    .filter(Boolean)
    .join('\n')
  const wr: Frac[] = [withRepl, plainA, joint, F(favW, choose(n, k) * k)]
  const q = probQ(rng, bag + q1, favW, totW, wr, why)
  return tag(q, 'pb-balls', { cnt, k, A: A.text, B: B ? B.text : '' })
}

// ---- dice and cards ------------------------------------------------------------------------------------------
type DiceEv = { id: string; text: string; test: (d: number[]) => boolean }
const PRIMES = new Set([2, 3, 5, 7, 11])
const DICE2: DiceEv[] = [
  { id: 'sum-prime', text: 'the sum of the two numbers is a prime number', test: (d) => PRIMES.has(d[0] + d[1]) },
  { id: 'sum-mult4', text: 'the sum of the two numbers is a multiple of 4', test: (d) => (d[0] + d[1]) % 4 === 0 },
  { id: 'sum-ge9', text: 'the sum of the two numbers is at least 9', test: (d) => d[0] + d[1] >= 9 },
  { id: 'prod-even', text: 'the product of the two numbers is even', test: (d) => (d[0] * d[1]) % 2 === 0 },
  { id: 'diff', text: 'the two numbers are different', test: (d) => d[0] !== d[1] },
  { id: 'prod-gt12', text: 'the product of the two numbers is greater than 12', test: (d) => d[0] * d[1] > 12 },
  { id: 'sum-even', text: 'the sum of the two numbers is even', test: (d) => (d[0] + d[1]) % 2 === 0 },
  { id: 'has6', text: 'at least one die shows 6', test: (d) => d[0] === 6 || d[1] === 6 },
  { id: 'both-odd', text: 'both numbers are odd', test: (d) => d[0] % 2 === 1 && d[1] % 2 === 1 },
  { id: 'prod-mult3', text: 'the product of the two numbers is a multiple of 3', test: (d) => (d[0] * d[1]) % 3 === 0 },
]
export const DICE2_EVENTS = DICE2.map((e) => e.id)

function enumDice(nd: number, fn: (d: number[]) => void): void {
  const cur: number[] = []
  const rec = (): void => {
    if (cur.length === nd) {
      fn(cur)
      return
    }
    for (let f = 1; f <= 6; f++) {
      cur.push(f)
      rec()
      cur.pop()
    }
  }
  rec()
}

/** Two dice (or three) with a conditional event. */
function pbDice(rng: Rng): QuestionDraft {
  const three = rng.chance(0.4)
  if (!three) {
    const A = rng.pick(DICE2)
    const B = rng.pick(DICE2)
    need(A.id !== B.id, 'distinct events')
    let nb = 0
    let nab = 0
    const pairs: string[] = []
    enumDice(2, (d) => {
      if (B.test(d)) {
        nb++
        if (A.test(d)) {
          nab++
          pairs.push(`(${d[0]},${d[1]})`)
        }
      }
    })
    need(nab > 0 && nab < nb && nb < 36, 'non-trivial')
    // second method: ordered-pair double loop with exact fractions
    let ok = F(0)
    for (let a = 1; a <= 6; a++) for (let b = 1; b <= 6; b++) if (B.test([a, b]) && A.test([a, b])) ok = fadd(ok, F(1, nb))
    ensure(feq(ok, F(nab, nb)), 'dice2: second enumeration differs')
    const na = (() => {
      let c = 0
      enumDice(2, (d) => {
        if (A.test(d)) c++
      })
      return c
    })()
    const stem = `Two fair dice are thrown together. Given that ${B.text}, what is the probability that ${A.text}?`
    const why = [`Total outcomes = 36. Outcomes satisfying the condition (${B.text}): n(B) = ${nb}.`, `Of these, the outcomes where ${A.text}: ${pairs.length <= 14 ? `${pairs.join(', ')} ⇒ ` : ''}n(A ∩ B) = ${nab}.`, `P(A | B) = n(A ∩ B)/n(B) = ${nab}/${nb} = ${fr(nab, nb)}.`].join('\n')
    return tag(probQ(rng, stem, nab, nb, [F(na, 36), F(nab, 36), F(nb - nab, nb), F(nab, na)], why), 'pb-dice', { nd: 2, A: A.id, B: B.id })
  }
  const s = rng.int(8, 13)
  const evs3: { id: string; text: string; test: (d: number[]) => boolean }[] = [
    { id: `sum-${s}`, text: `the sum of the three numbers is ${s}`, test: (d) => d[0] + d[1] + d[2] === s },
    { id: 'exactly-two-same', text: 'exactly two of the dice show the same number', test: (d) => new Set(d).size === 2 },
    { id: 'max5', text: 'the highest number shown is exactly 5', test: (d) => Math.max(...d) === 5 },
    { id: 'all-diff', text: 'all three numbers are different', test: (d) => new Set(d).size === 3 },
    { id: 'has6', text: 'at least one die shows 6', test: (d) => d.includes(6) },
    { id: 'first-odd', text: 'the first die shows an odd number', test: (d) => d[0] % 2 === 1 },
  ]
  const A = rng.pick(evs3.slice(0, 3))
  const B = rng.pick(evs3.slice(3))
  let nb = 0
  let nab = 0
  let na = 0
  enumDice(3, (d) => {
    const b = B.test(d)
    const a = A.test(d)
    if (a) na++
    if (b) {
      nb++
      if (a) nab++
    }
  })
  need(nab > 0 && nab < nb, 'non-trivial')
  // second method: count with the conditioning folded into a single filtered list
  const filtered: number[][] = []
  for (let a = 1; a <= 6; a++) for (let b = 1; b <= 6; b++) for (let c = 1; c <= 6; c++) if (B.test([a, b, c])) filtered.push([a, b, c])
  ensure(filtered.length === nb && filtered.filter((d) => A.test(d)).length === nab, 'dice3: second enumeration differs')
  const stem = `Three fair dice are thrown together. Given that ${B.text}, what is the probability that ${A.text}?`
  const why = [`Total outcomes = 6³ = 216. Outcomes satisfying the condition (${B.text}): n(B) = ${nb}.`, `Outcomes in B where ${A.text}: n(A ∩ B) = ${nab}.`, `P(A | B) = ${nab}/${nb} = ${fr(nab, nb)}.`].join('\n')
  return tag(probQ(rng, stem, nab, nb, [F(na, 216), F(nab, 216), F(nb - nab, nb), F(nab, na)], why), 'pb-dice', { nd: 3, A: A.id, B: B.id, s })
}

type Card = { rank: number; suit: number }
const isRed = (c: Card): boolean => c.suit < 2
type CardEv = { id: string; text: string; test: (a: Card, b: Card) => boolean; closed?: number }
const CARD_EVS: CardEv[] = [
  { id: 'same-suit', text: 'both cards belong to the same suit', test: (a, b) => a.suit === b.suit, closed: 4 * choose(13, 2) },
  { id: 'same-colour', text: 'both cards are of the same colour', test: (a, b) => isRed(a) === isRed(b), closed: 2 * choose(26, 2) },
  { id: 'one-ace', text: 'at least one of the cards is an ace', test: (a, b) => a.rank === 0 || b.rank === 0, closed: choose(52, 2) - choose(48, 2) },
  { id: 'king-queen', text: 'one card is a king and the other is a queen', test: (a, b) => (a.rank === 12 && b.rank === 11) || (a.rank === 11 && b.rank === 12), closed: 16 },
  { id: 'both-face', text: 'both cards are face cards (J, Q or K)', test: (a, b) => a.rank >= 10 && b.rank >= 10, closed: choose(12, 2) },
  { id: 'heart-spade', text: 'one card is a heart and the other is a spade', test: (a, b) => (a.suit === 0 && b.suit === 2) || (a.suit === 2 && b.suit === 0), closed: 169 },
  { id: 'pair', text: 'both cards have the same rank', test: (a, b) => a.rank === b.rank, closed: 13 * choose(4, 2) },
  { id: 'at-least-one-red', text: 'at least one of the cards is red', test: (a, b) => isRed(a) || isRed(b), closed: choose(52, 2) - choose(26, 2) },
  { id: 'both-red', text: 'both cards are red', test: (a, b) => isRed(a) && isRed(b), closed: choose(26, 2) },
  { id: 'one-face', text: 'at least one of the cards is a face card', test: (a, b) => a.rank >= 10 || b.rank >= 10, closed: choose(52, 2) - choose(40, 2) },
]
export const CARD_EVENTS = CARD_EVS.map((e) => e.id)
const DECK: Card[] = []
for (let s = 0; s < 4; s++) for (let r = 0; r < 13; r++) DECK.push({ rank: r, suit: s })

/** Two cards drawn from a pack, conditional or plain event. */
function pbCards(rng: Rng): QuestionDraft {
  const A = rng.pick(CARD_EVS)
  const conditional = rng.chance(0.6)
  const B = conditional ? rng.pick(CARD_EVS) : null
  need(!B || B.id !== A.id, 'distinct')
  let nb = 0
  let nab = 0
  let na = 0
  for (let i = 0; i < 52; i++) for (let j = i + 1; j < 52; j++) {
    const a = A.test(DECK[i], DECK[j])
    if (a) na++
    if (!B || B.test(DECK[i], DECK[j])) {
      nb++
      if (a) nab++
    }
  }
  // second method: ordered draws i ≠ j count every pair twice
  let nb2 = 0
  let nab2 = 0
  for (let i = 0; i < 52; i++) for (let j = 0; j < 52; j++) {
    if (i === j) continue
    if (!B || B.test(DECK[i], DECK[j])) {
      nb2++
      if (A.test(DECK[i], DECK[j])) nab2++
    }
  }
  ensure(nb2 === 2 * nb && nab2 === 2 * nab, 'cards: ordered vs unordered enumeration')
  if (!B) ensure(A.closed === na, 'cards: closed form differs')
  need(nab > 0 && nab < nb, 'non-trivial')
  const stem = `Two cards are drawn at random, without replacement, from a well-shuffled pack of 52 playing cards. ${B ? `Given that ${B.text}, what is the probability that ${A.text}?` : `What is the probability that ${A.text}?`}`
  const why = B
    ? [`Total ways of choosing 2 cards = C(52,2) = 1326.`, `Ways in which ${B.text}: n(B) = ${nb}.`, `Ways in which both these conditions hold (${B.text}, and ${A.text}): n(A ∩ B) = ${nab}.`, `P(A | B) = ${nab}/${nb} = ${fr(nab, nb)}.`].join('\n')
    : [`Total ways of choosing 2 cards = C(52,2) = 1326.`, `Favourable ways (${A.text}) = ${nab}${A.closed !== undefined ? ' (counted by choosing the ranks/suits/colours involved and the cards within them)' : ''}.`, `P = ${nab}/1326 = ${fr(nab, 1326)}.`].join('\n')
  const wr: Frac[] = [F(na, 1326), F(nab, 1326), F(nab, 2652), F(nb - nab, nb)]
  return tag(probQ(rng, stem, nab, nb, wr, why), 'pb-cards', { A: A.id, B: B ? B.id : '' })
}

/** Digits arranged into numbers with conditions (even / divisible by 5 / odd, at least a bound; with or without repetition). */
function pbNumbers(rng: Rng): QuestionDraft {
  const digitsPool = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]
  const size = rng.int(6, 8)
  const S0 = rng.sample(digitsPool, size).sort((a, b) => a - b)
  const rep = rng.chance(0.3)
  const nd = rep ? 4 : rng.int(4, 5)
  const cond = rng.pick(['even', 'div5', 'odd'] as const)
  const useBound = rng.chance(0.6)
  const t = useBound ? rng.int(2, 6) : 1
  const E = S0.filter((d) => (cond === 'even' ? d % 2 === 0 : cond === 'odd' ? d % 2 === 1 : d % 5 === 0))
  need(E.length > 0, 'last digits')
  const Fset = S0.filter((d) => d !== 0 && d >= t)
  need(Fset.length >= 2, 'first digits')
  const low = t * 10 ** (nd - 1)
  // formula
  let formula = 0
  const lines: string[] = []
  if (rep) {
    formula = Fset.length * size ** (nd - 2) * E.length
    lines.push(`Digits may repeat. First digit: from {${Fset.join(', ')}} (non-zero${useBound ? ` and at least ${t}` : ''}) = ${Fset.length} ways.`, `Last digit from {${E.join(', ')}} = ${E.length} ways; each of the ${nd - 2} middle places can take any of the ${size} digits.`, `Total = ${Fset.length} × ${size}^${nd - 2} × ${E.length} = ${formula}.`)
  } else {
    const perLast = E.map((e) => ({ e, first: Fset.filter((d) => d !== e).length }))
    formula = perLast.reduce((a, x) => a + x.first * P_(size - 2, nd - 2), 0)
    lines.push(`No digit repeats. Fix the last digit, then the first digit, then fill the middle: after these two, ${size - 2} digits remain for ${nd - 2} places, i.e. P(${size - 2},${nd - 2}) = ${P_(size - 2, nd - 2)} ways.`)
    lines.push(...perLast.map((x) => `Last digit ${x.e}: first digit can be any of {${Fset.filter((d) => d !== x.e).join(', ')}} = ${x.first} ways ⇒ ${x.first} × ${P_(size - 2, nd - 2)} = ${x.first * P_(size - 2, nd - 2)}.`))
    lines.push(`Total = ${formula}.`)
  }
  // independent brute force over all digit strings
  let brute = 0
  const cur: number[] = []
  const rec = (): void => {
    if (cur.length === nd) {
      const last = cur[nd - 1]
      const ok = (cond === 'even' ? last % 2 === 0 : cond === 'odd' ? last % 2 === 1 : last % 5 === 0) && cur[0] !== 0 && cur[0] >= t
      if (ok) brute++
      return
    }
    for (const d of S0) {
      if (!rep && cur.includes(d)) continue
      cur.push(d)
      rec()
      cur.pop()
    }
  }
  rec()
  ensure(brute === formula, 'numbers: brute-force count differs')
  const condTxt = cond === 'even' ? 'even' : cond === 'odd' ? 'odd' : 'divisible by 5'
  const stem = `How many ${nd}-digit numbers ${useBound ? `that are not less than ${low}, ` : ''}which are ${condTxt}, can be formed using the digits ${S0.join(', ')} ${rep ? 'if the digits may be repeated' : 'if no digit is repeated'}?`
  const wrong = rep ? [(S0.length - (S0.includes(0) ? 1 : 0)) * size ** (nd - 2) * E.length, Fset.length * size ** (nd - 1), Fset.length * size ** (nd - 2) * (E.length + 1)] : [E.length * Fset.length * P_(size - 2, nd - 2), Fset.length * E.length * P_(size - 2, nd - 2) + P_(size - 1, nd - 1), P_(size, nd) / 2]
  return tag(nq(rng, PB, stem, P(formula), PW(wrong), lines.join('\n'), { none: NONE }), 'pb-numbers', { S0, nd, rep, cond, t })
}

/** Circular arrangements with adjacency conditions. */
function pbCircular(rng: Rng): QuestionDraft {
  const variant = rng.int(0, 4)
  const m = rng.int(3, 5)
  const w = variant === 0 ? m : rng.int(2, 4)
  need(m + w <= 8, 'size')
  const n = m + w
  const [m1, m2] = pickMen(rng, 2)
  let formula: number
  let text: string
  let why: string[]
  let wrongs: number[]
  if (variant === 0) {
    formula = fact(m - 1) * fact(w)
    text = `${m} men and ${w} women sit around a circular table so that men and women sit alternately`
    why = [`Seat the ${m} men first in a circle: (${m} − 1)! = ${fact(m - 1)} ways.`, `The ${w} women go into the ${m} gaps between consecutive men: ${w}! = ${fact(w)} ways.`, `Total = ${fact(m - 1)} × ${fact(w)} = ${formula}.`]
    wrongs = [fact(m) * fact(w), fact(m - 1) * fact(w - 1), 2 * fact(m - 1) * fact(w), fact(m + w - 1)]
  } else if (variant === 1) {
    need(w <= m, 'women fit')
    formula = fact(m - 1) * P_(m, w)
    text = `${m} men and ${w} women sit around a circular table so that no two women sit together`
    why = [`Seat the ${m} men first: (${m} − 1)! = ${fact(m - 1)} ways, creating ${m} gaps.`, `Choose and arrange ${w} women in the ${m} gaps: P(${m},${w}) = ${P_(m, w)} ways.`, `Total = ${fact(m - 1)} × ${P_(m, w)} = ${formula}.`]
    wrongs = [fact(m) * P_(m, w), fact(m - 1) * P_(m + 1, w), fact(m - 1) * choose(m, w), fact(m + w - 1) - formula]
  } else if (variant === 2) {
    need(w <= m - 1 && m >= 3, 'fits')
    formula = 2 * fact(m - 2) * P_(m - 1, w)
    text = `${m} men and ${w} women sit around a circular table so that no two women sit together and the two men ${m1} and ${m2} always sit next to each other`
    why = [`Treat ${m1} and ${m2} as one unit: ${m - 1} units of men in a circle can be arranged in (${m - 1} − 1)! = ${fact(m - 2)} ways, and the pair can swap places in 2 ways.`, `The units create ${m - 1} gaps (the gap inside the pair is not available), and ${w} women are placed in them in P(${m - 1},${w}) = ${P_(m - 1, w)} ways.`, `Total = ${fact(m - 2)} × 2 × ${P_(m - 1, w)} = ${formula}.`]
    wrongs = [fact(m - 2) * P_(m - 1, w), 2 * fact(m - 2) * P_(m, w), 2 * fact(m - 1) * P_(m - 1, w), fact(m - 1) * P_(m, w)]
  } else if (variant === 3) {
    formula = fact(n - 2) * (n - 3)
    text = `${n} persons, including ${m1} and ${m2}, sit around a circular table so that ${m1} and ${m2} are not seated next to each other`
    why = [`Total circular arrangements = (${n} − 1)! = ${fact(n - 1)}.`, `Arrangements with ${m1} and ${m2} together = 2 × (${n} − 2)! = ${2 * fact(n - 2)}.`, `Required = ${fact(n - 1)} − ${2 * fact(n - 2)} = ${formula}.`]
    wrongs = [2 * fact(n - 2), fact(n - 1), fact(n - 1) - fact(n - 2), fact(n) - 2 * fact(n - 1)]
  } else {
    need(w >= 2, 'women')
    formula = fact(m) * fact(w)
    text = `${m} men and ${w} women sit around a circular table so that all the women sit together`
    why = [`Treat the ${w} women as one block: ${m} men + 1 block = ${m + 1} units in a circle: (${m + 1} − 1)! = ${fact(m)} ways.`, `The women can be arranged within the block in ${w}! = ${fact(w)} ways.`, `Total = ${fact(m)} × ${fact(w)} = ${formula}.`]
    wrongs = [fact(m + 1) * fact(w), fact(m) * fact(w - 1), fact(m - 1) * fact(w), fact(n - 1)]
  }
  // independent brute force: person 0 fixed at seat 0 (rotations are the same arrangement)
  const isWoman = (p: number): boolean => p >= m
  const rest = Array.from({ length: n - 1 }, (_, i) => i + 1)
  let brute = 0
  eachPerm(rest, (perm) => {
    const seat = [0, ...perm]
    const adj = (x: number, y: number): boolean => {
      const ix = seat.indexOf(x)
      const iy = seat.indexOf(y)
      const dd = Math.abs(ix - iy)
      return dd === 1 || dd === n - 1
    }
    let ok = true
    if (variant === 0) {
      ok = seat.every((p, i) => isWoman(p) !== isWoman(seat[(i + 1) % n]))
    } else if (variant === 1) {
      ok = seat.every((p, i) => !(isWoman(p) && isWoman(seat[(i + 1) % n])))
    } else if (variant === 2) {
      ok = seat.every((p, i) => !(isWoman(p) && isWoman(seat[(i + 1) % n]))) && adj(0, 1)
    } else if (variant === 3) {
      ok = !adj(0, 1)
    } else {
      // all women contiguous around the circle: exactly one boundary man→woman
      let starts = 0
      for (let i = 0; i < n; i++) if (isWoman(seat[i]) && !isWoman(seat[(i + n - 1) % n])) starts++
      ok = starts === 1
    }
    if (ok) brute++
  })
  ensure(brute === formula, 'circular: brute-force count differs')
  const stem = `In how many different ways can ${text}?`
  return tag(nq(rng, PB, stem, P(formula), PW(wrongs), why.join('\n'), { none: NONE }), 'pb-circular', { variant, m, w })
}

/** Select k letters of a word with a vowel/consonant split and arrange them (with optional condition). */
function pbSelectArrange(rng: Rng): QuestionDraft {
  const pool = ['MACHINE', 'PLAYING', 'CHARITY', 'PICTURE', 'KITCHEN', 'PAINTER', 'HOSTILE', 'MARKING', 'FLOWERS', 'MONKEY']
  const word = rng.pick(pool)
  const letters = word.split('')
  need(new Set(letters).size === letters.length, 'distinct letters')
  const V = letters.filter((x) => VOWELS.has(x)).length
  const C = letters.length - V
  const k = rng.int(4, 5)
  const vv = rng.int(2, Math.min(3, V, k - 1))
  const cc = k - vv
  need(cc <= C && cc >= 2, 'split')
  const cond = rng.pick(['none', 'together', 'startC'] as const)
  const sel = choose(V, vv) * choose(C, cc)
  const arr = cond === 'none' ? fact(k) : cond === 'together' ? fact(cc + 1) * fact(vv) : cc * fact(k - 1)
  const formula = sel * arr
  // brute force over all k-permutations of the letters
  let brute = 0
  const used = new Array(letters.length).fill(false)
  const cur: number[] = []
  const rec = (): void => {
    if (cur.length === k) {
      const t = cur.map((i) => VOWELS.has(letters[i]))
      if (t.filter(Boolean).length !== vv) return
      if (cond === 'none') brute++
      else if (cond === 'startC') {
        if (!t[0]) brute++
      } else {
        const idx = t.map((x, i) => (x ? i : -1)).filter((i) => i >= 0)
        if (idx[idx.length - 1] - idx[0] === idx.length - 1) brute++
      }
      return
    }
    for (let i = 0; i < letters.length; i++) {
      if (used[i]) continue
      used[i] = true
      cur.push(i)
      rec()
      cur.pop()
      used[i] = false
    }
  }
  rec()
  ensure(brute === formula, 'select-arrange: brute-force count differs')
  const condTxt = cond === 'none' ? '' : cond === 'together' ? ', in which the vowels are always together' : ', which begin with a consonant'
  const stem = `How many ${k}-letter arrangements (with or without meaning) can be formed from the letters of the word ${word}, each containing exactly ${vv} vowels and ${cc} consonants${condTxt}? (No letter is used more than once.)`
  const why = [
    `${word} has ${V} vowels and ${C} consonants.`,
    `Selection: ${vv} vowels from ${V} and ${cc} consonants from ${C} = C(${V},${vv}) × C(${C},${cc}) = ${choose(V, vv)} × ${choose(C, cc)} = ${sel}.`,
    cond === 'none' ? `Each selection of ${k} letters can be arranged in ${k}! = ${arr} ways.` : cond === 'together' ? `Vowels as one block: (${cc} + 1)! = ${fact(cc + 1)} ways for the units, × ${vv}! = ${fact(vv)} ways inside the block = ${arr}.` : `The first place can be filled by any of the ${cc} consonants and the other ${k - 1} letters in (${k} − 1)! = ${fact(k - 1)} ways = ${arr}.`,
    `Total = ${sel} × ${arr} = ${formula}.`,
  ].join('\n')
  const wrong = [sel, sel * fact(k), P_(letters.length, k), choose(letters.length, k), Math.round(formula / 2)]
  return tag(nq(rng, PB, stem, P(formula), PW(wrong), why, { none: NONE }), 'pb-select-arrange', { word, k, vv, cond })
}

export const PB_TPLS: Tpl[] = [
  { name: 'pb-committee', gen: (r) => pbCommittee(r) },
  { name: 'pb-letters', gen: (r) => pbLetters(r) },
  { name: 'pb-balls', gen: (r) => pbBalls(r) },
  { name: 'pb-dice', gen: (r) => pbDice(r) },
  { name: 'pb-cards', gen: (r) => pbCards(r) },
  { name: 'pb-numbers', gen: (r) => pbNumbers(r) },
  { name: 'pb-circular', gen: (r) => pbCircular(r) },
  { name: 'pb-select-arrange', gen: (r) => pbSelectArrange(r) },
]

// ============================================================================ registry
/** Some templates reject most random draws; retry them internally (cheap) before giving up to genSingles' own loop. */
function persistent(t: Tpl): Tpl {
  return {
    name: t.name,
    gen: (rng, d) => {
      for (let i = 0; i < 60; i++) {
        try {
          return t.gen(rng, d)
        } catch (e) {
          if (!(e instanceof Reject)) throw e
        }
      }
      throw new Reject(`${t.name}: no clean draw`)
    },
  }
}
function run(tpls: Tpl[]): TopicGenerator {
  const pool = tpls.map(persistent)
  return (rng: Rng, difficulty: MockDifficulty, count: number): Group[] => genSingles(rng, difficulty, count, pool)
}

/** Mains-level (very hard, multi-concept) generators; the `difficulty` argument is ignored. */
export const MAINS_ARITH_B: Partial<Record<QuantTopicId, TopicGenerator>> = {
  'time-work': run(TW_TPLS),
  'speed-distance': run(SD_TPLS),
  'mixture-alligation': run(MX_TPLS),
  mensuration: run(ME_TPLS),
  'probability-pnc': run(PB_TPLS),
}
