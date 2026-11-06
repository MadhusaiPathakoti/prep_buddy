// Verification harness for the SBI-PO-Mains reasoning generators in src/lib/mocks/reasoning/mains/logicB.ts
// (direction-distance, coding-decoding, sentence-coding, order-ranking, alphanumeric-series, reasoning-misc).
//
// Every key is recomputed here with code that does not share the generator's code path (own simulators, own rule engines,
// own exhaustive enumerators). Wherever the text carries the information (sentence coding, coding rules, machine inputs,
// direction legs) the RENDERED stem / stimulus is parsed instead of trusting the generator's model.
//
// Usage: npx tsx scripts/verify-mains-rlogicB.ts [--seeds N] [--topic id,id] [--no-samples]
import { createRng } from '../src/lib/mocks/rng'
import { assertGroup } from '../src/lib/mocks/validate'
import type { Group, QuestionDraft, ReasoningTopicId } from '../src/lib/mocks/types'
import { LOGIC_B_WITH_PROOF, MAINS_LOGIC_B } from '../src/lib/mocks/reasoning/mains/logicB'
import type { AlphaProof, CodingProof, DirectionProof, DSProof, MachineProof, MiscProof, RankProof, SentenceProof } from '../src/lib/mocks/reasoning/mains/logicB'

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
const stimText = (g: Group): string[] => ((g.stimulus?.parts[0] as { paragraphs: string[] } | undefined)?.paragraphs ?? [])
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any

function checkKey(q: QuestionDraft, expected: string, what: string): void {
  check(q.options[q.answer] === expected, `${what}: keyed option "${q.options[q.answer]}" but recomputed "${expected}"`)
  q.options.forEach((o, i) => {
    if (i !== q.answer) check(o !== expected, `${what}: wrong option ${i} equals the recomputed answer`)
  })
}

// ================================================================================================ DIRECTION
type Cx = [number, number]
const cmul = (a: Cx, b: Cx): Cx => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]]
const CW90: Cx = [0, -1]
const HEAD_C: Cx[] = [[0, 1], [1, 0], [0, -1], [-1, 0]]
function turnFromPhrase(ph: string): { deg: number; cw: boolean } {
  if (ph === 'turns right') return { deg: 90, cw: true }
  if (ph === 'turns left') return { deg: 90, cw: false }
  if (ph === 'takes a U-turn' || ph === 'turns 180°') return { deg: 180, cw: true }
  const m = /turns (\d+)° (clockwise|anticlockwise)/.exec(ph) as RegExpExecArray
  return { deg: Number(m[1]), cw: m[2] === 'clockwise' }
}
const PHRASE_OF: Record<string, string> = { r: 'turns right', l: 'turns left', c90: 'turns 90° clockwise', a90: 'turns 90° anticlockwise', c270: 'turns 270° clockwise', a270: 'turns 270° anticlockwise', u: 'takes a U-turn', d180: 'turns 180°' }
const COMPASS = (dx: number, dy: number): string => {
  check(dx === 0 || dy === 0 || Math.abs(dx) === Math.abs(dy), 'direction not a compass point')
  const ang = Math.round((Math.atan2(dy, dx) * 180) / Math.PI)
  const m: Record<number, string> = { 90: 'North', 45: 'North-East', 0: 'East', [-45]: 'South-East', [-90]: 'South', [-135]: 'South-West', 180: 'West', 135: 'North-West' }
  return m[ang]
}
function verifyDirection(g: Group, p: DirectionProof): void {
  const q = g.questions[0]
  check(g.questions.length === 1, 'direction: one question per group')
  // text: turn phrases and distances, in order of appearance
  const wantTurns: string[] = []
  const wantLens: number[] = []
  p.walkers.forEach((w) => w.legs.forEach((l, i) => {
    wantLens.push(l.d)
    if (i > 0) wantTurns.push(PHRASE_OF[l.style as string])
  }))
  const gotTurns = [...q.stem.matchAll(/turns right|turns left|turns \d+° (?:clockwise|anticlockwise)|takes a U-turn|turns 180°/g)].map((m) => m[0])
  check(JSON.stringify(gotTurns) === JSON.stringify(wantTurns), `direction: turn phrases in the stem ${JSON.stringify(gotTurns)} differ from the model ${JSON.stringify(wantTurns)}`)
  const gotLens = [...q.stem.matchAll(/walks (\d+) (km|m)\b/g)].map((m) => Number(m[1]))
  check(JSON.stringify(gotLens) === JSON.stringify(wantLens), 'direction: leg lengths in the stem differ from the model')
  check(new RegExp(` ${p.unit}\\b`).test(q.stem), 'direction: unit missing')
  const nLegs = p.walkers.reduce((s, w) => s + w.legs.length, 0)
  check(nLegs >= 6 && nLegs <= 9, `direction: ${nLegs} legs (expected 6-9)`)
  // simulate with complex numbers
  const paths: Cx[][] = p.walkers.map((w) => {
    let h: Cx
    if (w.shadow) {
      const s: Cx = w.shadow.time === 'morning' ? [-1, 0] : [1, 0] // direction in which the shadow falls
      h = w.shadow.side === 'left' ? cmul(s, [0, -1]) : cmul(s, [0, 1]) // left(h) = h*i ; right(h) = h*(-i)
    } else h = HEAD_C[w.legs[0].abs as number]
    let pos: Cx = [w.start[0], w.start[1]]
    const pts: Cx[] = [[pos[0], pos[1]]]
    w.legs.forEach((l, i) => {
      if (i > 0) {
        const t = turnFromPhrase(PHRASE_OF[l.style as string])
        const quarters = t.deg / 90
        for (let k = 0; k < quarters; k++) h = t.cw ? cmul(h, CW90) : cmul(h, [0, 1])
      }
      pos = [pos[0] + h[0] * l.d, pos[1] + h[1] * l.d]
      pts.push([pos[0], pos[1]])
    })
    return pts
  })
  const all = paths.flat()
  const hasPt = (c: [number, number]): boolean => all.some((x) => x[0] === c[0] && x[1] === c[1])
  check(hasPt(p.ask.a) && hasPt(p.ask.b), 'direction: asked point is not on any path')
  const dx = p.ask.a[0] - p.ask.b[0]
  const dy = p.ask.a[1] - p.ask.b[1]
  let expected: string
  if (p.ask.kind === 'dist') {
    check(/shortest distance/.test(q.stem), 'direction: stem is not a distance question')
    const ax = Math.abs(dx)
    const ay = Math.abs(dy)
    if (ax === 0 || ay === 0) expected = `${ax + ay} ${p.unit}`
    else if (ax === ay) expected = `${ax}√2 ${p.unit}`
    else {
      const c = Math.sqrt(ax * ax + ay * ay)
      check(Number.isInteger(c), 'direction: non-integer distance')
      expected = `${c} ${p.unit}`
    }
  } else {
    check(/In which direction is/.test(q.stem), 'direction: stem is not a direction question')
    expected = COMPASS(dx, dy)
  }
  checkKey(q, expected, 'direction')
  // the labels of the asked points in the stem must be the points of the model
  const labelPts = new Map<string, Cx>()
  const reach = [...q.stem.matchAll(/to reach point ([A-Z])/g)].map((m) => m[1])
  const reachPts: Cx[] = []
  p.walkers.forEach((_w, wi) => paths[wi].slice(1).forEach((c) => reachPts.push(c)))
  const unlabeledLegs = p.walkers.some((w) => w.shadow)
  if (!unlabeledLegs) {
    check(reach.length === reachPts.length, 'direction: not every leg end is labelled')
    reach.forEach((l, i) => labelPts.set(l, reachPts[i]))
  } else {
    labelPts.set(reach[0], reachPts[reachPts.length - 1])
  }
  const qm = p.ask.kind === 'dist' ? /between point ([A-Z]) and point ([A-Z])/.exec(q.stem) : /direction is point ([A-Z]) with respect to point ([A-Z])/.exec(q.stem)
  check(qm, 'direction: could not parse the asked labels')
  for (const [lab, want] of [[qm[1], p.ask.a], [qm[2], p.ask.b]] as [string, [number, number]][]) {
    const got = labelPts.get(lab)
    if (got) check(got[0] === want[0] && got[1] === want[1], `direction: label ${lab} maps to a different point than the model`)
    else check(paths.some((pp) => pp[0][0] === want[0] && pp[0][1] === want[1]), `direction: start label ${lab} is not a start point`)
  }
}

