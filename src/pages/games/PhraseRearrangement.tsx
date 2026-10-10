import { useState } from 'react'
import { Link } from 'react-router-dom'
import PhraseRearrangementRunner from '../../components/PhraseRearrangementRunner'
import { buildPhraseRearrangementQuestions, type PhraseRearrangementQuestion } from '../../lib/phraseRearrangement'
import { fetchPhraseSentences, type PhraseDifficulty, type PhraseGenre } from '../../lib/phraseRearrangementApi'

const GENRES: { id: PhraseGenre; label: string; icon: string }[] = [
  { id: 'mixed', label: 'Mixed', icon: '🎲' },
  { id: 'editorial', label: 'Editorial', icon: '📰' },
  { id: 'news', label: 'Current Affairs', icon: '🗞️' },
  { id: 'generalKnowledge', label: 'General Knowledge', icon: '🌍' },
  { id: 'scienceNature', label: 'Science & Nature', icon: '🔬' },
  { id: 'biography', label: 'Biography', icon: '👤' },
  { id: 'fiction', label: 'Fiction', icon: '📖' },
  { id: 'poetry', label: 'Poetry', icon: '🖋️' },
]

const DIFFICULTIES: { id: PhraseDifficulty; label: string; description: string }[] = [
  { id: 'medium', label: 'Medium', description: '20-28 word sentences' },
  { id: 'hard', label: 'Hard', description: '28-38 words, with subordinate clauses' },
]

const QUESTION_COUNTS = [5, 10, 15, 20, 25, 30]
const TIME_OPTIONS = [20, 30, 45, 60, 75, 90]

type Stage = 'setup' | 'loading' | 'error'

export default function PhraseRearrangement() {
  const [genre, setGenre] = useState<PhraseGenre>('mixed')
  const [difficulty, setDifficulty] = useState<PhraseDifficulty>('medium')
  const [count, setCount] = useState(10)
  const [timePerQuestion, setTimePerQuestion] = useState(45)
  const [stage, setStage] = useState<Stage>('setup')
  const [errorMessage, setErrorMessage] = useState('')
  const [questions, setQuestions] = useState<PhraseRearrangementQuestion[] | null>(null)
  const [sessionKey, setSessionKey] = useState(0)

  async function start() {
    setStage('loading')
    setErrorMessage('')
    try {
      const seeds = await fetchPhraseSentences(genre, difficulty, count)
      if (seeds.length === 0) {
        setStage('error')
        setErrorMessage("Couldn't generate any passages right now — please try again in a moment.")
        return
      }
      setQuestions(buildPhraseRearrangementQuestions(seeds, timePerQuestion))
      setSessionKey((k) => k + 1)
    } catch {
      setStage('error')
      setErrorMessage('Something went wrong generating your passages. Please try again.')
    }
  }

  if (questions) {
    return (
      <PhraseRearrangementRunner
        key={sessionKey}
        questions={questions}
        onExit={() => {
          setQuestions(null)
          setStage('setup')
        }}
        onRestart={() => {
          setQuestions(null)
          void start()
        }}
      />
    )
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <Link to="/english" className="text-sm text-slate-400 hover:text-slate-600">
        ← English
      </Link>
      <h1 className="mt-2 text-3xl font-extrabold text-slate-900">Phrase Rearrangement</h1>
      <p className="mt-2 text-slate-500">
        Each sentence is split into 5 jumbled parts, labeled (A) through (E). Pick the option that puts them back into
        a correct, grammatical sentence — or "No rearrangement required" if it already reads correctly. A fresh
        passage is generated for every session, in the genre you pick.
      </p>

      <div className="mt-8 rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
        <h2 className="font-semibold text-slate-800">Genre</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {GENRES.map((g) => (
            <button
              key={g.id}
              onClick={() => setGenre(g.id)}
              className={[
                'rounded-lg px-4 py-2 text-sm font-semibold transition',
                genre === g.id ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
              ].join(' ')}
            >
              {g.icon} {g.label}
            </button>
          ))}
        </div>

        <h2 className="mt-6 font-semibold text-slate-800">Difficulty</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {DIFFICULTIES.map((d) => (
            <button
              key={d.id}
              onClick={() => setDifficulty(d.id)}
              className={[
                'rounded-lg px-4 py-2 text-sm font-semibold transition',
                difficulty === d.id ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
              ].join(' ')}
            >
              {d.label}
              <span className={['ml-1.5 font-normal', difficulty === d.id ? 'text-indigo-100' : 'text-slate-400'].join(' ')}>
                ({d.description})
              </span>
            </button>
          ))}
        </div>

        <h2 className="mt-6 font-semibold text-slate-800">Number of questions</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {QUESTION_COUNTS.map((c) => (
            <button
              key={c}
              onClick={() => setCount(c)}
              className={[
                'rounded-lg px-4 py-2 text-sm font-semibold transition',
                count === c ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
              ].join(' ')}
            >
              {c}
            </button>
          ))}
        </div>

        <h2 className="mt-6 font-semibold text-slate-800">Time per question</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {TIME_OPTIONS.map((t) => (
            <button
              key={t}
              onClick={() => setTimePerQuestion(t)}
              className={[
                'rounded-lg px-4 py-2 text-sm font-semibold transition',
                timePerQuestion === t ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
              ].join(' ')}
            >
              {t}s
            </button>
          ))}
        </div>

        {stage === 'error' && <p className="mt-4 rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700">{errorMessage}</p>}

        <button
          onClick={start}
          disabled={stage === 'loading'}
          className="mt-8 w-full rounded-xl bg-indigo-600 px-4 py-3 font-semibold text-white shadow-sm transition hover:bg-indigo-500 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {stage === 'loading' ? 'Generating your passage…' : `Start · ${difficulty} · ${count} questions · ${timePerQuestion}s each`}
        </button>
      </div>
    </div>
  )
}
