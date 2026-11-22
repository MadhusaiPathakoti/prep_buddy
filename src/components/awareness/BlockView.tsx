import { THEMES } from '../../lib/awareness/theme'
import type { CaBlock, CaTheme, CalloutKind } from '../../lib/awareness/types'
import FigureView from './FigureView'
import Rich from './Rich'

const CALLOUTS: Record<CalloutKind, { icon: string; title: string; box: string; head: string }> = {
  remember: {
    icon: '📌',
    title: 'Must remember',
    box: 'bg-indigo-50 ring-indigo-200 dark:bg-indigo-500/10 dark:ring-indigo-500/30',
    head: 'text-indigo-700 dark:text-indigo-300',
  },
  trap: {
    icon: '⚠️',
    title: 'Exam trap',
    box: 'bg-rose-50 ring-rose-200 dark:bg-rose-500/10 dark:ring-rose-500/30',
    head: 'text-rose-700 dark:text-rose-300',
  },
  tip: {
    icon: '💡',
    title: 'Memory trick',
    box: 'bg-emerald-50 ring-emerald-200 dark:bg-emerald-500/10 dark:ring-emerald-500/30',
    head: 'text-emerald-700 dark:text-emerald-300',
  },
  fact: {
    icon: '✨',
    title: 'Did you know?',
    box: 'bg-amber-50 ring-amber-200 dark:bg-amber-500/10 dark:ring-amber-500/30',
    head: 'text-amber-700 dark:text-amber-300',
  },
}

function BlockTitle({ text, theme }: { text?: string; theme: CaTheme }) {
  if (!text) return null
  return <h4 className={`mb-2 text-sm font-bold uppercase tracking-wide ${THEMES[theme].text}`}>{text}</h4>
}

/** Renders one book block (paragraph, list, table, timeline, callout or diagram) in the chapter's colours. */
export default function BlockView({ block, theme }: { block: CaBlock; theme: CaTheme }) {
  const t = THEMES[theme]
  switch (block.type) {
    case 'text':
      return (
        <p className="leading-relaxed text-slate-700 dark:text-slate-300">
          <Rich text={block.text} />
        </p>
      )

    case 'bullets':
      return (
        <div>
          <BlockTitle text={block.title} theme={theme} />
          <ul className="space-y-1.5">
            {block.items.map((item, i) => (
              <li key={i} className="flex gap-3 leading-relaxed text-slate-700 dark:text-slate-300">
                <span className={`mt-2 h-2 w-2 shrink-0 rounded-full ${t.solid}`} aria-hidden="true" />
                <span>
                  <Rich text={item} />
                </span>
              </li>
            ))}
          </ul>
        </div>
      )

    case 'keyvalue':
      return (
        <div>
          <BlockTitle text={block.title} theme={theme} />
          <dl className="divide-y divide-slate-100 overflow-hidden rounded-2xl bg-white ring-1 ring-slate-200 dark:divide-slate-700 dark:bg-slate-800 dark:ring-slate-700">
            {block.rows.map(([term, meaning], i) => (
              <div key={i} className="grid gap-0.5 px-4 py-2.5 sm:grid-cols-[minmax(8rem,28%)_1fr] sm:gap-4">
                <dt className={`font-bold ${t.text}`}>
                  <Rich text={term} />
                </dt>
                <dd className="text-slate-700 dark:text-slate-300">
                  <Rich text={meaning} />
                </dd>
              </div>
            ))}
          </dl>
        </div>
      )

    case 'table':
      return (
        <div>
          <BlockTitle text={block.title} theme={theme} />
          <div className="overflow-x-auto rounded-2xl ring-1 ring-slate-200 dark:ring-slate-700">
            <table className="w-full min-w-[28rem] border-collapse text-left text-sm">
              <thead>
                <tr className={t.head}>
                  {block.headers.map((h, i) => (
                    <th key={i} className="px-3 py-2.5 font-semibold">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {block.rows.map((row, ri) => (
                  <tr key={ri} className={ri % 2 ? 'bg-slate-50 dark:bg-slate-800/60' : 'bg-white dark:bg-slate-800'}>
                    {row.map((cell, ci) => (
                      <td key={ci} className={['px-3 py-2 align-top text-slate-700 dark:text-slate-300', ci === 0 ? 'font-semibold text-slate-900 dark:text-slate-100' : ''].join(' ')}>
                        <Rich text={cell} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )

    case 'steps':
      return (
        <div>
          <BlockTitle text={block.title} theme={theme} />
          <ol className="space-y-2.5">
            {block.items.map((item, i) => (
              <li key={i} className="flex gap-3">
                <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white ${t.solid}`}>{i + 1}</span>
                <span className="pt-0.5 leading-relaxed text-slate-700 dark:text-slate-300">
                  <Rich text={item} />
                </span>
              </li>
            ))}
          </ol>
        </div>
      )

    case 'timeline':
      return (
        <div>
          <BlockTitle text={block.title} theme={theme} />
          <ol className="relative ml-2 space-y-3 border-l-2 border-slate-200 pl-5 dark:border-slate-700">
            {block.items.map(([when, what], i) => (
              <li key={i} className="relative">
                <span className={`absolute -left-[1.7rem] top-1.5 h-3 w-3 rounded-full ring-4 ring-[#f4f5fb] dark:ring-[#0f1117] ${t.solid}`} aria-hidden="true" />
                <div className={`text-sm font-extrabold ${t.text}`}>{when}</div>
                <div className="leading-relaxed text-slate-700 dark:text-slate-300">
                  <Rich text={what} />
                </div>
              </li>
            ))}
          </ol>
        </div>
      )

    case 'callout': {
      const c = CALLOUTS[block.kind]
      return (
        <div className={`rounded-2xl p-4 ring-1 ${c.box}`}>
          <div className={`flex items-center gap-2 text-sm font-bold ${c.head}`}>
            <span aria-hidden="true">{c.icon}</span>
            {block.title ?? c.title}
          </div>
          <p className="mt-1 leading-relaxed text-slate-700 dark:text-slate-300">
            <Rich text={block.text} />
          </p>
        </div>
      )
    }

    case 'figure':
      return <FigureView kind={block.kind} title={block.title} items={block.items} theme={theme} />

    case 'mnemonic':
      return (
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-violet-50 via-fuchsia-50 to-amber-50 p-5 ring-1 ring-fuchsia-200 dark:from-violet-500/10 dark:via-fuchsia-500/10 dark:to-amber-500/10 dark:ring-fuchsia-500/30">
          <div className="absolute -right-3 -top-3 text-6xl opacity-10" aria-hidden="true">
            🧠
          </div>
          <div className="relative">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-fuchsia-700 dark:text-fuchsia-300">
              <span aria-hidden="true">🧠</span> Memory trick · {block.title}
            </div>
            <p className="mt-2 text-xl font-extrabold leading-snug text-slate-900 dark:text-slate-100 sm:text-2xl">{block.phrase}</p>
            {block.letters && (
              <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                {block.letters.map(([key, meaning], i) => (
                  <li key={i} className="flex items-center gap-2.5 rounded-xl bg-white/80 px-3 py-2 ring-1 ring-fuchsia-100 dark:bg-slate-800/80 dark:ring-slate-700">
                    <span className="flex h-8 min-w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-fuchsia-500 to-violet-600 px-1.5 text-sm font-extrabold text-white">{key}</span>
                    <span className="text-sm leading-snug text-slate-700 dark:text-slate-300">
                      <Rich text={meaning} />
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {block.note && (
              <p className="mt-3 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                <Rich text={block.note} />
              </p>
            )}
          </div>
        </div>
      )
  }
}
