import { Link } from 'react-router-dom'
import { CA_CHAPTERS } from '../lib/computerAwareness/meta'

/** The subsections of General Awareness. More topics (banking, current affairs, static GK …) slot in here later. */
const GA_TOPICS = [
  {
    id: 'computer-awareness',
    title: 'Computer Awareness',
    description: `An illustrated ${CA_CHAPTERS.length}-chapter book — hardware to AI — with a mind map at the end of every chapter, a big MCQ question bank, a play-quiz and starred favourites.`,
    to: '/general-awareness/computer',
    icon: '💻',
    meta: `${CA_CHAPTERS.length} chapters · book · question bank · quiz`,
  },
]

export default function GeneralAwareness() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <Link to="/" className="text-sm text-slate-400 dark:text-slate-500 hover:text-slate-600">
        ← All modules
      </Link>
      <div className="mb-8 mt-2">
        <h1 className="text-3xl font-extrabold text-slate-900 dark:text-slate-100">General Awareness</h1>
        <p className="mt-2 text-slate-500 dark:text-slate-400">Pick a subject to read, revise and quiz yourself on.</p>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        {GA_TOPICS.map((t) => (
          <Link
            key={t.id}
            to={t.to}
            className="group rounded-3xl bg-white dark:bg-slate-800 p-6 shadow-sm ring-1 ring-slate-200 dark:ring-slate-700 transition hover:-translate-y-0.5 hover:shadow-md"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-50 dark:bg-indigo-500/10 text-2xl">{t.icon}</div>
            <h2 className="mt-4 text-xl font-bold text-slate-900 dark:text-slate-100">{t.title}</h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{t.description}</p>
            <div className="mt-4 flex items-center justify-between text-sm">
              <span className="font-medium text-slate-400 dark:text-slate-500">{t.meta}</span>
              <span className="font-semibold text-indigo-600 dark:text-indigo-400 transition group-hover:translate-x-0.5">Open →</span>
            </div>
          </Link>
        ))}

        <div className="rounded-3xl border-2 border-dashed border-slate-200 dark:border-slate-700 p-6 text-slate-400 dark:text-slate-500">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-50 dark:bg-slate-800 text-2xl">🚧</div>
          <h2 className="mt-4 text-xl font-bold text-slate-400 dark:text-slate-500">More subjects</h2>
          <p className="mt-1 text-sm">Banking, current affairs and static GK will appear here.</p>
        </div>
      </div>
    </div>
  )
}
