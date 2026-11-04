// Mensuration, Probability & P&C, Number System.
import type { Rng } from '../rng'
import type { Group, MockDifficulty, QuestionDraft } from '../types'
import { F, Reject, choose, decStr, ensure, fact, fadd, fdiv, feq, fint, fmul, fracStr, fsub, gcd, genSingles, inr, lcm, need, nq, strQ, terminating } from './util'
import type { Frac, Tpl } from './util'

const P = (n: number): Frac => F(n)
const PI = F(22, 7)
const pc = (n: number | Frac): string => (typeof n === 'number' ? String(n) : decStr(n, 2))
const PI_NOTE = '(Take π = 22/7.)'
const sqf = (n: Frac): Frac => fmul(n, n)

// ============================================================================ MENSURATION
/** r multiples of 7 (and 3.5 / 10.5 occasionally) so that π r keeps integer values. */
function radius(rng: Rng, hard: boolean): Frac {
  const pool = hard ? [7, 14, 21, 35, 3.5, 10.5, 28, 42, 49, 56, 63, 70, 17.5, 24.5, 31.5] : [7, 14, 21, 28, 35, 42, 49, 56, 63, 70]
  const r = rng.pick(pool)
  return F(Math.round(r * 2), 2)
}

function meRectSquare(rng: Rng, d: MockDifficulty): QuestionDraft {
  for (let tries = 0; tries < 200; tries++) {
    const L = rng.int(12, 60)
    const B = rng.int(6, 40)
    if ((L + B) % 2 !== 0 || L <= B) continue
    const s = (L + B) / 2
    const area = s * s
    ensure(4 * s === 2 * (L + B), 'perimeter mismatch')
    const form = rng.int(0, d === 'hard' ? 2 : 1)
    if (form === 0) return nq(rng, 'mensuration', `The perimeter of a square is equal to the perimeter of a rectangle of length ${L} cm and breadth ${B} cm. What is the area of the square (in cm²)?`, area, [L * B, s * 4, (L * B + area) / 2, s * s + 25], `Perimeter of rectangle = 2(${L} + ${B}) = ${2 * (L + B)} cm.\nSide of square = ${2 * (L + B)}/4 = ${s} cm.\nArea = ${s}² = ${area} cm².`, { post: ' cm²' })
    if (form === 1) return nq(rng, 'mensuration', `The area of a rectangle is ${L * B} cm² and its length is ${L} cm. What is the perimeter of the rectangle (in cm)?`, 2 * (L + B), [L + B, L * B / 2, 2 * L, 2 * (L + B) + 4], `Breadth = ${L * B}/${L} = ${B} cm.\nPerimeter = 2(${L} + ${B}) = ${2 * (L + B)} cm.`, { post: ' cm' })
    const a = rng.pick([3, 4, 5, 2])
    const bq = rng.pick([4, 5, 6, 3].filter((x) => x > a))
    const side = rng.int(3, 12) * bq * 2
    const len = (side * a) / bq
    const y = rng.pick([20, 25, 40, 50])
    const br = (len * (100 - y)) / 100
    if (!Number.isInteger(len) || !Number.isInteger(br) || br < 2) continue
    return nq(rng, 'mensuration', `The length of a rectangle is ${a}/${bq} of the side of a square whose area is ${side * side} cm². The breadth of the rectangle is ${y}% less than its length. What is the area of the rectangle (in cm²)?`, len * br, [side * side, len * len, len * (len - y), len * br + side], `Side of square = √${side * side} = ${side} cm.\nLength = ${a}/${bq} × ${side} = ${len} cm.\nBreadth = ${len} × ${100 - y}/100 = ${br} cm.\nArea = ${len} × ${br} = ${len * br} cm².`, { post: ' cm²' })
  }
  throw new Reject('rect square')
}

function meCircle(rng: Rng, d: MockDifficulty): QuestionDraft {
  const r = radius(rng, d === 'hard')
  const area = fmul(PI, sqf(r))
  const circ = fmul(fmul(P(2), PI), r)
  const semi = fadd(fmul(PI, r), fmul(P(2), r))
  need(terminating(area, 2) && terminating(circ, 2) && terminating(semi, 2), 'unclean')
  const form = rng.int(0, d === 'hard' ? 3 : 2)
  if (form === 0) {
    // area from circumference: two methods
    const rBack = fdiv(fmul(circ, P(7)), P(44))
    ensure(feq(rBack, r) && feq(fdiv(sqf(circ), fmul(P(4), PI)), area), 'circle area from circumference mismatch')
    return nq(rng, 'mensuration', `${rng.pick([`The circumference of a circle is ${pc(circ)} cm. What is its area (in cm²)?`, `A circular plate has a circumference of ${pc(circ)} cm. Find the area of the plate (in cm²).`, `Find the area (in cm²) of a circle whose perimeter is ${pc(circ)} cm.`])} ${PI_NOTE}`, area, [fmul(PI, r), fmul(sqf(r), P(2)), fmul(P(2), circ), fadd(area, P(22))], `2πr = ${pc(circ)} ⇒ r = ${pc(circ)} × 7/44 = ${pc(r)} cm.\nArea = πr² = 22/7 × ${pc(r)}² = ${pc(area)} cm².`, { post: ' cm²' })
  }
  if (form === 1) return nq(rng, 'mensuration', `${rng.pick([`What is the perimeter of a semicircle of radius ${pc(r)} cm?`, `A semicircular plate has a radius of ${pc(r)} cm. What is its perimeter (in cm)?`, `Find the perimeter (in cm) of a semicircular sheet of radius ${pc(r)} cm.`])} ${PI_NOTE}`, semi, [fmul(PI, r), circ, fadd(circ, fmul(P(2), r)), fmul(PI, fmul(P(2), r))], `Perimeter = πr + 2r = 22/7 × ${pc(r)} + 2 × ${pc(r)} = ${pc(fmul(PI, r))} + ${pc(fmul(P(2), r))} = ${pc(semi)} cm.`, { post: ' cm' })
  if (form === 2) {
    const cost = rng.pick([5, 10, 12, 15, 20, 25])
    return nq(rng, 'mensuration', `A circular park has a radius of ${pc(r)} m. What is the cost of fencing it at ₹${cost} per metre? ${PI_NOTE}`, fmul(circ, P(cost)), [fmul(area, P(cost)), fmul(fmul(PI, r), P(cost)), fmul(circ, P(cost + 5)).n], `Circumference = 2πr = 2 × 22/7 × ${pc(r)} = ${pc(circ)} m.\nCost = ${pc(circ)} × ${cost} = ${inr(pc(fmul(circ, P(cost))))}.`, { pre: '₹' })
  }
  const w = rng.int(2, 5)
  const ring = fsub(fmul(PI, sqf(fadd(r, P(w)))), area)
  need(terminating(ring, 2), 'unclean')
  return nq(rng, 'mensuration', `A circular garden of radius ${pc(r)} m is surrounded by a path ${w} m wide. What is the area of the path (in m²)? ${PI_NOTE}`, ring, [fmul(PI, sqf(P(w))), fmul(fmul(PI, P(w)), fmul(P(2), r)), area, fadd(ring, P(22))], `Outer radius = ${pc(r)} + ${w} = ${pc(fadd(r, P(w)))} m.\nArea of path = π(R² − r²) = 22/7 × (${pc(sqf(fadd(r, P(w))))} − ${pc(sqf(r))}) = ${pc(ring)} m².`, { post: ' m²' })
}

function meCylinder(rng: Rng, d: MockDifficulty): QuestionDraft {
  for (let tries = 0; tries < 200; tries++) {
    const r = radius(rng, d === 'hard')
    const h = rng.int(4, 30)
    const vol = fmul(fmul(PI, sqf(r)), P(h))
    const csa = fmul(fmul(fmul(P(2), PI), r), P(h))
    const tsa = fmul(fmul(fmul(P(2), PI), r), fadd(P(h), r))
    if (!fint(vol) || !fint(csa) || !fint(tsa)) continue
    const form = rng.int(0, d === 'hard' ? 3 : 2)
    if (form === 0) return nq(rng, 'mensuration', `What is the volume of a cylinder of radius ${pc(r)} cm and height ${h} cm? ${PI_NOTE}`, vol, [csa, fmul(vol, P(3)), fdiv(vol, P(3)), fadd(vol, P(h * 11))], `Volume = πr²h = 22/7 × ${pc(r)}² × ${h} = ${pc(vol)} cm³.`, { post: ' cm³' })
    if (form === 1) return nq(rng, 'mensuration', `What is the curved surface area of a cylinder of radius ${pc(r)} cm and height ${h} cm? ${PI_NOTE}`, csa, [vol, tsa, fmul(PI, fmul(r, P(h))), fadd(csa, P(44))], `CSA = 2πrh = 2 × 22/7 × ${pc(r)} × ${h} = ${pc(csa)} cm².`, { post: ' cm²' })
    if (form === 2) {
      const hBack = fdiv(vol, fmul(PI, sqf(r)))
      ensure(feq(hBack, P(h)), 'cylinder height mismatch')
      return nq(rng, 'mensuration', `The volume of a cylinder is ${pc(vol)} cm³ and its base radius is ${pc(r)} cm. What is its height (in cm)? ${PI_NOTE}`, h, [h + 2, h * 2, fdiv(vol, fmul(P(2), fmul(PI, r))), h - 1], `Height = V/(πr²) = ${pc(vol)}/(22/7 × ${pc(r)}²) = ${h} cm.`, { post: ' cm' })
    }
    return nq(rng, 'mensuration', `What is the total surface area of a closed cylinder of radius ${pc(r)} cm and height ${h} cm? ${PI_NOTE}`, tsa, [csa, fmul(fmul(PI, r), fadd(P(h), r)), fadd(csa, fmul(PI, sqf(r))), vol], `TSA = 2πr(h + r) = 2 × 22/7 × ${pc(r)} × (${h} + ${pc(r)}) = ${pc(tsa)} cm².`, { post: ' cm²' })
  }
  throw new Reject('cylinder')
}

