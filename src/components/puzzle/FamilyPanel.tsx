import { useEffect, useMemo, useRef, useState } from 'react'
import FamilyTreeDiagram from './FamilyTreeDiagram'
import { analyzeFamily, refineAnalysis, type FamilyAnalysis } from '../../lib/familyTree/analyze'
import { treeInWords } from '../../lib/familyTree/describe'
import type { World } from '../../lib/familyTree/model'
import { describeFact, parseFamily } from '../../lib/familyTree/parse'
import { describeRules } from '../../lib/familyTree/solve'

const card = 'mt-4 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200 dark:bg-slate-800 dark:ring-slate-700'
const chip = 'rounded-full bg-slate-100 px-2.5 py-1 font-semibold text-slate-700 dark:bg-slate-700 dark:text-slate-200'

function differences(ws: World[]): string[] {
  const out: string[] = []
  const n = ws[0].n
  for (let i = 0; i < n; i++) {
    const gs = new Set(ws.map((w) => w.gender[i]))
    if (gs.size > 1) out.push(`${ws[0].names[i]} could be a man or a woman`)
    const sp = new Set(ws.map((w) => w.spouse[i]))
    if (sp.size > 1) out.push(`${ws[0].names[i]}'s husband / wife is not fixed`)
    const pa = new Set(ws.map((w) => `${w.father[i]}.${w.mother[i]}`))
    if (pa.size > 1) out.push(`${ws[0].names[i]}'s parents are not fixed`)
  }
  return out
}

