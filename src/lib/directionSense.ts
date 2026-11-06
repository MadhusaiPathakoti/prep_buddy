import { shuffle, type MCQQuestion } from './generators'

/**
 * Direction Sense (SBI PO Prelims + Mains style).
 *
 * Every answer is computed by walking the path on a grid (x = east, y = north), so it is exact. Diagonal
 * directions follow the exam convention: any point that is both north and east of another is "North-East"
 * of it. Walking only ever happens along the four main directions (a 45° heading is only used for
 * "which way is he facing" questions), so distances stay whole numbers or k√2.
 */

export type DirectionDifficulty = 'easy' | 'medium' | 'hard' | 'mixed'
export type DirectionType = 'mixed' | 'walk' | 'relative'

const DIRS = ['North', 'North-East', 'East', 'South-East', 'South', 'South-West', 'West', 'North-West'] as const
type Dir = (typeof DIRS)[number]
const dirName = (deg: number): Dir => DIRS[(((deg % 360) + 360) % 360) / 45]
const lower = (d: string) => d.toLowerCase()

const rnd = (n: number) => Math.floor(Math.random() * n)
const chance = (p: number) => Math.random() < p
const pick = <T,>(a: readonly T[]): T => a[rnd(a.length)]

type Level = 'easy' | 'medium' | 'hard'

// ---------- path engine ----------

type Op = { t: 'walk'; d: number } | { t: 'turn'; deg: number } // deg: + clockwise (right), − anticlockwise (left)

interface Sim {
  x: number
  y: number
  heading: number
  trace: string[]
}

const pos = (x: number, y: number) => `${x >= 0 ? 'E' : 'W'} ${Math.abs(x)}, ${y >= 0 ? 'N' : 'S'} ${Math.abs(y)}`

function moveVec(heading: number): [number, number] {
  const h = ((heading % 360) + 360) % 360
  if (h === 0) return [0, 1]
  if (h === 90) return [1, 0]
  if (h === 180) return [0, -1]
  return [-1, 0] // 270 — callers never walk on a diagonal
}

function simulate(start: number, ops: Op[], unit: string): Sim {
  let x = 0
  let y = 0
  let heading = start
  const trace: string[] = []
  let leg = 0
  for (const op of ops) {
    if (op.t === 'turn') {
      heading = (((heading + op.deg) % 360) + 360) % 360
      continue
    }
    const [vx, vy] = moveVec(heading)
    x += vx * op.d
    y += vy * op.d
    leg++
    trace.push(`Leg ${leg}: facing ${lower(dirName(heading))}, walks ${op.d} ${unit} → (${pos(x, y)})`)
  }
  return { x, y, heading, trace }
}

const turnText = (deg: number) => {
  if (Math.abs(deg) === 180) return 'takes a U-turn'
  if (deg === 90) return 'turns right'
  if (deg === -90) return 'turns left'
  return `turns ${Math.abs(deg)}° to ${deg > 0 ? 'the right' : 'the left'}`
}

/** A random walk. Walks only happen on a main direction; hard paths also turn by 45° / 135°. */
function randomOps(level: Level, legs: number, startHeading: number, endDiagonalOk: boolean): Op[] | null {
  const ops: Op[] = []
  let heading = startHeading
  const turnChoices: Record<Level, number[]> = {
    easy: [90, -90],
    medium: [90, -90, 90, -90, 180],
    hard: [90, -90, 180, 45, -45, 135, -135, 90, -90],
  }
  for (let leg = 0; leg < legs; leg++) {
    ops.push({ t: 'walk', d: 2 + rnd(level === 'easy' ? 9 : 14) })
    if (leg === legs - 1 && !endDiagonalOk) break
    // turn(s) before the next walk, always landing on a main direction unless this is a final turn
    let h = heading
    const turns: number[] = []
    const last = leg === legs - 1
    const first = pick(turnChoices[level])
    turns.push(first)
    h += first
    if (h % 90 !== 0 && !(last && endDiagonalOk && chance(0.6))) {
      // diagonal: turn again by 45° or 135° to get back on a main direction
      const options = [45, -45, 135, -135].filter((t) => (h + t) % 90 === 0)
      const second = pick(options)
      turns.push(second)
      h += second
    }
    for (const t of turns) ops.push({ t: 'turn', deg: t })
    heading = ((h % 360) + 360) % 360
  }
  return ops
}

