import { useEffect, useState } from 'react'
import FeatureHub from '../../components/FeatureHub'
import { getFullOneWordBank } from '../../lib/oneWordStore'

export default function OneWordHub() {
  const [count, setCount] = useState<number | null>(null)

  useEffect(() => {
    let cancelled = false
    getFullOneWordBank()
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
      title="One Word Substitution"
      description="Learn phrases and their one-word replacements, then test yourself with a quiz at your chosen difficulty."
      libraryTo="/english/one-word-substitution/library"
      libraryTitle="Study the phrase bank"
      libraryDescription={
        count === null
          ? 'Phrases with their one-word substitutes and examples, easy to hard.'
          : `${count} phrases with their one-word substitutes and examples, easy to hard.`
      }
      quizTo="/english/one-word-substitution/quiz"
      quizTitle="Play the quiz"
      quizDescription="Pick easy, medium, or hard and test what you know. Hints included."
    />
  )
}
