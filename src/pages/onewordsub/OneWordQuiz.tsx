import BankQuiz from '../../components/BankQuiz'
import { ONE_WORD_BANK } from '../../data/oneWordSubstitutes'

export default function OneWordQuiz() {
  return (
    <BankQuiz
      gameId="one-word-substitution"
      bank={ONE_WORD_BANK}
      backTo="/english/one-word-substitution"
      backLabel="One Word Substitution"
      title="One Word Substitution Quiz"
      description="See a phrase, pick the one word that means the same. Stuck? Use a hint."
      noun="phrases"
    />
  )
}
