import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import BlockView from '../../components/awareness/BlockView'
import ChapterHero from '../../components/awareness/ChapterHero'
import MindMap from '../../components/awareness/MindMap'
import Rich from '../../components/awareness/Rich'
import { availableChapterIds, getReadChapters, loadChapter, setChapterRead } from '../../lib/computerAwareness/data'
import { CA_CHAPTERS, chapterMeta } from '../../lib/computerAwareness/meta'
import { THEMES } from '../../lib/computerAwareness/theme'
import type { CaChapter } from '../../lib/computerAwareness/types'
import NotFound from '../NotFound'

const BACK = (
  <Link to="/general-awareness/computer/book" className="text-sm text-slate-400 dark:text-slate-500 hover:text-slate-600">
    ← All chapters
  </Link>
)

export default function ChapterPage() {
  const { chapterId = '' } = useParams()
  const meta = chapterMeta(chapterId)
  if (!meta) return <NotFound />
  // keyed so moving to the next chapter starts from a clean state
  return <Chapter key={meta.id} id={meta.id} />
}

function Chapter({ id }: { id: string }) {
  const meta = chapterMeta(id)!
  const [chapter, setChapter] = useState<CaChapter | null>(null)
  const [failed, setFailed] = useState(false)
  const [isRead, setIsRead] = useState(() => getReadChapters().has(id))

  useEffect(() => {
    window.scrollTo(0, 0)
    let cancelled = false
    loadChapter(id)
      .then((c) => {
        if (!cancelled) setChapter(c)
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [id])

  const t = THEMES[meta.theme]
  const available = availableChapterIds()
  const at = CA_CHAPTERS.findIndex((c) => c.id === id)
  const prev = CA_CHAPTERS.slice(0, at).reverse().find((c) => available.has(c.id))
  const next = CA_CHAPTERS.slice(at + 1).find((c) => available.has(c.id))

  function jumpTo(sectionId: string) {
    document.getElementById(`sec-${sectionId}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      {BACK}
      <div className="mt-2">
        <ChapterHero chapter={meta} />
      </div>

      {failed && <p className="mt-6 rounded-lg bg-rose-50 dark:bg-rose-500/10 px-4 py-3 text-sm text-rose-700 dark:text-rose-300">This chapter is not available yet.</p>}
      {!chapter && !failed && <p className="mt-8 text-center text-slate-400 dark:text-slate-500">Loading the chapter…</p>}

      {chapter && (
        <>
          {/* in-page contents */}
          <nav aria-label="In this chapter" className="mt-6 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200 dark:bg-slate-800 dark:ring-slate-700">
            <div className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500">In this chapter</div>
            <div className="flex flex-wrap gap-2">
              {chapter.sections.map((s, i) => (
                <button key={s.id} onClick={() => jumpTo(s.id)} className={`rounded-full px-3 py-1 text-xs font-semibold transition hover:opacity-80 ${t.soft} ${t.text}`}>
                  {i + 1}. {s.title}
                </button>
              ))}
              <button onClick={() => jumpTo('revision')} className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700 transition hover:opacity-80 dark:bg-amber-500/10 dark:text-amber-300">
                ⚡ Quick revision
              </button>
              <button onClick={() => jumpTo('mindmap')} className="rounded-full bg-fuchsia-50 px-3 py-1 text-xs font-semibold text-fuchsia-700 transition hover:opacity-80 dark:bg-fuchsia-500/10 dark:text-fuchsia-300">
                🗺️ Mind map
              </button>
            </div>
          </nav>

          {chapter.sections.map((s, i) => (
            <section key={s.id} id={`sec-${s.id}`} className="mt-10 scroll-mt-4">
              <div className="mb-4 flex items-center gap-3">
                <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-2xl ring-1 ${t.soft} ${t.ring}`} aria-hidden="true">
                  {s.icon}
                </div>
                <div className="min-w-0">
                  <div className={`text-xs font-bold uppercase tracking-wide ${t.text}`}>Section {i + 1}</div>
                  <h2 className="text-xl font-extrabold leading-tight text-slate-900 dark:text-slate-100 sm:text-2xl">{s.title}</h2>
                </div>
              </div>
              <div className={`mb-5 h-1 w-16 rounded-full bg-gradient-to-r ${t.gradient}`} />
              <div className="space-y-5">
                {s.blocks.map((b, bi) => (
                  <BlockView key={bi} block={b} theme={meta.theme} />
                ))}
              </div>
            </section>
          ))}

          {/* quick revision */}
          <section id="sec-revision" className="mt-12 scroll-mt-4">
            <div className="rounded-3xl bg-gradient-to-br from-amber-50 to-orange-50 p-6 ring-1 ring-amber-200 dark:from-amber-500/10 dark:to-orange-500/10 dark:ring-amber-500/30">
              <h2 className="flex items-center gap-2 text-xl font-extrabold text-amber-800 dark:text-amber-300">
                <span aria-hidden="true">⚡</span> Quick revision
              </h2>
              <ul className="mt-3 space-y-2">
                {chapter.revision.map((r, i) => (
                  <li key={i} className="flex gap-3 leading-relaxed text-slate-700 dark:text-slate-300">
                    <span className="mt-0.5 text-amber-500" aria-hidden="true">
                      ★
                    </span>
                    <span>
                      <Rich text={r} />
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </section>

          {/* mind map */}
          <section id="sec-mindmap" className="mt-12 scroll-mt-4">
            <h2 className="mb-1 flex items-center gap-2 text-xl font-extrabold text-slate-900 dark:text-slate-100 sm:text-2xl">
              <span aria-hidden="true">🗺️</span> Mind map
            </h2>
            <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">The whole chapter on one page — trace each colour from the centre outwards.</p>
            <MindMap map={chapter.mindmap} theme={meta.theme} />
          </section>

          {/* finish */}
          <div className="mt-12 rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200 dark:bg-slate-800 dark:ring-slate-700">
            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">Finished this chapter?</h2>
            <div className="mt-4 flex flex-col gap-3 sm:flex-row">
              <button
                onClick={() => setIsRead(setChapterRead(id, !isRead).has(id))}
                aria-pressed={isRead}
                className={['rounded-xl px-4 py-3 font-semibold transition active:scale-[0.99]', isRead ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300' : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-300'].join(' ')}
              >
                {isRead ? '✓ Marked as read' : 'Mark as read'}
              </button>
              <Link to={`/general-awareness/computer/quiz?chapter=${id}`} className="rounded-xl bg-indigo-600 px-4 py-3 text-center font-semibold text-white shadow-sm transition hover:bg-indigo-500">
                🎯 Quiz this chapter
              </Link>
              <Link to={`/general-awareness/computer/questions?chapter=${id}`} className="rounded-xl bg-slate-100 px-4 py-3 text-center font-semibold text-slate-700 transition hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-300">
                🗂️ Its questions
              </Link>
            </div>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {prev ? (
              <Link to={`/general-awareness/computer/book/${prev.id}`} className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200 transition hover:-translate-y-0.5 dark:bg-slate-800 dark:ring-slate-700">
                <div className="text-xs font-semibold text-slate-400 dark:text-slate-500">← Previous</div>
                <div className="mt-0.5 font-bold text-slate-900 dark:text-slate-100">
                  {prev.icon} {prev.title}
                </div>
              </Link>
            ) : (
              <span />
            )}
            {next && (
              <Link to={`/general-awareness/computer/book/${next.id}`} className="rounded-2xl bg-white p-4 text-right shadow-sm ring-1 ring-slate-200 transition hover:-translate-y-0.5 dark:bg-slate-800 dark:ring-slate-700">
                <div className="text-xs font-semibold text-slate-400 dark:text-slate-500">Next →</div>
                <div className="mt-0.5 font-bold text-slate-900 dark:text-slate-100">
                  {next.icon} {next.title}
                </div>
              </Link>
            )}
          </div>
        </>
      )}
    </div>
  )
}
