import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import BankLibrary from '../../components/BankLibrary'
import { deletePhrasalVerb, getFullPhrasalVerbsBank } from '../../lib/phrasalVerbsStore'
import type { BankEntry } from '../../lib/types'

export default function PhrasalVerbsLibrary() {
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

  async function handleDelete(entry: BankEntry) {
    await deletePhrasalVerb(entry.id)
    setBank((prev) => (prev ? prev.filter((w) => w.id !== entry.id) : prev))
  }

  if (error) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        <Link to="/english/phrasal-verbs" className="text-sm text-slate-400 hover:text-slate-600">
          ← Phrasal Verbs
        </Link>
        <p className="mt-6 rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>
      </div>
    )
  }

  if (!bank) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        <Link to="/english/phrasal-verbs" className="text-sm text-slate-400 hover:text-slate-600">
          ← Phrasal Verbs
        </Link>
        <p className="mt-6 text-slate-400">Loading the shared phrasal verb bank…</p>
      </div>
    )
  }

  return (
    <BankLibrary
      bank={bank}
      bankKey="phrasal-verbs"
      backTo="/english/phrasal-verbs"
      backLabel="Phrasal Verbs"
      title="Phrasal Verb Bank"
      nounPlural="phrasal verbs"
      addAction={{ to: '/english/phrasal-verbs/add', label: '+ Add a phrasal verb' }}
      onDelete={handleDelete}
    />
  )
}
