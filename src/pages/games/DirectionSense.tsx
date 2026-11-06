import ReasoningSetup from '../../components/ReasoningSetup'
import { generateDirectionSenseQuestions, type DirectionDifficulty, type DirectionType } from '../../lib/directionSense'

export default function DirectionSense() {
  return (
    <ReasoningSetup
      gameId="direction-sense"
      title="Direction Sense"
      intro={
        <p>
          Follow a walk, work out where the person ends up and which way they face. Harder levels add 45° and 135° turns, U-turns,
          two people walking from one point, and points described only by their positions. Distances use whole numbers (3-4-5 style
          triangles) or k√2; "North-East" means both north and east of the start, as in the exam. Every answer has the leg-by-leg
          positions written out.
        </p>
      }
      groups={[
        {
          key: 'difficulty',
          title: 'Difficulty',
          defaultId: 'medium',
          options: [
            { id: 'easy', label: 'Easy', description: '2-3 legs, left/right turns' },
            { id: 'medium', label: 'Medium', description: '3-4 legs, U-turns, two-person and point puzzles' },
            { id: 'hard', label: 'Hard', description: '5-6 legs, 45°/135° turns, k√2 distances' },
            { id: 'mixed', label: 'Mixed', description: 'a blend of all three' },
          ],
        },
        {
          key: 'type',
          title: 'Question type',
          defaultId: 'mixed',
          options: [
            { id: 'mixed', label: 'All types' },
            { id: 'walk', label: 'One person walking' },
            { id: 'relative', label: 'Two people / points' },
          ],
        },
      ]}
      generate={(c, count) => generateDirectionSenseQuestions(c.difficulty as DirectionDifficulty, c.type as DirectionType, count)}
    />
  )
}
