import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import BankLibrary from '../../components/BankLibrary'
import { deleteAntonymEntry, getFullAntonymsBank } from '../../lib/antonymsStore'
import type { BankEntry } from '../../lib/types'

export default function AntonymsLibrary() {
  const [bank, setBank] = useState<BankEntry[] | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    getFullAntonymsBank()
      .then((full) => {
        if (!cancelled) setBank(full)
      })
      .catch(() => {
        if (!cancelled) setError('Could not load the shared antonyms bank. Check your connection and try again.')
      })
    return () => {
      cancelled = true
    }
  }, [])

  async function handleDelete(entry: BankEntry) {
    await deleteAntonymEntry(entry.id)
    setBank((prev) => (prev ? prev.filter((w) => w.id !== entry.id) : prev))
  }

  if (error) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        <Link to="/english/antonyms" className="text-sm text-slate-400 hover:text-slate-600">
          ← Antonyms
        </Link>
        <p className="mt-6 rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>
      </div>
    )
  }

  if (!bank) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        <Link to="/english/antonyms" className="text-sm text-slate-400 hover:text-slate-600">
          ← Antonyms
        </Link>
        <p className="mt-6 text-slate-400">Loading the shared antonyms bank…</p>
      </div>
    )
  }

  return (
    <BankLibrary
      bank={bank}
      bankKey="antonyms"
      backTo="/english/antonyms"
      backLabel="Antonyms"
      title="Antonyms Bank"
      nounPlural="words"
      onDelete={handleDelete}
    />
  )
}
