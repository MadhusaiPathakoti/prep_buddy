import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { OPTION_LETTERS, OPTION_TEXT } from '../../lib/syllogismSolver/engine'
import type { Circle } from '../../lib/syllogismSolver/layout'
import type { ConclusionInfo, Highlight, PicRef, Solution } from '../../lib/syllogismSolver/solve'
import VennStage from './VennStage'

type View = { kind: 'build'; step: number } | { kind: 'pic'; ref: PicRef }

const sameRef = (a: PicRef | undefined, b: PicRef | undefined) => !!a && !!b && a.conc === b.conc && a.idx === b.idx
const TONE_TEXT = { good: 'text-emerald-700 dark:text-emerald-300', bad: 'text-rose-700 dark:text-rose-300', info: 'text-indigo-700 dark:text-indigo-300' } as const
const TONE_ICON = { good: '✓', bad: '✗', info: 'ℹ' } as const

function verdictBadge(c: ConclusionInfo) {
  const poss = c.sentence.possibility
  const good = c.follows
  const text = poss ? (good ? 'Possible' : 'Not possible') : good ? 'Follows' : 'Does not follow'
  return (
    <span className={['rounded-full px-2 py-0.5 text-[11px] font-bold', good ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300' : 'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300'].join(' ')}>
      {good ? '✓' : '✗'} {text}
    </span>
  )
}

const stepBtn = 'rounded-lg bg-slate-100 px-3 py-1.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600'

export default function SolverView({ solution, onEdit }: { solution: Solution; onEdit: () => void }) {
  const { q, conclusions, steps, buildWorld } = solution
  const last = steps.length - 1
  const [view, setView] = useState<View>({ kind: 'build', step: 0 })
  const [playing, setPlaying] = useState(true)
  const [checked, setChecked] = useState<number[]>([])
  const [picked, setPicked] = useState<number | null>(null)
  const [tried, setTried] = useState<number[]>([])
  const stageRef = useRef<HTMLDivElement>(null)
  const feedbackRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [])

  // auto-play the build-up when the screen opens
  const isPlaying = playing && view.kind === 'build' && view.step < last
  useEffect(() => {
    if (!isPlaying || view.kind !== 'build') return
    const id = setTimeout(() => setView({ kind: 'build', step: view.step + 1 }), view.step === 0 ? 1600 : 3600)
    return () => clearTimeout(id)
  }, [isPlaying, view])

  const goStep = (n: number) => {
    setPlaying(false)
    setView({ kind: 'build', step: Math.max(0, Math.min(last, n)) })
  }
  // start over: clear the answer, the verdict badges and the explanation, and replay the build-up from the first step
  const restart = (autoplay: boolean) => {
    setPicked(null)
    setTried([])
    setChecked([])
    setView({ kind: 'build', step: 0 })
    setPlaying(autoplay)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  const togglePlay = () => {
    if (isPlaying) return setPlaying(false)
    if (view.kind === 'build' && view.step >= last) return restart(true)
    setView({ kind: 'build', step: view.kind === 'build' ? view.step : 0 })
    setPlaying(true)
  }
  const showPicture = (ref: PicRef | undefined, scrollToStage = true) => {
    if (!ref) return
    setPlaying(false)
    setView({ kind: 'pic', ref })
    if (ref.conc >= 0) setChecked((c) => (c.includes(ref.conc) ? c : [...c, ref.conc]))
    // on a phone the stage sits above the question: bring it into view
    if (scrollToStage && window.innerWidth < 1024) stageRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }
  const checkConclusion = (i: number) => {
    if (conclusions[i].pictures.length) showPicture({ conc: i, idx: 0 })
    else setChecked((c) => (c.includes(i) ? c : [...c, i]))
  }
  const choose = (o: number) => {
    setPicked(o)
    if (!solution.isRight(o)) setTried((t) => (t.includes(o) ? t : [...t, o]))
    const f = solution.feedback(o)
    for (const p of f.points) if (p.ref && p.ref.conc >= 0) setChecked((c) => (c.includes(p.ref!.conc) ? c : [...c, p.ref!.conc]))
    showPicture(f.points.find((p) => p.ref)?.ref, false)
    // the explanation appears under the options: make sure it is on screen
    setTimeout(() => feedbackRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 80)
  }

  // ---- what the stage shows ----
  let title: string
  let caption: string
  let circles: Circle[] = []
  let highlights: Highlight[] = []
  let banner: { text: string; ok: boolean } | null = null
  let tabs: { ref: PicRef; label: string }[] = []
  let sceneKey: string
  let viewing: ConclusionInfo | null = null
  if (view.kind === 'build') {
    const st = steps[view.step]
    title = view.step === 0 ? 'Building the picture' : view.step === last ? 'The finished picture' : `Statement ${view.step} of ${last - 1}`
    caption = st.caption
    circles = buildWorld ? buildWorld.circles.filter((c) => st.visible.includes(c.t)) : []
    highlights = st.highlight ? [st.highlight] : []
    sceneKey = `b${view.step}`
  } else {
    const pic = solution.picture(view.ref)
    const c = view.ref.conc >= 0 ? conclusions[view.ref.conc] : null
    viewing = c
    title = pic?.title ?? ''
    caption = pic?.caption ?? ''
    circles = pic?.world.circles ?? []
    highlights = pic?.highlights ?? []
    sceneKey = `p${view.ref.conc}-${view.ref.idx}`
    if (pic) {
      banner = c ? { text: `${c.label} is ${pic.truth ? 'TRUE' : 'FALSE'} in this picture`, ok: pic.truth } : { text: 'Both conclusions are FALSE in this picture', ok: false }
    }
    tabs = c ? c.pictures.map((p, idx) => ({ ref: { conc: c.index, idx }, label: p.title })) : [{ ref: view.ref, label: pic?.title ?? '' }]
  }
  const feedback = picked !== null ? solution.feedback(picked) : null

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <Link to="/reasoning" className="text-sm text-slate-400 hover:text-slate-600 dark:text-slate-500">
            ← Reasoning
          </Link>
          <h1 className="mt-1 text-2xl font-extrabold text-slate-900 dark:text-slate-100">Syllogism Solver</h1>
        </div>
        <button onClick={onEdit} className="rounded-xl bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm ring-1 ring-slate-200 hover:bg-slate-50 dark:bg-slate-800 dark:text-slate-200 dark:ring-slate-700">
          ✎ New / edit question
        </button>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
        {/* ── the question ── */}
        <section className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200 dark:bg-slate-800 dark:ring-slate-700 lg:col-start-1 lg:row-start-1">
          <h2 className="text-xs font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500">Statements</h2>
          <ol className="mt-2 space-y-1.5">
            {q.statements.map((s, i) => {
              const active = view.kind === 'build' && view.step === i + 1
              return (
                <li key={i}>
                  <button
                    onClick={() => goStep(i + 1)}
                    title="Show how this statement is drawn"
                    className={['flex w-full items-start gap-2 rounded-xl px-2.5 py-1.5 text-left text-[15px] transition', active ? 'bg-indigo-50 text-indigo-900 ring-1 ring-indigo-200 dark:bg-indigo-500/15 dark:text-indigo-100 dark:ring-indigo-500/40' : 'text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-700/50'].join(' ')}
                  >
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-200 text-[11px] font-bold text-slate-600 dark:bg-slate-700 dark:text-slate-300">{i + 1}</span>
                    <span>{s.text}.</span>
                  </button>
                </li>
              )
            })}
          </ol>

          {solution.mode === 'which' && (
            <p className="mt-4 rounded-xl bg-indigo-50 px-3 py-2.5 text-[15px] font-semibold text-indigo-900 dark:bg-indigo-500/15 dark:text-indigo-100">
              Which of the following conclusions {q.negate ? <span className="underline decoration-rose-400">does NOT</span> : 'definitely'} follow{q.negate ? '' : 's'} from the statements?
            </p>
          )}
          {solution.mode !== 'which' && <h2 className="mt-5 text-xs font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500">Conclusions</h2>}
          <ul className={solution.mode === 'which' ? 'hidden' : 'mt-2 space-y-2'}>
            {conclusions.map((c, i) => {
              const showing = view.kind === 'pic' && view.ref.conc === i
              return (
                <li key={i} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl bg-slate-50 px-3 py-2.5 dark:bg-slate-900/40">
                  <span className="flex h-6 min-w-[1.5rem] items-center justify-center rounded-full bg-indigo-100 px-1.5 text-xs font-bold text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300">{c.label}</span>
                  <div className="min-w-0 flex-1 text-[15px] text-slate-800 dark:text-slate-100">
                    {c.text}.{checked.includes(i) && <span className="ml-2 align-middle">{verdictBadge(c)}</span>}
                  </div>
                  <button
                    onClick={() => checkConclusion(i)}
                    className={['shrink-0 rounded-lg px-3 py-1.5 text-sm font-semibold transition active:scale-95', showing ? 'bg-indigo-600 text-white' : 'bg-white text-indigo-700 ring-1 ring-indigo-200 hover:bg-indigo-50 dark:bg-slate-800 dark:text-indigo-300 dark:ring-indigo-500/40 dark:hover:bg-indigo-500/10'].join(' ')}
                  >
                    🔍 {showing ? 'Showing' : 'Check'}
                  </button>
                </li>
              )
            })}
          </ul>
          <p className="mt-3 text-[11px] leading-snug text-slate-400 dark:text-slate-500">As in the exam: every group named has at least one member, and “Only a few” means some are and some are not. A conclusion <em>follows</em> only if it is true in every possible picture.</p>
          {solution.note && <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">⚠ {solution.note}</p>}
        </section>

        {/* ── the stage ── */}
        <section ref={stageRef} className="scroll-mt-4 rounded-3xl bg-white p-4 shadow-sm ring-1 ring-slate-200 dark:bg-slate-800 dark:ring-slate-700 lg:sticky lg:top-4 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:self-start">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-bold text-slate-700 dark:text-slate-200">{title}</h2>
            {banner && (
              <span key={sceneKey} className={['animate-beat-in rounded-full px-3 py-1 text-xs font-extrabold', banner.ok ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300' : 'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300'].join(' ')}>
                {banner.ok ? '✓' : '✗'} {banner.text}
              </span>
            )}
          </div>

          <VennStage q={q} circles={circles} highlights={highlights} sceneKey={sceneKey} emptyHint={buildWorld || view.kind === 'pic' ? 'Press ▶ Next to draw the first statement' : 'No diagram could be laid out for this question'} />

          <p key={sceneKey} className="animate-beat-in mt-3 min-h-[3.5rem] text-[15px] leading-relaxed text-slate-700 dark:text-slate-200">
            {caption || (view.kind === 'pic' ? 'No picture could be drawn for this one — the written reasoning below still applies.' : '')}
          </p>

          {view.kind === 'build' ? (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button onClick={() => restart(false)} className={stepBtn} title="Start over" aria-label="Start over">
                ⏮
              </button>
              <button onClick={() => goStep((view.kind === 'build' ? view.step : 0) - 1)} disabled={view.step === 0} className={stepBtn} aria-label="Previous step">
                ◀
              </button>
              <button onClick={togglePlay} className="rounded-lg bg-indigo-600 px-4 py-1.5 text-sm font-semibold text-white transition hover:bg-indigo-500 active:scale-95">
                {isPlaying ? '⏸ Pause' : view.step >= last ? '↻ Replay' : '▶ Play'}
              </button>
              <button onClick={() => goStep(view.step + 1)} disabled={view.step >= last} className={stepBtn} aria-label="Next step">
                ▶
              </button>
              <div className="ml-auto flex items-center gap-1.5" aria-label={`Step ${view.step} of ${last}`}>
                {steps.map((_, i) => (
                  <button key={i} onClick={() => goStep(i)} aria-label={`Go to step ${i}`} className={['h-2.5 rounded-full transition-all', i === view.step ? 'w-6 bg-indigo-600' : i < view.step ? 'w-2.5 bg-indigo-300 dark:bg-indigo-500/60' : 'w-2.5 bg-slate-200 dark:bg-slate-600'].join(' ')} />
                ))}
              </div>
            </div>
          ) : (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {tabs.length > 1 &&
                tabs.map((t, i) => (
                  <button key={i} onClick={() => showPicture(t.ref)} className={['rounded-lg px-3 py-1.5 text-sm font-semibold transition', sameRef(t.ref, view.ref) ? 'bg-indigo-600 text-white' : stepBtn].join(' ')}>
                    {t.label}
                  </button>
                ))}
              <button onClick={() => goStep(last)} className={[stepBtn, 'ml-auto'].join(' ')}>
                ← Back to the build-up
              </button>
            </div>
          )}

          {viewing && (
            <div className="mt-3 rounded-xl bg-slate-50 p-3 text-sm dark:bg-slate-900/50">
              <div className={['font-bold', viewing.follows ? 'text-emerald-700 dark:text-emerald-300' : 'text-rose-700 dark:text-rose-300'].join(' ')}>{viewing.headline}</div>
              {viewing.reasons.map((r, i) => (
                <p key={i} className="mt-1 text-slate-600 dark:text-slate-300">
                  {r}
                </p>
              ))}
            </div>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-500 dark:text-slate-400">
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-full bg-slate-800 dark:bg-slate-100" /> someone is in this region
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-sm bg-emerald-500/70" /> makes it true
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-sm bg-rose-500/70" /> makes it false
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-sm bg-indigo-500/70" /> the statement being drawn
            </span>
          </div>
        </section>

        {/* ── the answer ── */}
        <section className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200 dark:bg-slate-800 dark:ring-slate-700 lg:col-start-1 lg:row-start-2">
          {solution.hasOptions || solution.mode === 'which' ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-xs font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500">Your answer</h2>
                <button onClick={() => solution.correct !== null && choose(solution.correct)} className="text-xs font-semibold text-indigo-600 hover:underline dark:text-indigo-300">
                  Show the answer
                </button>
              </div>
              <div className="mt-2 space-y-2">
                {(solution.mode === 'which' ? conclusions.map((c) => `${c.text}.`) : [...OPTION_TEXT]).map((t, i) => {
                  const isPicked = picked === i
                  const right = isPicked && solution.isRight(i)
                  const wrong = isPicked && !solution.isRight(i)
                  const showing = solution.mode === 'which' && view.kind === 'pic' && view.ref.conc === i
                  const earlier = !isPicked && tried.includes(i)
                  return (
                    <div key={`${i}-${isPicked ? tried.length : 0}`} className="flex items-stretch gap-2">
                    <button
                      onClick={() => choose(i)}
                      className={[
                        'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[15px] ring-1 transition active:scale-[0.99]',
                        right ? 'bg-emerald-50 text-emerald-900 ring-emerald-300 dark:bg-emerald-500/15 dark:text-emerald-100 dark:ring-emerald-500/50' : '',
                        wrong ? 'animate-shake bg-rose-50 text-rose-900 ring-rose-300 dark:bg-rose-500/15 dark:text-rose-100 dark:ring-rose-500/50' : '',
                        earlier ? 'bg-slate-50 text-slate-400 line-through ring-slate-200 dark:bg-slate-900/30 dark:text-slate-500 dark:ring-slate-700' : '',
                        !isPicked && !earlier ? 'bg-white text-slate-700 ring-slate-200 hover:bg-slate-50 dark:bg-slate-800 dark:text-slate-200 dark:ring-slate-600 dark:hover:bg-slate-700/60' : '',
                      ].join(' ')}
                    >
                      <span className={['flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold', right ? 'bg-emerald-500 text-white' : wrong ? 'bg-rose-500 text-white' : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300'].join(' ')}>{right ? '✓' : wrong ? '✗' : OPTION_LETTERS[i]}</span>
                      <span className="min-w-0 flex-1">
                        {t}
                        {solution.mode === 'which' && checked.includes(i) && <span className="ml-2 align-middle">{verdictBadge(conclusions[i])}</span>}
                      </span>
                    </button>
                    {solution.mode === 'which' && (
                      <button
                        onClick={() => checkConclusion(i)}
                        className={['shrink-0 rounded-xl px-3 text-sm font-semibold transition active:scale-95', showing ? 'bg-indigo-600 text-white' : 'bg-white text-indigo-700 ring-1 ring-indigo-200 hover:bg-indigo-50 dark:bg-slate-800 dark:text-indigo-300 dark:ring-indigo-500/40 dark:hover:bg-indigo-500/10'].join(' ')}
                      >
                        🔍 {showing ? 'Showing' : 'Check'}
                      </button>
                    )}
                    </div>
                  )
                })}
              </div>

              {feedback && (
                <div ref={feedbackRef} key={`${picked}-${tried.length}`} className={['animate-beat-in mt-4 scroll-mb-4 rounded-2xl p-4', feedback.correct ? 'bg-emerald-50 ring-1 ring-emerald-200 dark:bg-emerald-500/10 dark:ring-emerald-500/30' : 'bg-rose-50 ring-1 ring-rose-200 dark:bg-rose-500/10 dark:ring-rose-500/30'].join(' ')}>
                  <div className={['font-bold', feedback.correct ? 'text-emerald-800 dark:text-emerald-200' : 'text-rose-800 dark:text-rose-200'].join(' ')}>{feedback.correct ? '✓' : '✗'} {feedback.headline}</div>
                  <ul className="mt-2 space-y-2.5">
                    {feedback.points.map((p, i) => {
                      const showingThis = view.kind === 'pic' && sameRef(view.ref, p.ref)
                      return (
                        <li key={i} className="flex gap-2 text-sm">
                          <span className={['mt-0.5 font-extrabold', TONE_TEXT[p.tone]].join(' ')}>{TONE_ICON[p.tone]}</span>
                          <div className="min-w-0 flex-1 text-slate-700 dark:text-slate-200">
                            {p.text}
                            {p.ref && (
                              <button onClick={() => showPicture(p.ref)} disabled={showingThis} className={['ml-2 rounded-md px-2 py-0.5 text-xs font-semibold', showingThis ? 'bg-indigo-600 text-white' : 'bg-white text-indigo-700 ring-1 ring-indigo-200 hover:bg-indigo-50 dark:bg-slate-800 dark:text-indigo-300 dark:ring-indigo-500/40'].join(' ')}>
                                {showingThis ? 'Showing ▸' : '▶ Show picture'}
                              </button>
                            )}
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                  {!feedback.correct && <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">Try another option — or use “Check” beside {solution.mode === 'which' ? 'an option' : 'a conclusion'} to explore its pictures yourself.</p>}
                  {feedback.correct && (
                    <button onClick={onEdit} className="mt-3 rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-indigo-500">
                      Try another question →
                    </button>
                  )}
                </div>
              )}
            </>
          ) : (
            <>
              <h2 className="text-xs font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500">Verdicts</h2>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                The five answer options are for questions with exactly two conclusions. Use <strong>Check</strong> beside each conclusion to see the pictures that prove or break it.
              </p>
              <ul className="mt-3 space-y-1.5 text-sm">
                {conclusions.map((c) => (
                  <li key={c.index} className="flex items-center gap-2 text-slate-700 dark:text-slate-200">
                    <span className="font-bold">{c.label}.</span> {checked.includes(c.index) ? verdictBadge(c) : <span className="text-slate-400">not checked yet</span>}
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      </div>
    </div>
  )
}
