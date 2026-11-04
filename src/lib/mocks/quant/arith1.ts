// Percentage, Profit & Loss, Ratio & Partnership, Ages & Averages.
// Every template is designed backwards from clean parameters and cross-checks its key with a second method.
import type { Rng } from '../rng'
import type { Group, MockDifficulty, QuestionDraft } from '../types'
import { F, Reject, decStr, ensure, fadd, fdiv, feq, fint, fmul, fsub, fval, gcd, genSingles, inr, need, nq, pickMen, pickNames, ratioStr, rstep, strQ, terminating } from './util'
import type { Frac, Tpl } from './util'

const P = (n: number): Frac => F(n)
const cx = (n: number): string => (n === 1 ? 'x' : `${n}x`)
const pc = (n: number | Frac): string => (typeof n === 'number' ? String(n) : decStr(n, 2))

// ============================================================================ PERCENTAGE
const CHANGES = [10, 20, 25, 30, 40, 50]

function pctChain(rng: Rng, d: MockDifficulty): QuestionDraft {
  const x = rng.pick(CHANGES)
  const y = rng.pick(CHANGES)
  const N = rstep(rng, d === 'hard' ? 400 : 200, d === 'hard' ? 3000 : 1500, 100)
  const step1 = fdiv(fmul(P(N), P(100 + x)), P(100))
  const fin = fdiv(fmul(step1, P(100 - y)), P(100))
  ensure(feq(fin, fdiv(P(N * (100 + x) * (100 - y)), P(10000))), 'percentage chain mismatch')
  need(fint(step1) && fint(fin), 'unclean chain')
  const form = rng.int(0, 2)
  if (form === 0) {
    return nq(rng, 'percentage', `A number is first increased by ${x}% and then decreased by ${y}%. If the original number is ${N}, what is the resulting number?`, fin, [step1, N, fdiv(fmul(P(N), P(100 + x - y)), P(100))], `After ${x}% increase: ${N} × ${100 + x}/100 = ${pc(step1)}.\nAfter ${y}% decrease: ${pc(step1)} × ${100 - y}/100 = ${pc(fin)}.`)
  }
  if (form === 1) {
    const net = fsub(fdiv(P((100 + x) * (100 - y)), P(100)), P(100))
    need(terminating(net, 2) && net.n !== 0, 'net change unclean')
    const inc = net.n > 0
    const mag = F(Math.abs(net.n), net.d)
    return nq(rng, 'percentage', `The price of an article is first increased by ${x}% and then decreased by ${y}%. What is the net percentage ${inc ? 'increase' : 'decrease'} in the price?`, mag, [x - y, Math.abs(x - y) + 1, fval(mag) + 2, x + y], `Net change = ${x} − ${y} + (${x} × (−${y}))/100 = ${decStr(net, 2).replace('-', '−')}%.\nOverall factor = ${100 + x}/100 × ${100 - y}/100 = ${pc(fdiv(P((100 + x) * (100 - y)), P(10000)))}.`, { post: '%' })
  }
  return nq(rng, 'percentage', `A number is increased by ${x}% and the result is then decreased by ${y}%. If the final number is ${pc(fin)}, what was the original number?`, N, [fin, fdiv(P(N), P(2)), fmul(P(N), P(2)), fdiv(fmul(fin, P(100)), P(100 + x))], `Original × ${100 + x}/100 × ${100 - y}/100 = ${pc(fin)}.\nOriginal = ${pc(fin)} × 100/${100 + x} × 100/${100 - y} = ${N}.`)
}

function pctElection(rng: Rng, d: MockDifficulty): QuestionDraft {
  const p = rng.pick([55, 60, 65, 70, 75])
  const invalid = d === 'hard' || rng.chance(0.5) ? rng.pick([5, 8, 10, 12, 15, 20, 25]) : 0
  const T = rstep(rng, 2000, 20000, 500)
  const V = (T * (100 - invalid)) / 100
  need(Number.isInteger(V) && (V * p) % 100 === 0, 'votes not integral')
  const win = (V * p) / 100
  const lose = V - win
  const W = win - lose
  ensure(W === (V * (2 * p - 100)) / 100, 'election margin mismatch')
  const form = rng.int(0, 2)
  const nm = pickNames(rng, 2)
  if (invalid === 0) {
    if (form === 2) return nq(rng, 'percentage', `In an election between ${nm[0]} and ${nm[1]}, ${nm[0]} secured ${p}% of the total votes and won by ${W} votes. How many votes did ${nm[1]} get?`, lose, [win, W, V - lose + 100, fdiv(P(W), P(2))], `Margin = (${p} − ${100 - p})% of total = ${2 * p - 100}% of total = ${W}.\nTotal = ${W} × 100/${2 * p - 100} = ${V}.\n${nm[1]}'s votes = ${100 - p}% of ${V} = ${lose}.`)
    return nq(rng, 'percentage', `In an election between two candidates, the winner got ${p}% of the total votes and won by ${W} votes. What was the total number of votes polled?`, V, [win, lose, W * 2, fdiv(P(W * 100), P(p))], `Margin = (${p} − ${100 - p})% = ${2 * p - 100}% of total votes = ${W}.\nTotal votes = ${W} × 100/${2 * p - 100} = ${V}.`)
  }
  if (form === 2) return nq(rng, 'percentage', `In an election between two candidates, ${invalid}% of the votes polled were invalid. The winner got ${p}% of the valid votes and won by ${W} votes. How many votes did the loser get?`, lose, [win, W, T - win, fdiv(P(W * 100), P(2 * p - 100)) /* valid votes */], `Margin = ${2 * p - 100}% of valid votes = ${W}, so valid votes = ${V}.\nLoser's votes = ${100 - p}% of ${V} = ${lose}.`)
  return nq(rng, 'percentage', `In an election between two candidates, ${invalid}% of the votes polled were invalid. The winning candidate got ${p}% of the valid votes and won by ${W} votes. What was the total number of votes polled?`, T, [V, W * 4, fdiv(P(V * 100), P(100 + invalid)), win], `Margin = ${2 * p - 100}% of valid votes = ${W}, so valid votes = ${V}.\nValid votes are ${100 - invalid}% of the votes polled, so votes polled = ${V} × 100/${100 - invalid} = ${T}.`)
}

function pctPopulation(rng: Rng, d: MockDifficulty): QuestionDraft {
  const r = rng.pick([5, 10, 20, 25])
  const base: Record<number, number> = { 5: 400, 10: 100, 20: 25, 25: 16 }
  const P0 = rstep(rng, d === 'hard' ? 8000 : 4000, d === 'hard' ? 80000 : 40000, base[r] * (r === 25 ? 250 : r === 20 ? 40 : r === 5 ? 25 : 100))
  const city = rng.pick(['A town', 'A village', 'A city'])
  const P1 = fdiv(fmul(P(P0), P(100 + r)), P(100))
  const P2 = fdiv(fmul(P1, P(100 + r)), P(100))
  need(fint(P1) && fint(P2), 'population not integral')
  ensure(P2.n === (P0 * (100 + r) * (100 + r)) / 10000, 'population mismatch')
  if (rng.chance(0.5)) return nq(rng, 'percentage', `The population of ${city.toLowerCase()} increases by ${r}% every year. If its present population is ${P0}, what will it be after two years?`, P2, [fadd(P(P0), fdiv(fmul(P(P0), P(2 * r)), P(100))), P1, fdiv(fmul(P(P0), P(100 - r)), P(100))], `After 1 year: ${P0} × ${100 + r}/100 = ${pc(P1)}.\nAfter 2 years: ${pc(P1)} × ${100 + r}/100 = ${pc(P2)}.`)
  const dec = rng.pick([10, 20, 25])
  const P3 = fdiv(fmul(P(P2.n), P(100 - dec)), P(100))
  if (!fint(P3)) return nq(rng, 'percentage', `The population of ${city.toLowerCase()} increases by ${r}% every year. Its population two years ago was ${P0}. What is its present population?`, P2, [P1, fadd(P(P0), fdiv(fmul(P(P0), P(2 * r)), P(100)))], `${P0} × ${100 + r}/100 × ${100 + r}/100 = ${pc(P2)}.`)
  return nq(rng, 'percentage', `${city} has a population of ${P0}. It increased by ${r}% in the first year and again by ${r}% in the second year. In the third year it decreased by ${dec}%. What is the population at the end of the third year?`, P3, [P2, fdiv(fmul(P(P0), P(100 - dec)), P(100)), P1], `Year 1: ${pc(P1)}; year 2: ${pc(P2)}; year 3: ${pc(P2)} × ${100 - dec}/100 = ${pc(P3)}.`)
}

function pctMarks(rng: Rng, d: MockDifficulty): QuestionDraft {
  const M = rstep(rng, 200, 1000, 50)
  const x = rstep(rng, 25, 45, 5)
  const y = rstep(rng, x + 10, 60, 5)
  const pass = rstep(rng, (M * (x + 5)) / 100, (M * (y - 5)) / 100, 1)
  need((M * x) % 100 === 0 && (M * y) % 100 === 0 && pass > (M * x) / 100 && pass < (M * y) / 100, 'marks unsuitable')
  const f = pass - (M * x) / 100
  const g = (M * y) / 100 - pass
  const nm = pickNames(rng, 2)
  const form = rng.int(0, d === 'hard' ? 2 : 1)
  const maxM = fdiv(P((f + g) * 100), P(y - x))
  ensure(maxM.n === M, 'marks maximum mismatch')
  const stem = `In an examination, ${nm[0]} scored ${x}% marks and failed by ${f} marks, while ${nm[1]} scored ${y}% marks and got ${g} marks more than the pass marks.`
  if (form === 0) return nq(rng, 'percentage', `${stem} What are the maximum marks of the examination?`, M, [pass, fdiv(P((f + g) * 100), P(y + x)), M + 100, M - 50], `(${y} − ${x})% of maximum = ${f} + ${g} = ${f + g}.\nMaximum = ${f + g} × 100/${y - x} = ${M}.`)
  if (form === 1) return nq(rng, 'percentage', `${stem} What are the pass marks?`, pass, [M, f + g, (M * x) / 100, (M * y) / 100], `(${y} − ${x})% of maximum = ${f + g}, so maximum = ${M}.\nPass marks = ${x}% of ${M} + ${f} = ${(M * x) / 100} + ${f} = ${pass}.`)
  return nq(rng, 'percentage', `${stem} What is the pass percentage?`, F(pass * 100, M), [x, y, fval(F(pass * 100, M)) + 5, (x + y) / 2], `Maximum = ${f + g} × 100/${y - x} = ${M}; pass marks = ${pass}.\nPass percentage = (${pass} ÷ ${M}) × 100 = ${decStr(F(pass * 100, M), 2)}%.`, { post: '%' })
}

