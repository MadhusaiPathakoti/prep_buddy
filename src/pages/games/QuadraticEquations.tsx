import MathSetup from '../../components/MathSetup'
import { generateQuadraticQuestions, type QuadraticDifficulty } from '../../lib/quadratic'

export default function QuadraticEquations() {
  return (
    <MathSetup
      kind="mcq"
      gameId="quadratic-equations"
      title="Quadratic Equations"
      intro={
        <p>
          Two quadratic equations, one in x and one in y: decide the relation between x and y, exactly as in the Prelims. Wrong options
          eliminate themselves. The review shows the factorisation of each equation and the root sets.
        </p>
      }
      learn={
        <>
          <p>
            <strong>Factorise:</strong> x² − 7x + 12 = 0 → (x − 3)(x − 4) = 0 → x = 3, 4. Find two numbers with product +12 and sum −7.
          </p>
          <p>
            <strong>Compare the sets:</strong> if every x is bigger than every y → x &gt; y. If the smallest x equals the biggest y → x ≥ y.
            Overlapping ranges, or x and y both always equal → no relation.
          </p>
          <p>
            <strong>Rearranged forms:</strong> x² = 13x − 36 is x² − 13x + 36 = 0. Move everything to one side first.
          </p>
          <p>
            <strong>Leading coefficient &gt; 1:</strong> split the middle term: 6x² − 5x − 6 = (3x + 2)(2x − 3) → x = −2/3, 3/2.
          </p>
        </>
      }
      groups={[
        {
          key: 'difficulty',
          title: 'Difficulty',
          defaultId: 'medium',
          options: [
            { id: 'easy', label: 'Easy', description: 'x² − 5x + 6 = 0 style, integer roots to 9' },
            { id: 'medium', label: 'Medium', description: 'rearranged equations, roots to 14, repeated roots' },
            { id: 'hard', label: 'Hard', description: 'leading coefficient > 1, fractional roots' },
            { id: 'mixed', label: 'Mixed', description: 'a blend of all three' },
          ],
        },
      ]}
      generate={(c, count) => generateQuadraticQuestions(c.difficulty as QuadraticDifficulty, count)}
    />
  )
}
