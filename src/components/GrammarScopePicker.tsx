import {
  GRAMMAR_CATEGORIES,
  RULES,
  getStatus,
  isDue,
  isStarted,
  loadProgress,
  type SpotScope,
} from '../lib/grammarRules'
import { pillClass } from '../lib/grammarUi'

interface GrammarScopePickerProps {
  scope: SpotScope
  onChange: (scope: SpotScope) => void
  /** Only offer rules the learner has started: counts and topics are limited to those. */
  startedOnly?: boolean
}

/** Shared "what to practise" selector: all / due / weak spots, or a single topic. */
export default function GrammarScopePicker({ scope, onChange, startedOnly = false }: GrammarScopePickerProps) {
  const progress = loadProgress()
  const pool = startedOnly ? RULES.filter((r) => isStarted(progress[r.id])) : RULES
  const dueCount = pool.filter((r) => isDue(progress[r.id])).length
  const weakCount = pool.filter((r) => getStatus(progress[r.id]) === 'struggling').length

  const scopes: { id: SpotScope; label: string }[] = [
    { id: 'all', label: startedOnly ? `All my started rules (${pool.length})` : `All rules (${RULES.length})` },
    { id: 'due', label: `Due for review (${dueCount})` },
    { id: 'weak', label: `Needs work (${weakCount})` },
  ]
  const categories = GRAMMAR_CATEGORIES.map((c) => ({ id: c, count: pool.filter((r) => r.category === c).length })).filter((c) => !startedOnly || c.count > 0)

  return (
    <>
      <h2 className="font-semibold text-slate-800 dark:text-slate-200">Practice</h2>
      <div className="mt-3 flex flex-wrap gap-2">
        {scopes.map((s) => (
          <button key={s.id} onClick={() => onChange(s.id)} className={pillClass(scope === s.id)}>
            {s.label}
          </button>
        ))}
      </div>

      <h2 className="mt-6 font-semibold text-slate-800 dark:text-slate-200">Or one topic</h2>
      <div className="mt-3 flex flex-wrap gap-2">
        {categories.map((c) => (
          <button key={c.id} onClick={() => onChange(c.id)} className={pillClass(scope === c.id)}>
            {c.id}
            {startedOnly && <span className="ml-1.5 font-normal opacity-70">({c.count})</span>}
          </button>
        ))}
      </div>
    </>
  )
}
