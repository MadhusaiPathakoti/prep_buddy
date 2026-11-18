import { createContext, useContext } from 'react'
import type { AuthUser } from './auth'

export interface AuthState {
  /** The signed-in user, or null for a visitor. */
  user: AuthUser | null
  /** True until Firebase has reported whether someone is signed in (a moment after page load). */
  loading: boolean
  /** Re-reads the account from Firebase, e.g. after the user verified their email. */
  refresh: () => Promise<void>
}

export const AuthContext = createContext<AuthState>({ user: null, loading: true, refresh: async () => {} })

export function useAuth(): AuthState {
  return useContext(AuthContext)
}
