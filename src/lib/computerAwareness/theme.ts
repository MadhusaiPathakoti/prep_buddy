import type { CaTheme } from './types'

/**
 * Colour roles for each chapter theme. Class names are written out in full (never built from strings) so Tailwind's
 * scanner sees them; the hex pair is for SVG drawings (mind map) where a gradient or stroke needs a raw colour.
 */
export interface ThemeStyle {
  /** Gradient classes for hero banners. */
  gradient: string
  /** Soft tinted panel (icon tiles, callout-like boxes). */
  soft: string
  /** Readable text colour on the page background. */
  text: string
  /** Solid fill (progress bars, numbered badges). */
  solid: string
  /** Border / ring colour. */
  ring: string
  /** Header-strip colour for tables. */
  head: string
  hex: [string, string]
}

export const THEMES: Record<CaTheme, ThemeStyle> = {
  indigo: {
    gradient: 'from-indigo-500 via-indigo-600 to-violet-700',
    soft: 'bg-indigo-50 dark:bg-indigo-500/10',
    text: 'text-indigo-700 dark:text-indigo-300',
    solid: 'bg-indigo-600',
    ring: 'ring-indigo-200 dark:ring-indigo-500/30',
    head: 'bg-indigo-600 text-white',
    hex: ['#6366f1', '#7c3aed'],
  },
  sky: {
    gradient: 'from-sky-400 via-sky-500 to-blue-600',
    soft: 'bg-sky-50 dark:bg-sky-500/10',
    text: 'text-sky-700 dark:text-sky-300',
    solid: 'bg-sky-600',
    ring: 'ring-sky-200 dark:ring-sky-500/30',
    head: 'bg-sky-600 text-white',
    hex: ['#38bdf8', '#2563eb'],
  },
  emerald: {
    gradient: 'from-emerald-400 via-emerald-500 to-teal-600',
    soft: 'bg-emerald-50 dark:bg-emerald-500/10',
    text: 'text-emerald-700 dark:text-emerald-300',
    solid: 'bg-emerald-600',
    ring: 'ring-emerald-200 dark:ring-emerald-500/30',
    head: 'bg-emerald-600 text-white',
    hex: ['#34d399', '#0d9488'],
  },
  amber: {
    gradient: 'from-amber-400 via-orange-500 to-red-500',
    soft: 'bg-amber-50 dark:bg-amber-500/10',
    text: 'text-amber-700 dark:text-amber-300',
    solid: 'bg-amber-500',
    ring: 'ring-amber-200 dark:ring-amber-500/30',
    head: 'bg-amber-500 text-white',
    hex: ['#fbbf24', '#ef4444'],
  },
  rose: {
    gradient: 'from-rose-400 via-rose-500 to-pink-600',
    soft: 'bg-rose-50 dark:bg-rose-500/10',
    text: 'text-rose-700 dark:text-rose-300',
    solid: 'bg-rose-600',
    ring: 'ring-rose-200 dark:ring-rose-500/30',
    head: 'bg-rose-600 text-white',
    hex: ['#fb7185', '#db2777'],
  },
  violet: {
    gradient: 'from-violet-500 via-purple-600 to-fuchsia-600',
    soft: 'bg-violet-50 dark:bg-violet-500/10',
    text: 'text-violet-700 dark:text-violet-300',
    solid: 'bg-violet-600',
    ring: 'ring-violet-200 dark:ring-violet-500/30',
    head: 'bg-violet-600 text-white',
    hex: ['#8b5cf6', '#c026d3'],
  },
  teal: {
    gradient: 'from-teal-400 via-teal-500 to-cyan-600',
    soft: 'bg-teal-50 dark:bg-teal-500/10',
    text: 'text-teal-700 dark:text-teal-300',
    solid: 'bg-teal-600',
    ring: 'ring-teal-200 dark:ring-teal-500/30',
    head: 'bg-teal-600 text-white',
    hex: ['#2dd4bf', '#0891b2'],
  },
  orange: {
    gradient: 'from-orange-400 via-orange-500 to-red-600',
    soft: 'bg-orange-50 dark:bg-orange-500/10',
    text: 'text-orange-700 dark:text-orange-300',
    solid: 'bg-orange-600',
    ring: 'ring-orange-200 dark:ring-orange-500/30',
    head: 'bg-orange-600 text-white',
    hex: ['#fb923c', '#dc2626'],
  },
  fuchsia: {
    gradient: 'from-fuchsia-500 via-purple-600 to-indigo-700',
    soft: 'bg-fuchsia-50 dark:bg-fuchsia-500/10',
    text: 'text-fuchsia-700 dark:text-fuchsia-300',
    solid: 'bg-fuchsia-600',
    ring: 'ring-fuchsia-200 dark:ring-fuchsia-500/30',
    head: 'bg-fuchsia-600 text-white',
    hex: ['#d946ef', '#4338ca'],
  },
  cyan: {
    gradient: 'from-cyan-400 via-sky-500 to-indigo-600',
    soft: 'bg-cyan-50 dark:bg-cyan-500/10',
    text: 'text-cyan-700 dark:text-cyan-300',
    solid: 'bg-cyan-600',
    ring: 'ring-cyan-200 dark:ring-cyan-500/30',
    head: 'bg-cyan-600 text-white',
    hex: ['#22d3ee', '#4f46e5'],
  },
  lime: {
    gradient: 'from-lime-400 via-green-500 to-emerald-600',
    soft: 'bg-lime-50 dark:bg-lime-500/10',
    text: 'text-lime-700 dark:text-lime-300',
    solid: 'bg-lime-600',
    ring: 'ring-lime-200 dark:ring-lime-500/30',
    head: 'bg-lime-600 text-white',
    hex: ['#a3e635', '#059669'],
  },
  slate: {
    gradient: 'from-slate-500 via-slate-600 to-slate-800',
    soft: 'bg-slate-100 dark:bg-slate-500/15',
    text: 'text-slate-700 dark:text-slate-300',
    solid: 'bg-slate-600',
    ring: 'ring-slate-300 dark:ring-slate-500/40',
    head: 'bg-slate-600 text-white',
    hex: ['#64748b', '#1e293b'],
  },
}
