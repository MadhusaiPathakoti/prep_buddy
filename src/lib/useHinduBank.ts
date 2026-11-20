import { useEffect, useState } from 'react'
import { loadHinduBank, type HinduWord } from './hinduVocab'

/** Loads The Hindu Vocabulary bank; `bank` is null while loading and `error` is set if the chunk could not be fetched. */
export function useHinduBank(): { bank: HinduWord[] | null; error: boolean } {
  const [state, setState] = useState<{ bank: HinduWord[] | null; error: boolean }>({ bank: null, error: false })
  useEffect(() => {
    let cancelled = false
    loadHinduBank()
      .then((bank) => {
        if (!cancelled) setState({ bank, error: false })
      })
      .catch(() => {
        if (!cancelled) setState({ bank: null, error: true })
      })
    return () => {
      cancelled = true
    }
  }, [])
  return state
}
