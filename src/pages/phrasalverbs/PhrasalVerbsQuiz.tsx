import BankQuiz from '../../components/BankQuiz'
import { PHRASAL_VERBS_BANK } from '../../data/phrasalVerbs'

export default function PhrasalVerbsQuiz() {
  return (
    <BankQuiz
      gameId="phrasal-verbs"
      bank={PHRASAL_VERBS_BANK}
      backTo="/english/phrasal-verbs"
      backLabel="Phrasal Verbs"
      title="Phrasal Verbs Quiz"
      description="See a phrasal verb, pick its correct meaning. Stuck? Use a hint."
      noun="phrasal verbs"
    />
  )
}
