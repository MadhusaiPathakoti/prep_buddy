import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import FactorPairsRunner from '../../components/FactorPairsRunner'
import {
  buildPool,
  DEFAULT_SETTINGS,
  FACTOR_LIMIT,
  generateFactorQuestions,
  NUM_LIMIT,
  TABLE_LIMIT,
  type FactorQuestion,
  type FactorSettings,
} from '../../lib/factorPairs'

const QUESTION_COUNTS = [5, 10, 15, 20]
const MIN_PAIRS_CHOICES = [1, 2, 3, 4, 5, 6]
const SETTINGS_KEY = 'prepbuddy:factor-pairs:settings'

interface Preset {
  label: string
  settings: Partial<FactorSettings>
}

const PRESETS: Preset[] = [
  { label: 'Numbers 20–100', settings: { source: 'range', numFrom: 20, numTo: 100, minPairs: 2 } },
  { label: 'Numbers 100–300', settings: { source: 'range', numFrom: 100, numTo: 300, minPairs: 4 } },
  { label: 'Tables 11–19 × 11–20', settings: { source: 'tables', tableFrom: 11, tableTo: 19, multFrom: 11, multTo: 20, minPairs: 2 } },
  { label: 'Tables 2–12 × 2–12', settings: { source: 'tables', tableFrom: 2, tableTo: 12, multFrom: 2, multTo: 12, minPairs: 2 } },
]

function loadSettings(): FactorSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (parsed && typeof parsed === 'object') return { ...DEFAULT_SETTINGS, ...parsed }
    }
  } catch {
    // unavailable or corrupt: use the defaults
  }
  return DEFAULT_SETTINGS
}

/** A whole-number box that lets you type freely and snaps into [min, max] when you leave it. */
function NumInput({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (n: number) => void }) {
  // While typing, `draft` holds the raw text; otherwise the box simply shows the committed value.
  const [draft, setDraft] = useState<string | null>(null)

  function commit(raw: string) {
    const n = Number(raw)
    if (raw.trim() !== '' && Number.isFinite(n)) onChange(Math.min(max, Math.max(min, Math.round(n))))
    setDraft(null)
  }

  return (
    <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
      {label}
      <input
        value={draft ?? String(value)}
        onChange={(e) => {
          const raw = e.target.value.replace(/\D/g, '').slice(0, 5)
          setDraft(raw)
          const n = Number(raw)
          if (raw !== '' && n >= min && n <= max) onChange(n)
        }}
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && commit(draft ?? String(value))}
        inputMode="numeric"
        autoComplete="off"
        className="w-20 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-center font-semibold text-slate-800 dark:text-slate-200 outline-none focus:border-indigo-400"
      />
    </label>
  )
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="mt-6 first:mt-0">
      <h2 className="font-semibold text-slate-800 dark:text-slate-200">{title}</h2>
      {hint && <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">{hint}</p>}
      <div className="mt-3">{children}</div>
    </div>
  )
}

function Toggle({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: React.ReactNode }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 text-sm text-slate-700 dark:text-slate-300">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 h-4 w-4 accent-indigo-600" />
      <span>{children}</span>
    </label>
  )
}

const chip = (active: boolean) =>
  [
    'rounded-lg px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-40',
    active ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200',
  ].join(' ')

