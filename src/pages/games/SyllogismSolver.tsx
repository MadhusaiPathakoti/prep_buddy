import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import SolverView from '../../components/syllogism/SolverView'
import SyllogismInput from '../../components/syllogism/SyllogismInput'
import { parseQuestion, type ParsedQuestion } from '../../lib/syllogismSolver/parse'
import { solve, type Solution } from '../../lib/syllogismSolver/solve'

const DRAFT_KEY = 'prepbuddy:syllogism-solver:draft'

function loadDraft(): string {
  try {
    return localStorage.getItem(DRAFT_KEY) ?? ''
  } catch {
    return ''
  }
}

/** Solve a question handed over by another page; null if it cannot be read (the input screen then shows what went wrong). */
function solveText(text: string): Solution | null {
  try {
    const q = parseQuestion(text)
    return q.errors.length ? null : solve(q)
  } catch {
    return null
  }
}

export default function SyllogismSolver() {
  // The Syllogism game can open this page with a question ({ text }) and a way back ({ returnTo }); otherwise it starts empty as usual.
  const navigate = useNavigate()
  const handed = useLocation().state as { text?: unknown; returnTo?: unknown } | null
  const [seed] = useState(() => (typeof handed?.text === 'string' && handed.text.trim() ? handed.text : null))
  const [returnTo] = useState(() => (seed && typeof handed?.returnTo === 'string' ? handed.returnTo : null))
  const backToGame = returnTo ? () => navigate(-1) : undefined

  const [text, setText] = useState(() => seed ?? loadDraft())
  const [solution, setSolution] = useState<Solution | null>(() => (seed ? solveText(seed) : null))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  // keep what the user typed, so a refresh or an accidental "back" does not lose it
  useEffect(() => {
    if (text === seed) return // a question from the game is not the user's own draft
    const id = setTimeout(() => {
      try {
        localStorage.setItem(DRAFT_KEY, text)
      } catch {
        // storage unavailable: the draft just won't survive a reload
      }
    }, 400)
    return () => clearTimeout(id)
  }, [text, seed])

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

  if (solution) return <SolverView solution={solution} onEdit={() => setSolution(null)} onBackToGame={backToGame} />
  return <SyllogismInput text={text} onText={setText} onSolve={run} busy={busy} error={error} onBackToGame={backToGame} />
}
