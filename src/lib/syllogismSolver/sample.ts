// Example questions for the Syllogism Solver — one for every kind of answer. `answer` is checked by scripts/verify-syllogism-solver.ts.

export interface Sample {
  id: string
  title: string
  answer: 'A' | 'B' | 'C' | 'D' | 'E'
  text: string
}

export const SAMPLES: Sample[] = [
  {
    id: 'either',
    title: 'Clocks, keys & mobiles',
    answer: 'C',
    text: `Statements:
All clocks are keys.
Some keys are not mobiles.
No mobile is a car.
All cars are tables.
Conclusions:
I. No clock is a mobile.
II. Some clocks are mobiles.`,
  },
  {
    id: 'only-1',
    title: 'Only I',
    answer: 'A',
    text: `Statements:
All pens are books.
All books are tables.
Conclusions:
I. All pens are tables.
II. No table is a pen.`,
  },
  {
    id: 'only-2',
    title: 'Only II',
    answer: 'B',
    text: `Statements:
Some cars are roads.
All roads are trees.
Conclusions:
I. All cars are trees.
II. Some cars are trees.`,
  },
  {
    id: 'neither',
    title: 'Neither',
    answer: 'D',
    text: `Statements:
Some birds are flowers.
Some flowers are stones.
Conclusions:
I. Some stones are birds.
II. All birds are stones.`,
  },
  {
    id: 'both',
    title: 'Both',
    answer: 'E',
    text: `Statements:
All rivers are cars.
No car is a house.
Conclusions:
I. No river is a house.
II. Some cars are not houses.`,
  },
  {
    id: 'possibility',
    title: 'Possibility',
    answer: 'A',
    text: `Statements:
All lamps are boxes.
Some boxes are bags.
Conclusions:
I. Some lamps can be bags.
II. No lamp is a bag.`,
  },
  {
    id: 'few',
    title: 'Only a few',
    answer: 'A',
    text: `Statements:
Only a few pens are books.
All books are tables.
Conclusions:
I. Some pens are tables.
II. Some pens are not tables.`,
  },
]
