import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import FeatureHub from '../../components/FeatureHub'
import { getFullIdiomsBank } from '../../lib/idiomsStore'

export default function IdiomsHub() {
  const [count, setCount] = useState<number | null>(null)

  useEffect(() => {
    let cancelled = false
    getFullIdiomsBank()
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
      title="Idioms"
      description="Learn common idioms and phrases, then test yourself with a quiz at your chosen difficulty."
      libraryTo="/english/idioms/library"
      libraryTitle="Study the idiom bank"
      libraryDescription={count === null ? 'Idioms with meanings and examples, easy to hard.' : `${count} idioms with meanings and examples, easy to hard.`}
      quizTo="/english/idioms/quiz"
      quizTitle="Play the quiz"
      quizDescription="Pick easy, medium, or hard and test what you know. Hints included."
    >
      <div className="mt-6 text-center">
        <Link to="/english/idioms/add" className="text-sm font-semibold text-indigo-600 hover:underline">
          + Add your own idiom to the bank
        </Link>
      </div>
    </FeatureHub>
  )
}
