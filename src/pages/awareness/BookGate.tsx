import { Outlet, useParams } from 'react-router-dom'
import { getBook } from '../../lib/awareness/books'
import { BookContext } from '../../lib/awareness/bookContext'
import NotFound from '../NotFound'

/** Resolves /general-awareness/:book to a book (Computer, Banking …) and shares it with the pages below. */
export default function BookGate() {
  const { book: id } = useParams()
  const book = getBook(id)
  if (!book) return <NotFound />
  return (
    <BookContext.Provider value={book}>
      <Outlet />
    </BookContext.Provider>
  )
}