function pctSalary(rng: Rng, d: MockDifficulty): QuestionDraft {
  const a = rng.pick([10, 20, 25, 30, 40])
  const b = rng.pick([10, 20, 25, 40, 50])
  const c = rng.pick([10, 20, 25, 50])
  const W = rstep(rng, 10000, 80000, 1000)
  const w1 = fdiv(fmul(P(W), P(100 - a)), P(100))
  const w2 = fdiv(fmul(w1, P(100 - b)), P(100))
  const w3 = fdiv(fmul(w2, P(100 - c)), P(100))
  need(fint(w1) && fint(w2) && fint(w3), 'salary chain unclean')
  const left = w3.n
  ensure(feq(w3, fdiv(P(W * (100 - a) * (100 - b) * (100 - c)), P(1000000))), 'salary chain mismatch')
  const nm = pickMen(rng, 1)[0]
  const three = d === 'hard' || rng.chance(0.4)
  if (!three) {
    return nq(rng, 'percentage', `${nm} spends ${a}% of his monthly salary on rent and ${b}% of the remaining on food. If he is left with ${inr(w2.n)}, what is his monthly salary?`, W, [w1, w2.n * 2, fdiv(P(w2.n * 100), P(100 - a - b))], `Remaining after rent = ${100 - a}%; after food = ${100 - a}% × ${100 - b}% = ${pc(fdiv(P((100 - a) * (100 - b)), P(100)))}% of salary.\nSalary = ${w2.n} ÷ ${pc(fdiv(P((100 - a) * (100 - b)), P(10000)))} = ${W}.`, { pre: '₹' })
  }
  if (rng.chance(0.5)) return nq(rng, 'percentage', `${nm} spends ${a}% of his monthly salary on rent, ${b}% of the remaining on food and ${c}% of the remaining on travel. If he is left with ${inr(left)}, what is his monthly salary?`, W, [w3.n * 2, w1, fdiv(P(left * 100), P(100 - a - b - c)), fdiv(P(left * 100), P(100 - c))], `Salary × ${100 - a}/100 × ${100 - b}/100 × ${100 - c}/100 = ${left}.\nSalary = ${left} ÷ ${pc(fdiv(P((100 - a) * (100 - b) * (100 - c)), P(1000000)))} = ${W}.`, { pre: '₹' })
  const food = fdiv(fmul(w1, P(b)), P(100))
  return nq(rng, 'percentage', `${nm} spends ${a}% of his monthly salary on rent, ${b}% of the remaining on food and ${c}% of the remaining on travel. If his monthly salary is ${inr(W)}, how much does he spend on food?`, food, [fmul(P(W), fdiv(P(b), P(100))), w1, fdiv(fmul(w2, P(c)), P(100))], `Salary after rent = ${inr(pc(w1))}.\nFood = ${b}% of ${pc(w1)} = ${inr(pc(food))}.`, { pre: '₹' })
}

function pctConsumption(rng: Rng): QuestionDraft {
  if (rng.chance(0.5)) {
    const x = rng.pick([25, 60, 100, 150, 300, 400])
    const ans = fdiv(P(100 * x), P(100 + x))
    need(terminating(ans, 1), 'unclean')
    const item = rng.pick(['sugar', 'rice', 'wheat', 'cooking oil'])
    ensure(feq(ans, fsub(P(100), fdiv(P(10000), P(100 + x)))), 'consumption mismatch')
    return nq(rng, 'percentage', `If the price of ${item} increases by ${x}%, by what percent must a family reduce its consumption of ${item} so that the expenditure remains unchanged?`, ans, [x, fdiv(P(x), P(2)), 100 - x > 0 ? 100 - x : x + 10, fdiv(P(100 * x), P(100 - x > 0 ? 100 - x : x + 100))], `Reduction % = x/(100 + x) × 100 = ${x}/${100 + x} × 100 = ${decStr(ans, 2)}%.`, { post: '%' })
  }
  const y = rng.pick([20, 50, 60, 75, 80, 37.5])
  const yf = F(Math.round(y * 10), 10)
  const ans = fdiv(fmul(P(100), yf), fsub(P(100), yf))
  need(terminating(ans, 2), 'unclean')
  const item = rng.pick(['petrol', 'milk', 'sugar', 'tea'])
  return nq(rng, 'percentage', `The price of ${item} falls by ${pc(yf)}%. By what percent should a person increase its consumption so that the total expenditure remains the same?`, ans, [y, 100 - y, fdiv(fmul(P(100), yf), P(100)), fval(ans) + 10], `Increase % = y/(100 − y) × 100 = ${pc(yf)}/${pc(fsub(P(100), yf))} × 100 = ${decStr(ans, 2)}%.`, { post: '%' })
}

function pctMoreLess(rng: Rng): QuestionDraft {
  const [a, b] = rng.pick([[25, 20], [60, 37.5], [100, 50], [150, 60], [300, 75], [400, 80]])
  const nm = pickNames(rng, 2)
  const what = rng.pick(['income', 'salary', 'marks', 'weight'])
  if (rng.chance(0.5)) {
    return nq(rng, 'percentage', `${nm[0]}'s ${what} is ${a}% more than ${nm[1]}'s ${what}. By what percent is ${nm[1]}'s ${what} less than ${nm[0]}'s ${what}?`, F(Math.round(b * 10), 10), [a, a / 2, 100 - a > 0 ? 100 - a : a - 50, b + 5], `Let ${nm[1]} = 100, then ${nm[0]} = ${100 + a}.\nLess % = ${a}/${100 + a} × 100 = ${b}%.`, { post: '%' })
  }
  return nq(rng, 'percentage', `${nm[0]}'s ${what} is ${b}% less than ${nm[1]}'s ${what}. By what percent is ${nm[1]}'s ${what} more than ${nm[0]}'s ${what}?`, a, [b, 100 - b, b + 10, a / 2], `Let ${nm[1]} = 100, then ${nm[0]} = ${100 - b}.\nMore % = ${b}/${100 - b} × 100 = ${a}%.`, { post: '%' })
}

function pctUnknown(rng: Rng, d: MockDifficulty): QuestionDraft {
  const N = rstep(rng, 100, d === 'hard' ? 1500 : 800, 50)
  const x = rng.pick([40, 45, 50, 55, 60, 65, 70, 75, 80])
  const z = rng.pick([10, 15, 20, 25, 30, 35])
  need(x > z && ((x - z) * N) % 100 === 0, 'unsuitable')
  const y = ((x - z) * N) / 100
  ensure(fdiv(P(y * 100), P(x - z)).n === N, 'unknown number mismatch')
  const w = rng.pick([20, 25, 40, 60, 75])
  need((w * N) % 100 === 0, 'unclean target')
  if (rng.chance(0.5)) return nq(rng, 'percentage', `${x}% of a number is ${y} more than ${z}% of the same number. What is the number?`, N, [y * 10, fdiv(P(y * 100), P(x + z)), N + 100, fdiv(P(y * 100), P(x))], `(${x} − ${z})% of the number = ${y}.\nNumber = ${y} × 100/${x - z} = ${N}.`)
  return nq(rng, 'percentage', `${x}% of a number is ${y} more than ${z}% of the same number. What is ${w}% of the number?`, (w * N) / 100, [N, (w * N) / 100 + 20, y, (w * N) / 100 - 15], `(${x} − ${z})% of the number = ${y}, so the number = ${N}.\n${w}% of ${N} = ${(w * N) / 100}.`)
}

function pctArea(rng: Rng, d: MockDifficulty): QuestionDraft {
  const form = rng.int(0, d === 'hard' ? 2 : 1)
  if (form === 0) {
    const x = rng.pick([10, 20, 30, 40, 50, 60])
    const net = fsub(fdiv(P((100 + x) * (100 + x)), P(100)), P(100))
    ensure(feq(net, F(2 * x * 100 + x * x, 100)), 'square area mismatch')
    return nq(rng, 'percentage', `If the side of a square is increased by ${x}%, by what percent does its area increase?`, net, [2 * x, x * x / 100, 2 * x + 1, x + 10], `New area = (${100 + x}/100)² = ${decStr(fdiv(P((100 + x) * (100 + x)), P(10000)), 4)} of the old area.\nIncrease = ${decStr(net, 2).replace('-', '−')}%.`, { post: '%' })
  }
  const x = rng.pick([10, 20, 25, 30, 40, 50])
  const y = rng.pick([10, 20, 25, 30, 40, 50])
  const net = fsub(fdiv(P((100 + x) * (100 - y)), P(100)), P(100))
  need(terminating(net, 2) && net.n !== 0, 'unclean')
  const inc = net.n > 0
  const mag = F(Math.abs(net.n), net.d)
  if (form === 1) return nq(rng, 'percentage', `The length of a rectangle is increased by ${x}% and its breadth is decreased by ${y}%. What is the percentage ${inc ? 'increase' : 'decrease'} in its area?`, mag, [Math.abs(x - y), x + y, fval(mag) + 3, Math.abs(x - y) + 2], `Net change = ${x} − ${y} − (${x} × ${y})/100 = ${decStr(net, 2).replace('-', '−')}%.`, { post: '%' })
  const L = rstep(rng, 20, 60, 5)
  const B = rstep(rng, 10, 40, 5)
  const old = L * B
  const nu = fdiv(P(L * (100 + x) * B * (100 - y)), P(10000))
  need(fint(nu), 'area not integral')
  return nq(rng, 'percentage', `The length and breadth of a rectangle are ${L} m and ${B} m respectively. If the length is increased by ${x}% and the breadth is decreased by ${y}%, what is the new area (in m²)?`, nu, [old, fdiv(P(old * (100 + x - y)), P(100)), fdiv(P(old * (100 + x)), P(100))], `New length = ${decStr(fdiv(P(L * (100 + x)), P(100)), 2)} m; new breadth = ${decStr(fdiv(P(B * (100 - y)), P(100)), 2)} m.\nNew area = ${pc(nu)} m².`)
}