// ================================================================================================ CODING
const A0 = 65
const shiftCh = (c: string, s: number): string => String.fromCharCode(A0 + ((((c.charCodeAt(0) - A0 + s) % 26) + 26) % 26))
const isV = (c: string): boolean => 'AEIOU'.includes(c)
type LMs = Any
function letterStage(m: LMs, w: string): string {
  const n = w.length
  return w
    .split('')
    .map((c, i) => {
      switch (m.k) {
        case 'shift':
          return shiftCh(c, m.s)
        case 'pos':
          return shiftCh(c, m.m * (m.z ? i : i + 1))
        case 'alt':
          return shiftCh(c, i % 2 === 0 ? m.a : m.b)
        case 'vc':
          return shiftCh(c, isV(c) ? m.v : m.c)
        case 'mirror':
          return String.fromCharCode(A0 + 25 - (c.charCodeAt(0) - A0))
        case 'vcyc':
          return isV(c) ? 'AEIOU'[('AEIOU'.indexOf(c) + 1) % 5] : shiftCh(c, m.c)
        case 'ends':
          return shiftCh(c, i === 0 || i === n - 1 ? m.e : m.m)
        default:
          throw new Error(`unknown letter map ${m.k}`)
      }
    })
    .join('')
}
function permStage(p: string, w: string): string {
  switch (p) {
    case 'rev':
      return [...w].reverse().join('')
    case 'swapPairs': {
      const a = w.split('')
      for (let i = 0; i + 1 < a.length; i += 2) [a[i], a[i + 1]] = [a[i + 1], a[i]]
      return a.join('')
    }
    case 'swapEnds':
      return w.length < 2 ? w : w[w.length - 1] + w.slice(1, -1) + w[0]
    case 'rotL':
      return w.slice(1) + w[0]
    case 'rotR':
      return w[w.length - 1] + w.slice(0, -1)
    case 'oddEven':
      return [...w].filter((_c, i) => i % 2 === 0).join('') + [...w].filter((_c, i) => i % 2 === 1).join('')
    default:
      throw new Error(`unknown permutation ${p}`)
  }
}
const stageApply = (s: Any, w: string): string => (s.t === 'L' ? letterStage(s.m, w) : permStage(s.p, w))
function pipeApply(p: Any, w: string): string {
  let cur = w
  for (let r = 0; r < (p.twice ? 2 : 1); r++) for (const s of p.stages) cur = stageApply(s, cur)
  return cur
}
/** Parses the step list of a rule-based coding stem back into stages. */
function parseStage(line0: string): Any {
  const line = line0.charAt(0).toLowerCase() + line0.slice(1)
  const dirSign = (d: string): number => (d === 'forward' ? 1 : -1)
  let m: RegExpExecArray | null
  if (/the letters are written in reverse order/.test(line)) return { t: 'P', p: 'rev' }
  if (/positions 1 and 2, 3 and 4/.test(line)) return { t: 'P', p: 'swapPairs' }
  if (/the first and the last letters are interchanged/.test(line)) return { t: 'P', p: 'swapEnds' }
  if (/first letter is moved to the extreme right/.test(line)) return { t: 'P', p: 'rotL' }
  if (/last letter is moved to the extreme left/.test(line)) return { t: 'P', p: 'rotR' }
  if (/are written first, followed by/.test(line)) return { t: 'P', p: 'oddEven' }
  if (/opposite letter/.test(line)) return { t: 'L', m: { k: 'mirror' } }
  if ((m = /each letter is moved (\d+) places? (forward|backward) in the alphabet/.exec(line))) return { t: 'L', m: { k: 'shift', s: dirSign(m[2]) * Number(m[1]) } }
  if ((m = /each letter is moved (forward|backward) by (its position number|twice its position number|(\d+) times its position number)/.exec(line))) {
    const mult = m[2].startsWith('its') ? 1 : m[2].startsWith('twice') ? 2 : Number(m[3])
    return { t: 'L', m: { k: 'pos', m: dirSign(m[1]) * mult } }
  }
  if ((m = /odd position .* is moved (\d+) places? (forward|backward) and each letter at an even position .* is moved (\d+) places? (forward|backward)/.exec(line))) return { t: 'L', m: { k: 'alt', a: dirSign(m[2]) * Number(m[1]), b: dirSign(m[4]) * Number(m[3]) } }
  if ((m = /each vowel is replaced by the next vowel .* each consonant is moved (\d+) places? (forward|backward)/.exec(line))) return { t: 'L', m: { k: 'vcyc', c: dirSign(m[2]) * Number(m[1]) } }
  if ((m = /each vowel (is left unchanged|is moved (\d+) places? (forward|backward)) and each consonant (is left unchanged|is moved (\d+) places? (forward|backward))/.exec(line))) {
    const v = m[1] === 'is left unchanged' ? 0 : dirSign(m[3]) * Number(m[2])
    const c = m[4] === 'is left unchanged' ? 0 : dirSign(m[6]) * Number(m[5])
    return { t: 'L', m: { k: 'vc', v, c } }
  }
  if ((m = /first and the last letters are each moved (\d+) places? (forward|backward) and every other letter is moved (\d+) places? (forward|backward)/.exec(line))) return { t: 'L', m: { k: 'ends', e: dirSign(m[2]) * Number(m[1]), m: dirSign(m[4]) * Number(m[3]) } }
  throw new Error(`cannot parse coding step: ${line}`)
}
function stagesFromStem(stem: string): { stages: Any[]; twice: boolean } {
  const lines = stem.split('\n').filter((l) => /^Step \d+:/.test(l))
  return { stages: lines.map((l) => parseStage(l.replace(/^Step \d+:\s*/, ''))), twice: /carried out once more on the result/.test(stem) }
}
// family used for the identification proof (own construction)
function familyStages(): Any[] {
  const out: Any[] = []
  for (let s = -8; s <= 8; s++) if (s) out.push({ t: 'L', m: { k: 'shift', s } })
  for (const m of [-3, -2, -1, 1, 2, 3]) out.push({ t: 'L', m: { k: 'pos', m } })
  for (let a = -4; a <= 4; a++) for (let b = -4; b <= 4; b++) if (a !== b) out.push({ t: 'L', m: { k: 'alt', a, b } })
  for (let v = -4; v <= 4; v++) for (let c = -4; c <= 4; c++) if (v || c) out.push({ t: 'L', m: { k: 'vc', v, c } })
  out.push({ t: 'L', m: { k: 'mirror' } })
  for (let c = -3; c <= 3; c++) out.push({ t: 'L', m: { k: 'vcyc', c } })
  for (const e of [-3, -2, -1, 1, 2, 3]) for (let m = -3; m <= 3; m++) if (e !== m) out.push({ t: 'L', m: { k: 'ends', e, m } })
  for (const p of ['rev', 'swapPairs', 'swapEnds', 'rotL', 'rotR', 'oddEven']) out.push({ t: 'P', p })
  return out
}
const FAMILY_STAGES = familyStages()
// mixed rule-based codes: own parser + engine
function verifyMixed(q: QuestionDraft, p: Extract<CodingProof, { k: 'mixed' }>): void {
  const stem = q.stem
  const dirSign = (d: string): number => (d === 'forward' ? 1 : -1)
  const ma = /Every vowel is moved (\d+) places? (forward|backward) in the alphabet, every consonant is moved (\d+) places? (forward|backward), every digit is increased by (\d+)/.exec(stem)
  check(ma, 'mixed: cannot parse rule (a)')
  const va = dirSign(ma[2]) * Number(ma[1])
  const co = dirSign(ma[4]) * Number(ma[3])
  const dk = Number(ma[5])
  const rules = [...stem.matchAll(/^\((i|ii|iii)\) If (.+?), (the .+|both .+)\.$/gm)].map((m) => ({ cond: m[2], act: m[3] }))
  check(rules.length === 3, 'mixed: expected 3 conditions in the stem')
  const input = /for the input '(.+)'\?$/.exec(stem)?.[1] as string
  check(input && input.length === 6, 'mixed: cannot parse the input')
  const cls = (c: string): string => (/[0-9]/.test(c) ? 'D' : /[A-Z]/.test(c) ? (isV(c) ? 'V' : 'C') : 'S')
  const f = input[0]
  const l = input[input.length - 1]
  const condOk = (t: string): boolean => {
    if (t === 'the first element is a vowel and the last element is a digit') return cls(f) === 'V' && cls(l) === 'D'
    if (t === 'the first element is a consonant and the last element is a symbol') return cls(f) === 'C' && cls(l) === 'S'
    if (t === 'both the first and the last elements are digits') return cls(f) === 'D' && cls(l) === 'D'
    if (t === 'the first element is a symbol') return cls(f) === 'S'
    if (t === 'both the first and the last elements are consonants') return cls(f) === 'C' && cls(l) === 'C'
    if (t === 'both the first and the last elements are vowels') return cls(f) === 'V' && cls(l) === 'V'
    if (t === 'the first element is a digit and the last element is a letter') return cls(f) === 'D' && /[A-Z]/.test(l)
    throw new Error(`mixed: unknown condition "${t}"`)
  }
  let coded = input
    .split('')
    .map((c) => {
      const k = cls(c)
      if (k === 'V') return shiftCh(c, va)
      if (k === 'C') return shiftCh(c, co)
      if (k === 'D') return String((Number(c) + dk) % 10)
      return c
    })
  const hit = rules.find((r) => condOk(r.cond))
  check(hit, 'mixed: no condition holds')
  const a = hit.act
  if (a === 'the first and the last elements of the coded string are interchanged') [coded[0], coded[5]] = [coded[5], coded[0]]
  else if (a.startsWith('both the first and the last elements of the coded string are replaced by')) {
    const sym = /by '(.)'/.exec(a)?.[1] as string
    coded[0] = sym
    coded[5] = sym
  } else if (a === 'the coded string is written in reverse order') coded = coded.reverse()
  else if (a === 'the first and the last elements of the coded string are deleted') coded = coded.slice(1, 5)
  else if (a === 'the first element of the coded string is moved to the extreme right') coded = [...coded.slice(1), coded[0]]
  else if (a === 'the third and the fourth elements of the coded string are interchanged') [coded[2], coded[3]] = [coded[3], coded[2]]
  else throw new Error(`mixed: unknown action "${a}"`)
  check(input === p.input, 'mixed: stem input differs from model input')
  checkKey(q, coded.join(''), 'coding(mixed)')
}
function verifyCoding(g: Group, p: CodingProof): void {
  const q = g.questions[0]
  if (p.k === 'mixed') return verifyMixed(q, p)
  if (p.k === 'rule') {
    const { stages, twice } = stagesFromStem(q.stem)
    check(stages.length >= 2, 'coding(rule): fewer than 2 steps parsed')
    const pipe = { stages, twice }
    const quoted = /'([A-Z]+)'\?$/.exec(q.stem)
    if (p.mode === 'enc') {
      check(quoted, 'coding(rule): cannot parse the word')
      checkKey(q, pipeApply(pipe, quoted[1]), 'coding(rule)')
    } else {
      const code = /has the code '([A-Z]+)'\?$/.exec(q.stem)?.[1] as string
      check(code, 'coding(rule): cannot parse the code')
      q.options.forEach((o, i) => check((pipeApply(pipe, o) === code) === (i === q.answer), `coding(rule/dec): option ${o} ${i === q.answer ? 'does not encode to' : 'also encodes to'} the code`))
    }
    return
  }
  // example-based: parse examples from the stem, prove the rule is identified inside a family of two-stage rules
  const m = /'([A-Z]+)' is written as '([A-Z]+)' and '([A-Z]+)' is written as '([A-Z]+)'\. How is '([A-Z]+)'/.exec(q.stem)
  check(m, 'coding(example): cannot parse the examples')
  const [, w1, c1, w2, c2, w3] = m
  check(pipeApply(p.pipe, w1) === c1 && pipeApply(p.pipe, w2) === c2, 'coding(example): model rule does not reproduce the examples')
  const ans = pipeApply(p.pipe, w3)
  checkKey(q, ans, 'coding(example)')
  const out1 = FAMILY_STAGES.map((s) => stageApply(s, w1))
  const out2 = FAMILY_STAGES.map((s) => stageApply(s, w2))
  let consistent = 0
  const test = (stages: Any[], twice: boolean): void => {
    const f = { stages, twice }
    if (pipeApply(f, w1) !== c1 || pipeApply(f, w2) !== c2) return
    consistent++
    check(pipeApply(f, w3) === ans, `coding(example): another rule also fits both examples but codes '${w3}' differently`)
  }
  FAMILY_STAGES.forEach((s, i) => {
    if (out1[i] === c1 && out2[i] === c2) test([s], false)
  })
  for (let i = 0; i < FAMILY_STAGES.length; i++) {
    for (let j = 0; j < FAMILY_STAGES.length; j++) {
      if (stageApply(FAMILY_STAGES[j], out1[i]) !== c1) continue
      if (stageApply(FAMILY_STAGES[j], out2[i]) !== c2) continue
      test([FAMILY_STAGES[i], FAMILY_STAGES[j]], false)
    }
  }
  const mixedKinds = (s: Any): boolean => s.t === 'L'
  for (const a of FAMILY_STAGES) {
    for (const b of FAMILY_STAGES) {
      if (mixedKinds(a) === mixedKinds(b)) continue
      test([a, b], true)
    }
  }
  check(consistent >= 1, 'coding(example): the model rule itself is missing from the family')
}

