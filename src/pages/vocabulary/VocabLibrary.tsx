import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import BankLibrary from '../../components/BankLibrary'
import { deleteWord, getFullVocabBank } from '../../lib/vocabularyStore'
import type { BankEntry } from '../../lib/types'

export default function VocabLibrary() {
  const [bank, setBank] = useState<BankEntry[] | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    getFullVocabBank()
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

  async function handleDelete(entry: BankEntry) {
    await deleteWord(entry.id)
    setBank((prev) => (prev ? prev.filter((w) => w.id !== entry.id) : prev))
  }

  if (error) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        <Link to="/english/vocabulary" className="text-sm text-slate-400 hover:text-slate-600">
          ← Vocabulary
        </Link>
        <p className="mt-6 rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>
      </div>
    )
  }

  if (!bank) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        <Link to="/english/vocabulary" className="text-sm text-slate-400 hover:text-slate-600">
          ← Vocabulary
        </Link>
        <p className="mt-6 text-slate-400">Loading the shared word bank…</p>
      </div>
    )
  }

  return (
    <BankLibrary
      bank={bank}
      bankKey="vocabulary"
      backTo="/english/vocabulary"
      backLabel="Vocabulary"
      title="Word Bank"
      nounPlural="words"
      addAction={{ to: '/english/vocabulary/add', label: '+ Add a word' }}
      onDelete={handleDelete}
    />
  )
}
