import { Link } from 'react-router-dom'
import HinduWordCard from '../../components/HinduWordCard'
import LearnToday from '../../components/LearnToday'
import { HINDU_BANK_KEY, hinduLearn } from '../../lib/hinduVocab'
import { useHinduBank } from '../../lib/useHinduBank'

const NEXT_LINKS = [
  { to: '/english/hindu-vocab/practice', label: 'Play the practice game' },
  { to: '/english/hindu-vocab/library', label: 'Open the word list' },
]

export default function HinduLearn() {
  const { bank, error } = useHinduBank()
  if (error || !bank) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10">
        <Link to="/english/hindu-vocab" className="text-sm text-slate-400 dark:text-slate-500 hover:text-slate-600">
          ← The Hindu Vocabulary
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
      store={hinduLearn}
      favoritesKey={HINDU_BANK_KEY}
      backTo="/english/hindu-vocab"
      backLabel="The Hindu Vocabulary"
      nextLinks={NEXT_LINKS}
      renderCard={(w, fav) => <HinduWordCard word={w} isFavorite={fav.isFavorite} favoritedAt={fav.favoritedAt} onToggleFavorite={fav.onToggle} />}
    />
  )
}
