import { Fragment, useEffect, useState, type ReactNode } from 'react'
import { useAuth } from '../lib/authContext'
import { onUserDataApplied, syncUserData } from '../lib/sync/userDataSync'

/** Renders nothing: keeps favourites, learned words and game progress in step with the server while someone is signed in. */
export default function UserDataSync() {
  const { user, loading } = useAuth()
  const uid = user?.uid ?? null

  useEffect(() => {
    if (loading) return
    void syncUserData(uid)
  }, [uid, loading])

  return null
}

/** How long after the page opened a first sync may still refresh the screen on display (later, it could interrupt a quiz). */
const REFRESH_WINDOW_MS = 30_000
const openedAt = typeof performance !== 'undefined' ? performance.now() : 0

/**
 * Screens read their saved data once, when they open. When the first sync after opening the site brings in data from
 * another device, this re-creates the screen on display so it shows it, instead of waiting for the next visit.
 */
export function SyncRefresh({ children }: { children: ReactNode }) {
  const [version, setVersion] = useState(0)

  useEffect(
    () =>
      onUserDataApplied(({ initial, changed }) => {
        if (initial && changed > 0 && performance.now() - openedAt < REFRESH_WINDOW_MS) setVersion((v) => v + 1)
      }),
    [],
  )

  return <Fragment key={version}>{children}</Fragment>
}
