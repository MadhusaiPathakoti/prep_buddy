import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { lookupWordBankEntry } from '../../lib/dictionaryApi'
import { addCustomWordEntry, getFullWordBank } from '../../lib/wordBankStore'
import { getFavoriteIds, toggleFavorite } from '../../lib/favorites'
import type { Difficulty, WordEntry } from '../../lib/types'

const BANK_KEY = 'word-bank'

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

function capitalize(text: string): string {
  return text.length === 0 ? text : text.charAt(0).toUpperCase() + text.slice(1)
}

/** Splits a comma-separated list into trimmed, capitalized, deduplicated words. */
function parseList(raw: string): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const part of raw.split(',')) {
    const trimmed = capitalize(part.trim())
    if (trimmed === '' || seen.has(trimmed.toLowerCase())) continue
    seen.add(trimmed.toLowerCase())
    out.push(trimmed)
  }
  return out
}

type Status = 'idle' | 'loading' | 'error' | 'success'

export default function AddWordBankEntry() {
  const [word, setWord] = useState('')
  const [synonymsInput, setSynonymsInput] = useState('')
  const [antonymsInput, setAntonymsInput] = useState('')
  const [difficulty, setDifficulty] = useState<Difficulty>('medium')
  const [status, setStatus] = useState<Status>('idle')
  const [errorMessage, setErrorMessage] = useState('')
  const [added, setAdded] = useState<WordEntry | null>(null)
  const [corrections, setCorrections] = useState<string[]>([])

  const canSubmit = word.trim() !== '' && synonymsInput.trim() !== '' && antonymsInput.trim() !== ''

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const trimmedWord = word.trim()
    const synonyms = parseList(synonymsInput)
    const antonyms = parseList(antonymsInput)
    if (trimmedWord === '' || synonyms.length === 0 || antonyms.length === 0) return

    setStatus('loading')
    setErrorMessage('')
    setCorrections([])
    try {
      const existingBank = await getFullWordBank()
      const existing = existingBank.find((w) => w.word.toLowerCase() === trimmedWord.toLowerCase())
      if (existing) {
        setStatus('error')
        setErrorMessage(`"${existing.word}" is already in the word bank.`)
        return
      }

      // Gemini checks the proposed lists too — dropping words that don't actually belong
      // (including ones in the wrong list, or both), fixing misspellings, and topping up a
      // thin list — rather than trusting free-form input verbatim.
      const { meaning, example, partOfSpeech, synonyms: checkedSynonyms, antonyms: checkedAntonyms, corrections: notes } =
        await lookupWordBankEntry(trimmedWord, synonyms, antonyms)
      const entry: WordEntry = {
        id: `custom-${slugify(trimmedWord)}`,
        word: capitalize(trimmedWord),
        partOfSpeech,
        meaning,
        example,
        synonyms: checkedSynonyms,
        antonyms: checkedAntonyms,
        difficulty,
        createdAt: new Date().toISOString(),
      }
      await addCustomWordEntry(entry)
      // New words are automatically starred for daily revision.
      toggleFavorite(BANK_KEY, entry.id, getFavoriteIds(BANK_KEY))
      setAdded(entry)
      setCorrections(notes)
      setStatus('success')
      setWord('')
      setSynonymsInput('')
      setAntonymsInput('')
    } catch (err) {
      setStatus('error')
      setErrorMessage(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <Link to="/english/word-bank/library" className="text-sm text-slate-400 hover:text-slate-600">
        ← Word Bank
      </Link>
      <h1 className="mt-2 text-3xl font-extrabold text-slate-900">Add a Word</h1>
      <p className="mt-2 text-slate-500">
        Type a word plus its synonyms and antonyms — we'll look up the word's own meaning, part of speech, and an
        example sentence, then add it to the shared word bank for both the Synonyms and Antonyms games. It's starred
        for daily revision automatically.
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
          placeholder="e.g. radiant"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          className="mt-2 w-full rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-lg text-slate-900 outline-none focus:border-indigo-400"
        />

        <label htmlFor="new-word-synonyms" className="mt-6 block text-sm font-semibold text-slate-800">
          Synonyms
        </label>
        <input
          id="new-word-synonyms"
          value={synonymsInput}
          onChange={(e) => {
            setSynonymsInput(e.target.value)
            if (status !== 'idle') setStatus('idle')
          }}
          placeholder="e.g. glowing, bright, luminous"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          className="mt-2 w-full rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-lg text-slate-900 outline-none focus:border-indigo-400"
        />

        <label htmlFor="new-word-antonyms" className="mt-6 block text-sm font-semibold text-slate-800">
          Antonyms
        </label>
        <input
          id="new-word-antonyms"
          value={antonymsInput}
          onChange={(e) => {
            setAntonymsInput(e.target.value)
            if (status !== 'idle') setStatus('idle')
          }}
          placeholder="e.g. dull, dim, gloomy"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          className="mt-2 w-full rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-lg text-slate-900 outline-none focus:border-indigo-400"
        />
        <p className="mt-2 text-xs text-slate-400">
          We can't look these up automatically, so type them yourself — separate multiple words with commas. We'll
          double-check them and fix or remove anything that's wrong before saving.
        </p>

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
          disabled={status === 'loading' || !canSubmit}
          className="mt-8 w-full rounded-xl bg-indigo-600 px-4 py-3 font-semibold text-white shadow-sm transition hover:bg-indigo-500 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {status === 'loading' ? 'Looking up…' : 'Look up & add'}
        </button>

        {status === 'error' && <p className="mt-4 rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700">{errorMessage}</p>}
      </form>

      {status === 'success' && added && (
        <div className="mt-6 rounded-3xl bg-emerald-50 p-6 ring-1 ring-emerald-200">
          <p className="text-sm font-semibold text-emerald-700">Added to the shared word bank — and starred for daily revision!</p>
          <div className="mt-3 flex items-center gap-2">
            <h3 className="text-xl font-bold text-slate-900">
              {added.word}
              {added.partOfSpeech && <span className="ml-1 font-normal text-slate-400">({added.partOfSpeech})</span>}
            </h3>
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold capitalize text-emerald-700">
              {added.difficulty}
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-600">{added.meaning}</p>
          {added.example && <p className="mt-2 text-xs italic text-slate-400">"{added.example}"</p>}
          <p className="mt-3 text-sm">
            <span className="font-semibold text-indigo-600">Synonyms: </span>
            {added.synonyms.join(', ')}
          </p>
          <p className="text-sm">
            <span className="font-semibold text-rose-600">Antonyms: </span>
            {added.antonyms.join(', ')}
          </p>
          {corrections.length > 0 && (
            <div className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
              <p className="font-semibold">We adjusted your lists:</p>
              <ul className="mt-1 list-disc pl-4">
                {corrections.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            </div>
          )}
          <div className="mt-4 flex flex-wrap items-center gap-4">
            <Link to="/english/word-bank/library" className="text-sm font-semibold text-indigo-600 hover:underline">
              View in library →
            </Link>
            <Link to="/english/synonyms/quiz" className="text-sm font-semibold text-indigo-600 hover:underline">
              Play synonyms quiz →
            </Link>
            <Link to="/english/antonyms/quiz" className="text-sm font-semibold text-indigo-600 hover:underline">
              Play antonyms quiz →
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
