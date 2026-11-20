import { useEffect, useRef, useState } from 'react'

interface Rule {
  title: string
  text: string
  /** a tiny worked example shown under the rule */
  example?: string
}

interface Group {
  heading: string
  rules: Rule[]
}

/** What the solver assumes when it reads a puzzle — keep in step with the parser (src/lib/puzzleSolver/parse.ts). */
const GROUPS: Group[] = [
  {
    heading: 'In the puzzle',
    rules: [
      {
        title: 'Skipped months, years or days',
        text: 'If the months are listed with gaps (Jan, March, May, August) and a clue says "A was promoted three months before B", the real calendar gap is used, not the gap between listed months. The same goes for years and weekdays. "Immediately before / after" still means the next one in the list.',
        example: 'Jan, March, May, August: "three months before" → May → August (not January → August).',
      },
      {
        title: '"N persons before / after"',
        text: 'It means N places apart. "L promoted three persons before M" has two people between L and M.',
        example: 'L ←2→ M  (three places apart), not  L ←3→ M.',
      },
      {
        title: '"Either … or" and "neither … nor"',
        text: 'Read every word. "A, who is from Kolkata, lives on either the topmost or the lowest floor" means exactly one of those two floors. "Neither G nor the one who likes Black sits at the end" rules out both. "…, but not both" means exactly one of the two statements.',
      },
      {
        title: 'n persons between, or n floors between?',
        text: 'Check whether a clue counts people or floors (or days). With more floors than people (eight people in a nine-storied building) or more days than people, some floor / day stays empty: "persons between" counts people, while "floors / days between", "N floors above" and "immediately above" count floors / days — the empty one too.',
        example: 'Only two persons live between Q and R  ≠  two floors between Q and R.',
      },
    ],
  },
  {
    heading: 'Also followed',
    rules: [
      {
        title: 'Left and right',
        text: 'They are as seen by the person the clue is about. If everyone faces south, left and right are swapped compared with the picture; if some face north and some south, "X is to the left of Y" is as Y sees it. At a square or pentagon table, corners and sides have opposite "right".',
      },
      { title: 'Senior and junior', text: 'In numbered classes a higher class is more senior: "immediate junior to H" is the class just below H.' },
      { title: 'Ages', text: 'With "the base year for the calculation of their ages is 2023", age = 2023 − birth year. A later birth year is a lower age.' },
      { title: 'People and values not listed', text: 'If the text never lists the people (or the fruits, colours …), they are taken from the clues when their number matches. The page tells you when it did that.' },
    ],
  },
  {
    heading: 'Tips',
    rules: [
      { title: 'Paste everything', text: 'Include the introduction lines (who, how many, what attributes): the solver needs them as much as the clues.' },
      { title: 'Screenshots', text: 'Check the text the picture was turned into before solving; one lost "not" changes the answer.' },
      { title: 'Sentences it could not read', text: 'They are listed under "I couldn\'t read these sentences" and are never guessed at. Rewording them more simply usually fixes it.' },
      { title: 'More than one answer', text: 'A puzzle counts as solved only when exactly one arrangement fits every clue. Otherwise the page shows what every arrangement agrees on and what stays open.' },
    ],
  },
]

/** The "Instructions" button next to the page title, and the panel it opens (Escape or a click outside closes it). */
export default function Instructions() {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    const onDown = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onDown)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onDown)
    }
  }, [open])

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="puzzle-instructions"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-50 px-3.5 py-2 text-sm font-semibold text-indigo-700 ring-1 ring-indigo-200 transition hover:bg-indigo-100 dark:bg-indigo-500/10 dark:text-indigo-200 dark:ring-indigo-500/40 dark:hover:bg-indigo-500/20"
      >
        <span aria-hidden="true">ⓘ</span> Instructions
      </button>
      {open && (
        <div
          id="puzzle-instructions"
          role="dialog"
          aria-label="Puzzle Solver instructions"
          className="absolute right-0 z-30 mt-2 max-h-[75vh] w-[min(92vw,40rem)] overflow-y-auto rounded-2xl bg-white p-5 text-left shadow-xl ring-1 ring-slate-200 dark:bg-slate-800 dark:ring-slate-700"
        >
          <div className="flex items-start justify-between gap-3">
            <h2 className="text-lg font-extrabold text-slate-900 dark:text-slate-100">Instructions</h2>
            <button type="button" onClick={() => setOpen(false)} className="rounded-lg px-2 py-1 text-sm text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-700" aria-label="Close instructions">
              ✕
            </button>
          </div>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">How the solver reads a puzzle. Knowing these rules helps you spot a clue that was read differently from how it was meant.</p>
          {GROUPS.map((g) => (
            <section key={g.heading} className="mt-4">
              <h3 className="text-xs font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500">{g.heading}</h3>
              <ol className="mt-2 space-y-3">
                {g.rules.map((r, i) => (
                  <li key={r.title} className="flex gap-3 text-sm">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-[11px] font-bold text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-200">{i + 1}</span>
                    <div>
                      <div className="font-semibold text-slate-800 dark:text-slate-100">{r.title}</div>
                      <p className="text-slate-600 dark:text-slate-300">{r.text}</p>
                      {r.example && <p className="mt-1 rounded-lg bg-slate-50 px-2 py-1 font-mono text-xs text-slate-600 dark:bg-slate-900/50 dark:text-slate-300">{r.example}</p>}
                    </div>
                  </li>
                ))}
              </ol>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
