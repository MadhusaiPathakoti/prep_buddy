import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import PowersRunner from '../../components/PowersRunner'
import { BASES, BASE_LIMIT, buildPool, generatePowerQuestions, POWER_LIMIT, powerText, type PowerQuestion } from '../../lib/powers'

const POWERS = Array.from({ length: POWER_LIMIT.max - POWER_LIMIT.min + 1 }, (_, i) => POWER_LIMIT.min + i)
const QUESTION_COUNTS = [10, 20, 30]
const POWER_PRESETS: [number, number][] = [
  [2, 4],
  [5, 7],
  [8, 10],
  [2, 10],
]
const SETTINGS_KEY = 'prepbuddy:powers:settings'

interface Settings {
  bases: number[]
  powerFrom: number
  powerTo: number
  /** 0 means "all of them". */
  count: number
}

const DEFAULTS: Settings = { bases: [2, 3, 4, 5], powerFrom: 2, powerTo: 8, count: 10 }

function loadSettings(): Settings {
  try {
    const parsed = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? 'null')
    if (parsed && Array.isArray(parsed.bases)) {
      const bases = parsed.bases.filter((b: unknown) => typeof b === 'number' && BASES.includes(b))
      const inRange = (n: unknown, fallback: number) => (typeof n === 'number' && n >= POWER_LIMIT.min && n <= POWER_LIMIT.max ? n : fallback)
      const powerFrom = inRange(parsed.powerFrom, DEFAULTS.powerFrom)
      const powerTo = Math.max(powerFrom, inRange(parsed.powerTo, DEFAULTS.powerTo))
      return { bases, powerFrom, powerTo, count: typeof parsed.count === 'number' && parsed.count >= 0 ? parsed.count : DEFAULTS.count }
    }
  } catch {
    // unavailable or corrupt: use the defaults
  }
  return DEFAULTS
}

const chip = (active: boolean) =>
  [
    'rounded-lg px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-40',
    active ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200',
  ].join(' ')

const selectClass =
  'rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 font-semibold text-slate-800 dark:text-slate-200 outline-none focus:border-indigo-400'

function QuickButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className="rounded-md bg-slate-100 px-2.5 py-1 font-semibold text-slate-600 transition hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-300">
      {children}
    </button>
  )
}

