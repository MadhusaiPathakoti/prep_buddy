import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { reloadUser, subscribeToAuth, type AuthUser } from '../lib/auth'
import { AuthContext } from '../lib/authContext'

/** Holds the signed-in user for the whole app. Browsing and playing never wait for it. */
export default function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    return subscribeToAuth((next) => {
      setUser(next)
      setLoading(false)
    })
  }, [])

  const refresh = useCallback(async () => {
    try {
      setUser(await reloadUser())
    } catch {
      /* keep the current state; the user can try again */
    }
  }, [])

  const value = useMemo(() => ({ user, loading, refresh }), [user, loading, refresh])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
