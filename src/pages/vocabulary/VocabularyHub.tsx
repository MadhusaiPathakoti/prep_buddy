import { Link } from 'react-router-dom'
import FeatureHub from '../../components/FeatureHub'
import { getFullVocabBank } from '../../lib/vocabularyStore'

export default function VocabularyHub() {
  return (
    <FeatureHub
      backTo="/english"
      backLabel="English"
      title="Vocabulary"
      description="Learn new words, then test yourself with a quiz at your chosen difficulty."
      libraryTo="/english/vocabulary/library"
      libraryTitle="Study the word bank"
      libraryDescription={`${getFullVocabBank().length} words with meanings and examples, easy to hard.`}
      quizTo="/english/vocabulary/quiz"
      quizTitle="Play the quiz"
      quizDescription="Pick easy, medium, or hard and test what you know. Hints included."
    >
      <div className="mt-6 text-center">
        <Link to="/english/vocabulary/add" className="text-sm font-semibold text-indigo-600 hover:underline">
          + Add your own word to the bank
        </Link>
      </div>
    </FeatureHub>
  )
}
