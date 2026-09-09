import { useState } from 'react'
import { Link } from 'react-router-dom'
import VocabQuizRunner from '../../components/VocabQuizRunner'
import { generateVocabQuestions, type VocabQuestion } from '../../lib/generators'
import { VOCAB_BANK, type VocabDifficulty } from '../../data/vocabulary'

const DIFFICULTIES: { id: VocabDifficulty; label: string }[] = [
  { id: 'easy', label: 'Easy' },
  { id: 'medium', label: 'Medium' },
  { id: 'hard', label: 'Hard' },
]
const QUESTION_COUNTS = [5, 10, 15, 20]

export default function VocabQuiz() {
  const [difficulty, setDifficulty] = useState<VocabDifficulty>('easy')
  const [count, setCount] = useState(10)
  const [questions, setQuestions] = useState<VocabQuestion[] | null>(null)
  const [sessionKey, setSessionKey] = useState(0)

  const poolSize = VOCAB_BANK.filter((w) => w.difficulty === difficulty).length

  function generate() {
    return generateVocabQuestions(difficulty, count)
  }

  function start() {
    setQuestions(generate())
    setSessionKey((k) => k + 1)
  }

  if (questions) {
    return (
      <VocabQuizRunner
        key={sessionKey}
        gameId="vocabulary"
        questions={questions}
        onExit={() => setQuestions(null)}
        onRestart={() => {
          setQuestions(generate())
          setSessionKey((k) => k + 1)
        }}
      />
    )
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <Link to="/english/vocabulary" className="text-sm text-slate-400 hover:text-slate-600">
        ← Vocabulary
      </Link>
      <h1 className="mt-2 text-3xl font-extrabold text-slate-900">Vocabulary Quiz</h1>
      <p className="mt-2 text-slate-500">See a word, pick its correct meaning. Stuck? Use a hint.</p>

      <div className="mt-8 rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
        <h2 className="font-semibold text-slate-800">Toughness</h2>
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
            </button>
          ))}
        </div>

        <h2 className="mt-6 font-semibold text-slate-800">Number of questions</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {QUESTION_COUNTS.map((c) => (
            <button
              key={c}
              onClick={() => setCount(c)}
              disabled={c > poolSize}
              className={[
                'rounded-lg px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-40',
                count === c ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
              ].join(' ')}
            >
              {c}
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-slate-400">{poolSize} words available at {difficulty} difficulty.</p>

        <button
          onClick={start}
          className="mt-8 w-full rounded-xl bg-indigo-600 px-4 py-3 font-semibold text-white shadow-sm transition hover:bg-indigo-500 active:scale-[0.99]"
        >
          Start · {difficulty} · {Math.min(count, poolSize)} questions
        </button>
      </div>
    </div>
  )
}
