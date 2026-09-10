import BankQuiz from '../../components/BankQuiz'
import { getFullVocabBank } from '../../lib/vocabularyStore'

export default function VocabQuiz() {
  return (
    <BankQuiz
      gameId="vocabulary"
      bank={getFullVocabBank()}
      backTo="/english/vocabulary"
      backLabel="Vocabulary"
      title="Vocabulary Quiz"
      description="See a word, pick its correct meaning. Stuck? Use a hint."
      noun="words"
    />
  )
}
