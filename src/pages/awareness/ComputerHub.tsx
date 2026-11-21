import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { HeroArt } from '../../components/awareness/ChapterHero'
import { CA_BANK_KEY, CA_GAME_ID, availableChapterIds, getReadChapters, loadAllQuestions } from '../../lib/computerAwareness/data'
import { CA_CHAPTERS } from '../../lib/computerAwareness/meta'
import { getFavorites } from '../../lib/favorites'
import { getSummary } from '../../lib/storage'

const CARDS = [
  {
    to: '/general-awareness/computer/book',
    icon: '📖',
    title: 'Read the book',
    description: 'Every chapter explained with tables, diagrams, timelines and exam traps — and a mind map at the end of each one.',
    cta: 'Open book →',
  },
  {
    to: '/general-awareness/computer/questions',
    icon: '🗂️',
    title: 'Question bank',
    description: 'Browse every MCQ by chapter, search it, reveal answers and star the ones you keep missing.',
    cta: 'Browse →',
  },
  {
    to: '/general-awareness/computer/quiz',
    icon: '🎯',
    title: 'Play quiz',
    description: 'Pick chapters and a length, answer with instant explanations, and review every question at the end.',
    cta: 'Play →',
  },
  {
    to: '/general-awareness/computer/quiz?fav=1',
    icon: '⭐',
    title: 'Favourites quiz',
    description: 'Play only your starred questions — or only the ones you starred in the last few days.',
    cta: 'Revise →',
  },
]

export default function ComputerHub() {
  const [total, setTotal] = useState<number | null>(null)
  const [read] = useState(() => getReadChapters())
  const [favouriteCount] = useState(() => getFavorites(CA_BANK_KEY).size)
  const [summary] = useState(() => getSummary(CA_GAME_ID))
  const chaptersOnDisk = availableChapterIds().size

  useEffect(() => {
    let cancelled = false
    loadAllQuestions()
      .then((qs) => {
        if (!cancelled) setTotal(qs.length)
      })
      .catch(() => {
        // The count is decoration; the pages themselves report a load failure.
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <Link to="/general-awareness" className="text-sm text-slate-400 dark:text-slate-500 hover:text-slate-600">
        ← General Awareness
      </Link>

      <div className="relative mt-2 overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-500 via-violet-600 to-fuchsia-600 p-6 text-white shadow-lg sm:p-8">
        <HeroArt id="hub" />
        <div className="relative">
          <div className="text-xs font-bold uppercase tracking-widest text-white/80">General Awareness</div>
          <h1 className="mt-1 text-3xl font-extrabold sm:text-4xl">Computer Awareness</h1>
          <p className="mt-2 max-w-xl text-white/90">From the abacus to AI — read it, map it, then quiz yourself until it sticks.</p>
          <div className="mt-4 flex flex-wrap gap-2 text-2xl" aria-hidden="true">
            {CA_CHAPTERS.slice(0, 13).map((c) => (
              <span key={c.id} className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/20 ring-1 ring-white/30 backdrop-blur-sm">
                {c.icon}
              </span>
            ))}
            <span className="flex h-10 items-center rounded-xl bg-white/20 px-3 text-sm font-bold ring-1 ring-white/30 backdrop-blur-sm">+{CA_CHAPTERS.length - 13}</span>
          </div>
        </div>
      </div>

      <div className="mb-8 mt-5 grid grid-cols-2 gap-3 text-center sm:grid-cols-4">
        <Tally label="Chapters read" value={`${[...read].filter((id) => CA_CHAPTERS.some((c) => c.id === id)).length} / ${chaptersOnDisk || CA_CHAPTERS.length}`} />
        <Tally label="Questions" value={total === null ? '…' : String(total)} />
        <Tally label="★ Favourites" value={String(favouriteCount)} />
        <Tally label="Best quiz score" value={summary.bestAccuracy === null ? '—' : `${Math.round(summary.bestAccuracy)}%`} />
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        {CARDS.map((c) => (
          <Link
            key={c.to}
            to={c.to}
            className="group rounded-3xl bg-white dark:bg-slate-800 p-6 shadow-sm ring-1 ring-slate-200 dark:ring-slate-700 transition hover:-translate-y-0.5 hover:shadow-md"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-50 dark:bg-indigo-500/10 text-2xl">{c.icon}</div>
            <h2 className="mt-4 text-xl font-bold text-slate-900 dark:text-slate-100">{c.title}</h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{c.description}</p>
            <div className="mt-4 text-sm font-semibold text-indigo-600 dark:text-indigo-400 transition group-hover:translate-x-0.5">{c.cta}</div>
          </Link>
        ))}
      </div>
    </div>
  )
}

function Tally({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-white dark:bg-slate-800 px-3 py-3 shadow-sm ring-1 ring-slate-200 dark:ring-slate-700">
      <div className="text-lg font-bold text-indigo-600 dark:text-indigo-400">{value}</div>
      <div className="text-xs text-slate-500 dark:text-slate-400">{label}</div>
    </div>
  )
}
