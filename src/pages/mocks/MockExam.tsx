import { Link, Navigate, useParams } from 'react-router-dom'
import { EXAMS, entryTotal } from '../../lib/mocks/blueprints'
import type { MockExamId } from '../../lib/mocks/types'

export default function MockExam() {
  const { exam: examParam } = useParams()
  if (examParam !== 'po' && examParam !== 'clerk') return <Navigate to="/mocks" replace />
  const examId: MockExamId = examParam
  const exam = EXAMS[examId]
  const totalQ = exam.sections.reduce((n, s) => n + entryTotal(s.entries), 0)
  const totalMin = exam.sections.reduce((n, s) => n + s.durationSec / 60, 0)

  const options = [
    { to: 'full', icon: '🏁', title: 'Full-length mock', desc: `${totalQ} questions · ${totalMin} minutes · all three sections with sectional timing, exactly like the exam.` },
    { to: 'sectional', icon: '🧭', title: 'Sectional mock', desc: 'One complete section at its real question count and time limit: Quant, Reasoning or English.' },
    { to: 'topic', icon: '🎯', title: 'Topic-wise mock', desc: 'One topic only. You choose how many questions and the time per question (30–60 seconds).' },
  ]

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <Link to="/mocks" className="text-sm font-medium text-indigo-600 dark:text-indigo-400">
        ← Mock Tests
      </Link>
      <div className="mb-8 mt-3">
        <h1 className="text-3xl font-extrabold text-slate-900 dark:text-slate-100">{exam.name}</h1>
        <p className="mt-1 text-slate-500 dark:text-slate-400">{exam.tagline}</p>
      </div>
      <div className="grid gap-4">
        {options.map((o) => (
          <Link
            key={o.to}
            to={`/mocks/${examId}/${o.to}`}
            className="group flex items-center gap-4 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200 transition hover:-translate-y-0.5 hover:shadow-md dark:bg-slate-800 dark:ring-slate-700"
          >
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-indigo-50 text-2xl dark:bg-indigo-500/10">{o.icon}</span>
            <span className="flex-1">
              <span className="block text-lg font-bold text-slate-900 dark:text-slate-100">{o.title}</span>
              <span className="block text-sm text-slate-500 dark:text-slate-400">{o.desc}</span>
            </span>
            <span className="font-semibold text-indigo-600 transition group-hover:translate-x-0.5 dark:text-indigo-400">→</span>
          </Link>
        ))}
      </div>
    </div>
  )
}
