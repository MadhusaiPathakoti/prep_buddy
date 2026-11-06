import {
  GRAMMAR_CATEGORIES,
  RULES,
  getStatus,
  isDue,
  loadProgress,
  type SpotScope,
} from '../lib/grammarRules'
import { pillClass } from '../lib/grammarUi'

interface GrammarScopePickerProps {
  scope: SpotScope
  onChange: (scope: SpotScope) => void
}

/** Shared "what to practise" selector: all / due / weak spots, or a single topic. */
export default function GrammarScopePicker({ scope, onChange }: GrammarScopePickerProps) {
  const progress = loadProgress()
  const dueCount = RULES.filter((r) => isDue(progress[r.id])).length
  const weakCount = RULES.filter((r) => getStatus(progress[r.id]) === 'struggling').length

  const scopes: { id: SpotScope; label: string }[] = [
    { id: 'all', label: `All rules (${RULES.length})` },
    { id: 'due', label: `Due for review (${dueCount})` },
    { id: 'weak', label: `Needs work (${weakCount})` },
  ]

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
        {GRAMMAR_CATEGORIES.map((c) => (
          <button key={c} onClick={() => onChange(c)} className={pillClass(scope === c)}>
            {c}
          </button>
        ))}
      </div>
    </>
  )
}
