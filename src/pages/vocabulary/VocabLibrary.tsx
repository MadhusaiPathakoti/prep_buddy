import { useState } from 'react'
import BankLibrary from '../../components/BankLibrary'
import { deleteWord, getFullVocabBank } from '../../lib/vocabularyStore'
import type { BankEntry } from '../../lib/types'

export default function VocabLibrary() {
  const [bank, setBank] = useState<BankEntry[]>(() => getFullVocabBank())

  function handleDelete(entry: BankEntry) {
    deleteWord(entry.id)
    setBank(getFullVocabBank())
  }

  return (
    <BankLibrary
      bank={bank}
      backTo="/english/vocabulary"
      backLabel="Vocabulary"
      title="Word Bank"
      nounPlural="words"
      addAction={{ to: '/english/vocabulary/add', label: '+ Add a word' }}
      onDelete={handleDelete}
    />
  )
}
