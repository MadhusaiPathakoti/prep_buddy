import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import BankQuiz from '../../components/BankQuiz'
import { getFullOneWordBank } from '../../lib/oneWordStore'
import type { BankEntry } from '../../lib/types'

export default function OneWordQuiz() {
  const [bank, setBank] = useState<BankEntry[] | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    getFullOneWordBank()
      .then((full) => {
        if (!cancelled) setBank(full)
      })
      .catch(() => {
        if (!cancelled) setError('Could not load the shared phrase bank. Check your connection and try again.')
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (error) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10">
        <Link to="/english/one-word-substitution" className="text-sm text-slate-400 hover:text-slate-600">
          ← One Word Substitution
        </Link>
        <p className="mt-6 rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>
      </div>
    )
  }

  if (!bank) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10">
        <Link to="/english/one-word-substitution" className="text-sm text-slate-400 hover:text-slate-600">
          ← One Word Substitution
        </Link>
        <p className="mt-6 text-slate-400">Loading the shared phrase bank…</p>
      </div>
    )
  }

  return (
    <BankQuiz
      gameId="one-word-substitution"
      bank={bank}
      backTo="/english/one-word-substitution"
      backLabel="One Word Substitution"
      title="One Word Substitution Quiz"
      description="See a phrase, pick the one word that means the same. Stuck? Use a hint."
      noun="phrases"
    />
  )
}
