import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Ctx } from '../../lib/puzzleSolver/core'
import { ACCEPTED_TYPES, readPuzzleImage } from '../../lib/puzzleSolver/ocrApi'
import { parsePuzzle } from '../../lib/puzzleSolver/parse'
import { SAMPLES } from '../../lib/puzzleSolver/sample'
import type { Puzzle } from '../../lib/puzzleSolver/types'

interface PuzzleInputProps {
  text: string
  onText: (t: string) => void
  onSolve: (p: Puzzle) => void
  busy: boolean
  error: string | null
}

type OcrState = { kind: 'idle' } | { kind: 'reading' } | { kind: 'error'; message: string } | { kind: 'done'; previous: string }

export default function PuzzleInput({ text, onText, onSolve, busy, error }: PuzzleInputProps) {
  const parsed = useMemo(() => parsePuzzle(text), [text])
  const [ocr, setOcr] = useState<OcrState>({ kind: 'idle' })
  const [preview, setPreview] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const textRef = useRef(text)
  useEffect(() => {
    textRef.current = text
  }, [text])

  useEffect(() => () => (preview ? URL.revokeObjectURL(preview) : undefined), [preview])

  const handleImage = useCallback(
    async (file: Blob) => {
      if (!ACCEPTED_TYPES.includes(file.type)) {
        setOcr({ kind: 'error', message: 'Please use a PNG, JPEG or WebP image.' })
        return
      }
      setPreview(URL.createObjectURL(file))
      setOcr({ kind: 'reading' })
      const result = await readPuzzleImage(file)
      if (result.ok) {
        setOcr({ kind: 'done', previous: textRef.current })
        onText(result.text)
      } else setOcr({ kind: 'error', message: result.error })
    },
    [onText],
  )

  // Ctrl+V of a screenshot anywhere on the page
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const file = [...(e.clipboardData?.files ?? [])].find((f) => f.type.startsWith('image/'))
      if (file) {
        e.preventDefault()
        void handleImage(file)
      }
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [handleImage])

  const { puzzle, errors, warnings, unparsed, summary } = parsed
  const ctx = puzzle ? new Ctx(puzzle) : null
  const hasText = text.trim().length > 0
  const canSolve = !!puzzle && !busy && ocr.kind !== 'reading'

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <Link to="/reasoning" className="text-sm text-slate-400 hover:text-slate-600 dark:text-slate-500">
        ← Reasoning
      </Link>
      <h1 className="mt-2 text-3xl font-extrabold text-slate-900 dark:text-slate-100">Puzzle Solver</h1>
      <p className="mt-2 text-slate-500 dark:text-slate-400">
        Paste a seating / floor puzzle or drop a screenshot of it. You get the solution <em>and the reasoning</em>: which clue to start with and why, why a person can't be anywhere else, and — click any crossed-out option — an animation of exactly what goes
        wrong if you had put them there.
      </p>

      <div className="mt-6 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200 dark:bg-slate-800 dark:ring-slate-700">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label htmlFor="puzzle-text" className="font-semibold text-slate-800 dark:text-slate-200">
            The puzzle
          </label>
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <span className="text-slate-400 dark:text-slate-500">Try an example:</span>
            {SAMPLES.map((s) => (
              <button key={s.id} onClick={() => { onText(s.text); setOcr({ kind: 'idle' }); setPreview(null) }} className="rounded-full bg-indigo-50 px-2.5 py-1 font-semibold text-indigo-700 hover:bg-indigo-100 dark:bg-indigo-500/15 dark:text-indigo-300">
                {s.title}
              </button>
            ))}
          </div>
        </div>

        <textarea
          id="puzzle-text"
          value={text}
          onChange={(e) => onText(e.target.value)}
          rows={11}
          spellCheck={false}
          placeholder={'Eight persons - A, B, D, N, P, T, W, X - live on eight different floors of a building …\n\nEach of them is from a different city - Nagpur, Delhi, Bhopal …\n\nT lives two floors below the person from Bhopal.\nA lives immediately below X.\n…'}
          className="mt-2 w-full resize-y rounded-xl border border-slate-200 bg-slate-50 p-3 font-mono text-sm text-slate-800 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-200 dark:border-slate-600 dark:bg-slate-900/50 dark:text-slate-100 dark:focus:ring-indigo-500/30"
        />

        <div
          onDragOver={(e) => {
            e.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragging(false)
            const f = e.dataTransfer.files?.[0]
            if (f) void handleImage(f)
          }}
          className={['mt-3 flex flex-wrap items-center gap-3 rounded-xl border-2 border-dashed p-3 text-sm transition', dragging ? 'border-indigo-400 bg-indigo-50 dark:bg-indigo-500/10' : 'border-slate-200 dark:border-slate-600'].join(' ')}
        >
          {preview && <img src={preview} alt="Screenshot of the puzzle" className="h-16 w-24 rounded-lg object-cover ring-1 ring-slate-200 dark:ring-slate-600" />}
          <div className="min-w-0 flex-1">
            <div className="font-semibold text-slate-700 dark:text-slate-200">📷 Have a screenshot instead?</div>
            <div className="text-xs text-slate-500 dark:text-slate-400">Drop it here, press Ctrl+V to paste it, or choose a file. The text is read from the picture, and you can correct it above before solving.</div>
            {ocr.kind === 'reading' && <div className="mt-1 animate-pulse text-xs font-semibold text-indigo-600 dark:text-indigo-300">Reading the text from the picture…</div>}
            {ocr.kind === 'error' && <div className="mt-1 text-xs font-semibold text-rose-600 dark:text-rose-300">{ocr.message}</div>}
            {ocr.kind === 'done' && (
              <div className="mt-1 text-xs text-emerald-700 dark:text-emerald-300">
                Text read from the screenshot — please check it.{' '}
                {ocr.previous.trim() && (
                  <button
                    onClick={() => {
                      onText(ocr.previous)
                      setOcr({ kind: 'idle' })
                    }}
                    className="font-semibold underline"
                  >
                    Undo
                  </button>
                )}
              </div>
            )}
          </div>
          <button onClick={() => fileRef.current?.click()} disabled={ocr.kind === 'reading'} className="rounded-lg bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-200 disabled:opacity-50 dark:bg-slate-700 dark:text-slate-200">
            Choose file
          </button>
          <input
            ref={fileRef}
            type="file"
            accept={ACCEPTED_TYPES.join(',')}
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void handleImage(f)
              e.target.value = ''
            }}
          />
        </div>
        <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">Screenshots are read by an AI service (Google Gemini) through this app's server — only the picture is sent, and nothing is saved.</p>
      </div>

      {hasText && (
        <div className="mt-4 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200 dark:bg-slate-800 dark:ring-slate-700">
          <h2 className="text-xs font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500">What I understood</h2>
          {errors.length > 0 && (
            <ul className="mt-2 space-y-1 text-sm text-rose-600 dark:text-rose-300">
              {errors.map((e) => (
                <li key={e}>⚠ {e}</li>
              ))}
            </ul>
          )}
          {summary && puzzle && ctx && (
            <>
              <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
                <span className="rounded-full bg-slate-100 px-2.5 py-1 font-semibold text-slate-700 dark:bg-slate-700 dark:text-slate-200">
                  {summary.people.length} people: {summary.people.join(', ')}
                </span>
                <span className="rounded-full bg-slate-100 px-2.5 py-1 font-semibold text-slate-700 dark:bg-slate-700 dark:text-slate-200">
                  {summary.axis === 'floor' && summary.place ? `a stack of ${puzzle.n} ${summary.noun}es, places 1–${puzzle.n} from the bottom` : summary.axis === 'floor' ? `floors 1–${puzzle.n}${summary.topDown ? ' (numbered from the top)' : ''}` : summary.axis === 'row' ? `a row of ${puzzle.n} seats${summary.mixed ? ', some facing north and some south' : ''}${summary.mirror ? ', everyone facing south (their left is the east)' : ''}` : summary.axis === 'tworow' ? `two rows of ${puzzle.n / 2}, facing each other` : summary.axis === 'grid' ? `a ${puzzle.n / (summary.cols ?? 1)}-storey building, flats ${summary.flats?.join(' · ')} on each floor` : summary.axis === 'circle' ? (summary.square ? `a ${summary.shape ?? 'square'} table: ${puzzle.n / 2} corners (facing ${summary.cornersIn ? 'the centre' : 'outside'}) and ${puzzle.n / 2} sides (facing ${summary.cornersIn ? 'outside' : 'the centre'})` : `a round table of ${puzzle.n} (everyone facing ${summary.facing === 'out' ? 'outside' : 'the centre'})`) : summary.dates ? `${puzzle.n} people in date order on ${summary.dates.length} dates (${summary.dates[0]} → ${summary.dates[summary.dates.length - 1]}); ${summary.dates.length - puzzle.n} ${summary.dates.length - puzzle.n === 1 ? 'stays' : 'stay'} vacant` : summary.unordered ? `each person has a different ${summary.unit} (${(summary.labels ?? []).join(', ')})` : summary.labels ? `${summary.labels[0]} → ${summary.labels[summary.labels.length - 1]} (${puzzle.n} ${summary.unit}s)` : `${puzzle.n} ${summary.unit}s, in order`}
                </span>
                {summary.cats.map((c) => (
                  <span key={c.name} className="rounded-full bg-slate-100 px-2.5 py-1 font-semibold text-slate-700 dark:bg-slate-700 dark:text-slate-200" title={c.values.join(', ')}>
                    {c.name}: {c.values.length} values
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
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Try rewording it more simply (for example “A lives immediately above B”), or solve without it — the answer may then not be unique.</p>
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
                        <div className="text-xs text-indigo-600 dark:text-indigo-300">→ {c.atoms.map((a) => ctx.describeAtom(a)).join(' · ')}</div>
                      </div>
                    </li>
                  ))}
                </ol>
              </details>
            </>
          )}
        </div>
      )}

      {error && <p className="mt-4 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">{error}</p>}

      <button
        disabled={!canSolve}
        onClick={() => puzzle && onSolve(puzzle)}
        className="mt-5 w-full rounded-xl bg-indigo-600 px-4 py-3 font-semibold text-white shadow-sm transition hover:bg-indigo-500 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy ? 'Solving…' : puzzle ? (unparsed.length ? `Solve with the ${puzzle.clues.length} clues I understood` : 'Solve it, step by step') : 'Solve it, step by step'}
      </button>
    </div>
  )
}