const TRIPLES: [number, number, number][] = (() => {
  const base: [number, number, number][] = [[3, 4, 5], [5, 12, 13], [8, 15, 17], [7, 24, 25], [20, 21, 29], [9, 40, 41]]
  const out: [number, number, number][] = []
  for (const [x, y, z] of base)
    for (let k = 1; k <= 14; k++)
      for (const [r, h] of [[x * k, y * k], [y * k, x * k]])
        if (r % 7 === 0 && r <= 98 && h <= 120 && z * k <= 150 && h >= 4) out.push([r, h, z * k])
  return out
})()

function meCone(rng: Rng, d: MockDifficulty): QuestionDraft {
  for (let tries = 0; tries < 200; tries++) {
    const [r, h, l] = rng.pick(TRIPLES)
    ensure(r * r + h * h === l * l, 'bad triple')
    const csa = fmul(fmul(PI, P(r)), P(l))
    const vol = fdiv(fmul(fmul(PI, sqf(P(r))), P(h)), P(3))
    if (!fint(csa) || !fint(vol)) continue
    const form = rng.int(0, d === 'hard' ? 2 : 1)
    if (form === 0) return nq(rng, 'mensuration', `${rng.pick([`The base radius of a cone is ${r} cm and its height is ${h} cm. What is its curved surface area (in cm²)?`, `A cone has a height of ${h} cm and a base radius of ${r} cm. Find its curved surface area (in cm²).`, `Find the curved surface area (in cm²) of a conical cap of base radius ${r} cm and vertical height ${h} cm.`])} ${PI_NOTE}`, csa, [fmul(fmul(PI, P(r)), P(h)), vol, fmul(csa, P(2)), fadd(csa, P(22))], `Slant height = √(${r}² + ${h}²) = ${l} cm.\nCSA = πrl = 22/7 × ${r} × ${l} = ${pc(csa)} cm².`, { post: ' cm²' })
    if (form === 1) return nq(rng, 'mensuration', `${rng.pick([`The base radius of a cone is ${r} cm and its height is ${h} cm. What is its volume (in cm³)?`, `A conical vessel has a height of ${h} cm and a base radius of ${r} cm. How much water can it hold (in cm³)?`, `Find the volume (in cm³) of a cone whose base radius is ${r} cm and height is ${h} cm.`])} ${PI_NOTE}`, vol, [fmul(fmul(PI, sqf(P(r))), P(h)), csa, fdiv(vol, P(2)), fadd(vol, P(154))], `Volume = (1/3)πr²h = (1/3) × 22/7 × ${r}² × ${h} = ${pc(vol)} cm³.`, { post: ' cm³' })
    const cost = rng.pick([2, 3, 4, 5])
    return nq(rng, 'mensuration', `A conical tent has a base radius of ${r} m and a height of ${h} m. What is the cost of the canvas required to make it at ₹${cost} per m²? ${PI_NOTE}`, fmul(csa, P(cost)), [fmul(fmul(PI, P(r)), P(h * cost)), fmul(vol, P(cost)), fmul(csa, P(cost + 1))], `Slant height = ${l} m; curved area = πrl = 22/7 × ${r} × ${l} = ${pc(csa)} m².\nCost = ${pc(csa)} × ${cost} = ${inr(pc(fmul(csa, P(cost))))}.`, { pre: '₹' })
  }
  throw new Reject('cone')
}

function meSphere(rng: Rng, d: MockDifficulty): QuestionDraft {
  for (let tries = 0; tries < 200; tries++) {
    const r = radius(rng, true)
    const sa = fmul(fmul(P(4), PI), sqf(r))
    const vol = fmul(fmul(F(4, 3), PI), fmul(sqf(r), r))
    const hemiCurved = fmul(fmul(P(2), PI), sqf(r))
    const hemiTotal = fmul(fmul(P(3), PI), sqf(r))
    if (!terminating(sa, 2)) continue
    const form = rng.int(0, d === 'hard' ? 3 : 1)
    if (form === 0) return nq(rng, 'mensuration', `${rng.pick([`What is the surface area of a sphere of radius ${pc(r)} cm?`, `The radius of a metal ball is ${pc(r)} cm. What is its total surface area (in cm²)?`, `Find the surface area of a sphere whose radius is ${pc(r)} cm.`])} ${PI_NOTE}`, sa, [vol, hemiCurved, fmul(PI, sqf(r)), fadd(sa, P(44))], `Surface area = 4πr² = 4 × 22/7 × ${pc(r)}² = ${pc(sa)} cm².`, { post: ' cm²' })
    if (form === 1) {
      if (!terminating(hemiTotal, 2)) continue
      return nq(rng, 'mensuration', `${rng.pick([`What is the total surface area of a solid hemisphere of radius ${pc(r)} cm?`, `A solid dome is in the shape of a hemisphere of radius ${pc(r)} cm. What is its total surface area (in cm²)?`, `Find the total surface area of a solid hemisphere whose radius is ${pc(r)} cm.`])} ${PI_NOTE}`, hemiTotal, [hemiCurved, sa, fmul(PI, sqf(r)), fadd(hemiTotal, P(22))], `TSA = 3πr² = 3 × 22/7 × ${pc(r)}² = ${pc(hemiTotal)} cm².`, { post: ' cm²' })
    }
    if (!fint(vol)) continue
    if (form === 2) return nq(rng, 'mensuration', `What is the volume of a sphere of radius ${pc(r)} cm? ${PI_NOTE}`, vol, [sa, fdiv(vol, P(2)), fmul(fmul(PI, sqf(r)), r), fadd(vol, P(154))], `Volume = (4/3)πr³ = (4/3) × 22/7 × ${pc(r)}³ = ${pc(vol)} cm³.`, { post: ' cm³' })
    return nq(rng, 'mensuration', `The volume of a sphere is ${pc(vol)} cm³. What is its surface area (in cm²)? ${PI_NOTE}`, sa, [vol, hemiCurved, fmul(fmul(P(4), PI), r), fadd(sa, P(22))], `(4/3)πr³ = ${pc(vol)} ⇒ r³ = ${pc(fdiv(fmul(vol, P(21)), P(88)))} ⇒ r = ${pc(r)} cm.\nSurface area = 4πr² = ${pc(sa)} cm².`, { post: ' cm²' })
  }
  throw new Reject('sphere')
}

function mePath(rng: Rng, d: MockDifficulty): QuestionDraft {
  const l = rng.int(10, 50)
  const b = rng.int(8, l - 2)
  const w = rng.int(1, 4)
  const outside = rng.chance(0.5)
  need(b > 2 * w + 2, 'path too wide')
  const path = outside ? (l + 2 * w) * (b + 2 * w) - l * b : l * b - (l - 2 * w) * (b - 2 * w)
  const path2 = outside ? 2 * w * (l + b) + 4 * w * w : 2 * w * (l + b) - 4 * w * w
  ensure(path === path2, 'path area mismatch')
  const rate = rng.pick([20, 25, 30, 40, 50])
  const where = outside ? 'around the outside of' : 'inside along the boundary of'
  if (rng.chance(0.5) || d === 'medium') return nq(rng, 'mensuration', `A rectangular lawn is ${l} m long and ${b} m wide. A path ${w} m wide is built ${where} the lawn. What is the area of the path (in m²)?`, path, [2 * w * (l + b), l * b, path + w * w, path - 2 * w], `${outside ? `Outer rectangle = ${l + 2 * w} × ${b + 2 * w}` : `Inner rectangle = ${l - 2 * w} × ${b - 2 * w}`} = ${outside ? (l + 2 * w) * (b + 2 * w) : (l - 2 * w) * (b - 2 * w)} m².\nArea of path = ${outside ? `${(l + 2 * w) * (b + 2 * w)} − ${l * b}` : `${l * b} − ${(l - 2 * w) * (b - 2 * w)}`} = ${path} m².`, { post: ' m²' })
  return nq(rng, 'mensuration', `A rectangular lawn is ${l} m long and ${b} m wide. A path ${w} m wide is built ${where} the lawn. What is the cost of paving the path at ₹${rate} per m²?`, path * rate, [2 * w * (l + b) * rate, l * b * rate, (path + w * w) * rate, path * (rate + 5)], `Area of path = ${path} m² (outer − inner rectangle).\nCost = ${path} × ${rate} = ${inr(path * rate)}.`, { pre: '₹' })
}

function meRecast(rng: Rng): QuestionDraft {
  for (let tries = 0; tries < 300; tries++) {
    const rs = rng.pick([3, 6, 1.5])
    const N = rng.int(4, 64)
    const R = rng.int(3, 24)
    const volSphereNum = fmul(F(4, 3), fmul(F(Math.round(rs * 2), 2), fmul(F(Math.round(rs * 2), 2), F(Math.round(rs * 2), 2))))
    const H = fdiv(fmul(P(N), volSphereNum), P(R * R))
    if (!fint(H) || H.n < 4 || H.n > 90) continue
    ensure(feq(fmul(P(R * R), H), fmul(P(N), volSphereNum)), 'recast volume mismatch')
    return nq(rng, 'mensuration', `A solid metal cylinder of radius ${R} cm and height ${H.n} cm is melted and recast into small spheres of radius ${pc(F(Math.round(rs * 2), 2))} cm. How many spheres are obtained?`, N, [N * 2, Math.round(N / 2), N + 4, N + 8], `Volume of cylinder = πR²H = π × ${R}² × ${H.n}.\nVolume of one sphere = (4/3)π × ${pc(F(Math.round(rs * 2), 2))}³ = π × ${pc(volSphereNum)}.\nNumber of spheres = ${R * R * H.n}/${pc(volSphereNum)} = ${N}.`)
  }
  throw new Reject('recast')
}

