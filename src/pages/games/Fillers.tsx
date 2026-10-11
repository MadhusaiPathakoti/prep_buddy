import { useState } from 'react'
import { Link } from 'react-router-dom'
import FillersRunner from '../../components/FillersRunner'
import { buildFillersQuestions, type FillersQuestion } from '../../lib/fillers'
import { fetchFillersQuestions, type FillersDifficulty, type FillersGenre } from '../../lib/fillersApi'

const GENRES: { id: FillersGenre; label: string; icon: string }[] = [
  { id: 'mixed', label: 'Mixed', icon: '🎲' },
  { id: 'editorial', label: 'Editorial', icon: '📰' },
  { id: 'news', label: 'Current Affairs', icon: '🗞️' },
  { id: 'generalKnowledge', label: 'General Knowledge', icon: '🌍' },
  { id: 'scienceNature', label: 'Science & Nature', icon: '🔬' },
  { id: 'biography', label: 'Biography', icon: '👤' },
  { id: 'fiction', label: 'Fiction', icon: '📖' },
  { id: 'poetry', label: 'Poetry', icon: '🖋️' },
]

const DIFFICULTIES: { id: FillersDifficulty; label: string; description: string }[] = [
  { id: 'medium', label: 'Medium', description: '12-22 word sentences' },
  { id: 'hard', label: 'Hard', description: '20-32 words, finer near-synonym distinctions' },
]

const QUESTION_COUNTS = [5, 10, 15, 20, 25, 30]
const TIME_OPTIONS = [20, 30, 45, 60, 75, 90]

type Stage = 'setup' | 'loading' | 'error'

export default function Fillers() {
  const [genre, setGenre] = useState<FillersGenre>('mixed')
  const [difficulty, setDifficulty] = useState<FillersDifficulty>('medium')
  const [count, setCount] = useState(10)
  const [timePerQuestion, setTimePerQuestion] = useState(45)
  const [stage, setStage] = useState<Stage>('setup')
  const [errorMessage, setErrorMessage] = useState('')
  const [questions, setQuestions] = useState<FillersQuestion[] | null>(null)
  const [sessionKey, setSessionKey] = useState(0)

  async function start() {
    setStage('loading')
    setErrorMessage('')
    try {
      const raws = await fetchFillersQuestions(genre, difficulty, count)
      if (raws.length === 0) {
        setStage('error')
        setErrorMessage("Couldn't generate any questions right now — please try again in a moment.")
        return
      }
      setQuestions(buildFillersQuestions(raws, timePerQuestion))
      setSessionKey((k) => k + 1)
    } catch {
      setStage('error')
      setErrorMessage('Something went wrong generating your questions. Please try again.')
    }
  }

  if (questions) {
    return (
      <FillersRunner
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
      <Link to="/english" className="text-sm text-slate-400 dark:text-slate-500 hover:text-slate-600">
        ← English
      </Link>
      <h1 className="mt-2 text-3xl font-extrabold text-slate-900 dark:text-slate-100">Fillers</h1>
      <p className="mt-2 text-slate-500 dark:text-slate-400">
        Each sentence has one blank and 3 candidate words, (a) through (c). Judge which of them actually fit —
        grammatically and contextually — then pick the matching answer. A fresh set is generated for every session,
        in the genre you pick.
      </p>

      <div className="mt-8 rounded-3xl bg-white dark:bg-slate-800 p-6 shadow-sm ring-1 ring-slate-200 dark:ring-slate-700">
        <h2 className="font-semibold text-slate-800 dark:text-slate-200">Genre</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {GENRES.map((g) => (
            <button
              key={g.id}
              onClick={() => setGenre(g.id)}
              className={[
                'rounded-lg px-4 py-2 text-sm font-semibold transition',
                genre === g.id ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200',
              ].join(' ')}
            >
              {g.icon} {g.label}
            </button>
          ))}
        </div>

        <h2 className="mt-6 font-semibold text-slate-800 dark:text-slate-200">Difficulty</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {DIFFICULTIES.map((d) => (
            <button
              key={d.id}
              onClick={() => setDifficulty(d.id)}
              className={[
                'rounded-lg px-4 py-2 text-sm font-semibold transition',
                difficulty === d.id ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200',
              ].join(' ')}
            >
              {d.label}
              <span className={['ml-1.5 font-normal', difficulty === d.id ? 'text-indigo-100' : 'text-slate-400 dark:text-slate-500'].join(' ')}>
                ({d.description})
              </span>
            </button>
          ))}
        </div>

        <h2 className="mt-6 font-semibold text-slate-800 dark:text-slate-200">Number of questions</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {QUESTION_COUNTS.map((c) => (
            <button
              key={c}
              onClick={() => setCount(c)}
              className={[
                'rounded-lg px-4 py-2 text-sm font-semibold transition',
                count === c ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200',
              ].join(' ')}
            >
              {c}
            </button>
          ))}
        </div>

        <h2 className="mt-6 font-semibold text-slate-800 dark:text-slate-200">Time per question</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {TIME_OPTIONS.map((t) => (
            <button
              key={t}
              onClick={() => setTimePerQuestion(t)}
              className={[
                'rounded-lg px-4 py-2 text-sm font-semibold transition',
                timePerQuestion === t ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200',
              ].join(' ')}
            >
              {t}s
            </button>
          ))}
        </div>

        {stage === 'error' && <p className="mt-4 rounded-lg bg-rose-50 dark:bg-rose-500/10 px-4 py-3 text-sm text-rose-700 dark:text-rose-300">{errorMessage}</p>}

        <button
          onClick={start}
          disabled={stage === 'loading'}
          className="mt-8 w-full rounded-xl bg-indigo-600 px-4 py-3 font-semibold text-white shadow-sm transition hover:bg-indigo-500 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {stage === 'loading' ? 'Generating your questions…' : `Start · ${difficulty} · ${count} questions · ${timePerQuestion}s each`}
        </button>
      </div>
    </div>
  )
}