export default function Powers() {
  const [settings, setSettings] = useState<Settings>(loadSettings)
  const [questions, setQuestions] = useState<PowerQuestion[] | null>(null)
  const [sessionKey, setSessionKey] = useState(0)

  useEffect(() => {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
    } catch {
      // not persisted
    }
  }, [settings])

  const { bases, powerFrom, powerTo, count } = settings
  const pool = useMemo(() => buildPool(bases, powerFrom, powerTo), [bases, powerFrom, powerTo])
  const poolSize = pool.length
  const asked = count === 0 ? poolSize : Math.min(count, poolSize)
  const biggest = pool.reduce((m, q) => (q.answer > m.answer ? q : m), pool[0])

  const setBases = (next: number[]) => setSettings((s) => ({ ...s, bases: [...next].sort((a, b) => a - b) }))
  const toggle = (n: number) =>
    setSettings((s) => ({ ...s, bases: (s.bases.includes(n) ? s.bases.filter((b) => b !== n) : [...s.bases, n]).sort((a, b) => a - b) }))
  const selectRange = (from: number, to: number) => setBases(BASES.filter((b) => b >= from && b <= to))

  // the "range" boxes follow the selection when it is one unbroken run, and otherwise show the widest span
  const runFrom = bases.length ? Math.min(...bases) : BASE_LIMIT.min
  const runTo = bases.length ? Math.max(...bases) : BASE_LIMIT.max
  const changeRunFrom = (v: number) => selectRange(v, Math.max(v, runTo))
  const changeRunTo = (v: number) => selectRange(Math.min(v, runFrom), v)

  const changePowerFrom = (v: number) => setSettings((s) => ({ ...s, powerFrom: v, powerTo: Math.max(v, s.powerTo) }))
  const changePowerTo = (v: number) => setSettings((s) => ({ ...s, powerTo: v, powerFrom: Math.min(v, s.powerFrom) }))

  function generate() {
    return generatePowerQuestions(bases, powerFrom, powerTo, asked)
  }
  function start() {
    if (poolSize === 0) return
    setQuestions(generate())
    setSessionKey((k) => k + 1)
  }

  if (questions) {
    return (
      <PowersRunner
        key={sessionKey}
        questions={questions}
        onExit={() => setQuestions(null)}
        onRestart={() => {
          setQuestions(generate())
          setSessionKey((k) => k + 1)
        }}
      />
    )
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <Link to="/maths" className="text-sm text-slate-400 dark:text-slate-500 hover:text-slate-600">
        ← Maths
      </Link>
      <h1 className="mt-2 text-3xl font-extrabold text-slate-900 dark:text-slate-100">Powers</h1>
      <p className="mt-2 text-slate-500 dark:text-slate-400">
        Pick the numbers and the range of powers, e.g. <span className="font-mono">2⁸ = _</span> (2 to the power 8). Type each answer and the game tells you at once if it is right.
        At the end you see every question with your answer and the correct one.
      </p>

      <div className="mt-8 rounded-3xl bg-white dark:bg-slate-800 p-6 shadow-sm ring-1 ring-slate-200 dark:ring-slate-700">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold text-slate-800 dark:text-slate-200">Numbers (bases)</h2>
          <div className="flex flex-wrap gap-1.5 text-xs">
            <QuickButton onClick={() => selectRange(2, 5)}>2–5</QuickButton>
            <QuickButton onClick={() => selectRange(6, 10)}>6–10</QuickButton>
            <QuickButton onClick={() => setBases(BASES)}>All</QuickButton>
            <QuickButton onClick={() => setBases([])}>Clear</QuickButton>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-5 gap-2 sm:grid-cols-9">
          {BASES.map((n) => (
            <button key={n} onClick={() => toggle(n)} aria-pressed={bases.includes(n)} className={`rounded-lg py-2 text-sm font-semibold transition ${bases.includes(n) ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200'}`}>
              {n}
            </button>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-slate-600 dark:text-slate-300">
          <span>Or choose a range:</span>
          <label className="flex items-center gap-2">
            From
            <select value={runFrom} onChange={(e) => changeRunFrom(Number(e.target.value))} className={selectClass}>
              {BASES.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2">
            To
            <select value={runTo} onChange={(e) => changeRunTo(Number(e.target.value))} className={selectClass}>
              {BASES.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        </div>

        <h2 className="mt-6 font-semibold text-slate-800 dark:text-slate-200">Powers</h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">e.g. 2 to 8 asks every chosen number to the power 2, 3 … 8.</p>
        <div className="mt-3 flex items-center gap-3 text-sm text-slate-600 dark:text-slate-300">
          <label className="flex items-center gap-2">
            From
            <select value={powerFrom} onChange={(e) => changePowerFrom(Number(e.target.value))} className={selectClass}>
              {POWERS.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2">
            To
            <select value={powerTo} onChange={(e) => changePowerTo(Number(e.target.value))} className={selectClass}>
              {POWERS.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {POWER_PRESETS.map(([from, to]) => (
            <button key={`${from}-${to}`} onClick={() => setSettings((s) => ({ ...s, powerFrom: from, powerTo: to }))} className={chip(powerFrom === from && powerTo === to)}>
              Power {from}–{to}
            </button>
          ))}
        </div>

        <h2 className="mt-6 font-semibold text-slate-800 dark:text-slate-200">Number of questions</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {QUESTION_COUNTS.map((c) => (
            <button key={c} onClick={() => setSettings((s) => ({ ...s, count: c }))} disabled={poolSize === 0} className={chip(count === c)}>
              {c}
            </button>
          ))}
          <button onClick={() => setSettings((s) => ({ ...s, count: 0 }))} disabled={poolSize === 0} className={chip(count === 0)}>
            All{poolSize ? ` (${poolSize})` : ''}
          </button>
        </div>
        <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">
          {poolSize === 0
            ? 'Pick at least one number.'
            : `${poolSize} different question${poolSize === 1 ? '' : 's'} available, from ${powerText(pool[0].base, pool[0].exp)} up to ${powerText(biggest.base, biggest.exp)} = ${biggest.answer.toLocaleString('en-US')}. None is asked twice.${count > poolSize ? ` Only ${poolSize} will be asked.` : ''}`}
        </p>

        <button
          onClick={start}
          disabled={poolSize === 0}
          className="mt-8 w-full rounded-xl bg-indigo-600 px-4 py-3 font-semibold text-white shadow-sm transition hover:bg-indigo-500 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40"
        >
          {poolSize === 0 ? 'Pick at least one number' : `Start · ${asked} question${asked === 1 ? '' : 's'}`}
        </button>
      </div>
    </div>
  )
}