function meTriangle(rng: Rng): QuestionDraft {
  const [a, b, c] = rng.pick([[6, 8, 10], [5, 12, 13], [8, 15, 17], [9, 12, 15], [7, 24, 25], [12, 16, 20], [15, 20, 25], [20, 21, 29], [10, 24, 26], [18, 24, 30], [9, 40, 41]] as [number, number, number][])
  ensure(a * a + b * b === c * c, 'bad triple')
  const form = rng.int(0, 2)
  if (form === 0) return nq(rng, 'mensuration', `The two shorter sides of a right-angled triangle are ${a} cm and ${b} cm. What is its perimeter (in cm)?`, a + b + c, [a + b, a * b / 2, a + b + c + 2, a + b + c - 2], `Hypotenuse = √(${a}² + ${b}²) = ${c} cm.\nPerimeter = ${a} + ${b} + ${c} = ${a + b + c} cm.`, { post: ' cm' })
  if (form === 1) return nq(rng, 'mensuration', `The hypotenuse of a right-angled triangle is ${c} cm and one of the other sides is ${a} cm. What is the area of the triangle (in cm²)?`, (a * b) / 2, [a * b, (a * c) / 2, b, (b * c) / 2], `Other side = √(${c}² − ${a}²) = ${b} cm.\nArea = ½ × ${a} × ${b} = ${(a * b) / 2} cm².`, { post: ' cm²' })
  return nq(rng, 'mensuration', `The diagonals of a rhombus are ${2 * a} cm and ${2 * b} cm. What is its perimeter (in cm)?`, 4 * c, [2 * (a + b), 4 * (a + b), (4 * c) / 2, 4 * c + 4], `Half-diagonals are ${a} cm and ${b} cm, so side = √(${a}² + ${b}²) = ${c} cm.\nPerimeter = 4 × ${c} = ${4 * c} cm.`, { post: ' cm' })
}

function meCuboid(rng: Rng): QuestionDraft {
  for (let tries = 0; tries < 300; tries++) {
    const s = rng.pick([2, 3, 4, 5])
    const l = s * rng.int(2, 8)
    const b = s * rng.int(2, 6)
    const h = s * rng.int(2, 6)
    const count = (l * b * h) / (s * s * s)
    if (!Number.isInteger(count)) continue
    const tsa = 2 * (l * b + b * h + h * l)
    const form = rng.int(0, 1)
    if (form === 0) return nq(rng, 'mensuration', `How many cubes of side ${s} cm can be cut from a cuboid of dimensions ${l} cm × ${b} cm × ${h} cm?`, count, [Math.round((l * b * h) / (s * s)), count + 10, (l * b * h) / s, Math.round(count / 2)], `Volume of cuboid = ${l} × ${b} × ${h} = ${l * b * h} cm³.\nVolume of one cube = ${s}³ = ${s ** 3} cm³.\nNumber of cubes = ${l * b * h}/${s ** 3} = ${count}.`)
    return nq(rng, 'mensuration', `What is the total surface area of a cuboid of length ${l} cm, breadth ${b} cm and height ${h} cm (in cm²)?`, tsa, [l * b * h, tsa / 2, l * b + b * h + h * l, tsa + 2 * l], `TSA = 2(lb + bh + hl) = 2(${l * b} + ${b * h} + ${h * l}) = ${tsa} cm².`, { post: ' cm²' })
  }
  throw new Reject('cuboid')
}

function meTrapezium(rng: Rng): QuestionDraft {
  for (let tries = 0; tries < 200; tries++) {
    const a = rng.int(8, 40)
    const b = rng.int(a + 2, a + 25)
    const h = rng.int(4, 24)
    if (((a + b) * h) % 2 !== 0) continue
    const area = ((a + b) * h) / 2
    const cost = rng.pick([10, 12, 15, 20])
    if (rng.chance(0.5)) return nq(rng, 'mensuration', `The parallel sides of a trapezium are ${a} cm and ${b} cm and the distance between them is ${h} cm. What is its area (in cm²)?`, area, [(a + b) * h, a * b, (a + b) / 2, area + h], `Area = ½ × (${a} + ${b}) × ${h} = ${area} cm².`, { post: ' cm²' })
    return nq(rng, 'mensuration', `A field is in the shape of a trapezium with parallel sides ${a} m and ${b} m, the distance between them being ${h} m. What is the cost of levelling it at ₹${cost} per m²?`, area * cost, [(a + b) * h * cost, a * b * cost, area * (cost + 2), area + cost], `Area = ½ × (${a} + ${b}) × ${h} = ${area} m².\nCost = ${area} × ${cost} = ${inr(area * cost)}.`, { pre: '₹' })
  }
  throw new Reject('trapezium')
}

function meTrack(rng: Rng): QuestionDraft {
  for (let tries = 0; tries < 100; tries++) {
    const dd = rng.pick([14, 28, 21, 35])
    const r = F(dd, 2)
    const l = rng.int(20, 90)
    const perim = fadd(P(2 * l), fmul(PI, P(dd)))
    const area = fadd(P(l * dd), fmul(PI, sqf(r)))
    if (!fint(perim) || !fint(area)) continue
    if (rng.chance(0.5)) return nq(rng, 'mensuration', `A running track consists of a rectangle of length ${l} m and width ${dd} m with a semicircle attached to each of its two shorter sides. What is the total length of the track (its perimeter) in metres? ${PI_NOTE}`, perim, [fadd(P(2 * l), P(2 * dd)), fadd(P(2 * l), fmul(PI, r)), fmul(P(l), P(dd)), fadd(perim, P(14))], `The two semicircles make one full circle of diameter ${dd} m: circumference = π × ${dd} = ${pc(fmul(PI, P(dd)))} m.\nPerimeter = 2 × ${l} + ${pc(fmul(PI, P(dd)))} = ${pc(perim)} m.`, { post: ' m' })
    return nq(rng, 'mensuration', `A playground consists of a rectangle of length ${l} m and width ${dd} m with a semicircle attached to each of its two shorter sides. What is the total area of the playground in m²? ${PI_NOTE}`, area, [P(l * dd), fmul(PI, sqf(r)), fadd(P(l * dd), fmul(PI, r)), fadd(area, P(77))], `Rectangle = ${l} × ${dd} = ${l * dd} m².\nTwo semicircles = one circle of radius ${pc(r)} m = 22/7 × ${pc(r)}² = ${pc(fmul(PI, sqf(r)))} m².\nTotal area = ${pc(area)} m².`, { post: ' m²' })
  }
  throw new Reject('track')
}

export const MENSURATION_TPLS: Tpl[] = [
  { name: 'me-rectsquare', gen: meRectSquare },
  { name: 'me-circle', gen: meCircle },
  { name: 'me-cylinder', gen: meCylinder },
  { name: 'me-cone', gen: meCone },
  { name: 'me-sphere', gen: meSphere },
  { name: 'me-path', gen: mePath },
  { name: 'me-recast', d: 'hard', gen: (r) => meRecast(r) },
  { name: 'me-triangle', d: 'medium', gen: (r) => meTriangle(r) },
  { name: 'me-cuboid', d: 'medium', gen: (r) => meCuboid(r) },
  { name: 'me-trapezium', d: 'medium', gen: (r) => meTrapezium(r) },
  { name: 'me-track', d: 'hard', gen: (r) => meTrack(r) },
]

// ============================================================================ PROBABILITY & P&C
/** Fraction text plus plausible wrong fractions built from the same counting denominator. */
function probQ(rng: Rng, stem: string, num: number, den: number, extra: Frac[], why: string): QuestionDraft {
  const p = F(num, den)
  need(p.n > 0 && p.n < p.d, 'degenerate probability')
  const correct = fracStr(p)
  const w = new Set<string>()
  const add = (f: Frac): void => {
    if (f.n > 0 && f.n < f.d && !feq(f, p)) w.add(fracStr(f))
  }
  extra.forEach(add)
  add(fsub(F(1), p))
  for (const dlt of [1, 2, -1, 3, -2]) add(F(num + dlt, den))
  add(fmul(p, F(2)))
  need(w.size >= 4, 'not enough fraction distractors')
  return strQ(rng, { topic: 'probability-pnc', stem, correct, wrong: [...w], why: `${why}\nProbability = ${num}/${den}${p.d !== den ? ` = ${correct}` : ''}.`, none: 0.1 })
}