export default function FactorPairs() {
  const [settings, setSettings] = useState<FactorSettings>(loadSettings)
  const [count, setCount] = useState(10)
  const [questions, setQuestions] = useState<FactorQuestion[] | null>(null)
  const [sessionKey, setSessionKey] = useState(0)

  useEffect(() => {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
    } catch {
      // not persisted
    }
  }, [settings])

  function patch(p: Partial<FactorSettings>) {
    setSettings((s) => ({ ...s, ...p }))
  }

  /** Keep a from/to pair ordered: moving one end past the other drags the other end along. */
  function setRange(fromKey: keyof FactorSettings, toKey: keyof FactorSettings, which: 'from' | 'to', value: number) {
    setSettings((s) => {
      const next = { ...s }
      if (which === 'from') {
        ;(next[fromKey] as number) = value
        if (value > (s[toKey] as number)) (next[toKey] as number) = value
      } else {
        ;(next[toKey] as number) = value
        if (value < (s[fromKey] as number)) (next[fromKey] as number) = value
      }
      return next
    })
  }

  const pool = useMemo(() => buildPool(settings), [settings])
  const poolSize = pool.length
  const mostPairs = pool.reduce((m, q) => Math.max(m, q.pairs.length), 0)
  const fewestPairs = pool.reduce((m, q) => Math.min(m, q.pairs.length), Infinity)
  const effectiveCount = Math.min(count, poolSize)

  function start() {
    setQuestions(generateFactorQuestions(settings, count))
    setSessionKey((k) => k + 1)
  }

  if (questions) {
    return (
      <FactorPairsRunner
        key={sessionKey}
        questions={questions}
        settings={settings}
        onExit={() => setQuestions(null)}
        onRestart={start}
      />
    )
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <Link to="/maths" className="text-sm text-slate-400 dark:text-slate-500 hover:text-slate-600">
        ← Maths
      </Link>
      <h1 className="mt-2 text-3xl font-extrabold text-slate-900 dark:text-slate-100">Factor Pairs</h1>
      <p className="mt-2 text-slate-500 dark:text-slate-400">
        You get a number, e.g. <span className="font-mono">72 = _ × _</span>. Type every pair that multiplies to it:{' '}
        <span className="font-mono">8 × 9</span>, <span className="font-mono">4 × 18</span>, <span className="font-mono">6 × 12</span> … The order does not
        matter (8 × 9 is the same pair as 9 × 8). When you are done, the full list is shown.
      </p>

      <div className="mt-8 rounded-3xl bg-white dark:bg-slate-800 p-6 shadow-sm ring-1 ring-slate-200 dark:ring-slate-700">
        <Section title="Quick picks">
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((p) => (
              <button key={p.label} onClick={() => patch(p.settings)} className={chip(false)}>
                {p.label}
              </button>
            ))}
          </div>
        </Section>

        <Section title="Which numbers?">
          <div className="flex gap-2">
            <button onClick={() => patch({ source: 'range' })} className={chip(settings.source === 'range')}>
              Number range
            </button>
            <button onClick={() => patch({ source: 'tables' })} className={chip(settings.source === 'tables')}>
              Tables × multipliers
            </button>
          </div>

          {settings.source === 'range' ? (
            <div className="mt-4">
              <p className="text-xs text-slate-400 dark:text-slate-500">Every number between these two, e.g. 50 to 120.</p>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <NumInput label="From" value={settings.numFrom} min={NUM_LIMIT.min} max={NUM_LIMIT.max} onChange={(n) => setRange('numFrom', 'numTo', 'from', n)} />
                <NumInput label="To" value={settings.numTo} min={NUM_LIMIT.min} max={NUM_LIMIT.max} onChange={(n) => setRange('numFrom', 'numTo', 'to', n)} />
              </div>
            </div>
          ) : (
            <div className="mt-4">
              <p className="text-xs text-slate-400 dark:text-slate-500">
                The numbers are products: a table × a multiplier. For example tables 11 to 19 with × 11 to × 20 give 121, 132 … 380.
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-x-6 gap-y-3">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">Tables</span>
                  <NumInput label="from" value={settings.tableFrom} min={TABLE_LIMIT.min} max={TABLE_LIMIT.max} onChange={(n) => setRange('tableFrom', 'tableTo', 'from', n)} />
                  <NumInput label="to" value={settings.tableTo} min={TABLE_LIMIT.min} max={TABLE_LIMIT.max} onChange={(n) => setRange('tableFrom', 'tableTo', 'to', n)} />
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">Multiplied by</span>
                  <NumInput label="from" value={settings.multFrom} min={TABLE_LIMIT.min} max={TABLE_LIMIT.max} onChange={(n) => setRange('multFrom', 'multTo', 'from', n)} />
                  <NumInput label="to" value={settings.multTo} min={TABLE_LIMIT.min} max={TABLE_LIMIT.max} onChange={(n) => setRange('multFrom', 'multTo', 'to', n)} />
                </div>
              </div>
            </div>
          )}
        </Section>

        <Section title="Which pairs count?">
          <div className="space-y-3">
            <Toggle checked={settings.includeOne} onChange={(v) => patch({ includeOne: v })}>
              Include <span className="font-mono">1 × N</span> (e.g. 1 × 72)
            </Toggle>
            <Toggle checked={settings.limitFactors} onChange={(v) => patch({ limitFactors: v })}>
              Only count pairs where both factors are within a range (a bigger factor like 2 × 36 is then ignored)
            </Toggle>
            {settings.limitFactors && (
              <div className="ml-7 flex flex-wrap items-center gap-3">
                <NumInput label="Smallest" value={settings.factorMin} min={FACTOR_LIMIT.min} max={FACTOR_LIMIT.max} onChange={(n) => setRange('factorMin', 'factorMax', 'from', n)} />
                <NumInput label="Largest" value={settings.factorMax} min={FACTOR_LIMIT.min} max={FACTOR_LIMIT.max} onChange={(n) => setRange('factorMin', 'factorMax', 'to', n)} />
              </div>
            )}
          </div>
        </Section>

        <Section title="How many pairs must a number have?" hint="Higher means richer numbers like 72 or 120, and no primes.">
          <div className="flex flex-wrap gap-2">
            {MIN_PAIRS_CHOICES.map((m) => (
              <button key={m} onClick={() => patch({ minPairs: m })} className={chip(settings.minPairs === m)}>
                {m === 1 ? 'Any' : `${m}+`}
              </button>
            ))}
          </div>
          <div className="mt-4">
            <Toggle checked={settings.showCount} onChange={(v) => patch({ showCount: v })}>
              Show how many pairs there are while I play (a hint)
            </Toggle>
          </div>
        </Section>

        <Section title="Number of questions">
          <div className="flex flex-wrap gap-2">
            {QUESTION_COUNTS.map((c) => (
              <button key={c} onClick={() => setCount(c)} disabled={poolSize === 0} className={chip(count === c)}>
                {c}
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">
            {poolSize === 0
              ? 'No numbers match these filters. Widen the range or lower the pairs needed.'
              : `${poolSize} number${poolSize === 1 ? '' : 's'} available, with ${fewestPairs === mostPairs ? `${mostPairs} pair${mostPairs === 1 ? '' : 's'}${poolSize > 1 ? ' each' : ''}` : `${fewestPairs} to ${mostPairs} pairs each`}.${count > poolSize ? ` Only ${poolSize} will be asked.` : ''}`}
          </p>
        </Section>

        <button
          onClick={start}
          disabled={poolSize === 0}
          className="mt-8 w-full rounded-xl bg-indigo-600 px-4 py-3 font-semibold text-white shadow-sm transition hover:bg-indigo-500 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40"
        >
          {poolSize === 0 ? 'No numbers match these filters' : `Start · ${effectiveCount} number${effectiveCount === 1 ? '' : 's'}`}
        </button>
      </div>
    </div>
  )
}
