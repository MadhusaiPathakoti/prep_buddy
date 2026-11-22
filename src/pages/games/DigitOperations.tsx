import ReasoningSetup from '../../components/ReasoningSetup'
import TipsCard from '../../components/TipsCard'
import { applyStep, applyTransform, generateDigitOperationQuestions, inClass, type DigitDifficulty, type DigitQType, type Step, type Transform } from '../../lib/digitOperations'

const EXAMPLE = [7, 4, 9, 2, 6, 3, 6, 5, 1, 0]
const RULE: Transform = { cls: { t: 'odd' }, a: -1, b: 2 }
const ARRANGE: Step = { t: 'arrange', dir: 'descending' }

/** Worked example, calculated with the game's own engine so it can never disagree with the rules. */
function WorkedExample() {
  const changed = applyTransform(EXAMPLE, RULE)
  const sorted = applyStep(changed, ARRANGE)
  const answer = sorted[sorted.length - 4]
  const cell = 'px-1.5 py-1 text-center font-mono'
  const label = 'pr-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400'
  return (
    <div className="rounded-2xl bg-white/70 dark:bg-slate-900/40 p-4">
      <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
        Worked example — "In the number {EXAMPLE.join('')}, 1 is subtracted from each odd digit and 2 is added to each even digit, and then the digits are arranged in descending order. Which digit is 4th from the right end?"
      </p>
      <div className="mt-3 overflow-x-auto">
        <table className="mx-auto text-sm">
          <tbody>
            <tr>
              <th className={label}>Digit</th>
              {EXAMPLE.map((d, i) => (
                <td key={i} className={[cell, 'text-base font-bold text-slate-800 dark:text-slate-100'].join(' ')}>
                  {d}
                </td>
              ))}
            </tr>
            <tr>
              <th className={label}>Odd / even</th>
              {EXAMPLE.map((d, i) => (
                <td key={i} className={[cell, 'text-xs', inClass(d, RULE.cls) ? 'text-indigo-500 dark:text-indigo-300' : 'text-slate-400'].join(' ')}>
                  {inClass(d, RULE.cls) ? 'O  −1' : 'E  +2'}
                </td>
              ))}
            </tr>
            <tr>
              <th className={label}>New digit</th>
              {changed.map((d, i) => (
                <td key={i} className={[cell, 'font-bold text-emerald-600 dark:text-emerald-400'].join(' ')}>
                  {d}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-sm text-slate-700 dark:text-slate-300">
        Descending order: <span className="font-mono font-bold">{sorted.join(' ')}</span>. The number has {sorted.length} digits, so the 4th from the right is the {sorted.length - 3}th from the left: <b>{answer}</b>.
      </p>
    </div>
  )
}

export default function DigitOperations() {
  return (
    <ReasoningSetup
      gameId="digit-operations"
      title="Digit Operations"
      counts={[5, 10, 15, 20]}
      defaultCount={10}
      intro={
        <p>
          Take a long number, change its digits by a rule — "1 is added to each prime digit and 2 is subtracted from the rest" — maybe delete repeats or arrange the digits, then find a
          digit by its place, a sum or product of two digits, or count the digits that fit. Every changed digit stays a single digit, 0 and 1 are never prime, and every answer shows the
          number after each step.
        </p>
      }
      tips={
        <TipsCard
          example={<WorkedExample />}
          sections={[
            {
              heading: 'The 3-row method',
              points: [
                <>
                  <b>Row 1: the digits. Row 2: tag each one</b> with its change (O −1, E +2, or P +1 / N −2 for prime / not prime). <b>Row 3: the new digit.</b> Never do the whole number in your head — one slip ruins everything after it.
                </>,
                <>
                  Read the rule twice: <b>which group gets which change</b>, and that "the remaining digits" means everyone not in the first group.
                </>,
                <>
                  Only after row 3 is complete, apply the next step (arrange, delete repeats, delete a group) and write the <b>new number out in full</b> before answering.
                </>,
              ],
            },
            {
              heading: 'Digit facts that decide the answer',
              points: [
                <>
                  <b>Prime digits are only 2, 3, 5, 7.</b> 0 and 1 are <b>not</b> prime, and 2 is the only even prime — the classic trap.
                </>,
                <>
                  <b>0 is even.</b> Odd digits are 1, 3, 5, 7, 9; even digits are 0, 2, 4, 6, 8.
                </>,
                <>
                  In this game a changed digit never leaves 0–9. If a real paper shows something like 8 + 2, the question setter has made a mistake or means a two-digit result — skip it.
                </>,
              ],
            },
            {
              heading: 'Arranging, deleting and counting positions',
              points: [
                <>
                  <b>Sort by tallying:</b> count how many 9s, 8s, 7s … you have and write them out, instead of comparing digits pair by pair.
                </>,
                <>
                  <b>Repeated digits deleted</b> here means keep the <b>first</b> appearance and cross out the later ones. Do this before arranging if the question says so.
                </>,
                <>
                  <b>Recount the length after any deletion.</b> The Nth digit from the right in an L-digit number is the <b>(L − N + 1)th from the left</b> — check it by counting from the right once.
                </>,
                <>
                  For products, look for a <b>0 digit first</b>: any product with 0 is 0. For differences, take the larger minus the smaller.
                </>,
              ],
            },
          ]}
        />
      }
      groups={[
        {
          key: 'difficulty',
          title: 'Difficulty',
          defaultId: 'medium',
          options: [
            { id: 'easy', label: 'Easy', description: '8 digits, odd/even rule' },
            { id: 'medium', label: 'Medium', description: '9 digits, prime rule, one extra step' },
            { id: 'hard', label: 'Hard', description: '10 digits, two extra steps' },
            { id: 'mixed', label: 'Mixed', description: 'a blend of all three' },
          ],
        },
        {
          key: 'type',
          title: 'Question type',
          defaultId: 'mixed',
          options: [
            { id: 'mixed', label: 'All types' },
            { id: 'nth', label: 'Which digit' },
            { id: 'calc', label: 'Sum / product / difference' },
            { id: 'count', label: 'How many digits' },
          ],
        },
      ]}
      generate={(c, count) => generateDigitOperationQuestions(c.difficulty as DigitDifficulty, c.type as DigitQType, count)}
    />
  )
}