function opsText(name: string, pro: string, startHeading: number, ops: Op[], unit: string, place: string): string {
  const parts: string[] = []
  let i = 0
  let first = true
  while (i < ops.length) {
    const turns: number[] = []
    while (i < ops.length && ops[i].t === 'turn') turns.push((ops[i++] as { deg: number }).deg)
    const walk = i < ops.length && ops[i].t === 'walk' ? (ops[i++] as { d: number }).d : null
    if (first) {
      first = false
      if (walk === null) break
      parts.push(`${name} starts from ${place} and walks ${walk} ${unit} towards the ${lower(dirName(startHeading))}.`)
      continue
    }
    const tt = turns.map(turnText).join(' and then ')
    if (walk !== null) parts.push(`${turns.length ? `${pick(['Then', 'After that', 'Next'])} ${pro} ${tt} and walks` : `${pro[0].toUpperCase()}${pro.slice(1)} then walks`} ${walk} ${unit}.`)
    else parts.push(`Finally, ${pro} ${tt}.`)
  }
  return parts.join(' ')
}

// ---------- answer formatting ----------

interface Dist {
  text: string // "13 m" / "5√2 m"
  value: number // numeric, for de-duplication
}

function distanceOf(x: number, y: number, unit: string, allowRoot2: boolean): Dist | null {
  const ax = Math.abs(x)
  const ay = Math.abs(y)
  if (ax === 0 || ay === 0) {
    const d = ax + ay
    return d === 0 ? null : { text: `${d} ${unit}`, value: d }
  }
  const h = Math.round(Math.sqrt(ax * ax + ay * ay))
  if (h * h === ax * ax + ay * ay) return { text: `${h} ${unit}`, value: h }
  if (allowRoot2 && ax === ay && ax >= 2) return { text: `${ax}√2 ${unit}`, value: ax * Math.SQRT2 }
  return null
}

/** Quadrant convention: both north and east of a point => North-East of it. */
function directionOf(x: number, y: number): Dir | null {
  if (x === 0 && y === 0) return null
  const ns = y > 0 ? 'North' : y < 0 ? 'South' : ''
  const ew = x > 0 ? 'East' : x < 0 ? 'West' : ''
  return (ns && ew ? `${ns}-${ew}` : ns || ew) as Dir
}

function directionOptions(correct: Dir): string[] {
  const i = DIRS.indexOf(correct)
  const pool = new Set<Dir>([DIRS[(i + 4) % 8], DIRS[(i + 1) % 8], DIRS[(i + 7) % 8], DIRS[(i + 2) % 8], DIRS[(i + 6) % 8], DIRS[(i + 3) % 8], DIRS[(i + 5) % 8]])
  const wrong = shuffle([...pool])
  // the opposite direction is the classic mistake, so keep it most of the time
  const opposite = DIRS[(i + 4) % 8]
  const picks = chance(0.8) ? [opposite, ...wrong.filter((d) => d !== opposite).slice(0, 3)] : wrong.slice(0, 4)
  return shuffle([correct, ...picks])
}

function distanceOptions(correct: Dist, x: number, y: number, totalWalked: number, unit: string): string[] {
  const ax = Math.abs(x)
  const ay = Math.abs(y)
  const traps = [ax + ay, Math.max(ax, ay), totalWalked, Math.abs(ax - ay), Math.min(ax, ay), correct.value + 2, correct.value - 2, correct.value + 4, correct.value * 2]
  const texts = new Set<string>([correct.text])
  const out = [correct.text]
  const fmt = (v: number) => `${Math.round(v)} ${unit}`
  for (const t of shuffle(traps)) {
    if (out.length === 5) break
    if (t <= 0 || !Number.isFinite(t) || !Number.isInteger(t)) continue
    const s = fmt(t)
    if (texts.has(s) || Math.abs(t - correct.value) < 0.01) continue
    texts.add(s)
    out.push(s)
  }
  for (let k = 1; out.length < 5; k++) {
    const s = fmt(correct.value + 5 + k)
    if (!texts.has(s)) {
      texts.add(s)
      out.push(s)
    }
  }
  return shuffle(out)
}

