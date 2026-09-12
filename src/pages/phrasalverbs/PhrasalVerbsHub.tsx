import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import FeatureHub from '../../components/FeatureHub'
import { getFullPhrasalVerbsBank } from '../../lib/phrasalVerbsStore'

export default function PhrasalVerbsHub() {
  const [count, setCount] = useState<number | null>(null)

  useEffect(() => {
    let cancelled = false
    getFullPhrasalVerbsBank()
      .then((full) => {
        if (!cancelled) setCount(full.length)
      })
      .catch(() => {
        // Leave count as null; the description falls back to a generic line below.
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <FeatureHub
      backTo="/english"
      backLabel="English"
      title="Phrasal Verbs"
      description="Learn common phrasal verbs, then test yourself with a quiz at your chosen difficulty."
      libraryTo="/english/phrasal-verbs/library"
      libraryTitle="Study the phrasal verb bank"
      libraryDescription={
        count === null ? 'Phrasal verbs with meanings and examples, easy to hard.' : `${count} phrasal verbs with meanings and examples, easy to hard.`
      }
      quizTo="/english/phrasal-verbs/quiz"
      quizTitle="Play the quiz"
      quizDescription="Pick easy, medium, or hard and test what you know. Hints included."
    >
      <div className="mt-6 text-center">
        <Link to="/english/phrasal-verbs/add" className="text-sm font-semibold text-indigo-600 hover:underline">
          + Add your own phrasal verb to the bank
        </Link>
      </div>
    </FeatureHub>
  )
}
