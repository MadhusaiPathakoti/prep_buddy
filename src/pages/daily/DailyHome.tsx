import { useState } from 'react'
import { Link } from 'react-router-dom'
import { dailyQuestionCount, DAILY_SECTIONS, formatDateKey, sectionInfo, todayKey } from '../../lib/daily/compose'
import { dailyStatus, getDailyPaper } from '../../lib/daily/store'
import { listDailyFinished } from '../../lib/mocks/attempts'
import { formatScore } from '../../lib/mocks/scoring'
import { downloadDailyPdf } from './downloadPdf'

export default function DailyHome() {
  const dateKey = todayKey()
  const [pdfBusy, setPdfBusy] = useState<string | null>(null)
  const [pdfError, setPdfError] = useState<string | null>(null)
  const recent = listDailyFinished().slice(0, 8)

  const download = async (section: (typeof DAILY_SECTIONS)[number]['id']) => {
    setPdfBusy(section)
    setPdfError(null)
    try {
      await downloadDailyPdf(getDailyPaper(section, dateKey))
    } catch (e) {
      setPdfError(e instanceof Error ? e.message : 'Could not build the PDF.')
    } finally {
      setPdfBusy(null)
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <Link to="/" className="text-sm font-medium text-indigo-600 dark:text-indigo-400">
        ← All modules
      </Link>
      <div className="mb-8 mt-3 text-center">
        <h1 className="text-3xl font-extrabold text-slate-900 dark:text-slate-100 sm:text-4xl">Daily Dose of Practice</h1>
        <p className="mt-2 text-slate-500 dark:text-slate-400">
          One fresh SBI PO-level paper for each section, every day. No time limit, and today&rsquo;s paper stays the same however often you open it.
        </p>
        <p className="mt-3 inline-block rounded-full bg-indigo-50 px-4 py-1 text-sm font-semibold text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-300">Today · {formatDateKey(dateKey)}</p>
      </div>

      {pdfError && (
        <p role="alert" className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-300">
          {pdfError}
        </p>
      )}

      <div className="grid gap-5">
        {DAILY_SECTIONS.map((s) => {
          const status = dailyStatus(s.id, dateKey)
          const total = dailyQuestionCount(s.id)
          const state = status.inProgress ? 'progress' : status.last ? 'done' : 'new'
          return (
            <div key={s.id} className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200 transition hover:shadow-md dark:bg-slate-800 dark:ring-slate-700">
              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-indigo-50 text-2xl dark:bg-indigo-500/10">{s.icon}</div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">{s.name}</h2>
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                        state === 'done'
                          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300'
                          : state === 'progress'
                            ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300'
                            : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300'
                      }`}
                    >
                      {state === 'done' ? 'Completed' : state === 'progress' ? 'In progress' : 'Not started'}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{s.blurb}</p>
                  <p className="mt-2 text-xs font-medium text-slate-400 dark:text-slate-500">{total} questions · no time limit</p>
                  {status.last && (
                    <p className="mt-2 text-sm text-slate-700 dark:text-slate-300">
                      Last score <b>{formatScore(status.last.score)}</b>
                      <span className="text-slate-400"> /{status.last.maxScore}</span>
                      {status.attempts.length > 1 && (
                        <>
                          {' '}
                          · best <b>{formatScore(status.best?.score ?? 0)}</b> · {status.attempts.length} attempts
                        </>
                      )}
                    </p>
                  )}
                </div>
              </div>
              <div className="mt-5 flex flex-wrap gap-2">
                <Link to={`/daily/${s.id}`} className="rounded-xl bg-indigo-600 px-5 py-2 text-sm font-semibold text-white hover:bg-indigo-700">
                  {state === 'done' ? 'Open' : state === 'progress' ? 'Resume quiz' : 'Start quiz'}
                </Link>
                <button
                  type="button"
                  onClick={() => download(s.id)}
                  disabled={pdfBusy === s.id}
                  className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                >
                  {pdfBusy === s.id ? 'Building PDF…' : '⬇ Download paper (PDF)'}
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {recent.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-3 text-lg font-bold text-slate-900 dark:text-slate-100">Recent Daily Dose results</h2>
          <ul className="space-y-2">
            {recent.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-3 rounded-2xl bg-white p-3 pl-4 shadow-sm ring-1 ring-slate-200 dark:bg-slate-800 dark:ring-slate-700">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {r.section ? sectionInfo(r.section).name : r.title} · {r.dateKey ? formatDateKey(r.dateKey) : ''}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Attempt {r.attemptNo ?? 1} · ✓ {r.correct} · ✕ {r.incorrect} · accuracy {r.accuracy.toFixed(1)}%
                  </p>
                </div>
                <p className="text-lg font-extrabold text-slate-900 dark:text-slate-100">
                  {formatScore(r.score)}
                  <span className="text-xs font-normal text-slate-400"> /{r.maxScore}</span>
                </p>
                <Link to={`/mocks/result/${r.id}`} className="rounded-xl border border-indigo-200 px-3 py-1.5 text-sm font-semibold text-indigo-600 hover:bg-indigo-50 dark:border-indigo-500/40 dark:text-indigo-300 dark:hover:bg-indigo-500/10">
                  View result
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
