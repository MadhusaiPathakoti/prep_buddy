import { shuffle, type MCQQuestion } from './generators'

export type CodingDifficulty = 'easy' | 'medium' | 'hard' | 'mixed'
export type CodingDirection = 'word-to-code' | 'code-to-word' | 'mixed'

type ConcreteDifficulty = Exclude<CodingDifficulty, 'mixed'>

// ---------------------------------------------------------------------------------------------
// The deduction engine
//
// Every coded statement says "this set of words is coded as this set of codes" (in scrambled
// order, so position tells you nothing). With one distinct code per word, two such facts can be
// combined exactly:
//   - words and codes COMMON to both facts match each other (intersection), and
//   - what is left of one fact once the other is removed matches too (difference).
// Both rules are sound for any one-to-one coding, so a word the engine pins down is *forced* by
// the statements — never a guess — and the number of rounds it takes is a measure of difficulty.
// ---------------------------------------------------------------------------------------------

interface Fact {
  /** Bitmask over word indices. */
  words: number
  /** Bitmask over code indices. */
  codes: number
  /** 0 for a given statement, otherwise the round in which it was first derived. */
  level: number
  /** How a derived fact was built: indices of the two parent facts. */
  parents: [number, number] | null
  op: 'intersection' | 'difference' | null
}

const MAX_FACTS = 300
const MAX_ROUNDS = 5

function popcount(n: number): number {
  let count = 0
  for (let x = n; x !== 0; x &= x - 1) count++
  return count
}

function bitIndex(mask: number): number {
  return 31 - Math.clz32(mask)
}

/** Derives every fact reachable from the statements by repeated intersection and difference. */
function deriveFacts(statements: { words: number; codes: number }[]): Fact[] {
  const facts: Fact[] = statements.map((s) => ({ ...s, level: 0, parents: null, op: null }))
  // Masks stay under 2^12 (at most 12 words), so a pair fits one number — much cheaper than a string key.
  const keyOf = (words: number, codes: number) => words * 4096 + codes
  const seen = new Set(facts.map((f) => keyOf(f.words, f.codes)))
  let frontier = facts.map((_, i) => i)

  for (let round = 1; frontier.length > 0 && facts.length < MAX_FACTS && round <= MAX_ROUNDS; round++) {
    const inFrontier = new Set(frontier)
    const added: number[] = []
    const consider = (words: number, codes: number, parents: [number, number], op: 'intersection' | 'difference') => {
      // A valid fact always pairs equally many words and codes; anything else can't be used.
      if (words === 0 || codes === 0 || popcount(words) !== popcount(codes)) return
      const key = keyOf(words, codes)
      if (seen.has(key) || facts.length >= MAX_FACTS) return
      seen.add(key)
      facts.push({ words, codes, level: round, parents, op })
      added.push(facts.length - 1)
    }
    const knownBefore = facts.length
    for (const a of frontier) {
      for (let b = 0; b < knownBefore; b++) {
        if (a === b) continue
        const A = facts[a]
        const B = facts[b]
        // When both are in the frontier, only look at the pair once.
        if (inFrontier.has(b) && b < a) continue
        consider(A.words & B.words, A.codes & B.codes, [a, b], 'intersection')
        consider(A.words & ~B.words, A.codes & ~B.codes, [a, b], 'difference')
        consider(B.words & ~A.words, B.codes & ~A.codes, [b, a], 'difference')
      }
    }
    frontier = added
  }
  return facts
}

// ---------------------------------------------------------------------------------------------
// Vocabulary
// ---------------------------------------------------------------------------------------------

const PRONOUNS_AND_LINKS = ['he', 'she', 'we', 'they', 'is', 'are']

