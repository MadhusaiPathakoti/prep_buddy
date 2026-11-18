import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useAuth } from '../lib/authContext'
import {
  MIN_PASSWORD_LENGTH,
  authErrorMessage,
  resendVerificationEmail,
  sendPasswordReset,
  signInWithEmail,
  signInWithGoogle,
  signOutUser,
  signUpWithEmail,
} from '../lib/auth'

type Mode = 'signin' | 'signup' | 'reset'

const inputClass =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:focus:ring-indigo-900'
const primaryButton =
  'w-full rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-60'
const secondaryButton =
  'rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-60 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800'

/**
 * The sign-in / create-account window (Google or email + password), which turns into a small
 * account view once someone is signed in. Visitors never have to open it just to browse or play.
 */
export default function AuthDialog({ onClose }: { onClose: () => void }) {
  const { user, refresh } = useAuth()
  const [mode, setMode] = useState<Mode>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const firstField = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    firstField.current?.focus()
  }, [mode, user])

  /** Runs one auth action with a busy flag and a friendly error message. Returns true on success. */
  async function run(action: () => Promise<void>): Promise<boolean> {
    setBusy(true)
    setError(null)
    try {
      await action()
      return true
    } catch (err) {
      setError(authErrorMessage(err))
      return false
    } finally {
      setBusy(false)
    }
  }

  async function onGoogle() {
    if (await run(signInWithGoogle)) onClose()
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setInfo(null)
    if (mode === 'signin') {
      if (await run(() => signInWithEmail(email, password))) onClose()
    } else if (mode === 'signup') {
      if (password.length < MIN_PASSWORD_LENGTH) {
        setError(`Choose a password of at least ${MIN_PASSWORD_LENGTH} characters.`)
        return
      }
      // stays open on success: the account view then shows the "check your email" note
      if (await run(() => signUpWithEmail(email, password))) setInfo(`We sent a verification link to ${email.trim()}. Open it to finish setting up your account.`)
    } else if (await run(() => sendPasswordReset(email))) {
      setInfo('If an account exists for that email, a reset link is on its way.')
    }
  }

  function switchMode(next: Mode) {
    setMode(next)
    setError(null)
    setInfo(null)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div role="dialog" aria-modal="true" aria-label={user ? 'Your account' : 'Sign in'} className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl dark:bg-slate-900">
        {user ? (
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">Your account</h2>
              <p className="mt-1 break-all text-sm text-slate-600 dark:text-slate-300">{user.email ?? user.displayName ?? 'Signed in'}</p>
            </div>
            {info && <p className="rounded-lg bg-indigo-50 px-3 py-2 text-sm text-indigo-800 dark:bg-indigo-950 dark:text-indigo-200">{info}</p>}
            {user.usesPassword && !user.emailVerified && (
              <div className="space-y-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">
                <p>Verify your email to add questions. Check your inbox (and spam) for the link.</p>
                <div className="flex flex-wrap gap-2">
                  <button type="button" disabled={busy} className={secondaryButton} onClick={() => run(resendVerificationEmail).then((ok) => ok && setInfo('Verification email sent again.'))}>
                    Resend email
                  </button>
                  <button type="button" disabled={busy} className={secondaryButton} onClick={() => run(refresh)}>
                    I&apos;ve verified it
                  </button>
                </div>
              </div>
            )}
            {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
            <p className="text-xs text-slate-500 dark:text-slate-400">Your favourites and recently played sync across devices once you are signed in.</p>
            <div className="flex justify-between gap-2">
              <button type="button" className={secondaryButton} onClick={onClose}>
                Close
              </button>
              <button type="button" disabled={busy} className={secondaryButton} onClick={() => run(signOutUser).then((ok) => ok && onClose())}>
                Sign out
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">{mode === 'signup' ? 'Create an account' : mode === 'reset' ? 'Reset your password' : 'Sign in'}</h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">You can browse and play without an account. Sign in to add questions and sync your favourites.</p>
            </div>

            {mode !== 'reset' && (
              <>
                <button type="button" disabled={busy} onClick={onGoogle} className={`${secondaryButton} flex w-full items-center justify-center gap-2 py-2`}>
                  <svg viewBox="0 0 48 48" className="h-4 w-4" aria-hidden="true">
                    <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.9 2.4 30.4 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z" />
                    <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4.1 7.1-10.1 7.1-17.5z" />
                    <path fill="#FBBC05" d="M10.5 28.7c-.5-1.4-.8-3-.8-4.7s.3-3.2.8-4.7l-7.9-6.1C.9 16.4 0 20.100 0 24s.9 7.600 2.600 10.800l7.900-6.100z" />
                    <path fill="#34A853" d="M24 48c6.5 0 11.900-2.100 15.900-5.800l-7.500-5.800c-2.100 1.400-4.800 2.300-8.400 2.300-6.300 0-11.600-4.100-13.500-9.800l-7.900 6.100C6.500 42.600 14.600 48 24 48z" />
                  </svg>
                  Continue with Google
                </button>
                <div className="flex items-center gap-3 text-xs text-slate-400">
                  <span className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
                  or use email
                  <span className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
                </div>
              </>
            )}

            <form onSubmit={onSubmit} className="space-y-3">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">
                Email
                <input ref={firstField} type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className={`${inputClass} mt-1`} />
              </label>
              {mode !== 'reset' && (
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">
                  Password
                  <input
                    type="password"
                    required
                    autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className={`${inputClass} mt-1`}
                  />
                </label>
              )}
              {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
              {info && <p className="text-sm text-emerald-700 dark:text-emerald-400">{info}</p>}
              <button type="submit" disabled={busy} className={primaryButton}>
                {busy ? 'Please wait…' : mode === 'signup' ? 'Create account' : mode === 'reset' ? 'Send reset link' : 'Sign in'}
              </button>
            </form>

            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              {mode === 'signin' ? (
                <>
                  <button type="button" className="text-indigo-600 hover:underline dark:text-indigo-400" onClick={() => switchMode('signup')}>
                    Create an account
                  </button>
                  <button type="button" className="text-slate-500 hover:underline dark:text-slate-400" onClick={() => switchMode('reset')}>
                    Forgot password?
                  </button>
                </>
              ) : (
                <button type="button" className="text-indigo-600 hover:underline dark:text-indigo-400" onClick={() => switchMode('signin')}>
                  Back to sign in
                </button>
              )}
              <button type="button" className="ml-auto text-slate-500 hover:underline dark:text-slate-400" onClick={onClose}>
                Not now
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
