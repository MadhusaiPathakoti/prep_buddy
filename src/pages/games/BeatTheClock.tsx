import MathSetup from '../../components/MathSetup'

export default function BeatTheClock() {
  return (
    <MathSetup
      kind="sprint"
      gameId="beat-the-clock"
      title="Beat the Clock"
      intro={
        <p>
          Answer as many questions as you can before time runs out. Three correct answers in a row take you up a level (ten levels, from
          2-digit + 1-digit up to three-step expressions); a mistake drops you one. Your best score for each sprint length is remembered.
        </p>
      }
      learn={
        <>
          <p>Type the answer as soon as you have it — the question checks itself, no Enter needed.</p>
          <p>Don't stall on a hard one: a wrong answer shows the correct one and moves on, costing you only a level and a streak.</p>
          <p>Short sprints reward bursts of focus; the 2-minute sprint rewards steady accuracy.</p>
        </>
      }
      groups={[
        {
          key: 'length',
          title: 'Sprint length',
          defaultId: '60',
          options: [
            { id: '30', label: '30 seconds' },
            { id: '60', label: '60 seconds' },
            { id: '90', label: '90 seconds' },
            { id: '120', label: '2 minutes' },
          ],
        },
      ]}
      durationSec={(c) => Number(c.length) || 60}
    />
  )
}
