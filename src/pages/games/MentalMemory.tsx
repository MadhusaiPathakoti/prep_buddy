import MathSetup from '../../components/MathSetup'
import { generateMemoryQuestions, type FlashDifficulty } from '../../lib/flashGames'

const VIEW: Record<string, number> = { relaxed: 3500, normal: 2400, quick: 1600, glance: 1000 }

export default function MentalMemory() {
  return (
    <MathSetup
      kind="flash"
      gameId="mental-memory"
      title="Mental Memory"
      intro={
        <p>
          Two or three numbers appear together, then vanish — and only then are you told what to do with them (add, subtract, multiply…). It
          trains the habit of holding numbers in mind and calculating without looking at them.
        </p>
      }
      learn={
        <>
          <p>Read the numbers aloud in your head straight away; don't try to "photograph" them. Chunk long ones: 647 → "six-forty-seven".</p>
          <p>Hold the numbers as you would hold a phone number, then do the sum in your head when the question arrives.</p>
          <p>Quick view times are for later — begin on Relaxed and cut the time as your accuracy climbs.</p>
        </>
      }
      groups={[
        {
          key: 'difficulty',
          title: 'Difficulty',
          defaultId: 'medium',
          options: [
            { id: 'easy', label: 'Easy', description: 'two 2-digit numbers: sum or difference' },
            { id: 'medium', label: 'Medium', description: '3-digit sums, differences, 2-digit × 1-digit' },
            { id: 'hard', label: 'Hard', description: 'three numbers, or 2-digit × 2-digit' },
            { id: 'mixed', label: 'Mixed', description: 'a blend of all three' },
          ],
        },
        {
          key: 'speed',
          title: 'How long the numbers show',
          defaultId: 'normal',
          options: [
            { id: 'relaxed', label: 'Relaxed', description: '3.5 s' },
            { id: 'normal', label: 'Normal', description: '2.4 s' },
            { id: 'quick', label: 'Quick', description: '1.6 s' },
            { id: 'glance', label: 'Glance', description: '1 s' },
          ],
        },
      ]}
      counts={[5, 10, 15, 20]}
      defaultCount={10}
      generate={(c, count) => generateMemoryQuestions(c.difficulty as FlashDifficulty, count)}
      frameMs={(c) => VIEW[c.speed] ?? 2400}
    />
  )
}
