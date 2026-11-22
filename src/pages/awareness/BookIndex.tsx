import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { HeroArt } from '../../components/awareness/ChapterHero'
import { basePath } from '../../lib/awareness/books'
import { useBook } from '../../lib/awareness/bookContext'
import { availableChapterIds, getReadChapters, loadAllQuestions } from '../../lib/awareness/data'
import { THEMES } from '../../lib/awareness/theme'

export default function BookIndex() {
  const book = useBook()
  const base = basePath(book)
  const [read] = useState(() => getReadChapters(book))
  const [counts, setCounts] = useState<Map<string, number> | null>(null)
  const available = availableChapterIds(book)

  useEffect(() => {
    let cancelled = false
    loadAllQuestions(book)
      .then((qs) => {
        if (cancelled) return
        const m = new Map<string, number>()
        for (const q of qs) m.set(q.chapterId, (m.get(q.chapterId) ?? 0) + 1)
        setCounts(m)
      })
      .catch(() => {
        // counts are decoration
      })
    return () => {
      cancelled = true
    }
  }, [book])

  const readCount = book.chapters.filter((c) => read.has(c.id)).length
  const firstUnread = book.chapters.find((c) => available.has(c.id) && !read.has(c.id))

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <Link to={`${base}`} className="text-sm text-slate-400 dark:text-slate-500 hover:text-slate-600">
        ← {book.name}
      </Link>

      {/* the book cover */}
      <div className={`relative mt-2 overflow-hidden rounded-3xl bg-gradient-to-br ${book.coverGradient} p-7 text-white shadow-lg sm:p-10`}>
        <HeroArt id={`cover-${book.id}`} />
        <div className="relative flex flex-col gap-6 sm:flex-row sm:items-center">
          <div className="flex h-36 w-28 shrink-0 flex-col items-center justify-center rounded-r-2xl rounded-l-md bg-gradient-to-br from-amber-300 to-orange-500 text-slate-900 shadow-2xl ring-1 ring-white/40 sm:h-44 sm:w-36">
            <span className="text-5xl sm:text-6xl" aria-hidden="true">
              {book.coverIcon}
            </span>
            <span className="mt-2 px-2 text-center text-xs font-extrabold uppercase leading-tight tracking-wide">{book.name}</span>
          </div>
          <div>
            <div className="text-xs font-bold uppercase tracking-widest text-indigo-200">The complete book</div>
            <h1 className="mt-1 text-3xl font-extrabold leading-tight sm:text-4xl">{book.name}</h1>
            <p className="mt-2 text-indigo-100">
              {book.chapters.length} chapters · diagrams, tables and exam traps · a mind map at the end of every chapter.
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              {firstUnread && (
                <Link to={`${base}/book/${firstUnread.id}`} className="rounded-xl bg-white px-4 py-2 text-sm font-bold text-indigo-700 shadow-sm transition hover:bg-indigo-50">
                  {readCount === 0 ? 'Start reading →' : `Continue: ${firstUnread.title} →`}
                </Link>
              )}
              <span className="text-sm text-indigo-200">
                {readCount} of {book.chapters.length} read
              </span>
            </div>
          </div>
        </div>
        <div className="relative mt-6 h-2 overflow-hidden rounded-full bg-white/20">
          <div className="h-full rounded-full bg-amber-300 transition-all" style={{ width: `${(readCount / book.chapters.length) * 100}%` }} />
        </div>
      </div>

      <h2 className="mb-4 mt-10 text-xl font-bold text-slate-900 dark:text-slate-100">Contents</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        {book.chapters.map((c) => {
          const t = THEMES[c.theme]
          const ready = available.has(c.id)
          const n = counts?.get(c.id)
          const body = (
            <>
              <div className={`relative h-24 overflow-hidden bg-gradient-to-br ${t.gradient}`}>
                <HeroArt id={`idx-${c.id}`} />
                <span className="absolute left-4 top-3 rounded-full bg-black/25 px-2.5 py-0.5 text-xs font-bold text-white">Chapter {c.number}</span>
                <span className="absolute bottom-0 right-4 translate-y-1/3 text-6xl drop-shadow-lg transition group-hover:scale-110" aria-hidden="true">
                  {c.icon}
                </span>
                {read.has(c.id) && <span className="absolute right-3 top-3 rounded-full bg-white px-2 py-0.5 text-xs font-bold text-emerald-600">✓ Read</span>}
              </div>
              <div className="p-4 pt-3">
                <h3 className="font-bold text-slate-900 dark:text-slate-100">{c.title}</h3>
                <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{c.tagline}</p>
                <div className="mt-3 flex items-center justify-between text-xs">
                  <span className="font-medium text-slate-400 dark:text-slate-500">{ready ? (n ? `${n} questions` : 'Mind map included') : 'Coming soon'}</span>
                  {ready && <span className={`font-semibold ${t.text}`}>Read →</span>}
                </div>
              </div>
            </>
          )
          return ready ? (
            <Link
              key={c.id}
              to={`${base}/book/${c.id}`}
              className="group overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-slate-200 transition hover:-translate-y-0.5 hover:shadow-md dark:bg-slate-800 dark:ring-slate-700"
            >
              {body}
            </Link>
          ) : (
            <div key={c.id} className="overflow-hidden rounded-3xl bg-white opacity-60 shadow-sm ring-1 ring-slate-200 dark:bg-slate-800 dark:ring-slate-700">
              {body}
            </div>
          )
        })}
      </div>
    </div>
  )
}