const NAMES_M = ['Ravi', 'Arjun', 'Kabir', 'Sameer', 'Vivek', 'Rohit', 'Tarun']
const NAMES_F = ['Meena', 'Anjali', 'Divya', 'Kavya', 'Nisha', 'Pooja', 'Rhea']
const PLACES = ['his house', 'a crossing', 'the school gate', 'the market', 'a temple', 'the bus stand']

const mkId = (p: string) => `ds-${p}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`

const LEGS: Record<Level, [number, number]> = { easy: [2, 3], medium: [3, 4], hard: [5, 6] }

// ---------- single-person walks ----------

type WalkAsk = 'facing' | 'direction' | 'distance' | 'both'

const pickAsk = (level: Level): WalkAsk => pick(level === 'easy' ? (['facing', 'direction', 'distance', 'distance'] as WalkAsk[]) : (['facing', 'direction', 'distance', 'both', 'both'] as WalkAsk[]))

function buildWalk(level: Level, ask: WalkAsk): MCQQuestion | null {
  const [lo, hi] = LEGS[level]
  const legs = lo + rnd(hi - lo + 1)
  const startHeading = 90 * rnd(4)
  const ops = randomOps(level, legs, startHeading, ask === 'facing')
  if (!ops) return null
  const unit = chance(0.75) ? 'm' : 'km'
  const sim = simulate(startHeading, ops, unit)
  const female = chance(0.5)
  const name = pick(female ? NAMES_F : NAMES_M)
  const pro = female ? 'she' : 'he'
  const story = opsText(name, pro, startHeading, ops, unit, pick(PLACES))
  const totalWalked = ops.reduce((s, o) => s + (o.t === 'walk' ? o.d : 0), 0)
  const net = `Net: ${Math.abs(sim.x)} ${unit} ${sim.x >= 0 ? 'east' : 'west'}, ${Math.abs(sim.y)} ${unit} ${sim.y >= 0 ? 'north' : 'south'}`
  let term = ''
  let answer = ''
  let options: string[] = []
  let why = ''
  if (ask === 'facing') {
    if (!ops.some((o) => o.t === 'turn' && Math.abs(o.deg) % 90 === 45) && level === 'hard') return null
    answer = dirName(sim.heading)
    options = directionOptions(answer as Dir)
    term = `Which direction is ${name} facing now?`
    why = `${sim.trace.join('\n')}\nHeading: started facing ${lower(dirName(startHeading))}; the turns add up to ${((sim.heading - startHeading + 360) % 360)}° clockwise → facing ${lower(answer)}.`
  } else {
    const dist = distanceOf(sim.x, sim.y, unit, level === 'hard')
    const dir = directionOf(sim.x, sim.y)
    if (!dist || !dir) return null
    if (level !== 'easy' && (sim.x === 0 || sim.y === 0) && ask !== 'direction' && chance(0.8)) return null // want a diagonal result
    const calc = sim.x === 0 || sim.y === 0 ? `distance = ${dist.text}` : `distance = √(${Math.abs(sim.x)}² + ${Math.abs(sim.y)}²) = ${dist.text}`
    if (ask === 'direction') {
      answer = dir
      options = directionOptions(dir)
      term = `In which direction is ${name} from the starting point?`
      why = `${sim.trace.join('\n')}\n${net} → ${name} is to the ${lower(dir)} of the start.`
    } else if (ask === 'distance') {
      answer = dist.text
      options = distanceOptions(dist, sim.x, sim.y, totalWalked, unit)
      term = `How far is ${name} from the starting point?`
      why = `${sim.trace.join('\n')}\n${net} → ${calc}.`
    } else {
      answer = `${dist.text}, ${dir}`
      const dOpts = distanceOptions(dist, sim.x, sim.y, totalWalked, unit)
      const rOpts = directionOptions(dir)
      const set = new Set<string>([answer])
      set.add(`${dist.text}, ${rOpts.find((d) => d !== dir)!}`)
      for (const d of dOpts) {
        if (set.size >= 5) break
        set.add(`${d}, ${chance(0.6) ? dir : rOpts.find((x) => x !== dir && !set.has(`${d}, ${x}`))!}`)
      }
      for (const d of rOpts) {
        if (set.size >= 5) break
        set.add(`${dist.text}, ${d}`)
      }
      options = shuffle([...set].slice(0, 5))
      if (!options.includes(answer)) options[0] = answer
      term = `How far and in which direction is ${name} from the starting point?`
      why = `${sim.trace.join('\n')}\n${net} → ${calc}; ${name} is to the ${lower(dir)} of the start.`
    }
  }
  if (new Set(options).size !== 5) return null
  return {
    id: mkId('w'),
    instruction: `Direction sense · ${level}`,
    context: story,
    term,
    correctMeaning: answer,
    options,
    hint: 'Sketch the walk on a grid: north is up, east is right. Update which way you are facing after every turn.',
    explanation: why,
  }
}