function ppBalls(rng: Rng, d: MockDifficulty): QuestionDraft {
  for (let tries = 0; tries < 200; tries++) {
    const r = rng.int(2, 7)
    const b = rng.int(2, 7)
    const g = rng.int(0, 6)
    const n = r + b + g
    const k = d === 'hard' ? rng.int(2, 3) : 2
    if (n < k + 2 || n > 16) continue
    const ev = rng.int(0, d === 'hard' ? 4 : 2)
    // enumerate every k-subset of balls labelled by colour (second method)
    const colour: string[] = [...Array(r).fill('R'), ...Array(b).fill('B'), ...Array(g).fill('G')]
    let fav = 0
    let total = 0
    const idx: number[] = []
    const rec = (start: number): void => {
      if (idx.length === k) {
        total++
        const cs = idx.map((i) => colour[i])
        const nr = cs.filter((c) => c === 'R').length
        const nb = cs.filter((c) => c === 'B').length
        const same = new Set(cs).size === 1
        const ok = ev === 0 ? nr === k : ev === 1 ? same : ev === 2 ? nr === 1 && k === 2 : ev === 3 ? nb >= 1 : nr === 0
        if (ok) fav++
        return
      }
      for (let i = start; i < n; i++) {
        idx.push(i)
        rec(i + 1)
        idx.pop()
      }
    }
    rec(0)
    let formula: number
    if (ev === 0) formula = choose(r, k)
    else if (ev === 1) formula = choose(r, k) + choose(b, k) + choose(g, k)
    else if (ev === 2) formula = r * (n - r)
    else if (ev === 3) formula = choose(n, k) - choose(n - b, k)
    else formula = choose(n - r, k)
    if (ev === 2 && k !== 2) continue
    ensure(total === choose(n, k) && fav === formula, 'balls: enumeration and formula disagree')
    if (fav === 0 || fav === total) continue
    const desc = ['are all red', 'are all of the same colour', 'include exactly one red ball', 'include at least one blue ball', 'include no red ball'][ev]
    const contents = `${r} red, ${b} blue${g ? ` and ${g} green` : ''} balls`
    const wrongRepl = ev === 0 ? F(r ** k, n ** k) : ev === 1 ? fadd(fadd(F(r ** k, n ** k), F(b ** k, n ** k)), F(g ** k, n ** k)) : F(fav + 1, total)
    return probQ(rng, `A bag contains ${contents}. ${k === 2 ? 'Two' : 'Three'} balls are drawn at random without replacement. What is the probability that the ${k} balls drawn ${desc}?`, fav, total, [wrongRepl, F(fav, total * k)], `Total ways = ${n}C${k} = ${total}.\nFavourable ways = ${fav}.`)
  }
  throw new Reject('balls')
}

const SUITS = ['S', 'H', 'D', 'C']
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']
function ppCards(rng: Rng, d: MockDifficulty): QuestionDraft {
  const deck: { s: string; r: string }[] = []
  for (const s of SUITS) for (const r of RANKS) deck.push({ s, r })
  const single = d === 'medium' ? rng.chance(0.75) : rng.chance(0.35)
  if (single) {
    const ev = rng.int(0, 4)
    const tests: [string, (c: { s: string; r: string }) => boolean, number][] = [
      ['a king or a heart', (c) => c.r === 'K' || c.s === 'H', 16],
      ['a face card (king, queen or jack)', (c) => ['K', 'Q', 'J'].includes(c.r), 12],
      ['a red queen', (c) => c.r === 'Q' && (c.s === 'H' || c.s === 'D'), 2],
      ['neither a spade nor an ace', (c) => c.s !== 'S' && c.r !== 'A', 36],
      ['a red card or a king', (c) => c.s === 'H' || c.s === 'D' || c.r === 'K', 28],
    ]
    const [desc, f, formula] = tests[ev]
    const fav = deck.filter(f).length
    ensure(fav === formula, 'cards: enumeration and formula disagree')
    return probQ(rng, `One card is drawn at random from a well-shuffled pack of 52 cards. What is the probability that it is ${desc}?`, fav, 52, [F(fav + 4, 52)], `Favourable cards = ${fav}; total = 52.`)
  }
  const ev = rng.int(0, 3)
  const tests: [string, (a: { s: string; r: string }, b: { s: string; r: string }) => boolean, number][] = [
    ['are both kings', (a, b) => a.r === 'K' && b.r === 'K', choose(4, 2)],
    ['are both hearts', (a, b) => a.s === 'H' && b.s === 'H', choose(13, 2)],
    ['are both red cards', (a, b) => (a.s === 'H' || a.s === 'D') && (b.s === 'H' || b.s === 'D'), choose(26, 2)],
    ['are of the same suit', (a, b) => a.s === b.s, 4 * choose(13, 2)],
  ]
  const [desc, f, formula] = tests[ev]
  let fav = 0
  for (let i = 0; i < 52; i++) for (let j = i + 1; j < 52; j++) if (f(deck[i], deck[j])) fav++
  ensure(fav === formula, 'cards: pair enumeration and formula disagree')
  return probQ(rng, `Two cards are drawn at random from a well-shuffled pack of 52 cards. What is the probability that the two cards ${desc}?`, fav, choose(52, 2), [F(formula, 52 * 52)], `Total ways = 52C2 = ${choose(52, 2)}.\nFavourable ways = ${fav}.`)
}

function ppDice(rng: Rng, d: MockDifficulty): QuestionDraft {
  const isPrime = (n: number): boolean => [2, 3, 5, 7, 11].includes(n)
  if (d === 'hard' && rng.chance(0.4)) {
    const t = rng.int(7, 14)
    let fav = 0
    for (let a = 1; a <= 6; a++) for (let b = 1; b <= 6; b++) for (let c = 1; c <= 6; c++) if (a + b + c === t) fav++
    // formula: coefficient via inclusion-exclusion
    let f = 0
    for (let k = 0; k <= 3; k++) {
      const rest = t - 3 - 6 * k
      if (rest >= 0) f += (k % 2 === 0 ? 1 : -1) * choose(3, k) * choose(rest + 2, 2)
    }
    ensure(f === fav, 'three dice: enumeration and inclusion-exclusion disagree')
    return probQ(rng, `Three fair dice are thrown simultaneously. What is the probability that the sum of the numbers on the top faces is ${t}?`, fav, 216, [F(fav, 36)], `Total outcomes = 6³ = 216.\nNumber of ways to get a sum of ${t} = ${fav}.`)
  }
  const ev = rng.int(0, 6)
  const tests: [string, (a: number, b: number) => boolean][] = [
    [`the sum of the numbers on the two dice is ${rng.int(3, 11)}`, () => false],
    ['the sum of the numbers is a prime number', (a, b) => isPrime(a + b)],
    ['the product of the numbers is even', (a, b) => (a * b) % 2 === 0],
    ['both dice show the same number', (a, b) => a === b],
    ['the sum of the numbers is a multiple of 4', (a, b) => (a + b) % 4 === 0],
    ['the number on the first die is greater than the number on the second', (a, b) => a > b],
    ['the numbers on the two dice differ by exactly 2', (a, b) => Math.abs(a - b) === 2],
  ]
  let [desc, f] = tests[ev]
  if (ev === 0) {
    const t = Number(desc.match(/\d+/)?.[0])
    f = (a, b) => a + b === t
    const ways = 6 - Math.abs(t - 7)
    let fav0 = 0
    for (let a = 1; a <= 6; a++) for (let b = 1; b <= 6; b++) if (a + b === t) fav0++
    ensure(fav0 === ways, 'dice: sum formula disagrees with enumeration')
  }
  let fav = 0
  for (let a = 1; a <= 6; a++) for (let b = 1; b <= 6; b++) if (f(a, b)) fav++
  const expected = [-1, 15, 27, 6, 9, 15, 8][ev]
  if (ev > 0) ensure(fav === expected, `dice: enumeration ${fav} != hand count ${expected}`)
  return probQ(rng, `Two fair dice are thrown together. What is the probability that ${desc}?`, fav, 36, [F(fav, 6), F(fav + 1, 36)], `Total outcomes = 36.\nFavourable outcomes = ${fav}.`)
}

const WORDS = ['LEADER', 'BANANA', 'APPLE', 'LETTER', 'TOMATO', 'SUCCESS', 'ORANGE', 'GARDEN', 'DOCTOR', 'BALLOON', 'MOTHER', 'PARROT', 'ALMOND']
function permsOf(word: string): Set<string> {
  const out = new Set<string>()
  const used = new Array(word.length).fill(false)
  const cur: string[] = []
  const rec = (): void => {
    if (cur.length === word.length) {
      out.add(cur.join(''))
      return
    }
    for (let i = 0; i < word.length; i++) {
      if (used[i]) continue
      used[i] = true
      cur.push(word[i])
      rec()
      cur.pop()
      used[i] = false
    }
  }
  rec()
  return out
}
function ppLetters(rng: Rng, d: MockDifficulty): QuestionDraft {
  const word = rng.pick(WORDS)
  const n = word.length
  const counts: Record<string, number> = {}
  for (const ch of word) counts[ch] = (counts[ch] ?? 0) + 1
  let formula = fact(n)
  for (const c of Object.values(counts)) formula /= fact(c)
  const all = permsOf(word)
  ensure(all.size === formula, 'letters: distinct arrangement count mismatch')
  const vowels = new Set(['A', 'E', 'I', 'O', 'U'])
  const hasV = [...word].some((c) => vowels.has(c))
  const ev = rng.int(0, d === 'hard' ? 3 : 1)
  if (ev === 0 || !hasV) return nq(rng, 'probability-pnc', `In how many different ways can the letters of the word '${word}' be arranged?`, formula, [fact(n), formula / 2, fact(n - 1), formula + n], `Letters = ${n}${Object.entries(counts).filter(([, c]) => c > 1).map(([l, c]) => `; ${l} repeats ${c} times`).join('')}.\nArrangements = ${n}!${Object.values(counts).filter((c) => c > 1).map((c) => `/${c}!`).join('')} = ${formula}.`)
  const tests: [string, (s: string) => boolean][] = [
    ['begin with a vowel', (s) => vowels.has(s[0])],
    ['have all the vowels together', (s) => {
      const pos = [...s].map((c, i) => (vowels.has(c) ? i : -1)).filter((i) => i >= 0)
      return pos[pos.length - 1] - pos[0] === pos.length - 1
    }],
    ['begin with a consonant and end with a vowel', (s) => !vowels.has(s[0]) && vowels.has(s[n - 1])],
  ]
  const test = tests[ev === 1 ? 0 : ev === 2 ? 1 : 2]
  const cnt = [...all].filter(test[1]).length
  // second method: closed formula for the common cases
  if (test[0].startsWith('have all')) {
    const vs = [...word].filter((c) => vowels.has(c))
    let vf = fact(vs.length)
    const vc: Record<string, number> = {}
    for (const c of vs) vc[c] = (vc[c] ?? 0) + 1
    for (const c of Object.values(vc)) vf /= fact(c)
    const cons = [...word].filter((c) => !vowels.has(c))
    let cf = fact(cons.length + 1)
    const cc: Record<string, number> = {}
    for (const c of cons) cc[c] = (cc[c] ?? 0) + 1
    for (const c of Object.values(cc)) cf /= fact(c)
    ensure(vf * cf === cnt, 'letters: vowels-together formula disagrees with enumeration')
  }
  need(cnt > 0 && cnt !== formula, 'degenerate count')
  return nq(rng, 'probability-pnc', `In how many ways can the letters of the word '${word}' be arranged so that the arrangements ${test[0]}?`, cnt, [formula, cnt + 24, Math.round(cnt / 2), formula - cnt], `Total distinct arrangements of '${word}' = ${formula}.\nCounting the arrangements that ${test[0]} (checked by listing all of them) gives ${cnt}.`)
}

