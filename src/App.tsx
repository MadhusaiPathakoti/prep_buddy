import { HashRouter, Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import Home from './pages/Home'
import SpeedMath from './pages/SpeedMath'
import TablesPractice from './pages/games/TablesPractice'
import SquaresCubes from './pages/games/SquaresCubes'
import RatioPercent from './pages/games/RatioPercent'
import English from './pages/English'
import VocabularyHub from './pages/vocabulary/VocabularyHub'
import VocabLibrary from './pages/vocabulary/VocabLibrary'
import VocabQuiz from './pages/vocabulary/VocabQuiz'
import IdiomsHub from './pages/idioms/IdiomsHub'
import IdiomLibrary from './pages/idioms/IdiomLibrary'
import IdiomQuiz from './pages/idioms/IdiomQuiz'

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Home />} />
          <Route path="/speed-math" element={<SpeedMath />} />
          <Route path="/speed-math/tables" element={<TablesPractice />} />
          <Route path="/speed-math/squares-cubes" element={<SquaresCubes />} />
          <Route path="/speed-math/ratios" element={<RatioPercent />} />
          <Route path="/english" element={<English />} />
          <Route path="/english/vocabulary" element={<VocabularyHub />} />
          <Route path="/english/vocabulary/library" element={<VocabLibrary />} />
          <Route path="/english/vocabulary/quiz" element={<VocabQuiz />} />
          <Route path="/english/idioms" element={<IdiomsHub />} />
          <Route path="/english/idioms/library" element={<IdiomLibrary />} />
          <Route path="/english/idioms/quiz" element={<IdiomQuiz />} />
        </Route>
      </Routes>
    </HashRouter>
  )
}
