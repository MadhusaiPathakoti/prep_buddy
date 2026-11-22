import { createContext, useContext } from 'react'
import type { BookConfig } from './books'

/** The book (Computer, Banking …) the current /general-awareness/:book/… page belongs to. */
export const BookContext = createContext<BookConfig | null>(null)

export function useBook(): BookConfig {
  const book = useContext(BookContext)
  if (!book) throw new Error('useBook must be used under a BookGate route')
  return book
}
