import ReasoningSetup from '../../components/ReasoningSetup'
import TipsCard from '../../components/TipsCard'
import { generateNumberArrangementQuestions, type NumDifficulty, type NumQType } from '../../lib/numberArrangement'

const SEQUENCE = [210, 347, 156, 584, 813]

/** Worked example on the sequence from the exam paper, calculated here so it can never disagree with the rules. */
function WorkedExample() {
  const asc = SEQUENCE.slice().sort((a, b) => a - b)
  const digitSum = (n: number) => String(n).split('').reduce((a, ch) => a + Number(ch), 0)
  const rows = SEQUENCE.map((n) => ({ n, plus: n + 3, ok: (n + 3) % 3 === 0, was: n % 3 === 0, sum: digitSum(n) }))
  const cell = 'px-3 py-1 text-center font-mono'
  return (
    <div className="rounded-2xl bg-white/70 dark:bg-slate-900/40 p-4">
      <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">Worked example — the sequence {SEQUENCE.join('  ')}</p>
      <p className="mt-2 text-sm text-slate-700 dark:text-slate-300">
        <b>Ranking:</b> write them in ascending order once — <span className="font-mono">{asc.join(' < ')}</span>. Now "third lowest" is <b>{asc[2]}</b>, "third highest" is also{' '}
        <b>{asc[2]}</b> (it is the middle one), and "fourth lowest" is <b>{asc[3]}</b>. The number "to the immediate right of the third lowest" is read from the{' '}
        <i>original</i> order: <b>{SEQUENCE[SEQUENCE.indexOf(asc[2]) + 1]}</b>.
      </p>
      <p className="mt-3 text-sm text-slate-700 dark:text-slate-300">
        <b>"If 3 is added to each number, how many are divisible by 3?"</b>
      </p>
      <div className="mt-2 overflow-x-auto">
        <table className="mx-auto text-sm">
          <thead>
            <tr className="text-xs font-medium text-slate-500 dark:text-slate-400">
              <th className={cell}>Number</th>
              <th className={cell}>Digit sum</th>
              <th className={cell}>+ 3</th>
              <th className={cell}>Divisible by 3?</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.n} className="text-slate-800 dark:text-slate-100">
                <td className={cell}>{r.n}</td>
                <td className={cell}>{r.sum}</td>
                <td className={cell}>{r.plus}</td>
                <td className={[cell, r.ok ? 'font-bold text-emerald-600 dark:text-emerald-400' : 'text-slate-400'].join(' ')}>{r.ok ? '✓' : '✗'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-sm text-slate-700 dark:text-slate-300">
        Answer: <b>{rows.filter((r) => r.ok).length}</b>. Shortcut: adding 3 never changes whether a number divides by 3, so the digit sums of the originals were enough — the same{' '}
        {rows.filter((r) => r.was).length} numbers qualified before and after.
      </p>
    </div>
  )
}

export default function NumberArrangement() {
  return (
    <ReasoningSetup
      gameId="number-arrangement"
      title="Number Arrangement"
      counts={[5, 10, 15, 20]}
      defaultCount={10}
      intro={
        <p>
          Study five three-digit numbers, then answer five questions on them, as in the exam: the third lowest number, the one beside it, a digit of the third highest, how many
          numbers have the first and third digits less than 5 apart, or what happens when 3 is added to each number or their digits are swapped. Every answer is worked out from the
          numbers, with the working shown in the review.
        </p>
      }
      tips={
        <TipsCard
          example={<WorkedExample />}
          sections={[
            {
              heading: 'Ranking questions (lowest, highest, between, next to)',
              points: [
                <>
                  <b>Sort once, answer everything.</b> Write the five numbers in ascending order under the sequence. Every "Nth lowest", "Nth highest" and "how many between" question then becomes a lookup.
                </>,
                <>
                  <b>The Nth highest is the (6 − N)th lowest</b> with five numbers: 2nd highest = 4th lowest, and the 3rd is the middle either way.
                </>,
                <>
                  <b>Compare the hundreds digit first.</b> Only look at the tens digit when two hundreds digits match, and the units digit when the tens match as well.
                </>,
                <>
                  <b>"Immediate right / left" uses the original order</b> of the sequence, not the sorted one. Find the ranked number first, then look beside it where it stands in the sequence.
                </>,
                <>
                  <b>"How many between" two numbers</b> — sort them, then take the difference of their places minus 1.
                </>,
              ],
            },
            {
              heading: 'When the digits change (swap, reverse, sort)',
              points: [
                <>
                  <b>Rewrite all five new numbers in a row first</b>, then rank or count those. Do not rank the old numbers by mistake.
                </>,
                <>
                  For a three-digit number, <b>swapping the first and third digits is the same as reversing it</b>: 347 → 743. Swapping first and second: 347 → 437. Swapping second and third: 347 → 374.
                </>,
                <>
                  Sorting the digits in ascending order puts the smallest digit in the hundreds place — a number with a 0 digit would lose its first digit, which is why this game keeps 0 away from the ends.
                </>,
              ],
            },
            {
              heading: 'Counting questions (how many numbers…)',
              points: [
                <>
                  <b>Tick each of the five numbers one by one</b> instead of counting in your head. "More than three" means four or five.
                </>,
                <>
                  <b>Digit difference is always positive:</b> between 3 and 7 the difference is 4, whichever way round. The middle digit is not used.
                </>,
                <>
                  <b>Write the digit sum under each number once</b> and reuse it for "sum is even", "sum is odd" and "sum is more than…".
                </>,
                <>
                  <b>Divisibility rules:</b> 2 — last digit even; 3 — digit sum divisible by 3; 4 — last two digits divisible by 4; 5 — last digit 0 or 5; 6 — both 2 and 3; 9 — digit sum divisible by 9.
                </>,
                <>
                  <b>Adding or subtracting k:</b> a number divisible by d stays divisible only if k is a multiple of d. So "3 is added — how many divisible by 3?" is simply "how many were divisible by 3 already?". For other k, the number must have the matching remainder (for example, to be divisible by 5 after adding 2, it must end in 3 or 8).
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
            { id: 'easy', label: 'Easy', description: 'ranks, digits, simple counts' },
            { id: 'medium', label: 'Medium', description: '+ swapped / reversed digits, more rules' },
            { id: 'hard', label: 'Hard', description: '+ sorted digits, sums and differences' },
            { id: 'mixed', label: 'Mixed', description: 'a blend of all three' },
          ],
        },
        {
          key: 'type',
          title: 'Question type',
          defaultId: 'mixed',
          options: [
            { id: 'mixed', label: 'All types' },
            { id: 'position', label: 'Ranks & positions' },
            { id: 'count', label: 'How many numbers' },
            { id: 'modified', label: 'Digits changed' },
            { id: 'calc', label: 'Sums & differences' },
          ],
        },
      ]}
      generate={(c, count) => generateNumberArrangementQuestions(c.difficulty as NumDifficulty, c.type as NumQType, count)}
    />
  )
}