function ppCommittee(rng: Rng, d: MockDifficulty): QuestionDraft {
  for (let tries = 0; tries < 200; tries++) {
    const m = rng.int(3, 7)
    const w = rng.int(3, 6)
    const k = rng.int(3, Math.min(5, m + w - 2))
    const n = m + w
    const ev = rng.int(0, d === 'hard' ? 3 : 1)
    const people = [...Array(m).fill('M'), ...Array(w).fill('W')] as string[]
    let cnt = 0
    let formula = 0
    const test: [string, (men: number, women: number, idx: number[]) => boolean][] = [
      ['the committee has at least 2 women', (_a, b) => b >= 2],
      ['the committee has exactly 2 men', (a) => a === 2],
      ['a particular man is always included in the committee', (_a, _b, idx) => idx.includes(0)],
      ['the committee has at least one man and at least one woman', (a, b) => a >= 1 && b >= 1],
    ]
    if (ev === 0) for (let x = 2; x <= k; x++) formula += choose(w, x) * choose(m, k - x)
    else if (ev === 1) formula = choose(m, 2) * choose(w, k - 2)
    else if (ev === 2) formula = choose(n - 1, k - 1)
    else formula = choose(n, k) - choose(m, k) - choose(w, k)
    const idx: number[] = []
    const rec = (start: number): void => {
      if (idx.length === k) {
        const men = idx.filter((i) => people[i] === 'M').length
        if (test[ev][1](men, k - men, idx)) cnt++
        return
      }
      for (let i = start; i < n; i++) {
        idx.push(i)
        rec(i + 1)
        idx.pop()
      }
    }
    rec(0)
    ensure(cnt === formula, 'committee: enumeration and formula disagree')
    if (cnt < 2) continue
    return nq(rng, 'probability-pnc', `A committee of ${k} members is to be formed from ${m} men and ${w} women. In how many ways can it be formed if ${test[ev][0]}?`, cnt, [choose(n, k), cnt + choose(m, 2), cnt - 5 > 0 ? cnt - 5 : cnt + 7, formula + m], `Total ways without restriction = ${n}C${k} = ${choose(n, k)}.\nNumber of ways when ${test[ev][0]} = ${cnt}.`)
  }
  throw new Reject('committee')
}

function ppDigits(rng: Rng): QuestionDraft {
  const pool = rng.pick([[1, 2, 3, 4, 5, 6], [1, 2, 3, 4, 5, 6, 7], [2, 3, 4, 5, 6, 7], [1, 3, 4, 5, 6, 8]])
  const k = rng.pick([3, 3, 4])
  const n = pool.length
  const ev = rng.int(0, 2)
  let cnt = 0
  const used: boolean[] = new Array(n).fill(false)
  const cur: number[] = []
  const rec = (): void => {
    if (cur.length === k) {
      const last = cur[k - 1]
      if (ev === 0 || (ev === 1 && last % 2 === 0) || (ev === 2 && last === 5)) cnt++
      return
    }
    for (let i = 0; i < n; i++) {
      if (used[i]) continue
      used[i] = true
      cur.push(pool[i])
      rec()
      cur.pop()
      used[i] = false
    }
  }
  rec()
  const perm = (a: number, b: number): number => fact(a) / fact(a - b)
  const evens = pool.filter((x) => x % 2 === 0).length
  const formula = ev === 0 ? perm(n, k) : ev === 1 ? evens * perm(n - 1, k - 1) : pool.includes(5) ? perm(n - 1, k - 1) : 0
  ensure(cnt === formula, 'digits: enumeration and formula disagree')
  need(cnt > 0, 'no such numbers')
  const desc = ev === 0 ? '' : ev === 1 ? ' even' : ' divisible by 5'
  return nq(rng, 'probability-pnc', `How many${desc} ${k}-digit numbers can be formed using the digits ${pool.join(', ')} if no digit is repeated?`, cnt, [perm(n, k) + (ev === 0 ? 10 : 0), cnt * 2, Math.round(cnt / 2), cnt + n], `Number of digits = ${n}; digits to be used = ${k}.\n${ev === 0 ? `${n}P${k}` : ev === 1 ? `Units place can be filled in ${evens} ways, remaining places in ${n - 1}P${k - 1} ways` : `Units place is 5, remaining places in ${n - 1}P${k - 1} ways`} = ${cnt}.`)
}

function ppCounting(rng: Rng): QuestionDraft {
  const form = rng.int(0, 3)
  const n = rng.int(6, 16)
  if (form === 0) {
    let hs = 0
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) hs++
    ensure(hs === choose(n, 2), 'handshakes mismatch')
    return nq(rng, 'probability-pnc', `At a meeting, each of the ${n} participants shakes hands with every other participant exactly once. What is the total number of handshakes?`, hs, [n * (n - 1), n * n, hs + n, hs - 1], `Handshakes = ${n}C2 = ${n} × ${n - 1}/2 = ${hs}.`)
  }
  if (form === 1) {
    const diag = (n * (n - 3)) / 2
    let cnt = 0
    for (let i = 0; i < n; i++) for (let j = i + 2; j < n; j++) if (!(i === 0 && j === n - 1)) cnt++
    ensure(cnt === diag, 'diagonals mismatch')
    return nq(rng, 'probability-pnc', `How many diagonals does a polygon with ${n} sides have?`, diag, [choose(n, 2), n * (n - 3), diag + n, diag - n > 0 ? diag - n : diag + 2], `Diagonals = ${n}C2 − ${n} = ${choose(n, 2)} − ${n} = ${diag}.`)
  }
  const m = rng.int(4, 7)
  const names = ['A', 'B', 'C', 'D', 'E', 'F', 'G'].slice(0, m)
  if (form === 2) {
    // row arrangements with two specific persons together
    let cnt = 0
    const used = new Array(m).fill(false)
    const cur: string[] = []
    const rec = (): void => {
      if (cur.length === m) {
        const a = cur.indexOf('A')
        const b = cur.indexOf('B')
        if (Math.abs(a - b) === 1) cnt++
        return
      }
      for (let i = 0; i < m; i++) {
        if (used[i]) continue
        used[i] = true
        cur.push(names[i])
        rec()
        cur.pop()
        used[i] = false
      }
    }
    rec()
    ensure(cnt === 2 * fact(m - 1), 'together arrangement mismatch')
    return nq(rng, 'probability-pnc', `In how many ways can ${m} persons ${names.join(', ')} be seated in a row so that A and B always sit together?`, cnt, [fact(m), fact(m - 1), cnt + fact(m - 2), fact(m) - cnt], `Treat A and B as one unit: (${m} − 1)! = ${fact(m - 1)} arrangements, and A, B can swap in 2 ways.\nTotal = 2 × ${fact(m - 1)} = ${cnt}.`)
  }
  // circular arrangements, two specific persons adjacent
  let cnt = 0
  const seen = new Set<string>()
  const used = new Array(m).fill(false)
  const cur: string[] = []
  const rec = (): void => {
    if (cur.length === m) {
      const canon = (() => {
        const rots: string[] = []
        for (let s = 0; s < m; s++) rots.push([...cur.slice(s), ...cur.slice(0, s)].join(''))
        return rots.sort()[0]
      })()
      if (seen.has(canon)) return
      seen.add(canon)
      const a = cur.indexOf('A')
      const b = cur.indexOf('B')
      const dd = Math.abs(a - b)
      if (dd === 1 || dd === m - 1) cnt++
      return
    }
    for (let i = 0; i < m; i++) {
      if (used[i]) continue
      used[i] = true
      cur.push(names[i])
      rec()
      cur.pop()
      used[i] = false
    }
  }
  rec()
  ensure(cnt === 2 * fact(m - 2), 'circular adjacent mismatch')
  return nq(rng, 'probability-pnc', `In how many ways can ${m} persons be seated around a circular table so that two particular persons always sit next to each other?`, cnt, [fact(m - 1), 2 * fact(m - 1), fact(m - 2), cnt + fact(m - 3)], `Treat the two persons as one unit: (${m - 1} − 1)! = ${fact(m - 2)} circular arrangements, and they can swap in 2 ways.\nTotal = 2 × ${fact(m - 2)} = ${cnt}.`)
}

