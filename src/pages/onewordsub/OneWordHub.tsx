import FeatureHub from '../../components/FeatureHub'
import { ONE_WORD_BANK } from '../../data/oneWordSubstitutes'

export default function OneWordHub() {
  return (
    <FeatureHub
      backTo="/english"
      backLabel="English"
      title="One Word Substitution"
      description="Learn phrases and their one-word replacements, then test yourself with a quiz at your chosen difficulty."
      libraryTo="/english/one-word-substitution/library"
      libraryTitle="Study the phrase bank"
      libraryDescription={`${ONE_WORD_BANK.length} phrases with their one-word substitutes and examples, easy to hard.`}
      quizTo="/english/one-word-substitution/quiz"
      quizTitle="Play the quiz"
      quizDescription="Pick easy, medium, or hard and test what you know. Hints included."
    />
  )
}