// ---------- two people / points ----------

interface Pt {
  x: number
  y: number
}

function buildTwoPeople(level: Level): MCQQuestion | null {
  const legsOf = () => (level === 'medium' ? 2 + rnd(2) : 3 + rnd(2))
  const unit = chance(0.75) ? 'm' : 'km'
  const female = chance(0.5)
  const [a, b] = shuffle(female ? NAMES_F : NAMES_M).slice(0, 2)
  const place = pick(PLACES)
  const mk = (): { ops: Op[]; start: number; sim: Sim } | null => {
    const start = 90 * rnd(4)
    const ops = randomOps(level === 'hard' ? 'medium' : 'easy', legsOf(), start, false)
    if (!ops) return null
    return { ops, start, sim: simulate(start, ops, unit) }
  }
  const A = mk()
  const B = mk()
  if (!A || !B) return null
  const dx = A.sim.x - B.sim.x
  const dy = A.sim.y - B.sim.y
  const dist = distanceOf(dx, dy, unit, level === 'hard')
  const dir = directionOf(dx, dy)
  if (!dist || !dir) return null
  const story = `${a} and ${b} start from ${place} at the same time. ${opsText(a, a, A.start, A.ops, unit, place).replace(/^.*? starts from [^.]*? and walks/, `${a} walks`)} ${opsText(b, b, B.start, B.ops, unit, place).replace(/^.*? starts from [^.]*? and walks/, `${b} walks`)}`
  const askDist = chance(0.5)
  const lines = [`${a}: ${A.sim.trace.join(' | ')}`, `${b}: ${B.sim.trace.join(' | ')}`, `${a} ends at (${pos(A.sim.x, A.sim.y)}), ${b} at (${pos(B.sim.x, B.sim.y)}); difference = ${Math.abs(dx)} ${unit} ${dx >= 0 ? 'east' : 'west'}, ${Math.abs(dy)} ${unit} ${dy >= 0 ? 'north' : 'south'}.`]
  const total = (o: Op[]) => o.reduce((s, x) => s + (x.t === 'walk' ? x.d : 0), 0)
  if (askDist) {
    const options = distanceOptions(dist, dx, dy, total(A.ops) + total(B.ops), unit)
    return {
      id: mkId('r'),
      instruction: `Direction sense · two people · ${level}`,
      context: story,
      term: `How far is ${a} from ${b} now?`,
      correctMeaning: dist.text,
      options,
      hint: 'Find each person’s final position from the common start, then compare the two positions.',
      explanation: `${lines.join('\n')}\n→ distance = ${dx === 0 || dy === 0 ? dist.text : `√(${Math.abs(dx)}² + ${Math.abs(dy)}²) = ${dist.text}`}.`,
    }
  }
  return {
    id: mkId('r'),
    instruction: `Direction sense · two people · ${level}`,
    context: story,
    term: `In which direction is ${a} with respect to ${b}?`,
    correctMeaning: dir,
    options: directionOptions(dir),
    hint: 'Find each person’s final position from the common start, then compare the two positions.',
    explanation: `${lines.join('\n')}\n→ ${a} is to the ${lower(dir)} of ${b}.`,
  }
}

