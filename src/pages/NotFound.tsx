import { Link } from 'react-router-dom'

export default function NotFound() {
  return (
    <div className="mx-auto max-w-md px-4 py-16 text-center">
      <p className="text-5xl">🧭</p>
      <h1 className="mt-4 text-2xl font-extrabold text-slate-900 dark:text-slate-100">Page not found</h1>
      <p className="mt-2 text-slate-500 dark:text-slate-400">That address doesn't lead anywhere. It may have moved.</p>
      <Link to="/" className="mt-6 inline-block rounded-xl bg-indigo-600 px-5 py-2.5 font-semibold text-white transition hover:bg-indigo-500">
        Back to all modules
      </Link>
    </div>
  )
}
