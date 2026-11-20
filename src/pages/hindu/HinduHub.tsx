import { useEffect, useState } from 'react'
import FeatureHub from '../../components/FeatureHub'
import { loadHinduBank } from '../../lib/hinduVocab'

export default function HinduHub() {
  const [count, setCount] = useState<number | null>(null)

  useEffect(() => {
    let cancelled = false
    loadHinduBank()
      .then((bank) => {
        if (!cancelled) setCount(bank.length)
      })
      .catch(() => {
        // The count is decoration; the pages themselves show a proper error.
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <FeatureHub
      backTo="/english"
      backLabel="English"
      title="The Hindu Vocabulary"
      description="Power words from The Hindu editorials — Hindi and English meanings, five synonyms, five antonyms and two example sentences each."
      libraryTo="/english/hindu-vocab/library"
      libraryTitle="Study the words"
      libraryDescription={`${count ?? '1700+'} words. Search, jump to a letter, and star the ones you want to keep revising.`}
      quizTo="/english/hindu-vocab/practice"
      quizTitle="Practice game"
      quizDescription="Meanings, Hindi, synonyms, antonyms and fill-in-the-blank — pick a mode, a letter and how many questions."
    />
  )
}
