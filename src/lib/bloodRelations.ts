import { shuffle, type MCQQuestion } from './generators'

/**
 * Blood Relations (SBI PO Prelims + Mains style).
 *
 * Three question types, all answered from an explicit family tree that is built while the puzzle is
 * generated (so the answer is exact, not guessed):
 *  - "Pointing": a statement such as "He is the son of my father's brother's wife".
 *  - "Coded":    symbols stand for relations ("A + B" = A is the father of B) and are chained.
 *  - "Family":   a set of clues about 6–10 relatives, then several questions on the same family.
 *
 * Steps that would be ambiguous in a real exam (e.g. "my father's son" could be me) are never generated.
 */

export type BloodDifficulty = 'easy' | 'medium' | 'hard' | 'mixed'
export type BloodType = 'mixed' | 'pointing' | 'coded' | 'family'

// ---------- family tree ----------

interface Person {
  male: boolean | null
  father: number | null
  mother: number | null
  spouse: number | null
}

class Tree {
  people: Person[] = []
  add(male: boolean | null): number {
    this.people.push({ male, father: null, mother: null, spouse: null })
    return this.people.length - 1
  }
  marry(a: number, b: number) {
    this.people[a].spouse = b
    this.people[b].spouse = a
  }
  parents(i: number): number[] {
    const p = this.people[i]
    return [p.father, p.mother].filter((x): x is number => x !== null)
  }
  children(i: number): number[] {
    const out: number[] = []
    this.people.forEach((p, j) => {
      if (p.father === i || p.mother === i) out.push(j)
    })
    return out
  }
  siblings(i: number): number[] {
    const me = this.people[i]
    if (me.father === null || me.mother === null) return []
    const out: number[] = []
    this.people.forEach((p, j) => {
      if (j !== i && p.father === me.father && p.mother === me.mother) out.push(j)
    })
    return out
  }
  spouseOf(i: number): number | null {
    return this.people[i].spouse
  }
}

function ensureParents(t: Tree, i: number) {
  const p = t.people[i]
  if (p.father !== null && p.mother !== null) return
  const f = t.add(true)
  const m = t.add(false)
  t.marry(f, m)
  p.father = f
  p.mother = m
}

function ensureSpouse(t: Tree, i: number): number {
  const s = t.people[i].spouse
  if (s !== null) return s
  const n = t.add(!t.people[i].male)
  t.marry(i, n)
  return n
}

// ---------- naming a relation (b is a's ___) ----------

function relationName(t: Tree, a: number, b: number): string | null {
  if (a === b) return null
  const P = t.people
  const A = P[a]
  const B = P[b]
  if (B.male === null) return null
  const male = B.male
  const g = (m: string, f: string) => (male ? m : f)
  if (A.father === b) return 'Father'
  if (A.mother === b) return 'Mother'
  if (t.children(a).includes(b)) return g('Son', 'Daughter')
  if (t.siblings(a).includes(b)) return g('Brother', 'Sister')
  if (A.spouse === b) return g('Husband', 'Wife')
  // grandparents / great-grandparents
  for (const [side, p] of [['Paternal', A.father], ['Maternal', A.mother]] as [string, number | null][]) {
    if (p === null) continue
    if (t.parents(p).includes(b)) return `${side} ${g('grandfather', 'grandmother')}`
    for (const gp of t.parents(p)) if (t.parents(gp).includes(b)) return g('Great-grandfather', 'Great-grandmother')
  }
  // grandchildren / great-grandchildren
  for (const c of t.children(a)) {
    if (t.children(c).includes(b)) return g('Grandson', 'Granddaughter')
    for (const gc of t.children(c)) if (t.children(gc).includes(b)) return g('Great-grandson', 'Great-granddaughter')
  }
  // uncles and aunts (blood), and their children
  for (const [side, p] of [['Paternal', A.father], ['Maternal', A.mother]] as [string, number | null][]) {
    if (p === null) continue
    for (const s of t.siblings(p)) {
      if (s === b) return `${side} ${g('uncle', 'aunt')}`
      if (t.children(s).includes(b)) return 'Cousin'
    }
  }
  // nephews and nieces
  for (const s of t.siblings(a)) if (t.children(s).includes(b)) return g('Nephew', 'Niece')
  // in-laws
  const sp = A.spouse
  if (sp !== null) {
    if (t.parents(sp).includes(b)) return g('Father-in-law', 'Mother-in-law')
    if (t.siblings(sp).includes(b)) return g('Brother-in-law', 'Sister-in-law')
  }
  for (const c of t.children(a)) if (P[c].spouse === b) return g('Son-in-law', 'Daughter-in-law')
  for (const s of t.siblings(a)) if (P[s].spouse === b) return g('Brother-in-law', 'Sister-in-law')
  return null
}