function pctMixed(rng: Rng): QuestionDraft {
  const N = rstep(rng, 400, 2400, 200)
  const girlsP = rng.pick([40, 45, 50, 55, 60])
  const bp = rng.pick([40, 50, 60, 70, 80])
  const gp = rng.pick([50, 60, 70, 75, 80, 90])
  const boys = (N * (100 - girlsP)) / 100
  const girls = (N * girlsP) / 100
  const pb = (boys * bp) / 100
  const pg = (girls * gp) / 100
  need(Number.isInteger(boys) && Number.isInteger(girls) && Number.isInteger(pb) && Number.isInteger(pg), 'not integral')
  const passed = pb + pg
  ensure(F(passed * 100, N).n * 1 > 0, 'bad pass')
  const tot = rng.chance(0.5)
  if (tot) return nq(rng, 'percentage', `In a school, ${girlsP}% of the students are girls. If ${bp}% of the boys and ${gp}% of the girls passed an examination, and the total number of students is ${N}, how many students passed?`, passed, [pb, pg, fdiv(P(N * (bp + gp)), P(200)), N - passed], `Girls = ${girls}, boys = ${boys}.\nPassed boys = ${bp}% of ${boys} = ${pb}; passed girls = ${gp}% of ${girls} = ${pg}.\nTotal passed = ${passed}.`)
  const ans = F(passed * 100, N)
  need(terminating(ans, 2), 'unclean')
  return nq(rng, 'percentage', `In a school, ${girlsP}% of the students are girls. If ${bp}% of the boys and ${gp}% of the girls passed an examination, what percent of the total students passed?`, ans, [(bp + gp) / 2, bp, gp, fval(ans) + 4], `Take ${N} students: girls = ${girls}, boys = ${boys}.\nPassed = ${bp}% of ${boys} + ${gp}% of ${girls} = ${pb} + ${pg} = ${passed}.\nPercent passed = ${passed}/${N} × 100 = ${decStr(ans, 2)}%.`, { post: '%' })
}

export const PERCENTAGE_TPLS: Tpl[] = [
  { name: 'pct-chain', gen: pctChain },
  { name: 'pct-election', gen: pctElection },
  { name: 'pct-population', gen: pctPopulation },
  { name: 'pct-marks', gen: pctMarks },
  { name: 'pct-salary', gen: pctSalary },
  { name: 'pct-consumption', gen: (r) => pctConsumption(r) },
  { name: 'pct-morelessthan', gen: (r) => pctMoreLess(r) },
  { name: 'pct-unknown', gen: pctUnknown },
  { name: 'pct-area', gen: pctArea },
  { name: 'pct-mixed', d: 'hard', gen: (r) => pctMixed(r) },
]

// ============================================================================ PROFIT & LOSS
const PCTS = [5, 10, 12.5, 15, 20, 25, 30, 40]
const fp = (p: number): Frac => F(Math.round(p * 10), 10)

function plSimple(rng: Rng, d: MockDifficulty): QuestionDraft {
  const C = rstep(rng, 200, d === 'hard' ? 8000 : 4000, 40)
  const p = rng.pick(PCTS)
  const loss = rng.chance(0.4)
  const sgn = loss ? -1 : 1
  const factor = fdiv(fadd(P(100), fmul(P(sgn), fp(p))), P(100))
  const sp = fmul(P(C), factor)
  need(fint(sp), 'SP not integral')
  const item = rng.pick(['a bag', 'a watch', 'a mobile phone', 'a table', 'a shirt'])
  const kind = rng.int(0, 2)
  const word = loss ? 'loss' : 'profit'
  if (kind === 0) return nq(rng, 'profit-loss', `A shopkeeper bought ${item} for ${inr(C)} and sold it at a ${pc(fp(p))}% ${word}. At what price did he sell it?`, sp, [fdiv(fmul(P(C), fadd(P(100), fmul(P(-sgn), fp(p)))), P(100)), C, fadd(P(C), fp(p))], `SP = ${C} × (100 ${loss ? '−' : '+'} ${pc(fp(p))})/100 = ${inr(pc(sp))}.`, { pre: '₹' })
  if (kind === 1) return nq(rng, 'profit-loss', `${item[0].toUpperCase() + item.slice(1)} is sold for ${inr(sp.n)} at a ${pc(fp(p))}% ${word}. What is its cost price?`, C, [fdiv(fmul(P(sp.n), fadd(P(100), fmul(P(sgn), fp(p)))), P(100)), sp.n, fdiv(fmul(P(sp.n), fp(p)), P(100))], `SP = ${loss ? 100 - p : 100 + p}% of CP.\nCP = ${sp.n} × 100/${pc(fadd(P(100), fmul(P(sgn), fp(p))))} = ${inr(C)}.`, { pre: '₹' })
  const amt = fdiv(fmul(P(C), fp(p)), P(100))
  need(fint(amt), 'amount not integral')
  return nq(rng, 'profit-loss', `A trader buys ${item} for ${inr(C)} and sells it for ${inr(sp.n)}. What is his ${word} percentage?`, fp(p), [fdiv(fmul(amt, P(100)), P(sp.n)), p + 5, p / 2], `${loss ? 'Loss' : 'Profit'} = ${inr(Math.abs(sp.n - C))}.\n${word[0].toUpperCase() + word.slice(1)} % = ${Math.abs(sp.n - C)}/${C} × 100 = ${pc(fp(p))}%.`, { post: '%' })
}

function plMarked(rng: Rng, d: MockDifficulty): QuestionDraft {
  const m = rng.pick([20, 25, 30, 40, 50, 60])
  const dsc = rng.pick([10, 15, 20, 25])
  const C = rstep(rng, 400, d === 'hard' ? 6000 : 3000, 100)
  const mp = fdiv(fmul(P(C), P(100 + m)), P(100))
  const sp = fdiv(fmul(mp, P(100 - dsc)), P(100))
  need(fint(mp) && fint(sp), 'unclean')
  const pr = fsub(sp, P(C))
  const profitPct = fdiv(fmul(pr, P(100)), P(C))
  need(terminating(profitPct, 2) && pr.n !== 0, 'unclean pct')
  ensure(feq(profitPct, fsub(fdiv(P((100 + m) * (100 - dsc)), P(100)), P(100))), 'markup/discount mismatch')
  const isProfit = pr.n > 0
  const mag = F(Math.abs(profitPct.n), profitPct.d)
  const form = rng.int(0, 2)
  if (form === 0) return nq(rng, 'profit-loss', `A shopkeeper marks an article ${m}% above its cost price and allows a discount of ${dsc}%. What is his ${isProfit ? 'profit' : 'loss'} percentage?`, mag, [m - dsc, m + dsc, Math.abs(fval(mag)) + 2], `Let CP = 100; MP = ${100 + m}; SP = ${100 + m} × ${100 - dsc}% = ${decStr(fdiv(P((100 + m) * (100 - dsc)), P(100)), 2)}.\n${isProfit ? 'Profit' : 'Loss'} % = ${decStr(mag, 2)}%.`, { post: '%' })
  if (form === 1) return nq(rng, 'profit-loss', `The marked price of an article is ${inr(mp.n)}. It is sold at a discount of ${dsc}%. What is the selling price?`, sp, [fadd(mp, fdiv(fmul(mp, P(dsc)), P(100))), fdiv(fmul(mp, P(dsc)), P(100)), C], `SP = ${mp.n} × (100 − ${dsc})/100 = ${inr(pc(sp))}.`, { pre: '₹' })
  return nq(rng, 'profit-loss', `A trader marks his goods at ${inr(mp.n)} and gives a discount of ${dsc}%. If the cost price is ${inr(C)}, what is the ${isProfit ? 'profit' : 'loss'} (in ₹)?`, F(Math.abs(pr.n), pr.d), [mp.n - C, fsub(mp, sp), sp.n], `SP = ${mp.n} × ${100 - dsc}/100 = ${pc(sp)}.\n${isProfit ? 'Profit' : 'Loss'} = ${Math.abs(sp.n - C)}.`, { pre: '₹' })
}

function plMarkedFind(rng: Rng): QuestionDraft {
  const p = rng.pick([10, 20, 25, 30, 40])
  const dsc = rng.pick([10, 20, 25])
  const C = rstep(rng, 400, 4000, 100)
  const sp = fdiv(fmul(P(C), P(100 + p)), P(100))
  const mp = fdiv(fmul(sp, P(100)), P(100 - dsc))
  need(fint(sp) && fint(mp), 'unclean')
  ensure(feq(fdiv(fmul(mp, P(100 - dsc)), P(100)), sp), 'marked price mismatch')
  return nq(rng, 'profit-loss', `A shopkeeper wants to earn a profit of ${p}% after allowing a discount of ${dsc}% on the marked price. If the cost price of the article is ${inr(C)}, what should be its marked price?`, mp, [sp, fdiv(fmul(P(C), P(100 + p + dsc)), P(100)), fdiv(fmul(sp, P(100 - dsc)), P(100))], `SP = ${C} × ${100 + p}/100 = ${sp.n}.\nMP = SP × 100/(100 − ${dsc}) = ${sp.n} × 100/${100 - dsc} = ${inr(mp.n)}.`, { pre: '₹' })
}

