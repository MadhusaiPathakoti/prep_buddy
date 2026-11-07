import { lazy, Suspense } from 'react'
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import ErrorBoundary from './components/ErrorBoundary'
import Layout from './components/Layout'
const Home = lazy(() => import('./pages/Home'))
const NotFound = lazy(() => import('./pages/NotFound'))
const Maths = lazy(() => import('./pages/Maths'))
const SquareCubeRoots = lazy(() => import('./pages/games/SquareCubeRoots'))
const QuadraticEquations = lazy(() => import('./pages/games/QuadraticEquations'))
const SeriesWarmup = lazy(() => import('./pages/games/SeriesWarmup'))
const FlashChain = lazy(() => import('./pages/games/FlashChain'))
const MentalMemory = lazy(() => import('./pages/games/MentalMemory'))
const BeatTheClock = lazy(() => import('./pages/games/BeatTheClock'))
const MultiplyNearBase = lazy(() => import('./pages/games/MultiplyNearBase'))
const PercentageOfNumber = lazy(() => import('./pages/games/PercentageOfNumber'))
const Approximation = lazy(() => import('./pages/games/Approximation'))
const CompareFractions = lazy(() => import('./pages/games/CompareFractions'))
const SuccessivePercent = lazy(() => import('./pages/games/SuccessivePercent'))
const MissingDigit = lazy(() => import('./pages/games/MissingDigit'))
const AdditionsPractice = lazy(() => import('./pages/games/AdditionsPractice'))
const SubtractionPractice = lazy(() => import('./pages/games/SubtractionPractice'))
const DivisionPractice = lazy(() => import('./pages/games/DivisionPractice'))
const TablesPractice = lazy(() => import('./pages/games/TablesPractice'))
const SquaresCubes = lazy(() => import('./pages/games/SquaresCubes'))
const RatioPercent = lazy(() => import('./pages/games/RatioPercent'))
const PercentToRatio = lazy(() => import('./pages/games/PercentToRatio'))
const PythagoreanTriplets = lazy(() => import('./pages/games/PythagoreanTriplets'))
const TwinNumberProducts = lazy(() => import('./pages/games/TwinNumberProducts'))
const Reasoning = lazy(() => import('./pages/Reasoning'))
const AlphaNumericTest = lazy(() => import('./pages/games/AlphaNumericTest'))
const StatementConclusions = lazy(() => import('./pages/games/StatementConclusions'))
const NumberLetterSeries = lazy(() => import('./pages/games/NumberLetterSeries'))
const CodingDecoding = lazy(() => import('./pages/games/CodingDecoding'))
const Syllogism = lazy(() => import('./pages/games/Syllogism'))
const BloodRelations = lazy(() => import('./pages/games/BloodRelations'))
const DirectionSense = lazy(() => import('./pages/games/DirectionSense'))
const RankingOrder = lazy(() => import('./pages/games/RankingOrder'))
const InputOutput = lazy(() => import('./pages/games/InputOutput'))
const Divisibility = lazy(() => import('./pages/games/Divisibility'))
const PercentDegree = lazy(() => import('./pages/games/PercentDegree'))
const English = lazy(() => import('./pages/English'))
const VocabularyHub = lazy(() => import('./pages/vocabulary/VocabularyHub'))
const VocabLibrary = lazy(() => import('./pages/vocabulary/VocabLibrary'))
const VocabQuiz = lazy(() => import('./pages/vocabulary/VocabQuiz'))
const AddWord = lazy(() => import('./pages/vocabulary/AddWord'))
const IdiomsHub = lazy(() => import('./pages/idioms/IdiomsHub'))
const IdiomLibrary = lazy(() => import('./pages/idioms/IdiomLibrary'))
const IdiomQuiz = lazy(() => import('./pages/idioms/IdiomQuiz'))
const AddIdiom = lazy(() => import('./pages/idioms/AddIdiom'))
const OneWordHub = lazy(() => import('./pages/onewordsub/OneWordHub'))
const OneWordLibrary = lazy(() => import('./pages/onewordsub/OneWordLibrary'))
const OneWordQuiz = lazy(() => import('./pages/onewordsub/OneWordQuiz'))
const AddOneWord = lazy(() => import('./pages/onewordsub/AddOneWord'))
const PhrasalVerbsHub = lazy(() => import('./pages/phrasalverbs/PhrasalVerbsHub'))
const PhrasalVerbsLibrary = lazy(() => import('./pages/phrasalverbs/PhrasalVerbsLibrary'))
const PhrasalVerbsQuiz = lazy(() => import('./pages/phrasalverbs/PhrasalVerbsQuiz'))
const AddPhrasalVerb = lazy(() => import('./pages/phrasalverbs/AddPhrasalVerb'))
const SynonymsHub = lazy(() => import('./pages/synonyms/SynonymsHub'))
const SynonymsQuiz = lazy(() => import('./pages/synonyms/SynonymsQuiz'))
const AntonymsHub = lazy(() => import('./pages/antonyms/AntonymsHub'))
const AntonymsQuiz = lazy(() => import('./pages/antonyms/AntonymsQuiz'))
const WordBankLibrary = lazy(() => import('./pages/wordbank/WordBankLibrary'))
const AddWordBankEntry = lazy(() => import('./pages/wordbank/AddWordBankEntry'))
const PhraseRearrangement = lazy(() => import('./pages/games/PhraseRearrangement'))
const Fillers = lazy(() => import('./pages/games/Fillers'))
const ErrorDetection = lazy(() => import('./pages/games/ErrorDetection'))
const ClozeTest = lazy(() => import('./pages/games/ClozeTest'))
const ParaJumble = lazy(() => import('./pages/games/ParaJumble'))
const SentenceImprovement = lazy(() => import('./pages/games/SentenceImprovement'))
const LcmHcfSimplification = lazy(() => import('./pages/games/LcmHcfSimplification'))
const GrammarHub = lazy(() => import('./pages/grammar/GrammarHub'))
const RuleLab = lazy(() => import('./pages/grammar/RuleLab'))
const RuleCard = lazy(() => import('./pages/grammar/RuleCard'))
const SpotTheRule = lazy(() => import('./pages/grammar/SpotTheRule'))
const MasteryMap = lazy(() => import('./pages/grammar/MasteryMap'))
const FixIt = lazy(() => import('./pages/grammar/FixIt'))
const RuleDuel = lazy(() => import('./pages/grammar/RuleDuel'))
const RuleSort = lazy(() => import('./pages/grammar/RuleSort'))
const MocksHome = lazy(() => import('./pages/mocks/MocksHome'))
const MockExam = lazy(() => import('./pages/mocks/MockExam'))
const MockLaunch = lazy(() => import('./pages/mocks/MockLaunch'))
const MockTest = lazy(() => import('./pages/mocks/MockTest'))
const MockResult = lazy(() => import('./pages/mocks/MockResult'))
const MockHistory = lazy(() => import('./pages/mocks/MockHistory'))
const DailyHome = lazy(() => import('./pages/daily/DailyHome'))
const DailyQuiz = lazy(() => import('./pages/daily/DailyQuiz'))

export default function App() {
  return (
    <HashRouter>
      {/* the exam window sits outside Layout, so it needs its own boundary and loading state */}
      <ErrorBoundary>
        <Suspense fallback={null}>
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
          <Route path="*" element={<NotFound />} />
        </Route>
        {/* The exam window is deliberately outside Layout: like the real test software, it fills the screen with no site header. */}
        <Route path="/mocks/test/:attemptId" element={<MockTest />} />
      </Routes>
        </Suspense>
      </ErrorBoundary>
    </HashRouter>
  )
}
