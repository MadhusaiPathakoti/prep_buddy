import type { ReactNode } from 'react'

/** Bolds the word (and forms like "abashed" / "abating") wherever it appears in an example sentence. */
export function highlight(sentence: string, word: string): ReactNode {
  const clean = word.replace(/[^\p{L}\s'-]/gu, '').trim()
  if (!clean) return sentence
  const stem = clean.length > 4 ? clean.slice(0, -1) : clean
  const escaped = stem.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const parts = sentence.split(new RegExp(`(${escaped}[\\p{L}'-]*)`, 'iu'))
  return parts.map((p, i) =>
    i % 2 === 1 ? (
      <strong key={i} className="font-semibold not-italic text-indigo-600 dark:text-indigo-400">
        {p}
      </strong>
    ) : (
      p
    ),
  )
}
