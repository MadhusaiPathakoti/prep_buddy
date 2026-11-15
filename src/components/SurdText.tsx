import type { Expr, Term } from '../lib/surds'

/** √ with a bar over the radicand, like it is written on paper: √18 with a line over the 18. */
export function Radical({ n }: { n: number }) {
  return (
    <span className="inline-flex items-start whitespace-nowrap">
      <span aria-hidden="true">√</span>
      <span className="border-t-2 border-current px-px leading-[1.15]">{n}</span>
    </span>
  )
}

function TermView({ term }: { term: Term }) {
  if (term.rad === 1) return <>{term.coef}</>
  return (
    <>
      {term.coef !== 1 && term.coef}
      <Radical n={term.rad} />
    </>
  )
}

/** An expression such as 3√2 or √2 + √3, rendered with proper radical bars. */
export function ExprView({ expr }: { expr: Expr }) {
  return (
    <span className="whitespace-nowrap">
      {expr.map((t, i) => (
        <span key={i}>
          {i === 0 ? (t.neg ? '−' : '') : <span className="px-1.5">{t.neg ? '−' : '+'}</span>}
          <TermView term={t} />
        </span>
      ))}
    </span>
  )
}
