import MathSetup from '../../components/MathSetup'
import { generateSeriesWarmupQuestions, type SeriesWarmupDifficulty } from '../../lib/seriesWarmup'
import { validateInteger } from '../../lib/validators'

export default function SeriesWarmup() {
  return (
    <MathSetup
      kind="typed"
      gameId="series-warmup"
      title="Number Series Warm-up"
      intro={
        <p>
          Five terms are shown — type the next one. This is about instant recognition of the standard series (squares, cubes, n² ± n, primes,
          running totals), so the answer is a single number you type, not an option to pick. Each series has exactly one sensible next term.
        </p>
      }
      learn={
        <>
          <p>
            <strong>Know these by heart:</strong> squares to 20², cubes to 10³, powers of 2 (to 1024) and 3 (to 729), the first 15 primes.
          </p>
          <p>
            <strong>Neighbours of squares and cubes:</strong> 2, 5, 10, 17, 26 is k² + 1; 7, 26, 63, 124 is k³ − 1; 6, 12, 20, 30 is k² + k.
          </p>
          <p>
            <strong>Running totals:</strong> 1, 5, 14, 30, 55 add 1², 2², 3² … Check the differences: if they are a famous series (squares, primes), it is a running total.
          </p>
          <p>
            <strong>Two series mixed:</strong> if the terms zig-zag, read the odd positions and the even positions separately.
          </p>
        </>
      }
      groups={[
        {
          key: 'difficulty',
          title: 'Difficulty',
          defaultId: 'medium',
          options: [
            { id: 'easy', label: 'Easy', description: 'squares, cubes, primes, powers, n² ± n' },
            { id: 'medium', label: 'Medium', description: 'k³ ± k, running totals, factorials, ×m + c' },
            { id: 'hard', label: 'Hard', description: 'fourth powers, products of primes, two interleaved series' },
            { id: 'mixed', label: 'Mixed', description: 'a blend of all three' },
          ],
        },
      ]}
      generate={(c, count) => generateSeriesWarmupQuestions(c.difficulty as SeriesWarmupDifficulty, count)}
      validate={validateInteger}
      promptSuffix=", "
      answerHint="next?"
    />
  )
}