export default function FamilyPanel({ text, autoSolve, onBackToGame }: { text: string; autoSolve?: boolean; onBackToGame?: () => void }) {
  const parsed = useMemo(() => parseFamily(text), [text])
  const [result, setResult] = useState<FamilyAnalysis | null>(null)
  const [busy, setBusy] = useState(false)
  const [tab, setTab] = useState(0)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const run = useRef(0)
  const resultRef = useRef<HTMLDivElement>(null)
  const scrolled = useRef(false)
  useEffect(() => {
    run.current++
    clearTimeout(timer.current)
    setResult(null)
    setTab(0)
    setBusy(false)
    scrolled.current = false
    if (autoSolve && parsed.puzzle) solve() // a puzzle handed over by a game: draw the tree without waiting for a click
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text])
  // bring the tree into view the first time it appears
  useEffect(() => {
    if (autoSolve && result && !scrolled.current) {
      scrolled.current = true
      resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [autoSolve, result])
  useEffect(() => () => clearTimeout(timer.current), [])

  const { puzzle, errors, warnings, unparsed } = parsed
  const nm = (i: number) => (puzzle ? puzzle.names[i] : '')
  const solve = () => {
    if (!puzzle) return
    setBusy(true)
    const mine = ++run.current
    timer.current = setTimeout(() => {
      const first = analyzeFamily(puzzle)
      setResult(first)
      setTab(0)
      setBusy(false)
      // the slower parts, one small search per repaint
      const steps = refineAnalysis(puzzle, first)
      const next = () => {
        if (run.current !== mine) return
        const n = steps.next()
        if (n.done) return
        setResult(n.value)
        timer.current = setTimeout(next, 0)
      }
      timer.current = setTimeout(next, 0)
    }, 30)
  }

  return (
    <>
      <div className={card}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-xs font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500">What I understood</h2>
          <span className="rounded-full bg-violet-100 px-2.5 py-1 text-xs font-bold text-violet-700 dark:bg-violet-500/20 dark:text-violet-200">Family tree puzzle</span>
        </div>
        {errors.length > 0 && (
          <ul className="mt-2 space-y-1 text-sm text-rose-600 dark:text-rose-300">
            {errors.map((e) => (
              <li key={e}>⚠ {e}</li>
            ))}
          </ul>
        )}
        {puzzle && (
          <>
            <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
              <span className={chip}>
                {puzzle.names.length} people: {puzzle.names.join(', ')}
              </span>
              <span className={chip}>
                {puzzle.gens} generation{puzzle.gens === 1 ? '' : 's'}
              </span>
              {describeRules(puzzle.rules, puzzle.gens).map((r) => (
                <span key={r} className={chip}>
                  {r}
                </span>
              ))}
              <span className="rounded-full bg-emerald-100 px-2.5 py-1 font-semibold text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300">{puzzle.clues.length} clues understood</span>
            </div>
            {warnings.map((w) => (
              <p key={w} className="mt-2 text-xs text-amber-700 dark:text-amber-300">
                ⚠ {w}
              </p>
            ))}
            {unparsed.length > 0 && (
              <div className="mt-3 rounded-xl bg-amber-50 p-3 text-sm dark:bg-amber-500/10">
                <div className="font-semibold text-amber-800 dark:text-amber-300">I couldn't read {unparsed.length === 1 ? 'this sentence' : 'these sentences'}:</div>
                <ul className="mt-1 list-disc space-y-0.5 pl-5 text-slate-700 dark:text-slate-200">
                  {unparsed.map((u) => (
                    <li key={u}>{u}</li>
                  ))}
                </ul>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Try rewording it as “X is the mother of Y”, “X has only one daughter”, “X is married to Y” …, or solve without it — the answer may then not be unique.</p>
              </div>
            )}
            <details className="mt-3">
              <summary className="cursor-pointer select-none text-sm font-semibold text-indigo-600 dark:text-indigo-300">Check how each clue was read</summary>
              <ol className="mt-2 space-y-1.5 text-sm">
                {puzzle.clues.map((c) => (
                  <li key={c.id} className="flex gap-2">
                    <span className="mt-0.5 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-slate-200 px-1 text-[10px] font-bold text-slate-600 dark:bg-slate-700 dark:text-slate-300">{c.id}</span>
                    <div>
                      <div className="text-slate-600 dark:text-slate-300">{c.text}</div>
                      <div className="text-xs text-indigo-600 dark:text-indigo-300">→ {c.facts.map((f) => describeFact(f, nm)).join(' · ')}</div>
                    </div>
                  </li>
                ))}
              </ol>
            </details>
          </>
        )}
      </div>

      <button
        disabled={!puzzle || busy}
        onClick={solve}
        className="mt-5 w-full rounded-xl bg-indigo-600 px-4 py-3 font-semibold text-white shadow-sm transition hover:bg-indigo-500 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy ? 'Solving…' : puzzle && unparsed.length ? `Draw the family tree with the ${puzzle.clues.length} clues I understood` : 'Draw the family tree'}
      </button>

      {result && puzzle && (
        <div ref={resultRef} className={[card, 'scroll-mt-20'].join(' ')}>
          {result.status === 'none' ? (
            <>
              <h2 className="text-lg font-extrabold text-slate-900 dark:text-slate-100">The clues contradict each other</h2>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">No family of {puzzle.names.length} people in {puzzle.gens} generation{puzzle.gens === 1 ? '' : 's'} satisfies every clue as I read it. That usually means a clue was misread or mistyped.</p>
              {result.culpritFacts.length > 0 ? (
                <div className="mt-2 text-sm text-amber-700 dark:text-amber-300">
                  Leaving out any one of these statements makes it solvable — check how {result.culpritFacts.length > 1 ? 'they were' : 'it was'} read:
                  <ul className="mt-1 list-disc pl-5">
                    {result.culpritFacts.map((c) => (
                      <li key={c.fact}>
                        {c.fact} <span className="text-xs text-slate-400">(clue {c.clue})</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : result.culprits.length > 0 ? (
                <p className="mt-2 text-sm text-amber-700 dark:text-amber-300">
                  Leaving out any one of clue{result.culprits.length > 1 ? 's' : ''} {result.culprits.join(', ')} makes it solvable — check how {result.culprits.length > 1 ? 'they were' : 'it was'} read.
                </p>
              ) : null}
              {result.pending && result.searchedAll && <p className="mt-2 animate-pulse text-xs font-semibold text-indigo-600 dark:text-indigo-300">Looking for the clues that clash…</p>}
              {!result.searchedAll && <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">The search ran out of time before covering every family, so this may not be a real contradiction.</p>}
            </>
          ) : (
            <>
              <h2 className="text-lg font-extrabold text-slate-900 dark:text-slate-100">{result.status === 'unique' ? 'The family tree' : `${result.worlds.length}${result.partial ? '+' : ''} family trees fit the clues`}</h2>
              {result.relaxed && <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">No tree fits the usual meanings of brother-in-law / sister-in-law (a spouse's brother or sister, or a brother's or sister's spouse), so this one also allows the husband or wife of a spouse's brother or sister.</p>}
              {result.status === 'several' && (
                <>
                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">The clues, as I read them, do not decide between these trees. Either a clue is missing or one was read differently from how it was meant.</p>
                  <ul className="mt-1 list-disc pl-5 text-sm text-slate-600 dark:text-slate-300">
                    {differences(result.worlds).slice(0, 8).map((d) => (
                      <li key={d}>{d}</li>
                    ))}
                  </ul>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {result.worlds.map((_, k) => (
                      <button key={k} onClick={() => setTab(k)} className={['rounded-full px-3 py-1 text-xs font-bold', tab === k ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-200'].join(' ')}>
                        Tree {k + 1}
                      </button>
                    ))}
                  </div>
                </>
              )}
              <div className="mt-3 overflow-x-auto rounded-2xl bg-slate-50 p-3 dark:bg-slate-900/50">
                <FamilyTreeDiagram world={result.worlds[Math.min(tab, result.worlds.length - 1)]} />
                <div className="mt-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                  <span>
                    <span className="mr-1 inline-block h-3 w-3 rounded-sm bg-blue-400 align-middle ring-1 ring-slate-800" />
                    [+] man
                  </span>
                  <span>
                    <span className="mr-1 inline-block h-3 w-3 rounded-full bg-pink-400 align-middle ring-1 ring-slate-800" />
                    [–] woman
                  </span>
                  <span>═ married</span>
                  <span>┌─┐ brothers and sisters</span>
                  <span>│ parent → child</span>
                </div>
              </div>
              <ul className="mt-3 space-y-0.5 text-sm text-slate-700 dark:text-slate-200">
                {treeInWords(result.worlds[Math.min(tab, result.worlds.length - 1)]).map((l) => (
                  <li key={l}>• {l}</li>
                ))}
              </ul>

              <h3 className="mt-5 text-xs font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500">Clue by clue</h3>
              <ol className="mt-2 space-y-3 text-sm">
                {result.clues.map((c) => (
                  <li key={c.id} className="flex gap-2">
                    <span className="mt-0.5 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-emerald-500 px-1 text-[10px] font-bold text-white">{c.id}</span>
                    <div className="min-w-0">
                      <div className="text-slate-700 dark:text-slate-200">{c.text}</div>
                      {c.facts.map((f) => (
                        <div key={f.fact} className="text-xs text-slate-500 dark:text-slate-400">
                          <span className="font-semibold text-indigo-600 dark:text-indigo-300">{f.fact}</span>
                          {f.because ? ` — ${f.because}` : ''}
                        </div>
                      ))}
                      <div className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">
                        {c.without < 0 ? (result.pending ? 'Working out how much this clue matters…' : '') : c.without === 0 ? 'Without this clue no family fits the others.' : c.without === 1 && !c.more ? 'Without this clue the others still give exactly one tree.' : `Without this clue ${c.more ? `${c.without}+` : c.without} trees would fit${result.status === 'unique' ? ' — it helps to pin the tree down' : ''}.`}
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
              {onBackToGame && (
                <button onClick={onBackToGame} className="mt-5 w-full rounded-xl bg-indigo-600 px-4 py-3 font-semibold text-white shadow-sm transition hover:bg-indigo-500 active:scale-[0.99]">
                  ← Back to the question
                </button>
              )}
              <p className="mt-4 text-xs text-slate-400 dark:text-slate-500">
                Rules used: the people are the whole family (a relative who is not named does not exist, except the parents of the oldest people, who are outside the puzzle); a married couple is a man and a woman of the same generation who are not blood relatives; brothers and sisters have the same parents.
              </p>
            </>
          )}
        </div>
      )}
    </>
  )
}
