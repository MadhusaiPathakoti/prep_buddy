import { useEffect } from 'react'
import { useAuth } from '../lib/authContext'
import { syncUser } from '../lib/qbank/sync'

/** Renders nothing: keeps the question bank's favourites and recent plays in step with the server while someone is signed in. */
export default function QbankSync() {
  const { user, loading } = useAuth()
  const uid = user?.uid ?? null

  useEffect(() => {
    if (loading) return
    void syncUser(uid)
  }, [uid, loading])

  return null
}
