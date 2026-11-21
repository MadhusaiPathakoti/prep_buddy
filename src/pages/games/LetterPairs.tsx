import ReasoningSetup from '../../components/ReasoningSetup'
import TipsCard from '../../components/TipsCard'
import { generateLetterPairQuestions, letterValue, pairsIn, type PairDifficulty, type PairType } from '../../lib/letterPairs'

const EXAMPLE = 'FINANCIAL'

/** The worked example, drawn from the same pair-finder the game uses so it can never disagree with it. */
function WorkedExample() {
  const pairs = pairsIn(EXAMPLE)
  const inPair = new Set(pairs.flatMap((p) => [p.i, p.j]))
  const cell = 'px-2 py-1 text-center font-mono'
  return (
    <div className="rounded-2xl bg-white/70 dark:bg-slate-900/40 p-4">
      <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
        Worked example — "In the word {EXAMPLE}, how many pairs of letters have the same number of letters between them as in the alphabet?"
      </p>
      <div className="mt-3 overflow-x-auto">
        <table className="mx-auto text-sm">
          <tbody>
            <tr>
              <th className="pr-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400">Letter</th>
              {EXAMPLE.split('').map((ch, i) => (
                <td key={i} className={[cell, 'text-base font-bold', inPair.has(i) ? 'rounded bg-amber-200 text-amber-900 dark:bg-amber-500/30 dark:text-amber-100' : 'text-slate-800 dark:text-slate-100'].join(' ')}>
                  {ch}
                </td>
              ))}
            </tr>
            <tr>
              <th className="pr-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400">Place</th>
              {EXAMPLE.split('').map((_, i) => (
                <td key={i} className={[cell, 'text-slate-500 dark:text-slate-400'].join(' ')}>
                  {i + 1}
                </td>
              ))}
            </tr>
            <tr>
              <th className="pr-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400">Alphabet no.</th>
              {EXAMPLE.split('').map((ch, i) => (
                <td key={i} className={[cell, 'text-slate-700 dark:text-slate-200'].join(' ')}>
                  {letterValue(ch)}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-sm text-slate-700 dark:text-slate-300">
        {pairs.map((p, k) => (
          <span key={k}>
            {k > 0 && ' · '}
            <b>
              {p.a}({p.i + 1}) – {p.b}({p.j + 1})
            </b>
            : places differ by {p.j - p.i}, alphabet numbers differ by {Math.abs(letterValue(p.a) - letterValue(p.b))} ✓
          </span>
        ))}
        {' → '}
        <b>{pairs.length === 2 ? 'Two' : pairs.length} pairs.</b>
      </p>
    </div>
  )
}

export default function LetterPairs() {
  return (
    <ReasoningSetup
      gameId="letter-pairs"
      title="Letter Pairs"
      counts={[5, 10, 15, 20]}
      defaultCount={10}
      intro={
        <p>
          Word-and-alphabet questions: in a word like FINANCIAL, how many pairs of letters have as many letters between them as they
          do in the English alphabet? Also pick the one pair that matches, or sort the word alphabetically and count the letters that
          keep their place. Every answer is worked out from the word, with the alphabet numbers shown in the review.
        </p>
      }
      tips={
        <TipsCard
          example={<WorkedExample />}
          sections={[
            {
              heading: 'Pairs with the same gap — the 3-step method',
              points: [
                <>
                  <b>Write the alphabet number under every letter</b> (A=1 … Z=26). Learn the landmarks so this takes seconds: E=5, J=10, O=15, T=20, Y=25.
                </>,
                <>
                  <b>Compare differences, not "letters between".</b> Both counts shrink by one in the same way, so a pair qualifies exactly when
                  <i> places differ by d</i> and <i>alphabet numbers differ by d</i>.
                </>,
                <>
                  <b>Work from each letter outwards:</b> for the letter at place 1 check place 2 (needs a number ±1), place 3 (needs ±2), place 4 (±3)…
                  then repeat from place 2. A 9-letter word has only 36 pairs, so a tidy pass takes well under a minute.
                </>,
              ],
            },
            {
              heading: 'Shortcuts and traps',
              points: [
                <>
                  Neighbouring letters (gap 1) qualify only if they are <b>consecutive in the alphabet</b>, like D-E or M-L. Gap 2 needs letters two apart, like A-C or C-A.
                </>,
                <>
                  Direction does not matter: <b>A…C and C…A both count</b>, whichever of the two comes first in the word.
                </>,
                <>
                  <b>Two identical letters never qualify</b> (their alphabet numbers differ by 0). But a repeated letter makes <b>extra pairs</b>: in FINANCIAL the A at place 4 and the A at place 8 each pair with the C at place 6.
                </>,
                <>
                  Scan for <b>close letters first</b> (J-K-L-M-N, A-B-C, S-T-U…): matching pairs almost always come from letters that are near each other in the alphabet.
                </>,
                <>
                  Tick pairs off as you find them, and do <b>not</b> count the same two places twice. "More than three" is a real option — keep going to the end before you choose it.
                </>,
              ],
            },
            {
              heading: 'Alphabetical-order questions',
              points: [
                <>
                  Write the sorted word <b>directly under</b> the original and compare column by column — each column that matches is a letter that did not move.
                </>,
                <>
                  For Z→A, just read your A→Z word backwards. Repeated letters that sit side by side in the sorted word can still match the original.
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
            { id: 'easy', label: 'Easy', description: '5-6 letter words' },
            { id: 'medium', label: 'Medium', description: '7-8 letters' },
            { id: 'hard', label: 'Hard', description: '9-11 letters, repeated letters' },
            { id: 'mixed', label: 'Mixed', description: 'a blend of all three' },
          ],
        },
        {
          key: 'type',
          title: 'Question type',
          defaultId: 'mixed',
          options: [
            { id: 'mixed', label: 'All types' },
            { id: 'pairs', label: 'How many pairs' },
            { id: 'which', label: 'Which pair' },
            { id: 'sorted', label: 'Alphabetical order' },
          ],
        },
      ]}
      generate={(c, count) => generateLetterPairQuestions(c.difficulty as PairDifficulty, c.type as PairType, count)}
    />
  )
}