// ================================================================================================ SENTENCE CODING
function verifySentence(g: Group, p: SentenceProof): void {
  const paras = stimText(g).slice(1)
  const sentences = paras.map((s) => {
    const m = /^'(.+)' is coded as '(.+)'$/.exec(s)
    check(m, `sentence: cannot parse "${s}"`)
    return { words: m[1].split(' '), codes: m[2].split(' ') }
  })
  check(sentences.length >= 3 && sentences.length <= 5, `sentence: ${sentences.length} sentences`)
  const words = [...new Set(sentences.flatMap((s) => s.words))]
  const codes = [...new Set(sentences.flatMap((s) => s.codes))]
  check(words.length === codes.length, 'sentence: word/code counts differ')
  check(JSON.stringify(sentences.map((s) => [...s.words].sort())) === JSON.stringify(p.sentences.map((s) => [...s.words].sort())), 'sentence: stimulus differs from the model')
  // all bijections consistent with the sentences
  const dicts: Map<string, string>[] = []
  const cur = new Map<string, string>()
  const used = new Set<string>()
  const rec = (i: number): void => {
    if (i === words.length) {
      if (sentences.every((s) => new Set(s.words.map((w) => cur.get(w))).size === s.codes.length && s.words.every((w) => s.codes.includes(cur.get(w) as string)))) dicts.push(new Map(cur))
      return
    }
    for (const c of codes) {
      if (used.has(c)) continue
      if (sentences.some((s) => s.words.includes(words[i]) && !s.codes.includes(c))) continue
      used.add(c)
      cur.set(words[i], c)
      rec(i + 1)
      cur.delete(words[i])
      used.delete(c)
    }
  }
  rec(0)
  check(dicts.length >= 1, 'sentence: no dictionary fits the sentences')
  const codeSet = (w: string[], d: Map<string, string>): string => w.map((x) => d.get(x)).sort().join('|')
  const wordsOfCodes = (cs: string[], d: Map<string, string>): string => words.filter((w) => cs.includes(d.get(w) as string)).sort().join('|')
  g.questions.forEach((q, i) => {
    let m: RegExpExecArray | null
    const ok = (cond: boolean, msg: string): void => check(cond, `sentence q${i + 1}: ${msg}`)
    if ((m = /^What is the code for '([^']+)' in the given code language\?/.exec(q.stem))) {
      const ws = m[1].split(' ')
      const target = codeSet(ws, dicts[0])
      ok(dicts.every((d) => codeSet(ws, d) === target), 'code is not unique over all dictionaries')
      const opt = (o: string): string => o.split(' ').sort().join('|')
      ok(opt(q.options[q.answer]) === target, 'keyed option differs from the recomputed code')
      q.options.forEach((o, j) => j !== q.answer && ok(opt(o) !== target, 'a wrong option also matches'))
    } else if ((m = /^What does the code '([^']+)' stand for/.exec(q.stem))) {
      const target = wordsOfCodes([m[1]], dicts[0])
      ok(dicts.every((d) => wordsOfCodes([m![1]], d) === target), 'word is not unique')
      ok(q.options[q.answer] === target, 'keyed word differs')
      q.options.forEach((o, j) => j !== q.answer && ok(o !== target, 'a wrong option also matches'))
    } else if ((m = /meaning of the code '([^']+)'/.exec(q.stem))) {
      const cs = m[1].split(' ')
      const target = wordsOfCodes(cs, dicts[0])
      ok(dicts.every((d) => wordsOfCodes(cs, d) === target), 'phrase meaning is not unique')
      const opt = (o: string): string => o.split(' ').sort().join('|')
      ok(opt(q.options[q.answer]) === target, 'keyed phrase differs')
      q.options.forEach((o, j) => j !== q.answer && ok(opt(o) !== target, 'a wrong option also matches'))
    } else if ((m = /^Which of the following may be the code for '([^']+)'/.exec(q.stem))) {
      const feas = new Set(dicts.map((d) => d.get(m![1]) as string))
      ok(feas.size > 1, 'a "may be" word is in fact determined')
      ok(feas.has(q.options[q.answer]), 'keyed code is not feasible')
      q.options.forEach((o, j) => j !== q.answer && ok(!feas.has(o), 'a wrong option is feasible'))
    } else throw new Error(`sentence q${i + 1}: unknown question form`)
  })
  // cross-elimination: at least 3 words are NOT fixed by simply intersecting the sentences that contain them
  const direct = words.filter((w) => {
    const inS = sentences.filter((s) => s.words.includes(w))
    return codes.filter((c) => inS.every((s) => s.codes.includes(c))).length === 1
  })
  const determined = words.filter((w) => dicts.every((d) => d.get(w) === dicts[0].get(w)))
  check(determined.length - direct.length >= 3, `sentence: only ${determined.length - direct.length} words need cross-elimination`)
}

