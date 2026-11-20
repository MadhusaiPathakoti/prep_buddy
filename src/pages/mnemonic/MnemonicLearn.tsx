import { Link } from 'react-router-dom'
import LearnToday from '../../components/LearnToday'
import MnemonicCard from '../../components/MnemonicCard'
import { MNEMONIC_BANK_KEY, mnemonicLearn } from '../../lib/mnemonicVocab'
import { useMnemonicBank } from '../../lib/useMnemonicBank'

const NEXT_LINKS = [
  { to: '/english/mnemonic-vocab/revise', label: 'Revise favourites' },
  { to: '/english/mnemonic-vocab/library', label: 'Open the library' },
]

export default function MnemonicLearn() {
  const { bank, error } = useMnemonicBank()
  if (error || !bank) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10">
        <Link to="/english/mnemonic-vocab" className="text-sm text-slate-400 dark:text-slate-500 hover:text-slate-600">
          ← Mnemonic Vocabulary
        </Link>
        {error ? (
          <p className="mt-6 rounded-lg bg-rose-50 dark:bg-rose-500/10 px-4 py-3 text-sm text-rose-700 dark:text-rose-300">Could not load the word bank. Check your connection and try again.</p>
        ) : (
          <p className="mt-6 text-slate-400 dark:text-slate-500">Loading the words…</p>
        )}
      </div>
    )
  }
  return (
    <LearnToday
      items={bank}
      store={mnemonicLearn}
      favoritesKey={MNEMONIC_BANK_KEY}
      backTo="/english/mnemonic-vocab"
      backLabel="Mnemonic Vocabulary"
      nextLinks={NEXT_LINKS}
      renderCard={(w, fav) => (
        <MnemonicCard word={w} isFavorite={fav.isFavorite} favoritedAt={fav.favoritedAt} onToggleFavorite={fav.onToggle} />
      )}
    />
  )
}