function ppNumberPick(rng: Rng): QuestionDraft {
  const N = rng.pick([20, 25, 30, 40, 50, 60, 100])
  const a = rng.pick([2, 3, 4, 5, 6])
  const b = rng.pick([3, 5, 7, 4, 6].filter((x) => x !== a))
  let cnt = 0
  for (let i = 1; i <= N; i++) if (i % a === 0 || i % b === 0) cnt++
  const formula = Math.floor(N / a) + Math.floor(N / b) - Math.floor(N / lcm(a, b))
  ensure(cnt === formula, 'multiples: enumeration and inclusion-exclusion disagree')
  need(cnt > 1 && cnt < N, 'degenerate')
  return probQ(rng, `A number is selected at random from the numbers 1 to ${N}. What is the probability that it is a multiple of ${a} or ${b}?`, cnt, N, [F(Math.floor(N / a) + Math.floor(N / b), N)], `Multiples of ${a} = ${Math.floor(N / a)}; multiples of ${b} = ${Math.floor(N / b)}; multiples of both (LCM ${lcm(a, b)}) = ${Math.floor(N / lcm(a, b))}.\nFavourable = ${Math.floor(N / a)} + ${Math.floor(N / b)} − ${Math.floor(N / lcm(a, b))} = ${cnt}.`)
}

function ppReplacement(rng: Rng): QuestionDraft {
  for (let tries = 0; tries < 100; tries++) {
    const r = rng.int(2, 8)
    const b = rng.int(2, 8)
    const n = r + b
    const ev = rng.int(0, 2)
    let fav = 0
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const ci = i < r ? 'R' : 'B'
      const cj = j < r ? 'R' : 'B'
      if (ev === 0 ? ci === 'R' && cj === 'R' : ev === 1 ? ci !== cj : ci === cj) fav++
    }
    const formula = ev === 0 ? r * r : ev === 1 ? 2 * r * b : r * r + b * b
    ensure(fav === formula, 'replacement: enumeration and formula disagree')
    const desc = ['both are red', 'are of different colours', 'are of the same colour'][ev]
    return probQ(rng, `A bag contains ${r} red and ${b} blue balls. Two balls are drawn one after the other, with replacement. What is the probability that the two balls drawn ${desc}?`, fav, n * n, [F(r * (r - 1), n * (n - 1)), F(2 * r * b, n * (n - 1))], `Each draw has ${n} equally likely outcomes, so ${n * n} ordered pairs in all.\nFavourable pairs = ${fav}.`)
  }
  throw new Reject('replacement')
}

export const PROB_TPLS: Tpl[] = [
  { name: 'pp-balls', gen: ppBalls },
  { name: 'pp-cards', gen: ppCards },
  { name: 'pp-dice', gen: ppDice },
  { name: 'pp-letters', gen: ppLetters },
  { name: 'pp-committee', gen: ppCommittee },
  { name: 'pp-digits', gen: (r) => ppDigits(r) },
  { name: 'pp-counting', gen: (r) => ppCounting(r) },
  { name: 'pp-multiples', gen: (r) => ppNumberPick(r) },
  { name: 'pp-replacement', d: 'hard', gen: (r) => ppReplacement(r) },
]

// ============================================================================ NUMBER SYSTEM
function nsHcfRemainder(rng: Rng, d: MockDifficulty): QuestionDraft {
  for (let tries = 0; tries < 300; tries++) {
    const g = rng.int(6, d === 'hard' ? 48 : 30)
    const r1 = rng.int(1, 5)
    const same = d === 'medium' || rng.chance(0.5)
    const r2 = same ? r1 : rng.int(1, 5)
    if (g <= Math.max(r1, r2)) continue
    const k1 = rng.int(6, 40)
    const k2 = rng.int(6, 40)
    if (gcd(k1, k2) !== 1) continue
    const x = g * k1 + r1
    const y = g * k2 + r2
    const h = gcd(x - r1, y - r2)
    if (h !== g) continue
    // brute force: largest divisor with the stated remainders
    let best = 0
    for (let c = Math.max(r1, r2) + 1; c <= Math.min(x, y); c++) if (x % c === r1 && y % c === r2) best = c
    ensure(best === g, 'HCF-remainder: brute force disagrees')
    if (same) return nq(rng, 'number-system', `What is the largest number that divides ${x} and ${y} leaving a remainder of ${r1} in each case?`, g, [gcd(x, y), g * 2, g + 2, g - 2 > r1 ? g - 2 : g + 3], `Required number = HCF of (${x} − ${r1}) and (${y} − ${r1}) = HCF(${x - r1}, ${y - r1}) = ${g}.`)
    return nq(rng, 'number-system', `What is the largest number that divides ${x} and ${y} leaving remainders ${r1} and ${r2} respectively?`, g, [gcd(x, y), g * 2, g + 3, g - 2 > Math.max(r1, r2) ? g - 2 : g + 5], `Required number = HCF of (${x} − ${r1}) and (${y} − ${r2}) = HCF(${x - r1}, ${y - r2}) = ${g}.`)
  }
  throw new Reject('hcf remainder')
}

function nsLcmRemainder(rng: Rng, d: MockDifficulty): QuestionDraft {
  for (let tries = 0; tries < 300; tries++) {
    const k = d === 'hard' ? 3 : rng.int(2, 3)
    const nums = Array.from({ length: k }, () => rng.pick([4, 5, 6, 8, 9, 10, 12, 15, 16, 18, 20, 24, 30]))
    if (new Set(nums).size < k) continue
    const L = nums.reduce((a, b) => lcm(a, b), 1)
    if (L > 600) continue
    const r = rng.int(1, Math.min(...nums) - 1)
    const form = rng.int(0, 2)
    if (form === 0) {
      let n = 100
      while (!nums.every((x) => n % x === r)) n++
      const first = Math.ceil((100 - r) / L) * L + r
      ensure(n === first, 'LCM remainder: brute force disagrees')
      if (n > 999) continue
      return nq(rng, 'number-system', `What is the smallest 3-digit number which, when divided by ${nums.join(', ').replace(/, ([^,]*)$/, ' and $1')}, leaves a remainder of ${r} in each case?`, n, [n + L, n - L > 99 ? n - L : n + 2 * L, L + r, Math.ceil(100 / L) * L], `LCM of ${nums.join(', ')} = ${L}.
Numbers of the form ${L}k + ${r}: the first one that is at least 100 is ${L} × ${(n - r) / L} + ${r} = ${n}.`)
    }
    if (form === 1) {
      const cnt = rng.pick([2, 3, 4])
      const base = rng.int(1, 6) * L + 0
      const x = base - cnt
      if (x < 100) continue
      // least number to add to x to be divisible by all
      let add = 0
      while (!nums.every((q) => (x + add) % q === 0)) add++
      ensure(add === cnt, 'least-to-add: brute force disagrees')
      return nq(rng, 'number-system', `What is the least number that must be added to ${x} so that the sum is exactly divisible by ${nums.join(', ').replace(/, ([^,]*)$/, ' and $1')}?`, cnt, [L - cnt, cnt + 1, cnt * 2, L], `LCM = ${L}. ${x} ÷ ${L} leaves a remainder of ${x % L}.\nNumber to be added = ${L} − ${x % L} = ${cnt}.`)
    }
    const dgt = rng.pick([3, 4])
    const lo = 10 ** (dgt - 1)
    const hi = 10 ** dgt - 1
    let small = lo
    while (small % L !== 0) small++
    ensure(small === Math.ceil(lo / L) * L, 'smallest multiple mismatch')
    if (small > hi) continue
    return nq(rng, 'number-system', `What is the smallest ${dgt}-digit number that is exactly divisible by ${nums.join(', ').replace(/, ([^,]*)$/, ' and $1')}?`, small, [small + L, small - L, lo, Math.floor(hi / L) * L], `LCM = ${L}. Smallest ${dgt}-digit number = ${lo}; ${lo} ÷ ${L} leaves ${lo % L}.\nRequired number = ${lo} + (${L} − ${lo % L}) = ${small}.`)
  }
  throw new Reject('lcm remainder')
}

function nsBells(rng: Rng): QuestionDraft {
  for (let tries = 0; tries < 200; tries++) {
    const iv = Array.from({ length: 3 }, () => rng.pick([6, 8, 9, 10, 12, 15, 18, 20, 24, 30, 36, 40, 45, 60]))
    if (new Set(iv).size < 3) continue
    const L = iv.reduce((a, b) => lcm(a, b), 1)
    if (L > 180) continue
    const hours = rng.int(2, 6)
    const total = hours * 60
    let times = 0
    for (let t = 0; t <= total; t++) if (iv.every((q) => t % q === 0)) times++
    ensure(times === Math.floor(total / L) + 1, 'bells: simulation and formula disagree')
    if (rng.chance(0.5)) return nq(rng, 'number-system', `Three bells toll at intervals of ${iv[0]}, ${iv[1]} and ${iv[2]} minutes. If they toll together at 9:00 AM, after how many minutes will they next toll together?`, L, [iv[0] + iv[1] + iv[2], Math.max(...iv), L / 2, L * 2], `Next time together = LCM(${iv.join(', ')}) = ${L} minutes.`, { post: ' minutes' })
    if (times < 2) continue
    return nq(rng, 'number-system', `Three bells toll at intervals of ${iv[0]}, ${iv[1]} and ${iv[2]} minutes. They toll together at the start. How many times will they toll together in ${hours} hours, including the one at the start?`, times, [times - 1, times + 1, Math.floor(total / L) + 2, Math.floor(total / L) - 1 > 0 ? Math.floor(total / L) - 1 : times + 3], `LCM = ${L} minutes; ${hours} hours = ${total} minutes.\nTolling together at 0, ${L}, ${2 * L}, … up to ${total}: ${Math.floor(total / L)} + 1 = ${times} times.`)
  }
  throw new Reject('bells')
}

