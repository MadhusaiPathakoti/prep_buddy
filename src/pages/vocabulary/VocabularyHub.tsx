import { Link } from 'react-router-dom'
import { VOCAB_BANK } from '../../data/vocabulary'

export default function VocabularyHub() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <Link to="/english" className="text-sm text-slate-400 hover:text-slate-600">
        ← English
      </Link>
      <div className="mb-8 mt-2">
        <h1 className="text-3xl font-extrabold text-slate-900">Vocabulary</h1>
        <p className="mt-2 text-slate-500">Learn new words, then test yourself with a quiz at your chosen difficulty.</p>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <Link
          to="/english/vocabulary/library"
          className="group rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200 transition hover:-translate-y-0.5 hover:shadow-md"
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-50 text-2xl">📖</div>
          <h2 className="mt-4 text-xl font-bold text-slate-900">Study the word bank</h2>
          <p className="mt-1 text-sm text-slate-500">{VOCAB_BANK.length} words with meanings and examples, easy to hard.</p>
          <div className="mt-4 text-sm font-semibold text-indigo-600 group-hover:translate-x-0.5 transition">Browse →</div>
        </Link>

        <Link
          to="/english/vocabulary/quiz"
          className="group rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200 transition hover:-translate-y-0.5 hover:shadow-md"
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-50 text-2xl">🎯</div>
          <h2 className="mt-4 text-xl font-bold text-slate-900">Play the quiz</h2>
          <p className="mt-1 text-sm text-slate-500">Pick easy, medium, or hard and test what you know. Hints included.</p>
          <div className="mt-4 text-sm font-semibold text-indigo-600 group-hover:translate-x-0.5 transition">Play →</div>
        </Link>
      </div>
    </div>
  )
}
