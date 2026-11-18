import { lazy, Suspense, useState } from 'react'
import { useAuth } from '../lib/authContext'

const AuthDialog = lazy(() => import('./AuthDialog'))

/** Header control: "Sign in" for visitors, an initial-in-a-circle for signed-in users. Opens the account window. */
export default function AuthButton() {
  const { user, loading } = useAuth()
  const [open, setOpen] = useState(false)

  const label = user ? (user.email ?? user.displayName ?? '?') : ''
  const initial = label.trim().charAt(0).toUpperCase() || '?'

  return (
    <>
      {loading ? (
        <span className="h-9 w-16" aria-hidden="true" />
      ) : user ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Your account"
          title={label}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-600 text-sm font-bold text-white transition hover:bg-indigo-700"
        >
          {initial}
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          Sign in
        </button>
      )}
      {open && (
        <Suspense fallback={null}>
          <AuthDialog onClose={() => setOpen(false)} />
        </Suspense>
      )}
    </>
  )
}