function nsConsecutive(rng: Rng): QuestionDraft {
  const n = rng.pick([3, 4, 5, 6])
  const step = rng.pick([1, 2, 5, 7, 3])
  const first = rng.int(3, 40)
  const kind = step === 1 ? 'consecutive numbers' : step === 2 ? (first % 2 === 0 ? 'consecutive even numbers' : 'consecutive odd numbers') : `consecutive multiples of ${step}`
  const start = step === 1 || step === 2 ? first : step * first
  const seq = Array.from({ length: n }, (_, i) => start + i * step)
  const S = seq.reduce((a, b) => a + b, 0)
  const which = rng.pick(['largest', 'smallest'])
  // second method: solve n*a + step*n(n-1)/2 = S
  const a = (S - (step * n * (n - 1)) / 2) / n
  ensure(a === start, 'consecutive: algebra disagrees')
  const ans = which === 'largest' ? seq[n - 1] : seq[0]
  return nq(rng, 'number-system', `The sum of ${n} ${kind} is ${S}. What is the ${which} of these numbers?`, ans, [which === 'largest' ? seq[0] : seq[n - 1], S / n, ans + step, ans - step], `Let the first number be a: ${n}a + ${(step * n * (n - 1)) / 2} = ${S} ⇒ a = ${start}.\nThe numbers are ${seq.join(', ')}.\n${which[0].toUpperCase() + which.slice(1)} = ${ans}.`)
}

function nsDigits(rng: Rng): QuestionDraft {
  for (let tries = 0; tries < 300; tries++) {
    const a = rng.int(2, 9)
    const b = rng.int(1, a - 1)
    const num = 10 * a + b
    const S = a + b
    const diff = num - (10 * b + a)
    if (diff !== 9 * (a - b)) continue
    const form = rng.int(0, 1)
    // brute force
    const cand: number[] = []
    for (let x = 10; x <= 99; x++) {
      const t = Math.floor(x / 10)
      const u = x % 10
      if (t + u === S && x - (10 * u + t) === diff) cand.push(x)
    }
    ensure(cand.length === 1 && cand[0] === num, 'digits: brute force disagrees')
    if (form === 0) return nq(rng, 'number-system', `The sum of the digits of a two-digit number is ${S}. If the number obtained by reversing its digits is ${diff} less than the original number, what is the original number?`, num, [10 * b + a, S * 9, num + 9, num - 9 > 10 ? num - 9 : num + 18], `Let the digits be x and y: x + y = ${S}; (10x + y) − (10y + x) = 9(x − y) = ${diff} ⇒ x − y = ${a - b}.\nx = ${a}, y = ${b}; number = ${num}.`)
    return nq(rng, 'number-system', `In a two-digit number the sum of the digits is ${S} and the difference of the digits is ${a - b} (tens digit larger). What is the product of the digits?`, a * b, [num, S, a - b, a * b + a], `x + y = ${S}, x − y = ${a - b} ⇒ x = ${a}, y = ${b}.\nProduct = ${a} × ${b} = ${a * b}.`)
  }
  throw new Reject('digits')
}

function nsRemainders(rng: Rng): QuestionDraft {
  for (let tries = 0; tries < 300; tries++) {
    const form = rng.int(0, 2)
    if (form === 0) {
      const small = rng.pick([4, 5, 6, 7, 8, 9, 12])
      const mult = rng.int(2, 9)
      const big = small * mult
      const rem = rng.int(small, big - 1)
      const ans = rem % small
      const k = rng.int(2, 30)
      const number = big * k + rem
      ensure(number % big === rem && number % small === ans, 'remainder: constructed number disagrees')
      return nq(rng, 'number-system', `When a number is divided by ${big}, the remainder is ${rem}. What will be the remainder when the same number is divided by ${small}?`, ans, [rem, rem - small, small - 1, ans + 1], `Number = ${big}q + ${rem}. Since ${small} divides ${big}, the remainder is the remainder of ${rem} ÷ ${small} = ${ans}.`)
    }
    const m = rng.pick([7, 9, 11, 13, 15, 17, 19])
    const r1 = rng.int(2, m - 1)
    const r2 = rng.int(2, m - 1)
    const k1 = rng.int(3, 25)
    const k2 = rng.int(3, 25)
    const x = m * k1 + r1
    const y = m * k2 + r2
    if (form === 1) {
      ensure((x + y) % m === (r1 + r2) % m, 'sum remainder mismatch')
      return nq(rng, 'number-system', `Two numbers when divided by ${m} leave remainders ${r1} and ${r2} respectively. What is the remainder when their sum is divided by ${m}?`, (r1 + r2) % m, [r1 + r2, (r1 * r2) % m, r1 - r2 > 0 ? r1 - r2 : r2 - r1, ((r1 + r2) % m) + 1], `Remainder = (${r1} + ${r2}) mod ${m} = ${(r1 + r2) % m}.`)
    }
    ensure((x * y) % m === (r1 * r2) % m, 'product remainder mismatch')
    return nq(rng, 'number-system', `Two numbers when divided by ${m} leave remainders ${r1} and ${r2} respectively. What is the remainder when their product is divided by ${m}?`, (r1 * r2) % m, [r1 * r2, (r1 + r2) % m, ((r1 * r2) % m) + 1, r1], `Remainder = (${r1} × ${r2}) mod ${m} = ${r1 * r2} mod ${m} = ${(r1 * r2) % m}.`)
  }
  throw new Reject('remainders')
}

function nsCount(rng: Rng, d: MockDifficulty): QuestionDraft {
  for (let tries = 0; tries < 200; tries++) {
    const lo = rng.int(1, 20) * 10
    const hi = lo + rng.int(10, 80) * 10
    const a = rng.pick([6, 7, 8, 9, 11, 12, 13])
    const b = rng.pick([4, 5, 6, 9, 10, 12].filter((x) => x !== a))
    const form = d === 'hard' ? rng.int(0, 2) : rng.int(0, 1)
    const f = (n: number): number => (form === 0 ? (n % a === 0 ? 1 : 0) : form === 1 ? (n % a === 0 && n % b === 0 ? 1 : 0) : n % a === 0 && n % b !== 0 ? 1 : 0)
    let cnt = 0
    for (let n = lo + 1; n < hi; n++) cnt += f(n)
    const C = (k: number): number => Math.floor((hi - 1) / k) - Math.floor(lo / k)
    const formula = form === 0 ? C(a) : form === 1 ? C(lcm(a, b)) : C(a) - C(lcm(a, b))
    ensure(cnt === formula, 'count divisible: loop and formula disagree')
    need(cnt >= 3, 'too few')
    const desc = form === 0 ? `divisible by ${a}` : form === 1 ? `divisible by both ${a} and ${b}` : `divisible by ${a} but not by ${b}`
    return nq(rng, 'number-system', `How many numbers between ${lo} and ${hi} are ${desc}?`, cnt, [cnt + 1, cnt - 1, Math.floor((hi - lo) / a), Math.floor((hi - lo) / a) + 2], `Numbers between ${lo} and ${hi} ${desc}: ${form === 2 ? `${C(a)} − ${C(lcm(a, b))}` : `⌊${hi - 1}/${form === 0 ? a : lcm(a, b)}⌋ − ⌊${lo}/${form === 0 ? a : lcm(a, b)}⌋`} = ${cnt}.`)
  }
  throw new Reject('count divisible')
}

function nsHcfLcm(rng: Rng): QuestionDraft {
  for (let tries = 0; tries < 200; tries++) {
    const h = rng.int(2, 15)
    const p = rng.int(2, 12)
    const q = rng.int(2, 12)
    if (gcd(p, q) !== 1 || p === q) continue
    const x = h * p
    const y = h * q
    const L = h * p * q
    ensure(gcd(x, y) === h && lcm(x, y) === L && x * y === h * L, 'hcf-lcm identities')
    const form = rng.int(0, 2)
    if (form === 0) return nq(rng, 'number-system', `The HCF and LCM of two numbers are ${h} and ${L} respectively. If one of the numbers is ${x}, what is the other number?`, y, [L / h, h * L / (x + 1), x + y, L - x], `Product of two numbers = HCF × LCM = ${h} × ${L} = ${h * L}.\nOther number = ${h * L}/${x} = ${y}.`)
    if (form === 1) return nq(rng, 'number-system', `The product of two numbers is ${x * y} and their HCF is ${h}. What is their LCM?`, L, [x * y * h, x + y, L / h, x * y / (h + 1)], `LCM = Product/HCF = ${x * y}/${h} = ${L}.`)
    return nq(rng, 'number-system', `The LCM of two numbers is ${L} and their HCF is ${h}. If the numbers are in the ratio ${p} : ${q}, what is the larger number?`, h * Math.max(p, q), [h * Math.min(p, q), L, h * (p + q), h * Math.max(p, q) + h], `Let the numbers be ${p}k and ${q}k; HCF = k = ${h}.\nCheck: LCM = ${h} × ${p} × ${q} = ${L}.\nLarger number = ${Math.max(p, q)} × ${h} = ${h * Math.max(p, q)}.`)
  }
  throw new Reject('hcf lcm')
}

