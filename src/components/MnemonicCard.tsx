import type { ReactNode } from 'react'
import { SpeakerButton } from './Pronounce'
import { formatFavoritedDate } from '../lib/favorites'
import { mnemonicImageUrl, type MnemonicWord } from '../lib/mnemonicVocab'

/** The cartoon for a word. Fixed-height frame so portrait and landscape pictures lay out alike and the page doesn't jump as they load. */
export function MnemonicImage({ n, alt = 'Picture clue', className = '' }: { n: number; alt?: string; className?: string }) {
  return (
    <div className={`flex items-center justify-center overflow-hidden rounded-xl bg-slate-50 dark:bg-slate-900/40 ${className}`}>
      <img src={mnemonicImageUrl(n)} alt={alt} loading="lazy" decoding="async" className="max-h-full max-w-full object-contain" />
    </div>
  )
}

/** Bolds the word (and forms like "abashed" / "abating") wherever it appears in an example sentence. */
function highlight(sentence: string, word: string): ReactNode {
  const clean = word.replace(/[^\p{L}\s'-]/gu, '').trim()
  if (!clean) return sentence
  const stem = clean.length > 4 ? clean.slice(0, -1) : clean
  const escaped = stem.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const parts = sentence.split(new RegExp(`(${escaped}[\\p{L}'-]*)`, 'iu'))
  return parts.map((p, i) =>
    i % 2 === 1 ? (
      <strong key={i} className="font-semibold not-italic text-indigo-600 dark:text-indigo-400">
        {p}
      </strong>
    ) : (
      p
    ),
  )
}

interface MnemonicCardProps {
  word: MnemonicWord
  isFavorite?: boolean
  /** ISO time the word was favourited (shown under the star). */
  favoritedAt?: string | null
  /** When given, a ☆/★ button is shown. */
  onToggleFavorite?: () => void
  /** Hide the cartoon (e.g. when the surrounding screen already shows it). */
  hideImage?: boolean
}

/** Everything about one word: picture, pronunciation, meaning, memory trick, synonyms/antonyms and two example sentences. */
export default function MnemonicCard({ word, isFavorite = false, favoritedAt, onToggleFavorite, hideImage = false }: MnemonicCardProps) {
  return (
    <div className="rounded-3xl bg-white dark:bg-slate-800 p-5 shadow-sm ring-1 ring-slate-200 dark:ring-slate-700">
      {!hideImage && <MnemonicImage n={word.n} alt={`Cartoon showing the meaning of ${word.word}`} className="mb-4 h-52 sm:h-60" />}

      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-slate-100">{word.word}</h3>
            <SpeakerButton word={word.word} />
            <span className="rounded-full bg-indigo-100 dark:bg-indigo-500/15 px-2.5 py-0.5 text-xs font-semibold text-indigo-700 dark:text-indigo-300">{word.pos}</span>
          </div>
          <p className="mt-0.5 font-mono text-sm text-slate-500 dark:text-slate-400">/ {word.pronunciation} /</p>
        </div>
        {onToggleFavorite && (
          <div className="shrink-0 text-right">
            <button
              onClick={onToggleFavorite}
              aria-label={isFavorite ? `Remove ${word.word} from favourites` : `Add ${word.word} to favourites`}
              aria-pressed={isFavorite}
              className={['text-2xl leading-none transition', isFavorite ? 'text-amber-400 hover:text-amber-500' : 'text-slate-300 dark:text-slate-600 hover:text-amber-300'].join(' ')}
            >
              {isFavorite ? '★' : '☆'}
            </button>
            {isFavorite && (
              <p className="mt-1 text-xs text-amber-500 dark:text-amber-400">{favoritedAt ? `Saved ${formatFavoritedDate(favoritedAt)}` : 'Saved earlier'}</p>
            )}
          </div>
        )}
      </div>

      <p className="mt-3 text-lg font-bold text-slate-800 dark:text-slate-200">{word.hindi}</p>
      <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-300">{word.meaning}</p>

      <div className="mt-4 rounded-xl bg-amber-50 dark:bg-amber-500/10 px-4 py-3 ring-1 ring-amber-200/70 dark:ring-amber-500/20">
        <span className="text-xs font-bold uppercase tracking-wide text-amber-700 dark:text-amber-300">💡 Mnemonic</span>
        <p className="mt-1 text-sm leading-relaxed text-slate-800 dark:text-slate-200">{word.trick}</p>
      </div>

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
    </div>
  )
}

function WordChips({ label, words, tone }: { label: string; words: string[]; tone: 'emerald' | 'rose' }) {
  const chip =
    tone === 'emerald'
      ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
      : 'bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-300'
  return (
    <div>
      <span className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</span>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {words.length === 0 ? (
          <span className="text-sm text-slate-400 dark:text-slate-500">—</span>
        ) : (
          words.map((w) => (
            <span key={w} className={`rounded-full px-2.5 py-1 text-xs font-medium ${chip}`}>
              {w}
            </span>
          ))
        )}
      </div>
    </div>
  )
}
