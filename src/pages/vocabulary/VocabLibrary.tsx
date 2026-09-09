import BankLibrary from '../../components/BankLibrary'
import { VOCAB_BANK } from '../../data/vocabulary'

export default function VocabLibrary() {
  return (
    <BankLibrary bank={VOCAB_BANK} backTo="/english/vocabulary" backLabel="Vocabulary" title="Word Bank" nounPlural="words" />
  )
}
