import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import FavoriteRecencyChips from '../../components/FavoriteRecencyChips'
import MnemonicCard, { MnemonicImage } from '../../components/MnemonicCard'
import { SpeakerButton } from '../../components/Pronounce'
import Stat from '../../components/Stat'
import { getFavorites, toggleFavorite, type FavoriteMap } from '../../lib/favorites'
import { formatTime } from '../../lib/format'
import {
  buildQuestions,
  MNEMONIC_BANK_KEY,
  MNEMONIC_GAME_ID,
  pickRevisionWords,
  recordAnswer,
  type MnemonicWord,
  type ReviseMode,
  type ReviseOrder,
  type ReviseQuestion,
} from '../../lib/mnemonicVocab'
import { addSession } from '../../lib/storage'
import { useMnemonicBank } from '../../lib/useMnemonicBank'

const MODES: { id: ReviseMode; label: string; hint: string }[] = [
  { id: 'picture', label: '🖼️ Picture → Word', hint: 'See the cartoon, pick the word it stands for.' },
  { id: 'meaning', label: '📝 Word → Meaning', hint: 'See the word, pick its meaning.' },
  { id: 'mixed', label: '🔀 Mixed', hint: 'A bit of both.' },
]
const ORDERS: { id: ReviseOrder; label: string; hint: string }[] = [
  { id: 'fresh', label: 'Freshest first', hint: 'Words you starred most recently come first.' },
  { id: 'weak', label: 'Weakest first', hint: 'Words you missed last time, then ones never asked, then the longest-ago.' },
  { id: 'random', label: 'Random', hint: 'Any favourite in the window.' },
]
const COUNTS = [5, 10, 15, 20]

const chip = (on: boolean) =>
  [
    'rounded-lg px-4 py-2 text-sm font-semibold transition',
    on ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200',
  ].join(' ')

