import type { MCQQuestion } from './generators'
import { createRng, randomSeed, type Rng } from './mocks/rng'

/**
 * Letter Pairs (SBI / IBPS Prelims style word-and-alphabet questions).
 *
 *  - pairs:  how many pairs of letters in a word have as many letters between them in the word as in the English alphabet
 *            (counted either way round, so A…C and C…A both qualify; positions are what is paired, so a repeated letter
 *            makes extra pairs, and two identical letters never qualify)
 *  - which:  the same rule, but pick the one pair that qualifies
 *  - sorted: arrange the letters alphabetically (or Z→A) and count the letters that keep their place
 *
 * Every answer is computed from the word, never typed in; `scripts/verify-letter-pairs.ts` recomputes each one another way.
 */

export type PairDifficulty = 'easy' | 'medium' | 'hard' | 'mixed'
export type PairType = 'mixed' | 'pairs' | 'which' | 'sorted'
type Level = 'easy' | 'medium' | 'hard'

const WORD_BANK = `
PLANET MARKET BRIDGE CASTLE FOREST GARDEN HAMMER ISLAND JUNGLE LADDER MIRROR NATION ORANGE PENCIL SILVER TEMPLE VALLEY WINDOW YELLOW BASKET
CANDLE DINNER ENGINE FABRIC GUITAR HONEST INSECT JACKET KERNEL MONKEY NOODLE OFFICE RABBIT SCHOOL TICKET VOLUME WALLET ARTIST BUTTER DOCTOR
BANKER CREDIT DEBITS ASSETS BONDS CHEQUE LOANS TARIFF RATING PROFIT SALARY PAYEES
CAPITAL CHARITY COMPANY COUNTRY CULTURE DEFENCE DESTINY DIAMOND DISTANT ECONOMY EVENING EXAMPLE FACTORY FASHION FEATURE FREEDOM GALLERY GENERAL
HARVEST HEALTHY HISTORY HOLIDAY HUSBAND IMAGINE JOURNEY KINGDOM LIBRARY MACHINE MESSAGE MILLION MORNING NATURAL NETWORK OBSERVE OPINION PASSAGE
PICTURE PLASTIC PROBLEM QUALITY RAILWAY READING REQUEST SERVICE SILENCE STUDENT SUPPORT SURFACE TEACHER THEATRE THOUGHT TRAFFIC VILLAGE VISITOR
WEATHER WRITING ANCIENT BALANCE BROTHER CLIMATE COMFORT CURRENT EXPERT FOREIGN GARMENT JUSTICE LEADER MEMBER MINUTE MOTHER PERSON POLICE REASON
RECORD SCHEME SECOND SIMPLE SPRING STREET SUDDEN SYSTEM TARGET WONDER ADVANCE BATTERY CABINET CAPTAIN CENTURY CHICKEN COTTAGE DOLPHIN FINANCE
GRAVITY KITCHEN LECTURE MONSTER ORCHARD PACKAGE QUARREL ROCKET SHELTER TONIGHT UNKNOWN VINEGAR WARRIOR
BANKING DEPOSIT LENDING MORTGAGE CURRENCY INTEREST ACCOUNT TREASURY INSURANCE DIVIDEND PENSION CUSTOMER RECEIPT BALANCE REVENUE BUDGET
FINANCIAL ABSOLUTE ACTIVITY ADVOCATE ALTITUDE ANCESTOR BACHELOR BIRTHDAY BOUNDARY BUILDING CALENDAR CHAMPION CHILDREN COMPLETE COMPUTER CONCRETE
CRICKET DAUGHTER DISCOVER DOMESTIC ELEGANT ELEPHANT EMPLOYEE ENDLESS ENTRANCE EVERYONE EXPLORER FESTIVAL FIREWORK FRACTION GENEROUS GOLDFISH HOSPITAL
IDENTITY INSTINCT KEYBOARD LANGUAGE LIGHTING MAGNETIC MARRIAGE MIDNIGHT MOUNTAIN NEIGHBOR NOTEBOOK OPERATOR PAINTING PARLIAMENT PASSPORT PLATFORM
POSITION PRESSURE PRODUCER PROMISE QUESTION REGULAR RESOURCE SCIENTIST SHOULDER SOLUTION STANDARD STRANGER SUNSHINE SWIMMING TEACHING TELEPHONE
TERRIBLE THOUSAND TOMORROW TRIANGLE UMBRELLA UNIVERSE VACATION VEHICLE WARNING WHISPER WILDLIFE WRITTEN YOURSELF
DISTRIBUTE ADVENTURE AIRPLANE ARCHITECT BEAUTIFUL BIRTHPLACE BLUEPRINT BREAKFAST BUSINESSMAN CELEBRATE CHEMISTRY CHOCOLATE COMMUNITY CONSTANT
DANGEROUS DELIVERED DIRECTION DISCOVERY EDUCATION ELECTRIC EVERYBODY EXCELLENT EXERCISE FAVOURITE FRAMEWORK GRATITUDE HAPPINESS HEADLIGHT IMMEDIATE
INDUSTRY KNOWLEDGE LANDSCAPE LIGHTHOUSE MARKETING MATERIAL NOVEMBER OCCASION PAINTBRUSH PRINCIPAL PROBABLE PRODUCTION PROGRAMME QUARTERLY RAINBOW
RESTAURANT SATURDAY SCHEDULE SEPTEMBER SHOPPING STRATEGY STRENGTH SUBSTANCE TEMPERATURE TOGETHER TRADITION TREASURER TRIANGULAR UNIVERSAL VOLUNTEER
WATERFALL WEDNESDAY WORKSHOP YESTERDAY
ACCOUNTANT ADMIRATION ADVERTISING AFTERNOON APPOINTMENT ARRANGEMENT BANKRUPTCY BEGINNING CELEBRATION CHAMPIONSHIP CLASSMATES COMPETITION CONNECTION
CONSIDERATE CORPORATION DEPARTMENT DESCRIPTION DISCUSSION DISTRIBUTION ENTERTAINMENT EQUIVALENT EXPERIENCE FOUNDATION GOVERNMENT IMPORTANCE
INFORMATION INVESTMENT LABORATORY MANAGEMENT NATIONALITY OPPORTUNITY ORGANISATION PERFORMANCE PROFESSIONAL PROGRESSIVE PROSPERITY REPRESENTATIVE
RESPONSIBLE SIGNIFICANT SUBSCRIPTION TELEVISION TRANSACTION TRANSFERRED UNIVERSITY VOCABULARY
`
  .split(/\s+/)
  .filter((w) => /^[A-Z]{5,12}$/.test(w))

