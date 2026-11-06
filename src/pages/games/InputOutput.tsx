import ReasoningSetup from '../../components/ReasoningSetup'
import { generateInputOutputQuestions, type InputOutputDifficulty } from '../../lib/inputOutput'

export default function InputOutput() {
  return (
    <ReasoningSetup
      gameId="input-output"
      title="Input–Output"
      intro={
        <p>
          A machine rearranges a line of words and numbers, one step at a time. You get one worked example, must spot the hidden rule —
          which item moves, to which end, and what makes it the one chosen — and then apply it to a new input. Every puzzle is checked so
          that no other rule of this kind fits the example and gives a different answer. The review spells out the rule and every step.
        </p>
      }
      groups={[
        {
          key: 'difficulty',
          title: 'Difficulty',
          defaultId: 'medium',
          options: [
            { id: 'easy', label: 'Easy', description: '6 items · largest/smallest number, alphabetical word' },
            { id: 'medium', label: 'Medium', description: '6-7 items · odd/even numbers, longest/shortest, swaps' },
            { id: 'hard', label: 'Hard', description: '8-9 items · digit sums, vowels, last letters' },
            { id: 'mixed', label: 'Mixed', description: 'a blend of all three' },
          ],
        },
      ]}
      counts={[6, 9, 12, 18, 24]}
      defaultCount={9}
      generate={(c, count) => generateInputOutputQuestions(c.difficulty as InputOutputDifficulty, count)}
    />
  )
}
