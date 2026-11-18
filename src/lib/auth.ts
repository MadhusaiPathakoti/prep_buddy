import type { Auth, User } from 'firebase/auth'

/**
 * Sign-in with Google or email + password, through Firebase Authentication. The auth code is loaded
 * on demand (a separate chunk) so it never delays the first paint, and none of this touches
 * Firestore: browsing and playing stay open to everyone; an account is only needed for adding
 * questions and for syncing favourites.
 */

type AuthModule = typeof import('firebase/auth')

/** The few fields the UI needs — components never hold Firebase's own `User` object. */
export interface AuthUser {
  uid: string
  email: string | null
  displayName: string | null
  /** Google accounts are always verified; email + password accounts must click the emailed link. */
  emailVerified: boolean
  /** True for email + password accounts (the ones that can need verification). */
  usesPassword: boolean
}

export const MIN_PASSWORD_LENGTH = 8

let loading: Promise<{ auth: Auth; mod: AuthModule }> | null = null

function loadAuth() {
  if (!loading) {
    loading = Promise.all([import('firebase/auth'), import('./firebaseApp')]).then(([mod, { app }]) => ({ mod, auth: mod.getAuth(app) }))
    loading.catch(() => {
      loading = null // allow a retry (e.g. the network was down the first time)
    })
  }
  return loading
}

function toAuthUser(user: User): AuthUser {
  return {
    uid: user.uid,
    email: user.email,
    displayName: user.displayName,
    emailVerified: user.emailVerified,
    usesPassword: user.providerData.some((p) => p.providerId === 'password'),
  }
}

/** Calls `onChange` with the current user (or null) now and on every sign-in / sign-out. Returns an unsubscribe function. */
export function subscribeToAuth(onChange: (user: AuthUser | null) => void): () => void {
  let cancelled = false
  let stop: (() => void) | null = null
  loadAuth()
    .then(({ auth, mod }) => {
      if (cancelled) return
      stop = mod.onAuthStateChanged(auth, (user) => onChange(user ? toAuthUser(user) : null))
    })
    .catch(() => {
      if (!cancelled) onChange(null) // auth could not load: behave as signed out rather than hang
    })
  return () => {
    cancelled = true
    stop?.()
  }
}

export async function signInWithGoogle(): Promise<void> {
  const { auth, mod } = await loadAuth()
  const provider = new mod.GoogleAuthProvider()
  provider.setCustomParameters({ prompt: 'select_account' })
  await mod.signInWithPopup(auth, provider)
}

export async function signInWithEmail(email: string, password: string): Promise<void> {
  const { auth, mod } = await loadAuth()
  await mod.signInWithEmailAndPassword(auth, email.trim(), password)
}

/** Creates the account and emails a verification link. The user is signed in straight away. */
export async function signUpWithEmail(email: string, password: string): Promise<void> {
  const { auth, mod } = await loadAuth()
  const credential = await mod.createUserWithEmailAndPassword(auth, email.trim(), password)
  try {
    await mod.sendEmailVerification(credential.user)
  } catch {
    // the account exists; the user can use "Resend email" from the account view
  }
}

export async function sendPasswordReset(email: string): Promise<void> {
  const { auth, mod } = await loadAuth()
  await mod.sendPasswordResetEmail(auth, email.trim())
}

export async function resendVerificationEmail(): Promise<void> {
  const { auth, mod } = await loadAuth()
  if (auth.currentUser) await mod.sendEmailVerification(auth.currentUser)
}

/** Re-reads the account from Firebase (e.g. after the user clicked the verification link) and refreshes the ID token. */
export async function reloadUser(): Promise<AuthUser | null> {
  const { auth } = await loadAuth()
  const user = auth.currentUser
  if (!user) return null
  await user.reload()
  await user.getIdToken(true)
  return toAuthUser(user)
}

export async function signOutUser(): Promise<void> {
  const { auth, mod } = await loadAuth()
  await mod.signOut(auth)
}

/** A fresh ID token for calling our own API (it proves who the user is to the server). Null when signed out. */
export async function getIdToken(): Promise<string | null> {
  const { auth } = await loadAuth()
  return auth.currentUser ? auth.currentUser.getIdToken() : null
}

/** Plain-English text for a Firebase auth error, or null when nothing should be shown (the user just closed the popup). */
export function authErrorMessage(err: unknown): string | null {
  const code = typeof err === 'object' && err && 'code' in err ? String((err as { code: unknown }).code) : ''
  switch (code) {
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
      return null
    case 'auth/popup-blocked':
      return 'Your browser blocked the sign-in window. Allow pop-ups for this site and try again.'
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
    case 'auth/invalid-login-credentials':
      return 'Wrong email or password.'
    case 'auth/invalid-email':
      return 'That email address does not look right.'
    case 'auth/email-already-in-use':
      return 'An account with this email already exists. Sign in instead, or reset your password.'
    case 'auth/weak-password':
      return `Choose a stronger password (at least ${MIN_PASSWORD_LENGTH} characters).`
    case 'auth/too-many-requests':
      return 'Too many attempts. Wait a few minutes and try again.'
    case 'auth/network-request-failed':
      return 'Network problem. Check your connection and try again.'
    case 'auth/unauthorized-domain':
      return 'Sign-in is not enabled for this web address yet.'
    case 'auth/operation-not-allowed':
      return 'This sign-in method is not enabled yet.'
    default:
      return 'Could not sign in. Please try again.'
  }
}
