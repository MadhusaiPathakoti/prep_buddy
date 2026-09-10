import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import BankQuiz from '../../components/BankQuiz'
import { getFullIdiomsBank } from '../../lib/idiomsStore'
import type { BankEntry } from '../../lib/types'

export default function IdiomQuiz() {
  const [bank, setBank] = useState<BankEntry[] | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    getFullIdiomsBank()
      .then((full) => {
        if (!cancelled) setBank(full)
      })
      .catch(() => {
        if (!cancelled) setError('Could not load the shared idiom bank. Check your connection and try again.')
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (error) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10">
        <Link to="/english/idioms" className="text-sm text-slate-400 hover:text-slate-600">
          ← Idioms
        </Link>
        <p className="mt-6 rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>
      </div>
    )
  }

  if (!bank) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10">
        <Link to="/english/idioms" className="text-sm text-slate-400 hover:text-slate-600">
          ← Idioms
        </Link>
        <p className="mt-6 text-slate-400">Loading the shared idiom bank…</p>
      </div>
    )
  }

  return (
    <BankQuiz
      gameId="idioms"
      bankKey="idioms"
      bank={bank}
      backTo="/english/idioms"
      backLabel="Idioms"
      title="Idioms Quiz"
      description="See an idiom, pick its correct meaning. Stuck? Use a hint."
      noun="idioms"
    />
  )
}
