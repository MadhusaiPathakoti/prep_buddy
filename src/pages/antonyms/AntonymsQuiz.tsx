import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import WordBankQuiz from '../../components/WordBankQuiz'
import { getFullWordBankCapped } from '../../lib/wordBankStore'
import type { WordEntry } from '../../lib/types'

export default function AntonymsQuiz() {
  const [bank, setBank] = useState<WordEntry[] | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    getFullWordBankCapped()
      .then((full) => {
        if (!cancelled) setBank(full)
      })
      .catch(() => {
        if (!cancelled) setError('Could not load the shared word bank. Check your connection and try again.')
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (error) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10">
        <Link to="/english/antonyms" className="text-sm text-slate-400 hover:text-slate-600">
          ← Antonyms
        </Link>
        <p className="mt-6 rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>
      </div>
    )
  }

  if (!bank) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10">
        <Link to="/english/antonyms" className="text-sm text-slate-400 hover:text-slate-600">
          ← Antonyms
        </Link>
        <p className="mt-6 text-slate-400">Loading the shared word bank…</p>
      </div>
    )
  }

  return (
    <WordBankQuiz
      gameId="antonyms"
      field="antonyms"
      bank={bank}
      backTo="/english/antonyms"
      backLabel="Antonyms"
      title="Antonyms Quiz"
      description="See a word, pick its opposite. Stuck? Use a hint."
      noun="words"
    />
  )
}
