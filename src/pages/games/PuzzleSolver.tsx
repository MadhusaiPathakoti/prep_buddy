import { useCallback, useEffect, useRef, useState } from 'react'
import PuzzleInput from '../../components/puzzle/PuzzleInput'
import Walkthrough from '../../components/puzzle/Walkthrough'
import { buildTrace, type Trace } from '../../lib/puzzleSolver/trace'
import type { Puzzle } from '../../lib/puzzleSolver/types'

const DRAFT_KEY = 'prepbuddy:puzzle-solver:draft'

function loadDraft(): string {
  try {
    return localStorage.getItem(DRAFT_KEY) ?? ''
  } catch {
    return ''
  }
}

export default function PuzzleSolver() {
  const [text, setText] = useState(loadDraft)
  const [trace, setTrace] = useState<Trace | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  // keep what the user typed, so a refresh or an accidental "back" does not lose a long puzzle
  useEffect(() => {
    const id = setTimeout(() => {
      try {
        localStorage.setItem(DRAFT_KEY, text)
      } catch {
        // storage unavailable: the draft just won't survive a reload
      }
    }, 400)
    return () => clearTimeout(id)
  }, [text])

  useEffect(() => () => clearTimeout(timer.current), [])

  const solve = useCallback((puzzle: Puzzle) => {
    setBusy(true)
    setError(null)
    // let the "Solving…" label paint before the (synchronous) solve
    timer.current = setTimeout(() => {
      try {
        setTrace(buildTrace(puzzle))
      } catch {
        setError('Something went wrong while solving this puzzle. Try rewording the clues, or use a simpler example.')
      } finally {
        setBusy(false)
      }
    }, 30)
  }, [])

  if (trace) return <Walkthrough trace={trace} onEdit={() => setTrace(null)} />
  return <PuzzleInput text={text} onText={setText} onSolve={solve} busy={busy} error={error} />
}
