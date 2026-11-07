import MathSetup from '../../components/MathSetup'
import { generateSuccessiveQuestions, type SuccessiveDifficulty, type SuccessiveMode } from '../../lib/successivePercent'
import { validateExact } from '../../lib/validators'

export default function SuccessivePercent() {
  return (
    <MathSetup
      kind="typed"
      gameId="successive-percent"
      title="Successive % & Discount"
      intro={
        <p>
          Chain percentage changes and discounts without ever writing them down. Type the number only (no sign or % symbol); the review
          tells you whether it was an increase or a decrease and shows the multipliers.
        </p>
      }
      learn={
        <>
          <p>
            <strong>Use multipliers:</strong> +20% = ×1.20, −10% = ×0.90. Chain them: 1.20 × 0.90 = 1.08 → net +8%.
          </p>
          <p>
            <strong>Two changes a and b:</strong> net = a + b + ab/100. Discounts of 20% and 10%: 20 + 10 − 200/100 = 28%.
          </p>
          <p>
            <strong>Marked-up price with discount:</strong> take cost = 100. Marked 40% up = 140; 25% off = 105 → 5% profit.
          </p>
        </>
      }
      groups={[
        {
          key: 'difficulty',
          title: 'Difficulty',
          defaultId: 'medium',
          options: [
            { id: 'easy', label: 'Easy', description: 'two changes, 10/20/25/50%' },
            { id: 'medium', label: 'Medium', description: 'two changes, multiples of 5 plus 8%, 12%' },
            { id: 'hard', label: 'Hard', description: 'three changes, awkward percentages' },
            { id: 'mixed', label: 'Mixed', description: 'a blend of all three' },
          ],
        },
        {
          key: 'mode',
          title: 'Question type',
          defaultId: 'mixed',
          options: [
            { id: 'mixed', label: 'All types' },
            { id: 'net', label: 'Net % change' },
            { id: 'discount', label: 'Single discount' },
            { id: 'price', label: 'Final price' },
            { id: 'profit', label: 'Profit after discount' },
          ],
        },
      ]}
      generate={(c, count) => generateSuccessiveQuestions(c.difficulty as SuccessiveDifficulty, c.mode as SuccessiveMode, count)}
      validate={validateExact}
      inputMode="decimal"
    />
  )
}
