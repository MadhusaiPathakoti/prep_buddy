// Shared contract for the Mocks module. Quant/Reasoning generators (deterministic, code-verified) and
// the English pipeline (Gemini + independent verification) all produce `Group`s of `QuestionDraft`s;
// the paper composer (compose.ts) turns those into a `MockPaper` the test engine runs.

export type MockExamId = 'po' | 'clerk'
/** po = SBI/IBPS PO (hard), clerk = IBPS/SBI Clerk (medium). */
export type MockDifficulty = 'medium' | 'hard'
export type MockSectionId = 'quant' | 'reasoning' | 'english'

export type QuantTopicId =
  | 'simplification'
  | 'approximation'
  | 'wrong-number-series'
  | 'missing-number-series'
  | 'quadratic-equations'
  | 'quantity-comparison'
  | 'di-table'
  | 'di-bar'
  | 'di-pie'
  | 'di-line'
  | 'di-caselet'
  | 'percentage'
  | 'profit-loss'
  | 'ratio-partnership'
  | 'ages-averages'
  | 'interest'
  | 'time-work'
  | 'speed-distance'
  | 'mixture-alligation'
  | 'mensuration'
  | 'probability-pnc'
  | 'number-system'

export type ReasoningTopicId =
  | 'seating-linear'
  | 'seating-circular'
  | 'puzzle-floor'
  | 'puzzle-schedule'
  | 'puzzle-box'
  | 'puzzle-comparison'
  | 'syllogism'
  | 'inequality'
  | 'blood-relation'
  | 'direction-distance'
  | 'coding-decoding'
  | 'sentence-coding'
  | 'alphanumeric-series'
  | 'order-ranking'
  | 'reasoning-misc'

export type EnglishTopicId =
  | 'rc'
  | 'cloze'
  | 'error-detection'
  | 'para-jumble'
  | 'fillers'
  | 'word-swap'
  | 'phrase-replacement'
  | 'match-column'

export type MockTopicId = QuantTopicId | ReasoningTopicId | EnglishTopicId

/** One block of shared content shown beside a question (RC passage, DI table/chart, puzzle statement…). */
export type StimulusPart =
  | { kind: 'text'; heading?: string; paragraphs: string[] }
  | { kind: 'table'; heading?: string; columns: string[]; rows: (string | number)[][]; note?: string }
  | { kind: 'bar'; heading?: string; categories: string[]; series: { name: string; values: number[] }[]; unit?: string; stacked?: boolean }
  | { kind: 'line'; heading?: string; categories: string[]; series: { name: string; values: number[] }[]; unit?: string }
  | { kind: 'pie'; heading?: string; slices: { label: string; value: number }[]; unit?: string }

export interface Stimulus {
  /** Direction line shown above the content, e.g. "Study the following information carefully and answer the questions given below:". */
  directions?: string
  parts: StimulusPart[]
}

/** A question as produced by a generator, before the composer assigns ids/sections. */
export interface QuestionDraft {
  topic: MockTopicId
  /** Plain text (newlines preserved). Keep to Latin-1 plus: − √ ≤ ≥ ≠ ₹ → ∴ (the PDF writer maps these). */
  stem: string
  /** Always exactly 5 distinct options (A–E), as in the real SBI/IBPS papers. */
  options: string[]
  /** 0-based index of the single correct option. */
  answer: number
  /** Short worked solution / reasoning, shown in the solution analysis. */
  explanation: string
}

/** Questions sharing one stimulus (a set), or a single stand-alone question (no stimulus). */
export interface Group {
  stimulus?: Stimulus
  questions: QuestionDraft[]
}

export type TopicGenerator = (rng: import('./rng').Rng, difficulty: MockDifficulty, count: number) => Group[]

/** A question inside a composed paper. */
export interface MockQuestion extends QuestionDraft {
  /** Unique within the paper, e.g. "q-17". */
  id: string
  section: MockSectionId
  /** Present when the question belongs to a set; key into MockPaper.sets. */
  setId?: string
}

export interface MockSection {
  id: MockSectionId
  name: string
  /** Seconds. */
  durationSec: number
  questionIds: string[]
}

export type MockKind = 'full' | 'sectional' | 'topic'

export interface MockPaper {
  id: string
  exam: MockExamId
  kind: MockKind
  title: string
  difficulty: MockDifficulty
  createdAt: string
  /** true: each section has its own timer and can't be revisited (real exam behaviour). false: one overall timer. */
  sectionLocked: boolean
  /** Overall duration in seconds (sum of sections when sectionLocked). */
  totalDurationSec: number
  marksPerQuestion: number
  negativeMarks: number
  sections: MockSection[]
  questions: MockQuestion[]
  sets: Record<string, Stimulus>
}

export interface TopicInfo {
  id: MockTopicId
  section: MockSectionId
  label: string
  /** Short description shown on the topic picker. */
  blurb: string
}