function plSuccDiscount(rng: Rng, d: MockDifficulty): QuestionDraft {
  const ds = d === 'hard' && rng.chance(0.4) ? [rng.pick([10, 20, 25, 50]), rng.pick([10, 20, 25, 40]), rng.pick([10, 20, 50])] : [rng.pick([10, 15, 20, 25, 30, 40, 50]), rng.pick([10, 20, 25, 30, 50])]
  let f = F(1)
  for (const x of ds) f = fmul(f, fdiv(P(100 - x), P(100)))
  const single = fmul(fsub(F(1), f), P(100))
  need(terminating(single, 2), 'unclean')
  const sumD = ds.reduce((a, b) => a + b, 0)
  const list = ds.map((x) => `${x}%`).join(', ').replace(/, ([^,]*)$/, ' and $1')
  if (rng.chance(0.55)) return nq(rng, 'profit-loss', `Two shops offer successive discounts: a single discount equivalent to successive discounts of ${list} is`, single, [sumD, sumD - 2, fval(single) + 3, fval(single) - 3], `Net factor = ${ds.map((x) => `${100 - x}/100`).join(' × ')} = ${decStr(f, 4)}.\nEquivalent discount = (1 − ${decStr(f, 4)}) × 100 = ${decStr(single, 2)}%.`, { post: '%' })
  const M = rstep(rng, 1000, 8000, 500)
  const sp = fmul(P(M), f)
  need(fint(sp), 'SP not integral')
  return nq(rng, 'profit-loss', `The marked price of a television is ${inr(M)}. A customer gets successive discounts of ${list}. What price does he pay?`, sp, [fdiv(fmul(P(M), P(100 - sumD)), P(100)), M - sumD, fdiv(fmul(P(M), P(100 - ds[0])), P(100))], `Price paid = ${M} × ${ds.map((x) => `${100 - x}/100`).join(' × ')} = ${inr(pc(sp))}.`, { pre: '₹' })
}

function plSameSP(rng: Rng): QuestionDraft {
  const x = rng.pick([10, 20, 25, 30, 40])
  const g = gcd(100 - x, 100 + x)
  for (let tries = 0; tries < 100; tries++) {
    const k = rng.int(1, 60) * 10
    const c1 = (k * (100 - x)) / g
    const c2 = (k * (100 + x)) / g
    const S = (c1 * (100 + x)) / 100
    if (!Number.isInteger(c1) || !Number.isInteger(c2) || !Number.isInteger(S) || c1 < 400 || c2 > 12000 || c1 === c2) continue
    ensure(Math.abs(S - (c2 * (100 - x)) / 100) < 1e-9, 'same SP mismatch')
    const loss = c1 + c2 - 2 * S
    const lossPct = F(x * x, 100)
    ensure(feq(fdiv(P(loss * 100), P(c1 + c2)), lossPct), 'net loss percent mismatch')
    if (rng.chance(0.5)) return nq(rng, 'profit-loss', `A shopkeeper sells two articles at ${inr(S)} each. On one he gains ${x}% and on the other he loses ${x}%. What is his overall loss percentage?`, lossPct, [x, fdiv(P(x), P(2)), 0, F(x * x, 50)].filter((v) => v !== 0), `When two articles are sold at the same price with x% profit and x% loss, there is always a loss of x²/100 %.\nLoss % = ${x}²/100 = ${decStr(lossPct, 2)}%.`, { post: '%' })
    return nq(rng, 'profit-loss', `A dealer sells two articles for ${inr(S)} each. He makes a profit of ${x}% on one and a loss of ${x}% on the other. What is his overall loss (in ₹)?`, loss, [loss * 2, fdiv(P(S * x * 2), P(100)), c2 - c1], `CP of the first = ${S} × 100/${100 + x} = ${c1}; CP of the second = ${S} × 100/${100 - x} = ${c2}.\nTotal CP = ${c1 + c2}; total SP = ${2 * S}.\nLoss = ${loss}.`, { pre: '₹' })
  }
  throw new Reject('same-SP: no parameters')
}

function plArticles(rng: Rng): QuestionDraft {
  const n = rng.int(6, 60)
  const m = n + rng.int(1, Math.max(2, Math.floor(n / 2)))
  need(m > n && terminating(fdiv(P((m - n) * 100), P(n)), 1) && terminating(fdiv(P((m - n) * 100), P(m)), 1), 'unclean article pair')
  const item = rng.pick(['articles', 'pens', 'books', 'bulbs', 'toys', 'shirts', 'mangoes'])
  const loss = rng.chance(0.4)
  const pct = fdiv(P(Math.abs(m - n) * 100), P(loss ? m : n))
  need(terminating(pct, 2), 'unclean')
  // second method: per-article prices with CP of one article = 1
  const alt = loss ? fmul(fsub(P(1), fdiv(P(n), P(m))), P(100)) : fmul(fsub(fdiv(P(m), P(n)), P(1)), P(100))
  ensure(feq(pct, alt), 'article ratio mismatch')
  if (!loss) return nq(rng, 'profit-loss', `If the cost price of ${m} ${item} is equal to the selling price of ${n} ${item}, what is the profit percentage?`, pct, [fdiv(P((m - n) * 100), P(m)), m - n, fval(pct) + 5], `Let CP of 1 ${item.replace(/s$/, '')} = 1; CP of ${m} = SP of ${n} = ${m}.\nSP of 1 = ${m}/${n}; profit % = (${m} − ${n})/${n} × 100 = ${decStr(pct, 2)}%.`, { post: '%' })
  return nq(rng, 'profit-loss', `If the selling price of ${m} ${item} is equal to the cost price of ${n} ${item}, what is the loss percentage?`, pct, [fdiv(P((m - n) * 100), P(n)), m - n, fval(pct) + 5], `Let SP of ${m} = CP of ${n} = ${n}; CP of ${m} = ${m}.\nLoss % = (${m} − ${n})/${m} × 100 = ${decStr(pct, 2)}%.`, { post: '%' })
}

function plChain(rng: Rng): QuestionDraft {
  const p1 = rng.pick([10, 20, 25, 30, 40, 50])
  const p2 = rng.pick([10, 20, 25, 30, 40])
  const C = rstep(rng, 400, 6000, 100)
  const b = fdiv(fmul(P(C), P(100 + p1)), P(100))
  const c = fdiv(fmul(b, P(100 + p2)), P(100))
  need(fint(b) && fint(c), 'unclean')
  ensure(feq(c, fdiv(P(C * (100 + p1) * (100 + p2)), P(10000))), 'chain profit mismatch')
  const nm = pickNames(rng, 3)
  if (rng.chance(0.5)) return nq(rng, 'profit-loss', `${nm[0]} sells an article to ${nm[1]} at a profit of ${p1}% and ${nm[1]} sells it to ${nm[2]} at a profit of ${p2}%. If ${nm[2]} pays ${inr(c.n)}, what is the cost price for ${nm[0]}?`, C, [b, fdiv(fmul(c, P(100 - p1 - p2)), P(100)), fdiv(P(c.n * 100), P(100 + p1 + p2))], `${nm[0]}'s CP × ${100 + p1}/100 × ${100 + p2}/100 = ${c.n}.\nCP = ${c.n} × 100/${100 + p1} × 100/${100 + p2} = ${inr(C)}.`, { pre: '₹' })
  return nq(rng, 'profit-loss', `${nm[0]} sold an article to ${nm[1]} at ${p1}% profit and ${nm[1]} sold it to ${nm[2]} at ${p2}% profit. If ${nm[0]} bought it for ${inr(C)}, how much did ${nm[2]} pay?`, c, [b, fadd(P(C), fdiv(fmul(P(C), P(p1 + p2)), P(100))), C], `${nm[1]} paid ${C} × ${100 + p1}/100 = ${b.n}.\n${nm[2]} paid ${b.n} × ${100 + p2}/100 = ${inr(c.n)}.`, { pre: '₹' })
}

function plDiffGain(rng: Rng): QuestionDraft {
  const x = rng.pick([5, 8, 10, 12, 15, 20])
  const y = rng.pick([5, 10, 15, 20, 25])
  const C = rstep(rng, 400, 5000, 50)
  const D = (C * (x + y)) / 100
  need(Number.isInteger(D) && D >= 50, 'unclean')
  ensure(((C * (100 + y)) / 100) - ((C * (100 - x)) / 100) === D, 'difference gain mismatch')
  const item = rng.pick(['a camera', 'a cycle', 'a fan', 'a jacket'])
  return nq(rng, 'profit-loss', `${item[0].toUpperCase() + item.slice(1)} is sold at a loss of ${x}%. Had it been sold for ${inr(D)} more, there would have been a gain of ${y}%. What is the cost price of the article?`, C, [fdiv(P(D * 100), P(y)), D * 4, fdiv(P(D * 100), P(Math.abs(y - x) || 5)), D * 5], `Difference in SP = (${x} + ${y})% of CP = ${D}.\nCP = ${D} × 100/${x + y} = ${inr(C)}.`, { pre: '₹' })
}

