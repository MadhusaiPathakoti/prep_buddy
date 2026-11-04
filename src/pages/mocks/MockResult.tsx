import { useMemo, useState, type ReactNode } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import QuestionReview from '../../components/mocks/QuestionReview'
import { loadAnyAttempt, loadActive, newAttempt, saveActive } from '../../lib/mocks/attempts'
import { COHORT_DISCLAIMER, TIERS, type Benchmark } from '../../lib/mocks/cohort'
import { buildReport, kindLabel, pct, pdfFileName } from '../../lib/mocks/report'
import { formatHms, formatScore, type QuestionResult } from '../../lib/mocks/scoring'

type Tab = 'overview' | 'all' | 'correct' | 'incorrect' | 'unattempted' | 'marked' | 'topics'

const TABS: { id: Tab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'all', label: 'All' },
  { id: 'correct', label: 'Correct' },
  { id: 'incorrect', label: 'Incorrect' },
  { id: 'unattempted', label: 'Unattempted' },
  { id: 'marked', label: 'Marked For Review' },
  { id: 'topics', label: 'Topic Analysis' },
]

const cardBase = 'rounded-2xl bg-white shadow-sm ring-1 ring-slate-200 dark:bg-slate-800 dark:ring-slate-700'

function StatCard({ label, value, suffix, color, icon }: { label: string; value: ReactNode; suffix?: string; color: string; icon: string }) {
  return (
    <div className={`${cardBase} overflow-hidden`}>
      <div className="h-1.5" style={{ background: color }} />
      <div className="p-4">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg text-base" style={{ background: `${color}22`, color }}>
          {icon}
        </span>
        <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">{label}</p>
        <p className="text-2xl font-extrabold text-slate-900 dark:text-slate-100">
          {value}
          {suffix && <span className="ml-1 text-sm font-normal text-slate-400">{suffix}</span>}
        </p>
      </div>
    </div>
  )
}

function BenchmarkCard({ title, b, tone }: { title: string; b: Benchmark; tone: 'topper' | 'you' | 'average' }) {
  const head = tone === 'topper' ? 'bg-amber-500 text-white' : tone === 'you' ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200'
  const val = tone === 'topper' ? 'text-amber-600' : tone === 'you' ? 'text-emerald-600' : 'text-slate-800 dark:text-slate-100'
  const rows: [string, string][] = [
    ['Score', `${formatScore(b.score)} / ${formatScore(b.maxScore)}`],
    ['Accuracy', `${b.accuracy.toFixed(2)}%`],
    ['Correct', String(b.correct)],
    ['Wrong', String(b.wrong)],
    ['Time', formatHms(b.timeSec * 1000)],
  ]
  return (
    <div className={`${cardBase} overflow-hidden`}>
      <div className={`px-4 py-2.5 text-xs font-bold uppercase tracking-wide ${head}`}>{title}</div>
      {rows.map(([k, v]) => (
        <div key={k} className="flex justify-between border-t border-slate-100 px-4 py-3 text-sm first:border-t-0 dark:border-slate-700">
          <span className="text-slate-500 dark:text-slate-400">{k}</span>
          <span className={`font-bold ${k === 'Wrong' && tone !== 'topper' ? 'text-red-600' : val}`}>{v}</span>
        </div>
      ))}
    </div>
  )
}

