import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import BankQuiz from '../../components/BankQuiz'
import { getFullSynonymsBank } from '../../lib/synonymsStore'
import type { BankEntry } from '../../lib/types'

export default function SynonymsQuiz() {
  const [bank, setBank] = useState<BankEntry[] | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    getFullSynonymsBank()
      .then((full) => {
        if (!cancelled) setBank(full)
      })
      .catch(() => {
        if (!cancelled) setError('Could not load the shared synonyms bank. Check your connection and try again.')
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (error) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10">
        <Link to="/english/synonyms" className="text-sm text-slate-400 hover:text-slate-600">
          ← Synonyms
        </Link>
        <p className="mt-6 rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>
      </div>
    )
  }

  if (!bank) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10">
        <Link to="/english/synonyms" className="text-sm text-slate-400 hover:text-slate-600">
          ← Synonyms
        </Link>
        <p className="mt-6 text-slate-400">Loading the shared synonyms bank…</p>
      </div>
    )
  }

  return (
    <BankQuiz
      gameId="synonyms"
      bankKey="synonyms"
      bank={bank}
      backTo="/english/synonyms"
      backLabel="Synonyms"
      title="Synonyms Quiz"
      description="See a word, pick its synonym. Stuck? Use a hint."
      noun="words"
    />
  )
}