const ALL_RELATIONS = [
  'Father', 'Mother', 'Son', 'Daughter', 'Brother', 'Sister', 'Husband', 'Wife',
  'Paternal grandfather', 'Paternal grandmother', 'Maternal grandfather', 'Maternal grandmother',
  'Grandson', 'Granddaughter', 'Paternal uncle', 'Maternal uncle', 'Paternal aunt', 'Maternal aunt',
  'Nephew', 'Niece', 'Cousin', 'Father-in-law', 'Mother-in-law', 'Son-in-law', 'Daughter-in-law',
  'Brother-in-law', 'Sister-in-law', 'Great-grandfather', 'Great-grandmother', 'Great-grandson', 'Great-granddaughter',
]
const MALE_WORDS = /\b(father|son|brother|husband|grandfather|grandson|uncle|nephew|great-grandfather|great-grandson)\b|father-in-law|son-in-law|brother-in-law/i

/** Four plausible wrong answers: same family of words, same gender, near generations. */
function relationOptions(correct: string): string[] {
  const tokens = (s: string) => s.toLowerCase().split(/[\s-]+/)
  const maleOf = (s: string) => MALE_WORDS.test(s)
  const scored = ALL_RELATIONS.filter((r) => r !== correct).map((r) => {
    const shared = tokens(r).filter((w) => tokens(correct).includes(w)).length
    return { r, score: shared * 3 + (maleOf(r) === maleOf(correct) ? 1.5 : 0) + Math.random() * 2.5 }
  })
  scored.sort((a, b) => b.score - a.score)
  return shuffle([correct, ...scored.slice(0, 4).map((s) => s.r)])
}

// ---------- paths of relations (pointing + coded puzzles) ----------

type Kind = 'up' | 'down' | 'sib' | 'sp'
interface Step {
  kind: Kind
  male: boolean // gender of the person the step leads to
}
const stepWord = (s: Step) => {
  if (s.kind === 'up') return s.male ? 'father' : 'mother'
  if (s.kind === 'down') return s.male ? 'son' : 'daughter'
  if (s.kind === 'sib') return s.male ? 'brother' : 'sister'
  return s.male ? 'husband' : 'wife'
}
const stepKey = (s: Step) => `${s.kind}-${s.male ? 'm' : 'f'}`

const ALL_STEPS: Step[] = (['up', 'down', 'sib', 'sp'] as Kind[]).flatMap((kind) => [true, false].map((male) => ({ kind, male })))

const rnd = (n: number) => Math.floor(Math.random() * n)
const chance = (p: number) => Math.random() < p
const pick = <T,>(a: T[]): T => a[rnd(a.length)]

interface BuiltPath {
  tree: Tree
  nodes: number[] // nodes[0] is the starting person
  steps: Step[]
}

