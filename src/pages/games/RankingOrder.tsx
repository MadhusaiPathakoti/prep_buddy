import ReasoningSetup from '../../components/ReasoningSetup'
import { generateRankingQuestions, type RankingDifficulty, type RankingType } from '../../lib/rankingOrder'

export default function RankingOrder() {
  return (
    <ReasoningSetup
      gameId="ranking-order"
      title="Ranking & Order"
      intro={
        <p>
          Two kinds of puzzle. <em>Positions</em>: people in a row or students in a class, with clues like "12th from the left",
          "exactly 5 stand between", "after they swap…" — find the total, the gap, or a position. <em>Ordering</em>: several people
          compared on height, age, weight, marks or salary through mixed clues, followed by questions on the same set. Every puzzle has
          exactly one answer, and each clue is needed. The review shows the working.
        </p>
      }
      groups={[
        {
          key: 'difficulty',
          title: 'Difficulty',
          defaultId: 'medium',
          options: [
            { id: 'easy', label: 'Easy', description: 'total / gap formulas · 5 people to order' },
            { id: 'medium', label: 'Medium', description: 'swaps, rank gaps · 6 people with "exactly k between"' },
            { id: 'hard', label: 'Hard', description: 'joins, chains of gaps · 7-8 people, tight clues' },
            { id: 'mixed', label: 'Mixed', description: 'a blend of all three' },
          ],
        },
        {
          key: 'type',
          title: 'Question type',
          defaultId: 'mixed',
          options: [
            { id: 'mixed', label: 'Both' },
            { id: 'positions', label: 'Positions in a row / class' },
            { id: 'ordering', label: 'Ordering sets' },
          ],
        },
      ]}
      generate={(c, count) => generateRankingQuestions(c.difficulty as RankingDifficulty, c.type as RankingType, count)}
    />
  )
}
