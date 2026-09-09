import FeatureHub from '../../components/FeatureHub'
import { VOCAB_BANK } from '../../data/vocabulary'

export default function VocabularyHub() {
  return (
    <FeatureHub
      backTo="/english"
      backLabel="English"
      title="Vocabulary"
      description="Learn new words, then test yourself with a quiz at your chosen difficulty."
      libraryTo="/english/vocabulary/library"
      libraryTitle="Study the word bank"
      libraryDescription={`${VOCAB_BANK.length} words with meanings and examples, easy to hard.`}
      quizTo="/english/vocabulary/quiz"
      quizTitle="Play the quiz"
      quizDescription="Pick easy, medium, or hard and test what you know. Hints included."
    />
  )
}