function applyStep(t: Tree, cur: number, s: Step): number {
  if (s.kind === 'up') {
    ensureParents(t, cur)
    return s.male ? t.people[cur].father! : t.people[cur].mother!
  }
  if (s.kind === 'sp') return ensureSpouse(t, cur)
  if (s.kind === 'sib') {
    ensureParents(t, cur)
    const n = t.add(s.male)
    t.people[n].father = t.people[cur].father
    t.people[n].mother = t.people[cur].mother
    return n
  }
  const sp = ensureSpouse(t, cur)
  const n = t.add(s.male)
  if (t.people[cur].male) {
    t.people[n].father = cur
    t.people[n].mother = sp
  } else {
    t.people[n].mother = cur
    t.people[n].father = sp
  }
  return n
}

/**
 * Random chain of relations from a starting person. `allowed` limits which relation words may be used (coded
 * puzzles). Steps that would leave the answer ambiguous are never offered.
 */
function buildPath(len: number, startMale: boolean | null, allowed: Set<string> | null, spouseOk: boolean): BuiltPath | null {
  const t = new Tree()
  const start = t.add(startMale)
  const nodes = [start]
  const steps: Step[] = []
  for (let i = 0; i < len; i++) {
    const cur = nodes[nodes.length - 1]
    const g = t.people[cur].male
    const prev = steps[steps.length - 1]
    const options = ALL_STEPS.filter((s) => {
      if (allowed && !allowed.has(stepKey(s))) return false
      if (s.kind === 'sp') {
        if (!spouseOk || prev?.kind === 'sp') return false
        if (g !== null && s.male === g) return false // a husband needs a wife and vice-versa
      }
      if (s.kind === 'up') {
        if (prev?.kind === 'down') return false
        // with an unknown starting gender, a parent of a child of the start could be the start or the start's spouse
        const p = t.people[cur]
        if (t.people[start].male === null && (p.father === start || p.mother === start)) return false
      }
      if (s.kind === 'down') {
        if (prev?.kind === 'sp') return false
        // "my father's son" could be me (or anyone already in the chain): refuse when such a child of that gender exists
        if (t.children(cur).some((k) => t.people[k].male === null || t.people[k].male === s.male)) return false
      }
      if (s.kind === 'sib') {
        if (prev?.kind === 'sib') return false
        // likewise "his sister" could be the person we already met
        if (t.siblings(cur).some((k) => t.people[k].male === null || t.people[k].male === s.male)) return false
      }
      return true
    })
    if (options.length === 0) return null
    // keep generation changes frequent and spouse steps rarer than blood links
    const weighted = options.flatMap((s) => Array(s.kind === 'sp' ? 1 : s.kind === 'up' ? 3 : 2).fill(s) as Step[])
    const s = pick(weighted)
    if (s.kind === 'sp' && g === null) t.people[cur].male = !s.male
    nodes.push(applyStep(t, cur, s))
    steps.push(s)
  }
  return { tree: t, nodes, steps }
}

// ---------- names ----------

const MALE_NAMES = ['Arun', 'Bhaskar', 'Chetan', 'Deepak', 'Eshan', 'Farhan', 'Gopal', 'Harish', 'Imran', 'Jatin', 'Lokesh', 'Manoj', 'Naveen', 'Omkar', 'Pranav', 'Rakesh', 'Suresh', 'Tarun', 'Vikram', 'Yash']
const FEMALE_NAMES = ['Anita', 'Bhavna', 'Charu', 'Divya', 'Esha', 'Farah', 'Geeta', 'Hema', 'Indu', 'Jaya', 'Kavita', 'Lata', 'Meera', 'Neha', 'Pooja', 'Rekha', 'Sonia', 'Tina', 'Uma', 'Vidya']

// ---------- chain wording ----------

function possessive(m: boolean) {
  return m ? 'his' : 'her'
}

/** "Rohan's father → his brother → his wife → her son" */
function chainText(steps: Step[], startLabel: string): string {
  const parts: string[] = []
  steps.forEach((s, i) => {
    const prevMale = i === 0 ? null : steps[i - 1].male
    const owner = i === 0 ? `${startLabel}'s` : possessive(prevMale!)
    parts.push(`${owner} ${stepWord(s)}`)
  })
  return parts.join(' → ')
}

