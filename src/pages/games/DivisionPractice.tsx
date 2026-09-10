import { useState } from 'react'
import { Link } from 'react-router-dom'
import QuizRunner from '../../components/QuizRunner'
import { generateDivisionQuestions, type DigitLength } from '../../lib/generators'
import { validateInteger } from '../../lib/validators'
import type { Question } from '../../lib/types'

const QUESTION_COUNTS = [10, 20, 30, 50, 100]
const DIGIT_OPTIONS: { id: DigitLength; label: string; range: string }[] = [
  { id: 1, label: 'Single digit', range: '1–9' },
  { id: 2, label: 'Double digit', range: '10–99' },
  { id: 3, label: 'Triple digit', range: '100–999' },
]

export default function DivisionPractice() {
  const [lhsDigits, setLhsDigitsState] = useState<DigitLength>(2)
  const [rhsDigits, setRhsDigits] = useState<DigitLength>(1)
  const [count, setCount] = useState(20)
  const [questions, setQuestions] = useState<Question[] | null>(null)
  const [sessionKey, setSessionKey] = useState(0)

  function setLhsDigits(id: DigitLength) {
    setLhsDigitsState(id)
    setRhsDigits((prev) => (prev > id ? id : prev))
  }

  function newQuestions() {
    return generateDivisionQuestions(lhsDigits, rhsDigits, count)
  }

  function start() {
    setQuestions(newQuestions())
    setSessionKey((k) => k + 1)
  }

  if (questions) {
    return (
      <QuizRunner
        key={sessionKey}
        gameId="division"
        questions={questions}
        validate={validateInteger}
        onExit={() => setQuestions(null)}
        onRestart={() => {
          setQuestions(newQuestions())
          setSessionKey((k) => k + 1)
        }}
      />
    )
  }

  const digitLabel = (d: DigitLength) => DIGIT_OPTIONS.find((o) => o.id === d)!.label.replace(' digit', '')

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <Link to="/speed-math" className="text-sm text-slate-400 hover:text-slate-600">
        ← Speed Math
      </Link>
      <h1 className="mt-2 text-3xl font-extrabold text-slate-900">Division</h1>
      <p className="mt-2 text-slate-500">
        Pick a digit length for the dividend and divisor, e.g. double digit ÷ single digit gives questions like 84 ÷ 7.
        Every question divides evenly, and the divisor can't be longer than the dividend.
      </p>

      <div className="mt-8 rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
        <h2 className="font-semibold text-slate-800">Dividend (LHS)</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {DIGIT_OPTIONS.map((o) => (
            <button
              key={o.id}
              onClick={() => setLhsDigits(o.id)}
              className={[
                'rounded-lg px-4 py-2 text-sm font-semibold transition',
                lhsDigits === o.id ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
              ].join(' ')}
            >
              {o.label} <span className="opacity-70">({o.range})</span>
            </button>
          ))}
        </div>

        <h2 className="mt-6 font-semibold text-slate-800">Divisor (RHS)</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {DIGIT_OPTIONS.map((o) => {
            const disabled = o.id > lhsDigits
            return (
              <button
                key={o.id}
                onClick={() => setRhsDigits(o.id)}
                disabled={disabled}
                className={[
                  'rounded-lg px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-40',
                  rhsDigits === o.id ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
                ].join(' ')}
              >
                {o.label} <span className="opacity-70">({o.range})</span>
              </button>
            )
          })}
        </div>
        <p className="mt-2 text-xs text-slate-400">Limited to the dividend's length or shorter, so every question divides evenly.</p>

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
          Start · {digitLabel(lhsDigits)} ÷ {digitLabel(rhsDigits)} · {count} questions
        </button>
      </div>
    </div>
  )
}
