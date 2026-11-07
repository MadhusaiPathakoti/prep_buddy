import MathSetup from '../../components/MathSetup'
import { generateMissingDigitQuestions, type MissingDigitDifficulty, type MissingDigitMode } from '../../lib/missingDigit'
import { validateInteger } from '../../lib/validators'

export default function MissingDigit() {
  return (
    <MathSetup
      kind="typed"
      gameId="missing-digit"
      title="Missing Digit"
      intro={
        <p>
          One digit is hidden (□). Type the single digit that makes the statement true — without carrying out the whole calculation. Every
          puzzle has exactly one answer.
        </p>
      }
      learn={
        <>
          <p>
            <strong>Casting out nines:</strong> a number leaves the same remainder mod 9 as its digit sum. For a × b = c, (digit sum of a) × (digit sum of b)
            must match the digit sum of c.
          </p>
          <p>
            <strong>Last digit:</strong> the last digit of a product depends only on the last digits: 7 × 8 = 56 → ends in 6.
          </p>
          <p>
            <strong>Sums:</strong> the units column adds on its own, so check it first.
          </p>
          <p>
            <strong>Divisibility by 11:</strong> (sum of digits in odd places) − (sum in even places) must be 0 or a multiple of 11.
          </p>
        </>
      }
      groups={[
        {
          key: 'difficulty',
          title: 'Difficulty',
          defaultId: 'medium',
          options: [
            { id: 'easy', label: 'Easy', description: '2-digit × 1-digit, 3 two-digit addends' },
            { id: 'medium', label: 'Medium', description: '2-digit × 2-digit, 3 three-digit addends' },
            { id: 'hard', label: 'Hard', description: '3-digit × 2-digit, 4 four-digit addends, divisibility by 7/11/13' },
            { id: 'mixed', label: 'Mixed', description: 'a blend of all three' },
          ],
        },
        {
          key: 'mode',
          title: 'Question type',
          defaultId: 'mixed',
          options: [
            { id: 'mixed', label: 'All types' },
            { id: 'product', label: 'Products' },
            { id: 'sum', label: 'Sums' },
            { id: 'divisible', label: 'Divisibility' },
          ],
        },
      ]}
      generate={(c, count) => generateMissingDigitQuestions(c.difficulty as MissingDigitDifficulty, c.mode as MissingDigitMode, count)}
      validate={validateInteger}
      promptSuffix=""
      answerHint="□"
    />
  )
}
