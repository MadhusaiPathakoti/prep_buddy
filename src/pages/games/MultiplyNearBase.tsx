import MathSetup from '../../components/MathSetup'
import { generateNearBaseQuestions, type NearBaseDifficulty } from '../../lib/multiplyNearBase'
import { validateInteger } from '../../lib/validators'

export default function MultiplyNearBase() {
  return (
    <MathSetup
      kind="typed"
      gameId="multiply-near-base"
      title="Multiply Near a Base"
      intro={
        <p>
          When both numbers sit close to 100 (or 1000, or 50), you can multiply them in your head without carrying anything. Answer as fast
          as you can; every miss shows the working in the review.
        </p>
      }
      learn={
        <>
          <p>
            <strong>97 × 94</strong> with base 100: the gaps are −3 and −6.
          </p>
          <p>1. Cross-add: 97 − 6 = 91 (or 94 − 3 = 91). This is the "hundreds" part.</p>
          <p>2. Multiply the gaps: (−3) × (−6) = 18. This is the "last two digits".</p>
          <p>3. Join them: 91|18 → 9118. In general: (a + gap₂) × base + gap₁ × gap₂.</p>
          <p>
            Mixed sides work too: 104 × 97 → (104 − 3) × 100 + (4 × −3) = 10100 − 12 = 10088. Numbers equally far either side (97 × 103) are just
            base² − gap².
          </p>
        </>
      }
      groups={[
        {
          key: 'difficulty',
          title: 'Difficulty',
          defaultId: 'medium',
          options: [
            { id: 'easy', label: 'Easy', description: 'near 100, both on the same side, gaps up to 9' },
            { id: 'medium', label: 'Medium', description: 'near 100 either side, gaps up to 15, plus base 50' },
            { id: 'hard', label: 'Hard', description: 'near 1000, wide gaps, 200 / 500, equal-gap pairs' },
            { id: 'mixed', label: 'Mixed', description: 'a blend of all three' },
          ],
        },
      ]}
      generate={(c, count) => generateNearBaseQuestions(c.difficulty as NearBaseDifficulty, count)}
      validate={validateInteger}
    />
  )
}
