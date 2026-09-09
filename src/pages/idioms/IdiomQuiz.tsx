import BankQuiz from '../../components/BankQuiz'
import { IDIOMS_BANK } from '../../data/idioms'

export default function IdiomQuiz() {
  return (
    <BankQuiz
      gameId="idioms"
      bank={IDIOMS_BANK}
      backTo="/english/idioms"
      backLabel="Idioms"
      title="Idioms Quiz"
      description="See an idiom, pick its correct meaning. Stuck? Use a hint."
      noun="idioms"
    />
  )
}
