import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  RULES,
  STATUS_LABEL,
  STATUS_STYLE,
  buildRuleCheck,
  getRule,
  getStatus,
  loadProgress,
  markLearned,
  recordAnswer,
  type GrammarRule,
} from '../../lib/grammarRules'

type Phase = 'read' | 'check' | 'done'

export default function RuleCard() {
  const { id } = useParams()
  const rule = getRule(Number(id))
  if (!rule) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10">
        <Link to="/english/grammar-rules/lab" className="text-sm text-slate-400 hover:text-slate-600">
          ← Rule Lab
        </Link>
        <p className="mt-6 text-slate-600 dark:text-slate-300">That rule doesn't exist.</p>
      </div>
    )
  }
  // Keyed by rule so navigating prev/next resets the read → check flow.
  return <RuleView key={rule.id} rule={rule} />
}

function RuleView({ rule }: { rule: GrammarRule }) {
  const [phase, setPhase] = useState<Phase>('read')
  const [questions, setQuestions] = useState(() => buildRuleCheck(rule))
  const [index, setIndex] = useState(0)
  const [answered, setAnswered] = useState<boolean | null>(null)
  const [score, setScore] = useState(0)

  const status = getStatus(loadProgress()[rule.id])
  const idx = RULES.findIndex((r) => r.id === rule.id)
  const prev = RULES[idx - 1]
  const next = RULES[idx + 1]
  const passMark = Math.ceil((questions.length * 2) / 3)
  const passed = score >= passMark

  const examples = rule.correct

  function startCheck() {
    setQuestions(buildRuleCheck(rule))
    setIndex(0)
    setScore(0)
    setAnswered(null)
    setPhase('check')
  }

  function answer(saidCorrect: boolean) {
    if (answered !== null) return
    const q = questions[index]
    const right = saidCorrect === q.isCorrect
    recordAnswer(rule.id, right)
    setAnswered(right)
    if (right) setScore((s) => s + 1)
  }

  function advance() {
    if (index + 1 >= questions.length) {
      // `score` already includes the last answer by the time Next is clicked.
      if (score >= passMark) markLearned(rule.id)
      setPhase('done')
    } else {
      setIndex((i) => i + 1)
      setAnswered(null)
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <Link to="/english/grammar-rules/lab" className="text-sm text-slate-400 dark:text-slate-500 hover:text-slate-600">
        ← Rule Lab
      </Link>

      <div className="mt-3 rounded-3xl bg-white dark:bg-slate-800 p-6 shadow-sm ring-1 ring-slate-200 dark:ring-slate-700">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-indigo-500">
            Rule {rule.id} · {rule.category}
          </span>
          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ${STATUS_STYLE[status]}`}>{STATUS_LABEL[status]}</span>
        </div>
        <h1 className="mt-2 text-2xl font-extrabold text-slate-900 dark:text-slate-100">{rule.title}</h1>

        {phase === 'read' && (
          <>
            <p className="mt-4 rounded-2xl bg-indigo-50 dark:bg-indigo-500/10 px-4 py-3 text-sm font-semibold leading-relaxed text-indigo-900 dark:text-indigo-200">
              Remember: {rule.summary}
            </p>
            <p className="mt-4 text-sm leading-relaxed text-slate-700 dark:text-slate-300">{rule.explanation}</p>

            {rule.pairs.length > 0 && (
              <div className="mt-5">
                <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Incorrect → Correct</h2>
                <ul className="mt-2 space-y-2">
                  {rule.pairs.map((p, i) => (
                    <li key={i} className="rounded-xl bg-slate-50 dark:bg-slate-900/40 px-4 py-3 text-sm leading-relaxed">
                      <p className="text-rose-600 dark:text-rose-400">
                        <span className="mr-1.5 font-bold">✗</span>
                        <span className="line-through decoration-rose-300">{p.wrong}</span>
                      </p>
                      <p className="mt-1 text-emerald-700 dark:text-emerald-400">
                        <span className="mr-1.5 font-bold">✓</span>
                        {p.right}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {examples.length > 0 && (
              <div className="mt-5">
                <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200">More correct examples</h2>
                <ul className="mt-2 space-y-1.5">
                  {examples.map((e, i) => (
                    <li key={i} className="text-sm leading-relaxed text-slate-700 dark:text-slate-300">
                      <span className="mr-1.5 font-bold text-emerald-600 dark:text-emerald-400">✓</span>
                      {e}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {rule.uncertain && (
              <p className="mt-4 text-xs italic text-amber-600 dark:text-amber-400">Parts of this rule were hard to read in the scanned book — double-check against the PDF.</p>
            )}

            <button
              onClick={startCheck}
              className="mt-6 w-full rounded-xl bg-indigo-600 px-4 py-3 font-semibold text-white shadow-sm transition hover:bg-indigo-500 active:scale-[0.99]"
            >
              Check yourself · {questions.length} quick questions
            </button>
          </>
        )}

        {phase === 'check' && (
          <div className="mt-4">
            <div className="mb-3 flex items-center justify-between text-sm text-slate-500 dark:text-slate-400">
              <span>
                Question <span className="font-semibold text-slate-700 dark:text-slate-300">{index + 1}</span> / {questions.length}
              </span>
              <button onClick={() => setPhase('read')} className="underline-offset-2 hover:underline">
                Re-read the rule
              </button>
            </div>
            <p className="text-xs text-slate-400 dark:text-slate-500">Is this sentence grammatically correct?</p>
            <p className="mt-2 rounded-2xl bg-slate-50 dark:bg-slate-900/40 px-4 py-4 text-base leading-relaxed text-slate-900 dark:text-slate-100">
              {questions[index].sentence}
            </p>

            <div className="mt-4 grid grid-cols-2 gap-3">
              {[
                { label: '✓ Correct', value: true },
                { label: '✗ Incorrect', value: false },
              ].map((o) => {
                const isRightChoice = o.value === questions[index].isCorrect
                const show = answered !== null
                return (
                  <button
                    key={o.label}
                    onClick={() => answer(o.value)}
                    disabled={show}
                    className={[
                      'rounded-xl border-2 px-4 py-3 text-sm font-semibold transition-colors',
                      show && isRightChoice ? 'animate-pop border-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-800 dark:text-emerald-300' : '',
                      show && !isRightChoice ? 'border-slate-200 dark:border-slate-700 opacity-50 text-slate-500' : '',
                      !show ? 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:border-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-500/10' : '',
                    ].join(' ')}
                  >
                    {o.label}
                  </button>
                )
              })}
            </div>

            {answered !== null && (
              <div className={['mt-4 rounded-2xl px-4 py-3 text-sm leading-relaxed', answered ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-900 dark:text-emerald-200' : 'bg-rose-50 dark:bg-rose-500/10 text-rose-900 dark:text-rose-200'].join(' ')}>
                <p className="font-semibold">{answered ? 'Right!' : 'Not quite.'}</p>
                <p className="mt-1">
                  {questions[index].isCorrect
                    ? 'This sentence follows the rule.'
                    : `This sentence breaks the rule. Correct form: ${questions[index].fix ?? ''}`}
                </p>
                <p className="mt-1 text-xs opacity-80">{rule.summary}</p>
                <button
                  onClick={advance}
                  className="mt-3 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500"
                >
                  {index + 1 >= questions.length ? 'See result' : 'Next'}
                </button>
              </div>
            )}
          </div>
        )}

        {phase === 'done' && (
          <div className="mt-6 text-center">
            <div className="text-5xl">{passed ? '🎉' : '📚'}</div>
            <h2 className="mt-3 text-xl font-bold text-slate-900 dark:text-slate-100">
              {score} / {questions.length} {passed ? '· Rule learned!' : '· Almost there'}
            </h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              {passed
                ? "It's now in your review cycle — it'll come back in Spot the Rule when it's due."
                : `Get ${passMark} of ${questions.length} to mark it learned. Re-read the rule and try again.`}
            </p>
            <div className="mt-6 flex flex-col gap-3">
              {!passed && (
                <button
                  onClick={() => setPhase('read')}
                  className="w-full rounded-xl bg-indigo-600 px-4 py-3 font-semibold text-white transition hover:bg-indigo-500"
                >
                  Re-read the rule
                </button>
              )}
              {passed && next && (
                <Link
                  to={`/english/grammar-rules/lab/${next.id}`}
                  className="block w-full rounded-xl bg-indigo-600 px-4 py-3 font-semibold text-white transition hover:bg-indigo-500"
                >
                  Next rule: {next.title} →
                </Link>
              )}
              <button
                onClick={startCheck}
                className="w-full rounded-xl bg-slate-100 dark:bg-slate-700 px-4 py-3 font-semibold text-slate-700 dark:text-slate-300 transition hover:bg-slate-200"
              >
                Try the check again
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="mt-5 flex justify-between text-sm font-semibold text-indigo-600 dark:text-indigo-400">
        {prev ? (
          <Link to={`/english/grammar-rules/lab/${prev.id}`} className="hover:underline">
            ← Rule {prev.id}
          </Link>
        ) : (
          <span />
        )}
        {next ? (
          <Link to={`/english/grammar-rules/lab/${next.id}`} className="hover:underline">
            Rule {next.id} →
          </Link>
        ) : (
          <span />
        )}
      </div>
    </div>
  )
}
