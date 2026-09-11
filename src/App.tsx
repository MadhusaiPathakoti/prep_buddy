import { HashRouter, Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import Home from './pages/Home'
import SpeedMath from './pages/SpeedMath'
import AdditionsPractice from './pages/games/AdditionsPractice'
import SubtractionPractice from './pages/games/SubtractionPractice'
import DivisionPractice from './pages/games/DivisionPractice'
import TablesPractice from './pages/games/TablesPractice'
import SquaresCubes from './pages/games/SquaresCubes'
import RatioPercent from './pages/games/RatioPercent'
import English from './pages/English'
import VocabularyHub from './pages/vocabulary/VocabularyHub'
import VocabLibrary from './pages/vocabulary/VocabLibrary'
import VocabQuiz from './pages/vocabulary/VocabQuiz'
import AddWord from './pages/vocabulary/AddWord'
import IdiomsHub from './pages/idioms/IdiomsHub'
import IdiomLibrary from './pages/idioms/IdiomLibrary'
import IdiomQuiz from './pages/idioms/IdiomQuiz'
import AddIdiom from './pages/idioms/AddIdiom'
import OneWordHub from './pages/onewordsub/OneWordHub'
import OneWordLibrary from './pages/onewordsub/OneWordLibrary'
import OneWordQuiz from './pages/onewordsub/OneWordQuiz'
import AddOneWord from './pages/onewordsub/AddOneWord'
import PhrasalVerbsHub from './pages/phrasalverbs/PhrasalVerbsHub'
import PhrasalVerbsLibrary from './pages/phrasalverbs/PhrasalVerbsLibrary'
import PhrasalVerbsQuiz from './pages/phrasalverbs/PhrasalVerbsQuiz'
import SynonymsHub from './pages/synonyms/SynonymsHub'
import SynonymsLibrary from './pages/synonyms/SynonymsLibrary'
import SynonymsQuiz from './pages/synonyms/SynonymsQuiz'
import AntonymsHub from './pages/antonyms/AntonymsHub'
import AntonymsLibrary from './pages/antonyms/AntonymsLibrary'
import AntonymsQuiz from './pages/antonyms/AntonymsQuiz'

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Home />} />
          <Route path="/speed-math" element={<SpeedMath />} />
          <Route path="/speed-math/additions" element={<AdditionsPractice />} />
          <Route path="/speed-math/subtraction" element={<SubtractionPractice />} />
          <Route path="/speed-math/division" element={<DivisionPractice />} />
          <Route path="/speed-math/tables" element={<TablesPractice />} />
          <Route path="/speed-math/squares-cubes" element={<SquaresCubes />} />
          <Route path="/speed-math/ratios" element={<RatioPercent />} />
          <Route path="/english" element={<English />} />
          <Route path="/english/vocabulary" element={<VocabularyHub />} />
          <Route path="/english/vocabulary/library" element={<VocabLibrary />} />
          <Route path="/english/vocabulary/quiz" element={<VocabQuiz />} />
          <Route path="/english/vocabulary/add" element={<AddWord />} />
          <Route path="/english/idioms" element={<IdiomsHub />} />
          <Route path="/english/idioms/library" element={<IdiomLibrary />} />
          <Route path="/english/idioms/quiz" element={<IdiomQuiz />} />
          <Route path="/english/idioms/add" element={<AddIdiom />} />
          <Route path="/english/one-word-substitution" element={<OneWordHub />} />
          <Route path="/english/one-word-substitution/library" element={<OneWordLibrary />} />
          <Route path="/english/one-word-substitution/quiz" element={<OneWordQuiz />} />
          <Route path="/english/one-word-substitution/add" element={<AddOneWord />} />
          <Route path="/english/phrasal-verbs" element={<PhrasalVerbsHub />} />
          <Route path="/english/phrasal-verbs/library" element={<PhrasalVerbsLibrary />} />
          <Route path="/english/phrasal-verbs/quiz" element={<PhrasalVerbsQuiz />} />
          <Route path="/english/synonyms" element={<SynonymsHub />} />
          <Route path="/english/synonyms/library" element={<SynonymsLibrary />} />
          <Route path="/english/synonyms/quiz" element={<SynonymsQuiz />} />
          <Route path="/english/antonyms" element={<AntonymsHub />} />
          <Route path="/english/antonyms/library" element={<AntonymsLibrary />} />
          <Route path="/english/antonyms/quiz" element={<AntonymsQuiz />} />
        </Route>
      </Routes>
    </HashRouter>
  )
}
