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
          Two quadratic equations, one in x and one in y: decide the relation between x and y, exactly as in the Prelims. Medium and hard sessions
          also include the surd type, like 5x² + 10√5x + 25 = 0. Wrong options eliminate themselves. The review shows the factorisation of each equation
          and the root sets.
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
          <p>
            <strong>Equations with a surd (medium and hard):</strong> 12x² − 36√3x − 360 = 0. Divide by 12: x² − 3√3x − 30 = 0. The roots are whole multiples of
            the surd, p√3 and q√3, so p + q = 3 and p × q × 3 = −30 → p × q = −10 → p = 5, q = −2. So x = 5√3, −2√3.
          </p>
          <p>
            <strong>Comparing surd roots:</strong> same surd (both √3)? Compare the multiples. Different surds (√2 against √3)? Bring the multiple under the root:
            4√2 = √32 and 3√3 = √27, so 4√2 is larger. Signs first: any negative root is below any positive one.
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
            { id: 'medium', label: 'Medium', description: 'rearranged equations, roots to 14, repeated roots; at least 40% have surd roots' },
            { id: 'hard', label: 'Hard', description: 'leading coefficient > 1, fractional roots; at least 40% have surd roots' },
            { id: 'mixed', label: 'Mixed', description: 'a blend of all three; surds on the medium and hard questions' },
          ],
        },
      ]}
      generate={(c, count) => generateQuadraticQuestions(c.difficulty as QuadraticDifficulty, count)}
    />
  )
}
