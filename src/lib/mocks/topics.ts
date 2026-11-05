import type { MockSectionId, MockTopicId, TopicInfo } from './types'

export const TOPICS: TopicInfo[] = [
  // Quant
  { id: 'simplification', section: 'quant', label: 'Simplification', blurb: 'BODMAS with fractions, decimals, powers and roots' },
  { id: 'approximation', section: 'quant', label: 'Approximation', blurb: 'Estimate the value of a long expression' },
  { id: 'wrong-number-series', section: 'quant', label: 'Wrong Number Series', blurb: 'Spot the term that breaks the pattern' },
  { id: 'missing-number-series', section: 'quant', label: 'Missing Number Series', blurb: 'Find the missing term' },
  { id: 'quadratic-equations', section: 'quant', label: 'Quadratic Equations', blurb: 'Compare the roots of two equations' },
  { id: 'quantity-comparison', section: 'quant', label: 'Quantity Comparison', blurb: 'Compare Quantity I and Quantity II' },
  { id: 'di-table', section: 'quant', label: 'DI: Table', blurb: 'Tabular data interpretation sets' },
  { id: 'di-bar', section: 'quant', label: 'DI: Bar Graph', blurb: 'Bar graph (simple, double, stacked) sets' },
  { id: 'di-pie', section: 'quant', label: 'DI: Pie Chart', blurb: 'Pie chart sets' },
  { id: 'di-line', section: 'quant', label: 'DI: Line Graph', blurb: 'Line graph sets' },
  { id: 'di-caselet', section: 'quant', label: 'DI: Caselet', blurb: 'Data given in a paragraph or Venn-style caselet' },
  { id: 'percentage', section: 'quant', label: 'Percentage', blurb: 'Percentage change, population and expenditure problems' },
  { id: 'profit-loss', section: 'quant', label: 'Profit & Loss', blurb: 'Profit, loss, discount and marked price' },
  { id: 'ratio-partnership', section: 'quant', label: 'Ratio & Partnership', blurb: 'Ratios, proportion and partnership' },
  { id: 'ages-averages', section: 'quant', label: 'Ages & Averages', blurb: 'Age problems and averages' },
  { id: 'interest', section: 'quant', label: 'Simple & Compound Interest', blurb: 'SI, CI and their difference' },
  { id: 'time-work', section: 'quant', label: 'Time & Work', blurb: 'Work, efficiency, pipes and cisterns' },
  { id: 'speed-distance', section: 'quant', label: 'Time, Speed & Distance', blurb: 'Trains, boats & streams, relative speed' },
  { id: 'mixture-alligation', section: 'quant', label: 'Mixture & Alligation', blurb: 'Mixtures, replacement and alligation' },
  { id: 'mensuration', section: 'quant', label: 'Mensuration', blurb: 'Areas and volumes' },
  { id: 'probability-pnc', section: 'quant', label: 'Probability & P&C', blurb: 'Permutation, combination and probability' },
  { id: 'number-system', section: 'quant', label: 'Number System', blurb: 'LCM/HCF, remainders and number properties' },

  // Reasoning
  { id: 'seating-linear', section: 'reasoning', label: 'Seating: Linear', blurb: 'Single and double row arrangements' },
  { id: 'seating-circular', section: 'reasoning', label: 'Seating: Circular / Square', blurb: 'Circular, square and rectangular tables' },
  { id: 'puzzle-floor', section: 'reasoning', label: 'Puzzle: Floor / Flat', blurb: 'Floors or flats with persons and attributes' },
  { id: 'puzzle-schedule', section: 'reasoning', label: 'Puzzle: Month / Day / Post', blurb: 'Months, days or posts with persons and attributes' },
  { id: 'puzzle-box', section: 'reasoning', label: 'Puzzle: Box / Stack', blurb: 'Boxes or stacks with items and colours' },
  { id: 'puzzle-comparison', section: 'reasoning', label: 'Comparison Puzzle', blurb: 'Who is taller/heavier/older from given comparisons' },
  { id: 'syllogism', section: 'reasoning', label: 'Syllogism', blurb: 'Which conclusions follow from the statements' },
  { id: 'inequality', section: 'reasoning', label: 'Inequality', blurb: 'Direct and coded inequalities' },
  { id: 'blood-relation', section: 'reasoning', label: 'Blood Relations', blurb: 'Family relationships' },
  { id: 'direction-distance', section: 'reasoning', label: 'Direction & Distance', blurb: 'Directions, shortest distance and final position' },
  { id: 'coding-decoding', section: 'reasoning', label: 'Coding-Decoding', blurb: 'Letter, number and word codes' },
  { id: 'sentence-coding', section: 'reasoning', label: 'Sentence Coding', blurb: 'Decode words from coded sentences' },
  { id: 'alphanumeric-series', section: 'reasoning', label: 'Alphanumeric Series', blurb: 'Mixed letter-number-symbol series' },
  { id: 'order-ranking', section: 'reasoning', label: 'Order & Ranking', blurb: 'Rank, position and counting questions' },
  { id: 'reasoning-misc', section: 'reasoning', label: 'Pair Formation / Odd One Out', blurb: 'Word-based and pairing miscellany' },

  // English
  { id: 'rc', section: 'english', label: 'Reading Comprehension', blurb: 'Passage with 5+ questions' },
  { id: 'cloze', section: 'english', label: 'Cloze Test', blurb: 'Passage with numbered blanks' },
  { id: 'error-detection', section: 'english', label: 'Error Detection', blurb: 'Find the part of the sentence with the error' },
  { id: 'para-jumble', section: 'english', label: 'Para Jumble', blurb: 'Rearrange sentences into a coherent paragraph' },
  { id: 'fillers', section: 'english', label: 'Fillers', blurb: 'Single and double blank sentences' },
  { id: 'word-swap', section: 'english', label: 'Word Swap', blurb: 'Swap two words to fix the sentence' },
  { id: 'phrase-replacement', section: 'english', label: 'Phrase Replacement', blurb: 'Replace the highlighted phrase' },
  { id: 'match-column', section: 'english', label: 'Match the Column', blurb: 'Pair sentence halves from two columns' },
  // Daily Dose only (word-bank based)
  { id: 'vocab-quiz', section: 'english', label: 'Vocabulary', blurb: 'Meaning of a word', dailyOnly: true },
  { id: 'idioms', section: 'english', label: 'Idioms & Phrases', blurb: 'Meaning of an idiom', dailyOnly: true },
  { id: 'phrasal-verbs', section: 'english', label: 'Phrasal Verbs', blurb: 'Meaning of a phrasal verb', dailyOnly: true },
  { id: 'one-word', section: 'english', label: 'One-Word Substitution', blurb: 'One word for a phrase', dailyOnly: true },
]

export const TOPIC_BY_ID: Record<string, TopicInfo> = Object.fromEntries(TOPICS.map((t) => [t.id, t]))

export function topicsOf(section: MockSectionId): TopicInfo[] {
  return TOPICS.filter((t) => t.section === section && !t.dailyOnly)
}

export function topicLabel(id: MockTopicId): string {
  return TOPIC_BY_ID[id]?.label ?? id
}

/** Topics whose questions come in sets sharing a stimulus; the value is the natural set size. */
export const SET_SIZE: Partial<Record<MockTopicId, number>> = {
  'di-table': 5,
  'di-bar': 5,
  'di-pie': 5,
  'di-line': 5,
  'di-caselet': 5,
  'seating-linear': 5,
  'seating-circular': 5,
  'puzzle-floor': 5,
  'puzzle-schedule': 5,
  'puzzle-box': 5,
  'puzzle-comparison': 3,
  'alphanumeric-series': 5,
  'sentence-coding': 5,
  rc: 8,
  cloze: 5,
}
