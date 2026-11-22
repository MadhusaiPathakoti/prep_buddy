import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
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
  // A game (Family Tree) can open this page with a puzzle ({ text }) and a way back ({ returnTo }); otherwise it starts as usual.
  const navigate = useNavigate()
  const handed = useLocation().state as { text?: unknown; returnTo?: unknown } | null
  const [seed] = useState(() => (typeof handed?.text === 'string' && handed.text.trim() ? handed.text : null))
  const [returnTo] = useState(() => (seed && typeof handed?.returnTo === 'string' ? handed.returnTo : null))
  const backToGame = returnTo ? () => navigate(-1) : undefined

  const [text, setText] = useState(() => seed ?? loadDraft())
  const [trace, setTrace] = useState<Trace | null>(null)
  const [busy, setBusy] = useState(false)
  const [runs, setRuns] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  // keep what the user typed, so a refresh or an accidental "back" does not lose a long puzzle
  useEffect(() => {
    if (text === seed) return // a puzzle handed over by a game is not the user's own draft
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

  const solve = useCallback((puzzle: Puzzle) => {
    setBusy(true)
    setError(null)
    // let the "Solving…" label paint before the (synchronous) solve
    timer.current = setTimeout(() => {
      try {
        setTrace(buildTrace(puzzle))
        setRuns((r) => r + 1)
      } catch {
        setError('Something went wrong while solving this puzzle. Try rewording the clues, or use a simpler example.')
      } finally {
        setBusy(false)
      }
    }, 30)
  }, [])

  if (trace) return <Walkthrough key={runs} trace={trace} onEdit={() => setTrace(null)} onResolve={solve} />
  return <PuzzleInput text={text} onText={setText} onSolve={solve} busy={busy} error={error} onBackToGame={backToGame} autoSolve={seed !== null && text === seed} />
}