function plTwoArticles(rng: Rng): QuestionDraft {
  const c1 = rstep(rng, 400, 3000, 100)
  const c2 = rstep(rng, 400, 3000, 100)
  const p = rng.pick([10, 20, 25, 30, 40])
  const q = rng.pick([10, 20, 25, 30])
  need(c1 !== c2, 'same')
  const s1 = fdiv(fmul(P(c1), P(100 + p)), P(100))
  const s2 = fdiv(fmul(P(c2), P(100 - q)), P(100))
  need(fint(s1) && fint(s2), 'unclean')
  const net = s1.n + s2.n - c1 - c2
  need(net !== 0, 'no net result')
  const profit = net > 0
  ensure(net === (c1 * p) / 100 - (c2 * q) / 100, 'two-article net mismatch')
  const right = `${profit ? 'Profit' : 'Loss'} of ${inr(Math.abs(net))}`
  const wrongs = [`${profit ? 'Loss' : 'Profit'} of ${inr(Math.abs(net))}`, `${profit ? 'Profit' : 'Loss'} of ${inr(Math.abs(net) + 50)}`, `${profit ? 'Profit' : 'Loss'} of ${inr(Math.abs(net) + 100)}`, `${profit ? 'Loss' : 'Profit'} of ${inr(Math.abs(net) + 150)}`, `${profit ? 'Profit' : 'Loss'} of ${inr(Math.abs(net) + 250)}`, `${profit ? 'Profit' : 'Loss'} of ${inr(Math.max(10, Math.abs(net) - 50))}`]
  return strQ(rng, { topic: 'profit-loss', stem: `A shopkeeper buys two articles for ${inr(c1)} and ${inr(c2)}. He sells the first at ${p}% profit and the second at ${q}% loss. What is his overall profit or loss?`, correct: right, wrong: wrongs, why: `SP of first = ${s1.n}; SP of second = ${s2.n}.\nTotal CP = ${c1 + c2}; total SP = ${s1.n + s2.n}.\n${right}.` })
}

function plFalseWeight(rng: Rng): QuestionDraft {
  const [w, pct] = rng.pick([[800, 25], [500, 100], [625, 60], [400, 150], [200, 400], [640, 56.25]])
  const item = rng.pick(['sugar', 'rice', 'wheat', 'pulses', 'tea leaves', 'dry fruits', 'flour'])
  const extra = rng.chance(0.5) ? 0 : rng.pick([5, 10, 12, 20, 25, 30, 40])
  const factor = fmul(fdiv(P(1000), P(w)), F(100 + extra, 100))
  const ans = fmul(fsub(factor, P(1)), P(100))
  ensure(extra !== 0 || feq(ans, F(Math.round(pct * 100), 100)), 'false weight mismatch')
  need(terminating(ans, 2), 'unclean')
  const nm = rng.pick(['A dishonest shopkeeper', 'A dishonest trader', 'A grocer', 'A wholesaler'])
  const base = extra === 0 ? `${nm} sells ${item} at cost price but uses a weight of ${w} g in place of 1 kg.` : `${nm} uses a weight of ${w} g in place of 1 kg for selling ${item} and also marks up the price by ${extra}% over the cost price.`
  const f4 = decStr(F(1000 * (100 + extra), w * 100), 4)
  return nq(rng, 'profit-loss', `${base} What is his profit percentage?`, ans, [fdiv(P((1000 - w) * 100), P(1000)), fval(ans) / 2, fval(ans) + 10, extra], `He gives ${w} g but charges for 1000 g${extra ? `, at ${100 + extra}% of cost` : ''}.\nSelling price of ${w} g = ${f4} × its cost.\nProfit % = (${f4} − 1) × 100 = ${decStr(ans, 2)}%.`, { post: '%' })
}

function plRatio(rng: Rng): QuestionDraft {
  const a = rng.int(3, 24)
  const b = rng.int(3, 28)
  need(a !== b && gcd(a, b) === 1 && Math.abs(a - b) <= Math.max(a, b) / 2, 'ratio pair unsuitable')
  const profit = b > a
  const pct = fdiv(P(Math.abs(b - a) * 100), P(a))
  need(terminating(pct, 1), 'unclean')
  const k = rstep(rng, 50, 500, 10)
  need(terminating(pct, 1), 'unclean pct')
  if (rng.chance(0.5)) return nq(rng, 'profit-loss', `The ratio of the cost price to the selling price of an article is ${a} : ${b}. What is the ${profit ? 'profit' : 'loss'} percentage?`, profit ? pct : fdiv(P(Math.abs(b - a) * 100), P(a)), [fdiv(P(Math.abs(b - a) * 100), P(b)), a, b, Math.abs(b - a)], `Let CP = ${a}, SP = ${b}.\n${profit ? 'Profit' : 'Loss'} % = ${Math.abs(b - a)}/${a} × 100 = ${decStr(pct, 2)}%.`, { post: '%' })
  const C = a * k
  const S = b * k
  return nq(rng, 'profit-loss', `The cost price and the selling price of an article are in the ratio ${a} : ${b}. If the ${profit ? 'profit' : 'loss'} on the article is ${inr(Math.abs(S - C))}, what is its cost price?`, C, [S, Math.abs(S - C), S + C], `Difference of ratio parts = ${Math.abs(b - a)} = ${inr(Math.abs(S - C))}, so 1 part = ${k}.\nCP = ${a} × ${k} = ${inr(C)}.`, { pre: '₹' })
}

export const PROFIT_TPLS: Tpl[] = [
  { name: 'pl-simple', gen: plSimple },
  { name: 'pl-marked', gen: plMarked },
  { name: 'pl-markedfind', gen: (r) => plMarkedFind(r) },
  { name: 'pl-succdiscount', gen: plSuccDiscount },
  { name: 'pl-samesp', gen: (r) => plSameSP(r) },
  { name: 'pl-articles', gen: (r) => plArticles(r) },
  { name: 'pl-chain', gen: (r) => plChain(r) },
  { name: 'pl-diffgain', gen: (r) => plDiffGain(r) },
  { name: 'pl-twoarticles', d: 'hard', gen: (r) => plTwoArticles(r) },
  { name: 'pl-falseweight', gen: (r) => plFalseWeight(r) },
  { name: 'pl-ratio', gen: (r) => plRatio(r) },
]

// ============================================================================ RATIO & PARTNERSHIP
function rtDivide(rng: Rng, d: MockDifficulty): QuestionDraft {
  const parts = d === 'hard' ? 3 : rng.int(2, 3)
  const r: number[] = Array.from({ length: parts }, () => rng.int(1, 9))
  need(new Set(r).size === parts && r.reduce((a, b) => gcd(a, b), 0) === 1, 'ratio not clean')
  const total = r.reduce((a, b) => a + b, 0)
  const k = rng.int(2, d === 'hard' ? 120 : 60) * 10
  const X = total * k
  const nm = pickNames(rng, parts)
  const i = rng.int(0, parts - 1)
  const j = (i + 1) % parts
  const form = rng.int(0, 2)
  const ratioTxt = r.join(' : ')
  const names = nm.slice(0, parts)
  const who = names.length === 2 ? `${names[0]} and ${names[1]}` : `${names[0]}, ${names[1]} and ${names[2]}`
  if (form === 0) return nq(rng, 'ratio-partnership', `${inr(X)} is divided among ${who} in the ratio ${ratioTxt}. What is the share of ${names[i]}?`, r[i] * k, [r[j] * k, X / parts, r[i] * k + 100, (X * r[i]) / (total + 1)], `Sum of ratio terms = ${total}; 1 part = ${X}/${total} = ${k}.\n${names[i]}'s share = ${r[i]} × ${k} = ${inr(r[i] * k)}.`, { pre: '₹' })
  if (form === 1) {
    const diff = Math.abs(r[i] - r[j]) * k
    return nq(rng, 'ratio-partnership', `A sum of money is divided among ${who} in the ratio ${ratioTxt}. If ${names[i]} gets ${inr(Math.abs(r[i] - r[j]) * k)} ${r[i] > r[j] ? 'more' : 'less'} than ${names[j]}, what is the total sum?`, X, [diff, X - k, X + k * 2, (diff * total) / Math.max(1, r[i] + r[j])], `Difference of ratio terms = ${Math.abs(r[i] - r[j])} = ${inr(diff)}, so 1 part = ${k}.\nTotal = ${total} × ${k} = ${inr(X)}.`, { pre: '₹' })
  }
  return nq(rng, 'ratio-partnership', `The ratio of the amounts with ${who} is ${ratioTxt}. If the total amount is ${inr(X)}, how much more (or less) does ${names[i]} have than ${names[j]}? Give the difference.`, Math.abs(r[i] - r[j]) * k, [r[i] * k, r[j] * k, (r[i] + r[j]) * k, X / total], `1 part = ${X}/${total} = ${k}.\nDifference = |${r[i]} − ${r[j]}| × ${k} = ${inr(Math.abs(r[i] - r[j]) * k)}.`, { pre: '₹' })
}

function rtIncomeExpense(rng: Rng): QuestionDraft {
  for (let tries = 0; tries < 300; tries++) {
    const p = rng.int(3, 9)
    const q = rng.int(2, p - 1)
    const r = rng.int(2, 8)
    const s = rng.int(1, r - 1)
    if (gcd(p, q) !== 1 || gcd(r, s) !== 1 || r * q - p * s <= 0) continue
    const t = rng.int(5, 40) * 10
    const a = (r - s) * t
    const b = (p - q) * t
    const save = p * a - r * b
    if (save <= 0) continue
    ensure(save === q * a - s * b && save === (r * q - p * s) * t, 'income/expense savings differ')
    const nm = pickNames(rng, 2)
    return nq(rng, 'ratio-partnership', `The incomes of ${nm[0]} and ${nm[1]} are in the ratio ${p} : ${q} and their expenditures are in the ratio ${r} : ${s}. If each saves ${inr(save)}, what is the income of ${nm[0]}?`, p * a, [q * a, r * b, p * b, save * p], `Let incomes be ${p}x and ${q}x, expenditures ${r}y and ${s}y.
${p}x − ${r}y = ${q}x − ${s}y ⇒ ${p - q}x = ${r - s}y, so x = ${r - s}k and y = ${p - q}k.
Savings = ${p}(${r - s})k − ${r}(${p - q})k = ${cx(r * q - p * s).replace('x', 'k')} = ${save} ⇒ k = ${t}.
Income of ${nm[0]} = ${p} × ${r - s} × ${t} = ${inr(p * a)}.`, { pre: '₹' })
  }
  throw new Reject('income/expense: no parameters')
}

