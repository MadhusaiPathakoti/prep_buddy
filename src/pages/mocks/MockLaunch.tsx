import { useRef, useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { EXAMS, TOPIC_TEST, entryTotal } from '../../lib/mocks/blueprints'
import { composePaper, type ComposeRequest } from '../../lib/mocks/compose'
import { loadActive, newAttempt, saveActive } from '../../lib/mocks/attempts'
import { getEnglishSource, setEnglishSource, type EnglishSource } from '../../lib/mocks/english'
import { SET_SIZE, TOPIC_BY_ID, topicLabel, topicsOf } from '../../lib/mocks/topics'
import type { MockExamId, MockKind, MockSectionId, MockTopicId } from '../../lib/mocks/types'

const SECTION_ORDER: MockSectionId[] = ['english', 'quant', 'reasoning']
const SECTION_ICON: Record<MockSectionId, string> = { english: '📚', quant: '📊', reasoning: '🧩' }

interface Progress {
  done: number
  total: number
  label: string
}

export default function MockLaunch() {
  const { exam: examParam, kind: kindParam } = useParams()
  const navigate = useNavigate()
  const examOk = examParam === 'po' || examParam === 'clerk'
  const kindOk = kindParam === 'full' || kindParam === 'sectional' || kindParam === 'topic'

  const [section, setSection] = useState<MockSectionId>('quant')
  const [topic, setTopic] = useState<MockTopicId | null>(null)
  const [questionCount, setQuestionCount] = useState(TOPIC_TEST.defaultQuestions)
  const [secPerQ, setSecPerQ] = useState(TOPIC_TEST.defaultSecPerQ)
  const [progress, setProgress] = useState<Progress | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [englishSource, setEnglishSourceState] = useState<EnglishSource>(() => getEnglishSource())
  const abortRef = useRef<AbortController | null>(null)

  if (!examOk || !kindOk) return <Navigate to="/mocks" replace />
  const examId = examParam as MockExamId
  const kind = kindParam as MockKind
  const exam = EXAMS[examId]

  const sectionInfo = (id: MockSectionId) => {
    const sb = exam.sections.find((s) => s.id === id)!
    return { sb, count: entryTotal(sb.entries), minutes: sb.durationSec / 60 }
  }

  const topicsInSection = topicsOf(section)
  const natural = topic ? SET_SIZE[topic] : undefined
  const topicTotalSec = questionCount * secPerQ

  const request = (): ComposeRequest | null => {
    if (kind === 'full') return { exam: examId, kind }
    if (kind === 'sectional') return { exam: examId, kind, section }
    if (!topic) return null
    return { exam: examId, kind, section: TOPIC_BY_ID[topic].section, topic, questionCount, secPerQuestion: secPerQ }
  }

  const start = async () => {
    const req = request()
    if (!req) return
    const existing = loadActive()
    if (existing && existing.phase === 'running' && !window.confirm('You have an unfinished test in progress. Starting a new one will discard it. Continue?')) return

    setError(null)
    setProgress({ done: 0, total: 1, label: 'Preparing your paper…' })
    const controller = new AbortController()
    abortRef.current = controller
    try {
      const paper = await composePaper(req, { signal: controller.signal, onProgress: setProgress })
      const attempt = newAttempt(paper)
      saveActive(attempt)
      navigate(`/mocks/test/${attempt.id}`)
    } catch (e) {
      if (!(e instanceof DOMException && e.name === 'AbortError')) setError(e instanceof Error ? e.message : 'Something went wrong while preparing the paper.')
      setProgress(null)
    } finally {
      abortRef.current = null
    }
  }

  const title = kind === 'full' ? 'Full-length mock' : kind === 'sectional' ? 'Sectional mock' : 'Topic-wise mock'
  const canStart = kind !== 'topic' || topic !== null
  const needsEnglish = kind === 'full' || (kind === 'sectional' && section === 'english') || (kind === 'topic' && topic !== null && TOPIC_BY_ID[topic].section === 'english')

  const card = 'rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200 dark:bg-slate-800 dark:ring-slate-700'

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <Link to={`/mocks/${examId}`} className="text-sm font-medium text-indigo-600 dark:text-indigo-400">
        ← {exam.name}
      </Link>
      <h1 className="mb-6 mt-3 text-3xl font-extrabold text-slate-900 dark:text-slate-100">{title}</h1>

      {kind === 'full' && (
        <div className={card}>
          <p className="mb-4 text-sm text-slate-600 dark:text-slate-300">
            Three timed sections, in this order. Each section has its own 20-minute clock and, as in the real exam, you cannot go back to a section once it ends. +1 for every correct answer, −0.25 for every wrong one.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 dark:border-slate-700 dark:text-slate-400">
                  <th className="py-2">Section</th>
                  <th className="py-2">Questions</th>
                  <th className="py-2">Time</th>
                  <th className="py-2">What it covers</th>
                </tr>
              </thead>
              <tbody className="text-slate-800 dark:text-slate-200">
                {exam.sections.map((s) => (
                  <tr key={s.id} className="border-b border-slate-100 align-top dark:border-slate-700/60">
                    <td className="py-2 pr-3 font-semibold">{s.name}</td>
                    <td className="py-2 pr-3">{entryTotal(s.entries)}</td>
                    <td className="py-2 pr-3">{s.durationSec / 60} min</td>
                    <td className="py-2 text-xs text-slate-500 dark:text-slate-400">
                      {s.entries.map((e) => `${e.mode === 'spread' && e.topics.length > 3 ? 'Arithmetic' : e.topics.map(topicLabel).join(' / ')} (${e.count})`).join(' · ')}
                    </td>
                  </tr>
                ))}
                <tr className="font-bold">
                  <td className="py-2">Total</td>
                  <td className="py-2">{exam.sections.reduce((n, s) => n + entryTotal(s.entries), 0)}</td>
                  <td className="py-2">{exam.sections.reduce((n, s) => n + s.durationSec / 60, 0)} min</td>
                  <td />
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {kind === 'sectional' && (
        <div className="grid gap-3">
          {SECTION_ORDER.map((id) => {
            const { sb, count, minutes } = sectionInfo(id)
            const on = section === id
            return (
              <button
                key={id}
                type="button"
                onClick={() => setSection(id)}
                className={`${card} flex items-center gap-4 text-left transition ${on ? 'ring-2 ring-indigo-500' : 'hover:shadow-md'}`}
              >
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-50 text-2xl dark:bg-indigo-500/10">{SECTION_ICON[id]}</span>
                <span className="flex-1">
                  <span className="block text-lg font-bold text-slate-900 dark:text-slate-100">{sb.name}</span>
                  <span className="block text-sm text-slate-500 dark:text-slate-400">
                    {count} questions · {minutes} minutes
                  </span>
                </span>
                <span className={`h-5 w-5 rounded-full border-2 ${on ? 'border-indigo-600 bg-indigo-600 shadow-[inset_0_0_0_3px_white]' : 'border-slate-300 dark:border-slate-600'}`} />
              </button>
            )
          })}
        </div>
      )}

      {kind === 'topic' && (
        <div className="space-y-5">
          <div className="flex gap-2">
            {SECTION_ORDER.map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => {
                  setSection(id)
                  setTopic(null)
                }}
                className={`flex-1 rounded-2xl px-3 py-2.5 text-sm font-semibold transition ${section === id ? 'bg-indigo-600 text-white' : 'bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50 dark:bg-slate-800 dark:text-slate-200 dark:ring-slate-700'}`}
              >
                {SECTION_ICON[id]} {exam.sections.find((s) => s.id === id)?.name.split(' ')[0]}
              </button>
            ))}
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            {topicsInSection.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTopic(t.id)}
                className={`rounded-2xl p-3 text-left transition ${topic === t.id ? 'bg-indigo-50 ring-2 ring-indigo-500 dark:bg-indigo-500/10' : 'bg-white ring-1 ring-slate-200 hover:shadow-sm dark:bg-slate-800 dark:ring-slate-700'}`}
              >
                <span className="block text-sm font-bold text-slate-900 dark:text-slate-100">{t.label}</span>
                <span className="block text-xs text-slate-500 dark:text-slate-400">{t.blurb}</span>
              </button>
            ))}
          </div>

          <div className={card}>
            <label className="block text-sm font-semibold text-slate-800 dark:text-slate-100">
              Number of questions: <span className="text-indigo-600 dark:text-indigo-400">{questionCount}</span>
              <input type="range" min={TOPIC_TEST.minQuestions} max={TOPIC_TEST.maxQuestions} value={questionCount} onChange={(e) => setQuestionCount(Number(e.target.value))} className="mt-2 w-full accent-indigo-600" />
            </label>
            {natural && (
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                {topic && topicLabel(topic)} comes in sets of {natural} questions sharing one {topic === 'rc' || topic === 'cloze' ? 'passage' : 'set of data'}; the last set may be shorter.
              </p>
            )}
            <label className="mt-5 block text-sm font-semibold text-slate-800 dark:text-slate-100">
              Time per question: <span className="text-indigo-600 dark:text-indigo-400">{secPerQ} seconds</span>
              <input type="range" min={TOPIC_TEST.minSecPerQ} max={TOPIC_TEST.maxSecPerQ} step={5} value={secPerQ} onChange={(e) => setSecPerQ(Number(e.target.value))} className="mt-2 w-full accent-indigo-600" />
            </label>
            <p className="mt-4 rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-700 dark:bg-slate-900/50 dark:text-slate-300">
              Total time: <b>{Math.floor(topicTotalSec / 60)} min {topicTotalSec % 60 ? `${topicTotalSec % 60} s` : ''}</b> for {questionCount} questions
            </p>
          </div>
        </div>
      )}

      {needsEnglish && (
        <div className="mt-4 rounded-2xl bg-sky-50 p-3 text-xs text-sky-900 dark:bg-sky-500/10 dark:text-sky-100">
          <p className="mb-2 font-semibold">English questions</p>
          <div role="radiogroup" aria-label="English question source" className="grid gap-2 sm:grid-cols-2">
            {(
              [
                { id: 'curated', title: 'Curated bank (recommended)', desc: 'Reviewed questions. Loads instantly and needs no internet or API keys. Questions you have already seen are skipped until the bank runs out.' },
                { id: 'ai', title: 'Fresh AI questions', desc: 'Written by AI and cross-checked by a second model. Needs API keys, can take a minute, and falls back to the curated bank if the AI service is busy.' },
              ] as { id: EnglishSource; title: string; desc: string }[]
            ).map((o) => (
              <button
                key={o.id}
                type="button"
                role="radio"
                aria-checked={englishSource === o.id}
                onClick={() => {
                  setEnglishSource(o.id)
                  setEnglishSourceState(o.id)
                }}
                className={`rounded-xl p-3 text-left transition ${englishSource === o.id ? 'bg-white ring-2 ring-sky-500 dark:bg-slate-800' : 'bg-white/50 ring-1 ring-sky-200 hover:bg-white dark:bg-slate-800/40 dark:ring-sky-500/30'}`}
              >
                <span className="block text-sm font-bold text-slate-900 dark:text-slate-100">{o.title}</span>
                <span className="mt-0.5 block text-slate-600 dark:text-slate-300">{o.desc}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {error && (
        <div role="alert" className="mt-4 rounded-2xl border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-200">
          {error}
        </div>
      )}

      <button
        type="button"
        onClick={start}
        disabled={!canStart || progress !== null}
        className="mt-6 w-full rounded-2xl bg-indigo-600 px-6 py-3.5 text-base font-bold text-white shadow-sm transition hover:bg-indigo-700 disabled:opacity-50"
      >
        {kind === 'topic' && !topic ? 'Pick a topic to continue' : error ? 'Try again' : 'Prepare paper'}
      </button>

      {progress && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-xl dark:bg-slate-800">
            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">Preparing your paper</h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              {progress.label} — {progress.done} of {progress.total} questions ready
            </p>
            <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
              <div className="h-full rounded-full bg-indigo-600 transition-all" style={{ width: `${Math.max(4, (progress.done / Math.max(1, progress.total)) * 100)}%` }} />
            </div>
            <button type="button" onClick={() => abortRef.current?.abort()} className="mt-5 w-full rounded-xl border border-slate-300 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700">
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
