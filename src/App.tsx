import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout'
import Home from './pages/Home'
import Maths from './pages/Maths'
import SquareCubeRoots from './pages/games/SquareCubeRoots'
import QuadraticEquations from './pages/games/QuadraticEquations'
import SeriesWarmup from './pages/games/SeriesWarmup'
import FlashChain from './pages/games/FlashChain'
import MentalMemory from './pages/games/MentalMemory'
import BeatTheClock from './pages/games/BeatTheClock'
import MultiplyNearBase from './pages/games/MultiplyNearBase'
import PercentageOfNumber from './pages/games/PercentageOfNumber'
import Approximation from './pages/games/Approximation'
import CompareFractions from './pages/games/CompareFractions'
import SuccessivePercent from './pages/games/SuccessivePercent'
import MissingDigit from './pages/games/MissingDigit'
import AdditionsPractice from './pages/games/AdditionsPractice'
import SubtractionPractice from './pages/games/SubtractionPractice'
import DivisionPractice from './pages/games/DivisionPractice'
import TablesPractice from './pages/games/TablesPractice'
import SquaresCubes from './pages/games/SquaresCubes'
import RatioPercent from './pages/games/RatioPercent'
import PercentToRatio from './pages/games/PercentToRatio'
import PythagoreanTriplets from './pages/games/PythagoreanTriplets'
import TwinNumberProducts from './pages/games/TwinNumberProducts'
import Reasoning from './pages/Reasoning'
import AlphaNumericTest from './pages/games/AlphaNumericTest'
import StatementConclusions from './pages/games/StatementConclusions'
import NumberLetterSeries from './pages/games/NumberLetterSeries'
import CodingDecoding from './pages/games/CodingDecoding'
import Syllogism from './pages/games/Syllogism'
import BloodRelations from './pages/games/BloodRelations'
import DirectionSense from './pages/games/DirectionSense'
import RankingOrder from './pages/games/RankingOrder'
import InputOutput from './pages/games/InputOutput'
import Divisibility from './pages/games/Divisibility'
import PercentDegree from './pages/games/PercentDegree'
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
import AddPhrasalVerb from './pages/phrasalverbs/AddPhrasalVerb'
import SynonymsHub from './pages/synonyms/SynonymsHub'
import SynonymsQuiz from './pages/synonyms/SynonymsQuiz'
import AntonymsHub from './pages/antonyms/AntonymsHub'
import AntonymsQuiz from './pages/antonyms/AntonymsQuiz'
import WordBankLibrary from './pages/wordbank/WordBankLibrary'
import AddWordBankEntry from './pages/wordbank/AddWordBankEntry'
import PhraseRearrangement from './pages/games/PhraseRearrangement'
import Fillers from './pages/games/Fillers'
import ErrorDetection from './pages/games/ErrorDetection'
import ClozeTest from './pages/games/ClozeTest'
import ParaJumble from './pages/games/ParaJumble'
import SentenceImprovement from './pages/games/SentenceImprovement'
import LcmHcfSimplification from './pages/games/LcmHcfSimplification'
import GrammarHub from './pages/grammar/GrammarHub'
import RuleLab from './pages/grammar/RuleLab'
import RuleCard from './pages/grammar/RuleCard'
import SpotTheRule from './pages/grammar/SpotTheRule'
import MasteryMap from './pages/grammar/MasteryMap'
import FixIt from './pages/grammar/FixIt'
import RuleDuel from './pages/grammar/RuleDuel'
import RuleSort from './pages/grammar/RuleSort'
import MocksHome from './pages/mocks/MocksHome'
import MockExam from './pages/mocks/MockExam'
import MockLaunch from './pages/mocks/MockLaunch'
import MockTest from './pages/mocks/MockTest'
import MockResult from './pages/mocks/MockResult'
import MockHistory from './pages/mocks/MockHistory'
import DailyHome from './pages/daily/DailyHome'
import DailyQuiz from './pages/daily/DailyQuiz'

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Home />} />
          <Route path="/maths" element={<Maths />} />
          <Route path="/maths/multiply-near-base" element={<MultiplyNearBase />} />
          <Route path="/maths/percentage-of-number" element={<PercentageOfNumber />} />
          <Route path="/maths/approximation" element={<Approximation />} />
          <Route path="/maths/compare-fractions" element={<CompareFractions />} />
          <Route path="/maths/successive-percent" element={<SuccessivePercent />} />
          <Route path="/maths/missing-digit" element={<MissingDigit />} />
          <Route path="/maths/square-cube-roots" element={<SquareCubeRoots />} />
          <Route path="/maths/quadratic-equations" element={<QuadraticEquations />} />
          <Route path="/maths/series-warmup" element={<SeriesWarmup />} />
          <Route path="/maths/flash-chain" element={<FlashChain />} />
          <Route path="/maths/mental-memory" element={<MentalMemory />} />
          <Route path="/maths/beat-the-clock" element={<BeatTheClock />} />
          {/* The old Speed Math and Quant hubs are now one Maths hub; their games keep their URLs. */}
          <Route path="/speed-math" element={<Navigate to="/maths" replace />} />
          <Route path="/quant" element={<Navigate to="/maths" replace />} />
          <Route path="/speed-math/additions" element={<AdditionsPractice />} />
          <Route path="/speed-math/subtraction" element={<SubtractionPractice />} />
          <Route path="/speed-math/division" element={<DivisionPractice />} />
          <Route path="/speed-math/tables" element={<TablesPractice />} />
          <Route path="/speed-math/squares-cubes" element={<SquaresCubes />} />
          <Route path="/speed-math/ratios" element={<RatioPercent />} />
          <Route path="/speed-math/percent-to-ratio" element={<PercentToRatio />} />
          <Route path="/speed-math/pythagorean-triplets" element={<PythagoreanTriplets />} />
          <Route path="/speed-math/twin-number-products" element={<TwinNumberProducts />} />
          <Route path="/speed-math/lcm-hcf-simplification" element={<LcmHcfSimplification />} />
          <Route path="/reasoning" element={<Reasoning />} />
          <Route path="/reasoning/alpha-numeric-test" element={<AlphaNumericTest />} />
          <Route path="/reasoning/statement-conclusions" element={<StatementConclusions />} />
          <Route path="/reasoning/number-letter-series" element={<NumberLetterSeries />} />
          <Route path="/reasoning/coding-decoding" element={<CodingDecoding />} />
          <Route path="/reasoning/syllogism" element={<Syllogism />} />
          <Route path="/reasoning/blood-relations" element={<BloodRelations />} />
          <Route path="/reasoning/direction-sense" element={<DirectionSense />} />
          <Route path="/reasoning/ranking-order" element={<RankingOrder />} />
          <Route path="/reasoning/input-output" element={<InputOutput />} />
          <Route path="/quant/divisibility" element={<Divisibility />} />
          <Route path="/quant/percent-degree" element={<PercentDegree />} />
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
          <Route path="/english/phrasal-verbs/add" element={<AddPhrasalVerb />} />
          <Route path="/english/synonyms" element={<SynonymsHub />} />
          <Route path="/english/synonyms/quiz" element={<SynonymsQuiz />} />
          <Route path="/english/antonyms" element={<AntonymsHub />} />
          <Route path="/english/antonyms/quiz" element={<AntonymsQuiz />} />
          <Route path="/english/word-bank/library" element={<WordBankLibrary />} />
          <Route path="/english/word-bank/add" element={<AddWordBankEntry />} />
          <Route path="/english/phrase-rearrangement" element={<PhraseRearrangement />} />
          <Route path="/english/fillers" element={<Fillers />} />
          <Route path="/english/error-detection" element={<ErrorDetection />} />
          <Route path="/english/cloze-test" element={<ClozeTest />} />
          <Route path="/english/para-jumble" element={<ParaJumble />} />
          <Route path="/english/sentence-improvement" element={<SentenceImprovement />} />
          <Route path="/english/grammar-rules" element={<GrammarHub />} />
          <Route path="/english/grammar-rules/lab" element={<RuleLab />} />
          <Route path="/english/grammar-rules/lab/:id" element={<RuleCard />} />
          <Route path="/english/grammar-rules/spot" element={<SpotTheRule />} />
          <Route path="/english/grammar-rules/fix-it" element={<FixIt />} />
          <Route path="/english/grammar-rules/duel" element={<RuleDuel />} />
          <Route path="/english/grammar-rules/sort" element={<RuleSort />} />
          <Route path="/english/grammar-rules/map" element={<MasteryMap />} />
          <Route path="/daily" element={<DailyHome />} />
          <Route path="/daily/:section" element={<DailyQuiz />} />
          <Route path="/mocks" element={<MocksHome />} />
          <Route path="/mocks/history" element={<MockHistory />} />
          <Route path="/mocks/result/:attemptId" element={<MockResult />} />
          <Route path="/mocks/:exam" element={<MockExam />} />
          <Route path="/mocks/:exam/:kind" element={<MockLaunch />} />
        </Route>
        {/* The exam window is deliberately outside Layout: like the real test software, it fills the screen with no site header. */}
        <Route path="/mocks/test/:attemptId" element={<MockTest />} />
      </Routes>
    </HashRouter>
  )
}
