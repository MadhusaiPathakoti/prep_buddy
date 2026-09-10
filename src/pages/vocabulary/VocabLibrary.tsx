import BankLibrary from '../../components/BankLibrary'
import { getFullVocabBank } from '../../lib/vocabularyStore'

export default function VocabLibrary() {
  return (
    <BankLibrary
      bank={getFullVocabBank()}
      backTo="/english/vocabulary"
      backLabel="Vocabulary"
      title="Word Bank"
      nounPlural="words"
      addAction={{ to: '/english/vocabulary/add', label: '+ Add a word' }}
    />
  )
}
