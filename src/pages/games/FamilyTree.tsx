import { useMemo } from 'react'
import ReasoningSetup from '../../components/ReasoningSetup'
import TipsCard from '../../components/TipsCard'
import { treeInWords } from '../../lib/familyTree/describe'
import { parseFamily } from '../../lib/familyTree/parse'
import { solveFamily } from '../../lib/familyTree/solve'
import { familyQuestionText, generateFamilyTreeQuestions, type FamilyDifficulty, type FamilyQType } from '../../lib/familyTreeGame'
import { SAMPLES } from '../../lib/puzzleSolver/sample'

/** Worked example: the family is worked out by the same solver that checks every question, so it can never disagree with the game. */
function WorkedExample() {
  const lines = useMemo(() => {
    const text = SAMPLES.find((s) => s.id === 'family-tree')?.text ?? ''
    const puzzle = parseFamily(text).puzzle
    const world = puzzle ? solveFamily(puzzle, { limit: 2 }).worlds[0] : undefined
    return { text, tree: world ? treeInWords(world) : [] }
  }, [])
  return (
    <div className="rounded-2xl bg-white/70 p-4 dark:bg-slate-900/40">
      <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">Worked example</p>
      <p className="mt-1 text-sm text-slate-700 dark:text-slate-300">“{lines.text}”</p>
      <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-slate-700 dark:text-slate-300">
        <li>
          <b>R has no siblings and is P's mother</b> — R is not a sister of anyone, so R is married into the family: R's husband is P's father.
        </li>
        <li>
          <b>A is the uncle of H</b> and <b>N is A's brother-in-law</b> — A and T are brother and sister; N is T's husband, so H is the son of N and T. A, with R, are P's parents.
        </li>
        <li>
          <b>T is the mother-in-law of G, who is married to H</b> — G is H's wife, from outside the family.
        </li>
      </ol>
      {lines.tree.length > 0 && (
        <div className="mt-3 rounded-xl bg-amber-100/60 p-3 text-sm text-slate-800 dark:bg-amber-500/10 dark:text-slate-200">
          <div className="font-semibold">The tree</div>
          <ul className="mt-1 space-y-0.5">
            {lines.tree.map((l) => (
              <li key={l}>• {l}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

export default function FamilyTree() {
  return (
    <ReasoningSetup
      gameId="family-tree"
      title="Family Tree"
      counts={[5, 10, 15, 20]}
      defaultCount={10}
      intro={
        <p>
          A short passage describes a family — “There is a family of seven people spread across two generations. N is the brother-in-law of A, who has only one daughter …” — and you answer a question about it: how two people are related, who someone
          is, how many of a kind, or which statement is true. The people are all there is: a relative who is not named does not exist, and a person whose parents are not named has parents outside the puzzle. Each passage has exactly one family that fits
          it. Stuck? Press <b>Solve with Puzzle Solver</b> on any question to see the family drawn as a tree, then come back to the same question.
        </p>
      }
      tips={
        <TipsCard
          example={<WorkedExample />}
          sections={[
            {
              heading: 'Draw it, do not hold it in your head',
              points: [
                <>
                  <b>One row per generation</b>, oldest on top. Join a married couple with <b>=</b> and hang their children underneath. Write M or F beside each letter as soon as a clue tells you.
                </>,
                <>
                  Begin with the clues that give the most: a gendered relation (<i>mother, uncle, husband</i>), <i>"is a male"</i>, a couple (<i>"G is married to H"</i>), or <i>"does not have any siblings"</i>.
                </>,
                <>
                  <b>In-laws come from outside.</b> A person who marries into the family has parents who are not on the chart, and no brothers or sisters on it.
                </>,
              ],
            },
            {
              heading: 'What the words mean',
              points: [
                <>
                  <b>Brother-in-law / sister-in-law:</b> your husband's or wife's brother or sister, or your brother's or sister's husband or wife.
                </>,
                <>
                  <b>Mother-in-law / father-in-law:</b> your husband's or wife's parents. <b>Son-in-law / daughter-in-law:</b> your child's husband or wife.
                </>,
                <>
                  <b>Uncle / aunt:</b> a parent's brother or sister — or their husband or wife. <b>Cousin:</b> the child of your uncle or aunt.
                </>,
                <>
                  <b>"Has only one daughter"</b> means exactly one daughter in this family, not "at least one". <b>"Has no siblings"</b> rules out everyone who has the same parents.
                </>,
              ],
            },
            {
              heading: 'Before you answer',
              points: [
                <>
                  Read a relation question as <b>"X is the ___ of Y"</b> — the order matters: the father of a girl is not her son.
                </>,
                <>
                  Check <b>both ends</b>: confirm the gender and the generation gap of the answer, then follow the links person by person.
                </>,
                <>
                  For "how many", list the people you are counting by letter before you count.
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
            { id: 'easy', label: 'Easy', description: '6 people, 2 generations, direct relations' },
            { id: 'medium', label: 'Medium', description: '7–8 people, 2 generations, in-laws, uncles, cousins' },
            { id: 'hard', label: 'Hard', description: '8–9 people, 3 generations, fewer clues, more inference' },
            { id: 'mixed', label: 'Mixed', description: 'a blend of all three' },
          ],
        },
        {
          key: 'type',
          title: 'Question type',
          defaultId: 'mixed',
          options: [
            { id: 'mixed', label: 'All types' },
            { id: 'relation', label: 'How is X related to Y?' },
            { id: 'who', label: 'Who is …?' },
            { id: 'count', label: 'How many …?' },
            { id: 'true', label: 'Which is true?' },
          ],
        },
      ]}
      generate={(c, count) => generateFamilyTreeQuestions(c.difficulty as FamilyDifficulty, c.type as FamilyQType, count)}
      solver={{ path: '/reasoning/puzzle-solver', label: 'Solve with Puzzle Solver', toText: familyQuestionText }}
    />
  )
}
