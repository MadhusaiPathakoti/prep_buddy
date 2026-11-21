import { Fragment } from 'react'

/** Renders a string where **double-asterisk** spans are bold. Nothing else is interpreted (so the text is always safe). */
export default function Rich({ text }: { text: string }) {
  const parts = text.split(/\*\*(.+?)\*\*/g)
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <strong key={i} className="font-semibold text-slate-900 dark:text-slate-100">
            {part}
          </strong>
        ) : (
          <Fragment key={i}>{part}</Fragment>
        ),
      )}
    </>
  )
}
