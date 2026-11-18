// The question bank's topics, for the serverless functions. Keep in step with BANK_TOPICS in src/lib/qbank/types.ts;
// scripts/verify-qb-add.ts compares the two so they cannot drift apart.

export const TOPICS = [
  ['simplification', 'Simplification'],
  ['approximation', 'Approximation'],
  ['wrong-number-series', 'Wrong Number Series'],
  ['missing-number-series', 'Missing Number Series'],
  ['quadratic-equations', 'Quadratic Equations'],
  ['quantity-comparison', 'Quantity Comparison'],
  ['percentage', 'Percentage'],
  ['profit-loss', 'Profit & Loss'],
  ['ratio-partnership', 'Ratio & Partnership'],
  ['ages-averages', 'Ages & Averages'],
  ['interest', 'Simple & Compound Interest'],
  ['time-work', 'Time & Work'],
  ['speed-distance', 'Time, Speed & Distance'],
  ['mixture-alligation', 'Mixture & Alligation'],
  ['mensuration', 'Mensuration'],
  ['probability-pnc', 'Probability & P&C'],
  ['number-system', 'Number System'],
  ['other', 'Other / Mixed'],
]

export const TOPIC_IDS = TOPICS.map(([id]) => id)
export const isTopic = (value) => typeof value === 'string' && TOPIC_IDS.includes(value)
export const DIFFICULTIES = ['easy', 'medium', 'hard']