const BANK = [...new Set(WORD_BANK)]

const LENGTHS: Record<Level, [number, number]> = { easy: [5, 6], medium: [7, 8], hard: [9, 11] }

export const letterValue = (ch: string) => ch.charCodeAt(0) - 64 // A = 1 … Z = 26

export interface LetterPair {
  /** 0-based positions in the word, i < j */
  i: number
  j: number
  a: string
  b: string
}

/** Every pair of positions whose letters have the same number of letters between them in the word and in the alphabet. */
export function pairsIn(word: string): LetterPair[] {
  const out: LetterPair[] = []
  for (let i = 0; i < word.length; i++) {
    for (let j = i + 1; j < word.length; j++) {
      if (Math.abs(letterValue(word[i]) - letterValue(word[j])) === j - i) out.push({ i, j, a: word[i], b: word[j] })
    }
  }
  return out
}

/** How many letters keep their place when the word is sorted A→Z (or Z→A). */
export function sortedKeeps(word: string, reverse: boolean): { sorted: string; same: number[] } {
  const letters = word.split('').sort()
  if (reverse) letters.reverse()
  const sorted = letters.join('')
  const same: number[] = []
  for (let i = 0; i < word.length; i++) if (word[i] === sorted[i]) same.push(i)
  return { sorted, same }
}

// ---------- questions ----------

const COUNT_LABELS = ['None', 'One', 'Two', 'Three', 'More than three']
const countOptions = (c: number) => ({ options: COUNT_LABELS.slice(), answer: Math.min(c, 4) })

interface Built {
  term: string
  options: string[]
  answer: number
  hint: string
  explanation: string
}

const spaced = (w: string) => w.split('').join(' ')
const ordinal = (n: number) => {
  const m100 = n % 100
  if (m100 >= 11 && m100 <= 13) return `${n}th`
  return `${n}${({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th'}`
}
const valuesLine = (w: string) => w.split('').map((ch) => `${ch}${letterValue(ch)}`).join(' ')

function buildPairs(rng: Rng, word: string): Built | null {
  const ps = pairsIn(word)
  if (ps.length === 0 && !rng.chance(0.12)) return null
  if (ps.length >= 4 && !rng.chance(0.3)) return null
  const o = countOptions(ps.length)
  const list = ps.length
    ? ps.map((p) => `${p.a}(${ordinal(p.i + 1)})–${p.b}(${ordinal(p.j + 1)}): ${p.j - p.i} apart in the word, ${Math.abs(letterValue(p.a) - letterValue(p.b))} apart in the alphabet`).join('; ')
    : 'none'
  return {
    term: `In the word ${word}, how many pairs of letters have the same number of letters between them as in the English alphabetical series?`,
    ...o,
    hint: 'Write each letter\'s alphabet number under it. A pair qualifies when the difference of the two numbers equals the difference of their places in the word.',
    explanation: `${word} → ${valuesLine(word)}\nQualifying pairs: ${list}. Count = ${ps.length}.`,
  }
}

