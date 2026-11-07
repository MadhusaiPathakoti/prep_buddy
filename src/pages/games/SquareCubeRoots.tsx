import MathSetup from '../../components/MathSetup'
import { generateRootQuestions, type RootDifficulty, type RootKind } from '../../lib/rootsGame'
import { validateExact } from '../../lib/validators'

export default function SquareCubeRoots() {
  return (
    <MathSetup
      kind="typed"
      gameId="square-cube-roots"
      title="Square & Cube Roots"
      intro={
        <p>
          Find the root of a perfect square or cube without a calculator. Decimal versions appear from Medium (type 3.6, not 36). Every miss
          shows the last-digit and bracketing steps that get you there in seconds.
        </p>
      }
      learn={
        <>
          <p>
            <strong>√3844:</strong> it ends in 4, so the root ends in 2 or 8. 60² = 3600 ≤ 3844 &lt; 70² = 4900, so it starts with 6. To choose
            between 62 and 68, compare with 65² = 4225: 3844 is below it, so the answer is 62.
          </p>
          <p>
            <strong>Endings of squares:</strong> 1 → 1 or 9 · 4 → 2 or 8 · 5 → 5 · 6 → 4 or 6 · 9 → 3 or 7 · 0 → 0.
          </p>
          <p>
            <strong>∛17576:</strong> a cube's last digit gives the root's last digit (6 → 6, 8 → 2, 7 → 3, 3 → 7, 2 → 8, the rest stay).
            Drop the last 3 digits: 17 lies between 2³ = 8 and 3³ = 27, so the root starts with 2 → 26.
          </p>
          <p>
            <strong>Decimals:</strong> ignore the point, take the root, then give the root half as many decimals (square) or a third as many (cube).
          </p>
        </>
      }
      groups={[
        {
          key: 'difficulty',
          title: 'Difficulty',
          defaultId: 'medium',
          options: [
            { id: 'easy', label: 'Easy', description: '√ of 11²–35², ∛ of 3³–12³' },
            { id: 'medium', label: 'Medium', description: 'roots up to 99 and 30, plus decimals like √12.96' },
            { id: 'hard', label: 'Hard', description: '√ up to 170², ∛ up to 99³, 2-decimal and cube decimals' },
            { id: 'mixed', label: 'Mixed', description: 'a blend of all three' },
          ],
        },
        {
          key: 'kind',
          title: 'Roots',
          defaultId: 'mixed',
          options: [
            { id: 'mixed', label: 'All' },
            { id: 'square', label: 'Square roots' },
            { id: 'cube', label: 'Cube roots' },
            { id: 'decimal', label: 'Decimals' },
          ],
        },
      ]}
      generate={(c, count) => generateRootQuestions(c.difficulty as RootDifficulty, c.kind as RootKind, count)}
      validate={validateExact}
      inputMode="decimal"
    />
  )
}