// ---------- Pointing ----------

type Level = 'easy' | 'medium' | 'hard'

const POINT_LEN: Record<Level, [number, number]> = { easy: [2, 3], medium: [3, 4], hard: [4, 5] }

function pointingStatement(steps: Step[], onlyFlags: boolean[]): string {
  const words = steps.map((s, i) => (onlyFlags[i] ? `only ${stepWord(s)}` : stepWord(s)))
  const n = steps.length
  const target = steps[n - 1].male ? 'He' : 'She'
  if (n === 1) return `${target} is my ${words[0]}.`
  if (chance(0.5)) {
    // possessive chain: "the son of my father's brother's wife"
    const chain = words.slice(0, n - 1).map((w, i) => (i === 0 ? `my ${w}` : `${w}`)).join("'s ")
    return `${target} is the ${words[n - 1]} of ${chain}.`
  }
  // nested chain: "the son of the wife of the brother of my father"
  let text = `my ${words[0]}`
  for (let i = 1; i < n; i++) text = `the ${words[i]} of ${text}`
  return `${target} is ${text}.`.replace(/^(He|She) is the/, `${target} is the`)
}

/** Which steps could honestly say "only": no other person of that gender hangs off the same parent in the tree. */
function onlyFlags(path: BuiltPath): boolean[] {
  return path.steps.map((s, i) => {
    if (i === 0 && s.kind === 'down') return false
    const from = path.nodes[i]
    const to = path.nodes[i + 1]
    if (s.kind === 'down') return isOnly(path.tree, path.tree.children(from), s.male, to)
    if (s.kind === 'sib') return isOnly(path.tree, path.tree.siblings(from), s.male, to)
    return false
  })
}
function isOnly(t: Tree, list: number[], male: boolean, me: number): boolean {
  return list.filter((x) => t.people[x].male === male).length === 1 && list.includes(me)
}

function buildPointing(level: Level): MCQQuestion | null {
  const [lo, hi] = POINT_LEN[level]
  const len = lo + rnd(hi - lo + 1)
  const speakerMale = chance(0.5)
  const path = buildPath(len, speakerMale, null, level !== 'easy')
  if (!path) return null
  if (level === 'hard' && !path.steps.some((s) => s.kind === 'sp')) return null
  const target = path.nodes[path.nodes.length - 1]
  const answer = relationName(path.tree, path.nodes[0], target)
  if (!answer) return null
  // an answer that is just the last word (e.g. "son") teaches nothing in the harder levels
  if (level !== 'easy' && ['Father', 'Mother', 'Son', 'Daughter', 'Husband', 'Wife', 'Brother', 'Sister'].includes(answer) && chance(0.7)) return null
  const speaker = pick(speakerMale ? MALE_NAMES : FEMALE_NAMES)
  const flags = level === 'easy' ? path.steps.map(() => false) : onlyFlags(path).map((f) => f && chance(0.35))
  const targetMale = path.steps[path.steps.length - 1].male
  const intros = targetMale ? ['Pointing to a man', 'Pointing to a man in a photograph', 'Looking at a man'] : ['Pointing to a woman', 'Pointing to a woman in a photograph', 'Looking at a woman']
  const statement = pointingStatement(path.steps, flags)
  const said = `${pick(intros)}, ${speaker} said, “${statement}”`
  const options = relationOptions(answer)
  const chain = chainText(path.steps, speaker)
  const noun = targetMale ? 'man' : 'woman'
  return {
    id: `br-p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    instruction: `Blood relations · ${level}`,
    context: said,
    term: `How is the ${noun} related to ${speaker}?`,
    correctMeaning: answer,
    options,
    hint: 'Start from the speaker and follow the relations one at a time, writing down each person (and their gender) as you go.',
    explanation: `${chain}.\nSo the ${noun} is ${speaker}'s ${answer.toLowerCase()}.`,
  }
}

