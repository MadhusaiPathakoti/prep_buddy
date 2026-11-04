import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import StatusBadge from '../../components/mocks/StatusBadge'
import StimulusView from '../../components/mocks/StimulusView'
import { loadAnyAttempt, saveActive, saveFinished, setCandidateName, type Attempt } from '../../lib/mocks/attempts'
import { advanceSection, answer, begin, clearAnswer, countStatuses, finish, neighbour, remainingMs, sectionQuestionIds, setMarked, tick, totalRemainingMs, visit } from '../../lib/mocks/engine'
import { formatClock, statusOf, type QStatus } from '../../lib/mocks/scoring'
import type { MockQuestion } from '../../lib/mocks/types'

const OPTION_LETTERS = ['A', 'B', 'C', 'D', 'E']
const FONT_SIZES = [14, 16, 18, 20]

type ModalKind = null | 'summary' | 'paper' | 'instructions' | 'section-over'

const LEGEND: { status: QStatus; label: string }[] = [
  { status: 'answered', label: 'Answered' },
  { status: 'not-answered', label: 'Not Answered' },
  { status: 'not-visited', label: 'Not Visited' },
  { status: 'marked', label: 'Marked for Review' },
  { status: 'answered-marked', label: 'Answered & Marked for Review (will be considered for evaluation)' },
]

function Modal({ title, onClose, children, wide, footer }: { title: string; onClose?: () => void; children: ReactNode; wide?: boolean; footer?: ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className={`flex max-h-[90vh] w-full flex-col rounded-md bg-white shadow-xl ${wide ? 'max-w-4xl' : 'max-w-xl'}`}>
        <div className="flex items-center justify-between border-b border-slate-200 bg-[#e8eef7] px-5 py-3">
          <h2 className="font-bold text-slate-800">{title}</h2>
          {onClose && (
            <button type="button" onClick={onClose} aria-label="Close" className="text-xl leading-none text-slate-500 hover:text-slate-800">
              ×
            </button>
          )}
        </div>
        <div className="overflow-y-auto px-5 py-4 text-sm text-slate-700">{children}</div>
        {footer && <div className="flex justify-end gap-3 border-t border-slate-200 px-5 py-3">{footer}</div>}
      </div>
    </div>
  )
}

const btn = 'rounded border px-4 py-2 text-sm font-semibold transition disabled:opacity-40'
const btnLight = `${btn} border-slate-300 bg-white text-slate-700 hover:bg-slate-50`
const btnBlue = `${btn} border-[#1a56a0] bg-[#1a73d4] text-white hover:bg-[#1a56a0]`

function InstructionsBody({ attempt }: { attempt: Attempt }) {
  const p = attempt.paper
  const locked = p.sectionLocked
  return (
    <div className="space-y-3 leading-relaxed">
      <p>
        <b>Please read the instructions carefully.</b>
      </p>
      <ol className="list-decimal space-y-2 pl-5">
        <li>
          Total duration of the examination is <b>{Math.round(p.totalDurationSec / 60)} minutes</b>
          {locked && (
            <>
              {' '}
              ({p.sections.map((s) => `${s.name}: ${Math.round(s.durationSec / 60)} min`).join(' · ')})
            </>
          )}
          . The countdown timer at the top right of the screen shows the time remaining. When it reaches zero the {locked ? 'section' : 'test'} ends by itself — you do not need to submit manually.
        </li>
        {locked && (
          <li>
            Each section has its own timer. You can move to the next section only by submitting the current one or when its time ends. <b>You cannot return to a section once it is over</b>, and unused time does not carry forward.
          </li>
        )}
        <li>
          Each question carries <b>{p.marksPerQuestion} mark</b>. <b>{p.negativeMarks} mark</b> is deducted for every wrong answer. There is no penalty for questions you leave unanswered.
        </li>
        <li>The question palette on the right shows the status of each question:</li>
      </ol>
      <ul className="space-y-1.5 pl-3">
        {LEGEND.map((l) => (
          <li key={l.status} className="flex items-center gap-3">
            <StatusBadge status={l.status} label="" size={26} />
            <span>{l.label}</span>
          </li>
        ))}
      </ul>
      <ol start={locked ? 5 : 4} className="list-decimal space-y-2 pl-5">
        <li>
          Choose an answer by clicking an option (or pressing <kbd className="rounded border px-1">A</kbd>–<kbd className="rounded border px-1">E</kbd> or <kbd className="rounded border px-1">1</kbd>–<kbd className="rounded border px-1">5</kbd>). Click <b>Clear Response</b> to remove it.
        </li>
        <li>
          <b>Save &amp; Next</b> records your answer and opens the next question. <b>Mark for Review &amp; Next</b> flags the question to revisit; an answered question that is also marked is still evaluated.
        </li>
        <li>Click a number in the palette to jump to that question{locked ? ' (within the current section)' : ''}. Sets (passages, tables, charts, puzzles) stay on the left while you move between their questions.</li>
        <li>Use <b>A−</b> / <b>A+</b> to change the text size and <b>Question Paper</b> to view every question of the section at once.</li>
        <li>Keyboard: <kbd className="rounded border px-1">N</kbd> next, <kbd className="rounded border px-1">P</kbd> previous, <kbd className="rounded border px-1">M</kbd> mark &amp; next.</li>
        <li>Do not refresh or close the window. If you do, your test resumes where you left it, but the clock keeps running.</li>
      </ol>
    </div>
  )
}

