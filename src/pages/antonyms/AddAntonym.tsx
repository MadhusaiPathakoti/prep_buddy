import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { lookupWord } from '../../lib/dictionaryApi'
import { addCustomAntonymEntry, getFullAntonymsBank } from '../../lib/antonymsStore'
import type { BankEntry, Difficulty } from '../../lib/types'

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

type Status = 'idle' | 'loading' | 'error' | 'success'

export default function AddAntonym() {
  const [word, setWord] = useState('')
  const [antonym, setAntonym] = useState('')
  const [difficulty, setDifficulty] = useState<Difficulty>('medium')
  const [status, setStatus] = useState<Status>('idle')
  const [errorMessage, setErrorMessage] = useState('')
  const [added, setAdded] = useState<BankEntry | null>(null)

  const canSubmit = word.trim() !== '' && antonym.trim() !== ''

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const trimmedWord = word.trim()
    const trimmedAntonym = antonym.trim()
    if (trimmedWord === '' || trimmedAntonym === '') return

    setStatus('loading')
    setErrorMessage('')
    try {
      const existingBank = await getFullAntonymsBank()
      const existing = existingBank.find((w) => w.term.toLowerCase() === trimmedWord.toLowerCase())
      if (existing) {
        setStatus('error')
        setErrorMessage(`"${existing.term}" is already in the antonyms bank.`)
        return
      }

      const { meaning: definition, example, hint } = await lookupWord(trimmedWord)
      const entry: BankEntry = {
        id: `custom-${slugify(trimmedWord)}`,
        term: capitalize(trimmedWord),
        meaning: capitalize(trimmedAntonym),
        definition,
        hint,
        example,
        difficulty,
      }
      await addCustomAntonymEntry(entry)
      setAdded(entry)
      setStatus('success')
      setWord('')
      setAntonym('')
    } catch (err) {
      setStatus('error')
      setErrorMessage(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <Link to="/english/antonyms" className="text-sm text-slate-400 hover:text-slate-600">
        ← Antonyms
      </Link>
      <h1 className="mt-2 text-3xl font-extrabold text-slate-900">Add an Antonym Pair</h1>
      <p className="mt-2 text-slate-500">
        Type a word and one of its opposites — we'll look up the word's own meaning and an example sentence, then add
        the pair to the shared antonyms bank for everyone, for good.
      </p>

      <form onSubmit={handleSubmit} className="mt-8 rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
        <label htmlFor="new-ant-word" className="block text-sm font-semibold text-slate-800">
          Word
        </label>
        <input
          id="new-ant-word"
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

        <label htmlFor="new-ant-antonym" className="mt-6 block text-sm font-semibold text-slate-800">
          Its opposite
        </label>
        <input
          id="new-ant-antonym"
          value={antonym}
          onChange={(e) => {
            setAntonym(e.target.value)
            if (status !== 'idle') setStatus('idle')
          }}
          placeholder="e.g. dull"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          className="mt-2 w-full rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-lg text-slate-900 outline-none focus:border-indigo-400"
        />
        <p className="mt-2 text-xs text-slate-400">We can't look up antonyms automatically, so type the opposite word yourself.</p>

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
          <p className="text-sm font-semibold text-emerald-700">Added to the shared antonyms bank for everyone!</p>
          <div className="mt-3 flex items-center gap-2">
            <h3 className="text-xl font-bold text-slate-900">{added.term}</h3>
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold capitalize text-emerald-700">
              {added.difficulty}
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-600">{added.definition}</p>
          <p className="mt-1 text-sm font-semibold text-indigo-600">Opposite: {added.meaning}</p>
          {added.example ? (
            <p className="mt-2 text-xs italic text-slate-400">"{added.example}"</p>
          ) : (
            <p className="mt-2 text-xs text-slate-400">No example sentence found for this one — feel free to add your own when studying it.</p>
          )}
          <div className="mt-4 flex flex-wrap gap-4">
            <Link to="/english/antonyms/library" className="text-sm font-semibold text-indigo-600 hover:underline">
              View in library →
            </Link>
            <Link to="/english/antonyms/quiz" className="text-sm font-semibold text-indigo-600 hover:underline">
              Play the quiz →
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
