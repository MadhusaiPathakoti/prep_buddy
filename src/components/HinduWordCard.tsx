import { highlight } from './highlightWord'
import LearnedButton from './LearnedButton'
import { WordChips } from './MnemonicCard'
import { SpeakerButton } from './Pronounce'
import { formatFavoritedDate } from '../lib/favorites'
import type { HinduWord } from '../lib/hinduVocab'

interface HinduWordCardProps {
  word: HinduWord
  isFavorite: boolean
  /** ISO time the word was favourited (shown under the star). */
  favoritedAt?: string | null
  onToggleFavorite: () => void
  /** When given, a "mark as learned" button is shown at the bottom. */
  learned?: { isLearned: boolean; onToggle: () => void }
}

/** One word of The Hindu Vocabulary: meaning in Hindi and English, five synonyms, five antonyms and two example sentences. */
export default function HinduWordCard({ word, isFavorite, favoritedAt, onToggleFavorite, learned }: HinduWordCardProps) {
  return (
    <div className="rounded-2xl bg-white dark:bg-slate-800 p-5 shadow-sm ring-1 ring-slate-200 dark:ring-slate-700">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <h3 className="text-xl font-extrabold tracking-tight text-slate-900 dark:text-slate-100">{word.word}</h3>
          <SpeakerButton word={word.word} />
          <span className="rounded-full bg-indigo-100 dark:bg-indigo-500/15 px-2.5 py-0.5 text-xs font-semibold text-indigo-700 dark:text-indigo-300">{word.pos}</span>
        </div>
        <div className="shrink-0 text-right">
          <button
            onClick={onToggleFavorite}
            aria-label={isFavorite ? `Remove ${word.word} from favourites` : `Add ${word.word} to favourites`}
            aria-pressed={isFavorite}
            className={['text-2xl leading-none transition', isFavorite ? 'text-amber-400 hover:text-amber-500' : 'text-slate-300 dark:text-slate-600 hover:text-amber-300'].join(' ')}
          >
            {isFavorite ? '★' : '☆'}
          </button>
          {isFavorite && <p className="mt-1 text-xs text-amber-500 dark:text-amber-400">{favoritedAt ? `Saved ${formatFavoritedDate(favoritedAt)}` : 'Saved earlier'}</p>}
        </div>
      </div>

      <p className="mt-2 text-lg font-bold text-slate-800 dark:text-slate-200">{word.hindi}</p>
      <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-300">{word.meaning}</p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <WordChips label="Synonyms" words={word.synonyms} tone="emerald" />
        <WordChips label="Antonyms" words={word.antonyms} tone="rose" />
      </div>

      <div className="mt-4 space-y-2">
        <span className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Examples</span>
        {word.examples.map((s, i) => (
          <p key={i} className="rounded-xl border border-dashed border-slate-200 dark:border-slate-700 px-3 py-2 text-sm italic leading-relaxed text-slate-600 dark:text-slate-300">
            {highlight(s, word.word)}
          </p>
        ))}
      </div>

      {learned && <LearnedButton learned={learned.isLearned} onToggle={learned.onToggle} word={word.word} />}
    </div>
  )
}
