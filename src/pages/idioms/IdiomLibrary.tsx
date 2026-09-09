import BankLibrary from '../../components/BankLibrary'
import { IDIOMS_BANK } from '../../data/idioms'

export default function IdiomLibrary() {
  return (
    <BankLibrary bank={IDIOMS_BANK} backTo="/english/idioms" backLabel="Idioms" title="Idiom Bank" nounPlural="idioms" />
  )
}
