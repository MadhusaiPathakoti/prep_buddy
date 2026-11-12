/**
 * Random "ingredients" sent with every AI request so that no two sentences come out alike, even for the same rule:
 * a setting, a register, a length, a couple of prompt words and (sometimes) a name. With ~70 × 10 × 4 × 150² × 40 combinations
 * the model is never asked the same thing twice.
 */

const THEMES = [
  'a cricket match', 'a railway platform at dawn', 'a village wedding', 'a hospital ward', 'a monsoon evening', 'a school science fair',
  'a start-up office', 'a vegetable market', 'a bank branch', 'a mountain trek', 'a cooking competition', 'a college library',
  'a cyclone warning', 'a film shoot', 'a temple festival', 'an airport check-in', 'a lost wallet', 'a software update',
  'a traffic jam', 'a Diwali sale', 'a chess tournament', 'an old river bridge', 'a night of stargazing', 'a courtroom hearing',
  'a family road trip', 'a cooperative society meeting', 'a newspaper office', 'a museum visit', 'a marathon', 'a cattle fair',
  'a power cut', 'a first day at a new job', 'a hostel mess', 'a cycling club', 'a wildlife sanctuary', 'a tea estate',
  'a lighthouse', 'an e-commerce warehouse', 'a pottery workshop', 'a drone demonstration', 'a tailor shop', 'a flooded street',
  'a robotics lab', 'a bus stand', 'a street food stall', 'a classical music concert', 'a post office', 'a solar farm',
  'a kabaddi match', 'a hill-station hotel', 'a weather forecast', 'a spelling bee', 'a metro station', 'a fishing harbour',
  'a quiz night', 'a yoga camp', 'an art gallery', 'a mobile repair shop', 'a village panchayat', 'a space mission',
  'a dairy farm', 'a bookshop sale', 'an interview panel', 'a rainy cricket practice', 'a coaching class', 'a coconut grove',
  'a lost-and-found counter', 'a city park', 'a textile mill', 'a school assembly', 'an old clock tower', 'a charity auction',
]

const REGISTERS = [
  'everyday conversation', 'a news report', 'a formal email', 'a textbook explanation', 'a short story', 'a diary entry',
  'a product review', 'a public announcement', 'a speech', 'a travel blog', 'a newspaper editorial', 'a notice-board message',
]

const LENGTHS = ['8 to 12 words', '12 to 16 words', '16 to 22 words', '20 to 26 words']

const WORDS = [
  'lantern', 'ledger', 'harvest', 'umbrella', 'telescope', 'bridge', 'whistle', 'compass', 'ticket', 'orchard', 'schedule', 'invoice',
  'monsoon', 'engine', 'blanket', 'canvas', 'festival', 'harbour', 'journey', 'kettle', 'library', 'meadow', 'neighbour', 'parcel',
  'quarrel', 'rehearsal', 'scholarship', 'tractor', 'uniform', 'village', 'workshop', 'yesterday', 'zebra', 'balcony', 'cabinet',
  'deadline', 'envelope', 'fountain', 'gadget', 'horizon', 'inspector', 'jacket', 'kitchen', 'laboratory', 'mountain', 'notebook',
  'office', 'passenger', 'queue', 'receipt', 'station', 'teacher', 'umpire', 'volunteer', 'wallet', 'exhibition', 'yoghurt', 'antique',
  'bakery', 'chimney', 'drizzle', 'elephant', 'farmer', 'garden', 'hammer', 'island', 'jungle', 'keyboard', 'lecture', 'market',
  'nursery', 'ocean', 'pencil', 'quilt', 'river', 'signal', 'tunnel', 'upgrade', 'vaccine', 'window', 'attendant', 'brochure',
  'customer', 'diploma', 'experiment', 'forecast', 'grocer', 'helmet', 'itinerary', 'judge', 'knitting', 'lorry', 'manager', 'novel',
  'opinion', 'proposal', 'quotation', 'reporter', 'sculptor', 'trophy', 'violin', 'warehouse', 'passport', 'bicycle', 'clinic', 'cottage',
  'delivery', 'electrician', 'ferry', 'goat', 'hostel', 'inventor', 'jewellery', 'kite', 'lighthouse', 'mechanic', 'nurse', 'optician',
  'painter', 'rainfall', 'sailor', 'tailor', 'unveiling', 'veranda', 'weaver', 'archive', 'beehive', 'caravan', 'dormitory', 'estate',
  'flood', 'granary', 'hawker', 'ingredient', 'junction', 'kerosene', 'landslide', 'museum', 'notice', 'orchestra', 'platform', 'radio',
]

const NAMES = [
  'Meera', 'Arjun', 'Kavya', 'Rohan', 'Ananya', 'Vikram', 'Divya', 'Karthik', 'Priya', 'Imran', 'Sneha', 'Harish', 'Neha', 'Gopal',
  'Fatima', 'Suresh', 'Lakshmi', 'Tarun', 'Pooja', 'Rahul', 'Zoya', 'Manoj', 'Isha', 'Dev', 'Nandini', 'Aarav', 'Bhavna', 'Chetan',
  'Deepa', 'Faisal', 'Gauri', 'Hari', 'Indira', 'Jatin', 'Kiran', 'Lata', 'Mohan', 'Nisha', 'Omar', 'Radhika',
]

export const pickOne = <T,>(a: readonly T[]): T => a[Math.floor(Math.random() * a.length)]

/** `n` distinct random entries. */
export function pickMany<T>(a: readonly T[], n: number): T[] {
  const copy = [...a]
  const out: T[] = []
  while (out.length < n && copy.length > 0) out.push(copy.splice(Math.floor(Math.random() * copy.length), 1)[0])
  return out
}

export interface SentenceSeed {
  theme: string
  register: string
  length: string
  words: string[]
  name: string
}

export function randomSeed(): SentenceSeed {
  return {
    theme: pickOne(THEMES),
    register: pickOne(REGISTERS),
    length: pickOne(LENGTHS),
    words: pickMany(WORDS, 2),
    name: Math.random() < 0.5 ? pickOne(NAMES) : '',
  }
}
