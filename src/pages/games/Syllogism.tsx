import ReasoningSetup from '../../components/ReasoningSetup'
import { generateSyllogismQuestions, type SyllogismDifficulty, type SyllogismFormat } from '../../lib/syllogism'

export default function Syllogism() {
  return (
    <ReasoningSetup
      gameId="syllogism"
      title="Syllogism"
      intro={
        <p>
          Judge which conclusions follow from the statements. A conclusion follows only if it holds in <em>every</em>{' '}
          possible Venn diagram; a <em>possibility</em> needs just one. As in the exam, every term mentioned is assumed to
          have members, and <em>Only a few</em> means "some are, and some are not". Every verdict is worked out in the
          review afterward, with the chain of statements or a counter-diagram.
        </p>
      }
      groups={[
        {
          key: 'difficulty',
          title: 'Difficulty',
          defaultId: 'medium',
          options: [
            { id: 'easy', label: 'Easy', description: '2 statements, 3 terms · Prelims style' },
            { id: 'medium', label: 'Medium', description: '3 statements, 4 terms · adds possibilities' },
            { id: 'hard', label: 'Hard', description: '4 statements, up to 5 terms · "Only a few", 3-step chains' },
            { id: 'mixed', label: 'Mixed', description: 'a blend of all three' },
          ],
        },
        {
          key: 'format',
          title: 'Question type',
          defaultId: 'mixed',
          options: [
            { id: 'mixed', label: 'Both' },
            { id: 'conclusions', label: 'Conclusions I & II' },
            { id: 'which-follows', label: 'Which follows?' },
          ],
        },
      ]}
      generate={(c, count) => generateSyllogismQuestions(c.difficulty as SyllogismDifficulty, c.format as SyllogismFormat, count)}
    />
  )
}
