import { useState } from 'react'
import { Link } from 'react-router-dom'
import MCQQuizRunner from '../../components/MCQQuizRunner'
import { generateStatementConclusionQuestions, type MCQQuestion, type StatementConclusionDifficulty } from '../../lib/generators'

const QUESTION_COUNTS = [10, 15, 20, 30]

const DIFFICULTIES: { id: StatementConclusionDifficulty; label: string; description: string }[] = [
  { id: 'easy', label: 'Easy', description: '3-4 element chains, or two 3-letter broken clauses' },
  { id: 'medium', label: 'Medium', description: '5-7 element chains, or three 3-4 letter broken clauses' },
  { id: 'hard', label: 'Hard', description: '8-10 element chains, or four 4-5 letter broken clauses' },
  { id: 'mixed', label: 'Mixed', description: 'A blend of all three, picked per question' },
]

export default function StatementConclusions() {
  const [difficulty, setDifficulty] = useState<StatementConclusionDifficulty>('medium')
  const [count, setCount] = useState(15)
  const [questions, setQuestions] = useState<MCQQuestion[] | null>(null)
  const [sessionKey, setSessionKey] = useState(0)

  function generate() {
    return generateStatementConclusionQuestions(difficulty, count)
  }

  function start() {
    setQuestions(generate())
    setSessionKey((k) => k + 1)
  }

  if (questions) {
    return (
      <MCQQuizRunner
        key={sessionKey}
        gameId="statement-conclusions"
        questions={questions}
        showCorrectInReview
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
      <Link to="/reasoning" className="text-sm text-slate-400 hover:text-slate-600">
        ← Reasoning
      </Link>
      <h1 className="mt-2 text-3xl font-extrabold text-slate-900">Statement & Conclusions</h1>
      <p className="mt-2 text-slate-500">
        A chain of elements linked by <span className="font-mono">&gt;, ≥, =, ≤, &lt;</span> is given, e.g.{' '}
        <span className="font-mono">F &gt; R ≥ T = E &gt; W ≤ Q</span>, followed by two conclusions. About two-thirds
        of questions instead give a "broken" statement — separate clauses sharing a linking element, e.g.{' '}
        <span className="font-mono">L ≤ M &lt; N; O ≥ P = N</span> — that you first need to splice together. Every
        question uses the same five answers:
      </p>
      <ul className="mt-3 space-y-1 text-sm text-slate-500">
        <li>(a) If only conclusion I follows.</li>
        <li>(b) If only conclusion II follows.</li>
        <li>(c) If either conclusion I or II follows.</li>
        <li>(d) If neither conclusion I nor II follows.</li>
        <li>(e) If both conclusions I and II follow.</li>
      </ul>

      <div className="mt-8 rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
        <h2 className="font-semibold text-slate-800">Difficulty</h2>
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

        <button
          onClick={start}
          className="mt-8 w-full rounded-xl bg-indigo-600 px-4 py-3 font-semibold text-white shadow-sm transition hover:bg-indigo-500 active:scale-[0.99]"
        >
          Start · {difficulty} · {count} questions
        </button>
      </div>
    </div>
  )
}
