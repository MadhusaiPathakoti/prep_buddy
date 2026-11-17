import MathSetup from '../../components/MathSetup'
import { generateQuantityQuestions, type QuantityDifficulty } from '../../lib/quantityComparison'

export default function QuantityComparison() {
  return (
    <MathSetup
      kind="mcq"
      gameId="quantity-comparison"
      title="Quantity Comparison"
      intro={
        <p>
          Two quantities, I and II: work out both and pick the relation, exactly as in the Prelims and Mains. Quantities are values of expressions, roots of
          equations (x where 5x + 13 = 43) or both. Options B and D come up when the quantities can touch, such as the roots of a quadratic. The review shows how
          each quantity was worked out.
        </p>
      }
      learn={
        <>
          <p>
            <strong>Single values:</strong> I = 30 and II = 36 → Quantity II &gt; Quantity I (option C). Equal values → option E.
          </p>
          <p>
            <strong>Equations:</strong> 5x + 13 = 43 → 5x = 30 → x = 6; 4y + 13 = 49 → 4y = 36 → y = 9. So I &lt; II.
          </p>
          <p>
            <strong>Quadratics (two roots each):</strong> compare every root of I with every root of II. All of I bigger → A. All of I smaller → C. If the
            ranges only touch at one value → B or D. If they overlap, or both are always equal → E.
          </p>
          <p>
            <strong>Surds:</strong> 3√5 against 2√11: square both, 9 × 5 = 45 and 4 × 11 = 44, so 3√5 is larger.
          </p>
          <p>
            <strong>&ldquo;x is an integer such that …&rdquo;:</strong> list every allowed integer, put each into both quantities and see whether the same
            relation holds every time. If it flips even once, the answer is E. If one quantity is never below the other and they match for some x, it is B or D.
          </p>
        </>
      }
      groups={[
        {
          key: 'difficulty',
          title: 'Difficulty',
          defaultId: 'medium',
          options: [
            { id: 'easy', label: 'Easy', description: 'simple equations (5x + 13 = 43), percentages, averages, quick arithmetic' },
            { id: 'medium', label: 'Medium', description: 'two-sided equations, quadratic roots, interest, speed, profit, successive %' },
            { id: 'hard', label: 'Hard', description: 'fractional-root quadratics, integer-range x, simultaneous equations, surds, CI, work' },
            { id: 'mixed', label: 'Mixed', description: 'a blend of all three' },
          ],
        },
      ]}
      generate={(c, count) => generateQuantityQuestions(c.difficulty as QuantityDifficulty, count)}
    />
  )
}