function rtPartnership(rng: Rng, d: MockDifficulty): QuestionDraft {
  const n = d === 'hard' ? 3 : 2
  const nm = pickNames(rng, n)
  const inv = Array.from({ length: n }, () => rstep(rng, 2000, 15000, 500))
  const months = Array.from({ length: n }, () => (d === 'hard' ? rng.int(3, 12) : rng.pick([6, 8, 12, 12])))
  months[0] = 12
  const prod = inv.map((x, i) => (x / 500) * months[i])
  const g = prod.reduce((a, b) => gcd(a, b), 0)
  const ratio = prod.map((x) => x / g)
  const sum = ratio.reduce((a, b) => a + b, 0)
  need(sum <= 40, 'ratio too big')
  const k = rng.int(2, 40) * 50
  const T = sum * k
  const i = rng.int(0, n - 1)
  const share = ratio[i] * k
  const phr = inv.map((x, j) => `${nm[j]} invested ${inr(x)} ${months[j] === 12 ? 'for the whole year' : `for ${months[j]} months`}`)
  const text = n === 2 ? `${phr[0]} and ${phr[1]}.` : `${phr[0]}, ${phr[1]} and ${phr[2]}.`
  const alt = nm.map((_, j) => (T * inv[j]) / inv.reduce((a, b) => a + b, 0))
  if (rng.chance(0.5)) return nq(rng, 'ratio-partnership', `${n === 2 ? 'Two' : 'Three'} partners started a business: ${text} If the total profit at the end of the year is ${inr(T)}, what is ${nm[i]}'s share?`, share, [alt[i], T / n, share + k, ratio[(i + 1) % n] * k], `Profit ratio = ${nm.map((_, j) => `${inr(inv[j])} × ${months[j]}`).join(' : ')} = ${prod.join(' : ')} = ${ratio.join(' : ')}.\nTotal parts = ${sum}; 1 part = ${T}/${sum} = ${k}.\n${nm[i]}'s share = ${ratio[i]} × ${k} = ${inr(share)}.`, { pre: '₹' })
  return nq(rng, 'ratio-partnership', `${n === 2 ? 'Two' : 'Three'} partners started a business: ${text} If ${nm[i]}'s share in the profit is ${inr(share)}, what is the total profit?`, T, [share * n, (share * inv.reduce((a, b) => a + b, 0)) / inv[i], T + k, sum * k - k], `Profit ratio = ${prod.join(' : ')} = ${ratio.join(' : ')}.\n${nm[i]}'s ${ratio[i]} parts = ${inr(share)}, so 1 part = ${k}.\nTotal profit = ${sum} × ${k} = ${inr(T)}.`, { pre: '₹' })
}

function rtRatioChange(rng: Rng): QuestionDraft {
  for (let tries = 0; tries < 300; tries++) {
    const a = rng.int(2, 9)
    const b = rng.int(2, 9)
    if (a === b || gcd(a, b) !== 1) continue
    const k = rng.int(5, 30) * 2
    const out = rng.int(2, 6) * 5
    const c = rng.int(1, 4)
    const dd = rng.int(1, 4)
    const left = a * k - out
    // (left) : (b*k + m) = c : dd  => m = left*dd/c - b*k
    const mNum = left * dd - b * k * c
    if (mNum <= 0 || mNum % c !== 0 || gcd(c, dd) !== 1 || c === dd) continue
    const m = mNum / c
    if (m < 5 || m > 80 || left <= 0) continue
    ensure(left * dd === c * (b * k + m), 'ratio change mismatch')
    const A = a * k
    const B = b * k
    return nq(rng, 'ratio-partnership', `The ratio of boys to girls in a school is ${a} : ${b}. If ${out} boys leave the school and ${m} more girls join, the ratio becomes ${c} : ${dd}. What was the original number of students in the school?`, A + B, [A, B, A + B + out, A + B - m], `Let boys = ${a}x and girls = ${b}x.\n(${a}x − ${out}) : (${b}x + ${m}) = ${c} : ${dd} ⇒ ${dd}(${a}x − ${out}) = ${c}(${b}x + ${m}).\n${cx(a * dd - b * c)} = ${m * c + out * dd} ⇒ x = ${k}.\nTotal = ${a + b} × ${k} = ${A + B}.`)
  }
  throw new Reject('ratio change: no parameters')
}

function rtCompound(rng: Rng): QuestionDraft {
  const a = rng.int(1, 7)
  const b = rng.int(2, 9)
  const c = rng.int(1, 7)
  const dd = rng.int(2, 9)
  need(gcd(a, b) === 1 && gcd(c, dd) === 1 && b !== c, 'ratios not coprime')
  // A:B = a:b, B:C = c:d  => A:B:C = a*c : b*c : b*d
  const x = a * c
  const y = b * c
  const z = b * dd
  const g = gcd(gcd(x, y), z)
  const rx = x / g
  const ry = y / g
  const rz = z / g
  need(rx <= 60 && rz <= 80 && new Set([rx, ry, rz]).size === 3, 'ratio ugly')
  const nm = ['A', 'B', 'C']
  const correct = `${rx} : ${ry} : ${rz}`
  const rd = (p1: number, p2: number, p3: number): string => ratioStr(p1, p2, p3)
  const wr = [rd(a, b, dd), rd(a * dd, b * dd, b * c), rd(a * c, b, dd), rd(a, b * c, dd), `${rx} : ${ry} : ${rz + 1}`, `${rx + 1} : ${ry} : ${rz}`, `${ry} : ${rx} : ${rz}`, `${rx} : ${rz} : ${ry}`].filter((w) => w !== correct)
  if (rng.chance(0.5)) return strQ(rng, { topic: 'ratio-partnership', stem: `If ${nm[0]} : ${nm[1]} = ${a} : ${b} and ${nm[1]} : ${nm[2]} = ${c} : ${dd}, then ${nm[0]} : ${nm[1]} : ${nm[2]} is`, correct, wrong: wr, why: `Make B equal in both: A : B = ${a * c} : ${b * c} and B : C = ${b * c} : ${b * dd}.\nA : B : C = ${x} : ${y} : ${z} = ${correct}.`, none: 0.12 })
  return nq(rng, 'ratio-partnership', `If A : B = ${a} : ${b} and B : C = ${c} : ${dd}, and the sum of A, B and C is ${(rx + ry + rz) * 10}, what is the value of B?`, ry * 10, [rx * 10, rz * 10, (ry * 10 * 3) / 2], `A : B : C = ${correct}; sum of parts = ${rx + ry + rz}.\n1 part = ${(rx + ry + rz) * 10}/${rx + ry + rz} = 10.\nB = ${ry} × 10 = ${ry * 10}.`)
}

function rtProportion(rng: Rng): QuestionDraft {
  const form = rng.int(0, 2)
  if (form === 0) {
    const a = rng.int(2, 9)
    const k = rng.int(2, 8)
    const b = a * rng.int(2, 6)
    const c = rng.int(3, 15)
    const x = (b * c) / a
    need(Number.isInteger(x) && k > 0, 'unclean')
    ensure(a * x === b * c, 'fourth proportional mismatch')
    return nq(rng, 'ratio-partnership', `Find the fourth proportional to ${a}, ${b} and ${c}.`, x, [a * b * c / (a + 1), b + c - a, c * a, x + 4], `Fourth proportional x satisfies ${a} : ${b} = ${c} : x.\nx = ${b} × ${c}/${a} = ${x}.`)
  }
  if (form === 1) {
    const m = rng.int(2, 12)
    const n = rng.int(2, 12)
    need(m !== n, 'same')
    const a = m * m * rng.int(1, 3)
    const b = n * n * (a / (m * m))
    const root = m * n * (a / (m * m))
    ensure(root * root === a * b, 'mean proportional mismatch')
    return nq(rng, 'ratio-partnership', `What is the mean proportional between ${a} and ${b}?`, root, [(a + b) / 2, root + 2, root - 2, a * b / (a + b)], `Mean proportional = √(${a} × ${b}) = √${a * b} = ${root}.`)
  }
  const a = rng.int(2, 9)
  const b = a * rng.int(2, 5)
  const third = (b * b) / a
  need(Number.isInteger(third), 'unclean')
  return nq(rng, 'ratio-partnership', `What is the third proportional to ${a} and ${b}?`, third, [a * b, b + a, (a + b) / 2 + 20, third + 6], `Third proportional x satisfies ${a} : ${b} = ${b} : x.\nx = ${b}²/${a} = ${third}.`)
}

function rtAddSame(rng: Rng): QuestionDraft {
  for (let tries = 0; tries < 300; tries++) {
    const a = rng.int(2, 9)
    const b = rng.int(2, 9)
    if (a >= b || gcd(a, b) !== 1) continue
    const k = rng.int(4, 40)
    const m = rng.int(3, 20)
    const x = a * k + m
    const y = b * k + m
    const g = gcd(x, y)
    const c = x / g
    const dd = y / g
    if (c > 12 || dd > 12 || c === dd) continue
    const small = a * k
    const big = b * k
    return nq(rng, 'ratio-partnership', `Two numbers are in the ratio ${a} : ${b}. If ${m} is added to each of them, the ratio becomes ${c} : ${dd}. What is the larger number?`, big, [small, small + big, big + m, (big + small) / 2], `Let the numbers be ${a}x and ${b}x.\n(${a}x + ${m}) : (${b}x + ${m}) = ${c} : ${dd} ⇒ ${dd}(${a}x + ${m}) = ${c}(${b}x + ${m}).\n${cx(c * b - dd * a)} = ${m * (dd - c)} ⇒ x = ${k}.\nLarger number = ${b} × ${k} = ${big}.`)
  }
  throw new Reject('add-same: no parameters')
}