// ---------- Coded relations ----------

const SYMBOLS = ['+', '−', '×', '÷', '@', '$', '#', '%', '&', '*', '©', 'Δ']
const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'J', 'K', 'L', 'M', 'N', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W']

const CODED_STEPS: Record<Level, [number, number]> = { easy: [2, 2], medium: [3, 3], hard: [4, 5] }
const ROLE_COUNT: Record<Level, number> = { easy: 4, medium: 5, hard: 6 }

function buildCoded(level: Level): MCQQuestion | null {
  const [lo, hi] = CODED_STEPS[level]
  const len = lo + rnd(hi - lo + 1)
  // the roles used in this question (each gets its own symbol); include a spouse role from the medium level on
  const pool = shuffle(ALL_STEPS.filter((s) => (level === 'easy' ? s.kind !== 'sp' : true)))
  const roles = pool.slice(0, ROLE_COUNT[level])
  const allowed = new Set(roles.map(stepKey))
  const path = buildPath(len, null, allowed, level !== 'easy')
  if (!path) return null
  if (level === 'hard' && !path.steps.some((s) => s.kind === 'sp')) return null
  const letters = shuffle(LETTERS).slice(0, len + 1)
  const symbols = shuffle(SYMBOLS).slice(0, roles.length)
  const symbolFor = new Map(roles.map((r, i) => [stepKey(r), symbols[i]]))
  // path runs from the LAST letter back to the first: nodes[0] = last letter
  const n = len
  const letterOf = (nodeIdx: number) => letters[n - nodeIdx]
  const expr: string[] = []
  for (let i = 0; i <= n; i++) {
    expr.push(letterOf(n - i)) // left to right: first letter = nodes[n]
    if (i < n) expr.push(symbolFor.get(stepKey(path.steps[n - 1 - i]))!)
  }
  const name = relationName(path.tree, path.nodes[0], path.nodes[n])
  if (!name) return null
  if (level !== 'easy' && ['Father', 'Mother', 'Son', 'Daughter', 'Husband', 'Wife', 'Brother', 'Sister'].includes(name) && chance(0.7)) return null
  const meaning = roles
    .map((r) => `P ${symbolFor.get(stepKey(r))} Q means P is the ${stepWord(r)} of Q`)
    .join('\n')
  const lines: string[] = []
  for (let i = 0; i < n; i++) {
    const s = path.steps[n - 1 - i]
    lines.push(`${letterOf(n - i)} ${symbolFor.get(stepKey(s))} ${letterOf(n - i - 1)} → ${letterOf(n - i)} is the ${stepWord(s)} of ${letterOf(n - i - 1)}`)
  }
  const fromEnd = chainText(path.steps, letterOf(0))
  const L0 = letterOf(n)
  const Ln = letterOf(0)
  return {
    id: `br-c-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    instruction: `Blood relations · coded · ${level}`,
    context: `${meaning}`,
    term: `In “${expr.join(' ')}”, how is ${L0} related to ${Ln}?`,
    correctMeaning: name,
    options: relationOptions(name),
    hint: `Decode each symbol, then start from ${Ln} and walk back through the chain one relation at a time.`,
    explanation: `${lines.join('\n')}\nFrom ${Ln}: ${fromEnd}.\nSo ${L0} is ${Ln}'s ${name.toLowerCase()}.`,
  }
}

// ---------- Family puzzles ----------

const FAMILY_SIZE: Record<Level, number> = { easy: 6, medium: 8, hard: 10 }

interface Family {
  tree: Tree
  names: string[]
  statements: string[]
}

