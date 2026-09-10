import BankLibrary from '../../components/BankLibrary'
import { ONE_WORD_BANK } from '../../data/oneWordSubstitutes'

export default function OneWordLibrary() {
  return (
    <BankLibrary
      bank={ONE_WORD_BANK}
      backTo="/english/one-word-substitution"
      backLabel="One Word Substitution"
      title="Phrase Bank"
      nounPlural="phrases"
    />
  )
}
