import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getFavorites } from '../../lib/favorites'
import { loadMnemonicBank, MNEMONIC_BANK_KEY, mnemonicLearn } from '../../lib/mnemonicVocab'

const CARDS = [
  {
    to: '/english/mnemonic-vocab/learn',
    icon: '🌱',
    title: 'Learn today',
    description: 'A few random new words a day from across the whole alphabet. Mark each one learned, and star the ones to keep revising.',
    cta: 'Start →',
  },
  {
    to: '/english/mnemonic-vocab/library',
    icon: '📖',
    title: 'Word library',
    description: 'Browse and search every word with its picture, meaning, mnemonic, synonyms, antonyms and examples.',
    cta: 'Browse →',
  },
  {
    to: '/english/mnemonic-vocab/revise',
    icon: '🎯',
    title: 'Revise favourites',
    description: 'Play a picture-and-meaning game on the words you starred — pick how recently you saved them.',
    cta: 'Play →',
  },
]

export default function MnemonicHub() {
  const [total, setTotal] = useState<number | null>(null)
  const [progress] = useState(() => mnemonicLearn.getProgress())
  const [favouriteCount] = useState(() => getFavorites(MNEMONIC_BANK_KEY).size)

  useEffect(() => {
    let cancelled = false
    loadMnemonicBank()
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
        <h1 className="text-3xl font-extrabold text-slate-900 dark:text-slate-100">Mnemonic Vocabulary</h1>
        <p className="mt-2 text-slate-500 dark:text-slate-400">
          {total ?? '1000+'} words, each with a cartoon, a memory trick, synonyms, antonyms and two examples. Learn a few a day, star them, then revise the freshest ones.
        </p>
      </div>

      <div className="mb-8 grid grid-cols-3 gap-3 text-center">
        <Tally label="Learned today" value={String(mnemonicLearn.learnedOn(progress))} />
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
