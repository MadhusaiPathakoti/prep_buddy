import FeatureHub from '../../components/FeatureHub'
import { PHRASAL_VERBS_BANK } from '../../data/phrasalVerbs'

export default function PhrasalVerbsHub() {
  return (
    <FeatureHub
      backTo="/english"
      backLabel="English"
      title="Phrasal Verbs"
      description="Learn common phrasal verbs, then test yourself with a quiz at your chosen difficulty."
      libraryTo="/english/phrasal-verbs/library"
      libraryTitle="Study the phrasal verb bank"
      libraryDescription={`${PHRASAL_VERBS_BANK.length} phrasal verbs with meanings and examples, easy to hard.`}
      quizTo="/english/phrasal-verbs/quiz"
      quizTitle="Play the quiz"
      quizDescription="Pick easy, medium, or hard and test what you know. Hints included."
    />
  )
}
