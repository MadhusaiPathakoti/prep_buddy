export interface SolutionStep {
  /** "Step 3", or null for text that is not under a numbered step. */
  label: string | null
  lines: string[]
}

export interface ParsedSolution {
  steps: SolutionStep[]
  /** Lines after the last step, e.g. "Correct answer: (D) 42 days". */
  tail: string[]
}

/**
 * Splits a worked solution into its numbered steps. A step starts at a line like "Step 2: …" and runs until
 * the next one; a "Correct answer: …" line and anything after it is the tail. Solutions that carry no step
 * numbers still show, as one plain block.
 */
export function parseSolution(text: string): ParsedSolution {
  const steps: SolutionStep[] = []
  const tail: string[] = []
  let current: SolutionStep | null = null
  for (const raw of text.split('\n')) {
    const line = raw.trimEnd()
    if (!line.trim()) continue
    const step = line.match(/^Step\s+(\d+)\s*[:.)-]\s*(.*)$/i)
    if (step) {
      current = { label: `Step ${step[1]}`, lines: step[2] ? [step[2]] : [] }
      steps.push(current)
    } else if (/^correct answer\s*:/i.test(line) || tail.length > 0) {
      tail.push(line)
      current = null
    } else if (current) {
      current.lines.push(line)
    } else {
      current = { label: null, lines: [line] }
      steps.push(current)
    }
  }
  return { steps, tail }
}