export default function MockResult() {
  const { attemptId } = useParams()
  const navigate = useNavigate()
  const [tab, setTab] = useState<Tab>('overview')
  const [downloading, setDownloading] = useState(false)
  const [pdfError, setPdfError] = useState<string | null>(null)

  const attempt = useMemo(() => (attemptId ? loadAnyAttempt(attemptId) : null), [attemptId])
  const report = useMemo(() => (attempt && attempt.phase === 'finished' ? buildReport(attempt) : null), [attempt])

  if (!attempt || !report) return <Navigate to="/mocks" replace />
  const { sc, cohort } = report
  const paper = attempt.paper
  const o = sc.overall
  const sectionName = (r: QuestionResult) => paper.sections[r.sectionIndex].name

  const downloadPdf = async () => {
    setDownloading(true)
    setPdfError(null)
    try {
      const { buildResultPdf } = await import('../../lib/mocks/pdf')
      const doc = buildResultPdf(report)
      doc.save(pdfFileName(attempt))
    } catch (e) {
      setPdfError(e instanceof Error ? e.message : 'Could not build the PDF.')
    } finally {
      setDownloading(false)
    }
  }

  const reattempt = () => {
    const existing = loadActive()
    if (existing && existing.phase === 'running' && !window.confirm('You have an unfinished test in progress. Starting this re-attempt will discard it. Continue?')) return
    const next = newAttempt(paper, attempt.attemptNo + 1)
    saveActive(next)
    navigate(`/mocks/test/${next.id}`)
  }

  const filtered: Record<Exclude<Tab, 'overview' | 'topics'>, QuestionResult[]> = {
    all: sc.questions,
    correct: sc.questions.filter((r) => r.verdict === 'correct'),
    incorrect: sc.questions.filter((r) => r.verdict === 'incorrect'),
    unattempted: sc.questions.filter((r) => r.verdict === 'unattempted'),
    marked: sc.questions.filter((r) => r.marked),
  }

  const totalQ = o.total
  const bars = [
    { label: 'Correct', n: o.correct, color: '#10b981' },
    { label: 'Incorrect', n: o.incorrect, color: '#ef4444' },
    { label: 'Unattempted', n: o.unattempted, color: '#9ca3af' },
  ]
  const axisMax = Math.max(20, Math.ceil(Math.max(...bars.map((b) => b.n)) / 20) * 20)
  const secColors = { score: 'text-violet-600', attempted: 'text-blue-600', accuracy: 'text-emerald-600', correct: 'text-emerald-600', incorrect: 'text-red-600', unattempted: 'text-slate-600 dark:text-slate-300', time: 'text-orange-600' }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link to="/mocks/history" className="text-sm font-medium text-indigo-600 dark:text-indigo-400">
            ← Results
          </Link>
          <h1 className="mt-1 text-2xl font-extrabold text-slate-900 dark:text-slate-100">{paper.title}</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {kindLabel(paper.kind)} · attempt {attempt.attemptNo} · {new Date(attempt.finishedAt ?? 0).toLocaleString()}
          </p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={reattempt} className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700">
            ↻ Re-attempt
          </button>
          <button type="button" onClick={() => setTab('all')} className="rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700">
            Solution Analysis
          </button>
          <button type="button" onClick={downloadPdf} disabled={downloading} className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60">
            {downloading ? 'Building PDF…' : '⬇ Download PDF'}
          </button>
        </div>
      </div>
      {pdfError && (
        <p role="alert" className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-300">
          {pdfError}
        </p>
      )}

      <nav className="mt-6 flex gap-1 overflow-x-auto border-b border-slate-200 dark:border-slate-700">
        {TABS.map((t) => {
          const count = t.id in filtered ? filtered[t.id as keyof typeof filtered].length : null
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-semibold transition ${tab === t.id ? 'border-violet-600 text-violet-700 dark:text-violet-300' : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'}`}
            >
              {t.label}
              {count !== null && <span className="ml-1.5 text-xs opacity-60">{count}</span>}
            </button>
          )
        })}
      </nav>

      {tab === 'overview' && (
        <div className="mt-6 space-y-8">
          <section>
            <h2 className="mb-3 text-lg font-bold text-slate-900 dark:text-slate-100">📊 Your Results</h2>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <StatCard label="Your Score" icon="★" color="#f59e0b" value={formatScore(o.score)} suffix={`/${o.maxScore}`} />
              <StatCard label="Rank (est.)" icon="↗" color="#8b5cf6" value={cohort.rank.toLocaleString('en-IN')} suffix={`/${cohort.size.toLocaleString('en-IN')}`} />
              <StatCard label="Percentile (est.)" icon="%" color="#3b82f6" value={`${cohort.percentile.toFixed(2)}%`} />
              <StatCard label="Correct" icon="✓" color="#10b981" value={o.correct} />
              <StatCard label="Incorrect" icon="✕" color="#ef4444" value={o.incorrect} />
              <StatCard label="Unattempted" icon="−" color="#9ca3af" value={o.unattempted} />
              <StatCard label="Accuracy" icon="◎" color="#06b6d4" value={o.accuracy.toFixed(2)} suffix="%" />
            </div>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-bold text-slate-900 dark:text-slate-100">🏆 Rank Predictor</h2>
            <div className="grid gap-4 md:grid-cols-5">
              <div className={`${cardBase} p-5 md:col-span-2`}>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600 dark:bg-slate-700 dark:text-slate-200">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: cohort.tier.color }} />
                  {cohort.tier.id}
                </span>
                <p className="mt-3 text-4xl font-extrabold text-slate-900 dark:text-slate-100">#{cohort.rank.toLocaleString('en-IN')}</p>
                <p className="text-sm text-slate-500 dark:text-slate-400">out of {cohort.size.toLocaleString('en-IN')} members (simulated)</p>
                <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
                  <div className="rounded-xl bg-slate-50 p-2 dark:bg-slate-900/50">
                    <p className="text-slate-500">Marks</p>
                    <p className="font-bold text-slate-900 dark:text-slate-100">
                      {formatScore(o.score)}
                      <span className="font-normal text-slate-400">/{o.maxScore}</span>
                    </p>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-2 dark:bg-slate-900/50">
                    <p className="text-slate-500">Members ahead of you</p>
                    <p className="font-bold text-emerald-600">{cohort.ahead.toLocaleString('en-IN')}</p>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-2 dark:bg-slate-900/50">
                    <p className="text-slate-500">Members behind you</p>
                    <p className="font-bold text-red-600">{cohort.behind.toLocaleString('en-IN')}</p>
                  </div>
                </div>
                <div className="mt-4 flex justify-between text-sm">
                  <span className="text-slate-500 dark:text-slate-400">{cohort.nextTier ? `Progress to ${cohort.nextTier.id}` : 'Top tier reached'}</span>
                  <span className="font-bold text-slate-900 dark:text-slate-100">{Math.round(cohort.progressToNext)}%</span>
                </div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                  <div className="h-full rounded-full" style={{ width: `${cohort.progressToNext}%`, background: cohort.nextTier?.color ?? cohort.tier.color }} />
                </div>
              </div>

              <div className={`${cardBase} p-5 md:col-span-3`}>
                <h3 className="font-bold text-slate-900 dark:text-slate-100">Rank &amp; Tier Breakdown</h3>
                <div className="mt-4 flex items-center justify-between text-sm text-slate-500 dark:text-slate-400">
                  <span>Rank Distribution</span>
                  <span className="rounded-full bg-slate-100 px-3 py-0.5 text-xs font-semibold dark:bg-slate-700">{cohort.tier.id}</span>
                </div>
                <div className="relative mt-3 h-2 rounded-full" style={{ background: 'linear-gradient(90deg,#ef4444,#f59e0b,#eab308,#22c55e)' }}>
                  <span className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-slate-900" style={{ left: `${cohort.percentile}%` }} />
                </div>
                <div className="relative mt-2 h-5 text-[10px] text-slate-400">
                  {[...TIERS].reverse().map((t) => (
                    <span key={t.id} className="absolute -translate-x-1/2" style={{ left: `${t.min}%`, color: t.color }}>
                      ●
                    </span>
                  ))}
                </div>
                <h4 className="mt-3 text-sm font-bold text-slate-900 dark:text-slate-100">Rank Tiers</h4>
                <div className="mt-2 flex flex-wrap gap-2">
                  {TIERS.map((t) => (
                    <span key={t.id} className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${t.id === cohort.tier.id ? 'border-slate-400 bg-slate-100 dark:border-slate-500 dark:bg-slate-700' : 'border-slate-200 dark:border-slate-700'} text-slate-700 dark:text-slate-200`}>
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: t.color }} />
                      {t.id}
                    </span>
                  ))}
                </div>
              </div>
            </div>
            <p className="mt-2 text-xs text-slate-400">{COHORT_DISCLAIMER}</p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-bold text-slate-900 dark:text-slate-100">📈 Performance Breakdown</h2>
            <div className={`${cardBase} p-5`}>
              <div className="mb-2 flex justify-end gap-4 text-xs text-slate-500">
                {bars.map((b) => (
                  <span key={b.label} className="inline-flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full" style={{ background: b.color }} />
                    {b.label}
                  </span>
                ))}
              </div>
              <div className="flex h-56 gap-3">
                <div className="flex flex-col justify-between pb-6 text-right text-[11px] text-slate-400">
                  {[axisMax, (axisMax * 3) / 4, axisMax / 2, axisMax / 4, 0].map((t) => (
                    <span key={t}>{Math.round(t)}</span>
                  ))}
                </div>
                <div className="flex flex-1 items-end justify-around border-b border-l border-slate-200 pb-0 dark:border-slate-700">
                  {bars.map((b) => (
                    <div key={b.label} className="flex w-1/4 flex-col items-center justify-end" style={{ height: '100%' }}>
                      <span className="mb-1 text-sm font-bold" style={{ color: b.color }}>
                        {b.n}
                      </span>
                      <div className="flex w-full items-center justify-center rounded-t text-[11px] font-semibold text-white" style={{ height: `${(b.n / axisMax) * 85}%`, minHeight: b.n ? 18 : 2, background: b.color }}>
                        {b.n ? `${Math.round(pct(b.n, totalQ))}%` : ''}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex justify-around pl-8 pt-2 text-xs text-slate-500">
                {bars.map((b) => (
                  <span key={b.label} className="w-1/4 text-center">
                    {b.label}
                  </span>
                ))}
              </div>
            </div>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-bold text-slate-900 dark:text-slate-100">📄 Sectional Summary</h2>
            <div className={`${cardBase} overflow-x-auto`}>
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-xs font-semibold dark:border-slate-700">
                    <th className="p-3 text-slate-500">Section Name</th>
                    <th className="p-3 text-violet-600">Score</th>
                    <th className="p-3 text-blue-600">Attempted</th>
                    <th className="p-3 text-emerald-600">Accuracy</th>
                    <th className="p-3 text-emerald-600">Correct</th>
                    <th className="p-3 text-red-600">Incorrect</th>
                    <th className="p-3 text-slate-600 dark:text-slate-300">Unattempted</th>
                    <th className="p-3 text-orange-600">Time</th>
                  </tr>
                </thead>
                <tbody>
                  {[...sc.sections, sc.overall].map((s, i, arr) => {
                    const overall = i === arr.length - 1
                    return (
                      <tr key={s.name} className="border-b border-slate-100 last:border-0 dark:border-slate-700/60">
                        <td className={`p-3 ${overall ? 'font-extrabold' : 'font-medium'} text-slate-900 dark:text-slate-100`}>{s.name}</td>
                        <td className={`p-3 ${secColors.score}`}>
                          <b className="text-lg">{formatScore(s.score)}</b> <span className="text-slate-400">/{s.maxScore}</span>
                        </td>
                        <td className={`p-3 ${secColors.attempted}`}>
                          <b className="text-lg">{s.attempted}</b> <span className="text-slate-400">/{s.total}</span>
                          <div className="text-[11px] text-slate-400">of total Qs</div>
                        </td>
                        <td className={`p-3 ${secColors.accuracy}`}>
                          <b className="text-lg">{s.accuracy.toFixed(2)}%</b>
                          <div className="text-[11px] text-slate-400">accuracy</div>
                        </td>
                        <td className={`p-3 ${secColors.correct}`}>
                          <b className="text-lg">{s.correct}</b> <span className="text-slate-400">/{s.total}</span>
                          <div className="text-[11px] text-slate-400">{s.accuracy.toFixed(2)}% accuracy</div>
                        </td>
                        <td className={`p-3 ${secColors.incorrect}`}>
                          <b className="text-lg">{s.incorrect}</b> <span className="text-slate-400">/{s.total}</span>
                          <div className="text-[11px] text-slate-400">{s.attempted ? ((s.incorrect / s.attempted) * 100).toFixed(2) : '0.00'}% of attempted</div>
                        </td>
                        <td className={`p-3 ${secColors.unattempted}`}>
                          <b className="text-lg">{s.unattempted}</b> <span className="text-slate-400">/{s.total}</span>
                          <div className="text-[11px] text-slate-400">skipped</div>
                        </td>
                        <td className={`p-3 ${secColors.time}`}>
                          <b className="text-lg">{formatHms(s.timeMs)}</b>
                          <div className="text-[11px] text-slate-400">hh:mm:ss</div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-bold text-slate-900 dark:text-slate-100">☆ Compare with Topper</h2>
            <div className="grid gap-4 md:grid-cols-3">
              <BenchmarkCard title="Topper (benchmark)" tone="topper" b={cohort.topper} />
              <BenchmarkCard
                title="You"
                tone="you"
                b={{ score: o.score, maxScore: o.maxScore, accuracy: o.accuracy, correct: o.correct, wrong: o.incorrect, timeSec: report.usedSec }}
              />
              <BenchmarkCard title="Average (benchmark)" tone="average" b={cohort.average} />
            </div>
            <p className="mt-2 text-xs text-slate-400">Topper and average are model benchmarks for this exam level, not real users.</p>
          </section>
        </div>
      )}

      {tab !== 'overview' && tab !== 'topics' && (
        <div className="mt-6 space-y-4">
          {filtered[tab].length === 0 ? (
            <p className="rounded-2xl bg-white p-6 text-center text-slate-500 ring-1 ring-slate-200 dark:bg-slate-800 dark:ring-slate-700">No questions in this category.</p>
          ) : (
            filtered[tab].map((r) => <QuestionReview key={r.q.id} r={r} sectionName={sectionName(r)} stimulus={r.q.setId ? paper.sets[r.q.setId] : undefined} />)
          )}
        </div>
      )}

      {tab === 'topics' && (
        <div className={`${cardBase} mt-6 overflow-x-auto`}>
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs font-semibold text-slate-500 dark:border-slate-700">
                <th className="p-3">Topic</th>
                <th className="p-3">Section</th>
                <th className="p-3">Questions</th>
                <th className="p-3">Attempted</th>
                <th className="p-3">Correct</th>
                <th className="p-3">Accuracy</th>
                <th className="p-3">Avg time / Q</th>
              </tr>
            </thead>
            <tbody className="text-slate-800 dark:text-slate-200">
              {[...sc.topics]
                .sort((a, b) => a.accuracy - b.accuracy)
                .map((t) => (
                  <tr key={t.topic} className="border-b border-slate-100 last:border-0 dark:border-slate-700/60">
                    <td className="p-3 font-medium">{t.label}</td>
                    <td className="p-3 capitalize">{t.section}</td>
                    <td className="p-3">{t.total}</td>
                    <td className="p-3">{t.attempted}</td>
                    <td className="p-3">{t.correct}</td>
                    <td className={`p-3 font-semibold ${t.attempted === 0 ? 'text-slate-400' : t.accuracy >= 75 ? 'text-emerald-600' : t.accuracy >= 50 ? 'text-amber-600' : 'text-red-600'}`}>{t.attempted ? `${t.accuracy.toFixed(0)}%` : '—'}</td>
                    <td className="p-3">{Math.round(t.timeMs / 1000 / t.total)}s</td>
                  </tr>
                ))}
            </tbody>
          </table>
          <p className="p-3 text-xs text-slate-400">Sorted weakest first. Topics you skipped show “—”.</p>
        </div>
      )}
    </div>
  )
}