function buildWhich(rng: Rng, word: string): Built | null {
  const ps = pairsIn(word)
  const key = (a: string, b: string) => [a, b].sort().join('')
  // one answer pair of letters; a repeated letter may make it appear at more than one set of places, which is still the same pair
  if (new Set(ps.map((p) => key(p.a, p.b))).size !== 1) return null
  const good = key(ps[0].a, ps[0].b)
  // wrong options: other pairs from the word; the near misses (off by exactly one) come first because those are the real slips
  const near: string[] = []
  const far: string[] = []
  for (let i = 0; i < word.length; i++) {
    for (let j = i + 1; j < word.length; j++) {
      const k = key(word[i], word[j])
      if (word[i] === word[j] || k === good) continue
      if (pairsIn(word).some((p) => key(p.a, p.b) === k)) continue
      const gap = Math.abs(Math.abs(letterValue(word[i]) - letterValue(word[j])) - (j - i))
      ;(gap === 1 ? near : far).push(k)
    }
  }
  const uniq = (xs: string[]) => [...new Set(xs)]
  const wrong = [...rng.shuffle(uniq(near)).slice(0, 2), ...rng.shuffle(uniq(far).filter((x) => !near.includes(x)))].filter((x, i, a) => a.indexOf(x) === i).slice(0, 4)
  if (wrong.length < 4) return null
  const answer = rng.int(0, 4)
  const options = wrong.slice()
  options.splice(answer, 0, good)
  return {
    term: `Which pair of letters in the word ${word} has the same number of letters between them as in the English alphabetical series?`,
    options,
    answer,
    hint: 'Check one option at a time: its places in the word differ by some number — do its alphabet numbers differ by the same number?',
    explanation: `${word} → ${valuesLine(word)}\n${ps.map((q) => `${q.a} (${ordinal(q.i + 1)}) and ${q.b} (${ordinal(q.j + 1)}): ${q.j - q.i} places apart, alphabet numbers ${letterValue(q.a)} and ${letterValue(q.b)} differ by ${Math.abs(letterValue(q.a) - letterValue(q.b))} too`).join('; ')} — the only pair of letters that matches.`,
  }
}

function buildSorted(rng: Rng, word: string): Built | null {
  const reverse = rng.chance(0.3)
  const { sorted, same } = sortedKeeps(word, reverse)
  if (same.length > 3 || (same.length === 0 && !rng.chance(0.15))) return null
  const o = countOptions(same.length)
  return {
    term: `If the letters of the word ${word} are arranged in ${reverse ? 'reverse alphabetical order (Z to A)' : 'alphabetical order'} from left to right, how many letters will remain at the same position?`,
    ...o,
    hint: 'Write the sorted word right under the original and compare them place by place.',
    explanation: `${word}\n${sorted} (${reverse ? 'Z→A' : 'A→Z'})\nSame place: ${same.length ? same.map((i) => `${word[i]} (${ordinal(i + 1)})`).join(', ') : 'none'}. Count = ${same.length}.`,
  }
}

type Kind = 'pairs' | 'which' | 'sorted'

export interface LetterPairQuestion extends Built {
  kind: Kind
  word: string
}

export function generateLetterPairs(difficulty: PairDifficulty, type: PairType, count: number, rng: Rng = createRng(randomSeed())): LetterPairQuestion[] {
  const out: LetterPairQuestion[] = []
  const used = new Set<string>()
  for (let n = 0; n < count; n++) {
    const level: Level = difficulty === 'mixed' ? (['easy', 'medium', 'hard'] as Level[])[n % 3] : difficulty
    const kind: Kind = type === 'mixed' ? (['pairs', 'pairs', 'which', 'pairs', 'sorted'] as Kind[])[n % 5] : type
    const [lo, hi] = LENGTHS[level]
    const pool = rng.shuffle(BANK.filter((w) => w.length >= lo && w.length <= hi))
    let placed = false
    // prefer words not yet used this session; fall back to repeats only if the bank runs dry
    for (const pass of [0, 1]) {
      for (const w of pool) {
        if (pass === 0 && used.has(w)) continue
        const b = kind === 'pairs' ? buildPairs(rng, w) : kind === 'which' ? buildWhich(rng, w) : buildSorted(rng, w)
        if (!b) continue
        used.add(w)
        out.push({ ...b, kind, word: w })
        placed = true
        break
      }
      if (placed) break
    }
    if (!placed) throw new Error(`letter pairs: could not build a ${kind} question at ${level}`)
  }
  return out
}

export function generateLetterPairQuestions(difficulty: PairDifficulty, type: PairType, count: number): MCQQuestion[] {
  const run = randomSeed().toString(36)
  return generateLetterPairs(difficulty, type, count).map((q, i) => ({
    id: `lp-${run}-${i}`,
    context: spaced(q.word),
    contextBig: true,
    term: q.term,
    termSmall: true,
    correctMeaning: q.options[q.answer],
    options: q.options,
    hint: q.hint,
    explanation: q.explanation,
    noPronounce: true,
  }))
}