function makeFamily(level: Level): Family {
  const size = FAMILY_SIZE[level]
  const t = new Tree()
  const f0 = t.add(true)
  const m0 = t.add(false)
  t.marry(f0, m0)
  const couples: [number, number][] = [[f0, m0]]
  const queue: [number, number][] = [[f0, m0]]
  const childrenOf = new Map<string, number[]>()
  while (queue.length && t.people.length < size) {
    const [f, m] = queue.shift()!
    const kids = 1 + rnd(3)
    const list: number[] = []
    for (let k = 0; k < kids && t.people.length < size; k++) {
      const c = t.add(chance(0.5))
      t.people[c].father = f
      t.people[c].mother = m
      list.push(c)
    }
    childrenOf.set(`${f}-${m}`, list)
    for (const c of list) {
      if (t.people.length >= size - 1) continue
      if (chance(0.7)) {
        const sp = t.add(!t.people[c].male)
        t.marry(c, sp)
        const couple: [number, number] = t.people[c].male ? [c, sp] : [sp, c]
        couples.push(couple)
        queue.push(couple)
      }
    }
  }
  // names
  const mn = shuffle(MALE_NAMES)
  const fn = shuffle(FEMALE_NAMES)
  const names = t.people.map((p) => (p.male ? mn.pop()! : fn.pop()!))
  const stmts: string[] = []
  for (const [f, m] of couples) {
    stmts.push(chance(0.5) ? `${names[f]} is the husband of ${names[m]}.` : `${names[m]} is the wife of ${names[f]}.`)
    const kids = childrenOf.get(`${f}-${m}`) ?? []
    kids.forEach((c, i) => {
      const role = t.people[c].male ? 'son' : 'daughter'
      const sibRole = t.people[c].male ? 'brother' : 'sister'
      if (i > 0 && level === 'hard' && chance(0.6)) {
        stmts.push(`${names[c]} is the ${sibRole} of ${names[kids[rnd(i)]]}.`)
      } else {
        stmts.push(`${names[c]} is the ${role} of ${names[chance(0.5) ? f : m]}.`)
      }
    })
  }
  return { tree: t, names, statements: level === 'easy' ? stmts : shuffle(stmts) }
}

interface Hop {
  role: string
  to: number
}

/** Shortest chain of single relations (father, wife, brother, …) from one person to another. */
function findPath(t: Tree, from: number, to: number): Hop[] {
  const prev = new Map<number, { from: number; role: string }>()
  const seen = new Set([from])
  const q = [from]
  while (q.length) {
    const cur = q.shift()!
    if (cur === to) break
    const p = t.people[cur]
    const next: [number, string][] = []
    if (p.father !== null) next.push([p.father, 'father'])
    if (p.mother !== null) next.push([p.mother, 'mother'])
    if (p.spouse !== null) next.push([p.spouse, t.people[p.spouse].male ? 'husband' : 'wife'])
    for (const c of t.children(cur)) next.push([c, t.people[c].male ? 'son' : 'daughter'])
    for (const s of t.siblings(cur)) next.push([s, t.people[s].male ? 'brother' : 'sister'])
    for (const [n, role] of next) {
      if (seen.has(n)) continue
      seen.add(n)
      prev.set(n, { from: cur, role })
      q.push(n)
    }
  }
  const hops: Hop[] = []
  for (let c = to; c !== from; ) {
    const e = prev.get(c)
    if (!e) return []
    hops.unshift({ role: e.role, to: c })
    c = e.from
  }
  return hops
}

const SIMPLE = new Set(['Father', 'Mother', 'Son', 'Daughter', 'Husband', 'Wife', 'Brother', 'Sister'])

