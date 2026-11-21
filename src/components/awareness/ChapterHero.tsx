import type { ReactNode } from 'react'
import { THEMES } from '../../lib/computerAwareness/theme'
import type { CaChapterMeta } from '../../lib/computerAwareness/types'

/** Decorative backdrop: a soft dotted grid, a few translucent rings and a circuit-trace squiggle. Pure SVG, no assets. */
export function HeroArt({ id }: { id: string }) {
  const uid = `ha-${id}`
  return (
    <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 600 240" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <pattern id={`${uid}-dots`} width="22" height="22" patternUnits="userSpaceOnUse">
          <circle cx="2" cy="2" r="1.4" fill="white" fillOpacity="0.28" />
        </pattern>
        <radialGradient id={`${uid}-glow`} cx="82%" cy="30%" r="55%">
          <stop offset="0%" stopColor="white" stopOpacity="0.38" />
          <stop offset="100%" stopColor="white" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="600" height="240" fill={`url(#${uid}-dots)`} />
      <rect width="600" height="240" fill={`url(#${uid}-glow)`} />
      <circle cx="505" cy="70" r="120" fill="none" stroke="white" strokeOpacity="0.2" strokeWidth="2" />
      <circle cx="505" cy="70" r="82" fill="none" stroke="white" strokeOpacity="0.25" strokeWidth="2" strokeDasharray="4 8" />
      <circle cx="505" cy="70" r="44" fill="white" fillOpacity="0.1" />
      <path d="M0 196 H90 L112 174 H210 L232 196 H330 L350 216 H470 L492 196 H600" fill="none" stroke="white" strokeOpacity="0.28" strokeWidth="2" strokeLinejoin="round" />
      <circle cx="90" cy="196" r="4" fill="white" fillOpacity="0.55" />
      <circle cx="210" cy="174" r="4" fill="white" fillOpacity="0.55" />
      <circle cx="330" cy="196" r="4" fill="white" fillOpacity="0.55" />
      <circle cx="470" cy="216" r="4" fill="white" fillOpacity="0.55" />
    </svg>
  )
}

interface ChapterHeroProps {
  chapter: CaChapterMeta
  /** Small line above the title, e.g. "Chapter 3". */
  eyebrow?: string
  children?: ReactNode
}

/** The big banner at the top of a chapter: themed gradient, artwork and the chapter's emoji in a frosted badge. */
export default function ChapterHero({ chapter, eyebrow, children }: ChapterHeroProps) {
  const t = THEMES[chapter.theme]
  return (
    <div className={`relative overflow-hidden rounded-3xl bg-gradient-to-br ${t.gradient} p-6 text-white shadow-lg sm:p-8`}>
      <HeroArt id={chapter.id} />
      <div className="relative flex items-center gap-5">
        <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-3xl bg-white/20 text-5xl shadow-inner ring-1 ring-white/40 backdrop-blur-sm sm:h-24 sm:w-24 sm:text-6xl">
          <span aria-hidden="true">{chapter.icon}</span>
        </div>
        <div className="min-w-0">
          <div className="text-xs font-bold uppercase tracking-widest text-white/80">{eyebrow ?? `Chapter ${chapter.number}`}</div>
          <h1 className="mt-1 text-2xl font-extrabold leading-tight sm:text-4xl">{chapter.title}</h1>
          <p className="mt-1 text-sm text-white/90 sm:text-base">{chapter.tagline}</p>
        </div>
      </div>
      {children && <div className="relative mt-5">{children}</div>}
    </div>
  )
}
