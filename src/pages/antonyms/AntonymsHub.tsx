import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import FeatureHub from '../../components/FeatureHub'
import { getFullAntonymsBank } from '../../lib/antonymsStore'

export default function AntonymsHub() {
  const [count, setCount] = useState<number | null>(null)

  useEffect(() => {
    let cancelled = false
    getFullAntonymsBank()
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
      title="Antonyms"
      description="Learn words and their opposites, then test yourself with a quiz at your chosen difficulty."
      libraryTo="/english/antonyms/library"
      libraryTitle="Study the antonyms bank"
      libraryDescription={
        count === null ? 'Words with their antonyms and examples, easy to hard.' : `${count} words with their antonyms and examples, easy to hard.`
      }
      quizTo="/english/antonyms/quiz"
      quizTitle="Play the quiz"
      quizDescription="Pick easy, medium, or hard and find the opposite word. Hints included."
    >
      <div className="mt-6 text-center">
        <Link to="/english/antonyms/add" className="text-sm font-semibold text-indigo-600 hover:underline">
          + Add your own word to the bank
        </Link>
      </div>
    </FeatureHub>
  )
}
