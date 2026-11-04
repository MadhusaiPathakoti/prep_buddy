import type { MockDifficulty, MockExamId, MockSectionId, MockTopicId } from './types'

// Exam patterns and per-section topic mixes. Pattern (IBPS PO / IBPS Clerk / SBI prelims): 100
// questions, 60 minutes, three sections timed at 20 minutes each, 1 mark per question, 0.25 negative.
// The topic mixes follow the shift-wise analyses of the 2025 IBPS PO, IBPS Clerk and SBI PO prelims
// papers: puzzles/seating dominate Reasoning; DI + arithmetic + approximation/series dominate Quant;
// RC, cloze, error detection, para jumbles and fillers make up English. (Some 2025 SBI PO shifts were
// reported with a 40/30/30 English/Reasoning/Quant split, but coaching sources disagree on that, so
// the widely documented 30/35/35 pattern is used for both exams.)

export const MARKS_PER_QUESTION = 1
export const NEGATIVE_MARKS = 0.25

export const ARITHMETIC_POOL: MockTopicId[] = [
  'percentage',
  'profit-loss',
  'ratio-partnership',
  'ages-averages',
  'interest',
  'time-work',
  'speed-distance',
  'mixture-alligation',
  'mensuration',
  'probability-pnc',
  'number-system',
]

export interface BlueprintEntry {
  /** Topics this slice of the paper draws from. */
  topics: MockTopicId[]
  count: number
  /** 'one': the whole slice comes from one topic picked at random from the pool (sets). 'spread': split across the pool. */
  mode: 'one' | 'spread'
}

export interface SectionBlueprint {
  id: MockSectionId
  name: string
  durationSec: number
  entries: BlueprintEntry[]
}

export interface ExamConfig {
  id: MockExamId
  name: string
  shortName: string
  difficulty: MockDifficulty
  tagline: string
  sections: SectionBlueprint[]
}

const one = (topics: MockTopicId[] | MockTopicId, count: number): BlueprintEntry => ({ topics: Array.isArray(topics) ? topics : [topics], count, mode: 'one' })
const spread = (topics: MockTopicId[], count: number): BlueprintEntry => ({ topics, count, mode: 'spread' })

const MIN = 60

export const EXAMS: Record<MockExamId, ExamConfig> = {
  po: {
    id: 'po',
    name: 'SBI / IBPS PO Prelims',
    shortName: 'PO',
    difficulty: 'hard',
    tagline: 'Hard: indirect data, multi-step arithmetic and 8-person puzzles',
    sections: [
      {
        id: 'english',
        name: 'English Language',
        durationSec: 20 * MIN,
        entries: [one('rc', 8), one('cloze', 5), one('word-swap', 4), one('error-detection', 4), one('para-jumble', 4), one('match-column', 2), one('phrase-replacement', 3)],
      },
      {
        id: 'quant',
        name: 'Quantitative Aptitude',
        durationSec: 20 * MIN,
        entries: [
          one('di-table', 5),
          one(['di-bar', 'di-line', 'di-pie', 'di-caselet'], 5),
          one('approximation', 5),
          spread(ARITHMETIC_POOL, 12),
          spread(['quadratic-equations', 'quantity-comparison'], 4),
          one('wrong-number-series', 4),
        ],
      },
      {
        id: 'reasoning',
        name: 'Reasoning Ability',
        durationSec: 20 * MIN,
        entries: [
          one(['seating-linear', 'seating-circular'], 5),
          one('puzzle-floor', 5),
          one('puzzle-schedule', 5),
          one('puzzle-box', 5),
          one('puzzle-comparison', 3),
          one('blood-relation', 3),
          one('syllogism', 3),
          one('direction-distance', 3),
          one('reasoning-misc', 3),
        ],
      },
    ],
  },
  clerk: {
    id: 'clerk',
    name: 'IBPS / SBI Clerk Prelims',
    shortName: 'Clerk',
    difficulty: 'medium',
    tagline: 'Medium: direct data, simplification-heavy Quant and 7–8 person puzzles',
    sections: [
      {
        id: 'english',
        name: 'English Language',
        durationSec: 20 * MIN,
        entries: [one('rc', 9), one('word-swap', 3), one('fillers', 5), one('error-detection', 5), one('para-jumble', 5), one('phrase-replacement', 3)],
      },
      {
        id: 'quant',
        name: 'Numerical Ability',
        durationSec: 20 * MIN,
        entries: [one('simplification', 8), one('approximation', 2), one('missing-number-series', 2), spread(ARITHMETIC_POOL, 13), one('di-table', 5), one('di-bar', 5)],
      },
      {
        id: 'reasoning',
        name: 'Reasoning Ability',
        durationSec: 20 * MIN,
        entries: [
          one(['seating-linear', 'seating-circular'], 5),
          one('puzzle-floor', 5),
          one('puzzle-schedule', 5),
          one('puzzle-comparison', 3),
          one('alphanumeric-series', 5),
          one('syllogism', 3),
          one('sentence-coding', 5),
          one('coding-decoding', 2),
          one('reasoning-misc', 2),
        ],
      },
    ],
  },
}

export function entryTotal(entries: BlueprintEntry[]): number {
  return entries.reduce((n, e) => n + e.count, 0)
}

export function sectionQuestionCount(exam: MockExamId, section: MockSectionId): number {
  const s = EXAMS[exam].sections.find((x) => x.id === section)
  return s ? entryTotal(s.entries) : 0
}

export const SECTION_NAMES: Record<MockExamId, Record<MockSectionId, string>> = {
  po: { english: 'English Language', quant: 'Quantitative Aptitude', reasoning: 'Reasoning Ability' },
  clerk: { english: 'English Language', quant: 'Numerical Ability', reasoning: 'Reasoning Ability' },
}

/** Topic-wise test limits. */
export const TOPIC_TEST = { minQuestions: 5, maxQuestions: 40, minSecPerQ: 30, maxSecPerQ: 60, defaultSecPerQ: 45, defaultQuestions: 10 }
