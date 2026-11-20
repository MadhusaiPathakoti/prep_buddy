import { useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import FavoriteRecencyChips from '../../components/FavoriteRecencyChips'
import MCQQuizRunner from '../../components/MCQQuizRunner'
import { getFavorites, isFavoritedWithin } from '../../lib/favorites'
import type { MCQQuestion } from '../../lib/generators'
import {
  buildHinduQuestions,
  HINDU_BANK_KEY,
  HINDU_GAME_ID,
  HINDU_MODES,
  isFillable,
  type HinduMode,
  type HinduWord,
} from '../../lib/hinduVocab'
import { useHinduBank } from '../../lib/useHinduBank'

const COUNTS = [10, 20, 30, 50]
const chip = (on: boolean) =>
  [
    'rounded-lg px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-40',
    on ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200',
  ].join(' ')

function shuffle<T>(arr: readonly T[]): T[] {
  const out = [...arr]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

export default function HinduPractice() {
  const { bank, error } = useHinduBank()
  const back = (
    <Link to="/english/hindu-vocab" className="text-sm text-slate-400 dark:text-slate-500 hover:text-slate-600">
      ← The Hindu Vocabulary
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
  return <Practice bank={bank} back={back} />
}

function Practice({ bank, back }: { bank: HinduWord[]; back: ReactNode }) {
  const [mode, setMode] = useState<HinduMode>('mixed')
  const [count, setCount] = useState(20)
  const [letter, setLetter] = useState<string | null>(null)
  const [favoritesOnly, setFavoritesOnly] = useState(false)
  const [favoriteRecency, setFavoriteRecency] = useState<number | null>(null)
  const [questions, setQuestions] = useState<MCQQuestion[] | null>(null)
  const [sessionKey, setSessionKey] = useState(0)

  const favorites = getFavorites(HINDU_BANK_KEY)
  const hasFavorites = favorites.size > 0
  const letters = useMemo(() => [...new Set(bank.map((w) => w.word.charAt(0).toUpperCase()))].sort(), [bank])
  const fillable = useMemo(() => new Set(bank.filter(isFillable).map((w) => w.id)), [bank])

  const pool = bank.filter(
    (w) =>
      (letter === null || w.word.charAt(0).toUpperCase() === letter) &&
      (!favoritesOnly || isFavoritedWithin(favorites, w.id, favoriteRecency)) &&
      (mode !== 'fill' || fillable.has(w.id)),
  )
  const canStart = pool.length > 0
  const asked = Math.min(count, pool.length)
  const favoritedLabel = favoritesOnly && favoriteRecency !== null ? ` favourited in the last ${favoriteRecency} ${favoriteRecency === 1 ? 'day' : 'days'}` : ''

  function generate() {
    return buildHinduQuestions(bank, shuffle(pool).slice(0, count), mode)
  }

  function start() {
    setQuestions(generate())
    setSessionKey((k) => k + 1)
  }

  if (questions) {
    return (
      <MCQQuizRunner
        key={sessionKey}
        gameId={HINDU_GAME_ID}
        questions={questions}
        pronounce={{ term: true }}
        onExit={() => setQuestions(null)}
        onRestart={() => {
          setQuestions(generate())
          setSessionKey((k) => k + 1)
        }}
      />
    )
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      {back}
      <h1 className="mt-2 text-3xl font-extrabold text-slate-900 dark:text-slate-100">Practice game</h1>
      <p className="mt-2 text-slate-500 dark:text-slate-400">Test yourself on words from The Hindu. Stuck? Use a hint; every answer is explained afterwards.</p>

      <div className="mt-8 rounded-3xl bg-white dark:bg-slate-800 p-6 shadow-sm ring-1 ring-slate-200 dark:ring-slate-700">
        <h2 className="font-semibold text-slate-800 dark:text-slate-200">Game</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {HINDU_MODES.map((m) => (
            <button key={m.id} onClick={() => setMode(m.id)} className={chip(mode === m.id)}>
              {m.label}
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">{HINDU_MODES.find((m) => m.id === mode)?.hint}</p>

        <h2 className="mt-6 font-semibold text-slate-800 dark:text-slate-200">Words starting with</h2>
        <div className="mt-3 flex flex-wrap gap-1.5">
          <button onClick={() => setLetter(null)} className={chip(letter === null)}>
            Any letter
          </button>
          {letters.map((l) => (
            <button key={l} onClick={() => setLetter(letter === l ? null : l)} aria-pressed={letter === l} className={chip(letter === l)}>
              {l}
            </button>
          ))}
        </div>

        <h2 className="mt-6 font-semibold text-slate-800 dark:text-slate-200">Source</h2>
        <button onClick={() => setFavoritesOnly((v) => !v)} aria-pressed={favoritesOnly} className={`mt-3 flex items-center gap-2 ${chip(favoritesOnly)}`}>
          <span>★</span> Only from favourites
        </button>
        {favoritesOnly && !hasFavorites && (
          <p className="mt-3 rounded-lg bg-amber-50 dark:bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-300">
            You haven't starred any words yet. Open the <Link to="/english/hindu-vocab/library" className="font-semibold underline">word list</Link> and tap ☆ on the ones you want to revise.
          </p>
        )}
        {favoritesOnly && hasFavorites && (
          <>
            <h2 className="mt-6 font-semibold text-slate-800 dark:text-slate-200">Favourited within</h2>
            <div className="mt-3">
              <FavoriteRecencyChips value={favoriteRecency} onChange={setFavoriteRecency} />
            </div>
          </>
        )}

        <h2 className="mt-6 font-semibold text-slate-800 dark:text-slate-200">Number of questions</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {COUNTS.map((c) => (
            <button key={c} onClick={() => setCount(c)} className={chip(count === c)}>
              {c}
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">
          {pool.length} {favoritesOnly ? 'favourite ' : ''}
          {pool.length === 1 ? 'word' : 'words'} available{letter ? ` starting with ${letter}` : ''}
          {favoritedLabel}
          {mode === 'fill' ? ' (those with a sentence that can be turned into a blank)' : ''}.
        </p>

        <button
          onClick={start}
          disabled={!canStart}
          className="mt-8 w-full rounded-xl bg-indigo-600 px-4 py-3 font-semibold text-white shadow-sm transition hover:bg-indigo-500 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40"
        >
          {canStart ? `Start · ${asked} ${asked === 1 ? 'question' : 'questions'}` : favoritesOnly && !hasFavorites ? 'Add favourites first' : 'No words match these settings'}
        </button>
      </div>
    </div>
  )
}