function buildFamilySet(level: Level, questions: number): MCQQuestion[] | null {
  const fam = makeFamily(level)
  const { tree: t, names } = fam
  const n = t.people.length
  const minSize = FAMILY_SIZE[level] - 1
  if (n < minSize) return null
  const nameOf = (i: number) => names[i]
  const context = `Read the family details:\n${fam.statements.join('\n')}`
  const out: MCQQuestion[] = []
  const used = new Set<string>()
  const setId = Math.random().toString(36).slice(2, 7)
  let attempts = 0
  while (out.length < questions && attempts < 200) {
    attempts++
    const askWho = chance(level === 'easy' ? 0.25 : 0.45)
    if (!askWho) {
      const x = rnd(n)
      const y = rnd(n)
      const rel = relationName(t, y, x) // x is y's ___
      if (!rel || used.has(`${x}-${y}`)) continue
      if (level !== 'easy' && SIMPLE.has(rel) && chance(0.8)) continue
      used.add(`${x}-${y}`)
      const hops = findPath(t, y, x)
      const chain = hops.map((h, i) => `${i === 0 ? nameOf(y) : nameOf(hops[i - 1].to)}'s ${h.role} is ${nameOf(h.to)}`).join('; ')
      out.push({
        id: `br-f-${setId}-${out.length}`,
        instruction: `Blood relations · family · ${level}`,
        context,
        term: `How is ${nameOf(x)} related to ${nameOf(y)}?`,
        correctMeaning: rel,
        options: relationOptions(rel),
        hint: 'Sketch the family tree from the statements first — couples side by side, children below.',
        explanation: `${chain}.\nSo ${nameOf(x)} is ${nameOf(y)}'s ${rel.toLowerCase()}.`,
      })
    } else {
      const y = rnd(n)
      const byRel = new Map<string, number[]>()
      for (let x = 0; x < n; x++) {
        const rel = relationName(t, y, x)
        if (!rel) continue
        byRel.set(rel, [...(byRel.get(rel) ?? []), x])
      }
      const unique = [...byRel.entries()].filter(([rel, xs]) => xs.length === 1 && (level === 'easy' || !SIMPLE.has(rel)))
      if (!unique.length) continue
      const [rel, [x]] = pick(unique)
      if (used.has(`who-${rel}-${y}`)) continue
      used.add(`who-${rel}-${y}`)
      const hops = findPath(t, y, x)
      const chain = hops.map((h, i) => `${i === 0 ? nameOf(y) : nameOf(hops[i - 1].to)}'s ${h.role} is ${nameOf(h.to)}`).join('; ')
      const others = shuffle(names.map((_, i) => i).filter((i) => i !== x && i !== y))
      const optionIdx = shuffle([x, ...others.slice(0, 4)])
      if (optionIdx.length < 5) continue
      out.push({
        id: `br-f-${setId}-${out.length}`,
        instruction: `Blood relations · family · ${level}`,
        context,
        term: `Who is the ${rel.toLowerCase()} of ${nameOf(y)}?`,
        correctMeaning: nameOf(x),
        options: optionIdx.map(nameOf),
        hint: 'Build the tree, then count the steps from the named person.',
        explanation: `${chain}.\nSo ${nameOf(x)} is ${nameOf(y)}'s ${rel.toLowerCase()}.`,
      })
    }
  }
  return out.length === questions ? out : null
}

// ---------- entry point ----------

export function generateBloodRelationQuestions(difficulty: BloodDifficulty, type: BloodType, count: number): MCQQuestion[] {
  const out: MCQQuestion[] = []
  let guard = 0
  while (out.length < count && guard < count * 60) {
    guard++
    const level: Level = difficulty === 'mixed' ? (['easy', 'medium', 'hard'] as Level[])[out.length % 3] : difficulty
    const kind = type === 'mixed' ? pick(['pointing', 'pointing', 'coded', 'family']) : type
    if (kind === 'family') {
      const want = Math.min(3, count - out.length)
      const set = buildFamilySet(level, want)
      if (set) out.push(...set)
    } else {
      const q = kind === 'pointing' ? buildPointing(level) : buildCoded(level)
      if (q) out.push(q)
    }
  }
  return out.slice(0, count)
}