export default function MockTest() {
  const { attemptId } = useParams()
  const navigate = useNavigate()
  const [attempt, setAttempt] = useState<Attempt | null>(() => (attemptId ? loadAnyAttempt(attemptId) : null))
  const attemptRef = useRef<Attempt | null>(attempt)
  const finishedRef = useRef(false)
  const [now, setNow] = useState(() => Date.now())
  const [modal, setModal] = useState<ModalKind>(null)
  const [fontStep, setFontStep] = useState(1)
  const [agreed, setAgreed] = useState(false)
  const [name, setName] = useState(() => attempt?.candidate ?? 'Candidate')
  const [fullscreen, setFullscreen] = useState(false)

  const commit = useCallback((next: Attempt) => {
    attemptRef.current = next
    setAttempt(next)
  }, [])

  const goToResult = useCallback(
    (finished: Attempt) => {
      if (finishedRef.current) return
      finishedRef.current = true
      saveFinished(finished)
      if (document.fullscreenElement) document.exitFullscreen().catch(() => undefined)
      navigate(`/mocks/result/${finished.id}`, { replace: true })
    },
    [navigate],
  )

  // Missing attempt → back to the mocks hub; finished attempt → its result.
  useEffect(() => {
    if (!attempt) navigate('/mocks', { replace: true })
    else if (attempt.phase === 'finished') goToResult(attempt)
  }, [attempt, navigate, goToResult])

  // Debounced autosave so a refresh resumes the test.
  useEffect(() => {
    if (!attempt || attempt.phase === 'finished') return
    const t = setTimeout(() => saveActive(attempt), 300)
    return () => clearTimeout(t)
  }, [attempt])

  useEffect(() => {
    const saveNow = () => {
      const a = attemptRef.current
      if (a && a.phase !== 'finished') saveActive(a)
    }
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      const a = attemptRef.current
      if (a && a.phase === 'running') {
        saveNow()
        e.preventDefault()
        e.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    document.addEventListener('visibilitychange', saveNow)
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload)
      document.removeEventListener('visibilitychange', saveNow)
    }
  }, [])

  // Clock.
  const running = attempt?.phase === 'running'
  useEffect(() => {
    if (!running) return
    const id = setInterval(() => {
      const t = Date.now()
      setNow(t)
      const current = attemptRef.current
      if (!current) return
      const { attempt: next, event } = tick(current, t)
      if (next !== current) commit(next)
      if (event === 'finished') goToResult(next)
      else if (event === 'section-expired') setModal('section-over')
    }, 250)
    return () => clearInterval(id)
  }, [running, commit, goToResult])

  useEffect(() => {
    const onFs = () => setFullscreen(Boolean(document.fullscreenElement))
    document.addEventListener('fullscreenchange', onFs)
    return () => document.removeEventListener('fullscreenchange', onFs)
  }, [])

  const questionById = useMemo(() => new Map((attempt?.paper.questions ?? []).map((q) => [q.id, q])), [attempt?.paper])

  const doStart = () => {
    const a = attemptRef.current
    if (!a) return
    setCandidateName(name)
    commit(begin({ ...a, candidate: name.trim() || 'Candidate' }, Date.now()))
    document.documentElement.requestFullscreen?.().catch(() => undefined)
  }

  const goNext = useCallback(
    (after?: (a: Attempt) => Attempt) => {
      const a0 = attemptRef.current
      if (!a0) return
      const t = Date.now()
      const a = after ? after(a0) : a0
      const nextId = neighbour(a, 1)
      commit(nextId ? visit(a, nextId, t) : a)
    },
    [commit],
  )

  const select = useCallback(
    (option: number) => {
      const a = attemptRef.current
      if (a) commit(answer(a, a.currentQuestionId, option))
    },
    [commit],
  )

  const goBack = useCallback(() => {
    const a = attemptRef.current
    if (!a) return
    const prev = neighbour(a, -1)
    if (prev) commit(visit(a, prev, Date.now()))
  }, [commit])

  const markAndNext = useCallback(() => goNext((a) => setMarked(a, a.currentQuestionId, true)), [goNext])

  // Keyboard shortcuts.
  useEffect(() => {
    if (!running || modal) return
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return
      const target = e.target as HTMLElement | null
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) && (target as HTMLInputElement).type !== 'radio') return
      const k = e.key.toLowerCase()
      if (['a', 'b', 'c', 'd', 'e'].includes(k)) select(k.charCodeAt(0) - 97)
      else if (['1', '2', '3', '4', '5'].includes(k)) select(Number(k) - 1)
      else if (k === 'n') goNext()
      else if (k === 'p') goBack()
      else if (k === 'm') markAndNext()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [running, modal, select, goNext, goBack, markAndNext])

  if (!attempt || attempt.phase === 'finished') return null
  const paper = attempt.paper

  if (attempt.phase === 'instructions') {
    return (
      <div className="flex min-h-screen flex-col bg-white text-slate-800" style={{ colorScheme: 'light' }}>
        <header className="bg-[#2b4c7e] px-6 py-3 text-white">
          <h1 className="text-lg font-bold">{paper.title}</h1>
        </header>
        <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-6">
          <h2 className="mb-4 text-center text-xl font-bold">General Instructions</h2>
          <div className="rounded border border-slate-200 p-5 text-[15px]">
            <InstructionsBody attempt={attempt} />
          </div>
          <div className="mt-5 rounded border border-slate-200 bg-slate-50 p-4">
            <label className="mb-3 flex items-center gap-3 text-sm">
              <span className="w-36 font-semibold">Candidate name</span>
              <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} className="w-64 rounded border border-slate-300 px-3 py-1.5" />
            </label>
            <label className="flex items-start gap-3 text-sm">
              <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-1 h-4 w-4" />
              <span>I have read and understood the instructions. I understand that the timer starts as soon as I click “I am ready to begin”.</span>
            </label>
          </div>
        </main>
        <footer className="flex justify-between border-t border-slate-200 px-6 py-3">
          <button type="button" className={btnLight} onClick={() => navigate('/mocks')}>
            ← Back to Mocks
          </button>
          <button type="button" className={btnBlue} disabled={!agreed} onClick={doStart}>
            I am ready to begin
          </button>
        </footer>
      </div>
    )
  }

  const section = paper.sections[attempt.currentSection]
  const ids = sectionQuestionIds(attempt)
  const q = questionById.get(attempt.currentQuestionId) as MockQuestion
  const indexInSection = ids.indexOf(q.id) + 1
  const stimulus = q.setId ? paper.sets[q.setId] : undefined
  const response = attempt.responses[q.id]
  const counts = countStatuses(attempt, attempt.currentSection)
  const clockMs = remainingMs(attempt, now)
  const totalMs = totalRemainingMs(attempt, now)
  const lastSection = attempt.currentSection === paper.sections.length - 1
  const urgent = clockMs < 60_000
  const fontSize = FONT_SIZES[fontStep]

  const submitConfirm = () => {
    const t = Date.now()
    if (paper.sectionLocked && !lastSection) {
      commit(advanceSection(attempt, t))
      setModal(null)
    } else {
      const done = finish(attempt, t)
      commit(done)
      goToResult(done)
    }
  }

  const toggleFullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => undefined)
    else document.documentElement.requestFullscreen?.().catch(() => undefined)
  }

  return (
    <div className="flex h-screen flex-col bg-white text-slate-800" style={{ fontSize, colorScheme: 'light' }}>
      {/* Header */}
      <header className="flex items-center justify-between bg-[#2b4c7e] px-4 py-2 text-white">
        <h1 className="truncate text-base font-bold">{paper.title}</h1>
        <div className="flex items-center gap-4">
          <button type="button" onClick={toggleFullscreen} className="hidden rounded border border-white/40 px-2 py-1 text-xs hover:bg-white/10 sm:block">
            {fullscreen ? 'Exit full screen' : 'Full screen'}
          </button>
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20 text-sm font-bold">{attempt.candidate.slice(0, 1).toUpperCase()}</span>
            <span className="hidden text-sm sm:block">{attempt.candidate}</span>
          </div>
        </div>
      </header>

      {/* Section tabs + clock */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-300 bg-[#e8eef7] px-4 py-1.5">
        <div className="flex flex-wrap gap-1">
          {paper.sections.map((s, i) => {
            const active = i === attempt.currentSection
            const over = i < attempt.currentSection
            return (
              <span
                key={s.id}
                title={active ? 'Current section' : over ? 'Section completed — cannot be revisited' : 'Locked until you finish the current section'}
                className={`rounded px-3 py-1.5 text-sm font-semibold ${active ? 'bg-[#1a73d4] text-white' : over ? 'bg-slate-200 text-slate-400 line-through' : 'bg-white text-slate-400'}`}
              >
                {!active && '🔒 '}
                {s.name}
              </span>
            )
          })}
        </div>
        <div className="flex items-center gap-4 text-sm">
          {paper.sectionLocked && <span className="text-slate-600">Total left: {formatClock(totalMs / 1000)}</span>}
          <span className={`rounded px-3 py-1 text-base font-bold tabular-nums ${urgent ? 'bg-red-600 text-white' : 'bg-white text-slate-800'}`}>
            {paper.sectionLocked ? 'Section time left' : 'Time left'}: {formatClock(clockMs / 1000)}
          </span>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        {/* Question area */}
        <section className="flex min-h-0 flex-1 flex-col">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-2">
            <div className="flex items-center gap-3">
              <span className="text-base font-bold">Question No. {indexInSection}</span>
              <span className="rounded bg-slate-100 px-2 py-0.5 text-xs">
                Marks: <b className="text-green-700">+{paper.marksPerQuestion}</b> / <b className="text-red-600">−{paper.negativeMarks}</b>
              </span>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <span className="text-slate-500">Text size</span>
              <button type="button" className={`${btnLight} px-2 py-1`} disabled={fontStep === 0} onClick={() => setFontStep((s) => Math.max(0, s - 1))}>
                A−
              </button>
              <button type="button" className={`${btnLight} px-2 py-1`} disabled={fontStep === FONT_SIZES.length - 1} onClick={() => setFontStep((s) => Math.min(FONT_SIZES.length - 1, s + 1))}>
                A+
              </button>
              <select aria-label="Language" className="rounded border border-slate-300 px-2 py-1" defaultValue="en">
                <option value="en">English</option>
              </select>
            </div>
          </div>

          <div className={`flex min-h-0 flex-1 ${stimulus ? 'flex-col md:flex-row' : ''}`}>
            {stimulus && (
              <div className="min-h-0 overflow-y-auto border-slate-200 p-4 md:w-1/2 md:border-r">
                <StimulusView stimulus={stimulus} />
              </div>
            )}
            <div className={`min-h-0 overflow-y-auto p-4 ${stimulus ? 'md:w-1/2' : 'w-full'}`}>
              <p className="mb-4 whitespace-pre-line font-medium leading-relaxed">{q.stem}</p>
              <div role="radiogroup" aria-label="Options" className="space-y-2">
                {q.options.map((opt, i) => {
                  const selected = response?.selected === i
                  return (
                    <label key={i} className={`flex cursor-pointer items-start gap-3 rounded border px-3 py-2 ${selected ? 'border-[#1a73d4] bg-blue-50' : 'border-slate-200 hover:bg-slate-50'}`}>
                      <input type="radio" name={`opt-${q.id}`} checked={selected} onChange={() => select(i)} className="mt-1.5 h-4 w-4" />
                      <span className="font-semibold">{OPTION_LETTERS[i]}.</span>
                      <span className="whitespace-pre-line">{opt}</span>
                    </label>
                  )
                })}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-300 bg-slate-50 px-4 py-2.5">
            <div className="flex flex-wrap gap-2">
              <button type="button" className={btnLight} onClick={markAndNext}>
                Mark for Review &amp; Next
              </button>
              <button type="button" className={btnLight} onClick={() => commit(clearAnswer(attempt, q.id))} disabled={response?.selected == null}>
                Clear Response
              </button>
            </div>
            <div className="flex gap-2">
              <button type="button" className={btnLight} onClick={goBack} disabled={indexInSection === 1}>
                ‹ Back
              </button>
              <button type="button" className={btnLight} onClick={() => goNext()} disabled={indexInSection === ids.length}>
                Next ›
              </button>
              <button type="button" className={btnBlue} onClick={() => goNext()}>
                Save &amp; Next
              </button>
            </div>
          </div>
        </section>

        {/* Palette */}
        <aside className="flex max-h-[45vh] min-h-0 flex-col border-t border-slate-300 bg-[#f3f6fb] lg:max-h-none lg:w-80 lg:border-l lg:border-t-0">
          <div className="grid grid-cols-2 gap-x-2 gap-y-2 border-b border-slate-200 p-3 text-xs">
            <Legend status="answered" label="Answered" count={counts.answered} />
            <Legend status="not-answered" label="Not Answered" count={counts['not-answered']} />
            <Legend status="not-visited" label="Not Visited" count={counts['not-visited']} />
            <Legend status="marked" label="Marked for Review" count={counts.marked} />
            <div className="col-span-2">
              <Legend status="answered-marked" label="Answered & Marked for Review" count={counts['answered-marked']} />
            </div>
          </div>
          <div className="bg-[#2b4c7e] px-3 py-1.5 text-sm font-semibold text-white">{section.name}</div>
          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            <p className="mb-2 text-xs font-semibold text-slate-600">Choose a Question</p>
            <div className="grid grid-cols-5 gap-2">
              {ids.map((id, i) => (
                <StatusBadge key={id} status={statusOf(attempt.responses[id])} label={i + 1} current={id === q.id} onClick={() => commit(visit(attempt, id, Date.now()))} title={`Question ${i + 1}`} />
              ))}
            </div>
          </div>
          <div className="flex flex-wrap gap-2 border-t border-slate-200 p-3">
            <button type="button" className={`${btnLight} flex-1`} onClick={() => setModal('paper')}>
              Question Paper
            </button>
            <button type="button" className={`${btnLight} flex-1`} onClick={() => setModal('instructions')}>
              Instructions
            </button>
            <button type="button" className={`${btn} w-full border-green-700 bg-green-600 text-white hover:bg-green-700`} onClick={() => setModal('summary')}>
              {paper.sectionLocked && !lastSection ? 'Submit Section' : 'Submit Test'}
            </button>
          </div>
        </aside>
      </div>

      {modal === 'instructions' && (
        <Modal title="Instructions" onClose={() => setModal(null)} wide>
          <InstructionsBody attempt={attempt} />
        </Modal>
      )}

      {modal === 'paper' && (
        <Modal title={`Question Paper — ${section.name}`} onClose={() => setModal(null)} wide>
          <div className="space-y-5">
            {ids.map((id, i) => {
              const qq = questionById.get(id) as MockQuestion
              const prevSet = i > 0 ? (questionById.get(ids[i - 1]) as MockQuestion).setId : undefined
              const showSet = qq.setId && qq.setId !== prevSet
              return (
                <div key={id}>
                  {showSet && qq.setId && (
                    <div className="mb-3 rounded border border-slate-200 bg-slate-50 p-3 text-slate-800">
                      <StimulusView stimulus={paper.sets[qq.setId]} />
                    </div>
                  )}
                  <p className="whitespace-pre-line font-medium text-slate-800">
                    Q{i + 1}. {qq.stem}
                  </p>
                  <ol className="mt-1 space-y-0.5 pl-1">
                    {qq.options.map((o, oi) => (
                      <li key={oi}>
                        {OPTION_LETTERS[oi]}. {o}
                      </li>
                    ))}
                  </ol>
                </div>
              )
            })}
          </div>
        </Modal>
      )}

      {modal === 'summary' && (
        <Modal
          title="Exam Summary"
          onClose={() => setModal(null)}
          wide
          footer={
            <>
              <button type="button" className={btnLight} onClick={() => setModal(null)}>
                No, go back
              </button>
              <button type="button" className={`${btn} border-green-700 bg-green-600 text-white hover:bg-green-700`} onClick={submitConfirm}>
                {paper.sectionLocked && !lastSection ? 'Yes, submit section' : 'Yes, submit test'}
              </button>
            </>
          }
        >
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-center text-sm">
              <thead>
                <tr className="bg-slate-100">
                  {['Section', 'No. of Questions', 'Answered', 'Not Answered', 'Marked for Review', 'Answered & Marked for Review', 'Not Visited'].map((h) => (
                    <th key={h} className="border border-slate-300 px-2 py-2 font-semibold">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paper.sections.map((s, i) => {
                  const c = countStatuses(attempt, i)
                  const upcoming = i > attempt.currentSection
                  const cell = (n: number) => (upcoming ? '–' : n)
                  return (
                    <tr key={s.id} className={i === attempt.currentSection ? 'bg-blue-50 font-semibold' : ''}>
                      <td className="border border-slate-300 px-2 py-2 text-left">{s.name}</td>
                      <td className="border border-slate-300 px-2 py-2">{c.total}</td>
                      <td className="border border-slate-300 px-2 py-2">{cell(c.answered)}</td>
                      <td className="border border-slate-300 px-2 py-2">{cell(c['not-answered'])}</td>
                      <td className="border border-slate-300 px-2 py-2">{cell(c.marked)}</td>
                      <td className="border border-slate-300 px-2 py-2">{cell(c['answered-marked'])}</td>
                      <td className="border border-slate-300 px-2 py-2">{cell(c['not-visited'])}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-4 font-medium">
            {paper.sectionLocked && !lastSection
              ? `Are you sure you want to submit “${section.name}”? You will not be able to return to it, and its unused time will be lost.`
              : 'Are you sure you want to submit the test for final marking? No changes will be allowed after submission.'}
          </p>
        </Modal>
      )}

      {modal === 'section-over' && (
        <Modal
          title="Section time is over"
          footer={
            <button type="button" className={btnBlue} onClick={() => setModal(null)}>
              Continue to {section.name}
            </button>
          }
        >
          <p>The time for the previous section has ended and it was submitted automatically. You are now in <b>{section.name}</b>; its clock has started.</p>
        </Modal>
      )}
    </div>
  )
}

function Legend({ status, label, count }: { status: QStatus; label: string; count: number }) {
  return (
    <div className="flex items-center gap-2">
      <StatusBadge status={status} label={count} size={28} />
      <span className="leading-tight">{label}</span>
    </div>
  )
}
