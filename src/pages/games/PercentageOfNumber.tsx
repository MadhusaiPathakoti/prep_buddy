import MathSetup from '../../components/MathSetup'
import { generatePercentageQuestions, type PercentDifficulty, type PercentMode } from '../../lib/percentageOfNumber'
import { validateExact } from '../../lib/validators'

export default function PercentageOfNumber() {
  return (
    <MathSetup
      kind="typed"
      gameId="percentage-of-number"
      title="Percentage of a Number"
      intro={
        <p>
          Find a percentage of a number, what percentage one number is of another, or the whole when you are given a part. Decimals are
          allowed (type 12.5); every answer is exact.
        </p>
      }
      learn={
        <>
          <p>
            <strong>Fractions first:</strong> 12.5% = 1/8, 37.5% = 3/8, 25% = 1/4, 20% = 1/5, 6.25% = 1/16. So 12.5% of 480 = 480 ÷ 8 = 60.
          </p>
          <p>
            <strong>Build from 10% and 1%:</strong> 18% of 450 → 10% = 45, 1% = 4.5 → 45 + 8 × 4.5 = 81.
          </p>
          <p>
            <strong>Flip it:</strong> 16% of 25 = 25% of 16 = 4 — pick the easier way round.
          </p>
          <p>
            <strong>What %:</strong> 81 out of 450 → 81/450 = 9/50 = 18%.
          </p>
        </>
      }
      groups={[
        {
          key: 'difficulty',
          title: 'Difficulty',
          defaultId: 'medium',
          options: [
            { id: 'easy', label: 'Easy', description: '10%, 20%, 25%, 50% … on friendly numbers' },
            { id: 'medium', label: 'Medium', description: 'multiples of 5, 12.5%, 37.5%, 8%, 12% …' },
            { id: 'hard', label: 'Hard', description: 'any % from 1 to 99 on 3-4 digit numbers' },
            { id: 'mixed', label: 'Mixed', description: 'a blend of all three' },
          ],
        },
        {
          key: 'mode',
          title: 'Question type',
          defaultId: 'mixed',
          options: [
            { id: 'mixed', label: 'All types' },
            { id: 'of', label: 'x% of n' },
            { id: 'percent', label: 'What % is it?' },
            { id: 'whole', label: 'Find the whole' },
          ],
        },
      ]}
      generate={(c, count) => generatePercentageQuestions(c.difficulty as PercentDifficulty, c.mode as PercentMode, count)}
      validate={validateExact}
      inputMode="decimal"
    />
  )
}
