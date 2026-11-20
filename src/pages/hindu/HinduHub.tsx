import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getFavorites } from '../../lib/favorites'
import { HINDU_BANK_KEY, hinduLearn, loadHinduBank } from '../../lib/hinduVocab'

const CARDS = [
  {
    to: '/english/hindu-vocab/learn',
    icon: '🌱',
    title: 'Learn today',
    description: 'A few random new words a day from across the whole alphabet. Mark each one learned, and star the ones to keep revising.',
    cta: 'Start →',
  },
  {
    to: '/english/hindu-vocab/library',
    icon: '📖',
    title: 'Study the words',
    description: 'Search all the words, jump to a letter, and see meanings, synonyms, antonyms and examples.',
    cta: 'Browse →',
  },
  {
    to: '/english/hindu-vocab/practice',
    icon: '🎯',
    title: 'Practice game',
    description: 'Meanings, Hindi, synonyms, antonyms and fill-in-the-blank — pick a mode, a letter and how many questions.',
    cta: 'Play →',
  },
]

export default function HinduHub() {
  const [total, setTotal] = useState<number | null>(null)
  const [progress] = useState(() => hinduLearn.getProgress())
  const [favouriteCount] = useState(() => getFavorites(HINDU_BANK_KEY).size)

  useEffect(() => {
    let cancelled = false
    loadHinduBank()
      .then((bank) => {
        if (!cancelled) setTotal(bank.length)
      })
      .catch(() => {
        // The count is decoration; the pages themselves show a proper error.
      })
    return () => {
      cancelled = true
    }
  }, [])

  const learned = Object.keys(progress.learned).length

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <Link to="/english" className="text-sm text-slate-400 dark:text-slate-500 hover:text-slate-600">
        ← English
      </Link>
      <div className="mb-6 mt-2">
        <h1 className="text-3xl font-extrabold text-slate-900 dark:text-slate-100">The Hindu Vocabulary</h1>
        <p className="mt-2 text-slate-500 dark:text-slate-400">
          Power words from The Hindu editorials — Hindi and English meanings, five synonyms, five antonyms and two example sentences each.
        </p>
      </div>

      <div className="mb-8 grid grid-cols-3 gap-3 text-center">
        <Tally label="Learned today" value={String(hinduLearn.learnedOn(progress))} />
        <Tally label="Words learned" value={total ? `${learned} / ${total}` : String(learned)} />
        <Tally label="★ Favourites" value={String(favouriteCount)} />
      </div>

      <div className="grid gap-5 sm:grid-cols-3">
        {CARDS.map((c) => (
          <Link
            key={c.to}
            to={c.to}
            className="group rounded-3xl bg-white dark:bg-slate-800 p-6 shadow-sm ring-1 ring-slate-200 dark:ring-slate-700 transition hover:-translate-y-0.5 hover:shadow-md"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-50 dark:bg-indigo-500/10 text-2xl">{c.icon}</div>
            <h2 className="mt-4 text-xl font-bold text-slate-900 dark:text-slate-100">{c.title}</h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{c.description}</p>
            <div className="mt-4 text-sm font-semibold text-indigo-600 dark:text-indigo-400 transition group-hover:translate-x-0.5">{c.cta}</div>
          </Link>
        ))}
      </div>
    </div>
  )
}

function Tally({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-white dark:bg-slate-800 px-3 py-3 shadow-sm ring-1 ring-slate-200 dark:ring-slate-700">
      <div className="text-lg font-bold text-indigo-600 dark:text-indigo-400">{value}</div>
      <div className="text-xs text-slate-500 dark:text-slate-400">{label}</div>
    </div>
  )
}
