import { useEffect, useRef } from 'react'

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')

/** EJOTY: the five landmarks every other letter can be counted from. */
const LANDMARKS = new Set(['E', 'J', 'O', 'T', 'Y'])

/** One easy-to-picture hook per letter, in A→Z order. */
const HOOKS: Record<string, string> = {
  A: 'A1 — "A-one", top quality',
  B: 'B2 — the B-2 stealth bomber',
  C: 'C3 — C-3PO from Star Wars',
  D: 'D4 — Door number 4',
  E: 'E5 — Easy 5, first of the EJOTY landmarks',
  F: 'F6 — the F6 key on a keyboard',
  G: 'G7 — the G7 summit, seven countries',
  H: 'H8 — "H8" is text-speak for hate',
  I: 'I9 — Intel Core i9 processor',
  J: 'J10 — Jersey number 10 (Tendulkar, Messi)',
  K: 'K11 — "Kricket" XI, eleven players',
  L: 'L12 — Lunar year, 12 months',
  M: 'M13 — Middle of the alphabet: 13 is half of 26',
  N: 'N14 — Next after the middle: 13 + 1',
  O: 'O15 — tennis "15-love" (O looks like love, zero)',
  P: 'P16 — Party at Sweet 16',
  Q: 'Q17 — a Queue of 17 people',
  R: 'R18 — R-rated: restricted to 18+',
  S: 'S19 — Sick-19, as in COVID-19',
  T: 'T20 — T20 cricket',
  U: 'U21 — Under-21 football',
  V: 'V22 — the V-22 Osprey aircraft',
  W: 'W23 — Winner\'s jersey 23 (Michael Jordan)',
  X: 'X24 — X marks a full day: 24 hours',
  Y: 'Y25 — Silver jubilee, 25 years',
  Z: 'Z26 — Zenith: the last letter, all 26',
}

type Cell = { letter: string; n: number }

/** Two rows of 13 letters: `top` numbered by `numberOf`, and underneath each its opposite (the letter that makes the numbers add up to 27). */
function PairTable({ top, bottom, caption }: { top: Cell[]; bottom: Cell[]; caption: string }) {
  const cell = (c: Cell, tone: 'top' | 'bottom') => (
    <div
      key={c.letter + tone}
      className={[
        'flex flex-col items-center rounded-md py-1.5 leading-none',
        tone === 'top' ? 'bg-indigo-50 dark:bg-indigo-500/15 text-indigo-900 dark:text-indigo-100' : 'bg-slate-100 dark:bg-slate-700/60 text-slate-800 dark:text-slate-100',
      ].join(' ')}
    >
      <span className="text-sm font-bold sm:text-base">{c.letter}</span>
      <span className="mt-1 text-[11px] font-medium tabular-nums opacity-80 sm:text-xs">({c.n})</span>
    </div>
  )
  return (
    <div role="group" aria-label={caption}>
      <div className="grid gap-1" style={{ gridTemplateColumns: 'repeat(13, minmax(0, 1fr))' }}>
        {top.map((c) => cell(c, 'top'))}
      </div>
      <div className="my-1 text-center text-[11px] font-medium text-slate-400 dark:text-slate-500">↕ each pair adds up to 27</div>
      <div className="grid gap-1" style={{ gridTemplateColumns: 'repeat(13, minmax(0, 1fr))' }}>
        {bottom.map((c) => cell(c, 'bottom'))}
      </div>
    </div>
  )
}

const forward = LETTERS.map((letter, i) => ({ letter, n: i + 1 }))
// A→M with Z→N below
const fwdTop = forward.slice(0, 13)
const fwdBottom = forward.slice(13).reverse()
// Z→N counted 1…13, with A→M (26…14) below
const reverse = LETTERS.slice().reverse().map((letter, i) => ({ letter, n: i + 1 }))
const revTop = reverse.slice(0, 13)
const revBottom = reverse.slice(13).reverse()

export default function AlphabetLearnDialog({ onClose }: { onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    closeRef.current?.focus()
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = previous
    }
  }, [onClose])

  const h = 'text-base font-bold text-slate-900 dark:text-slate-100'
  const note = 'mt-1 text-sm text-slate-500 dark:text-slate-400'

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-3 sm:p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="alpha-learn-title"
        className="flex max-h-[92vh] w-full max-w-2xl flex-col rounded-2xl bg-white shadow-xl dark:bg-slate-900"
      >
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-3 dark:border-slate-700">
          <h2 id="alpha-learn-title" className="text-lg font-extrabold text-slate-900 dark:text-slate-100">
            📖 Learn the alphabet numbers
          </h2>
          <button
            ref={closeRef}
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg px-2.5 py-1 text-lg leading-none text-slate-500 transition hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
          >
            ✕
          </button>
        </div>

        <div className="space-y-7 overflow-y-auto px-5 py-5">
          <section>
            <h3 className={h}>1 · Forward: A = 1 … Z = 26</h3>
            <p className={note}>Learn the first half, A to M (top). The letter underneath is its opposite — the two numbers always add up to 27.</p>
            <div className="mt-3">
              <PairTable top={fwdTop} bottom={fwdBottom} caption="Forward alphabet, A to M above Z to N" />
            </div>
          </section>

          <section>
            <h3 className={h}>2 · Reverse: Z first, counting back</h3>
            <p className={note}>
              Z = 1 up to N = 13 (top), with the opposite letters A = 26 down to M = 14 below. In the test, reverse values carry a minus sign: Z = −1 … A = −26.
            </p>
            <div className="mt-3">
              <PairTable top={revTop} bottom={revBottom} caption="Reverse alphabet, Z to N above A to M" />
            </div>
          </section>

          <section>
            <h3 className={h}>3 · Tips to remember</h3>
            <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-slate-700 dark:text-slate-300">
              <li>
                <b>EJOTY</b> — remember five landmarks: <b>E5, J10, O15, T20, Y25</b>. Any letter is at most two steps from one (R is T − 2 = 18, L is J + 2 = 12).
              </li>
              <li>
                <b>Opposites add up to 27.</b> A1 + Z26, M13 + N14. So the reverse number of any letter is 27 − its forward number (G = 7 → reverse 20), and in the test's minus form, reverse = forward − 27.
              </li>
              <li>
                <b>Say the opposite pairs in one breath:</b> AZ · BY · CX · DW · EV · FU · GT · HS · IR · JQ · KP · LO · MN.
              </li>
              <li>
                <b>Halves:</b> A–M is 1–13 and N–Z is 14–26, so N is always M + 1 = 14.
              </li>
            </ul>
            <p className="mt-4 text-sm font-semibold text-slate-800 dark:text-slate-200">A picture for every letter</p>
            <ul className="mt-2 grid gap-1.5 sm:grid-cols-2">
              {LETTERS.map((ch) => (
                <li
                  key={ch}
                  className={[
                    'rounded-lg px-3 py-1.5 text-sm',
                    LANDMARKS.has(ch)
                      ? 'bg-amber-50 text-amber-950 ring-1 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-100 dark:ring-amber-500/30'
                      : 'bg-slate-50 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
                  ].join(' ')}
                >
                  {HOOKS[ch]}
                </li>
              ))}
            </ul>
            <p className={note}>Highlighted letters are the EJOTY landmarks.</p>
          </section>
        </div>

        <div className="border-t border-slate-200 px-5 py-3 dark:border-slate-700">
          <button onClick={onClose} className="w-full rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-500">
            Got it — back to the test
          </button>
        </div>
      </div>
    </div>
  )
}
