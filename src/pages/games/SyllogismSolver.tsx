import { useCallback, useEffect, useRef, useState } from 'react'
import SolverView from '../../components/syllogism/SolverView'
import SyllogismInput from '../../components/syllogism/SyllogismInput'
import type { ParsedQuestion } from '../../lib/syllogismSolver/parse'
import { solve, type Solution } from '../../lib/syllogismSolver/solve'

const DRAFT_KEY = 'prepbuddy:syllogism-solver:draft'

function loadDraft(): string {
  try {
    return localStorage.getItem(DRAFT_KEY) ?? ''
  } catch {
    return ''
  }
}

export default function SyllogismSolver() {
  const [text, setText] = useState(loadDraft)
  const [solution, setSolution] = useState<Solution | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  // keep what the user typed, so a refresh or an accidental "back" does not lose it
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

  const run = useCallback((q: ParsedQuestion) => {
    setBusy(true)
    setError(null)
    // let the "Solving…" label paint before the (synchronous) solve
    timer.current = setTimeout(() => {
      try {
        setSolution(solve(q))
      } catch {
        setError('Something went wrong while solving this question. Check the statements and conclusions, or try a simpler example.')
      } finally {
        setBusy(false)
      }
    }, 30)
  }, [])

  if (solution) return <SolverView solution={solution} onEdit={() => setSolution(null)} />
  return <SyllogismInput text={text} onText={setText} onSolve={run} busy={busy} error={error} />
}