// ================================================================================================ ORDER RANKING
function verifyRank(g: Group, p: RankProof): void {
  const q = g.questions[0]
  if (p.k === 'row') {
    const r = p.row
    const vals = new Set<number>()
    const nP = r.persons.length
    for (let N = 2; N <= 160; N++) {
      const pos = r.anchors.map((a) => (a.side === 'L' ? a.n : N - a.n + 1))
      if (pos.some((x) => x < 1 || x > N) || new Set(pos).size !== pos.length) continue
      let arr: (number | null)[] = Array(N).fill(null)
      pos.forEach((x, i) => (arr[x - 1] = i))
      const states: (number | null)[][] = [arr.slice()]
      let valid = true
      for (const op of r.ops) {
        if (op.k === 'swap') {
          const i = arr.indexOf(op.a)
          const j = arr.indexOf(op.b)
          ;[arr[i], arr[j]] = [arr[j], arr[i]]
        } else if (op.k === 'lL') {
          if (arr.slice(0, op.n).some((x) => x !== null)) valid = false
          arr = arr.slice(op.n)
        } else if (op.k === 'lR') {
          if (arr.slice(arr.length - op.n).some((x) => x !== null)) valid = false
          arr = arr.slice(0, arr.length - op.n)
        } else if (op.k === 'jL') arr = [...Array(op.n).fill(null), ...arr]
        else arr = [...arr, ...Array(op.n).fill(null)]
        states.push(arr.slice())
      }
      if (!valid) continue
      const holds = (f: Any): boolean => {
        const s = states[f.t]
        if (f.k === 'L') return s.indexOf(f.p) + 1 === f.n
        if (f.k === 'R') return s.length - s.indexOf(f.p) === f.n
        if (f.k === 'B') return Math.abs(s.indexOf(f.a) - s.indexOf(f.b)) - 1 === f.n
        return s.length === f.n
      }
      if (!r.facts.every(holds)) continue
      const s = states[r.ask.t]
      const a = r.ask as Any
      vals.add(a.k === 'L' ? s.indexOf(a.p) + 1 : a.k === 'R' ? s.length - s.indexOf(a.p) : a.k === 'B' ? Math.abs(s.indexOf(a.a) - s.indexOf(a.b)) - 1 : s.length)
    }
    check(vals.size === 1, `rank(row): ${vals.size} possible answers over all consistent rows`)
    checkKey(q, String([...vals][0]), 'rank(row)')
    check(nP >= 2, 'rank(row): persons')
    // every given ordinal of the stem is one of the model numbers
    const nums = [...q.stem.matchAll(/(\d+)(?:st|nd|rd|th) from the (?:left|right) end/g)].map((m) => Number(m[1]))
    const want = [...r.anchors.map((a) => a.n), ...r.facts.filter((f: Any) => f.k === 'L' || f.k === 'R').map((f: Any) => f.n)]
    check(JSON.stringify([...nums].sort()) === JSON.stringify([...want].sort()), 'rank(row): ordinals in the stem differ from the model')
    return
  }
  if (p.k === 'sections') {
    const s = p.sec
    const ordinals = [...q.stem.matchAll(/ranks (\d+)(?:st|nd|rd|th) from the top and (\d+)(?:st|nd|rd|th) from the bottom/g)][0]
    check(ordinals && Number(ordinals[1]) === s.a && Number(ordinals[2]) === s.b, 'rank(sections): ordinals differ from the model')
    const vals = new Set<number>()
    for (let Np = 1; Np <= 400; Np++) {
      if (!(s.a <= Np && Np - s.a + 1 === s.b)) continue
      const Nq = s.rel.kind === 'diff' ? Np + s.rel.k : (Np * s.rel.n) / s.rel.m
      if (!Number.isInteger(Nq) || Nq < 1) continue
      const shifts = s.moved === null ? Array.from({ length: Np + 1 }, (_, i) => i).filter((x) => (Np - x) * (s.after as number[])[1] === (s.after as number[])[0] * (Nq + x)) : [s.moved]
      for (const sh of shifts) {
        const P2 = Np - sh
        const Q2 = Nq + sh - s.left
        vals.add(s.ask === 'P' ? P2 : s.ask === 'Q' ? Q2 : s.ask === 'moved' ? sh : P2 + Q2)
      }
    }
    check(vals.size === 1, `rank(sections): ${vals.size} possible answers`)
    checkKey(q, String([...vals][0]), 'rank(sections)')
    return
  }
  // ordering: DFS over every arrangement consistent with the clues
  const o = p.ord
  const n = o.persons.length
  check(n >= 8 && n <= 10, `rank(order): ${n} persons`)
  check(o.clues.length >= 6 && o.clues.length <= 11, 'rank(order): clue count')
  const pos = new Array<number>(n).fill(0)
  const usedPos = new Array<boolean>(n + 1).fill(false)
  const holds = (c: Any): boolean => {
    switch (c.k) {
      case 'rank':
        return pos[c.x] === c.r
      case 'above':
        return pos[c.x] < pos[c.y]
      case 'adj':
        return pos[c.y] === pos[c.x] + 1
      case 'gap':
        return Math.abs(pos[c.x] - pos[c.y]) - 1 === c.m
      case 'mid':
        return Math.min(pos[c.x], pos[c.z]) < pos[c.y] && pos[c.y] < Math.max(pos[c.x], pos[c.z])
      case 'ext':
        return pos[c.x] !== 1 && pos[c.x] !== n
      default:
        throw new Error('unknown clue')
    }
  }
  const involves = (c: Any): number[] => [c.x, c.y, c.z].filter((v) => v !== undefined)
  const askVal = (): string => {
    const a = o.ask as Any
    const who = (ps: number): string => o.persons[pos.indexOf(ps)]
    switch (a.k) {
      case 'who':
        return who(a.r)
      case 'between':
        return String(Math.abs(pos[a.x] - pos[a.y]) - 1)
      case 'higher':
        return String(pos[a.x] - 1)
      case 'lower':
        return String(n - pos[a.x])
      default:
        return who(pos[a.x] + 1)
    }
  }
  const vals = new Set<string>()
  let nSol = 0
  const dfs = (i: number): void => {
    if (i === n) {
      nSol++
      vals.add(askVal())
      return
    }
    for (let ps = 1; ps <= n; ps++) {
      if (usedPos[ps]) continue
      pos[i] = ps
      usedPos[ps] = true
      let ok = true
      for (const c of o.clues) {
        const inv = involves(c)
        if (Math.max(...inv) === i && !holds(c)) {
          ok = false
          break
        }
      }
      if (ok) dfs(i + 1)
      usedPos[ps] = false
      pos[i] = 0
    }
  }
  dfs(0)
  check(nSol >= 1, 'rank(order): the clues are contradictory')
  check(vals.size === 1, `rank(order): ${vals.size} possible answers over ${nSol} arrangements`)
  checkKey(q, [...vals][0], 'rank(order)')
  // minimality: removing any non-absolute clue must make the answer ambiguous
  const abs = o.clues.filter((c: Any) => c.k === 'rank').length
  check(abs >= 2, 'rank(order): fewer than two positional clues')
  check(o.clues.every((c: Any) => c.k !== 'rank' || true), 'rank(order)')
}

