import { shuffle } from './generators'
import type { ParaJumbleRawParagraph } from './paraJumbleApi'

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F']

export interface ParaSentence {
  label: string
  text: string
}

export interface ParaJumbleQuestion {
  id: string
  topic: string
  /** The sentences in the (scrambled) order shown to the player, each labelled A, B, C… by position. */
  sentences: ParaSentence[]
  /** 5 label orders, e.g. "BDACE"; exactly one restores the paragraph. */
  options: string[]
  correctOption: string
  correctParagraph: string
  explanation: string
  timeLimitSec: number
}

/** Positions that hold a different sentence than the correct order would — a shuffle that leaves most sentences in place is too easy. */
function displacedCount(displayOrder: number[]): number {
  return displayOrder.filter((original, pos) => original !== pos).length
}

function scrambledOrder(n: number): number[] {
  const minDisplaced = n - 1
  let order: number[]
  do {
    order = shuffle(Array.from({ length: n }, (_, i) => i))
  } while (displacedCount(order) < minDisplaced)
  return order
}

/** Every order reachable from `correct` by swapping two sentences or moving one sentence elsewhere — i.e. the mistakes a student realistically makes. */
function nearMisses(correct: string[]): string[] {
  const found = new Set<string>()
  const n = correct.length
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const swapped = [...correct]
      ;[swapped[i], swapped[j]] = [swapped[j], swapped[i]]
      found.add(swapped.join(''))
    }
    for (let j = 0; j < n; j++) {
      if (j === i) continue
      const moved = [...correct]
      const [item] = moved.splice(i, 1)
      moved.splice(j, 0, item)
      found.add(moved.join(''))
    }
  }
  found.delete(correct.join(''))
  return [...found]
}

function buildQuestion(raw: ParaJumbleRawParagraph, timeLimitSec: number, index: number): ParaJumbleQuestion {
  const n = raw.sentences.length
  const displayOrder = scrambledOrder(n)

  const sentences: ParaSentence[] = displayOrder.map((original, pos) => ({ label: LETTERS[pos], text: raw.sentences[original] }))

  // The label that ended up on each original (correct-order) sentence, read in order.
  const labelForOriginal: string[] = []
  displayOrder.forEach((original, pos) => {
    labelForOriginal[original] = LETTERS[pos]
  })
  const correctOption = labelForOriginal.join('')

  const wrong = shuffle(nearMisses(labelForOriginal)).slice(0, 4)

  return {
    id: `para-jumble-${index}-${Math.random().toString(36).slice(2, 8)}`,
    topic: raw.topic,
    sentences,
    options: shuffle([correctOption, ...wrong]),
    correctOption,
    correctParagraph: raw.sentences.join(' '),
    explanation: raw.explanation,
    timeLimitSec,
  }
}

export function buildParaJumbleQuestions(raws: ParaJumbleRawParagraph[], timeLimitSec: number): ParaJumbleQuestion[] {
  return raws.map((raw, index) => buildQuestion(raw, timeLimitSec, index))
}

/** The paragraph a given label order (e.g. "BDACE") produces from this question's sentences. */
export function paragraphFromOption(question: ParaJumbleQuestion, option: string): string {
  const textByLabel = new Map(question.sentences.map((s) => [s.label, s.text]))
  return option
    .split('')
    .map((letter) => textByLabel.get(letter) ?? '')
    .join(' ')
}
