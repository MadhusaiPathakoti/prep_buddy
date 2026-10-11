import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

interface FeatureHubProps {
  backTo: string
  backLabel: string
  title: string
  description: string
  libraryTo: string
  libraryTitle: string
  libraryDescription: string
  quizTo: string
  quizTitle: string
  quizDescription: string
  children?: ReactNode
}

export default function FeatureHub({
  backTo,
  backLabel,
  title,
  description,
  libraryTo,
  libraryTitle,
  libraryDescription,
  quizTo,
  quizTitle,
  quizDescription,
  children,
}: FeatureHubProps) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <Link to={backTo} className="text-sm text-slate-400 dark:text-slate-500 hover:text-slate-600">
        ← {backLabel}
      </Link>
      <div className="mb-8 mt-2">
        <h1 className="text-3xl font-extrabold text-slate-900 dark:text-slate-100">{title}</h1>
        <p className="mt-2 text-slate-500 dark:text-slate-400">{description}</p>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <Link
          to={libraryTo}
          className="group rounded-3xl bg-white dark:bg-slate-800 p-6 shadow-sm ring-1 ring-slate-200 dark:ring-slate-700 transition hover:-translate-y-0.5 hover:shadow-md"
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-50 dark:bg-indigo-500/10 text-2xl">📖</div>
          <h2 className="mt-4 text-xl font-bold text-slate-900 dark:text-slate-100">{libraryTitle}</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{libraryDescription}</p>
          <div className="mt-4 text-sm font-semibold text-indigo-600 dark:text-indigo-400 group-hover:translate-x-0.5 transition">Browse →</div>
        </Link>

        <Link
          to={quizTo}
          className="group rounded-3xl bg-white dark:bg-slate-800 p-6 shadow-sm ring-1 ring-slate-200 dark:ring-slate-700 transition hover:-translate-y-0.5 hover:shadow-md"
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-50 dark:bg-indigo-500/10 text-2xl">🎯</div>
          <h2 className="mt-4 text-xl font-bold text-slate-900 dark:text-slate-100">{quizTitle}</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{quizDescription}</p>
          <div className="mt-4 text-sm font-semibold text-indigo-600 dark:text-indigo-400 group-hover:translate-x-0.5 transition">Play →</div>
        </Link>
      </div>

      {children}
    </div>
  )
}
