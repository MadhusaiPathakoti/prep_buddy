import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import BankQuiz from '../../components/BankQuiz'
import { getFullPhrasalVerbsBank } from '../../lib/phrasalVerbsStore'
import type { BankEntry } from '../../lib/types'

export default function PhrasalVerbsQuiz() {
  const [bank, setBank] = useState<BankEntry[] | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    getFullPhrasalVerbsBank()
      .then((full) => {
        if (!cancelled) setBank(full)
      })
      .catch(() => {
        if (!cancelled) setError('Could not load the shared phrasal verb bank. Check your connection and try again.')
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (error) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10">
        <Link to="/english/phrasal-verbs" className="text-sm text-slate-400 hover:text-slate-600">
          ← Phrasal Verbs
        </Link>
        <p className="mt-6 rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>
      </div>
    )
  }

  if (!bank) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10">
        <Link to="/english/phrasal-verbs" className="text-sm text-slate-400 hover:text-slate-600">
          ← Phrasal Verbs
        </Link>
        <p className="mt-6 text-slate-400">Loading the shared phrasal verb bank…</p>
      </div>
    )
  }

  return (
    <BankQuiz
      gameId="phrasal-verbs"
      bankKey="phrasal-verbs"
      bank={bank}
      backTo="/english/phrasal-verbs"
      backLabel="Phrasal Verbs"
      title="Phrasal Verbs Quiz"
      description="See a phrasal verb, pick its correct meaning. Stuck? Use a hint."
      noun="phrasal verbs"
    />
  )
}
