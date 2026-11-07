import MathSetup from '../../components/MathSetup'
import { generateFlashChainQuestions, type FlashDifficulty } from '../../lib/flashGames'

const SPEEDS: Record<string, number> = { slow: 2000, normal: 1400, fast: 900, blitz: 600 }

export default function FlashChain() {
  return (
    <MathSetup
      kind="flash"
      gameId="flash-chain"
      title="Flash Chain"
      intro={
        <p>
          A number flashes, then operations appear one at a time — <span className="font-mono">12 → + 8 → × 3 → − 14</span>. Keep the running
          total in your head and type the final result. You can't look back, so a wrong answer is final.
        </p>
      }
      learn={
        <>
          <p>Don't rebuild the whole sum at the end — update one number as each step appears. Say it silently: "twelve… twenty… sixty… forty-six".</p>
          <p>Round-trip tricks help: × 3 then − 14 is easier as "60, then 46". Break + 8 into + 10 − 2 if that is quicker.</p>
          <p>Start on Slow, and only speed up once you are above 90% accuracy.</p>
        </>
      }
      groups={[
        {
          key: 'difficulty',
          title: 'Difficulty',
          defaultId: 'medium',
          options: [
            { id: 'easy', label: 'Easy', description: '3 steps, + and − only' },
            { id: 'medium', label: 'Medium', description: '4 steps with × and ÷' },
            { id: 'hard', label: 'Hard', description: '6 steps, bigger numbers' },
            { id: 'mixed', label: 'Mixed', description: 'a blend of all three' },
          ],
        },
        {
          key: 'speed',
          title: 'Flash speed',
          defaultId: 'normal',
          options: [
            { id: 'slow', label: 'Slow', description: '2 s' },
            { id: 'normal', label: 'Normal', description: '1.4 s' },
            { id: 'fast', label: 'Fast', description: '0.9 s' },
            { id: 'blitz', label: 'Blitz', description: '0.6 s' },
          ],
        },
      ]}
      counts={[5, 10, 15, 20]}
      defaultCount={10}
      generate={(c, count) => generateFlashChainQuestions(c.difficulty as FlashDifficulty, count)}
      frameMs={(c) => SPEEDS[c.speed] ?? 1400}
    />
  )
}