/** Themed word lists, so a statement reads as something close to a sentence. Each starts with the shared pronoun/link words. */
const THEMES: string[][] = [
  [...PRONOUNS_AND_LINKS, 'play', 'playing', 'board', 'game', 'chess', 'team', 'having', 'winning', 'match'],
  [...PRONOUNS_AND_LINKS, 'eat', 'eating', 'fruit', 'apple', 'mango', 'sweet', 'fresh', 'buy', 'basket'],
  [...PRONOUNS_AND_LINKS, 'read', 'reading', 'book', 'story', 'school', 'good', 'write', 'writing', 'class'],
  [...PRONOUNS_AND_LINKS, 'drive', 'driving', 'car', 'bus', 'road', 'fast', 'slow', 'long', 'journey'],
  [...PRONOUNS_AND_LINKS, 'grow', 'growing', 'garden', 'flower', 'green', 'water', 'plant', 'tall', 'seed'],
  [...PRONOUNS_AND_LINKS, 'sing', 'singing', 'song', 'music', 'dance', 'loud', 'stage', 'learn', 'show'],
  [...PRONOUNS_AND_LINKS, 'cook', 'cooking', 'rice', 'soup', 'hot', 'kitchen', 'serve', 'tasty', 'bread'],
  [...PRONOUNS_AND_LINKS, 'build', 'building', 'house', 'wall', 'brick', 'strong', 'paint', 'new', 'roof'],
]

const CONSONANTS = 'bcdfghjklmnprstvz'
const VOWELS = 'aeiou'

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function pick<T>(arr: readonly T[]): T {
  return arr[randInt(0, arr.length - 1)]
}

function randomCode(): string {
  const c = () => pick([...CONSONANTS])
  const v = () => pick([...VOWELS])
  // Mix of consonant-vowel-consonant, vowel-consonant-vowel and plain consonant triples, like the exam's "ter", "ari", "jkl".
  const shape = randInt(0, 5)
  if (shape <= 3) return `${c()}${v()}${c()}`
  if (shape === 4) return `${v()}${c()}${v()}`
  return `${c()}${c()}${c()}`
}

function uniqueCodes(count: number, forbidden: Set<string>): string[] {
  const codes = new Set<string>()
  while (codes.size < count) {
    const code = randomCode()
    if (!forbidden.has(code)) codes.add(code)
  }
  return [...codes]
}

// ---------------------------------------------------------------------------------------------
// Puzzle sets
// ---------------------------------------------------------------------------------------------

interface Shape {
  statements: number
  wordsPerStatement: number
  vocabulary: number
  /** Questions per puzzle set. */
  questions: number
  /** A question must need at least this many derivation rounds... */
  minRounds: number
  /** ...and at most this many. */
  maxRounds: number
  /** Whether to ask about the shallowest eligible words first (easier) or the deepest (harder). */
  deepestFirst: boolean
  /** If set, at least one eligible word must need this many rounds, so the set contains a genuinely deep chain. */
  deepestAtLeast?: number
}

const SHAPES: Record<ConcreteDifficulty, Shape> = {
  easy: { statements: 3, wordsPerStatement: 3, vocabulary: 6, questions: 3, minRounds: 1, maxRounds: 2, deepestFirst: false },
  medium: { statements: 4, wordsPerStatement: 4, vocabulary: 9, questions: 4, minRounds: 2, maxRounds: 3, deepestFirst: false },
  hard: { statements: 5, wordsPerStatement: 5, vocabulary: 11, questions: 4, minRounds: 2, maxRounds: 5, deepestFirst: true, deepestAtLeast: 3 },
}

const MAX_PUZZLE_ATTEMPTS = 400

interface Puzzle {
  id: string
  words: string[]
  /** codes[i] is the code of words[i]. */
  codes: string[]
  /** Each statement as the indices of the words it contains. */
  statements: number[][]
  /** Each statement's codes, scrambled so position carries no information. */
  statementCodes: string[][]
  facts: Fact[]
  /** For each word index the engine can pin down: the fact that pins it and its round. */
  solved: Map<number, { factIndex: number; level: number }>
}

function toMask(indices: number[]): number {
  return indices.reduce((mask, i) => mask | (1 << i), 0)
}