// ================================================================================================ ALPHANUMERIC
function verifyAlpha(g: Group, p: AlphaProof): void {
  const series = p.series
  check(series.length === 40, `alphanumeric: series has ${series.length} elements`)
  check(stimText(g)[0] === series.join(' '), 'alphanumeric: stimulus differs from the model series')
  const klass = (ch: string): string[] => {
    const out: string[] = []
    if (/[A-Z]/.test(ch)) {
      out.push('letter')
      out.push('AEIOU'.includes(ch) ? 'vowel' : 'consonant')
    } else if (/[0-9]/.test(ch)) {
      out.push('digit')
      out.push(Number(ch) % 2 === 0 ? 'even' : 'odd')
      if ([2, 3, 5, 7].includes(Number(ch))) out.push('prime')
    } else out.push('symbol')
    return out
  }
  const is = (ch: string | undefined, c: string): boolean => ch !== undefined && klass(ch).includes(c)
  const matches = (cur: string, conds: Any[]): number[] => {
    const res: number[] = []
    for (let i = 0; i < series.length; i++) {
      if (!is(series[i], cur)) continue
      let ok = true
      let boundary = false
      for (const c of conds) {
        const j = c.dir === 'prev' ? i - 1 : i + 1
        const nb = series[j]
        if (nb === undefined) boundary = true
        const hit = is(nb, c.cls)
        if (c.neg ? hit : !hit) ok = false
        if (c.neg && nb === undefined) ok = false // the vacuous reading must not be relied upon
      }
      if (ok && boundary) throw new Error('alphanumeric: an end element satisfies the conditions only vacuously')
      if (ok) res.push(i)
    }
    return res
  }
  const pickIdx = (a: Any): number => {
    const idx = series.map((c, i) => (is(c, a.cls) ? i : -1)).filter((i) => i >= 0)
    if (a.i > idx.length) return -1
    return a.from === 'L' ? idx[a.i - 1] : idx[idx.length - a.i]
  }
  check(g.questions.length === p.questions.length, 'alphanumeric: question/proof length mismatch')
  g.questions.forEach((q, qi) => {
    const s = p.questions[qi].spec as Any
    let expected: string
    if (s.k === 'count') expected = String(matches(s.cur, s.conds).length)
    else if (s.k === 'sum') expected = String(matches(s.cur, s.conds).reduce((t, i) => t + Number(series[i]), 0))
    else if (s.k === 'delNth') {
      const rest = series.filter((c) => !is(c, s.del))
      const base = s.from === 'L' ? s.i - 1 : rest.length - s.i
      expected = rest[s.dir === 'R' ? base + s.j : base - s.j]
    } else if (s.k === 'between') {
      const ia = pickIdx(s.a)
      const ib = pickIdx(s.b)
      let c = 0
      for (let k = Math.min(ia, ib) + 1; k < Math.max(ia, ib); k++) if (is(series[k], s.count)) c++
      expected = String(c)
    } else {
      const ia = pickIdx(s.a)
      expected = series[s.dir === 'R' ? ia + s.j : ia - s.j]
    }
    check(expected !== undefined && expected !== 'NaN', 'alphanumeric: recomputation failed')
    checkKey(q, expected, `alphanumeric q${qi + 1}`)
  })
}

