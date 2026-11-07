import MathSetup from '../../components/MathSetup'
import { generateCompareFractionQuestions, type CompareDifficulty, type CompareMode } from '../../lib/compareFractions'

export default function CompareFractions() {
  return (
    <MathSetup
      kind="mcq"
      gameId="compare-fractions"
      title="Compare Fractions"
      intro={
        <p>
          Pick the largest or smallest fraction without turning each one into a decimal. Wrong answers eliminate themselves and you can
          try again; the review lists all the values and the quick test that decides it.
        </p>
      }
      learn={
        <>
          <p>
            <strong>Benchmark ½:</strong> p/q is above ½ when 2p &gt; q. 7/13 → 14 &gt; 13, so it is just above ½; 9/19 → 18 &lt; 19, just below.
          </p>
          <p>
            <strong>Distance from 1:</strong> for fractions near 1, compare (q − p)/q. 17/19 is 2/19 short, 23/26 is 3/26 short → 2/19 &lt; 3/26, so
            17/19 is larger.
          </p>
          <p>
            <strong>Cross-multiply the last two:</strong> a/b vs c/d → compare a × d with c × b.
          </p>
          <p>Same numerator? The smaller denominator wins. Same denominator? The bigger numerator wins.</p>
        </>
      }
      groups={[
        {
          key: 'difficulty',
          title: 'Difficulty',
          defaultId: 'medium',
          options: [
            { id: 'easy', label: 'Easy', description: '4 fractions, denominators up to 15, clear gaps' },
            { id: 'medium', label: 'Medium', description: '4 fractions, denominators up to 30, close values' },
            { id: 'hard', label: 'Hard', description: '5 fractions, denominators up to 60, very close' },
            { id: 'mixed', label: 'Mixed', description: 'a blend of all three' },
          ],
        },
        {
          key: 'mode',
          title: 'Find the',
          defaultId: 'mixed',
          options: [
            { id: 'mixed', label: 'Largest or smallest' },
            { id: 'largest', label: 'Largest' },
            { id: 'smallest', label: 'Smallest' },
          ],
        },
      ]}
      generate={(c, count) => generateCompareFractionQuestions(c.difficulty as CompareDifficulty, c.mode as CompareMode, count)}
    />
  )
}