function tryBuildPuzzle(shape: Shape): Puzzle | null {
  const theme = pick(THEMES)
  const vocabularyWords = shuffle(theme).slice(0, shape.vocabulary)

  // Every word must appear somewhere, or it couldn't be asked about.
  const statements = Array.from({ length: shape.statements }, () =>
    shuffle(Array.from({ length: shape.vocabulary }, (_, i) => i)).slice(0, shape.wordsPerStatement),
  )
  const used = new Set(statements.flat())
  if (used.size !== shape.vocabulary) return null

  const forbidden = new Set(vocabularyWords)
  const codes = uniqueCodes(shape.vocabulary, forbidden)

  const facts = deriveFacts(
    statements.map((indices) => ({ words: toMask(indices), codes: toMask(indices) })),
  )
  // `deriveFacts` works on masks over *code identities*; here code i belongs to word i, so a
  // statement's word mask and code mask coincide. Scrambling happens only when the statement is displayed.

  const solved = new Map<number, { factIndex: number; level: number }>()
  facts.forEach((fact, factIndex) => {
    if (popcount(fact.words) === 1 && fact.level > 0) {
      const wordIndex = bitIndex(fact.words)
      const previous = solved.get(wordIndex)
      if (!previous || fact.level < previous.level) solved.set(wordIndex, { factIndex, level: fact.level })
    }
  })

  const eligible = [...solved.values()].filter((s) => s.level >= shape.minRounds && s.level <= shape.maxRounds)
  if (eligible.length < shape.questions) return null
  if (shape.deepestAtLeast !== undefined && Math.max(...eligible.map((e) => e.level)) < shape.deepestAtLeast) return null

  return {
    id: Math.random().toString(36).slice(2, 8),
    words: vocabularyWords,
    codes,
    statements,
    statementCodes: statements.map((indices) => shuffle(indices.map((i) => codes[i]))),
    facts,
    solved,
  }
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

function statementText(puzzle: Puzzle, statementIndex: number): string {
  // Words are shown in a shuffled order too, so a statement doesn't read left to right in vocabulary order.
  const words = puzzle.statements[statementIndex].map((i) => puzzle.words[i])
  return `${capitalize(words.join(' '))} is coded as ${puzzle.statementCodes[statementIndex].join(' ')}`
}

function describeSet(puzzle: Puzzle, wordMask: number): { words: string; codes: string } {
  const indices = puzzle.words.map((_, i) => i).filter((i) => wordMask & (1 << i))
  return { words: indices.map((i) => puzzle.words[i]).join(', '), codes: indices.map((i) => puzzle.codes[i]).join(', ') }
}

/** Step-by-step reasoning for the fact that pins a word down, numbering only the derived facts it depends on. */
function explain(puzzle: Puzzle, factIndex: number, answerLine: string): string {
  const needed = new Set<number>()
  const statementsUsed = new Set<number>()
  const visit = (i: number) => {
    const fact = puzzle.facts[i]
    if (!fact.parents) {
      statementsUsed.add(i)
      return
    }
    if (needed.has(i)) return
    needed.add(i)
    visit(fact.parents[0])
    visit(fact.parents[1])
  }
  visit(factIndex)

  const ordered = [...needed].sort((a, b) => a - b)
  const stepNumber = new Map(ordered.map((factId, n) => [factId, n + 1]))
  const nameOf = (i: number) => (puzzle.facts[i].parents ? `Step ${stepNumber.get(i)}` : `statement ${i + 1}`)

  const lines = ordered.map((factId) => {
    const fact = puzzle.facts[factId]
    const [a, b] = fact.parents as [number, number]
    const { words, codes } = describeSet(puzzle, fact.words)
    const single = popcount(fact.words) === 1
    const result = single ? `${words} = ${codes}` : `{${words}} are coded as {${codes}}, in some order`
    const how =
      fact.op === 'intersection'
        ? `${nameOf(a)} and ${nameOf(b)} have these in common`
        : `${nameOf(a)} is left with these once ${nameOf(b)} is taken out`
    return `Step ${stepNumber.get(factId)}: ${how} → ${result}`
  })
  // The review no longer shows the question's statements, so quote the ones the reasoning relies on.
  const used = [...statementsUsed].sort((a, b) => a - b).map((i) => `${i + 1}. ${statementText(puzzle, i)}`)
  return ['Statements used:', ...used, '', ...lines, answerLine].join('\n')
}

// ---------------------------------------------------------------------------------------------
// Questions
// ---------------------------------------------------------------------------------------------

const HINT = 'Look for a word two statements share, and the one code they share — those must match. Then use what is left over.'

function buildQuestion(puzzle: Puzzle, wordIndex: number, direction: 'word-to-code' | 'code-to-word', setNumber: number): MCQQuestion {
  const { factIndex } = puzzle.solved.get(wordIndex)!
  const word = puzzle.words[wordIndex]
  const code = puzzle.codes[wordIndex]

  const context = ['In a certain coded language:', ...puzzle.statements.map((_, i) => `${i + 1}. ${statementText(puzzle, i)}`)].join('\n')

  // Tempting wrong answers come from the statements the target appears in, then the rest of the set.
  const neighbours = new Set<number>()
  puzzle.statements.forEach((indices) => {
    if (indices.includes(wordIndex)) indices.forEach((i) => neighbours.add(i))
  })
  neighbours.delete(wordIndex)
  const others = puzzle.words.map((_, i) => i).filter((i) => i !== wordIndex && !neighbours.has(i))
  const distractorIndices = [...shuffle([...neighbours]), ...shuffle(others)].slice(0, 4)

  const forward = direction === 'word-to-code'
  const options = [wordIndex, ...distractorIndices].map((i) => (forward ? puzzle.codes[i] : puzzle.words[i]))
  const correct = forward ? code : word
  const question = forward ? `What is the code for '${word}'?` : `Which word is coded as '${code}'?`

  return {
    id: `coding-${puzzle.id}-${direction}-${wordIndex}`,
    instruction: `Coded language · set ${setNumber}`,
    context,
    term: question,
    correctMeaning: correct,
    options: shuffle(options),
    hint: HINT,
    explanation: explain(puzzle, factIndex, `So '${word}' is coded as '${code}'.`),
  }
}

function buildSet(difficulty: ConcreteDifficulty, direction: CodingDirection, setNumber: number): MCQQuestion[] | null {
  const shape = SHAPES[difficulty]
  for (let attempt = 0; attempt < MAX_PUZZLE_ATTEMPTS; attempt++) {
    const puzzle = tryBuildPuzzle(shape)
    if (!puzzle) continue
    // Ask about words inside the difficulty's round window, shallowest or deepest first.
    const targets = [...puzzle.solved.entries()]
      .filter(([, s]) => s.level >= shape.minRounds && s.level <= shape.maxRounds)
      .sort((a, b) => (shape.deepestFirst ? b[1].level - a[1].level : a[1].level - b[1].level) || Math.random() - 0.5)
      .slice(0, shape.questions)
      .map(([wordIndex]) => wordIndex)
    return shuffle(targets).map((wordIndex) => {
      const dir = direction === 'mixed' ? pick(['word-to-code', 'code-to-word'] as const) : direction
      return buildQuestion(puzzle, wordIndex, dir, setNumber)
    })
  }
  return null
}

export function generateCodingDecodingQuestions(difficulty: CodingDifficulty, direction: CodingDirection, count: number): MCQQuestion[] {
  const out: MCQQuestion[] = []
  let setNumber = 1
  for (let guard = 0; out.length < count && guard < count * 4; guard++) {
    const d: ConcreteDifficulty = difficulty === 'mixed' ? pick(['easy', 'medium', 'hard'] as const) : difficulty
    const set = buildSet(d, direction, setNumber)
    if (!set) continue
    out.push(...set)
    setNumber += 1
  }
  return out.slice(0, count)
}
