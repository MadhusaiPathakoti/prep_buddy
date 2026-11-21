import type { ReactNode } from 'react'

export interface TipSection {
  heading: string
  points: ReactNode[]
}

interface TipsCardProps {
  title?: string
  /** A worked example shown above the tips. */
  example?: ReactNode
  sections: TipSection[]
}

/** "Tips to solve quickly" panel shown on a game's setup screen, before the first question. Collapsible, open by default. */
export default function TipsCard({ title = 'Tips to solve quickly', example, sections }: TipsCardProps) {
  return (
    <details open className="group mt-6 rounded-3xl bg-amber-50 dark:bg-amber-500/10 p-5 ring-1 ring-amber-200 dark:ring-amber-500/30">
      <summary className="flex cursor-pointer list-none items-center justify-between font-semibold text-amber-900 dark:text-amber-200">
        <span>💡 {title}</span>
        <span className="text-xs font-medium text-amber-700 dark:text-amber-300/80 group-open:hidden">Show</span>
        <span className="hidden text-xs font-medium text-amber-700 dark:text-amber-300/80 group-open:inline">Hide</span>
      </summary>
      {example && <div className="mt-4">{example}</div>}
      <div className="mt-4 space-y-4">
        {sections.map((s) => (
          <div key={s.heading}>
            <h3 className="text-sm font-bold text-amber-900 dark:text-amber-200">{s.heading}</h3>
            <ul className="mt-1.5 list-disc space-y-1 pl-5 text-sm leading-relaxed text-amber-950/80 dark:text-amber-100/80">
              {s.points.map((p, i) => (
                <li key={i}>{p}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </details>
  )
}
