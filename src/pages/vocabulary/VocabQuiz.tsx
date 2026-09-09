import BankQuiz from '../../components/BankQuiz'
import { VOCAB_BANK } from '../../data/vocabulary'

export default function VocabQuiz() {
  return (
    <BankQuiz
      gameId="vocabulary"
      bank={VOCAB_BANK}
      backTo="/english/vocabulary"
      backLabel="Vocabulary"
      title="Vocabulary Quiz"
      description="See a word, pick its correct meaning. Stuck? Use a hint."
      noun="words"
    />
  )
}
