import { useCallback, useEffect, useRef, useState } from 'react'
import { checkEntry, pairKey, pairText, parseEntry, type FactorQuestion, type FactorSettings, type Pair } from '../lib/factorPairs'
import { addSession } from '../lib/storage'
import { formatTime } from '../lib/format'
import Stat from './Stat'
import ReviewList, { type ReviewItem } from './ReviewList'

export const FACTOR_PAIRS_GAME_ID = 'factor-pairs'

type Tone = 'good' | 'bad' | 'info'

interface FactorPairsRunnerProps {
  questions: FactorQuestion[]
  settings: FactorSettings
  onExit: () => void
  onRestart: () => void
}

export default function FactorPairsRunner({ questions, settings, onExit, onRestart }: FactorPairsRunnerProps) {
  const [index, setIndex] = useState(0)
  /** Pairs entered for the current number, in the order (and orientation) the player typed them. */
  const [entered, setEntered] = useState<Pair[]>([])
  const [left, setLeft] = useState('')
  const [right, setRight] = useState('')
  const [message, setMessage] = useState<{ tone: Tone; text: string } | null>(null)
  const [shake, setShake] = useState(false)
  /** True once the round for this number is over (all pairs found, or the player asked to see them). */
  const [revealed, setRevealed] = useState(false)

  const [pairsFound, setPairsFound] = useState(0)
  const [pairsMissed, setPairsMissed] = useState(0)
  const [wrongEntries, setWrongEntries] = useState(0)
  const [fullyDone, setFullyDone] = useState(0)
  const [reviewItems, setReviewItems] = useState<ReviewItem[]>([])
  const [finished, setFinished] = useState(false)

  const [startTime] = useState(() => Date.now())
  const [elapsedMs, setElapsedMs] = useState(0)
  const leftRef = useRef<HTMLInputElement>(null)
  const rightRef = useRef<HTMLInputElement>(null)
  const savedRef = useRef(false)

  const total = questions.length
  const current = questions[index]
  const foundKeys = new Set(entered.map((p) => pairKey(p[0], p[1])))

  useEffect(() => {
    if (finished) return
    const id = setInterval(() => setElapsedMs(Date.now() - startTime), 250)
    return () => clearInterval(id)
  }, [finished, startTime])

  useEffect(() => {
    if (!finished && !revealed) leftRef.current?.focus()
  }, [index, finished, revealed])

  useEffect(() => {
    if (finished && !savedRef.current) {
      savedRef.current = true
      addSession(FACTOR_PAIRS_GAME_ID, {
        date: new Date().toISOString(),
        correct: pairsFound,
        wrongAttempts: wrongEntries,
        skipped: pairsMissed,
        total: pairsFound + pairsMissed,
        timeMs: elapsedMs,
      })
    }
  }, [finished, pairsFound, wrongEntries, pairsMissed, elapsedMs])

  /** End this number's round: tally what was found and missed, and show the full list. */
  const reveal = useCallback(
    (foundCount: number, foundSet: ReadonlySet<string>) => {
      const missed = current.pairs.filter((p) => !foundSet.has(pairKey(p[0], p[1])))
      setPairsFound((c) => c + foundCount)
      setPairsMissed((c) => c + missed.length)
      if (missed.length === 0) setFullyDone((c) => c + 1)
      else {
        setReviewItems((items) => [
          ...items,
          { id: current.id, prompt: `${current.n} = _ × _`, displayAnswer: missed.map(pairText).join(', '), skipped: true, joiner: ' → missed ' },
        ])
      }
      setRevealed(true)
    },
    [current],
  )

  function submit() {
    if (revealed) return
    const parsed = parseEntry(left, right)
    if (!parsed) {
      setMessage({ tone: 'info', text: 'Type a number in both boxes.' })
      return
    }
    const [a, b] = parsed
    const result = checkEntry(current, a, b, settings, foundKeys)
    if (result.kind === 'new') {
      const next = [...entered, [a, b] as Pair]
      setEntered(next)
      setMessage({ tone: 'good', text: `${a} × ${b} = ${current.n} ✓` })
      if (next.length === current.pairs.length) {
        reveal(next.length, new Set(next.map((p) => pairKey(p[0], p[1]))))
        return
      }
    } else if (result.kind === 'dup') {
      setMessage({ tone: 'info', text: `${a} × ${b} is the same as ${pairText(result.pair)}, which you already have.` })
    } else if (result.kind === 'wrong') {
      setWrongEntries((w) => w + 1)
      setMessage({ tone: 'bad', text: `${a} × ${b} = ${result.product}, not ${current.n}.` })
      setShake(true)
      setTimeout(() => setShake(false), 380)
    } else {
      setMessage({ tone: 'info', text: `${a} × ${b} is correct but not counted: ${result.reason}.` })
    }
    setLeft('')
    setRight('')
    leftRef.current?.focus()
  }

  const next = useCallback(() => {
    if (index + 1 >= total) {
      setFinished(true)
      return
    }
    setIndex((i) => i + 1)
    setEntered([])
    setLeft('')
    setRight('')
    setMessage(null)
    setRevealed(false)
  }, [index, total])

  // Enter moves on once the full list is showing. The listener is armed after a short pause: the Enter that added the last
  // pair (or a quick second tap) must not skip the list before it has been seen.
  useEffect(() => {
    if (!revealed || finished) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Enter' && !e.repeat) {
        e.preventDefault()
        next()
      }
    }
    const arm = setTimeout(() => window.addEventListener('keydown', onKey), 400)
    return () => {
      clearTimeout(arm)
      window.removeEventListener('keydown', onKey)
    }
  }, [revealed, finished, next])

  function digits(raw: string) {
    return raw.replace(/\D/g, '').slice(0, 6)
  }

  /** Typing or pasting "8 x 9", "8*9" or "8 9" into the first box fills both boxes; a lone separator after a number jumps ahead. */
  function onLeftChange(raw: string) {
    const m = /^\s*(\d+)\s*[x×*,\s]\s*(\d*)/i.exec(raw)
    if (m) {
      setLeft(digits(m[1]))
      if (m[2]) setRight(digits(m[2]))
      rightRef.current?.focus()
      return
    }
    setLeft(digits(raw))
  }

  function onLeftKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== 'Enter') return
    e.preventDefault()
    if (left !== '' && right === '') rightRef.current?.focus()
    else submit()
  }

  function onRightKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault()
      submit()
    } else if (e.key === 'Backspace' && right === '') {
      leftRef.current?.focus()
    }
  }

  if (finished) {
    const totalPairs = pairsFound + pairsMissed
    const accuracy = totalPairs > 0 ? Math.round((pairsFound / totalPairs) * 1000) / 10 : 0
    return (
      <div className="mx-auto max-w-md px-4 py-10">
        <div className="rounded-3xl bg-white dark:bg-slate-800 p-8 shadow-sm ring-1 ring-slate-200 dark:ring-slate-700">
          <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Session complete</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Here's how you did.</p>

          <div className="mt-6 grid grid-cols-2 gap-4">
            <Stat label="Pairs found" value={`${pairsFound} / ${totalPairs}`} accent="text-indigo-600 dark:text-indigo-400" />
            <Stat label="Time taken" value={formatTime(elapsedMs)} accent="text-slate-900 dark:text-slate-100" />
            <Stat label="Numbers fully solved" value={`${fullyDone} / ${total}`} accent="text-emerald-600 dark:text-emerald-400" />
            <Stat label="Accuracy" value={`${accuracy}%`} accent="text-slate-900 dark:text-slate-100" />
            <Stat label="Pairs missed" value={String(pairsMissed)} accent="text-amber-600 dark:text-amber-400" />
            <Stat label="Wrong entries" value={String(wrongEntries)} accent="text-rose-600 dark:text-rose-400" />
          </div>

          <ReviewList items={reviewItems} />

          <div className="mt-8 flex flex-col gap-3">
            <button
              onClick={onRestart}
              className="w-full rounded-xl bg-indigo-600 px-4 py-3 font-semibold text-white shadow-sm transition hover:bg-indigo-500 active:scale-[0.99]"
            >
              Practice again
            </button>
            <button
              onClick={onExit}
              className="w-full rounded-xl bg-slate-100 dark:bg-slate-700 px-4 py-3 font-semibold text-slate-700 dark:text-slate-300 transition hover:bg-slate-200 active:scale-[0.99]"
            >
              Change settings
            </button>
          </div>
        </div>
      </div>
    )
  }

  const progressPct = total > 0 ? (index / total) * 100 : 0
  const toneClass: Record<Tone, string> = {
    good: 'text-emerald-600 dark:text-emerald-400',
    bad: 'text-rose-600 dark:text-rose-400',
    info: 'text-amber-600 dark:text-amber-400',
  }
  const canAdd = left !== '' && right !== ''

  return (
    <div className="mx-auto max-w-lg px-4 py-6">
      <div className="mb-4 flex items-center justify-between text-sm text-slate-500 dark:text-slate-400">
        <span>
          Number <span className="font-semibold text-slate-700 dark:text-slate-300">{index + 1}</span> / {total}
        </span>
        <span className="font-mono tabular-nums">{formatTime(elapsedMs)}</span>
      </div>

      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-600">
        <div className="h-full rounded-full bg-indigo-500 transition-all duration-300" style={{ width: `${progressPct}%` }} />
      </div>

      <div className="mt-4 flex justify-center gap-4 text-xs font-medium text-slate-500 dark:text-slate-400">
        <span className="text-emerald-600 dark:text-emerald-400">✓ {pairsFound + (revealed ? 0 : entered.length)} {pairsFound + (revealed ? 0 : entered.length) === 1 ? 'pair' : 'pairs'}</span>
        <span className="text-rose-600 dark:text-rose-400">✕ {wrongEntries}</span>
      </div>

      <div
        className={[
          'mt-6 rounded-3xl bg-white dark:bg-slate-800 p-6 text-center shadow-sm ring-1 transition-colors sm:p-8',
          shake ? 'ring-rose-400 animate-shake' : 'ring-slate-200 dark:ring-slate-700',
        ].join(' ')}
      >
        <div className="font-mono text-4xl font-bold tracking-tight text-slate-900 dark:text-slate-100 sm:text-5xl">
          {current.n}
          <span className="text-slate-300 dark:text-slate-600"> = </span>
          <span className="text-indigo-500 dark:text-indigo-400">_ × _</span>
        </div>
        <p className="mt-2 text-sm text-slate-400 dark:text-slate-500">
          {revealed
            ? 'All the pairs:'
            : settings.showCount
              ? `Found ${entered.length} of ${current.pairs.length} pairs. Order does not matter.`
              : `Found ${entered.length} so far. Order does not matter.`}
        </p>

        {!revealed && (
          <>
            <div className="mt-5 flex items-center justify-center gap-3">
              <input
                ref={leftRef}
                value={left}
                onChange={(e) => onLeftChange(e.target.value)}
                onKeyDown={onLeftKeyDown}
                inputMode="numeric"
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                aria-label="First factor"
                className="w-24 rounded-xl border-2 border-slate-200 bg-slate-50 px-3 py-3 text-center font-mono text-3xl font-bold text-slate-900 outline-none transition-colors focus:border-indigo-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              />
              <span className="font-mono text-2xl font-bold text-slate-400 dark:text-slate-500">×</span>
              <input
                ref={rightRef}
                value={right}
                onChange={(e) => setRight(digits(e.target.value))}
                onKeyDown={onRightKeyDown}
                inputMode="numeric"
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                aria-label="Second factor"
                className="w-24 rounded-xl border-2 border-slate-200 bg-slate-50 px-3 py-3 text-center font-mono text-3xl font-bold text-slate-900 outline-none transition-colors focus:border-indigo-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              />
              <button
                onClick={submit}
                disabled={!canAdd}
                className="rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Add
              </button>
            </div>
            <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">Type a number, press x or Space to jump to the next box, Enter to add.</p>
            <div className="mt-3 min-h-[1.5rem] text-sm font-medium" aria-live="polite">
              {message && <span className={toneClass[message.tone]}>{message.text}</span>}
            </div>

            {entered.length > 0 && (
              <div className="mt-3 flex flex-wrap justify-center gap-2">
                {entered.map((p) => (
                  <span
                    key={pairKey(p[0], p[1])}
                    className="rounded-lg bg-emerald-50 px-3 py-1.5 font-mono text-sm font-semibold text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/30"
                  >
                    {p[0]} × {p[1]}
                  </span>
                ))}
              </div>
            )}
          </>
        )}

        {revealed && (
          <>
            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {current.pairs.map((p) => {
                const got = foundKeys.has(pairKey(p[0], p[1]))
                return (
                  <div
                    key={pairKey(p[0], p[1])}
                    className={[
                      'rounded-xl px-3 py-2 ring-1',
                      got
                        ? 'bg-emerald-50 ring-emerald-200 dark:bg-emerald-500/10 dark:ring-emerald-500/30'
                        : 'bg-amber-50 ring-amber-200 dark:bg-amber-500/10 dark:ring-amber-500/30',
                    ].join(' ')}
                  >
                    <div className={['font-mono text-lg font-bold', got ? 'text-emerald-700 dark:text-emerald-300' : 'text-amber-700 dark:text-amber-300'].join(' ')}>
                      {got ? '✓ ' : ''}
                      {p[0]} × {p[1]}
                    </div>
                    <div className="text-xs text-slate-400 dark:text-slate-500">{p[0] === p[1] ? 'square' : `same as ${p[1]} × ${p[0]}`}</div>
                  </div>
                )
              })}
            </div>
            <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">
              {current.pairs.length - entered.length === 0
                ? `You found all ${current.pairs.length} pairs.`
                : `You found ${entered.length} of ${current.pairs.length}. Missed ones are in amber.`}
            </p>
          </>
        )}
      </div>

      <div className="mt-6 flex justify-center">
        {revealed ? (
          <button
            onClick={next}
            className="rounded-full bg-indigo-600 px-8 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500 active:scale-[0.99]"
          >
            {index + 1 >= total ? 'See results' : 'Next number →'} <span className="text-indigo-200">(Enter)</span>
          </button>
        ) : (
          <button
            onClick={() => reveal(entered.length, foundKeys)}
            className="rounded-full bg-slate-100 dark:bg-slate-700 px-6 py-2 text-sm font-semibold text-slate-600 dark:text-slate-300 transition hover:bg-slate-200"
          >
            {entered.length === 0 ? 'Show all pairs' : "I'm done, show all pairs"}
          </button>
        )}
      </div>

      <div className="mt-6 text-center">
        <button onClick={onExit} className="text-sm text-slate-400 dark:text-slate-500 underline-offset-2 hover:text-slate-600 hover:underline">
          End session
        </button>
      </div>
    </div>
  )
}
