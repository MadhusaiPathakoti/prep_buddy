import ReasoningSetup from '../../components/ReasoningSetup'
import { generateBloodRelationQuestions, type BloodDifficulty, type BloodType } from '../../lib/bloodRelations'

export default function BloodRelations() {
  return (
    <ReasoningSetup
      gameId="blood-relations"
      title="Blood Relations"
      intro={
        <p>
          Work out how two people are related. Some questions are single statements ("Pointing to a woman, Meera said, 'She is
          the daughter of the wife of my father's brother'"), some use <em>coded symbols</em> for relations, and some give a
          whole family to decode with several questions on it. Each answer comes with the chain of relations written out.
        </p>
      }
      groups={[
        {
          key: 'difficulty',
          title: 'Difficulty',
          defaultId: 'medium',
          options: [
            { id: 'easy', label: 'Easy', description: '2-3 links of blood relations · 6-member families' },
            { id: 'medium', label: 'Medium', description: '3-4 links with in-laws · 8-member families' },
            { id: 'hard', label: 'Hard', description: '4-5 links, spouses and tricks · 10-member families' },
            { id: 'mixed', label: 'Mixed', description: 'a blend of all three' },
          ],
        },
        {
          key: 'type',
          title: 'Question type',
          defaultId: 'mixed',
          options: [
            { id: 'mixed', label: 'All types' },
            { id: 'pointing', label: 'Pointing statements' },
            { id: 'coded', label: 'Coded relations' },
            { id: 'family', label: 'Family sets' },
          ],
        },
      ]}
      generate={(c, count) => generateBloodRelationQuestions(c.difficulty as BloodDifficulty, c.type as BloodType, count)}
    />
  )
}
