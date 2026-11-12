import { Navigate, useParams } from 'react-router-dom'
import MathSetup from '../../components/MathSetup'
import { VEDIC_IMPLS, generateVedicQuestions } from '../../lib/vedic'
import { vedicGameId, vedicMetaById } from '../../lib/vedicCatalog'
import { validateInteger } from '../../lib/validators'

export default function VedicPractice() {
  const { trick = '' } = useParams()
  const meta = vedicMetaById(trick)
  const impl = VEDIC_IMPLS[trick]
  if (!meta || !impl) return <Navigate to="/maths" replace />

  return (
    <MathSetup
      key={trick}
      kind="typed"
      gameId={vedicGameId(trick)}
      title={`${meta.title}: practice`}
      back={{ to: `/maths/vedic/${trick}`, label: 'Back to the lesson' }}
      intro={
        <p>
          Use the trick, not long multiplication. Answer as fast as you can; every miss shows the full working in the review. Need a refresher? Open the recipe below, or go back to the lesson.
        </p>
      }
      learn={
        <>
          <p className="font-mono">{meta.blurb}</p>
          <ol className="list-decimal space-y-1 pl-5">
            {impl.recipe.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ol>
        </>
      }
      groups={impl.groups}
      generate={(choice, count) => generateVedicQuestions(trick, choice, count)}
      validate={validateInteger}
    />
  )
}
