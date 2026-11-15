import { Radical } from './SurdText'
import { surdTable } from '../lib/surds'

const ROWS = surdTable(2, 20)

/** Reference table: √2 to √20 with their decimal values and simplified forms. */
export default function SurdTable() {
  return (
    <div>
      <div className="overflow-hidden rounded-2xl ring-1 ring-slate-200 dark:ring-slate-700">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 dark:bg-slate-900/40 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            <tr>
              <th className="px-4 py-2.5">Surd</th>
              <th className="px-4 py-2.5">Value</th>
              <th className="hidden px-4 py-2.5 sm:table-cell">More digits</th>
              <th className="px-4 py-2.5">Simplified</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-700 bg-white dark:bg-slate-800">
            {ROWS.map((row) => {
              const perfect = row.simplified !== null && !row.simplified.includes('√')
              return (
                <tr key={row.n} className={perfect ? 'bg-slate-50/70 dark:bg-slate-900/30' : ''}>
                  <td className="px-4 py-2 font-mono text-base font-semibold text-slate-900 dark:text-slate-100">
                    <Radical n={row.n} />
                  </td>
                  <td className="px-4 py-2 font-mono font-semibold tabular-nums text-indigo-600 dark:text-indigo-400">{row.value.toFixed(4)}</td>
                  <td className="hidden px-4 py-2 font-mono tabular-nums text-slate-400 dark:text-slate-500 sm:table-cell">{row.value.toFixed(8)}</td>
                  <td className="px-4 py-2 font-mono text-slate-600 dark:text-slate-300">
                    {row.simplified === null ? (
                      <span className="text-slate-300 dark:text-slate-600">—</span>
                    ) : perfect ? (
                      <span>
                        = {row.simplified} <span className="text-xs font-sans text-slate-400 dark:text-slate-500">(perfect square)</span>
                      </span>
                    ) : (
                      <span>
                        = {row.simplified.split('√')[0]}
                        <Radical n={Number(row.simplified.split('√')[1])} />
                      </span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
        Worth memorising: √2 ≈ 1.414, √3 ≈ 1.732, √5 ≈ 2.236, √6 ≈ 2.449, √7 ≈ 2.646. Others follow from these: √8 = 2√2 ≈ 2.828, √12 = 2√3 ≈ 3.464, √18 = 3√2 ≈ 4.243, √20 = 2√5 ≈ 4.472.
      </p>
    </div>
  )
}
