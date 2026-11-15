import { useEffect, useRef, useState } from 'react'
import { addSession } from '../lib/storage'
import { formatTime } from '../lib/format'
import { RELATION_CHOICES, exprText, fmtValue, judge, type RelationChoice, type SurdQuestion } from '../lib/surds'
import Stat from './Stat'
import ReviewList, { type ReviewItem } from './ReviewList'
import { ExprView } from './SurdText'

interface Result {
  question: SurdQuestion
  choice: RelationChoice
  correct: boolean
}

interface SurdsRunnerProps {
  gameId: string
  questions: SurdQuestion[]
  onExit: () => void
  onRestart: () => void
  onViewTable: () => void
}

const CHOICE_LABEL: Record<RelationChoice, string> = { '<': 'less than', '>': 'greater than', '≤': 'less than or equal', '≥': 'greater than or equal', '=': 'equal' }

/** One comparison at a time: pick a relation, submit, then see both decimal values and the verdict. */
export default function SurdsRunner({ gameId, questions, onExit, onRestart, onViewTable }: SurdsRunnerProps) {
  const [index, setIndex] = useState(0)
  const [selected, setSelected] = useState<RelationChoice | null>(null)
  const [submitted, setSubmitted] = useState(false)
  const [results, setResults] = useState<Result[]>([])
  const [finished, setFinished] = useState(false)
  const [startTime] = useState(() => Date.now())
  const [elapsedMs, setElapsedMs] = useState(0)
  const savedRef = useRef(false)

  const total = questions.length
  const current = questions[index]
  const correctCount = results.filter((r) => r.correct).length

  useEffect(() => {
    if (finished) return
    const id = setInterval(() => setElapsedMs(Date.now() - startTime), 250)
    return () => clearInterval(id)
  }, [finished, startTime])

  useEffect(() => {
    if (!finished || savedRef.current) return
    savedRef.current = true
    addSession(gameId, { date: new Date().toISOString(), correct: correctCount, wrongAttempts: results.length - correctCount, skipped: 0, total: results.length, timeMs: elapsedMs })
  }, [finished, gameId, correctCount, results.length, elapsedMs])

  function submit() {
    if (!selected || submitted) return
    setSubmitted(true)
    setResults((prev) => [...prev, { question: current, choice: selected, correct: judge(selected, current.answer).correct }])
  }

  function next() {
    if (index + 1 >= total) {
      setFinished(true)
      return
    }
    setIndex((i) => i + 1)
    setSelected(null)
    setSubmitted(false)
  }

  // keyboard: < > = pick a relation, Enter submits and then moves on
  const handlerRef = useRef<(e: KeyboardEvent) => void>(() => {})
  useEffect(() => {
    handlerRef.current = (e) => {
      if (finished) return
      if (e.key === 'Enter') {
        e.preventDefault()
        if (submitted) next()
        else submit()
        return
      }
      if (!submitted && (e.key === '<' || e.key === '>' || e.key === '=')) setSelected(e.key)
    }
  })
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => handlerRef.current(e)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  if (finished) {
    const accuracy = results.length > 0 ? Math.round((correctCount / results.length) * 1000) / 10 : 0
    const items: ReviewItem[] = [...results]
      .sort((a, b) => Number(a.correct) - Number(b.correct))
      .map((r, i) => ({
        id: `${i}-${r.question.id}`,
        prompt: `${exprText(r.question.left)}  vs  ${exprText(r.question.right)}`,
        joiner: '  →  ',
        displayAnswer: r.question.answer,
        skipped: false,
        correct: r.correct,
        note: `${exprText(r.question.left)} = ${fmtValue(r.question.leftValue)}\n${exprText(r.question.right)} = ${fmtValue(r.question.rightValue)}${r.correct ? '' : `\nYou chose ${r.choice}`}`,
      }))
    return (
      <div className="mx-auto max-w-md px-4 py-10">
        <div className="rounded-3xl bg-white dark:bg-slate-800 p-8 shadow-sm ring-1 ring-slate-200 dark:ring-slate-700">
          <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Session complete</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Here's how you did.</p>
          <div className="mt-6 grid grid-cols-2 gap-4">
            <Stat label="Accuracy" value={`${accuracy}%`} accent="text-indigo-600 dark:text-indigo-400" />
            <Stat label="Time taken" value={formatTime(elapsedMs)} accent="text-slate-900 dark:text-slate-100" />
            <Stat label="Correct" value={`${correctCount} / ${results.length}`} accent="text-emerald-600 dark:text-emerald-400" />
            <Stat label="Avg / question" value={`${results.length ? (elapsedMs / results.length / 1000).toFixed(1) : '0.0'}s`} accent="text-slate-900 dark:text-slate-100" />
          </div>
          <ReviewList items={items} />
          <div className="mt-8 flex flex-col gap-3">
            <button onClick={onRestart} className="w-full rounded-xl bg-indigo-600 px-4 py-3 font-semibold text-white shadow-sm transition hover:bg-indigo-500 active:scale-[0.99]">
              Practice again
            </button>
            <button onClick={onViewTable} className="w-full rounded-xl bg-slate-100 dark:bg-slate-700 px-4 py-3 font-semibold text-slate-700 dark:text-slate-300 transition hover:bg-slate-200 active:scale-[0.99]">
              View surds (√2 to √20)
            </button>
            <button onClick={onExit} className="w-full rounded-xl bg-slate-100 dark:bg-slate-700 px-4 py-3 font-semibold text-slate-700 dark:text-slate-300 transition hover:bg-slate-200 active:scale-[0.99]">
              Change settings
            </button>
          </div>
        </div>
      </div>
    )
  }

  const verdict = submitted && selected ? judge(selected, current.answer) : null
  const progressPct = total > 0 ? (index / total) * 100 : 0

  return (
    <div className="mx-auto max-w-lg px-4 py-6">
      <div className="mb-4 flex items-center justify-between text-sm text-slate-500 dark:text-slate-400">
        <span>
          Question <span className="font-semibold text-slate-700 dark:text-slate-300">{index + 1}</span> / {total}
        </span>
        <span className="font-mono tabular-nums">{formatTime(elapsedMs)}</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-600">
        <div className="h-full rounded-full bg-indigo-500 transition-all duration-300" style={{ width: `${progressPct}%` }} />
      </div>
      <div className="mt-4 flex justify-center gap-5 text-xs font-medium">
        <span className="text-emerald-600 dark:text-emerald-400">✓ {correctCount}</span>
        <span className="text-rose-600 dark:text-rose-400">✕ {results.length - correctCount}</span>
      </div>

      <div
        className={[
          'mt-6 rounded-3xl bg-white dark:bg-slate-800 p-6 shadow-sm ring-1 transition-colors sm:p-8',
          verdict ? (verdict.correct ? 'ring-emerald-400' : 'ring-rose-400') : 'ring-slate-200 dark:ring-slate-700',
        ].join(' ')}
      >
        <div className="text-center text-xs font-semibold uppercase tracking-wide text-indigo-500 dark:text-indigo-400">Which relation is exactly right?</div>

        <div className="mt-4 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100 sm:text-4xl">
          <ExprView expr={current.left} />
          <span
            className={[
              'inline-flex h-12 min-w-14 items-center justify-center rounded-xl border-2 border-dashed px-2 font-mono text-3xl',
              submitted && verdict ? (verdict.correct ? 'border-emerald-400 text-emerald-600 dark:text-emerald-400' : 'border-rose-400 text-rose-600 dark:text-rose-400') : 'border-slate-300 dark:border-slate-600 text-indigo-600 dark:text-indigo-400',
            ].join(' ')}
            aria-label="your answer"
          >
            {selected ?? '?'}
          </span>
          <ExprView expr={current.right} />
        </div>

        <div className="mt-6 grid grid-cols-5 gap-2">
          {RELATION_CHOICES.map((c) => {
            const isSelected = selected === c
            const isAnswer = submitted && c === current.answer
            const isWrongPick = submitted && isSelected && c !== current.answer
            return (
              <button
                key={c}
                onClick={() => !submitted && setSelected(c)}
                disabled={submitted}
                aria-label={CHOICE_LABEL[c]}
                aria-pressed={isSelected}
                className={[
                  'rounded-xl border-2 py-3 font-mono text-2xl font-bold transition-colors',
                  isAnswer ? 'border-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : '',
                  isWrongPick ? 'border-rose-400 bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-300 animate-shake' : '',
                  !isAnswer && !isWrongPick && isSelected ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-500/15 text-indigo-700 dark:text-indigo-300' : '',
                  !isAnswer && !isWrongPick && !isSelected ? 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:border-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-500/10' : '',
                  submitted && !isAnswer && !isWrongPick ? 'opacity-40' : '',
                ].join(' ')}
              >
                {c}
              </button>
            )
          })}
        </div>

        {!submitted ? (
          <button
            onClick={submit}
            disabled={!selected}
            className="mt-6 w-full rounded-xl bg-indigo-600 px-4 py-3 font-semibold text-white shadow-sm transition hover:bg-indigo-500 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
          >
            Submit
          </button>
        ) : (
          <div className="mt-6" data-testid="surd-result">
            <div className="rounded-2xl bg-slate-50 dark:bg-slate-900/40 px-5 py-4 text-lg text-slate-900 dark:text-slate-100">
              <div className="flex items-baseline justify-between gap-3">
                <span className="font-semibold">
                  <ExprView expr={current.left} /> =
                </span>
                <span className="font-mono font-bold tabular-nums text-indigo-600 dark:text-indigo-400">{fmtValue(current.leftValue)}</span>
              </div>
              <div className="mt-1.5 flex items-baseline justify-between gap-3">
                <span className="font-semibold">
                  <ExprView expr={current.right} /> =
                </span>
                <span className="font-mono font-bold tabular-nums text-indigo-600 dark:text-indigo-400">{fmtValue(current.rightValue)}</span>
              </div>
              <div className="mt-3 border-t border-slate-200 dark:border-slate-700 pt-3 text-center">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Verdict</span>
                <div className="mt-1 flex flex-wrap items-center justify-center gap-x-3 text-2xl font-bold">
                  <ExprView expr={current.left} />
                  <span className="rounded-lg bg-emerald-100 dark:bg-emerald-500/20 px-3 py-0.5 font-mono text-emerald-700 dark:text-emerald-300">{current.answer}</span>
                  <ExprView expr={current.right} />
                </div>
              </div>
            </div>

            <p className={['mt-3 text-sm font-semibold', verdict?.correct ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'].join(' ')}>
              {verdict?.correct ? '✓ Correct!' : `✕ You chose ${selected}. ${verdict?.remark}`}
            </p>
            <p className="mt-2 whitespace-pre-line text-xs leading-relaxed text-slate-500 dark:text-slate-400">
              <span className="font-semibold">Quick way: </span>
              {current.note}
            </p>

            <button
              onClick={next}
              className="mt-5 w-full rounded-xl bg-indigo-600 px-4 py-3 font-semibold text-white shadow-sm transition hover:bg-indigo-500 active:scale-[0.99]"
            >
              {index + 1 >= total ? 'See results' : 'Next →'}
            </button>
          </div>
        )}
      </div>

      <p className="mt-4 text-center text-xs text-slate-400 dark:text-slate-500">Keys: &lt; &gt; = to pick, Enter to submit / continue</p>
      <div className="mt-3 text-center">
        <button onClick={onExit} className="text-sm text-slate-400 dark:text-slate-500 underline-offset-2 hover:text-slate-600 hover:underline">
          End session
        </button>
      </div>
    </div>
  )
}
