import ReasoningSetup from '../../components/ReasoningSetup'
import { generateAlphaSeriesQuestions, type AlphaDifficulty, type AlphaQType } from '../../lib/alphaNumSeries'

export default function AlphaNumSeries() {
  return (
    <ReasoningSetup
      gameId="alpha-num-series"
      title="Alphanumeric Series"
      counts={[5, 10, 15, 20]}
      defaultCount={10}
      intro={
        <p>
          Study one row of letters, numbers and symbols, then answer five questions on it — just like the exam. Find the element that is
          12th to the left of the 15th from the right, the one exactly between two others, count the even numbers that sit between a
          vowel and a consonant, or answer after the numbers are dropped or the row is reversed. Every element appears once, so each
          question has one answer, and every answer shows the position working.
        </p>
      }
      groups={[
        {
          key: 'difficulty',
          title: 'Difficulty',
          defaultId: 'medium',
          options: [
            { id: 'easy', label: 'Easy', description: '14-16 elements, simple counts' },
            { id: 'medium', label: 'Medium', description: '18-22 elements, "3rd symbol from the right"' },
            { id: 'hard', label: 'Hard', description: '26-30 elements, dropped / reversed rows' },
            { id: 'mixed', label: 'Mixed', description: 'a blend of all three' },
          ],
        },
        {
          key: 'type',
          title: 'Question type',
          defaultId: 'mixed',
          options: [
            { id: 'mixed', label: 'All types' },
            { id: 'count', label: 'How many (neighbours)' },
            { id: 'position', label: 'Which element (position)' },
            { id: 'between', label: 'Between two elements' },
            { id: 'modified', label: 'Dropped / reversed row' },
          ],
        },
      ]}
      generate={(c, count) => generateAlphaSeriesQuestions(c.difficulty as AlphaDifficulty, c.type as AlphaQType, count)}
    />
  )
}
