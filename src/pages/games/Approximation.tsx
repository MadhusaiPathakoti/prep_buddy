import MathSetup from '../../components/MathSetup'
import { generateApproximationQuestions, type ApproxDifficulty } from '../../lib/approximation'

export default function Approximation() {
  return (
    <MathSetup
      kind="mcq"
      gameId="approximation"
      title="Approximation"
      intro={
        <p>
          Every number is a slightly untidy version of an easy one (49.8 ≈ 50, 799.9 ≈ 800). Round them, calculate, and pick the closest
          option. The true value always lies within 1.5% of the rounded answer, and every wrong option is at least 6% away.
        </p>
      }
      learn={
        <>
          <p>
            <strong>49.8% of 799.9 + 24.9²</strong> → 50% of 800 + 25² = 400 + 625 = 1025.
          </p>
          <p>Round to the nearest number you can use quickly (25, 50, 75, 100, 800 …). Round percentages to 25, 50, 75 or 12.5 where they fit.</p>
          <p>
            Watch for roots: √624.5 ≈ √625 = 25. Squares of numbers ending in 5 are quick: 25² = 625, 35² = 1225, 45² = 2025.
          </p>
        </>
      }
      groups={[
        {
          key: 'difficulty',
          title: 'Difficulty',
          defaultId: 'medium',
          options: [
            { id: 'easy', label: 'Easy', description: '2 terms' },
            { id: 'medium', label: 'Medium', description: '3 terms with %, squares, roots' },
            { id: 'hard', label: 'Hard', description: '4 terms, mixed operations' },
            { id: 'mixed', label: 'Mixed', description: 'a blend of all three' },
          ],
        },
      ]}
      generate={(c, count) => generateApproximationQuestions(c.difficulty as ApproxDifficulty, count)}
    />
  )
}
