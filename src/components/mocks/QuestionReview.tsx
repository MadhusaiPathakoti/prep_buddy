import { useState } from 'react'
import { formatHms, type QuestionResult } from '../../lib/mocks/scoring'
import { OPTION_LETTERS } from '../../lib/mocks/report'
import { topicLabel } from '../../lib/mocks/topics'
import type { Stimulus } from '../../lib/mocks/types'
import StimulusView from './StimulusView'

const VERDICT_STYLE = {
  correct: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300',
  incorrect: 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300',
  unattempted: 'bg-slate-200 text-slate-600 dark:bg-slate-600/40 dark:text-slate-300',
}

export default function QuestionReview({ r, stimulus, sectionName }: { r: QuestionResult; stimulus?: Stimulus; sectionName: string }) {
  const [showStimulus, setShowStimulus] = useState(false)
  const { q } = r
  return (
    <article className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200 dark:bg-slate-800 dark:ring-slate-700">
      <header className="mb-3 flex flex-wrap items-center gap-2 text-xs">
        <span className="font-bold text-slate-900 dark:text-slate-100">
          Q{r.number} <span className="font-normal text-slate-500 dark:text-slate-400">· {sectionName} · {topicLabel(q.topic)}</span>
        </span>
        <span className={`rounded-full px-2.5 py-0.5 font-bold capitalize ${VERDICT_STYLE[r.verdict]}`}>{r.verdict}</span>
        {r.marked && <span className="rounded-full bg-violet-100 px-2.5 py-0.5 font-bold text-violet-700 dark:bg-violet-500/20 dark:text-violet-300">Marked for review</span>}
        <span className="ml-auto text-slate-500 dark:text-slate-400">Time spent {formatHms(r.timeMs)}</span>
      </header>

      {stimulus && (
        <div className="mb-3">
          <button type="button" onClick={() => setShowStimulus((v) => !v)} className="text-xs font-semibold text-indigo-600 dark:text-indigo-400">
            {showStimulus ? 'Hide' : 'Show'} passage / data
          </button>
          {showStimulus && (
            <div className="mt-2 rounded-xl bg-slate-50 p-3 text-sm text-slate-800 dark:bg-slate-900/50 dark:text-slate-200">
              <StimulusView stimulus={stimulus} />
            </div>
          )}
        </div>
      )}

      <p className="whitespace-pre-line text-sm font-medium text-slate-900 dark:text-slate-100">{q.stem}</p>
      <ul className="mt-3 space-y-1.5">
        {q.options.map((o, i) => {
          const isAnswer = i === q.answer
          const isYours = i === r.selected
          const style = isAnswer
            ? 'border-emerald-400 bg-emerald-50 text-emerald-900 dark:border-emerald-500/60 dark:bg-emerald-500/10 dark:text-emerald-200'
            : isYours
              ? 'border-red-400 bg-red-50 text-red-900 dark:border-red-500/60 dark:bg-red-500/10 dark:text-red-200'
              : 'border-slate-200 text-slate-700 dark:border-slate-700 dark:text-slate-300'
          return (
            <li key={i} className={`flex items-start gap-2 rounded-xl border px-3 py-1.5 text-sm ${style}`}>
              <span className="font-bold">{OPTION_LETTERS[i]}.</span>
              <span className="flex-1 whitespace-pre-line">{o}</span>
              {isAnswer && <span className="text-xs font-bold">✓ Correct</span>}
              {isYours && !isAnswer && <span className="text-xs font-bold">Your answer</span>}
              {isYours && isAnswer && <span className="text-xs font-bold">· Your answer</span>}
            </li>
          )
        })}
      </ul>
      {r.selected === null && <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">You did not attempt this question.</p>}
      <div className="mt-3 rounded-xl bg-indigo-50 p-3 text-sm text-slate-700 dark:bg-indigo-500/10 dark:text-slate-300">
        <p className="mb-1 text-xs font-bold uppercase tracking-wide text-indigo-700 dark:text-indigo-300">Solution</p>
        <p className="whitespace-pre-line">{q.explanation}</p>
      </div>
    </article>
  )
}
