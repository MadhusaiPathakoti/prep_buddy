import { Link, Outlet } from 'react-router-dom'
import ThemeToggle from './ThemeToggle'

export default function Layout() {
  return (
    <div className="flex min-h-screen flex-col bg-[#f4f5fb] dark:bg-[#0f1117]">
      <header className="border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-2 px-4 py-4">
          <Link to="/" className="flex items-center gap-2 text-lg font-extrabold text-slate-900 dark:text-slate-100">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-white">P</span>
            PrepBuddy
          </Link>
          <ThemeToggle />
        </div>
      </header>

      <main className="flex-1">
        <Outlet />
      </main>

      <footer className="border-t border-slate-200 bg-white py-4 text-center text-xs text-slate-400 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-500">
        Built for competitive exam aspirants · practice a little, every day
      </footer>
    </div>
  )
}
