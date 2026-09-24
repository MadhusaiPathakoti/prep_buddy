import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { lookupWord } from '../../lib/dictionaryApi'
import { addCustomWord, getCustomWordById } from '../../lib/vocabularyStore'
import { getFavoriteIds, toggleFavorite } from '../../lib/favorites'
import { VOCAB_BANK } from '../../data/vocabulary'
import type { BankEntry, Difficulty } from '../../lib/types'

const BANK_KEY = 'vocabulary'

const DIFFICULTIES: { id: Difficulty; label: string }[] = [
  { id: 'easy', label: 'Easy' },
  { id: 'medium', label: 'Medium' },
  { id: 'hard', label: 'Hard' },
]

function slugify(word: string): string {
  return word
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

type Status = 'idle' | 'loading' | 'error' | 'success'

export default function AddWord() {
  const [word, setWord] = useState('')
  const [difficulty, setDifficulty] = useState<Difficulty>('medium')
  const [status, setStatus] = useState<Status>('idle')
  const [errorMessage, setErrorMessage] = useState('')
  const [added, setAdded] = useState<BankEntry | null>(null)
  const [duplicate, setDuplicate] = useState<BankEntry | null>(null)
  const [duplicateIsFavorite, setDuplicateIsFavorite] = useState(false)

  function handleToggleDuplicateFavorite() {
    if (!duplicate) return
    const next = toggleFavorite(BANK_KEY, duplicate.id, getFavoriteIds(BANK_KEY))
    setDuplicateIsFavorite(next.has(duplicate.id))
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const trimmed = word.trim()
    if (trimmed === '') return

    setStatus('loading')
    setErrorMessage('')
    setDuplicate(null)
    try {
      // The seed bank is checked in memory (no network call); the custom collection is
      // checked by a single targeted doc read rather than fetching the whole (and growing)
      // collection — and run alongside the dictionary lookup, since the two don't depend on
      // each other.
      const seedMatch = VOCAB_BANK.find((w) => w.term.toLowerCase() === trimmed.toLowerCase())
      const [existingCustom, lookupResult] = await Promise.all([
        seedMatch ? Promise.resolve(null) : getCustomWordById(`custom-${slugify(trimmed)}`),
        lookupWord(trimmed),
      ])
      const existing = seedMatch ?? existingCustom
      if (existing) {
        setStatus('error')
        setErrorMessage(`"${existing.term}" is already in the vocabulary bank.`)
        setDuplicate(existing)
        setDuplicateIsFavorite(getFavoriteIds(BANK_KEY).has(existing.id))
        return
      }

      const { meaning, example, hint, partOfSpeech } = lookupResult
      const entry: BankEntry = {
        id: `custom-${slugify(trimmed)}`,
        term: trimmed.charAt(0).toUpperCase() + trimmed.slice(1),
        meaning,
        example,
        hint,
        difficulty,
        createdAt: new Date().toISOString(),
        ...(partOfSpeech ? { partOfSpeech } : {}),
      }
      await addCustomWord(entry)
      // New words are automatically starred for daily revision.
      toggleFavorite(BANK_KEY, entry.id, getFavoriteIds(BANK_KEY))
      setAdded(entry)
      setStatus('success')
      setWord('')
    } catch (err) {
      setStatus('error')
      setErrorMessage(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <Link to="/english/vocabulary" className="text-sm text-slate-400 hover:text-slate-600">
        ← Vocabulary
      </Link>
      <h1 className="mt-2 text-3xl font-extrabold text-slate-900">Add a Word</h1>
      <p className="mt-2 text-slate-500">
        Type a word — we'll look up its meaning and an example sentence and add it to the shared vocabulary bank for
        everyone, for good.
      </p>

      <form onSubmit={handleSubmit} className="mt-8 rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
        <label htmlFor="new-word" className="block text-sm font-semibold text-slate-800">
          Word
        </label>
        <input
          id="new-word"
          value={word}
          onChange={(e) => {
            setWord(e.target.value)
            if (status !== 'idle') setStatus('idle')
          }}
          placeholder="e.g. serendipity"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          className="mt-2 w-full rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-lg text-slate-900 outline-none focus:border-indigo-400"
        />

        <h2 className="mt-6 text-sm font-semibold text-slate-800">Difficulty</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {DIFFICULTIES.map((d) => (
            <button
              type="button"
              key={d.id}
              onClick={() => setDifficulty(d.id)}
              className={[
                'rounded-lg px-4 py-2 text-sm font-semibold transition',
                difficulty === d.id ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
              ].join(' ')}
            >
              {d.label}
            </button>
          ))}
        </div>

        <button
          type="submit"
          disabled={status === 'loading' || word.trim() === ''}
          className="mt-8 w-full rounded-xl bg-indigo-600 px-4 py-3 font-semibold text-white shadow-sm transition hover:bg-indigo-500 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {status === 'loading' ? 'Looking up…' : 'Look up & add'}
        </button>

        {status === 'error' && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700">
            <span>{errorMessage}</span>
            {duplicate && (
              <button
                type="button"
                onClick={handleToggleDuplicateFavorite}
                className={['shrink-0 whitespace-nowrap font-semibold hover:underline', duplicateIsFavorite ? 'text-amber-600' : 'text-indigo-600'].join(' ')}
              >
                {duplicateIsFavorite ? '★ Added to favourites' : '☆ Add to favourites'}
              </button>
            )}
          </div>
        )}
      </form>

      {status === 'success' && added && (
        <div className="mt-6 rounded-3xl bg-emerald-50 p-6 ring-1 ring-emerald-200">
          <p className="text-sm font-semibold text-emerald-700">Added to the shared vocabulary bank for everyone — and starred for daily revision!</p>
          <div className="mt-3 flex items-center gap-2">
            <h3 className="text-xl font-bold text-slate-900">
              {added.term}
              {added.partOfSpeech && <span className="ml-1 font-normal text-slate-400">({added.partOfSpeech})</span>}
            </h3>
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold capitalize text-emerald-700">
              {added.difficulty}
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-600">{added.meaning}</p>
          {added.example ? (
            <p className="mt-2 text-xs italic text-slate-400">"{added.example}"</p>
          ) : (
            <p className="mt-2 text-xs text-slate-400">No example sentence found for this one — feel free to add your own when studying it.</p>
          )}
          <div className="mt-4 flex flex-wrap items-center gap-4">
            <Link to="/english/vocabulary/library" className="text-sm font-semibold text-indigo-600 hover:underline">
              View in library →
            </Link>
            <Link to="/english/vocabulary/quiz" className="text-sm font-semibold text-indigo-600 hover:underline">
              Play the quiz →
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