function nsPerfectSquare(rng: Rng): QuestionDraft {
  for (let tries = 0; tries < 200; tries++) {
    const n = rng.int(800, 9000)
    const root = Math.floor(Math.sqrt(n))
    if (root * root === n) continue
    const add = (root + 1) ** 2 - n
    const sub = n - root * root
    // brute-force
    let a2 = 0
    while (Math.sqrt(n + a2) % 1 !== 0) a2++
    let s2 = 0
    while (Math.sqrt(n - s2) % 1 !== 0) s2++
    ensure(a2 === add && s2 === sub, 'perfect square: brute force disagrees')
    if (add === sub) continue
    if (rng.chance(0.5)) return nq(rng, 'number-system', `What is the least number that must be added to ${n} to make it a perfect square?`, add, [sub, add + 1, Math.abs(add - sub), add * 2], `√${n} lies between ${root} and ${root + 1}.\n${root + 1}² = ${(root + 1) ** 2}.\nNumber to be added = ${(root + 1) ** 2} − ${n} = ${add}.`)
    return nq(rng, 'number-system', `What is the least number that must be subtracted from ${n} to make it a perfect square?`, sub, [add, sub + 1, Math.abs(add - sub), sub * 2], `${root}² = ${root * root} is the largest perfect square not exceeding ${n}.\nNumber to be subtracted = ${n} − ${root * root} = ${sub}.`)
  }
  throw new Reject('perfect square')
}

function nsFactors(rng: Rng): QuestionDraft {
  for (let tries = 0; tries < 200; tries++) {
    const ps = [2, 3, 5, 7]
    const exps = ps.map((_, i) => (i < 3 ? rng.int(0, 4) : rng.int(0, 1)))
    const n = ps.reduce((acc, p, i) => acc * p ** exps[i], 1)
    if (n < 24 || n > 3000 || exps.filter((e) => e > 0).length < 2) continue
    const formula = exps.reduce((acc, e) => acc * (e + 1), 1)
    let cnt = 0
    let odd = 0
    for (let i = 1; i <= n; i++) if (n % i === 0) {
      cnt++
      if (i % 2 === 1) odd++
    }
    ensure(cnt === formula, 'factor count: loop and formula disagree')
    const oddFormula = exps.slice(1).reduce((acc, e) => acc * (e + 1), 1)
    ensure(odd === oddFormula, 'odd factor count mismatch')
    const form = rng.int(0, 1)
    const fx = ps.map((p, i) => (exps[i] ? `${p}${exps[i] > 1 ? `^${exps[i]}` : ''}` : '')).filter(Boolean).join(' × ')
    if (form === 0 || odd === cnt) return nq(rng, 'number-system', `How many factors (divisors) does ${n} have?`, cnt, [cnt + 2, cnt - 2, cnt * 2, exps.reduce((a, b) => a + b, 0)], `${n} = ${fx}.\nNumber of factors = ${exps.filter((e) => e > 0).map((e) => `(${e} + 1)`).join(' × ')} = ${cnt}.`)
    return nq(rng, 'number-system', `How many odd factors does ${n} have?`, odd, [cnt, odd + 1, cnt - odd, odd * 2], `${n} = ${fx}.\nOdd factors come only from the odd prime powers: ${exps.slice(1).filter((e) => e > 0).map((e) => `(${e} + 1)`).join(' × ') || '1'} = ${odd}.`)
  }
  throw new Reject('factors')
}

function modpow(b: bigint, e: bigint, m: bigint): bigint {
  let r = 1n
  let x = b % m
  let k = e
  while (k > 0n) {
    if (k & 1n) r = (r * x) % m
    x = (x * x) % m
    k >>= 1n
  }
  return r
}
function nsUnitDigit(rng: Rng): QuestionDraft {
  const b = rng.int(2, 19)
  const e = rng.int(20, 250)
  const form = rng.int(0, 1)
  if (form === 0) {
    const ud = Number(modpow(BigInt(b), BigInt(e), 10n))
    // cyclicity method
    const cyc: number[] = []
    let cur = b % 10
    for (let i = 0; i < 4; i++) {
      cyc.push(cur)
      cur = (cur * b) % 10
    }
    const ud2 = cyc[(e - 1) % 4]
    ensure(ud === ud2, 'unit digit: modpow and cyclicity disagree')
    return nq(rng, 'number-system', `What is the unit digit of ${b}^${e}?`, ud, [(ud + 1) % 10, (ud + 2) % 10, (ud + 5) % 10, b % 10].filter((x) => x !== ud), `Unit digits of ${b}^n repeat every 4 powers: ${cyc.join(', ')}.\n${e} ÷ 4 leaves remainder ${e % 4}, so the unit digit is ${ud}.`, { sort: 'asc' })
  }
  const m = rng.pick([5, 7, 9, 11, 13])
  const base = rng.int(2, 6)
  const rem = Number(modpow(BigInt(base), BigInt(e), BigInt(m)))
  // method 2: repeated multiplication with cycle detection
  let r = 1
  const seen: number[] = []
  for (let i = 0; i < e; i++) {
    r = (r * base) % m
    seen.push(r)
  }
  ensure(r === rem, 'power remainder: modpow and iteration disagree')
  need(rem > 0, 'zero remainder')
  return nq(rng, 'number-system', `What is the remainder when ${base}^${e} is divided by ${m}?`, rem, [(rem + 1) % m, (rem + 2) % m, m - rem, base % m].filter((x) => x !== rem), `Powers of ${base} modulo ${m} repeat with a cycle; ${base}^${e} ≡ ${rem} (mod ${m}).`, { sort: 'asc' })
}

function nsTrailingZeros(rng: Rng): QuestionDraft {
  const n = rng.int(30, 100)
  let f = 1n
  for (let i = 2; i <= n; i++) f *= BigInt(i)
  const s = f.toString()
  const zeros = s.length - s.replace(/0+$/, '').length
  let formula = 0
  for (let p = 5; p <= n; p *= 5) formula += Math.floor(n / p)
  ensure(zeros === formula, 'trailing zeros: big-integer factorial and formula disagree')
  return nq(rng, 'number-system', `How many zeros are there at the end of ${n}! (factorial of ${n})?`, zeros, [Math.floor(n / 5), Math.floor(n / 10), zeros + 1, zeros - 1 > 0 ? zeros - 1 : zeros + 3], `Number of 5s in ${n}! = ${[...Array(3).keys()].map((i) => 5 ** (i + 1)).filter((p) => p <= n).map((p) => `⌊${n}/${p}⌋`).join(' + ')} = ${zeros}.\nEach 5 pairs with a 2, so there are ${zeros} trailing zeros.`)
}

function nsSumDiffSquares(rng: Rng): QuestionDraft {
  for (let tries = 0; tries < 200; tries++) {
    const x = rng.int(15, 80)
    const y = rng.int(5, x - 3)
    const S = x + y
    const D = x * x - y * y
    ensure(D / S === x - y, 'sum-difference squares mismatch')
    if (rng.chance(0.5)) return nq(rng, 'number-system', `The sum of two numbers is ${S} and the difference of their squares is ${D}. What is the larger number?`, x, [y, D / S, S / 2, x + 2], `x² − y² = (x + y)(x − y) ⇒ ${D} = ${S} × (x − y) ⇒ x − y = ${x - y}.\nx = (${S} + ${x - y})/2 = ${x}.`)
    return nq(rng, 'number-system', `The sum of two numbers is ${S} and their difference is ${x - y}. What is the difference of their squares?`, D, [S * S - (x - y) ** 2, S + x - y, x * y, D + S], `x² − y² = (x + y)(x − y) = ${S} × ${x - y} = ${D}.`)
  }
  throw new Reject('sum diff squares')
}

export const NUMBER_TPLS: Tpl[] = [
  { name: 'ns-hcfremainder', gen: nsHcfRemainder },
  { name: 'ns-lcmremainder', gen: nsLcmRemainder },
  { name: 'ns-bells', gen: (r) => nsBells(r) },
  { name: 'ns-consecutive', gen: (r) => nsConsecutive(r) },
  { name: 'ns-digits', gen: (r) => nsDigits(r) },
  { name: 'ns-remainders', gen: (r) => nsRemainders(r) },
  { name: 'ns-count', gen: nsCount },
  { name: 'ns-hcflcm', gen: (r) => nsHcfLcm(r) },
  { name: 'ns-perfectsquare', d: 'medium', gen: (r) => nsPerfectSquare(r) },
  { name: 'ns-factors', d: 'hard', gen: (r) => nsFactors(r) },
  { name: 'ns-unitdigit', d: 'hard', gen: (r) => nsUnitDigit(r) },
  { name: 'ns-trailingzeros', d: 'hard', gen: (r) => nsTrailingZeros(r) },
  { name: 'ns-sumdiffsq', d: 'hard', gen: (r) => nsSumDiffSquares(r) },
]

export function genMensuration(rng: Rng, d: MockDifficulty, count: number): Group[] {
  return genSingles(rng, d, count, MENSURATION_TPLS)
}
export function genProbability(rng: Rng, d: MockDifficulty, count: number): Group[] {
  return genSingles(rng, d, count, PROB_TPLS)
}
export function genNumberSystem(rng: Rng, d: MockDifficulty, count: number): Group[] {
  return genSingles(rng, d, count, NUMBER_TPLS)
}

