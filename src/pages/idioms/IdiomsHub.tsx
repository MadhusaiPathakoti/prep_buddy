import FeatureHub from '../../components/FeatureHub'
import { IDIOMS_BANK } from '../../data/idioms'

export default function IdiomsHub() {
  return (
    <FeatureHub
      backTo="/english"
      backLabel="English"
      title="Idioms"
      description="Learn common idioms and phrases, then test yourself with a quiz at your chosen difficulty."
      libraryTo="/english/idioms/library"
      libraryTitle="Study the idiom bank"
      libraryDescription={`${IDIOMS_BANK.length} idioms with meanings and examples, easy to hard.`}
      quizTo="/english/idioms/quiz"
      quizTitle="Play the quiz"
      quizDescription="Pick easy, medium, or hard and test what you know. Hints included."
    />
  )
}