function rtCoins(rng: Rng): QuestionDraft {
  const r = rng.pick([[5, 6, 8], [2, 3, 4], [3, 4, 8], [4, 5, 8], [3, 6, 8], [5, 4, 8], [6, 7, 12]])
  const [n1, n2, n3] = r
  const k = rng.int(2, 25)
  // coin values 1, 0.5, 0.25 rupees
  const total = fadd(fadd(P(n1 * k), F(n2 * k, 2)), F(n3 * k, 4))
  need(fint(total), 'total not integral')
  const T = total.n
  const second = n2 * k
  return nq(rng, 'ratio-partnership', `A bag contains ₹1, 50 paise and 25 paise coins in the ratio ${n1} : ${n2} : ${n3}. If the total value of the coins is ${inr(T)}, how many 50 paise coins are there?`, second, [n1 * k, n3 * k, T, second + 10], `Let the numbers of coins be ${n1}x, ${n2}x and ${n3}x.\nValue = ${n1}x + ${n2}x × 0.50 + ${n3}x × 0.25 = ${decStr(fdiv(total, P(k)), 2)}x = ${T} ⇒ x = ${k}.\n50 paise coins = ${n2} × ${k} = ${second}.`)
}

export const RATIO_TPLS: Tpl[] = [
  { name: 'rt-divide', gen: rtDivide },
  { name: 'rt-incomeexpense', d: 'hard', gen: (r) => rtIncomeExpense(r) },
  { name: 'rt-partnership', gen: rtPartnership },
  { name: 'rt-ratiochange', gen: (r) => rtRatioChange(r) },
  { name: 'rt-compound', gen: (r) => rtCompound(r) },
  { name: 'rt-proportion', d: 'medium', gen: (r) => rtProportion(r) },
  { name: 'rt-addsame', gen: (r) => rtAddSame(r) },
  { name: 'rt-coins', gen: (r) => rtCoins(r) },
]

// ============================================================================ AGES & AVERAGES
function agRatioAges(rng: Rng, d: MockDifficulty): QuestionDraft {
  for (let tries = 0; tries < 400; tries++) {
    const a = rng.int(2, 9)
    const b = rng.int(2, 9)
    if (a === b || gcd(a, b) !== 1) continue
    const k = rng.int(2, d === 'hard' ? 12 : 8) * (d === 'hard' ? 1 : 1)
    const n = rng.int(3, 12)
    const x = a * k + n
    const y = b * k + n
    const g = gcd(x, y)
    const c = x / g
    const dd = y / g
    if (c > 12 || dd > 12 || c === dd || (c === a && dd === b)) continue
    const nm = pickNames(rng, 2)
    const A = a * k
    const B = b * k
    ensure(dd * (A + n) === c * (B + n), 'ages ratio mismatch')
    const form = rng.int(0, 2)
    const stem = `The present ages of ${nm[0]} and ${nm[1]} are in the ratio ${a} : ${b}. After ${n} years, the ratio of their ages will be ${c} : ${dd}.`
    const why = `Let present ages be ${a}x and ${b}x.\n(${a}x + ${n}) : (${b}x + ${n}) = ${c} : ${dd} ⇒ ${dd}(${a}x + ${n}) = ${c}(${b}x + ${n}).\n${cx(Math.abs(c * b - dd * a))} = ${Math.abs(n * (dd - c))} ⇒ x = ${k}.`
    if (form === 0) return nq(rng, 'ages-averages', `${stem} What is the present age of ${nm[0]}?`, A, [B, A + n, A - n, a * n], `${why}\n${nm[0]}'s age = ${a} × ${k} = ${A} years.`, { post: ' years' })
    if (form === 1) return nq(rng, 'ages-averages', `${stem} What is the sum of their present ages?`, A + B, [A + B + 2 * n, A + B - 2 * n, B - A, A * 2], `${why}\nSum = (${a} + ${b}) × ${k} = ${A + B} years.`, { post: ' years' })
    return nq(rng, 'ages-averages', `${stem} What will be the age of ${nm[1]} after ${n} years?`, B + n, [B, A + n, B - n, B + 2 * n], `${why}\n${nm[1]}'s present age = ${B}; after ${n} years = ${B + n} years.`, { post: ' years' })
  }
  throw new Reject('ratio ages: no parameters')
}

function agAgoRatio(rng: Rng): QuestionDraft {
  for (let tries = 0; tries < 400; tries++) {
    const A = rng.int(20, 60)
    const B = rng.int(10, A - 2)
    const n = rng.int(3, 10)
    if (B - n < 3) continue
    const x = A - n
    const y = B - n
    const g = gcd(x, y)
    if (x / g > 12 || y / g > 12 || x === y) continue
    const nm = pickNames(rng, 2)
    const c = x / g
    const dd = y / g
    ensure(dd * (A - n) === c * (B - n), 'ago ratio mismatch')
    return nq(rng, 'ages-averages', `The sum of the present ages of ${nm[0]} and ${nm[1]} is ${A + B} years. ${n} years ago the ratio of their ages was ${c} : ${dd}. What is the present age of ${nm[0]}?`, A, [B, A - n, A + n, (A + B) / 2 + 3], `${n} years ago the sum of their ages = ${A + B} − ${2 * n} = ${A + B - 2 * n}.\nTheir ages then = ${c}/${c + dd} and ${dd}/${c + dd} of ${A + B - 2 * n} = ${A - n} and ${B - n}.\n${nm[0]}'s present age = ${A - n} + ${n} = ${A} years.`, { post: ' years' })
  }
  throw new Reject('ago ratio: no parameters')
}

function agMultiple(rng: Rng): QuestionDraft {
  const B = rng.int(10, 40)
  const m = rng.int(2, 4)
  const n = rng.int(3, B - 5)
  const diff = (m - 1) * (B - n)
  const A = B + diff
  need(A <= 80 && diff >= 5, 'age unsuitable')
  ensure(A - n === m * (B - n), 'age multiple mismatch')
  const nm = pickNames(rng, 2)
  return nq(rng, 'ages-averages', `${nm[0]} is ${diff} years older than ${nm[1]}. ${n} years ago, ${nm[0]}'s age was ${m} times ${nm[1]}'s age. What is ${nm[0]}'s present age?`, A, [B, A - n, A + n, diff * m], `Let ${nm[1]}'s present age be x; ${nm[0]}'s = x + ${diff}.\n(x + ${diff} − ${n}) = ${m}(x − ${n}) ⇒ ${m - 1}x = ${diff} + ${(m - 1) * n} ⇒ x = ${B}.\n${nm[0]}'s age = ${B} + ${diff} = ${A} years.`, { post: ' years' })
}

function agReplace(rng: Rng): QuestionDraft {
  const n = rng.int(4, 10)
  const avg = rng.int(20, 45)
  const out = rng.int(avg - 10, avg + 10)
  const delta = rng.int(1, 4)
  const inn = out + n * delta
  const down = rng.chance(0.3)
  const nm = down ? out - n * delta : inn
  need(nm > 5, 'age too small')
  const newAvg = avg + (down ? -delta : delta)
  ensure(avg * n - out + nm === newAvg * n, 'replacement mismatch')
  if (rng.chance(0.5)) return nq(rng, 'ages-averages', `The average age of ${n} members of a team is ${avg} years. When a member aged ${out} years is replaced by a new member, the average age ${down ? 'decreases' : 'increases'} by ${delta} year${delta > 1 ? 's' : ''}. What is the age of the new member?`, nm, [out, out + delta, out - n * (down ? -delta : delta), nm + n], `Change in total age = ${n} × ${delta} = ${n * delta} years (${down ? 'decrease' : 'increase'}).\nNew member's age = ${out} ${down ? '−' : '+'} ${n * delta} = ${nm} years.`, { post: ' years' })
  return nq(rng, 'ages-averages', `The average age of ${n} persons is ${avg} years. If a person aged ${out} years leaves and a new person aged ${nm} years joins, what is the new average age?`, newAvg, [avg, avg + (nm - out) / 2, avg + (nm - out), newAvg + 1], `Total age = ${n} × ${avg} = ${avg * n}.\nNew total = ${avg * n} − ${out} + ${nm} = ${avg * n - out + nm}.\nNew average = ${avg * n - out + nm}/${n} = ${newAvg} years.`, { post: ' years' })
}

function agAddOne(rng: Rng): QuestionDraft {
  const n = rng.int(5, 15)
  const x = rng.int(20, 80)
  const delta = rng.int(1, 6)
  const sign = rng.chance(0.75) ? 1 : -1
  const y = x + sign * delta
  const newItem = (n + 1) * y - n * x
  need(newItem > 5, 'unsuitable')
  ensure((n * x + newItem) / (n + 1) === y, 'add-one mismatch')
  const c = rng.pick([
    { metric: 'weight (in kg)', group: 'players', one: 'player' },
    { metric: 'age (in years)', group: 'members', one: 'member' },
    { metric: 'marks', group: 'students', one: 'student' },
    { metric: 'monthly salary (in ₹ thousand)', group: 'employees', one: 'employee' },
  ])
  return nq(rng, 'ages-averages', `The average ${c.metric} of ${n} ${c.group} is ${x}. When another ${c.one} joins the group, the average becomes ${y}. What is the ${c.metric.replace(/ (.*)/, '')} of the new ${c.one}?`, newItem, [y, x, newItem + delta * 2, newItem + 10, Math.max(1, newItem - delta * 3)], `Total of ${n} = ${n} × ${x} = ${n * x}.
Total of ${n + 1} = ${n + 1} × ${y} = ${(n + 1) * y}.
New entry = ${(n + 1) * y} − ${n * x} = ${newItem}.`)
}

