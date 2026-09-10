import BankLibrary from '../../components/BankLibrary'
import { PHRASAL_VERBS_BANK } from '../../data/phrasalVerbs'

export default function PhrasalVerbsLibrary() {
  return (
    <BankLibrary
      bank={PHRASAL_VERBS_BANK}
      backTo="/english/phrasal-verbs"
      backLabel="Phrasal Verbs"
      title="Phrasal Verb Bank"
      nounPlural="phrasal verbs"
    />
  )
}
