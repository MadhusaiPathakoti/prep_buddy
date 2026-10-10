import type { FillersRawQuestion } from './fillersApi'

const LABELS = ['a', 'b', 'c']
const NONE_OF_THE_ABOVE = 'None of the above options'

export interface FillersCandidate {
  label: string
  text: string
  correct: boolean
}

export interface FillersQuestion {
  id: string
  topic: string
  beforeBlank: string
  afterBlank: string
  candidates: FillersCandidate[]
  /** 5 fixed-template choices; which 5 depends on how many candidates are correct (see buildQuestion). */
  options: string[]
  correctOption: string
  timeLimitSec: number
}

function splitSentence(sentence: string): { before: string; after: string } {
  const match = sentence.match(/_+/)
  if (!match || match.index === undefined) return { before: sentence, after: '' }
  return {
    before: sentence.slice(0, match.index).trimEnd(),
    after: sentence.slice(match.index + match[0].length).trimStart(),
  }
}

const ALL_THREE = `All ${LABELS[0]}, ${LABELS[1]} and ${LABELS[2]}`

/** Used when exactly 0, 2, or 3 of the 3 candidates are correct. */
function pairTemplate(): string[] {
  return [`Only ${LABELS[0]} and ${LABELS[1]}`, `Only ${LABELS[0]} and ${LABELS[2]}`, `Only ${LABELS[1]} and ${LABELS[2]}`, ALL_THREE, NONE_OF_THE_ABOVE]
}

/** Used when exactly 1 of the 3 candidates is correct. */
function singleTemplate(): string[] {
  return [`Only ${LABELS[0]}`, `Only ${LABELS[1]}`, `Only ${LABELS[2]}`, ALL_THREE, NONE_OF_THE_ABOVE]
}

function buildQuestion(raw: FillersRawQuestion, timeLimitSec: number, index: number): FillersQuestion {
  const { before, after } = splitSentence(raw.sentence)
  const correctSet = new Set(raw.correctIndices)
  const candidates: FillersCandidate[] = raw.options.map((text, i) => ({ label: LABELS[i], text, correct: correctSet.has(i) }))

  let options: string[]
  let correctOption: string
  if (correctSet.size === 1) {
    options = singleTemplate()
    const i = raw.correctIndices[0]
    correctOption = `Only ${LABELS[i]}`
  } else if (correctSet.size === 2) {
    options = pairTemplate()
    const [i, j] = [...correctSet].sort((a, b) => a - b)
    correctOption = `Only ${LABELS[i]} and ${LABELS[j]}`
  } else if (correctSet.size === 3) {
    options = pairTemplate()
    correctOption = ALL_THREE
  } else {
    options = pairTemplate()
    correctOption = NONE_OF_THE_ABOVE
  }

  return {
    id: `fillers-${index}-${Math.random().toString(36).slice(2, 8)}`,
    topic: raw.topic,
    beforeBlank: before,
    afterBlank: after,
    candidates,
    options,
    correctOption,
    timeLimitSec,
  }
}

export function buildFillersQuestions(raws: FillersRawQuestion[], timeLimitSec: number): FillersQuestion[] {
  return raws.map((raw, index) => buildQuestion(raw, timeLimitSec, index))
}