function agSubsets(rng: Rng): QuestionDraft {
  for (let tries = 0; tries < 300; tries++) {
    const mid = rng.int(10, 60)
    const nums = [rng.int(10, 60), rng.int(10, 60), mid, rng.int(10, 60), rng.int(10, 60)]
    const total = nums.reduce((a, b) => a + b, 0)
    const f3 = nums[0] + nums[1] + nums[2]
    const l3 = nums[2] + nums[3] + nums[4]
    if (total % 5 !== 0 || f3 % 3 !== 0 || l3 % 3 !== 0) continue
    const avg = total / 5
    const a1 = f3 / 3
    const a2 = l3 / 3
    const res = 3 * a1 + 3 * a2 - 5 * avg
    ensure(res === mid, 'subset averages mismatch')
    return nq(rng, 'ages-averages', `The average of five numbers is ${avg}. The average of the first three numbers is ${a1} and the average of the last three numbers is ${a2}. What is the third number?`, mid, [a1 + a2 - avg, avg, (a1 + a2) / 2, mid + 5], `Sum of all five = ${5 * avg}; sum of first three = ${3 * a1}; sum of last three = ${3 * a2}.\nThird number = ${3 * a1} + ${3 * a2} − ${5 * avg} = ${mid}.`)
  }
  throw new Reject('subsets: no parameters')
}

function agWeighted(rng: Rng, d: MockDifficulty): QuestionDraft {
  const n1 = rng.int(2, 8) * 5
  const n2 = rng.int(2, 8) * 5
  const x = rng.int(40, 80)
  const y = rng.int(40, 80)
  need(x !== y, 'same')
  const avg = fdiv(P(n1 * x + n2 * y), P(n1 + n2))
  need(terminating(avg, 2), 'unclean')
  ensure(feq(avg, fadd(P(x), fdiv(P(n2 * (y - x)), P(n1 + n2)))), 'weighted average mismatch')
  const ctx = rng.pick([['boys', 'girls', 'marks'], ['men', 'women', 'age (in years)'], ['junior', 'senior', 'salary (in ₹ thousand)']])
  if (d === 'hard' && rng.chance(0.5)) {
    const ans = n1
    return nq(rng, 'ages-averages', `In a class, the average ${ctx[2]} of ${ctx[0]} is ${x} and that of ${ctx[1]} is ${y}. If there are ${n2} ${ctx[1]} and the average of the whole class is ${decStr(avg, 2)}, how many ${ctx[0]} are there?`, ans, [n2, n1 + n2, (n1 + n2) / 2, n1 + 5], `Let ${ctx[0]} = n: ${x}n + ${y} × ${n2} = ${decStr(avg, 2)}(n + ${n2}).\n(${decStr(avg, 2)} − ${x})n = (${y} − ${decStr(avg, 2)}) × ${n2} ⇒ n = ${n1}.`)
  }
  return nq(rng, 'ages-averages', `The average ${ctx[2]} of ${n1} ${ctx[0]} is ${x} and the average ${ctx[2]} of ${n2} ${ctx[1]} is ${y}. What is the average ${ctx[2]} of all of them together?`, avg, [(x + y) / 2, fval(avg) + 2, fval(avg) - 2], `Total = ${n1} × ${x} + ${n2} × ${y} = ${n1 * x} + ${n2 * y} = ${n1 * x + n2 * y}.\nAverage = ${n1 * x + n2 * y}/${n1 + n2} = ${decStr(avg, 2)}.`)
}

function agConsecutive(rng: Rng): QuestionDraft {
  const n = rng.pick([5, 7, 9])
  const kind = rng.pick(['even', 'odd', 'natural'])
  const mid = kind === 'natural' ? rng.int(12, 60) : kind === 'even' ? rng.int(8, 40) * 2 : rng.int(8, 40) * 2 + 1
  const step = kind === 'natural' ? 1 : 2
  const half = (n - 1) / 2
  const seq = Array.from({ length: n }, (_, i) => mid + (i - half) * step)
  ensure(seq.reduce((a, b) => a + b, 0) === n * mid, 'consecutive sum mismatch')
  const sumTxt = `${n * mid}`
  const largest = seq[n - 1]
  const smallest = seq[0]
  if (rng.chance(0.5)) return nq(rng, 'ages-averages', `The sum of ${n} consecutive ${kind === 'natural' ? '' : kind + ' '}numbers is ${sumTxt}. What is the largest of these numbers?`, largest, [smallest, mid, largest + step, largest - step], `Middle number = ${sumTxt}/${n} = ${mid}.\nLargest = ${mid} + ${half} × ${step} = ${largest}.`)
  return nq(rng, 'ages-averages', `The average of ${n} consecutive ${kind === 'natural' ? '' : kind + ' '}numbers is ${mid}. What is the smallest of these numbers?`, smallest, [largest, mid - step, smallest + step, mid - half], `The numbers are ${seq.join(', ')}.
Smallest = ${mid} − ${half} × ${step} = ${smallest}.`)
}

function agBatsman(rng: Rng): QuestionDraft {
  const n = rng.int(10, 20)
  const a = rng.int(25, 55)
  const delta = rng.int(2, 5)
  const runs = a + n * delta
  ensure(((n - 1) * a + runs) / n === a + delta, 'batsman mismatch')
  return nq(rng, 'ages-averages', `A batsman's average after ${n} innings is ${a + delta}. His average increased by ${delta} after the ${n}th innings. How many runs did he score in the ${n}th innings?`, runs, [a + delta, a * n, (a + delta) * n, runs - n], `Total after ${n} innings = ${n} × ${a + delta} = ${n * (a + delta)}.\nTotal after ${n - 1} innings = ${n - 1} × ${a} = ${(n - 1) * a}.\nRuns in ${n}th innings = ${n * (a + delta)} − ${(n - 1) * a} = ${runs}.`)
}

function agClassTeacher(rng: Rng): QuestionDraft {
  const n = rng.int(20, 40)
  const a = rng.int(12, 17)
  const up = rng.int(1, 2)
  const t = (a + up) * (n + 1) - a * n
  ensure((a * n + t) / (n + 1) === a + up, 'teacher mismatch')
  return nq(rng, 'ages-averages', `The average age of a class of ${n} students is ${a} years. If the teacher's age is also included, the average age increases by ${up} year${up > 1 ? 's' : ''}. What is the age of the teacher?`, t, [a + up, t + up * 5, t - up * 5, t - 7], `Total age of students = ${n} × ${a} = ${n * a}.\nTotal with teacher = ${n + 1} × ${a + up} = ${(n + 1) * (a + up)}.\nTeacher's age = ${(n + 1) * (a + up)} − ${n * a} = ${t} years.`, { post: ' years' })
}

function agSumMult(rng: Rng): QuestionDraft {
  for (let tries = 0; tries < 300; tries++) {
    const B = rng.int(12, 40)
    const n = rng.int(3, 10)
    const m = rng.int(2, 4)
    if (B - n < 4) continue
    const A = m * (B - n) + n
    if (A <= B || A > 90) continue
    const S = A + B
    ensure(A - n === m * (B - n), 'age sum-multiple mismatch')
    const nm = pickNames(rng, 2)
    return nq(rng, 'ages-averages', `The sum of the present ages of ${nm[0]} and ${nm[1]} is ${S} years. ${n} years ago, ${nm[0]}'s age was ${m} times ${nm[1]}'s age. What is ${nm[1]}'s present age?`, B, [A, B - n, B + n, S - m * n], `Let ${nm[1]}'s present age be x; ${nm[0]}'s = ${S} − x.
(${S} − x − ${n}) = ${m}(x − ${n}) ⇒ ${S - n + m * n} = ${m + 1}x ⇒ x = ${B}.`, { post: ' years' })
  }
  throw new Reject('sum-multiple: no parameters')
}

function agThreeAvg(rng: Rng): QuestionDraft {
  for (let tries = 0; tries < 300; tries++) {
    const [A, B, C] = [rng.int(15, 60), rng.int(15, 60), rng.int(15, 60)]
    if ((A + B + C) % 3 !== 0 || (A + B) % 2 !== 0 || (B + C) % 2 !== 0 || new Set([A, B, C]).size < 3) continue
    const x = (A + B + C) / 3
    const y = (A + B) / 2
    const z = (B + C) / 2
    ensure(2 * y + 2 * z - 3 * x === B, 'three-average mismatch')
    return nq(rng, 'ages-averages', `The average weight of A, B and C is ${x} kg. The average weight of A and B is ${y} kg and that of B and C is ${z} kg. What is the weight of B (in kg)?`, B, [y, z, x, B + 3], `A + B + C = ${3 * x}; A + B = ${2 * y}; B + C = ${2 * z}.
B = (A + B) + (B + C) − (A + B + C) = ${2 * y} + ${2 * z} − ${3 * x} = ${B} kg.`)
  }
  throw new Reject('three-average: no parameters')
}

export const AGES_TPLS: Tpl[] = [
  { name: 'ag-summult', d: 'hard', gen: (r) => agSumMult(r) },
  { name: 'ag-threeavg', d: 'hard', gen: (r) => agThreeAvg(r) },
  { name: 'ag-ratioages', gen: agRatioAges },
  { name: 'ag-agoratio', gen: (r) => agAgoRatio(r) },
  { name: 'ag-multiple', gen: (r) => agMultiple(r) },
  { name: 'ag-replace', gen: (r) => agReplace(r) },
  { name: 'ag-addone', gen: (r) => agAddOne(r) },
  { name: 'ag-subsets', gen: (r) => agSubsets(r) },
  { name: 'ag-weighted', gen: agWeighted },
  { name: 'ag-consecutive', gen: (r) => agConsecutive(r) },
  { name: 'ag-batsman', gen: (r) => agBatsman(r) },
  { name: 'ag-teacher', d: 'medium', gen: (r) => agClassTeacher(r) },
]

export function genPercentage(rng: Rng, d: MockDifficulty, count: number): Group[] {
  return genSingles(rng, d, count, PERCENTAGE_TPLS)
}
export function genProfitLoss(rng: Rng, d: MockDifficulty, count: number): Group[] {
  return genSingles(rng, d, count, PROFIT_TPLS)
}
export function genRatioPartnership(rng: Rng, d: MockDifficulty, count: number): Group[] {
  return genSingles(rng, d, count, RATIO_TPLS)
}
export function genAgesAverages(rng: Rng, d: MockDifficulty, count: number): Group[] {
  return genSingles(rng, d, count, AGES_TPLS)
}

