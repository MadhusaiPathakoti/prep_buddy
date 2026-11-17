import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ACCEPTED_TYPES, readPuzzleImage } from '../../lib/puzzleSolver/ocrApi'
import { buildModel, consistent } from '../../lib/syllogismSolver/engine'
import { parseQuestion, type ParsedQuestion, type Sentence } from '../../lib/syllogismSolver/parse'
import { SAMPLES } from '../../lib/syllogismSolver/sample'

interface Props {
  text: string
  onText: (t: string) => void
  onSolve: (q: ParsedQuestion) => void
  busy: boolean
  error: string | null
}

type OcrState = { kind: 'idle' } | { kind: 'reading' } | { kind: 'error'; message: string } | { kind: 'done'; previous: string }

const kindLabel = (s: Sentence) => (s.few ? 'Only a few' : s.possibility ? (s.form === 'O' ? 'May not be' : s.form === 'A' ? 'All can be' : 'Can be') : { A: 'All', E: 'No', I: 'Some', O: 'Some … not' }[s.form])

export default function SyllogismInput({ text, onText, onSolve, busy, error }: Props) {
  const parsed = useMemo(() => parseQuestion(text), [text])
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
      const result = await readPuzzleImage(file, 'syllogism')
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

  const { statements, conclusions, terms, warnings, unparsed } = parsed
  const hasText = text.trim().length > 0
  // statements that cannot all be true together have no picture, so nothing can "follow" from them
  const contradiction = useMemo(() => parsed.errors.length === 0 && parsed.statements.length > 0 && !consistent(buildModel(parsed)), [parsed])
  const errors = contradiction ? [...parsed.errors, 'These statements contradict each other — no picture can make them all true. Check them against the question.'] : parsed.errors
  const ok = errors.length === 0 && statements.length > 0 && conclusions.length > 0
  const canSolve = ok && !busy && ocr.kind !== 'reading'

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <Link to="/reasoning" className="text-sm text-slate-400 hover:text-slate-600 dark:text-slate-500">
        ← Reasoning
      </Link>
      <h1 className="mt-2 text-3xl font-extrabold text-slate-900 dark:text-slate-100">Syllogism Solver</h1>
      <p className="mt-2 text-slate-500 dark:text-slate-400">
        Type or paste a syllogism question — or drop a screenshot of it. You get an animated Venn diagram that builds the statements one by one, a <em>Check</em> button beside every conclusion that shows the pictures that prove or break it, and an explanation of why
        any answer you pick is right or wrong.
      </p>

      <div className="mt-6 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200 dark:bg-slate-800 dark:ring-slate-700">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label htmlFor="syl-text" className="font-semibold text-slate-800 dark:text-slate-200">
            The question
          </label>
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <span className="text-slate-400 dark:text-slate-500">Try an example:</span>
            {SAMPLES.map((s) => (
              <button
                key={s.id}
                onClick={() => {
                  onText(s.text)
                  setOcr({ kind: 'idle' })
                  setPreview(null)
                }}
                className="rounded-full bg-indigo-50 px-2.5 py-1 font-semibold text-indigo-700 hover:bg-indigo-100 dark:bg-indigo-500/15 dark:text-indigo-300"
              >
                {s.title}
              </button>
            ))}
          </div>
        </div>

        <textarea
          id="syl-text"
          value={text}
          onChange={(e) => onText(e.target.value)}
          rows={10}
          spellCheck={false}
          placeholder={'Statements:\nAll clocks are keys.\nSome keys are not mobiles.\nNo mobile is a car.\nAll cars are tables.\nConclusions:\nI. No clock is a mobile.\nII. Some clocks are mobiles.'}
          className="mt-2 w-full resize-y rounded-xl border border-slate-200 bg-slate-50 p-3 font-mono text-sm text-slate-800 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-200 dark:border-slate-600 dark:bg-slate-900/50 dark:text-slate-100 dark:focus:ring-indigo-500/30"
        />
        <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">
          Two question types work: conclusions “I.” / “II.” (answer options A–E such as “Only conclusion I follows” are ignored if pasted), or “Which of the following conclusions definitely follows?” with options “A. …” to “E. …” that are themselves conclusions.
        </p>

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
          {preview && <img src={preview} alt="Screenshot of the question" className="h-16 w-24 rounded-lg object-cover ring-1 ring-slate-200 dark:ring-slate-600" />}
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
          {(statements.length > 0 || conclusions.length > 0) && (
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <div>
                <div className="text-sm font-semibold text-slate-700 dark:text-slate-200">Statements</div>
                <ol className="mt-1 space-y-1">
                  {statements.map((s, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-slate-600 dark:text-slate-300">
                      <span className="mt-0.5 shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600 dark:bg-slate-700 dark:text-slate-300">{kindLabel(s)}</span>
                      <span>{s.text}.</span>
                    </li>
                  ))}
                </ol>
              </div>
              <div>
                <div className="text-sm font-semibold text-slate-700 dark:text-slate-200">{parsed.mode === 'which' ? (parsed.negate ? 'Options — which does NOT follow?' : 'Options — which definitely follows?') : 'Conclusions'}</div>
                <ol className="mt-1 space-y-1">
                  {conclusions.map((s, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-slate-600 dark:text-slate-300">
                      <span className="mt-0.5 shrink-0 rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-bold text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300">{(parsed.mode === 'which' ? 'ABCDE' : 'I,II,III,IV'.split(','))[i]}</span>
                      <span>
                        {s.text}. <span className="text-[10px] font-bold text-slate-400">{kindLabel(s)}</span>
                      </span>
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          )}
          {terms.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5 text-xs">
              {terms.map((t) => (
                <span key={t.singular} className="rounded-full bg-slate-100 px-2.5 py-1 font-semibold text-slate-700 dark:bg-slate-700 dark:text-slate-200">
                  {t.label}
                </span>
              ))}
              <span className="px-1 py-1 text-slate-400 dark:text-slate-500">→ {terms.length} circles</span>
            </div>
          )}
          {warnings.map((w) => (
            <p key={w} className="mt-2 text-xs text-amber-700 dark:text-amber-300">
              ⚠ {w}
            </p>
          ))}
          {unparsed.length > 0 && (
            <div className="mt-3 rounded-xl bg-amber-50 p-3 text-sm dark:bg-amber-500/10">
              <div className="font-semibold text-amber-800 dark:text-amber-300">I couldn't read {unparsed.length === 1 ? 'this line' : 'these lines'}:</div>
              <ul className="mt-1 list-disc space-y-0.5 pl-5 text-slate-700 dark:text-slate-200">
                {unparsed.map((u) => (
                  <li key={u}>{u}</li>
                ))}
              </ul>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Use the forms “All x are y”, “No x is y”, “Some x are y”, “Some x are not y” or “Only a few x are y” (conclusions may also say “Some x can be y”).</p>
            </div>
          )}
        </div>
      )}

      {error && <p className="mt-4 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">{error}</p>}

      <button
        disabled={!canSolve}
        onClick={() => onSolve(parsed)}
        className="mt-5 w-full rounded-xl bg-indigo-600 px-4 py-3 font-semibold text-white shadow-sm transition hover:bg-indigo-500 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy ? 'Solving…' : 'Solve it, with diagrams'}
      </button>
    </div>
  )
}
