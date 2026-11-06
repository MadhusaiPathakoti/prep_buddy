import type { SpotScope } from './grammarRules'

export const pillClass = (active: boolean) =>
  [
    'rounded-lg px-4 py-2 text-sm font-semibold transition',
    active ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200',
  ].join(' ')

/** Why a scope produced nothing, phrased for the setup screen. */
export function emptyScopeMessage(scope: SpotScope): string {
  if (scope === 'due') return 'Nothing is due for review yet — learn a few rules in Rule Lab first, or pick "All rules".'
  if (scope === 'weak') return 'No rules are marked "Needs work" right now. Nice!'
  return 'No questions available for that selection.'
}