export default function MnemonicRevise() {
  const { bank, error } = useMnemonicBank()
  const [session, setSession] = useState<{ questions: ReviseQuestion[]; key: number } | null>(null)
  const [mode, setMode] = useState<ReviseMode>('mixed')
  const [order, setOrder] = useState<ReviseOrder>('fresh')
  const [count, setCount] = useState(10)
  const [recency, setRecency] = useState<number | null>(null)
  // read fresh on every visit to setup, so stars added elsewhere are counted
  const [favorites, setFavorites] = useState<FavoriteMap>(() => getFavorites(MNEMONIC_BANK_KEY))

  const back = (
    <Link to="/english/mnemonic-vocab" className="text-sm text-slate-400 dark:text-slate-500 hover:text-slate-600">
      ← Mnemonic Vocabulary
    </Link>
  )

  if (error) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10">
        {back}
        <p className="mt-6 rounded-lg bg-rose-50 dark:bg-rose-500/10 px-4 py-3 text-sm text-rose-700 dark:text-rose-300">Could not load the word bank. Check your connection and try again.</p>
      </div>
    )
  }
  if (!bank) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10">
        {back}
        <p className="mt-6 text-slate-400 dark:text-slate-500">Loading the words…</p>
      </div>
    )
  }

  function start() {
    if (!bank) return
    const words = pickRevisionWords(bank, getFavorites(MNEMONIC_BANK_KEY), recency, order, count)
    if (words.length === 0) return
    setSession((s) => ({ questions: buildQuestions(bank, words, mode), key: (s?.key ?? 0) + 1 }))
  }

  if (session) {
    return (
      <Runner
        key={session.key}
        questions={session.questions}
        onRestart={start}
        onExit={() => {
          setFavorites(getFavorites(MNEMONIC_BANK_KEY))
          setSession(null)
        }}
      />
    )
  }

  const poolSize = bank.filter((w) => favorites.has(w.id) && (recency === null || isWithin(favorites.get(w.id), recency))).length
  const windowLabel = recency === null ? '' : ` in the last ${recency} ${recency === 1 ? 'day' : 'days'}`
  const canStart = poolSize > 0

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      {back}
      <h1 className="mt-2 text-3xl font-extrabold text-slate-900 dark:text-slate-100">Revise favourites</h1>
      <p className="mt-2 text-slate-500 dark:text-slate-400">Quiz yourself on the words you starred. Choose how fresh they should be.</p>

      <div className="mt-8 rounded-3xl bg-white dark:bg-slate-800 p-6 shadow-sm ring-1 ring-slate-200 dark:ring-slate-700">
        <h2 className="font-semibold text-slate-800 dark:text-slate-200">Favourited within</h2>
        <div className="mt-3">
          <FavoriteRecencyChips value={recency} onChange={setRecency} />
        </div>
        <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">
          {poolSize} of your {favorites.size} favourite {favorites.size === 1 ? 'word' : 'words'} saved{recency === null ? ' at any time' : windowLabel}.
        </p>

        <h2 className="mt-6 font-semibold text-slate-800 dark:text-slate-200">Game</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {MODES.map((m) => (
            <button key={m.id} onClick={() => setMode(m.id)} className={chip(mode === m.id)}>
              {m.label}
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">{MODES.find((m) => m.id === mode)?.hint}</p>

        <h2 className="mt-6 font-semibold text-slate-800 dark:text-slate-200">Ask first</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {ORDERS.map((o) => (
            <button key={o.id} onClick={() => setOrder(o.id)} className={chip(order === o.id)}>
              {o.label}
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">{ORDERS.find((o) => o.id === order)?.hint} Matters when you have more favourites than questions.</p>

        <h2 className="mt-6 font-semibold text-slate-800 dark:text-slate-200">Number of questions</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {COUNTS.map((c) => (
            <button key={c} onClick={() => setCount(c)} className={chip(count === c)}>
              {c}
            </button>
          ))}
        </div>

        <button
          onClick={start}
          disabled={!canStart}
          className="mt-8 w-full rounded-xl bg-indigo-600 px-4 py-3 font-semibold text-white shadow-sm transition hover:bg-indigo-500 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40"
        >
          {canStart ? `Start · ${Math.min(count, poolSize)} ${Math.min(count, poolSize) === 1 ? 'question' : 'questions'}` : favorites.size === 0 ? 'Add favourites first' : `No favourites saved${windowLabel}`}
        </button>
        {!canStart && (
          <p className="mt-3 rounded-lg bg-amber-50 dark:bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-300">
            {favorites.size === 0 ? (
              <>
                You haven't starred any words yet. Open <Link to="/english/mnemonic-vocab/learn" className="font-semibold underline">Learn today</Link> and tap ☆ on the ones you want to keep.
              </>
            ) : (
              'Try a longer window — none of your favourites were saved that recently.'
            )}
          </p>
        )}
      </div>
    </div>
  )
}

function isWithin(iso: string | null | undefined, days: number): boolean {
  return !!iso && Date.now() - new Date(iso).getTime() <= days * 24 * 60 * 60 * 1000
}

/* ------------------------------------------------------------------ */
/* The game                                                            */
/* ------------------------------------------------------------------ */

interface MissedWord {
  word: MnemonicWord
  skipped: boolean
}

function Runner({ questions, onExit, onRestart }: { questions: ReviseQuestion[]; onExit: () => void; onRestart: () => void }) {
  const [index, setIndex] = useState(0)
  const [eliminated, setEliminated] = useState<Set<string>>(new Set())
  const [flashWrong, setFlashWrong] = useState<string | null>(null)
  const [hintShown, setHintShown] = useState(false)
  const [revealed, setRevealed] = useState(false)
  const [missedThis, setMissedThis] = useState(false)
  const [correct, setCorrect] = useState(0)
  const [wrongAttempts, setWrongAttempts] = useState(0)
  const [skipped, setSkipped] = useState(0)
  const [missed, setMissed] = useState<MissedWord[]>([])
  const [finished, setFinished] = useState(false)
  const [startTime] = useState(() => Date.now())
  const [elapsedMs, setElapsedMs] = useState(0)
  const [favorites, setFavorites] = useState<FavoriteMap>(() => getFavorites(MNEMONIC_BANK_KEY))
  const savedRef = useRef(false)

  const total = questions.length
  const q = questions[index]

  // Each new question (and the end screen) starts at the top, not wherever the last answer's card left the page.
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [index, finished])

  useEffect(() => {
    if (finished) return
    const id = setInterval(() => setElapsedMs(Date.now() - startTime), 250)
    return () => clearInterval(id)
  }, [finished, startTime])

  useEffect(() => {
    if (finished && !savedRef.current) {
      savedRef.current = true
      addSession(MNEMONIC_GAME_ID, { date: new Date().toISOString(), correct, wrongAttempts, skipped, total, timeMs: elapsedMs })
    }
  }, [finished, correct, wrongAttempts, skipped, total, elapsedMs])

  function next() {
    if (index + 1 >= total) {
      setFinished(true)
      return
    }
    setIndex((i) => i + 1)
    setEliminated(new Set())
    setFlashWrong(null)
    setHintShown(false)
    setRevealed(false)
    setMissedThis(false)
  }

  // Enter moves on once the answer is on screen.
  useEffect(() => {
    if (!revealed || finished) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Enter') next()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revealed, finished, index])

  function logMiss(isSkip: boolean) {
    setMissedThis(true)
    recordAnswer(q.word.n, false)
    setMissed((m) => (m.some((x) => x.word.n === q.word.n) ? m : [...m, { word: q.word, skipped: isSkip }]))
  }

  function choose(option: string) {
    if (revealed || eliminated.has(option)) return
    if (option === q.answer) {
      setRevealed(true)
      if (!missedThis) {
        setCorrect((c) => c + 1)
        recordAnswer(q.word.n, true)
      }
    } else {
      setEliminated((prev) => new Set(prev).add(option))
      setWrongAttempts((w) => w + 1)
      setFlashWrong(option)
      setTimeout(() => setFlashWrong(null), 300)
      if (!missedThis) logMiss(false)
    }
  }

  function skip() {
    if (revealed) return
    setSkipped((s) => s + 1)
    logMiss(true)
    setRevealed(true)
  }

  function toggleFav(id: string) {
    setFavorites((prev) => toggleFavorite(MNEMONIC_BANK_KEY, id, prev))
  }

  if (finished) {
    const accuracy = total > 0 ? Math.round((correct / total) * 1000) / 10 : 0
    return (
      <div className="mx-auto max-w-2xl px-4 py-10">
        <div className="rounded-3xl bg-white dark:bg-slate-800 p-8 shadow-sm ring-1 ring-slate-200 dark:ring-slate-700">
          <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Session complete</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Here's how your favourites held up.</p>
          <div className="mt-6 grid grid-cols-2 gap-4">
            <Stat label="Accuracy" value={`${accuracy}%`} accent="text-indigo-600 dark:text-indigo-400" />
            <Stat label="Time taken" value={formatTime(elapsedMs)} accent="text-slate-900 dark:text-slate-100" />
            <Stat label="Correct first try" value={`${correct} / ${total}`} accent="text-emerald-600 dark:text-emerald-400" />
            <Stat label="Mistakes" value={String(wrongAttempts)} accent="text-rose-600 dark:text-rose-400" />
          </div>

          {missed.length > 0 && (
            <div className="mt-6">
              <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Look at these again</h3>
              <div className="mt-2 divide-y divide-slate-100 dark:divide-slate-700 rounded-2xl bg-slate-50 dark:bg-slate-900/40">
                {missed.map(({ word, skipped: wasSkipped }) => (
                  <div key={word.id} className="flex gap-3 px-3 py-3">
                    <MnemonicImage n={word.n} alt="" className="h-16 w-24 shrink-0" />
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-bold text-slate-900 dark:text-slate-100">{word.word}</span>
                        <span className="text-xs text-slate-400 dark:text-slate-500">{word.hindi}</span>
                        <span className={['rounded-full px-2 py-0.5 text-xs font-semibold', wasSkipped ? 'bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300' : 'bg-rose-100 dark:bg-rose-500/15 text-rose-700 dark:text-rose-300'].join(' ')}>
                          {wasSkipped ? 'Skipped' : 'Missed'}
                        </span>
                      </div>
                      <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-300">{word.meaning}</p>
                      <p className="mt-0.5 text-xs text-amber-700 dark:text-amber-300">💡 {word.trick}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="mt-8 flex flex-col gap-3">
            <button onClick={onRestart} className="w-full rounded-xl bg-indigo-600 px-4 py-3 font-semibold text-white shadow-sm transition hover:bg-indigo-500 active:scale-[0.99]">
              Practice again
            </button>
            <button onClick={onExit} className="w-full rounded-xl bg-slate-100 dark:bg-slate-700 px-4 py-3 font-semibold text-slate-700 dark:text-slate-300 transition hover:bg-slate-200 active:scale-[0.99]">
              Change settings
            </button>
          </div>
        </div>
      </div>
    )
  }

  const isPicture = q.kind === 'picture'
  const isLast = index + 1 >= total

  return (
    <div className="mx-auto max-w-xl px-4 py-6">
      <div className="mb-4 flex items-center justify-between text-sm text-slate-500 dark:text-slate-400">
        <span>
          Question <span className="font-semibold text-slate-700 dark:text-slate-300">{index + 1}</span> / {total}
        </span>
        <span className="font-mono tabular-nums">{formatTime(elapsedMs)}</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-600">
        <div className="h-full rounded-full bg-indigo-500 transition-all duration-300" style={{ width: `${(index / total) * 100}%` }} />
      </div>
      <div className="mt-4 flex justify-center gap-4 text-xs font-medium">
        <span className="text-emerald-600 dark:text-emerald-400">✓ {correct}</span>
        <span className="text-amber-600 dark:text-amber-400">⏭ {skipped}</span>
        <span className="text-rose-600 dark:text-rose-400">✕ {wrongAttempts}</span>
      </div>

      <div className="mt-6 rounded-3xl bg-white dark:bg-slate-800 p-6 shadow-sm ring-1 ring-slate-200 dark:ring-slate-700">
        <div className="text-center">
          <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-indigo-500 dark:text-indigo-400">
            {isPicture ? 'Which word does this picture show?' : 'What does this word mean?'}
          </div>
          {isPicture ? (
            <MnemonicImage n={q.word.n} className="mx-auto h-56 sm:h-64" />
          ) : (
            <>
              <div className="flex items-center justify-center gap-3">
                <div className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-slate-100">{q.word.word}</div>
                <SpeakerButton key={q.word.id} word={q.word.word} />
              </div>
              <p className="mt-1 font-mono text-sm text-slate-500 dark:text-slate-400">/ {q.word.pronunciation} /</p>
              <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">{q.word.pos}</p>
            </>
          )}

          {!hintShown && !revealed && (
            <button
              onClick={() => setHintShown(true)}
              className="mt-4 rounded-full bg-amber-50 dark:bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-700 dark:text-amber-300 transition hover:bg-amber-100"
            >
              💡 {isPicture ? 'Show the Hindi meaning' : 'Show the picture'}
            </button>
          )}
          {hintShown && !revealed && (
            <div className="mt-4">
              {isPicture ? (
                <p className="text-sm font-semibold text-amber-700 dark:text-amber-300">Hint: {q.word.hindi}</p>
              ) : (
                <MnemonicImage n={q.word.n} className="mx-auto h-44" />
              )}
            </div>
          )}
        </div>

        <div className="mt-6 flex flex-col gap-2.5">
          {q.options.map((option) => {
            const isEliminated = eliminated.has(option)
            const isAnswer = option === q.answer
            const showCorrect = revealed && isAnswer
            const showWrong = flashWrong === option
            return (
              <button
                key={option}
                onClick={() => choose(option)}
                disabled={isEliminated || revealed}
                className={[
                  'rounded-xl border-2 px-4 py-3 text-left text-sm font-medium transition-colors',
                  showCorrect ? 'border-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 animate-pop' : '',
                  showWrong ? 'border-rose-400 bg-rose-50 dark:bg-rose-500/10 text-rose-800 dark:text-rose-300 animate-shake' : '',
                  !showCorrect && !showWrong && isEliminated ? 'border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-300 dark:text-slate-600 line-through' : '',
                  !showCorrect && !showWrong && !isEliminated && !revealed ? 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:border-indigo-300 hover:bg-indigo-50' : '',
                  !showCorrect && !showWrong && !isEliminated && revealed ? 'border-slate-100 dark:border-slate-700 text-slate-400 dark:text-slate-500' : '',
                ].join(' ')}
              >
                {option}
              </button>
            )
          })}
        </div>
      </div>

      {revealed ? (
        <div className="mt-5">
          <p className={['mb-3 text-center text-sm font-semibold', missedThis ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'].join(' ')}>
            {missedThis ? 'Here is the one to remember' : 'Correct!'}
          </p>
          <MnemonicCard
            word={q.word}
            hideImage={isPicture}
            isFavorite={favorites.has(q.word.id)}
            favoritedAt={favorites.get(q.word.id)}
            onToggleFavorite={() => toggleFav(q.word.id)}
          />
          <p className="mt-3 text-center text-xs text-slate-400 dark:text-slate-500">Mastered it? Un-star the word to drop it from future revision.</p>
          <button onClick={next} className="mt-4 w-full rounded-xl bg-indigo-600 px-4 py-3 font-semibold text-white shadow-sm transition hover:bg-indigo-500 active:scale-[0.99]">
            {isLast ? 'Finish ✓' : 'Next →'}
          </button>
        </div>
      ) : (
        <div className="mt-6 flex justify-center">
          <button onClick={skip} className="rounded-full bg-slate-100 dark:bg-slate-700 px-6 py-2 text-sm font-semibold text-slate-600 dark:text-slate-300 transition hover:bg-slate-200">
            Skip →
          </button>
        </div>
      )}

      <div className="mt-6 text-center">
        <button onClick={onExit} className="text-sm text-slate-400 dark:text-slate-500 underline-offset-2 hover:text-slate-600 hover:underline">
          End session
        </button>
      </div>
    </div>
  )
}