function buildPoints(level: Level): MCQQuestion | null {
  const count = level === 'medium' ? 4 : 5 + rnd(2)
  const letters = shuffle(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'J', 'K', 'L', 'M', 'N', 'P', 'Q', 'R']).slice(0, count)
  const pts: Pt[] = [{ x: 0, y: 0 }]
  const lines: string[] = []
  const unit = chance(0.75) ? 'm' : 'km'
  const vec: Record<string, [number, number]> = { north: [0, 1], south: [0, -1], east: [1, 0], west: [-1, 0] }
  const opp: Record<string, string> = { north: 'south', south: 'north', east: 'west', west: 'east' }
  const direct = new Set<string>()
  for (let i = 1; i < count; i++) {
    const j = rnd(i)
    const dir = pick(Object.keys(vec))
    const d = 2 + rnd(level === 'hard' ? 14 : 9)
    pts.push({ x: pts[j].x + vec[dir][0] * d, y: pts[j].y + vec[dir][1] * d })
    direct.add(`${i}-${j}`)
    direct.add(`${j}-${i}`)
    lines.push(chance(0.5) ? `${letters[i]} is ${d} ${unit} to the ${dir} of ${letters[j]}.` : `${letters[j]} is ${d} ${unit} to the ${opp[dir]} of ${letters[i]}.`)
  }
  // no two points may coincide
  for (let i = 0; i < count; i++) for (let j = i + 1; j < count; j++) if (pts[i].x === pts[j].x && pts[i].y === pts[j].y) return null
  const p = rnd(count)
  const q = rnd(count)
  if (p === q || direct.has(`${p}-${q}`)) return null
  const dx = pts[p].x - pts[q].x
  const dy = pts[p].y - pts[q].y
  const askDist = chance(0.45)
  const story = shuffle(lines).join(' ')
  const grid = `Positions (taking ${letters[0]} as the origin): ${letters.map((l, i) => `${l} (${pos(pts[i].x, pts[i].y)})`).join(', ')}.`
  if (askDist) {
    const dist = distanceOf(dx, dy, unit, level === 'hard')
    if (!dist) return null
    return {
      id: mkId('pt'),
      instruction: `Direction sense · points · ${level}`,
      context: story,
      term: `What is the distance between ${letters[p]} and ${letters[q]}?`,
      correctMeaning: dist.text,
      options: distanceOptions(dist, dx, dy, Math.abs(dx) + Math.abs(dy) + 2, unit),
      hint: 'Place the points on a grid one by one, starting from the point that appears in most statements.',
      explanation: `${grid}\n${letters[p]} is ${Math.abs(dx)} ${unit} ${dx >= 0 ? 'east' : 'west'} and ${Math.abs(dy)} ${unit} ${dy >= 0 ? 'north' : 'south'} of ${letters[q]} → distance = ${dx === 0 || dy === 0 ? dist.text : `√(${Math.abs(dx)}² + ${Math.abs(dy)}²) = ${dist.text}`}.`,
    }
  }
  const dir = directionOf(dx, dy)
  if (!dir) return null
  return {
    id: mkId('pt'),
    instruction: `Direction sense · points · ${level}`,
    context: story,
    term: `In which direction is ${letters[p]} with respect to ${letters[q]}?`,
    correctMeaning: dir,
    options: directionOptions(dir),
    hint: 'Place the points on a grid one by one, starting from the point that appears in most statements.',
    explanation: `${grid}\n${letters[p]} is ${Math.abs(dx)} ${unit} ${dx >= 0 ? 'east' : 'west'} and ${Math.abs(dy)} ${unit} ${dy >= 0 ? 'north' : 'south'} of ${letters[q]} → ${letters[p]} is to the ${lower(dir)} of ${letters[q]}.`,
  }
}

// ---------- entry point ----------

export function generateDirectionSenseQuestions(difficulty: DirectionDifficulty, type: DirectionType, count: number): MCQQuestion[] {
  const out: MCQQuestion[] = []
  let guard = 0
  while (out.length < count && guard < count * 4) {
    guard++
    const level: Level = difficulty === 'mixed' ? (['easy', 'medium', 'hard'] as Level[])[out.length % 3] : difficulty
    const kind = type === 'mixed' ? (level === 'easy' ? 'walk' : pick(['walk', 'walk', 'relative'])) : type
    const walking = kind === 'walk' || level === 'easy'
    // keep one kind of question until it is produced, so the hard-to-build ones (clean distances) are not crowded out by "which way is he facing"
    const ask = pickAsk(level)
    const useTwo = chance(0.5)
    for (let attempt = 0; attempt < 400; attempt++) {
      const q = walking ? buildWalk(level, ask) : useTwo ? buildTwoPeople(level) : buildPoints(level)
      if (q) {
        out.push(q)
        break
      }
    }
  }
  return out
}
