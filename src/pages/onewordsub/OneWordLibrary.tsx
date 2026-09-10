import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import BankLibrary from '../../components/BankLibrary'
import { deleteOneWordEntry, getFullOneWordBank } from '../../lib/oneWordStore'
import type { BankEntry } from '../../lib/types'

export default function OneWordLibrary() {
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

  async function handleDelete(entry: BankEntry) {
    await deleteOneWordEntry(entry.id)
    setBank((prev) => (prev ? prev.filter((w) => w.id !== entry.id) : prev))
  }

  if (error) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        <Link to="/english/one-word-substitution" className="text-sm text-slate-400 hover:text-slate-600">
          ← One Word Substitution
        </Link>
        <p className="mt-6 rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>
      </div>
    )
  }

  if (!bank) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        <Link to="/english/one-word-substitution" className="text-sm text-slate-400 hover:text-slate-600">
          ← One Word Substitution
        </Link>
        <p className="mt-6 text-slate-400">Loading the shared phrase bank…</p>
      </div>
    )
  }

  return (
    <BankLibrary
      bank={bank}
      bankKey="one-word-substitution"
      backTo="/english/one-word-substitution"
      backLabel="One Word Substitution"
      title="Phrase Bank"
      nounPlural="phrases"
      onDelete={handleDelete}
    />
  )
}