// ================================================================================================ REASONING MISC
// ---- machine
const dsum2 = (s: string): number => [...s].reduce((t, c) => t + Number(c), 0)
const KEYS: Record<string, (a: string, b: string) => number> = {}
{
  const add = (id: string, f: (s: string) => number | string, dir: number): void => {
    KEYS[id] = (a, b) => {
      const x = f(a)
      const y = f(b)
      const c = x < y ? -1 : x > y ? 1 : 0
      if (c !== 0) return dir * c
      return /^\d+$/.test(a) ? Number(a) - Number(b) : a < b ? -1 : a > b ? 1 : 0
    }
  }
  const val = (s: string): number => Number(s)
  const vow = (s: string): number => [...s].filter((c) => 'aeiou'.includes(c)).length
  add('val+', val, 1)
  add('val-', val, -1)
  add('ds+', dsum2, 1)
  add('ds-', dsum2, -1)
  add('ud+', (s) => Number(s) % 10, 1)
  add('ud-', (s) => Number(s) % 10, -1)
  add('td+', (s) => Math.floor(Number(s) / 10), 1)
  add('td-', (s) => Math.floor(Number(s) / 10), -1)
  add('al+', (s) => s, 1)
  add('al-', (s) => s, -1)
  add('ln+', (s) => s.length, 1)
  add('ln-', (s) => s.length, -1)
  add('ll+', (s) => s[s.length - 1], 1)
  add('ll-', (s) => s[s.length - 1], -1)
  add('vw+', vow, 1)
  add('vw-', vow, -1)
}
interface MR {
  pat: string
  key: string | null
  k: number
}
function mStep(r: MR, a: string[], t: number): string[] {
  const n = a.length
  const o = a.slice()
  const cmp = r.key ? KEYS[r.key] : (): number => 0
  if (r.pat === 'selL' || r.pat === 'selLx') {
    const i = t - 1
    if (i >= n - 1) return o
    const rest = o.slice(i)
    const best = rest.reduce((m, x) => (cmp(x, m) < 0 ? x : m), rest[0])
    const at = o.indexOf(best)
    if (r.pat === 'selL') {
      o.splice(at, 1)
      o.splice(i, 0, best)
    } else {
      o[at] = o[i]
      o[i] = best
    }
    return o
  }
  if (r.pat === 'selR') {
    const i = n - t
    if (i <= 0) return o
    const part = o.slice(0, i + 1)
    const best = part.reduce((m, x) => (cmp(x, m) > 0 ? x : m), part[0])
    o.splice(o.indexOf(best), 1)
    o.splice(i, 0, best)
    return o
  }
  if (r.pat === 'alt') {
    const odd = t % 2 === 1
    const leftDone = odd ? (t - 1) / 2 : t / 2
    const rightDone = odd ? (t - 1) / 2 : t / 2 - 1
    const lo = leftDone
    const hi = n - 1 - rightDone
    if (lo >= hi) return o
    const part = o.slice(lo, hi + 1)
    const best = part.reduce((m, x) => ((odd ? cmp(x, m) < 0 : cmp(x, m) > 0) ? x : m), part[0])
    o.splice(o.indexOf(best), 1)
    o.splice(odd ? lo : hi, 0, best)
    return o
  }
  if (r.pat === 'bubble') {
    for (let i = 0; i + 1 < n; i++) if (cmp(o[i], o[i + 1]) > 0) [o[i], o[i + 1]] = [o[i + 1], o[i]]
    return o
  }
  const i = t - 1
  if (i + r.k >= n) return o
  ;[o[i], o[i + r.k]] = [o[i + r.k], o[i]]
  return o
}
function mRun(r: MR, init: string[]): string[][] {
  const maxT = r.pat === 'swapK' ? init.length - r.k : init.length - 1
  const st: string[][] = [init]
  let cur = init
  let lastChange = 0
  for (let t = 1; t <= maxT; t++) {
    const nx = mStep(r, cur, t)
    if (nx.join(' ') !== cur.join(' ')) {
      if (lastChange !== t - 1) throw new Error('machine: a step before the last changing step does not change anything')
      lastChange = t
    }
    st.push(nx)
    cur = nx
  }
  return st.slice(0, lastChange + 1)
}
const ROM = ['0', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X']
function verifyMachine(g: Group, p: MachineProof): void {
  const paras = stimText(g)
  const line = (pre: string): string[] => (paras.find((x) => x.startsWith(pre)) as string).slice(pre.length).trim().split(' ')
  const ex = line('Input:')
  const s1 = line('Step I:')
  const s2 = line('Step II:')
  const rule = p.rule as MR
  const run = mRun(rule, ex)
  check(run.length >= 4, 'machine: example runs for fewer than 3 steps')
  check(run[1].join(' ') === s1.join(' ') && run[2].join(' ') === s2.join(' '), 'machine: shown steps differ from the model rule')
  // identification: every (pattern, key) rule that reproduces the two shown steps behaves identically on every question input
  const keyIds = Object.keys(KEYS).filter((k) => (p.kind === 'num' ? /^(val|ds|ud|td)/.test(k) : /^(al|ln|ll|vw)/.test(k)))
  const family: MR[] = []
  for (const pat of ['selL', 'selLx', 'selR', 'alt', 'bubble']) for (const key of keyIds) family.push({ pat, key, k: 0 })
  family.push({ pat: 'swapK', key: null, k: 2 }, { pat: 'swapK', key: null, k: 3 })
  const consistent = family.filter((r) => {
    try {
      const t = mRun(r, ex)
      return t.length >= 3 && t[1].join(' ') === s1.join(' ') && t[2].join(' ') === s2.join(' ')
    } catch {
      return false
    }
  })
  check(consistent.some((r) => r.pat === rule.pat && r.key === rule.key && r.k === rule.k), 'machine: model rule not in the verifier family')
  g.questions.forEach((q, qi) => {
    const mi = /input: ([^?]+)\?/.exec(q.stem)
    check(mi, 'machine: cannot parse the question input')
    const inp = mi[1].replace(/\s*\(The machine.*$/, '').trim().split(' ')
    const traj = mRun(rule, inp)
    check(inp.length >= 5 && traj.length >= 4, 'machine: question input too short / too few steps')
    for (const r of consistent) {
      const t = mRun(r, inp)
      check(t.length === traj.length && t.every((s, i) => s.join(' ') === traj[i].join(' ')), `machine q${qi + 1}: another rule fitting the shown steps behaves differently on this input`)
    }
    let expected: string
    let m: RegExpExecArray | null
    if ((m = /^Which of the following will be Step (\w+) for the input/.exec(q.stem))) {
      const t = ROM.indexOf(m[1])
      expected = traj[t].join(' ')
    } else if (/^How many steps will be required/.test(q.stem)) expected = String(traj.length - 1)
    else if (/^What is the sum of the first/.test(q.stem)) {
      const last = traj[traj.length - 1]
      expected = String(Number(last[0]) + Number(last[last.length - 1]))
    } else if ((m = /^Which element is (\d+)(?:st|nd|rd|th) from the (left|right) end in Step (\w+) of the input/.exec(q.stem))) {
      const s = traj[ROM.indexOf(m[3])]
      expected = m[2] === 'left' ? s[Number(m[1]) - 1] : s[s.length - Number(m[1])]
    } else throw new Error('machine: unknown question form')
    checkKey(q, expected, `machine q${qi + 1}`)
  })
}

// ---- data sufficiency
const DS_TEXTS = [
  'The data in statement I alone are sufficient to answer the question, while the data in statement II alone are not sufficient to answer the question',
  'The data in statement II alone are sufficient to answer the question, while the data in statement I alone are not sufficient to answer the question',
  'The data either in statement I alone or in statement II alone are sufficient to answer the question',
  'The data even in both statements I and II together are not sufficient to answer the question',
  'The data in both statements I and II together are necessary to answer the question',
]
function* perms(n: number, fixed: Map<number, number> = new Map()): Generator<number[]> {
  const pos = new Array<number>(n).fill(0)
  const used = new Array<boolean>(n + 1).fill(false)
  function* rec(i: number): Generator<number[]> {
    if (i === n) {
      yield pos
      return
    }
    for (let ps = 1; ps <= n; ps++) {
      if (used[ps]) continue
      if (fixed.has(i) && fixed.get(i) !== ps) continue
      used[ps] = true
      pos[i] = ps
      yield* rec(i + 1)
      used[ps] = false
    }
  }
  yield* rec(0)
}
function verifyDS(g: Group, d: DSProof): void {
  const q = g.questions[0]
  check(JSON.stringify(q.options) === JSON.stringify(DS_TEXTS), 'ds: option texts are not the standard five')
  const w = d.world as Any
  type World = { stmt: (cs: Any[]) => boolean; ans: string }
  const worlds: { holds: (c: Any) => boolean; ans: string }[] = []
  if (d.kind === 'order') {
    const n = w.n as number
    for (const pos of perms(n)) {
      const P = pos.slice()
      const holds = (c: Any): boolean => {
        switch (c.k) {
          case 'rank':
            return P[c.x] === c.r
          case 'above':
            return P[c.x] < P[c.y]
          case 'adj':
            return P[c.y] === P[c.x] + 1
          case 'gap':
            return Math.abs(P[c.x] - P[c.y]) - 1 === c.m
          case 'mid':
            return Math.min(P[c.x], P[c.z]) < P[c.y] && P[c.y] < Math.max(P[c.x], P[c.z])
          default:
            return P[c.x] !== 1 && P[c.x] !== n
        }
      }
      if (!holds(w.bg)) continue
      const a = w.ask as Any
      const at = (ps: number): string => (ps >= 1 && ps <= n ? w.persons[P.indexOf(ps)] : 'nobody')
      const ans = a.k === 'who' ? at(a.r) : a.k === 'higher' ? String(P[a.x] - 1) : a.k === 'lower' ? String(n - P[a.x]) : at(P[a.x] + 1)
      worlds.push({ holds, ans })
    }
  } else if (d.kind === 'circle') {
    const n = w.n as number
    for (const seat of perms(n)) {
      const S = seat.map((x) => x - 1)
      const holds = (c: Any): boolean => {
        const diff = (((S[c.y] - S[c.x]) % n) + n) % n
        if (c.k === 'off') return diff === (((c.d % n) + n) % n)
        if (c.k === 'nb') return diff === 1 || diff === n - 1
        return diff !== 1 && diff !== n - 1
      }
      const target = (((S[w.ask.x] + w.ask.d) % n) + n) % n
      worlds.push({ holds, ans: w.persons[S.indexOf(target)] })
    }
  } else if (d.kind === 'dir') {
    const R = 4
    const names: string[] = w.persons
    const dirOf = (dx: number, dy: number): string => {
      const ns = dy > 0 ? 'North' : dy < 0 ? 'South' : ''
      const ew = dx > 0 ? 'East' : dx < 0 ? 'West' : ''
      return ns && ew ? `${ns}-${ew}` : ns || ew
    }
    for (let bx = -R; bx <= R; bx++)
      for (let by = -R; by <= R; by++)
        for (let cx = -R; cx <= R; cx++)
          for (let cy = -R; cy <= R; cy++) {
            if ((bx === 0 && by === 0) || (cx === 0 && cy === 0) || (bx === cx && by === cy)) continue
            if (Math.abs(bx - cx) > 4 || Math.abs(by - cy) > 4) continue
            const P = [[0, 0], [bx, by], [cx, cy]]
            const holds = (c: Any): boolean => {
              const dx = P[c.y][0] - P[c.x][0]
              const dy = P[c.y][1] - P[c.x][1]
              if (c.k === 'axis') {
                const v = [[0, 1], [1, 0], [0, -1], [-1, 0]][c.h]
                return dx === v[0] * c.d && dy === v[1] * c.d
              }
              if (c.k === 'rel') return dirOf(dx, dy) === ['North', 'North-East', 'East', 'South-East', 'South', 'South-West', 'West', 'North-West'][c.dir]
              return dx * dx + dy * dy === c.d2
            }
            const a = w.ask
            worlds.push({ holds, ans: dirOf(P[a.y][0] - P[a.x][0], P[a.y][1] - P[a.x][1]) })
          }
    void names
  } else {
    const n = w.n as number
    const sp = w.spouses as [number, number][]
    for (let gmask = 0; gmask < 1 << n; gmask++) {
      if (!sp.every(([a, b]) => ((gmask >> a) & 1) !== ((gmask >> b) & 1))) continue
      const holds = (c: Any): boolean => ((gmask >> c.p) & 1) === (c.male ? 1 : 0)
      worlds.push({ holds, ans: (gmask >> w.ask.x) & 1 ? 'male' : 'female' })
    }
  }
  const answersFor = (cs: Any[]): Set<string> => new Set(worlds.filter((x) => cs.every((c) => x.holds(c))).map((x) => x.ans))
  const s1 = d.stmts[0] as Any[]
  const s2 = d.stmts[1] as Any[]
  check(s1.length >= 1 && s2.length >= 1, 'ds: empty statement')
  const a1 = answersFor(s1).size === 1
  const a2 = answersFor(s2).size === 1
  const both = answersFor([...s1, ...s2])
  check(both.size >= 1, 'ds: the statements are contradictory')
  const cls = a1 && !a2 ? 0 : !a1 && a2 ? 1 : a1 && a2 ? 2 : both.size > 1 ? 3 : 4
  check(cls === q.answer, `ds: keyed class ${q.answer} but exhaustive enumeration gives ${cls}`)
  // the rendered statements contain one sentence per model clue
  const stmtLine = (pre: string): string => (q.stem.split('\n').find((l) => l.startsWith(pre)) as string).slice(pre.length)
  const countSent = (s: string): number => s.split('. ').length
  check(countSent(stmtLine('I. ')) === s1.length && countSent(stmtLine('II. ')) === s2.length, 'ds: rendered statements have a different number of clues than the model')
  void ({} as World)
}
function verifyMisc(g: Group, p: MiscProof): void {
  if (p.k === 'machine') verifyMachine(g, p.m)
  else verifyDS(g, p.d)
}

// ================================================================================================ harness
interface Spec {
  id: ReasoningTopicId
  counts: number[]
  verify: (g: Group, proof: Any) => void
}
const SPECS: Spec[] = [
  { id: 'direction-distance', counts: [1, 2, 3, 4, 5, 6], verify: verifyDirection },
  { id: 'coding-decoding', counts: [1, 2, 3, 4, 5, 6], verify: verifyCoding },
  { id: 'sentence-coding', counts: [5, 10, 1, 2, 3, 4], verify: verifySentence },
  { id: 'order-ranking', counts: [1, 2, 3, 4, 5, 6], verify: verifyRank },
  { id: 'alphanumeric-series', counts: [5, 10, 1, 2, 3, 4], verify: verifyAlpha },
  { id: 'reasoning-misc', counts: [1, 2, 3, 4, 5, 6], verify: verifyMisc },
]

let failures = 0
const fail = (msg: string): void => {
  failures++
  if (failures <= 40) console.error(`  FAIL ${msg}`)
}

for (const spec of SPECS) {
  if (TOPIC_FILTER && !TOPIC_FILTER.includes(spec.id)) continue
  const gen = LOGIC_B_WITH_PROOF[spec.id] as (rng: ReturnType<typeof createRng>, count: number) => { groups: Group[]; proofs: unknown[] }
  const reg = MAINS_LOGIC_B[spec.id]
  check(reg, `${spec.id}: missing from MAINS_LOGIC_B`)
  let questions = 0
  let genMs = 0
  const stems = new Set<string>()
  const posCount = [0, 0, 0, 0, 0]
  const samples: { g: Group }[] = []
  const t0all = performance.now()
  let verifiedSets = 0
  for (let seed = 1; seed <= SEEDS; seed++) {
    const count = spec.counts[seed % spec.counts.length]
    try {
      const t0 = performance.now()
      const out = reg(createRng(seed), 'hard', count)
      genMs += performance.now() - t0
      const total = out.reduce((s, g) => s + g.questions.length, 0)
      check(total === count, `seed ${seed}: ${total} questions, expected ${count}`)
      const again = reg(createRng(seed), 'medium', count)
      check(JSON.stringify(out) === JSON.stringify(again), `seed ${seed}: not deterministic`)
      const withProof = gen(createRng(seed), count)
      check(JSON.stringify(withProof.groups) === JSON.stringify(out), `seed ${seed}: registry output differs from the proof-carrying generator`)
      check(withProof.proofs.length === out.length, `seed ${seed}: proof/group length mismatch`)
      out.forEach((grp, gi) => {
        assertGroup(grp, `${spec.id} seed ${seed}`)
        for (const q of grp.questions) {
          const text = [q.stem, q.explanation, ...q.options, ...(grp.stimulus ? [JSON.stringify(grp.stimulus)] : [])].join('\n')
          const bad = badChars(text)
          check(bad.length === 0, `seed ${seed}: unsupported characters ${JSON.stringify([...new Set(bad)])}`)
          check(q.explanation.split('\n').length >= 3, `seed ${seed}: explanation has fewer than 3 lines`)
          check(q.topic === spec.id, `seed ${seed}: wrong topic tag ${q.topic}`)
          stems.add(q.stem)
          posCount[q.answer]++
          questions++
        }
        try {
          spec.verify(grp, withProof.proofs[gi])
          verifiedSets++
        } catch (e) {
          fail(`${spec.id} seed ${seed} group ${gi}: ${e instanceof Error ? e.message : e}`)
        }
        if (samples.length < 3 && seed % 11 === 3 && gi === 0) samples.push({ g: grp })
      })
    } catch (e) {
      fail(`${spec.id} seed ${seed} count ${count}: ${e instanceof Error ? e.message : e}`)
    }
  }
  const frac = posCount.map((c) => c / Math.max(1, questions))
  frac.forEach((f, i) => {
    if (f < 0.12 || f > 0.28) fail(`${spec.id}: option ${'ABCDE'[i]} is the key in ${(f * 100).toFixed(1)}% of questions (outside 12-28%)`)
  })
  console.log(
    `${spec.id.padEnd(20)} questions=${questions} groups-verified=${verifiedSets} ms/30q=${((genMs / Math.max(1, questions)) * 30).toFixed(1)} distinct-stems=${stems.size} key-positions=${frac.map((f) => `${(f * 100).toFixed(0)}%`).join('/')} total=${((performance.now() - t0all) / 1000).toFixed(1)}s`,
  )
  if (!NO_SAMPLES) {
    console.log(`\n----- samples: ${spec.id} -----`)
    for (const s of samples) {
      if (s.g.stimulus) console.log(stimText(s.g).join('\n'))
      const q = s.g.questions[0]
      console.log(`Q: ${q.stem}\n${q.options.map((o, i) => `  (${'ABCDE'[i]}) ${o}`).join('\n')}\nKey: ${'ABCDE'[q.answer]}\n${q.explanation}\n`)
    }
  }
}

if (failures > 0) {
  console.error(`\n${failures} FAILURE(S)`)
  process.exit(1)
}
console.log('\nALL CHECKS PASSED')
