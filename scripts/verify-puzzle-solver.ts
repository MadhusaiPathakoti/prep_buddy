// Verification harness for the Puzzle Solver.  Run:  npx tsx scripts/verify-puzzle-solver.ts   (RUNS=n to change the random-puzzle count)
//
//  1. Parser: a table of exam phrasings, each compared with the English reading we expect.
//  2. Engine vs brute force: random puzzles (random hidden arrangement, random TRUE clues of every type, with and without negation)
//     are solved by the engine and by plain enumeration of every arrangement; the solution counts must be identical.
//  3. Soundness of the teaching trace: no step ever crosses out a cell of a real solution, every crossing has a reason,
//     the final arrangement satisfies every clue, and every "what if it were here instead" simulation ends in a contradiction.
import { createRng } from '../src/lib/mocks/rng'
import { MAINS_ARRANGE_WITH_PROOF } from '../src/lib/mocks/reasoning/mains/arrange'
import { Ctx } from '../src/lib/puzzleSolver/core'
import { anchorPerson, enumerate } from '../src/lib/puzzleSolver/engine'
import { parsePuzzle } from '../src/lib/puzzleSolver/parse'
import { SAMPLES } from '../src/lib/puzzleSolver/sample'
import { applyEvents, buildTrace, simulate } from '../src/lib/puzzleSolver/trace'
import type { Atom, Puzzle, Solution, Term } from '../src/lib/puzzleSolver/types'

const RUNS = Number(process.env.RUNS ?? 300)
let failures = 0
const fail = (msg: string) => {
  failures++
  if (failures <= 40) console.error('FAIL', msg)
}

// ─── 1. parser table ─────────────────────────────────────────────────────────

const FLOOR_HEADER = `Eight persons - A, B, C, D, E, F, G, H - live on eight different floors of a building, such that the lowermost floor is numbered 1 and the topmost floor is numbered 8.
Each of them is from a different city - Nagpur, Delhi, Bhopal, Kolkata, Pune, Jaipur, Mumbai, Patna.
`

const ROW_HEADER = `Six friends - A, B, C, D, E and F - are sitting in a row. Each of them likes a different colour - Red, Blue, Green, Yellow, Pink, Black.
`

const FLOOR_CASES: [string, string][] = [
  ['A lives on the 3rd floor.', 'A is on floor 3'],
  ['A lives on floor 5.', 'A is on floor 5'],
  ['B lives on an odd numbered floor.', 'B is on an odd-numbered floor'],
  ['B lives on an even-numbered floor.', 'B is on an even-numbered floor'],
  ['C does not live on the topmost floor.', 'C is not on the topmost floor'],
  ["C doesn't live on the lowest floor.", 'C is not on the lowest floor'],
  ['D lives on the second floor from the top.', 'D is on floor 7'],
  ['D lives on the third floor from the bottom.', 'D is on floor 3'],
  ['E lives immediately above F.', 'E is immediately above F'],
  ['E lives directly below F.', 'E is immediately below F'],
  ['E lives just above F.', 'E is immediately above F'],
  ['E lives exactly three floors above F.', 'E is exactly 3 floors above F'],
  ['G lives two floors below H.', 'G is exactly 2 floors below H'],
  ['E lives somewhere above F.', 'E is somewhere above F'],
  ['E lives above F.', 'E is somewhere above F'],
  ['E does not live immediately above F.', 'E is not immediately above F'],
  ['E and F live on adjacent floors.', 'E and F are on neighbouring floors'],
  ['E lives next to F.', 'E and F are on neighbouring floors'],
  ['Three persons live between E and F.', 'exactly 3 people between E and F'],
  ['Exactly one person lives between E and F.', 'exactly 1 person between E and F'],
  ['No one lives between E and F.', 'exactly 0 people between E and F'],
  ['There are two persons between E and F.', 'exactly 2 people between E and F'],
  ['E lives between F and G.', 'E is between F and G'],
  ['The person from Delhi lives on the topmost floor.', 'the Delhi person is on the topmost floor'],
  ['The person who is from Delhi lives immediately above A.', 'the Delhi person is immediately above A'],
  ['The one from Delhi lives immediately above A.', 'the Delhi person is immediately above A'],
  ['A lives immediately above the person from Pune.', 'A is immediately above the Pune person'],
  ['A is from Delhi.', "A's city is Delhi"],
  ['A is not from Delhi.', "A's city is not Delhi"],
  ['A comes from Delhi.', "A's city is Delhi"],
  ['A is neither from Delhi nor from Pune.', "A's city is not Delhi ; A's city is not Pune"],
  ['A, who is from Delhi, lives on the topmost floor.', "A's city is Delhi ; A is on the topmost floor"],
  ['A lives immediately below B and is from Delhi.', "A is immediately below B ; A's city is Delhi"],
  ['A lives on the topmost floor and B lives on the lowest floor.', 'A is on the topmost floor ; B is on the lowest floor'],
  ['The person from Delhi lives two floors above the person from Pune.', 'the Delhi person is exactly 2 floors above the Pune person'],
  ['F lives on either floor 2 or floor 4.', 'F is on floor 2 or 4'],
  ['G does not live on any of the odd numbered floors.', 'G is not on an odd-numbered floor'],
  ['A lives on a floor immediately above the floor of B.', 'A is immediately above B'],
  ['A lives on either the topmost or the lowest floor.', 'A is on either the topmost or the lowest floor'],
  ['Two persons live above A.', 'A is on floor 6'],
  ['Three persons live below A.', 'A is on floor 4'],
  ['Only one person lives above A.', 'A is on floor 7'],
  ['No one lives below A.', 'A is on the lowest floor'],
  ['A lives on one of the floors above B.', 'A is somewhere above B'],
  ['A does not live on any of the floors below B.', 'A is not somewhere below B'],
  ['Neither A nor B lives on the topmost floor.', 'A is not on the topmost floor ; B is not on the topmost floor'],
  ['Both A and B live on odd numbered floors.', 'A is on an odd-numbered floor ; B is on an odd-numbered floor'],
  ['A and B do not live on the lowest floor.', 'A is not on the lowest floor ; B is not on the lowest floor'],
  ['A lives on a higher floor than B.', 'A is somewhere above B'],
  ['A lives on a lower floor than B.', 'A is somewhere below B'],
  ['A lives immediately above B.', 'A is immediately above B'],
]

const FLOOR_VIZ: [string, string][] = [
  ['As many floors between A and B is same as between C and D.', 'the same number of people between A and B as between C and D'],
  ['The number of floors above A is the same as the number of floors below B.', 'as many people above A as below B'],
  ['A stays on an even-numbered floor and immediately below B.', 'A is on an even-numbered floor ; A is immediately below B'],
  ['A is not on the topmost floor whereas B is not on the lowest floor.', 'A is not on the topmost floor ; B is not on the lowest floor'],
]

const ROW_CASES: [string, string][] = [
  ['A sits at the extreme left end.', 'A is at the leftmost seat'],
  ['F sits at the right end.', 'F is at the rightmost seat'],
  ['C does not sit at either end.', 'C is not at either the leftmost or the rightmost seat'],
  ['B sits immediately to the right of A.', 'B is immediately to the right of A'],
  ['B sits to the immediate left of C.', 'B is immediately to the left of C'],
  ['D sits second from the left end.', 'D is at seat 2'],
  ['E sits to the left of F.', 'E is somewhere to the left of F'],
  ['The one who likes Red sits two places to the right of B.', 'the Red person is exactly 2 seats to the right of B'],
  ['D likes Green.', "D's colour is Green"],
  ['Two persons sit between A and F.', 'exactly 2 people between A and F'],
  ['A and B are neighbours.', 'A and B are on neighbouring seats'],
  ['E sits between the one who likes Red and the one who likes Blue.', 'E is between the Red person and the Blue person'],
]

const ORDER_HEADER = `Eight persons - A, B, C, D, E, F, G, H - were born in eight different months of the same year, from May to December.
Each of them is from a different city - Nagpur, Delhi, Bhopal, Kolkata, Pune, Jaipur, Mumbai, Patna.
`

const ORDER_CASES: [string, string][] = [
  ['A was born in July.', 'A was born in July'],
  ['A was not born in July.', 'A was not born in July'],
  ['B was born immediately after C.', 'B is immediately after C'],
  ['B was born immediately before C.', 'B is immediately before C'],
  ['B was born two months before C.', 'B is exactly 2 months before C'],
  ['B was born three months after C.', 'B is exactly 3 months after C'],
  ['B was born before C.', 'B is somewhere before C'],
  ['B was born after C.', 'B is somewhere after C'],
  ['B was born later than C.', 'B is somewhere after C'],
  ['B was born earlier than C.', 'B is somewhere before C'],
  ['B was born in the last month.', 'B is in the last month (December)'],
  ['B was born in the first month.', 'B is in the first month (May)'],
  ['B was born in either the first or the last month of the list.', 'B is in either the first or the last month (May or December)'],
  ['B was born in either May or July.', 'B is in May or July'],
  ['B was not born in May or June.', 'B is not in May or June'],
  ['B was born in the second month.', 'B is in June'],
  ['B was born in a month which has 31 days.', 'B is in May, July, August, October or December'],
  ['B was born in a month having 30 days.', 'B is in June, September or November'],
  ['Only one person was born between B and C.', 'exactly 1 person between B and C'],
  ['Three persons were born between B and C.', 'exactly 3 people between B and C'],
  ['There are two persons born between B and C.', 'exactly 2 people between B and C'],
  ['No one was born between B and C.', 'exactly 0 people between B and C'],
  ['The person from Delhi was born in December.', 'the city of the person born in December is Delhi'],
  ['B was born immediately after the person from Delhi.', 'B is immediately after the Delhi person'],
  ['B was born in the month immediately before the month of C.', 'B is immediately before C'],
  ['B, who is from Pune, was born in August.', "B's city is Pune ; B was born in August"],
  ['B was born between C and D.', 'B is between C and D'],
  ['Only one person was born after B.', 'B is in November'],
  ['Two persons were born before C.', 'C is in July'],
  ['Neither B nor C was born in December.', 'B was not born in December ; C was not born in December'],
]

const DAY_HEADER = `Five friends - A, B, C, D, E - go to a gym on five different days, from Monday to Friday. Each of them likes a different colour - Red, Blue, Green, Yellow, Pink.
`

const DAY_CASES: [string, string][] = [
  ['A goes on Monday.', 'A is on Monday'],
  ['B goes immediately after A.', 'B is immediately after A'],
  ['C does not go on Friday.', 'C is not on Friday'],
  ['D goes on either Tuesday or Thursday.', 'D is on Tuesday or Thursday'],
  ['The one who likes Red goes on the last day.', 'the Red person is on the last day (Friday)'],
]

const CIRCLE_HEADER = `Eight persons - A, B, C, D, E, F, G, H - are sitting around a circular table, all of them facing outside (away from the centre). (Left and right of a person are with respect to the direction that person is facing.)
Each of them has a different age - 21 years, 22 years, 23 years, 24 years, 25 years, 26 years, 27 years, 28 years (not necessarily in the same order).
`

const CIRCLE_CASES: [string, string][] = [
  ['A sits third to the left of B.', 'A is exactly 3 seats to the left of B'],
  ['A sits second to the right of B.', 'A is exactly 2 seats to the right of B'],
  ['A sits at the immediate left of B.', 'A is immediately to the left of B'],
  ['A sits to the immediate right of B.', 'A is immediately to the right of B'],
  ['A sits exactly opposite to B.', 'A sits exactly opposite B'],
  ['A does not sit opposite to B.', 'A does not sit exactly opposite B'],
  ['A is an immediate neighbour of B.', 'A and B are on neighbouring seats'],
  ['A is not an immediate neighbour of B.', 'A and B are not on neighbouring seats'],
  ['Two persons sit between A and B when counted from the left of A.', 'B is exactly 3 seats to the left of A'],
  ['One person sits between A and B when counted from the right of B.', 'A is exactly 2 seats to the right of B'],
  ['Three persons sit between A and B when counted from the right of A.', 'B sits exactly opposite A'],
  ['The person who is 23 years old sits third to the right of C.', 'the 23 years person is exactly 3 seats to the right of C'],
  ['If A sits exactly opposite to B, then C sits second to the left of D.', 'if A sits exactly opposite B, then C is exactly 2 seats to the left of D'],
  ['Either A is an immediate neighbour of B or C sits exactly opposite to D, but not both.', 'either A and B are on neighbouring seats, or C sits exactly opposite D, but not both'],
  ['Either A is 23 years old or B sits second to the right of C, but not both.', "either A's age is 23 years, or B is exactly 2 seats to the right of C, but not both"],
  ['If C is 23 years old, then A sits at the immediate left of B.', "if C's age is 23 years, then A is immediately to the left of B"],
  ['Neither A nor B is an immediate neighbour of C.', 'A and C are not on neighbouring seats ; B and C are not on neighbouring seats'],
  ['Neither A, B nor C sits second to the left of D.', 'A is not exactly 2 seats to the left of D ; B is not exactly 2 seats to the left of D ; C is not exactly 2 seats to the left of D'],
  ['It is not true that two persons sit between A and B when counted from the left of A.', 'B is not exactly 3 seats to the left of A'],
  ['A, who is 23 years old, sits exactly opposite to B.', "A's age is 23 years ; A sits exactly opposite B"],
]

const TWOROW_HEADER = `Eight persons - A, B, C, D, E, F, G, H - are sitting in two parallel rows containing four persons each, in such a way that each person of one row faces a person of the other row. The persons of row 1 face south and the persons of row 2 face north. (Left and right of a person are with respect to the direction that person is facing.)
`

const TWOROW_CASES: [string, string][] = [
  ['A sits in row 1.', 'A is in row 1'],
  ['A does not sit in row 2.', 'A is not in row 2'],
  ['A sits in the first row.', 'A is in row 1'],
  ['A sits in row 2 and B sits in row 1.', 'A is in row 2 ; B is in row 1'],
  ['A sits in the same row as B.', 'A and B are in the same row'],
  ['A does not sit in the same row as B.', 'A and B are not in the same row'],
  ['A and B sit in the same row.', 'A and B are in the same row'],
  ['A and B sit in different rows.', 'A and B are not in the same row'],
  ['A faces B.', 'A faces B'],
  ['A does not face B.', 'A does not face B'],
  ['A sits exactly opposite to B.', 'A faces B'],
  ['A does not sit opposite to B.', 'A does not face B'],
  ['Neither A nor B faces C.', 'A does not face C ; B does not face C'],
  ['A neither faces B nor C.', 'A does not face B ; A does not face C'],
  ['A sits at one of the extreme ends of the row.', 'A is in an end seat of a row'],
  ['A does not sit at any of the extreme ends of the row.', 'A is not in an end seat of a row'],
  ['A sits at the extreme left end.', 'A is in a left-end seat'],
  ['A sits at the extreme right end of row 2.', 'A is in seat 4 of row 2'],
  ['A sits third from the left end.', 'A is in seat 3 of row 1 or seat 3 of row 2'],
  ['A sits second to the left of B.', 'A is exactly 2 seats to the left of B'],
  ['A sits immediately to the right of B.', 'A is immediately to the right of B'],
  ['A is an immediate neighbour of B.', 'A and B are on neighbouring seats'],
  ['A is not an immediate neighbour of B.', 'A and B are not on neighbouring seats'],
  ['Two persons sit between A and B.', 'exactly 2 people between A and B'],
  ['A sits between B and C.', 'A is between B and C'],
  ['A sits at the immediate left of the one who faces B.', 'A is immediately to the left of the one opposite B'],
  ['A sits third to the right of the one who sits opposite to B.', 'A is exactly 3 seats to the right of the one opposite B'],
  ['The one who faces A sits second to the left of B.', 'the one opposite A is exactly 2 seats to the left of B'],
  ['The one who sits immediate left of A faces B.', 'the one immediately to the left of A faces B'],
  ['A sits second to the left of the person who sits to the immediate right of B.', 'A is exactly 2 seats to the left of the one immediately to the right of B'],
  ['The number of persons to the left of A is the same as the number of persons to the right of B.', 'as many people to the left of A as to the right of B'],
  ['The number of persons standing to the left of A is not the same as the number of persons standing to the right of B.', 'not as many people to the left of A as to the right of B'],
  ['If A faces B, then C sits in the same row as D.', 'if A faces B, then C and D are in the same row'],
  ['Either A faces B or C sits in row 1, but not both.', 'either A faces B, or C is in row 1, but not both'],
]

const BDAY_HEADER = `6 persons named A, B, C, D, E & F have birthdays in the month of January, April and May on two different dates i.e. 11th and 16th of the same year. No two persons have birthdays on the same day.
`

const BDAY_CASES: [string, string][] = [
  ['A and B were born in the same month.', 'A is in the same month as B'],
  ['A and B were born in different months.', 'A is in a different month from B'],
  ['A and B were not born in the same month.', 'A is not in the same month as B'],
  ['A and B were born on the same date.', 'A is on the same date as B'],
  ['A and B were born on the same date but in different months.', 'A is on the same date as B, but in a different month'],
  ['A was born in the month of April.', 'A is in April'],
  ['A was not born in January.', 'A is not in January'],
  ['A was born in the month having 31 days.', 'A is in January or May'],
  ['A was born on the 16th.', 'A is on the 16th'],
  ['A was born on the 11th of a month.', 'A is on the 11th'],
  ['A was born before B on the 16th of a month.', 'A is somewhere before B ; A is on the 16th ; B is on the 16th'],
  ['A was not born immediately before B, who was born in April.', 'A is not immediately before B ; B is in April'],
  ['Not more than two persons were born before A.', 'A is on January 11, January 16 or April 11'],
  ['At least three persons were born after A.', 'A is on January 11, January 16 or April 11'],
  ['Two persons were born between A and B.', 'exactly 2 people between A and B'],
]

const SQUARE_HEADER = `Eight friends S, T, U, V, W, X, Y & Z are sitting around a square table. People sitting at the corners are facing outside the table and the remaining all are facing inside the table.
`

const SQUARE_CASES: [string, string][] = [
  ['T sits adjacent to Y.', 'T and Y are on neighbouring seats'],
  ['V sits immediate left of T.', 'V is immediately to the left of T, as seen by T'],
  ['U sits second to the left of X.', 'U is exactly 2 seats to the left of X, as seen by X'],
  ['Y is third to the right of U.', 'Y is exactly 3 seats to the right of U, as seen by U'],
  ['There are two persons sits between S and W, when counted from the right of W.', 'S is exactly 3 seats to the right of W, as seen by W'],
  ['Z sits at one of the corners of the table.', 'Z is at a corner seat'],
  ['Z does not sit at a corner of the table.', 'Z is not at a corner seat'],
  ['Z sits at the middle of a side of the table.', 'Z is at a side seat (the middle of a side)'],
  ['Z faces outside.', 'Z is at a corner seat'],
  ['Z sits at the corner but not adjacent to X.', 'Z is at a corner seat ; Z and X are not on neighbouring seats'],
  ['Z sits diagonally opposite to X.', 'Z sits exactly opposite X'],
  ['Z faces towards the centre of the table.', 'Z is at a side seat (the middle of a side)'],
  ['Z faces away from the centre.', 'Z is at a corner seat'],
  ["Z doesn't sit immediate right of X and Y.", 'Z is not immediately to the right of X, as seen by X ; Z is not immediately to the right of Y, as seen by Y'],
  ['S and T sit opposite to each other.', 'S sits exactly opposite T'],
]

const PENT_HEADER = `Ten people A, B, C, D, E, F, H, I, J & K are sitting around a pentagon shaped table. Five people are sitting at the corners of the table and five people are sitting on each side of the table. Persons sitting at the corners are facing inside and the persons sitting at the side are facing outside.
`

const PENT_CASES: [string, string][] = [
  ['I sits immediate right and immediate left of A and C respectively.', 'I is immediately to the right of A, as seen by A ; I is immediately to the left of C, as seen by C'],
  ['I sits second right and immediate left of A and C respectively.', 'I is exactly 2 seats to the right of A, as seen by A ; I is immediately to the left of C, as seen by C'],
  ['I does not sit on the side of the table.', 'I is not at a side seat (the middle of a side)'],
  ['A sits at one of the corners of the table.', 'A is at a corner seat'],
  ['A faces the centre.', 'A is at a corner seat'],
  ['A faces outside.', 'A is at a side seat (the middle of a side)'],
  ['D sits third to the right of K.', 'D is exactly 3 seats to the right of K, as seen by K'],
  ['Two persons sit between D and E, who does not sit adjacent to K.', 'exactly 2 people between D and E (on one side or the other) ; E and K are not on neighbouring seats'],
]

const RANK_HEADER = `Six students viz. A, B, C, D, E & F are standing in a straight line such that all of them are facing towards north. Each person holds different ranks from I to VI but not necessarily in the same order.
`

const RANK_CASES: [string, string][] = [
  ['A holds the top rank.', "A's rank is I"],
  ['A holds IInd rank.', "A's rank is II"],
  ['A holds IIIrd rank whereas B doesn’t hold Vth rank.', "A's rank is III ; B's rank is not V"],
  ['A holds VIth rank.', "A's rank is VI"],
  ['A holds the lowest rank.', "A's rank is VI"],
  ['A stands second from one of the ends.', 'A is at seat 2 or 5'],
  ['As many persons to the left of A is same as to the right of B.', 'as many people to the left of A as to the right of B'],
  ['As many persons to the left of the one who holds VIth rank is same as to the right of B.', 'as many people to the left of the person with rank VI as to the right of B'],
  ['A stands at the right most end and immediate right of the one who holds the top rank.', 'A is at the rightmost seat ; A is immediately to the right of the person with rank I'],
]

const ROW_NEITHER: [string, string][] = [
  ['Neither A nor B likes Red and Blue.', "A's colour is not Red ; A's colour is not Blue ; B's colour is not Red ; B's colour is not Blue"],
  ['A does not like Red or Blue.', "A's colour is not Red ; A's colour is not Blue"],
]

const VAC_HEADER = `Five people A, B, C, D & E are getting interviewed on different dates, the 5th and 12th of three different months i.e. January, April and July of the same year. Each day has only one interview scheduled. One date is vacant.
`

const VAC_CASES: [string, string][] = [
  ['A is interviewed in April.', 'A is in April'],
  ['A is not interviewed in April.', 'A is not in April'],
  ['A is interviewed on an even-numbered date.', 'A is on the 12th'],
  ['A is interviewed on an odd numbered date.', 'A is on the 5th'],
  ['A is interviewed on the 12th of a month.', 'A is on the 12th'],
  ['A is interviewed after B, but neither in July nor on the 5th of any month.', 'A is somewhere after B ; A is not on January 5, April 5, July 5 or July 12'],
  ['A and B are interviewed in the same month.', 'A is in the same month as B'],
  ['A and B are interviewed on the same date but in different months.', 'A is on the same date as B, but in a different month'],
  ['More than one person is interviewed between A and B.', 'at least 2 people between A and B'],
  ['There are two people interviewed between A and B.', 'exactly 2 people between A and B'],
  ['A is interviewed immediately after B.', 'A is immediately after B'],
]

const SOUTH_HEADER = `Six friends A, B, C, D, E & F sit in a row. All of them face towards the south. Each of them likes a different colour - Red, Blue, Green, Yellow, Pink, Black.
`

// facing south a person's left is the east: the positions run west → east, "left" means a higher position, and the clues read back as written
const SOUTH_CASES: [string, string][] = [
  ['A sits to the left of B.', 'A is somewhere to the left of B'],
  ['A sits third to the left of B.', 'A is exactly 3 seats to the left of B'],
  ['A sits immediate right of B.', 'A is immediately to the right of B'],
  ['A sits at the extreme left end.', 'A is at the leftmost seat'],
  ['A sits at the extreme right end.', 'A is at the rightmost seat'],
  ['Neither A nor B sits at the extreme end.', 'A is not at either the leftmost or the rightmost seat ; B is not at either the leftmost or the rightmost seat'],
  ['The number of persons to the right of A is equal to the number of persons to the left of B.', 'as many people to the right of A as to the left of B'],
]

const WEEK_HEADER = `Seven friends A, B, C, D, E, F and G buy seven different bikes namely Honda, KTM, Ronin, Ducati, Yamaha, Bajaj and Benelli in a week but not necessarily in the same order. The week is starting from Monday.
`

const WEEK_CASES: [string, string][] = [
  ['A buys either KTM or Yamaha.', "A's bike is KTM or Yamaha"],
  ['B buys Benelli on penultimate day of the week.', "B's bike is Benelli ; B is on Saturday"],
  ['C buys Honda on Friday.', "C's bike is Honda ; C is on Friday"],
  ['Bajaj is purchased by one of the person in middle of the week.', 'the Bajaj person is on Thursday'],
  ['A purchased after two days of the one who purchased Ducati.', 'A is exactly 2 days after the Ducati person'],
  ['A purchased before three days of the one who purchased Ducati.', 'A is exactly 3 days before the Ducati person'],
  ['There are three days between A and the one who purchased KTM.', 'exactly 3 people between A and the KTM person'],
  ["No one buys after A's purchasing.", 'A is on the last day (Sunday)'],
  ['Number of days between A and B is not same as between C and D.', 'not the same number of people between A and B as between C and D'],
  ['A purchase one of the things before B.', 'A is somewhere before B'],
]

const WEEK6_HEADER = `Six friends A, B, C, D, E and F buy six different bikes namely Honda, KTM, Ronin, Ducati, Yamaha and Benelli in a week starting from Monday, though not necessarily in the same order. Only one person buys a bike on a given day, and there is one day in the week on which no one purchases any bike.
`

// six people on seven days: "days" count days (the vacant one too), "persons" count people
const WEEK6_CASES: [string, string][] = [
  ['No bike is purchased on Friday.', 'A is not on Friday ; B is not on Friday ; C is not on Friday ; D is not on Friday ; E is not on Friday ; F is not on Friday'],
  ['A buys Honda on Friday.', "A's bike is Honda ; A is on Friday"],
  ['A buys his bike two days after the one who purchased KTM.', 'A is exactly 2 days after the KTM person'],
  ['There are two days between A and B.', 'exactly 2 days between A and B'],
  ['There are two persons between A and B.', 'exactly 2 people between A and B'],
  ['A buys on a weekend.', 'A is on Saturday or Sunday'],
  ['A buys on the first day of the week.', 'A is on Monday'],
  ['A buys his bike on the last day of the week.', 'A is on Sunday'],
  ['The number of days between A and B is the same as the number of days between C and D.', 'the same number of days between A and B as between C and D'],
  ['A buys the bike immediately after B.', 'A is immediately after B'],
  ['A buys either KTM or Ducati.', "A's bike is KTM or Ducati"],
  ['[A](https://example.com/x?q=1) buys Honda.', "A's bike is Honda"],
]

const CLASS_HEADER = `Six people A, B, C, D, E & F like different colors i.e. Red, Blue, Green, Yellow, Pink and Black but not necessarily in the same order. They are from six different classes i.e. class 1, class 2, class 3, class 4, class 5 and class 6 but not necessarily in the same order.
`

// classes numbered 1 … n: a higher class is more senior
const CLASS_CASES: [string, string][] = [
  ['A is in class 3.', 'A is in class 3'],
  ['A is immediate senior to B.', 'A is immediately senior to B'],
  ['A is immediate junior to B.', 'A is immediately junior to B'],
  ['A is senior to B.', 'A is somewhere senior to B'],
  ['A is junior to the person who likes Red.', 'A is somewhere junior to the Red person'],
  ['A is in even numbered class.', 'A is in an even-numbered class'],
  ['A is neither in class 1 nor in class 6.', 'A is not in either the highest or the lowest class'],
  ['Two persons are between the classes in which A and B studies.', 'exactly 2 people between A and B'],
  ['A is three classes senior to B.', 'A is exactly 3 classes senior to B'],
]

const YEAR_HEADER = `Six people A, B, C, D, E & F are born in 6 different years i.e., 1990, 1985, 2000, 1975, 1995 and 1980 but not necessarily in the same order. The base year for the calculation of their ages is 2020.
`

// the ages are 2020 - year: 1975 → 45, 1980 → 40, 1985 → 35, 1990 → 30, 1995 → 25, 2000 → 20
const YEAR_CASES: [string, string][] = [
  ['The age of A is a perfect square number.', 'A is in 1995 (age 25: a perfect square number)'],
  ['The age of A is a multiple of 10.', 'A is in 1980, 1990 or 2000 (age 40 or 30 or 20: a multiple of 10)'],
  ['The age of A is an odd number.', 'A is in 1975, 1985 or 1995 (age 45 or 35 or 25: an odd number)'],
  ['The age of A is more than 30.', 'A is in 1975, 1980 or 1985 (age 45 or 40 or 35: more than 30)'],
  ['The age of A is less than 30.', 'A is in 1995 or 2000 (age 25 or 20: less than 30)'],
  ['The age of A is not a prime number.', 'A can be anywhere (nothing is ruled out)'],
  ['The age of A is a perfect cube.', 'A must be in a year that does not exist (impossible)'],
  ['The difference between the ages of A and B is the same as the difference between the ages of C and D.', 'the same difference between the years of A and B as between those of C and D'],
  ['The difference between the ages of A and B is not the same as the difference between the ages of C and D.', 'not the same difference between the years of A and B as between those of C and D'],
  ['The number of persons born after A is the same as the number of persons born before B.', 'as many people after A as before B'],
  ['The number of persons born before A is the same as the number born after B.', 'as many people before A as after B'],
  ['A was born in 1985.', 'A was born in 1985'],
  ['A was born before B.', 'A is somewhere before B'],
  ['The year of birth of A is a leap year.', 'A is in 1980 or 2000'],
  ['A is born in an even numbered year.', 'A is in 1980, 1990 or 2000'],
]

const STOREY_HEADER = `Six people A, B, C, D, E & F live in a eight-storied building, not necessarily in the same order. The ground floor is numbered one while the top floor in numbered eight.
`

// 8 floors for 6 people: "floors" count floors (the empty ones too), "persons" count people
const STOREY_CASES: [string, string][] = [
  ['A lives on the perfect cube numbered floor.', 'A is on floors 1 or 8'],
  ['A lives on the perfect square numbered floor.', 'A is on floors 1 or 4'],
  ['A lives on a prime numbered floor.', 'A is on floors 2, 3, 5 or 7'],
  ['A lives on an even numbered floor.', 'A is on floors 2, 4, 6 or 8'],
  ['A lives on the top floor.', 'A is on floor 8'],
  ['A lives immediately above B.', 'A is immediately above B'],
  ['A lives two floors below B.', 'A is exactly 2 floors below B'],
  ['A lives above B but not immediately above.', 'A is somewhere above B ; A is not immediately above B'],
  ['Only two persons live between A and B.', 'exactly 2 people between A and B'],
  ['There are two floors between A and B.', 'exactly 2 floors between A and B'],
  ['The number of floors above A is same as the number of floors below B.', 'as many floors above A as below B'],
  ['The number of persons above A is same as the number of persons below B.', 'as many people above A as below B'],
]

const BOXCOLOR_HEADER = `Six boxes viz. H, I, J, K, L & M are placed one above the other in six different shelves such that the lowermost shelf is numbered as 1 and the topmost shelf is numbered as 6. Each box is of different color viz. Hex, Gray, Azure, Crimson, Orange, and Coral.
`

// compound clues with a lost subject, plural "boxes L and M", "color box" and "neither … nor placed …"
const BOXCOLOR_CASES: [string, string][] = [
  ['The number of boxes below the Azure color box is the same as above box J.', 'as many boxes below the Azure box as above J'],
  ['The Orange box is placed on an odd-numbered shelf and two boxes above box L.', 'the Orange box is in an odd-numbered place ; the Orange box is exactly 2 places above L'],
  ['Box I is neither Hex nor placed above box K.', "I's color is not Hex ; I is not somewhere above K"],
  ['Hex color box is placed adjacent to box J and three boxes below box K.', 'the Hex box and J are on neighbouring places ; the Hex box is exactly 3 places below K'],
  ['Only two boxes are placed between boxes L and M, which is Azure in color.', "M's color is Azure ; exactly 2 boxes between L and M"],
  ['Two boxes are placed between boxes L and M.', 'exactly 2 boxes between L and M'],
]

const EVENT_HEADER = `Nine events U, S, R, Q, O, E, M, N & P are held on 7th, 19th and 28th of different months (June, July and August) in the same year.
`

// two subjects or two objects in one relation, a "which" clause that is a statement of its own, "but in different months"
const EVENT_CASES: [string, string][] = [
  ['O and E are held after R, which is not held on 7th June.', 'O is somewhere after R ; E is somewhere after R ; R is not on the first date (June 7)'],
  ['S is held after N.', 'S is somewhere after N'],
  ['S is held before N and M.', 'S is somewhere before N ; S is somewhere before M'],
  ['Three events are held between N and M, which is held in August.', 'exactly 3 people between N and M ; M is in August'],
  ['N is held immediately after S, which is held in August.', 'N is immediately after S ; S is in August'],
  ['S is held immediately before U, but in different months.', 'S is immediately before U ; S is not in the same month as U'],
  ['S is held immediately before U, but in the same month.', 'S is immediately before U ; S is in the same month as U'],
]

const SEVEN_HEADER = `Seven persons H, I, J, K, L, M & N are sitting in a row.
`

// "either … or" with a shared predicate, "does not … K or M", ordinals copied with a gap
const SEVEN_CASES: [string, string][] = [
  ['Either M or K sits at one of the extreme ends.', 'either M is at either the leftmost or the rightmost seat, or K is at either the leftmost or the rightmost seat, but not both'],
  ['M or K sits at an extreme end.', 'M is at either the leftmost or the rightmost seat, or K is at either the leftmost or the rightmost seat, or both'],
  ['M does not sit adjacent to K or J.', 'M and K are not on neighbouring seats ; M and J are not on neighbouring seats'],
  ['K sits 4 th to the right of M.', 'K is exactly 4 seats to the right of M'],
]

const GAPMONTH_HEADER = `Four persons A, B, C, D were born in four different months viz. August, January, May and March of the same year.
`

// months listed with gaps: "N months before" is the real calendar gap, "N persons before" is N places in the order
const GAPMONTH_CASES: [string, string][] = [
  ['A was born three months before B.', 'A is exactly 3 months before B on the calendar'],
  ['A was born two months after B.', 'A is exactly 2 months after B on the calendar'],
  ['There are two months between A and B.', 'exactly 2 calendar months between A and B'],
  ['A was born immediately before B.', 'A is immediately before B'],
  ['A was born three persons before B.', 'A is exactly 3 places before B'],
]

const FLOOR_EXTRA: [string, string][] = [
  ['A lives on a prime-numbered floor.', 'A is on floor 2, 3, 5 or 7'],
  ['A does not live on a prime-numbered floor.', 'A is not on floor 2, 3, 5 or 7'],
  ['A lives on a floor whose number is a multiple of 3.', 'A is on floor 3 or 6'],
  ['The number of persons living between A and B is the same as the number of persons living between C and D.', 'the same number of people between A and B as between C and D'],
  ['The number of persons living between A and B is not the same as the number of persons living between C and D.', 'not the same number of people between A and B as between C and D'],
  ['Neither the person from Delhi, A nor B lives somewhere below C.', 'the Delhi person is not somewhere below C ; A is not somewhere below C ; B is not somewhere below C'],
  ['Either A lives on either the topmost or the lowest floor or B lives adjacent to A, but not both.', 'either A is on either the topmost or the lowest floor, or B and A are on neighbouring floors, but not both'],
]

const ORDER_EXTRA: [string, string][] = [
  ['A was born immediately before or after B.', 'A and B are on neighbouring months'],
  ['A, who is from Delhi, was born immediately before or after the person from Pune.', "A's city is Delhi ; A and the Pune person are on neighbouring months"],
]

const GRID_HEADER = `8 persons named A, B, C, D, E, F, G & H live on a four
storeyed building, such that the ground floor is numbered as 1 and the top floor is numbered as 4. Each floor
has 2 flats, which is Flat A and Flat B. Flat A of floor 2 is immediately above Flat A of floor 1 and similarly in case of Flat B also. Flat A is to the west of Flat B.
All the flats are of same size.
`

const GRID_CASES: [string, string][] = [
  ['C and D live on the same floor.', 'C is on the same floor as D'],
  ['C and D are having flats on the same floor.', 'C is on the same floor as D'],
  ['C and D do not live on the same floor.', 'C is not on the same floor as D'],
  ['C and D live on different floors.', 'C is on a different floor from D'],
  ['C lives in flat B.', 'C is in flat B'],
  ['C does not live in flat A.', 'C is not in flat A'],
  ['C lives on floor 3.', 'C is on floor 3'],
  ['C lives in flat A on floor 2.', 'C is in flat A on floor 2'],
  ['C lives on an odd numbered floor.', 'C is on an odd-numbered floor'],
  ['C lives on the topmost floor.', 'C is on the top floor'],
  ['C lives on the ground floor.', 'C is on the ground floor'],
  ['C lives above D.', 'C is above D'],
  ['C lives below D.', 'C is below D'],
  ['C lives immediately above D.', 'C is immediately above, in the same lettered flat as D'],
  ['C lives two floors below D.', 'C is exactly 2 floors below D'],
  ['C lives above D in the same type of flat.', 'C is above, in the same lettered flat as D'],
  ['C and D live on different lettered flats.', 'C is in a different lettered flat from D'],
  ['C and D live on the same lettered flat.', 'C is in the same lettered flat as D'],
  ["C's flat is to the north-east of D's flat.", 'C is to the north-east of D'],
  ["C's flat is to the south-west of D's flat.", 'C is to the south-west of D'],
  ["C's flat is to the south-east of D's flat.", 'C is to the south-east of D'],
  ["C's flat is to the east of D's flat.", 'C is east of D'],
  ["C's flat is to the west of D's flat.", 'C is west of D'],
  ["The floor number of C's flat is more than the floor number of D's flat.", 'C is above D'],
  ["The floor number of C's flat is less than the floor number of D's flat.", 'C is below D'],
  ['C and D live on even numbered floors.', 'C is on an even-numbered floor ; D is on an even-numbered floor'],
  ['C lives in flat A but not on floor number 1.', 'C is in flat A ; C is not on the ground floor'],
  ['Neither C nor D lives in flat A.', 'C is not in flat A ; D is not in flat A'],
  ['C lives in flat B and D lives in flat A.', 'C is in flat B ; D is in flat A'],
  ['If C lives in flat A, then D lives on the same floor as E.', 'if C is in flat A, then D is on the same floor as E'],
]

const BOX_HEADER = `Seven boxes H, I, J, K, L, M & O are kept one above
the other. Each of the boxes contains seven
different fruits i.e., Bananas, Cherry, Avocado,
Papaya, Kiwi, Pear and Mango but not in the same
order. The bottommost box is numbered 1 and the
topmost box is numbered 7.
`

const BOX_CASES: [string, string][] = [
  ['The box, which contains Mango, is placed three boxes below the box L.', 'the Mango box is exactly 3 places below L'],
  ['Box H is a prime numbered box and placed immediately above the box, which contains Avocado.', 'H is in place 2, 3, 5 or 7 ; H is immediately above the Avocado box'],
  ['Box J is placed immediately above the box, which contains Pear.', 'J is immediately above the Pear box'],
  ['Box O is placed below box I.', 'O is somewhere below I'],
  ['Box M is two boxes above the box, which contains Papaya.', 'M is exactly 2 places above the Papaya box'],
  ['Box K contains Cherry.', "K's fruit is Cherry"],
  ['Box, which contains Banana, is placed two places above the box, which contains Kiwi.', 'the Bananas box is exactly 2 places above the Kiwi box'],
  ['The box which contains Kiwi is placed immediately below box J.', 'the Kiwi box is immediately below J'],
  ['Box L is not kept immediately above box M.', 'L is not immediately above M'],
  ['Either box K is kept at either the top or the bottom of its stack or one box is kept between box L and box K, but not both.', 'either K is in either the topmost or the lowest place, or exactly 1 box between L and K, but not both'],
]

function runParserTable(header: string, cases: [string, string][]) {
  for (const [sentence, expected] of cases) {
    const r = parsePuzzle(`${header}\n${sentence}`)
    if (!r.puzzle) {
      fail(`parse "${sentence}": no puzzle (${r.errors.join('; ')})`)
      continue
    }
    if (r.unparsed.length) {
      fail(`parse "${sentence}": not understood`)
      continue
    }
    const ctx = new Ctx(r.puzzle)
    const got = r.puzzle.clues[0].atoms.map((a) => ctx.describeAtom(a)).join(' ; ')
    if (got !== expected) fail(`parse "${sentence}":\n      got      ${got}\n      expected ${expected}`)
  }
}
runParserTable(FLOOR_HEADER, FLOOR_CASES)
runParserTable(FLOOR_HEADER, FLOOR_VIZ)
runParserTable(ROW_HEADER, ROW_CASES)
runParserTable(ORDER_HEADER, ORDER_CASES)
runParserTable(DAY_HEADER, DAY_CASES)
runParserTable(CIRCLE_HEADER, CIRCLE_CASES)
runParserTable(GRID_HEADER, GRID_CASES)
runParserTable(BOX_HEADER, BOX_CASES)
runParserTable(TWOROW_HEADER, TWOROW_CASES)
runParserTable(BDAY_HEADER, BDAY_CASES)
runParserTable(SQUARE_HEADER, SQUARE_CASES)
runParserTable(PENT_HEADER, PENT_CASES)
runParserTable(RANK_HEADER, RANK_CASES)
runParserTable(VAC_HEADER, VAC_CASES)
runParserTable(SOUTH_HEADER, SOUTH_CASES)
runParserTable(WEEK_HEADER, WEEK_CASES)
runParserTable(WEEK6_HEADER, WEEK6_CASES)
runParserTable(CLASS_HEADER, CLASS_CASES)
runParserTable(YEAR_HEADER, YEAR_CASES)
runParserTable(STOREY_HEADER, STOREY_CASES)
runParserTable(GAPMONTH_HEADER, GAPMONTH_CASES)
runParserTable(SEVEN_HEADER, SEVEN_CASES)
runParserTable(EVENT_HEADER, EVENT_CASES)
runParserTable(BOXCOLOR_HEADER, BOXCOLOR_CASES)
runParserTable(ROW_HEADER, ROW_NEITHER)
runParserTable(FLOOR_HEADER, FLOOR_EXTRA)
runParserTable(ORDER_HEADER, ORDER_EXTRA)

// numbering from the top
{
  const r = parsePuzzle(`Five persons - A, B, C, D, E - live on five different floors of a building, numbered from the top, so that the topmost floor is numbered 1.\nA lives on floor 1.\nB lives immediately below A.`)
  const ctx = r.puzzle ? new Ctx(r.puzzle) : null
  const set = r.puzzle?.clues[0].atoms[0]
  if (!r.puzzle || !r.puzzle.topDown || set?.t !== 'set' || set.fs[0] !== 4) fail('top-down numbering: floor 1 should be the topmost (index 4)')
  else if (ctx && ctx.describeAtom(r.puzzle.clues[1].atoms[0]) !== 'B is immediately below A') fail('top-down numbering: relative clue misread')
}

// the two built-in samples must be understood completely and have exactly one solution
for (const s of SAMPLES.filter((x) => !x.family)) {
  const r = parsePuzzle(s.text)
  if (!r.puzzle || r.unparsed.length || r.errors.length) fail(`sample "${s.title}" did not parse cleanly`)
  else {
    const e = enumerate(r.puzzle, 5)
    if (s.multi ? e.sols.length < 2 : e.sols.length !== 1) fail(`sample "${s.title}" has ${e.sols.length} solutions`)
  }
}

// the 12-person two-row puzzle from the app's own sample list: the answer was checked by hand against every clue
{
  const two = SAMPLES.find((x) => x.id === 'two-rows')
  const r = two ? parsePuzzle(two.text) : null
  const e = r?.puzzle ? enumerate(r.puzzle, 3) : null
  if (!r?.puzzle || !e || e.sols.length !== 1) fail('two-rows sample: expected exactly one solution')
  else {
    const rowsOf = (sol: Solution, row: number) => Array.from({ length: 6 }, (_, i) => r.puzzle!.people[sol.pos.indexOf(row * 6 + i)]).join('')
    if (rowsOf(e.sols[0], 0) !== 'BEADCF' || rowsOf(e.sols[0], 1) !== 'QNLPMO') fail(`two-rows sample: got ${rowsOf(e.sols[0], 0)} / ${rowsOf(e.sols[0], 1)}`)
  }
}

// the mixed-facing line (people and fruits not listed; left / right as seen by the second person named): answer found by brute force
{
  const mix = SAMPLES.find((x) => x.id === 'facing-line')
  const r = mix ? parsePuzzle(mix.text) : null
  const e = r?.puzzle ? enumerate(r.puzzle, 3) : null
  if (!r?.puzzle || !e || e.sols.length !== 1 || r.unparsed.length) fail('facing-line sample: expected exactly one solution and every clue read')
  else {
    const P = r.puzzle
    const sol = e.sols[0]
    const line = Array.from({ length: P.n }, (_, i) => {
      const q = sol.pos.indexOf(i)
      return `${P.people[q]}${P.cats[0].values[sol.val[0][q]]}${P.cats[1].values[sol.val[1][q]][0]}`
    }).join(' ')
    if (line !== 'QApples PGrapesn DFign BLemonn FPapayas LMangos MGuavas IKiwin') fail(`facing-line sample: got ${line}`)
  }
}

// the square-table puzzle (corners face outside, sides face the centre): one arrangement up to turning the table by two seats
{
  const sq = SAMPLES.find((x) => x.id === 'square-table')
  const r = sq ? parsePuzzle(sq.text) : null
  const e = r?.puzzle ? enumerate(r.puzzle, 3) : null
  if (!r?.puzzle || !e || e.sols.length !== 1 || r.unparsed.length) fail('square-table sample: expected exactly one solution and every clue read')
  else {
    const seats = Array.from({ length: 8 }, (_, i) => r.puzzle!.people[e.sols[0].pos.indexOf(i)]).join('')
    if (!'SXVTYWZU'.repeat(2).includes(seats) || seats.length !== 8) fail(`square-table sample: got ${seats}`)
    // the same cyclic order, turned by an even number of seats only
    const turned = Array.from({ length: 4 }, (_, k) => 'SXVTYWZU'.slice(2 * k) + 'SXVTYWZU'.slice(0, 2 * k))
    if (!turned.includes(seats)) fail(`square-table sample: ${seats} is not SXVTYWZU turned by an even number of seats`)
  }
}

// the pentagon-shaped table (corners face the centre, sides face outside): one arrangement up to turning the table by two seats; brute force agrees
{
  const pe = SAMPLES.find((x) => x.id === 'pentagon-table')
  const r = pe ? parsePuzzle(pe.text) : null
  const e = r?.puzzle ? enumerate(r.puzzle, 3) : null
  if (!r?.puzzle || !e || e.sols.length !== 1 || r.unparsed.length) fail('pentagon-table sample: expected exactly one solution and every clue read')
  else {
    const seats = Array.from({ length: 10 }, (_, i) => r.puzzle!.people[e.sols[0].pos.indexOf(i)]).join('')
    const turned = Array.from({ length: 5 }, (_, k) => 'BDJHECIAKF'.slice(2 * k) + 'BDJHECIAKF'.slice(0, 2 * k))
    if (!turned.includes(seats)) fail(`pentagon-table sample: ${seats} is not BDJHECIAKF turned by an even number of seats`)
  }
}

// the ranks puzzle (ranks I to VI named only through "IIIrd rank" / "top rank"): one arrangement, confirmed by brute force
{
  const rk = SAMPLES.find((x) => x.id === 'ranks-line')
  const r = rk ? parsePuzzle(rk.text) : null
  const e = r?.puzzle ? enumerate(r.puzzle, 3) : null
  if (!r?.puzzle || !e || e.sols.length !== 1 || r.unparsed.length) fail('ranks-line sample: expected exactly one solution and every clue read')
  else {
    const P = r.puzzle
    const line = Array.from({ length: P.n }, (_, i) => {
      const q = e.sols[0].pos.indexOf(i)
      return `${P.people[q]}${P.cats[0].values[e.sols[0].val[0][q]]}`
    }).join(' ')
    if (line !== 'TIII XV WII ZIV UI YVI') fail(`ranks-line sample: got ${line}`)
  }
}

// the square table with fruits (list introduced by "among"; neither M nor S; opposite to each other): brute force found one arrangement
{
  const sf = SAMPLES.find((x) => x.id === 'square-fruits')
  const r = sf ? parsePuzzle(sf.text) : null
  const e = r?.puzzle ? enumerate(r.puzzle, 3) : null
  if (!r?.puzzle || !e || e.sols.length !== 1 || r.unparsed.length) fail('square-fruits sample: expected exactly one solution and every clue read')
  else {
    const P = r.puzzle
    const seats = Array.from({ length: 8 }, (_, i) => {
      const q = e.sols[0].pos.indexOf(i)
      return `${P.people[q]}:${P.cats[0].values[e.sols[0].val[0][q]]}`
    })
    const want = ['N:Kiwi', 'S:Orange', 'Q:Guava', 'T:Lemon', 'O:Grapes', 'M:Cherry', 'R:Mango', 'P:Fig']
    const turned = Array.from({ length: 4 }, (_, k) => [...want.slice(2 * k), ...want.slice(0, 2 * k)].join(' '))
    if (!turned.includes(seats.join(' '))) fail(`square-fruits sample: got ${seats.join(' ')}`)
  }
}

// people matched with cities and bikes only (no seating): several arrangements fit, and the union of them is what the answer key shows
{
  const cb = SAMPLES.find((x) => x.id === 'cities-bikes')
  const r = cb ? parsePuzzle(cb.text) : null
  const e = r?.puzzle ? enumerate(r.puzzle, 600) : null
  if (!r?.puzzle || !e || !e.complete || r.unparsed.length) fail('cities-bikes sample: expected every clue read and a complete search')
  else {
    const P = r.puzzle
    const uniq = (xs: string[]) => [...new Set(xs)].sort().join('/')
    const got = P.people.map((name, p) => `${name} ${uniq(e.sols.map((s) => (P.labels as string[])[s.pos[p]]))} ${uniq(e.sols.map((s) => P.cats[0].values[s.val[0][p]]))}`).join('; ')
    const want = 'A Agra/Jaipur Apache; E Agra/Pune Honda; B Bhopal Ducati/Yamaha; F Mumbai Ducati/Yamaha; C Raipur Pulsar; G Jaipur/Pune Bajaj; D Ranchi Hero'
    if (e.sols.length !== 4 || got !== want) fail(`cities-bikes sample: ${e.sols.length} arrangements, got ${got}`)
  }
}

// the divorce puzzle (3 months × 2 dates, answer key checked by hand) and a puzzle with one vacant date
{
  const dv = SAMPLES.find((x) => x.id === 'divorce-dates')
  const r = dv ? parsePuzzle(dv.text) : null
  const e = r?.puzzle ? enumerate(r.puzzle, 3) : null
  if (!r?.puzzle || !e || e.sols.length !== 1 || r.unparsed.length) fail('divorce-dates sample: expected exactly one solution and every clue read')
  else {
    const P = r.puzzle
    const got = Array.from({ length: 6 }, (_, f) => `${(P.labels as string[])[f]}:${P.people[e.sols[0].pos.indexOf(f)]}`).join(' ')
    if (got !== 'March 16:H March 25:L June 16:K June 25:M October 16:J October 25:I') fail(`divorce-dates sample: got ${got}`)
  }
  const vc = SAMPLES.find((x) => x.id === 'vacant-dates')
  const rv = vc ? parsePuzzle(vc.text) : null
  const ev = rv?.puzzle ? enumerate(rv.puzzle, 3) : null
  if (!rv?.puzzle || !ev || ev.sols.length !== 1 || rv.unparsed.length) fail('vacant-dates sample: expected exactly one solution and every clue read')
  else {
    const P = rv.puzzle
    const dates = P.cats[P.slotCat as number].values
    const got = Array.from({ length: 7 }, (_, f) => {
      const q = ev.sols[0].pos.indexOf(f)
      return `${P.people[q]}:${dates[ev.sols[0].val[P.slotCat as number][q]]}`
    }).join(' ')
    if (got !== 'P:March 5 Q:March 12 R:March 26 S:August 5 T:August 12 U:August 19 V:August 26') fail(`vacant-dates sample: got ${got}`)
  }
}

// the row facing south: the answer key is the picture, drawn west → east
{
  const so = SAMPLES.find((x) => x.id === 'south-row')
  const r = so ? parsePuzzle(so.text) : null
  const e = r?.puzzle ? enumerate(r.puzzle, 3) : null
  if (!r?.puzzle || !e || e.sols.length !== 1 || r.unparsed.length || !r.puzzle.mirror) fail('south-row sample: expected one solution, every clue read and the south-facing mirror')
  else {
    const P = r.puzzle
    const got = Array.from({ length: 8 }, (_, f) => {
      const q = e.sols[0].pos.indexOf(f)
      return `${P.people[q]}:${P.cats[0].values[e.sols[0].val[0][q]]}`
    }).join(' ')
    if (got !== 'F:Yellow C:Black D:Coral H:Pink A:Blue B:White G:Purple E:Azure') fail(`south-row sample: got ${got}`)
  }
}

// a week of seven people: the days start from the named day, and the answer key is the table of the original puzzle
{
  const wk = SAMPLES.find((x) => x.id === 'week-bikes')
  const r = wk ? parsePuzzle(wk.text) : null
  const e = r?.puzzle ? enumerate(r.puzzle, 3) : null
  if (!r?.puzzle || !e || e.sols.length !== 1 || r.unparsed.length) fail('week-bikes sample: expected exactly one solution and every clue read')
  else {
    const P = r.puzzle
    const got = Array.from({ length: 7 }, (_, f) => `${(P.labels as string[])[f]}:${P.people[e.sols[0].pos.indexOf(f)]}/${P.cats[0].values[e.sols[0].val[0][e.sols[0].pos.indexOf(f)]]}`).join(' ')
    if (got !== 'Monday:Shivam/Ducati Tuesday:Yuvraj/Ronin Wednesday:Mayank/KTM Thursday:Gautam/Bajaj Friday:Virat/Honda Saturday:Hardik/Benelli Sunday:Rohit/Yamaha') fail(`week-bikes sample: got ${got}`)
  }
  const thu = parsePuzzle(`Seven friends A, B, C, D, E, F and G buy seven different bikes namely Honda, KTM, Ronin, Ducati, Yamaha, Bajaj and Benelli in a week. The week is starting from Thursday.\nA buys Honda on Monday.`)
  const lab = thu.puzzle?.labels
  if (!lab || lab[0] !== 'Thursday' || lab[6] !== 'Wednesday') fail(`week starting from Thursday: got ${lab?.join(',')}`)
}

// candidates with two-letter names given only in the clues, months and dates in two sentences; the answer key is the table of the original puzzle
{
  const cd = SAMPLES.find((x) => x.id === 'candidates-months')
  const r = cd ? parsePuzzle(cd.text) : null
  const e = r?.puzzle ? enumerate(r.puzzle, 3) : null
  if (!r?.puzzle || !e || e.sols.length !== 1 || r.unparsed.length) fail('candidates-months sample: expected exactly one solution and every clue read')
  else {
    const P = r.puzzle
    const got = Array.from({ length: 8 }, (_, f) => `${(P.labels as string[])[f]}:${P.people[e.sols[0].pos.indexOf(f)]}`).join(' ')
    if (got !== 'May 17:Aa May 28:Ec June 17:Ce June 28:Cd July 17:Cc July 28:Ab August 17:Ea August 28:Eb') fail(`candidates-months sample: got ${got}`)
  }
}

// six people on the seven days of a week: the vacant day follows from the clues (Thursday), and the answer is the original puzzle's table
{
  const wv = SAMPLES.find((x) => x.id === 'week-vacant')
  const r = wv ? parsePuzzle(wv.text) : null
  const e = r?.puzzle ? enumerate(r.puzzle, 3) : null
  if (!r?.puzzle || !e || e.sols.length !== 1 || r.unparsed.length) fail('week-vacant sample: expected exactly one solution and every clue read')
  else {
    const P = r.puzzle
    const days = P.cats[P.slotCat as number].values
    const got = Array.from({ length: P.n }, (_, f) => {
      const q = e.sols[0].pos.indexOf(f)
      return `${days[e.sols[0].val[P.slotCat as number][q]]}:${P.people[q]}/${P.cats[0].values[e.sols[0].val[0][q]]}`
    }).join(' ')
    if (got !== 'Monday:Shivam/Ducati Tuesday:Yuvraj/Ronin Wednesday:Mayank/KTM Friday:Virat/Honda Saturday:Hardik/Benelli Sunday:Rohit/Yamaha') fail(`week-vacant sample: got ${got}`)
  }
}

// classes 1 … 8 with senior / junior wording: the answer key is the table of the original puzzle (class 8 first)
{
  const cl = SAMPLES.find((x) => x.id === 'classes-colors')
  const r = cl ? parsePuzzle(cl.text) : null
  const e = r?.puzzle ? enumerate(r.puzzle, 3) : null
  if (!r?.puzzle || !e || e.sols.length !== 1 || r.unparsed.length || !r.puzzle.hierarchy) fail('classes-colors sample: expected exactly one solution, every clue read and the class hierarchy')
  else {
    const P = r.puzzle
    const got = Array.from({ length: 8 }, (_, f) => {
      const q = e.sols[0].pos.indexOf(7 - f)
      return `${8 - f}:${P.people[q]}/${P.cats[0].values[e.sols[0].val[0][q]]}`
    }).join(' ')
    if (got !== '8:A/Black 7:F/Blue 6:G/Hex 5:E/Pink 4:B/Yellow 3:H/Red 2:D/Orange 1:C/Crimson') fail(`classes-colors sample: got ${got}`)
  }
}

// birth years with clues about ages (base year 2023): one arrangement, checked by hand against every clue
{
  const ya = SAMPLES.find((x) => x.id === 'years-ages')
  const r = ya ? parsePuzzle(ya.text) : null
  const e = r?.puzzle ? enumerate(r.puzzle, 3) : null
  if (!r?.puzzle || !e || e.sols.length !== 1 || r.unparsed.length || !r.puzzle.values) fail('years-ages sample: expected exactly one solution, every clue read and the numeric years')
  else {
    const P = r.puzzle
    const got = Array.from({ length: 8 }, (_, f) => `${(P.labels as string[])[f]}:${P.people[e.sols[0].pos.indexOf(f)]}`).join(' ')
    if (got !== '1959:E 1976:B 1979:G 1986:A 1990:D 1993:H 1998:F 2005:C') fail(`years-ages sample: got ${got}`)
    // the ages shown beside the years (the table of the original puzzle: 64, 47, 44, 37, 33, 30, 25, 18)
    const ctxYears = new Ctx(P)
    const ages = Array.from({ length: 8 }, (_, f) => ctxYears.ageAt(f)).join(' ')
    if (ages !== '64 47 44 37 33 30 25 18') fail(`years-ages sample: ages ${ages}`)
  }
}

// eight people in a nine-storied building (one floor empty): the answer was found by an independent brute force over every empty floor
{
  const sv = SAMPLES.find((x) => x.id === 'storeys-vacant')
  const r = sv ? parsePuzzle(sv.text) : null
  const e = r?.puzzle ? enumerate(r.puzzle, 3) : null
  if (!r?.puzzle || !e || e.sols.length !== 1 || r.unparsed.length) fail('storeys-vacant sample: expected exactly one solution and every clue read')
  else {
    const P = r.puzzle
    const floors = P.cats[P.slotCat as number].values
    const got = Array.from({ length: P.n }, (_, f) => {
      const q = e.sols[0].pos.indexOf(f)
      return `${floors[e.sols[0].val[P.slotCat as number][q]].replace('floor ', '')}:${P.people[q]}`
    }).join(' ')
    if (got !== '1:R 2:P 4:N 5:Q 6:S 7:O 8:M 9:T') fail(`storeys-vacant sample: got ${got}`)
  }
}

// January, March, May, August: "three months before" is the calendar gap (May → August); "three persons before" is three places (January → August)
{
  const pairsOf = (clue: string) => {
    const r = parsePuzzle(`${GAPMONTH_HEADER}${clue}`)
    const e = r.puzzle ? enumerate(r.puzzle, 50) : null
    return r.puzzle && e ? [...new Set(e.sols.map((s) => `${(r.puzzle as Puzzle).labels?.[s.pos[0]]}>${(r.puzzle as Puzzle).labels?.[s.pos[1]]}`))].sort().join(' ') : 'no puzzle'
  }
  const a = pairsOf('A was born three months before B.')
  if (a !== 'May>August') fail(`calendar gap: "three months before" gave ${a}, expected May>August`)
  const b = pairsOf('A was born three persons before B.')
  if (b !== 'January>August') fail(`calendar gap: "three persons before" gave ${b}, expected January>August`)
  const c = pairsOf('There are two months between A and B.')
  if (c !== 'August>May May>August') fail(`calendar gap: "two months between" gave ${c}`)
}

// six boxes on shelves with colours (exam puzzle): exactly one arrangement, M on shelf 6 is Azure and L on shelf 3
{
  const text = `${BOXCOLOR_HEADER}Gray color box is placed on an even-numbered shelf and immediately above the Coral color box. The number of boxes below the Azure color box is the same as above box J. The Orange box is placed on an odd-numbered shelf and two boxes above box L. Box I is neither Hex nor placed above box K. Hex color box is placed adjacent to box J and three boxes below box K. Only two boxes are placed between boxes L and M, which is Azure in color.`
  const r = parsePuzzle(text)
  const e = r.puzzle ? enumerate(r.puzzle, 5) : null
  if (!r.puzzle || r.unparsed.length || !e || e.sols.length !== 1) fail(`boxes and colours: expected one solution, got ${e ? e.sols.length : 'no puzzle'}`)
  else if (r.puzzle.people.map((_, i) => e.sols[0].pos[i] + 1).join('') !== '241536' || e.sols[0].val[0].join('') !== '013452') fail('boxes and colours: wrong arrangement')
}

// a round table of unknown size ("at least fifteen persons"): the size the clues allow is found, the unnamed people are interchangeable
{
  const text = `A certain number of persons are seating a circular table facing towards the centre. Two persons are sitting between S and W. X and W are immediate neighbors. Y is neither neighbor of W nor X. Z is neighbor of neither X nor W. Not more than six persons sit between U and V when counted from the right of U. At least fifteen persons are sitting around a circular table. T sits third to the right of W. V is to the immediate left of S. U sits third to the right of X. Only five persons sit between Z and Y (either from right or left from Z).`
  const r = parsePuzzle(text)
  const e = r.puzzle ? enumerate(r.puzzle, 50) : null
  if (!r.puzzle || r.unparsed.length || !e) fail(`open round table: ${r.errors.join('; ') || 'not understood'}`)
  else {
    if (r.puzzle.n !== 15) fail(`open round table: expected 15 persons, got ${r.puzzle.n}`)
    // the named people occupy the same seats in every arrangement apart from Y and Z swapping (a mirror image)
    if (e.sols.length !== 2) fail(`open round table: expected 2 arrangements, got ${e.sols.length}`)
    const t = buildTrace(r.puzzle)
    if (t.status !== 'multiple' || !t.steps.length) fail(`open round table: walkthrough ended as ${t.status}`)
  }
}

// nine events on dates of three months; only the events starting with a consonant have a state (the vowel ones have none)
{
  const text = `Nine events U, S, R, Q, O, E, M, N & P are held on 7th, 19th and 28th of different months (June, July and August) in the same year. Events, whose name starts with consonant, are held in different states among Mizoram, Lakashadweep, Ladakh, Chandigarh, Odisha and Manipur. Three events are held between N and M, which is held in Ladakh. N is not held in Mizoram. O and E are held after R, which is not held on 7th June. Event in Manipur is held immediately after N, which is held in August. Q is held in Chandigarh. Event in Odisha is held immediately before U, but in different months. P is held after S.`
  const r = parsePuzzle(text)
  const e = r.puzzle ? enumerate(r.puzzle, 50) : null
  if (!r.puzzle || r.unparsed.length || !e) fail(`events and states: ${r.errors.join('; ') || 'not understood'}`)
  else {
    // O and E may swap (the answer table shows "O/E" and "E/O"); everything else is fixed
    if (e.sols.length !== 2) fail(`events and states: expected 2 arrangements, got ${e.sols.length}`)
    const pl = r.puzzle.people
    const at = (sol: Solution, nm: string) => sol.pos[pl.indexOf(nm)]
    const want: Record<string, number> = { Q: 0, R: 1, M: 3, S: 5, U: 6, N: 7, P: 8 }
    for (const sol of e.sols) for (const [nm, w] of Object.entries(want)) if (at(sol, nm) !== w) fail(`events and states: ${nm} should be on date ${w + 1}, got ${at(sol, nm) + 1}`)
    const st = e.sols[0].val[0].map((v, i) => `${pl[i]}${r.puzzle!.cats[0].values[v]}`).filter((x) => !/none/.test(x)).sort().join(' ')
    if (st !== 'MLadakh NLakashadweep PManipur QChandigarh RMizoram SOdisha') fail(`events and states: wrong states ${st}`)
    const t = buildTrace(r.puzzle)
    if (t.status !== 'multiple' || !t.steps.length) fail(`events and states: walkthrough ended as ${t.status}`)
  }
}

// two rows described in one sentence ("… in Row 1 facing north whereas P … in Row 2 facing south"): exactly one arrangement
{
  const text = `Seven persons H, I, J, K, L, M & N are sitting in Row 1 facing north whereas P, Q, R, S, T, U and V are sitting in Row 2 facing south such that both rows are equidistant and parallel to each other. The persons sitting in Row 1 face the persons siting in Row 2 and vice versa. T does not face K or M. R sits 4 th to the right of P, who does not sit adjacent to V. Either M or K sits at one of the extreme ends. Two persons sits between H and I. L faces S. K sits 4 th to the right of M, who sits 2 nd to the left of L. Two persons sit between P and S. H faces U. R does not face J. U does not sit at any extreme ends of the row`
  const r = parsePuzzle(text)
  const e = r.puzzle ? enumerate(r.puzzle, 50) : null
  if (!r.puzzle || r.unparsed.length || r.warnings.length || !e) fail(`two rows in one sentence: ${r.errors.join('; ') || r.unparsed.join(' | ') || r.warnings.join('; ') || 'not understood'}`)
  else if (r.puzzle.axis !== 'tworow' || r.puzzle.n !== 14 || e.sols.length !== 1) fail(`two rows in one sentence: expected one arrangement of 14 people, got ${e.sols.length} (axis ${r.puzzle.axis}, n ${r.puzzle.n})`)
}

// a row of unknown length: "not more than two known persons on adjacent seats" is what separates 19 persons from 17
{
  const sample = SAMPLES.find((x) => x.id === 'open-row')
  const r = sample ? parsePuzzle(sample.text) : null
  const e = r?.puzzle ? enumerate(r.puzzle, 50) : null
  if (!r?.puzzle || r.unparsed.length || !e) fail('open row: not understood')
  else if (r.puzzle.n !== 19 || e.sols.length !== 1 || r.puzzle.maxNamedRun !== 2) fail(`open row: expected 19 persons and one arrangement, got ${r.puzzle.n} persons / ${e.sols.length} arrangements`)
  else {
    const pl = r.puzzle.people
    const at = (nm: string) => e.sols[0].pos[pl.indexOf(nm)] + 1
    // R = 3 seats left of N, N = 2 seats left of P; checked against the clues directly
    if (at('N') !== at('R') + 3 || at('N') !== at('P') - 2 || Math.abs(at('P') - at('U')) !== 6 || at('S') !== 16 || Math.abs(at('S') - at('L')) !== 5) fail('open row: arrangement does not satisfy the clues')
  }
}

// mistakes in the input are reported, not guessed at
for (const [label, text, needle] of [
  ['no people', 'Hello there. A lives above B.', 'list of people'],
  ['value count', 'Four persons - A, B, C, D - sit in a row. Each of them likes a different colour - Red, Blue, Green.\nA sits at the left end.', 'values'],
  ['floor count', 'Four persons - A, B, C, D - live on six different floors of a building.\nA lives on the topmost floor.', 'not supported'],
] as const) {
  const r = parsePuzzle(text)
  if (r.puzzle || !r.errors.some((e) => e.includes(needle))) fail(`error case "${label}" not reported (${JSON.stringify(r.errors)})`)
}

// ─── 2/3. random puzzles ─────────────────────────────────────────────────────

let seed = 12345
const rnd = () => {
  seed = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}
const ri = (n: number) => Math.floor(rnd() * n)
const shuffle = <T>(a: T[]): T[] => {
  const x = [...a]
  for (let i = x.length - 1; i > 0; i--) {
    const j = ri(i + 1)
    ;[x[i], x[j]] = [x[j], x[i]]
  }
  return x
}

/** Plain-meaning evaluation of a clue atom against a complete arrangement (shares no code with the engine). */
function holds(p: Puzzle, sol: Solution, a: Atom): boolean {
  const m = p.axis === 'tworow' ? p.n / 2 : 0
  const rowOf = (q: number) => (m ? Math.floor(q / m) : 0)
  const seatOf = (q: number) => (m ? q % m : q)
  // the person a term stands for (-1 when "the one three seats to the right of X" does not exist)
  const personOf = (t: Term): number => {
    if (t.k === 'p') return t.i
    if (t.k === 'v') return sol.val[t.c].indexOf(t.i)
    if (t.k === 'f') return sol.pos.indexOf(t.f)
    const b = personOf(t.base)
    if (b < 0) return -1
    const q = sol.pos[b]
    if (t.op === 'opp') return sol.pos.findIndex((w) => rowOf(w) !== rowOf(q) && seatOf(w) === m - 1 - seatOf(q))
    return sol.pos.findIndex((w) => rowOf(w) === rowOf(q) && seatOf(w) === seatOf(q) + t.d)
  }
  const at = (t: Term): number => (t.k === 'f' ? t.f : personOf(t) < 0 ? -1 : sol.pos[personOf(t)])
  const circ = p.axis === 'circle'
  const wrap = (x: number) => ((x % p.n) + p.n) % p.n
  let r: boolean
  if ((a.t === 'set' || a.t === 'grid' || a.t === 'diff' || a.t === 'gap' || a.t === 'adj' || a.t === 'same' || a.t === 'cnt') && a.on === 'slot' && p.slotCat !== undefined) {
    // the date of a person (vacant dates simply have nobody)
    const sv = (t: Term) => sol.val[p.slotCat as number][personOf(t)]
    if (a.t === 'set') r = a.fs.includes(sv(a.x))
    else if (a.t === 'cnt') {
      const total = p.cats[p.slotCat as number].values.length
      const side = (q: number, s: 'l' | 'r') => (s === 'l' ? q : total - 1 - q)
      r = side(sv(a.x), a.xs) === side(sv(a.y), a.ys)
    } else if (a.t === 'diff') r = sv(a.x) - sv(a.y) === a.d
    else if (a.t === 'adj') r = Math.abs(sv(a.x) - sv(a.y)) === 1
    else if (a.t === 'gap') r = Math.abs(sv(a.x) - sv(a.y)) - 1 >= a.k && Math.abs(sv(a.x) - sv(a.y)) - 1 <= (a.hi ?? a.k) && sv(a.x) !== sv(a.y)
    else if (a.t === 'same') r = sv(a.x) !== sv(a.y) && sv(a.z) !== sv(a.w) && Math.abs(sv(a.x) - sv(a.y)) === Math.abs(sv(a.z) - sv(a.w))
    else {
      const cols = p.cols ?? 1
      const sx = sv(a.x)
      const sy = sv(a.y)
      const cmp = (rel: string | undefined, u: number, v: number) => (rel === undefined ? true : rel === 'gt' ? u > v : rel === 'lt' ? u < v : rel === 'eq' ? u === v : u !== v)
      r = cmp(a.row, Math.floor(sx / cols), Math.floor(sy / cols)) && cmp(a.col, sx % cols, sy % cols)
    }
    return a.neg ? !r : r
  }
  if ((a.t === 'diff' || a.t === 'gap') && a.by === 'value' && p.values) {
    // months / years / days counted on the calendar, whatever the listed ones are
    const vx = p.values[at(a.x)]
    const vy = p.values[at(a.y)]
    r = a.t === 'diff' ? vx - vy === a.d : at(a.x) !== at(a.y) && Math.abs(vx - vy) - 1 >= a.k && Math.abs(vx - vy) - 1 <= (a.hi ?? a.k)
    return a.neg ? !r : r
  }
  if (m && a.t !== 'logic' && a.t !== 'link') {
    // two facing rows: a derived person who does not exist makes the clue false; relations along a row need both people in that row
    const ts: Term[] = a.t === 'btw' ? [a.x, a.y, a.z] : a.t === 'same' ? [a.x, a.y, a.z, a.w] : a.t === 'set' ? [a.x] : [a.x, a.y]
    const px = at(a.x)
    const py = a.t === 'set' ? -1 : at(a.y)
    if (ts.some((t) => at(t) < 0)) return !!a.neg
    const inRow = (u: number, v: number) => rowOf(u) === rowOf(v)
    switch (a.t) {
      case 'diff':
        r = inRow(px, py) && seatOf(px) - seatOf(py) === a.d
        break
      case 'rank':
        r = inRow(px, py) && (a.hi ? seatOf(px) > seatOf(py) : seatOf(px) < seatOf(py))
        break
      case 'adj':
        r = inRow(px, py) && Math.abs(seatOf(px) - seatOf(py)) === 1
        break
      case 'gap':
        r = inRow(px, py) && px !== py && sol.pos.filter((q) => inRow(q, px) && seatOf(q) > Math.min(seatOf(px), seatOf(py)) && seatOf(q) < Math.max(seatOf(px), seatOf(py))).length === a.k
        break
      case 'btw': {
        const pz = at(a.z)
        r = inRow(px, py) && inRow(px, pz) && Math.min(seatOf(py), seatOf(pz)) < seatOf(px) && seatOf(px) < Math.max(seatOf(py), seatOf(pz))
        break
      }
      case 'same': {
        const pz = at(a.z)
        const pw = at(a.w)
        const between = (u: number, v: number) => sol.pos.filter((q) => inRow(q, u) && seatOf(q) > Math.min(seatOf(u), seatOf(v)) && seatOf(q) < Math.max(seatOf(u), seatOf(v))).length
        r = inRow(px, py) && inRow(pz, pw) && px !== py && pz !== pw && between(px, py) === between(pz, pw)
        break
      }
      case 'set':
        r = a.fs.includes(px)
        break
      case 'opp':
        r = !inRow(px, py) && seatOf(px) + seatOf(py) === m - 1
        break
      case 'samerow':
        r = inRow(px, py)
        break
      case 'cnt': {
        // how many people stand on the stated side of each person, inside that person's own row
        const count = (q: number, side: 'l' | 'r') => sol.pos.filter((w) => inRow(w, q) && (side === 'l' ? seatOf(w) < seatOf(q) : seatOf(w) > seatOf(q))).length
        r = count(px, a.xs) === count(py, a.ys)
        break
      }
      default:
        r = false
    }
    return a.neg ? !r : r
  }
  // people who face north (0) or south (1): the way person q faces
  const dirOf = (q: number): number => sol.val[p.dirCat as number][q]
  const isDirVal = (t: Term) => p.dirCat !== undefined && t.k === 'v' && t.c === p.dirCat
  switch (a.t) {
    case 'opp':
    case 'samerow':
    case 'cnt':
      return false
    case 'sdir':
      r = dirOf(personOf(a.x)) === dirOf(personOf(a.y))
      break
    case 'link':
      if (isDirVal(a.y)) r = dirOf(personOf(a.x)) === (a.y as { i: number }).i
      else if (isDirVal(a.x)) r = dirOf(personOf(a.y)) === (a.x as { i: number }).i
      else r = personOf(a.x) === personOf(a.y)
      return a.neg ? !r : r
    case 'diff': {
      // facing south, a person's left is to the east: "x is 2 to the left of y" is seen by y
      const flip = a.ref && dirOf(personOf(a.y)) === 1 ? -1 : 1
      // square table: a corner (even seat) faces outside, so what is on its right is the previous seat
      const sqFlip = p.square && at(a.y) % 2 === 0 ? -1 : 1
      r = circ ? wrap(at(a.x) - at(a.y)) === wrap(a.d * sqFlip) : at(a.x) - at(a.y) === a.d * flip
      break
    }
    case 'rank': {
      const flip = a.ref && dirOf(personOf(a.y)) === 1 ? -1 : 1
      r = a.hi ? flip * (at(a.x) - at(a.y)) > 0 : flip * (at(a.x) - at(a.y)) < 0
      break
    }
    case 'adj':
      r = circ ? [1, p.n - 1].includes(wrap(at(a.x) - at(a.y))) : Math.abs(at(a.x) - at(a.y)) === 1
      break
    case 'gap': {
      if (circ) {
        // people strictly between, counted round either side of the table
        const d = wrap(at(a.x) - at(a.y))
        r = d !== 0 && (d - 1 === a.k || p.n - d - 1 === a.k)
        break
      }
      const lo = Math.min(at(a.x), at(a.y))
      const hi = Math.max(at(a.x), at(a.y))
      r = lo !== hi && sol.pos.filter((q) => q > lo && q < hi).length >= a.k && sol.pos.filter((q) => q > lo && q < hi).length <= (a.hi ?? a.k)
      break
    }
    case 'grid': {
      const cols = p.cols ?? 1
      const px = at(a.x)
      const py = at(a.y)
      const rx = Math.floor(px / cols)
      const ry = Math.floor(py / cols)
      const cmp = (rel: string | undefined, u: number, v: number) => (rel === undefined ? true : rel === 'gt' ? u > v : rel === 'lt' ? u < v : rel === 'eq' ? u === v : u !== v)
      r = cmp(a.row, rx, ry) && cmp(a.col, px % cols, py % cols) && (a.rowDiff === undefined || rx - ry === a.rowDiff)
      break
    }
    case 'same': {
      const between = (u: Term, v: Term) => {
        const lo = Math.min(at(u), at(v))
        const hi = Math.max(at(u), at(v))
        return lo === hi ? -1 : sol.pos.filter((q) => q > lo && q < hi).length
      }
      r = between(a.x, a.y) >= 0 && between(a.x, a.y) === between(a.z, a.w)
      break
    }
    case 'vsame': {
      const vals = p.values as number[]
      r = at(a.x) !== at(a.y) && at(a.z) !== at(a.w) && Math.abs(vals[at(a.x)] - vals[at(a.y)]) === Math.abs(vals[at(a.z)] - vals[at(a.w)])
      break
    }
    case 'logic': {
      const x = holds(p, sol, a.a)
      const y = holds(p, sol, a.b)
      r = a.op === 'imp' ? !x || y : a.op === 'xor' ? x !== y : x || y
      break
    }
    case 'btw':
      r = Math.min(at(a.y), at(a.z)) < at(a.x) && at(a.x) < Math.max(at(a.y), at(a.z))
      break
    case 'set':
      r = a.fs.includes(at(a.x))
      break
  }
  return a.neg ? !r : r
}

function permutations(n: number): number[][] {
  const out: number[][] = []
  const rec = (cur: number[], rest: number[]) => {
    if (!rest.length) out.push(cur)
    for (let i = 0; i < rest.length; i++) rec([...cur, rest[i]], [...rest.slice(0, i), ...rest.slice(i + 1)])
  }
  rec([], Array.from({ length: n }, (_, i) => i))
  return out
}

/** Highest extra-category index (+1) an atom needs, 0 when it only involves people and positions. */
function needLevel(a: Atom, p?: Puzzle): number {
  if (a.t === 'logic') return Math.max(needLevel(a.a, p), needLevel(a.b, p))
  if (p && p.slotCat !== undefined && (a.t === 'set' || a.t === 'grid' || a.t === 'diff' || a.t === 'gap' || a.t === 'adj' || a.t === 'same' || a.t === 'cnt') && a.on === 'slot') return Math.max(p.slotCat + 1, needLevel({ ...a, on: undefined } as Atom))
  if (p && p.dirCat !== undefined && (a.t === 'sdir' || ((a.t === 'diff' || a.t === 'rank') && a.ref))) return Math.max(p.dirCat + 1, needLevel({ ...a, ref: undefined } as Atom))
  const ts: Term[] = a.t === 'btw' ? [a.x, a.y, a.z] : a.t === 'same' ? [a.x, a.y, a.z, a.w] : a.t === 'set' ? [a.x] : [a.x, a.y]
  const base = (t: Term): Term => (t.k === 'r' ? base(t.base) : t)
  return Math.max(0, ...ts.map((t) => { const b = base(t); return b.k === 'v' ? b.c + 1 : 0 }))
}

function bruteCount(p: Puzzle, cap: number): number {
  const perms = permutations(p.n)
  const byLevel: Atom[][] = Array.from({ length: p.cats.length + 1 }, () => [])
  for (const cl of p.clues) for (const a of cl.atoms) byLevel[needLevel(a, p)].push(a)
  const combos = (m: number, k: number): number[][] => (k === 0 ? [[]] : Array.from({ length: m }, (_, i) => i).flatMap((i) => combos(m - i - 1, k - 1).map((rest) => [i, ...rest.map((r) => r + i + 1)])))
  const slotCombos = p.slotCat !== undefined ? combos(p.cats[p.slotCat].values.length, p.n) : []
  // a direction is any pattern of north / south, not a permutation
  const dirPatterns = Array.from({ length: 1 << p.n }, (_, mask) => Array.from({ length: p.n }, (_, i) => (mask >> i) & 1))
  let count = 0
  const rec = (level: number, vals: number[][], pos: number[]) => {
    if (count >= cap) return
    const sol: Solution = { pos, val: vals }
    if (!byLevel[level].every((a) => holds(p, sol, a))) return
    if (level === p.cats.length) {
      count++
      return
    }
    // dates: each place in the order takes a later date than the one before (some dates stay unused)
    const slotChoices = level === p.slotCat ? slotCombos.map((ch) => Array.from({ length: p.n }, (_, person) => ch[pos[person]])) : []
    for (const perm of level === p.dirCat ? dirPatterns : level === p.slotCat ? slotChoices : perms) rec(level + 1, [...vals, perm], pos)
  }
  const ap = p.axis === 'circle' ? anchorPerson(p) : -1
  for (const pos of perms) if (ap < 0 || (p.square ? pos[ap] < 2 : pos[ap] === 0)) rec(0, [], pos)
  return count
}

function randomTerm(p: Puzzle, allowFloat: boolean): Term {
  const plain = p.dirCat ?? p.slotCat ?? p.cats.length // the direction / date category is last; it is not a one-to-one attribute
  if (allowFloat && plain && rnd() < 0.35) return { k: 'v', c: ri(plain), i: ri(p.n) }
  return { k: 'p', i: ri(p.n) }
}

/** A true clue about a round table: distances, opposite, neighbours, people between, and if/xor/or of two of those. */
function randomCircleAtom(p: Puzzle, hidden: Solution): Atom {
  const personOf = (t: Term): number => (t.k === 'p' ? t.i : hidden.val[t.c].indexOf(t.i))
  const simple = (): Atom => {
    const x = randomTerm(p, true)
    let y = randomTerm(p, true)
    let guard = 0
    while (personOf(y) === personOf(x) && guard++ < 30) y = randomTerm(p, true)
    const kind = ri(5)
    if (kind === 0) return { t: 'diff', x, y, d: (ri(2) ? 1 : -1) * (1 + ri(p.n - 1)) }
    if (kind === 1) return { t: 'adj', x, y }
    if (kind === 2) return { t: 'gap', x, y, k: ri(Math.max(1, p.n - 2)) }
    if (kind === 3 && p.n % 2 === 0) return { t: 'diff', x, y, d: p.n / 2 }
    return { t: 'diff', x, y, d: ri(2) ? 1 : -1 }
  }
  for (;;) {
    let atom: Atom
    const r = rnd()
    if (r < 0.3) atom = { t: 'logic', op: (['imp', 'xor', 'or'] as const)[ri(3)], a: simple(), b: simple() }
    else if (r < 0.37 && p.cats.length) atom = { t: 'link', x: { k: 'p', i: ri(p.n) }, y: { k: 'v', c: ri(p.cats.length), i: ri(p.n) } }
    else atom = simple()
    if (!holds(p, hidden, atom)) {
      if (atom.t === 'logic') continue
      atom = { ...atom, neg: true } as Atom
    }
    if (!holds(p, hidden, atom)) continue
    if (atom.t === 'link' && atom.neg && rnd() < 0.5) continue
    return atom
  }
}

/** A true clue about a building with several flats per floor: 2-D relations, cell sets, links. */
function randomGridAtom(p: Puzzle, hidden: Solution): Atom {
  const personOf = (t: Term): number => (t.k === 'p' ? t.i : hidden.val[t.c].indexOf(t.i))
  const cols = p.cols ?? 1
  const rows = p.n / cols
  const rels = ['gt', 'lt', 'eq', 'ne'] as const
  for (;;) {
    const x = randomTerm(p, true)
    let y = randomTerm(p, true)
    let guard = 0
    while (personOf(y) === personOf(x) && guard++ < 30) y = randomTerm(p, true)
    let atom: Atom
    const r = rnd()
    if (r < 0.6) {
      const row = rnd() < 0.7 ? rels[ri(4)] : undefined
      const col = row === undefined || rnd() < 0.5 ? rels[ri(4)] : undefined
      const rowDiff = row === 'gt' && rnd() < 0.3 ? 1 + ri(Math.max(1, rows - 1)) : undefined
      atom = { t: 'grid', x, y, row, col, rowDiff: rowDiff === undefined ? undefined : rowDiff }
    } else if (r < 0.93 || !p.cats.length) {
      const cells = Array.from({ length: p.n }, (_, i) => i)
      atom = { t: 'set', x, fs: shuffle(cells).slice(0, 1 + ri(Math.max(1, p.n - 2))).sort((a, b) => a - b) }
    } else atom = { t: 'link', x: { k: 'p', i: ri(p.n) }, y: { k: 'v', c: ri(p.cats.length), i: ri(p.n) } }
    if (!holds(p, hidden, atom)) atom = { ...atom, neg: true } as Atom
    if (!holds(p, hidden, atom)) continue
    if (atom.t === 'link' && atom.neg && rnd() < 0.5) continue
    return atom
  }
}

/** A true clue about two facing rows: relations inside a row, opposite, same row, counts, row / seat sets, and "the one who …" people. */
function randomTworowAtom(p: Puzzle, hidden: Solution): Atom {
  const m = p.n / 2
  const seatOf = (q: number) => q % m
  const personOf = (t: Term): number => (t.k === 'p' ? t.i : t.k === 'v' ? hidden.val[t.c].indexOf(t.i) : -1)
  /** does the derived person exist in the hidden arrangement? */
  const exists = (t: Term): boolean => {
    if (t.k !== 'r' || t.op === 'opp') return true
    const seat = seatOf(hidden.pos[personOf(t.base)]) + t.d // derived people are only ever built on a named person or value
    return seat >= 0 && seat < m
  }
  const derived = (): Term => {
    const base = randomTerm(p, true)
    return rnd() < 0.45 ? { k: 'r', base, op: 'opp', d: 0 } : { k: 'r', base, op: 'shift', d: (ri(2) ? 1 : -1) * (1 + ri(Math.max(1, m - 1))) }
  }
  const term = (allowDerived: boolean): Term => (allowDerived && rnd() < 0.25 ? derived() : randomTerm(p, true))
  const simple = (allowDerived: boolean): Atom => {
    const x = term(allowDerived)
    let y = term(allowDerived)
    let guard = 0
    while (x.k !== 'r' && y.k !== 'r' && personOf(y) === personOf(x) && guard++ < 30) y = term(allowDerived)
    const z = randomTerm(p, true)
    const kind = ri(11)
    if (kind === 0) return { t: 'diff', x, y, d: (ri(2) ? 1 : -1) * (1 + ri(Math.max(1, m - 1))) }
    if (kind === 1) return { t: 'rank', x, y, hi: rnd() < 0.5 }
    if (kind === 2) return { t: 'adj', x, y }
    if (kind === 3) return { t: 'gap', x, y, k: ri(Math.max(1, m - 1)) }
    if (kind === 4) return { t: 'btw', x, y, z }
    if (kind === 5) {
      const row = ri(2)
      return { t: 'set', x, fs: rnd() < 0.4 ? Array.from({ length: m }, (_, i) => row * m + i) : shuffle(Array.from({ length: p.n }, (_, i) => i)).slice(0, 1 + ri(4)).sort((a, b) => a - b) }
    }
    if (kind === 6 || kind === 7) return { t: 'opp', x, y }
    if (kind === 8) return { t: 'samerow', x, y }
    if (kind === 9) return { t: 'cnt', x, xs: ri(2) ? 'l' : 'r', y, ys: ri(2) ? 'l' : 'r' }
    return { t: 'diff', x, y, d: ri(2) ? 1 : -1 }
  }
  for (;;) {
    let atom: Atom
    const r = rnd()
    if (r < 0.12) atom = { t: 'logic', op: (['imp', 'xor', 'or'] as const)[ri(3)], a: simple(false), b: simple(false) }
    else if (r < 0.2 && p.cats.length) atom = { t: 'link', x: { k: 'p', i: ri(p.n) }, y: { k: 'v', c: ri(p.cats.length), i: ri(p.n) } }
    else atom = simple(true)
    if (atom.t !== 'logic' && atom.t !== 'link') {
      const ts: Term[] = atom.t === 'btw' ? [atom.x, atom.y, atom.z] : atom.t === 'set' ? [atom.x] : [atom.x, atom.y]
      // a clue about someone who does not exist is neither true nor false in plain English: leave those out
      if (ts.some((t) => !exists(t))) continue
    }
    if (!holds(p, hidden, atom)) {
      if (atom.t === 'logic') continue
      atom = { ...atom, neg: true } as Atom
    }
    if (!holds(p, hidden, atom)) continue
    if (atom.t === 'link' && atom.neg && rnd() < 0.5) continue
    return atom
  }
}

/** A true clue about a line of people who face north or south: relations as seen by the second person, same direction, facing links. */
function randomMixedAtom(p: Puzzle, hidden: Solution): Atom {
  const dirOf = (q: number) => hidden.val[p.dirCat as number][q]
  for (;;) {
    const x = randomTerm(p, true)
    let y = randomTerm(p, true)
    let guard = 0
    const personOf = (t: Term): number => (t.k === 'p' ? t.i : t.k === 'v' ? hidden.val[t.c].indexOf(t.i) : -1)
    while (personOf(y) === personOf(x) && guard++ < 20) y = randomTerm(p, true)
    const z = randomTerm(p, true)
    const kind = ri(10)
    let atom: Atom
    if (kind <= 2) atom = { t: 'diff', x, y, d: (ri(2) ? 1 : -1) * (1 + ri(3)), ref: true }
    else if (kind === 3 || kind === 4) atom = { t: 'rank', x, y, hi: rnd() < 0.5, ref: true }
    else if (kind === 5) atom = { t: 'sdir', x: { k: 'p', i: ri(p.n) }, y: { k: 'p', i: ri(p.n) } }
    else if (kind === 6) atom = { t: 'link', x: { k: 'p', i: ri(p.n) }, y: { k: 'v', c: p.dirCat as number, i: ri(2) } }
    else if (kind === 7) atom = { t: 'set', x, fs: shuffle(Array.from({ length: p.n }, (_, i) => i)).slice(0, 1 + ri(3)).sort((a, b) => a - b) }
    else if (kind === 8) atom = { t: 'gap', x, y, k: ri(3) }
    else atom = ri(2) ? { t: 'adj', x, y } : { t: 'btw', x, y, z }
    void dirOf
    if (!holds(p, hidden, atom)) atom = { ...atom, neg: true } as Atom
    if (!holds(p, hidden, atom)) continue
    if (atom.t === 'sdir' && personOfTerm(atom.x) === personOfTerm(atom.y)) continue
    return atom
  }
}
const personOfTerm = (t: Term): number => (t.k === 'p' ? t.i : -1)

/** A true clue about people in date order on a few dates of a few months, some dates vacant: order clues, clues about a person's date, same month / date. */
function randomSlotAtom(p: Puzzle, hidden: Solution): Atom {
  const m = p.cats[p.slotCat as number].values.length
  const personOf = (t: Term): number => (t.k === 'p' ? t.i : t.k === 'v' ? hidden.val[t.c].indexOf(t.i) : -1)
  const rels = ['gt', 'lt', 'eq', 'ne'] as const
  for (;;) {
    const x = randomTerm(p, true)
    let y = randomTerm(p, true)
    let guard = 0
    while (personOf(y) === personOf(x) && guard++ < 20) y = randomTerm(p, true)
    const z = randomTerm(p, true)
    const kind = ri(10)
    let atom: Atom
    if (kind === 0) atom = { t: 'diff', x, y, d: (ri(2) ? 1 : -1) * (1 + ri(2)) }
    else if (kind === 1) atom = { t: 'rank', x, y, hi: rnd() < 0.5 }
    else if (kind === 2) atom = { t: 'adj', x, y }
    else if (kind === 3) atom = { t: 'gap', x, y, k: ri(3) }
    else if (kind === 4) atom = { t: 'btw', x, y, z }
    else if (kind === 5 || kind === 6) atom = { t: 'set', x, fs: shuffle(Array.from({ length: m }, (_, i) => i)).slice(0, 1 + ri(m - 1)).sort((a, b) => a - b), on: 'slot' }
    else if (kind === 7) atom = { t: 'grid', x, y, row: rels[ri(4)], col: ri(2) ? rels[ri(4)] : undefined, on: 'slot' }
    else if (kind === 8) atom = { t: 'link', x: { k: 'p', i: ri(p.n) }, y: { k: 'v', c: p.slotCat as number, i: ri(m) } }
    else atom = { t: 'gap', x, y, k: ri(2), hi: 2 + ri(2) }
    // some clues count the dates themselves ("two days after", "three days between"), vacant dates included
    if (rnd() < 0.3 && atom.t !== 'link' && atom.t !== 'set' && atom.t !== 'grid' && atom.t !== 'rank' && atom.t !== 'btw' && atom.t !== 'logic') atom = { ...atom, on: 'slot' } as Atom
    if (rnd() < 0.15) atom = { t: 'same', x, y, z, w: randomTerm(p, true), on: 'slot' }
    if (rnd() < 0.12) atom = { t: 'cnt', x, xs: ri(2) ? 'l' : 'r', y, ys: ri(2) ? 'l' : 'r', on: 'slot' }
    if (!holds(p, hidden, atom)) atom = { ...atom, neg: true } as Atom
    if (!holds(p, hidden, atom)) continue
    return atom
  }
}

function randomAtom(p: Puzzle, hidden: Solution): Atom {
  if (p.slotCat !== undefined) return randomSlotAtom(p, hidden)
  if (p.square && rnd() < 0.2) {
    const parity = ri(2)
    let atom: Atom = { t: 'set', x: { k: 'p', i: ri(p.n) }, fs: Array.from({ length: p.n }, (_, f) => f).filter((f) => f % 2 === parity) }
    if (!holds(p, hidden, atom)) atom = { ...atom, neg: true }
    return atom
  }
  if (p.dirCat !== undefined) return randomMixedAtom(p, hidden)
  if (p.axis === 'tworow') return randomTworowAtom(p, hidden)
  if (p.axis === 'grid') return randomGridAtom(p, hidden)
  if (p.axis === 'circle') return randomCircleAtom(p, hidden)
  for (;;) {
    const x = randomTerm(p, true)
    let y = randomTerm(p, true)
    let z = randomTerm(p, true)
    const personOf = (t: Term): number => (t.k === 'p' ? t.i : hidden.val[t.c].indexOf(t.i))
    let guard = 0
    while (personOf(y) === personOf(x) && guard++ < 20) y = randomTerm(p, true)
    guard = 0
    while ((personOf(z) === personOf(x) || personOf(z) === personOf(y)) && guard++ < 20) z = randomTerm(p, true)
    const kind = ri(9)
    let atom: Atom
    if (kind === 8) {
      const w = randomTerm(p, true)
      atom = { t: 'same', x, y, z, w }
    } else if (kind === 0) atom = { t: 'diff', x, y, d: (ri(2) ? 1 : -1) * (1 + ri(3)) }
    else if (kind === 1) atom = { t: 'rank', x, y, hi: rnd() < 0.5 }
    else if (kind === 2) atom = { t: 'adj', x, y }
    else if (kind === 3) atom = { t: 'gap', x, y, k: ri(4) }
    else if (kind === 4) atom = { t: 'btw', x, y, z }
    else if (kind === 5) atom = { t: 'set', x, fs: shuffle(Array.from({ length: p.n }, (_, i) => i)).slice(0, 1 + ri(3)).sort((a, b) => a - b) }
    else if (kind === 6 && p.cats.length) {
      const c = ri(p.cats.length)
      atom = { t: 'link', x: { k: 'p', i: ri(p.n) }, y: { k: 'v', c, i: ri(p.n) } }
    } else atom = { t: 'diff', x, y, d: ri(2) ? 1 : -1 }
    // months listed with gaps: some clues count real calendar months ("three months before")
    if (p.values && p.axis === 'order' && (atom.t === 'diff' || atom.t === 'gap') && rnd() < 0.5) atom = atom.t === 'diff' ? { ...atom, d: (ri(2) ? 1 : -1) * (1 + ri(9)), by: 'value' } : { ...atom, k: ri(5), by: 'value' }
    const truth = holds(p, hidden, atom)
    // make it true: negate a false clue (only sensible for some kinds, so keep it for rarely-negated kinds too)
    if (!truth) atom = { ...atom, neg: true } as Atom
    if (!holds(p, hidden, atom)) continue
    if (atom.t === 'link' && atom.neg && rnd() < 0.5) continue
    return atom
  }
}

function randomPuzzle(n: number, nCats: number, nClues: number, axis: Puzzle['axis'] = 'floor', mixed = false, square = false, slotM = 0): { puzzle: Puzzle; hidden: Solution } {
  const people = 'ABCDEFGHIJ'.slice(0, n).split('')
  const cats = Array.from({ length: nCats }, (_, c) => ({ name: `cat${c}`, values: Array.from({ length: n }, (_, i) => `v${c}${i}`) }))
  const hidden: Solution = { pos: shuffle(Array.from({ length: n }, (_, i) => i)), val: cats.map(() => shuffle(Array.from({ length: n }, (_, i) => i))) }
  if (slotM) {
    // dates: each place in the order has a later date than the one before; slotM - n dates stay vacant
    cats.push({ name: 'date', values: Array.from({ length: slotM }, (_, i) => `S${i}`) })
    const chosen = shuffle(Array.from({ length: slotM }, (_, i) => i)).slice(0, n).sort((a, b) => a - b)
    hidden.val.push(hidden.pos.map((f) => chosen[f]))
  }
  if (mixed) {
    // everyone faces north (0) or south (1), whichever they like
    cats.push({ name: 'direction', values: ['north', 'south'] })
    hidden.val.push(Array.from({ length: n }, () => ri(2)))
  }
  const puzzle: Puzzle = { n, axis, topDown: false, people, cats, clues: [], ...(axis === 'order' ? { labels: ['January', 'March', 'April', 'July', 'August', 'November'].slice(0, n), values: [1, 3, 4, 7, 8, 11].slice(0, n), unit: 'month', on: 'in', verb: 'was born' } : {}) }
  if (axis === 'circle') puzzle.facing = 'out'
  if (mixed) puzzle.dirCat = cats.length - 1
  if (square) puzzle.square = true
  if (slotM) {
    puzzle.slotCat = cats.length - 1
    puzzle.cols = slotM % 3 === 0 ? 3 : 2
  }
  if (axis === 'tworow') puzzle.rowLen = n / 2
  if (axis === 'grid') {
    puzzle.cols = n % 2 === 0 ? 2 : 1
    puzzle.flats = ['A', 'B'].slice(0, puzzle.cols)
  }
  for (let k = 0; k < nClues; k++) puzzle.clues.push({ id: k + 1, text: `random clue ${k + 1}`, atoms: [randomAtom(puzzle, hidden)] })
  if (axis === 'circle') {
    // the engine fixes one person in seat 1 (turning a round table gives the same arrangement), so compare against the turned copy
    const at0 = hidden.pos[anchorPerson(puzzle)]
    const shift = square ? at0 - (at0 % 2) : at0 // a square table can only be turned by an even number of seats
    hidden.pos = hidden.pos.map((q) => (((q - shift) % n) + n) % n)
  }
  return { puzzle, hidden }
}

let compared = 0
const kinds: Record<string, number> = {}
let trials = 0
let uniqueTraced = 0
let multiple = 0
let whatIfs = 0
let eliminations = 0
for (let run = 0; run < RUNS; run++) {
  const axis = (['floor', 'row', 'order', 'circle', 'grid', 'tworow'] as const)[Math.floor(run / 3) % 6]
  const n = axis === 'tworow' ? (run % 2 ? 4 : 6) : 4 + (run % 3) // 4..6 (two rows need an even number)
  const nCats = n === 6 ? 1 : run % 3 === 0 ? 0 : 1 + (run % 2)
  const nClues = run % 5 === 0 ? 3 + ri(n) : 3 * n + ri(2 * n)
  const mixed = run % 7 === 3
  const square = !mixed && run % 11 === 5
  const slotM = !mixed && !square && run % 13 === 7 ? (run % 2 ? 6 : 5) : 0 // dates with vacancies
  const { puzzle, hidden } = randomPuzzle(square ? 8 : slotM ? 4 : n, square ? 0 : slotM ? run % 3 === 0 ? 0 : 1 : nCats, nClues, mixed ? 'row' : square ? 'circle' : slotM ? 'row' : axis, mixed, square, slotM)
  const where = `run ${run} (${mixed ? 'row, facing north/south' : square ? 'square table' : slotM ? `dates with ${slotM - 4} vacant` : axis}, n=${puzzle.n}, cats=${puzzle.cats.length}, clues=${nClues})`

  if (process.env.TRACE_RUNS) console.error('run', run, where)
  const limit = 40
  const res = enumerate(puzzle, limit)
  const brute = bruteCount(puzzle, limit)
  compared++
  if (!res.complete || res.sols.length !== brute) fail(`${where}: engine found ${res.sols.length} solutions, brute force ${brute}`)
  const complete = res.sols.length < limit
  const hiddenFound = res.sols.some((s) => s.pos.every((v, i) => v === hidden.pos[i]) && s.val.every((row, c) => row.every((v, i) => v === hidden.val[c][i])))
  if (complete && !hiddenFound) {
    fail(`${where}: hidden arrangement missing from the engine's solutions`)
    // pinpoint the clue: the first prefix of clues after which the hidden arrangement is no longer found
    for (let k = 1; k <= puzzle.clues.length; k++) {
      const sub: Puzzle = { ...puzzle, clues: puzzle.clues.slice(0, k) }
      const r = enumerate(sub, 100000)
      const kept = r.sols.some((s) => s.pos.every((v, i) => v === hidden.pos[i]) && s.val.every((row, c) => row.every((v, i) => v === hidden.val[c][i])))
      if (!kept) {
        console.error('   culprit clue', k, JSON.stringify(puzzle.clues[k - 1].atoms), 'hidden pos', JSON.stringify(hidden.pos), 'val', JSON.stringify(hidden.val))
        break
      }
    }
  }

  // the teaching trace
  const trace = buildTrace(puzzle)
  const expectStatus = brute === 0 ? 'none' : brute === 1 ? 'unique' : 'multiple'
  if (trace.status !== expectStatus) fail(`${where}: trace status ${trace.status}, expected ${expectStatus}`)
  if (trace.status === 'multiple') multiple++
  for (const st of trace.steps) kinds[st.kind] = (kinds[st.kind] ?? 0) + 1
  for (const st of trace.steps) trials += st.trials.length
  const ctx = new Ctx(puzzle)

  // soundness: nothing a real solution uses is ever crossed out
  for (const [key, info] of trace.elim) {
    eliminations++
    const [a, i, b, j] = key.split('.').map(Number)
    if (!info.why.text) fail(`${where}: crossing ${key} has no reason`)
    for (const sol of res.sols) {
      const itemOf = (cat: number, idx: number) => (cat === 0 ? idx : cat === 1 ? sol.pos[idx] : null)
      // (a,i)-(b,j) belongs to the solution when they denote the same person-slot
      const personWith = (cat: number, idx: number): number => (cat === 0 ? idx : cat === 1 ? sol.pos.indexOf(idx) : sol.val[cat - 2].indexOf(idx))
      void itemOf
      const dirK = puzzle.dirCat === undefined ? -1 : puzzle.dirCat + 2
      // a direction is shared by many people: the cell holds when the other side's person faces that way
      const holdsHere = a === dirK || b === dirK ? (a === dirK ? sol.val[dirK - 2][personWith(b, j)] === i : sol.val[dirK - 2][personWith(a, i)] === j) : personWith(a, i) === personWith(b, j)
      if (holdsHere) fail(`${where}: step ${info.step + 1} crossed out ${ctx.pair(a, i, b, j)}, which holds in a real solution (${info.why.text})`)
    }
  }
  // the animated board is driven by replaying events, so a step's events must reproduce its saved result exactly
  for (const s of trace.steps) {
    for (let k = 0; k < s.pre.length; k++) if ((s.post[k] & ~s.pre[k]) !== 0) fail(`${where}: step ${s.idx + 1} added candidates back`)
    const replayed = applyEvents(s.pre, ctx, s.beats.flatMap((b) => b.evs))
    if (replayed.m.some((v, k) => v !== s.post[k])) fail(`${where}: step ${s.idx + 1} events do not reproduce its end state`)
  }
  if (trace.status === 'unique') {
    uniqueTraced++
    const f = trace.final
    if (!f || !f.pos.every((v, i) => v === res.sols[0].pos[i]) || !f.val.every((row, c) => row.every((v, i) => v === res.sols[0].val[c][i]))) fail(`${where}: trace final arrangement differs from the unique solution`)
    // every pairing of the answer must say which step settled it (the board's "why is it here?" answer)
    const truth = res.sols[0]
    for (let pp = 0; pp < puzzle.n; pp++) {
      const cells: [number, number, number, number][] = [[0, pp, 1, truth.pos[pp]], ...truth.val.map((row, c) => [0, pp, c + 2, row[pp]] as [number, number, number, number])]
      for (const [a, i, b, j] of cells) if (!trace.fixes.has(`${a}.${i}.${b}.${j}`)) fail(`${where}: no "settled" record for ${ctx.pair(a, i, b, j)}`)
    }
    // every crossed-out pairing, replayed as a supposition, must end in a contradiction
    let tested = 0
    for (const key of trace.elim.keys()) {
      if (tested >= 40) break
      const [a, i, b, j] = key.split('.').map(Number)
      const sim = simulate(trace, { a, i, b, j })
      tested++
      whatIfs++
      if (!sim) fail(`${where}: no simulation for ${key}`)
      else if (trace.elim.get(key)?.why.kind === 'anchor' || trace.elim.get(key)?.why.kind === 'sym') {
        if (!sim.rotation) fail(`${where}: what-if for an anchor crossing should say it is only a rotation`)
      } else if (!sim.proven) fail(`${where}: what-if "${ctx.pair(a, i, b, j)}" at step ${sim.stepIdx + 1} did not end in a contradiction: ${sim.clash}`)
      else if (!sim.beats.length || sim.beats[sim.beats.length - 1].tone !== 'clash') fail(`${where}: what-if "${ctx.pair(a, i, b, j)}" has no closing contradiction beat`)
    }
  }
}

// the built-in samples go through the same trace checks
for (const s of SAMPLES.filter((x) => !x.family)) {
  const r = parsePuzzle(s.text)
  if (!r.puzzle) continue
  const trace = buildTrace(r.puzzle)
  if (s.multi ? trace.status !== 'multiple' : trace.status !== 'unique' || !trace.final) fail(`sample "${s.title}": trace did not end as expected (${trace.status})`)
  for (const st of trace.steps) {
    const replayed = applyEvents(st.pre, trace.ctx, st.beats.flatMap((b) => b.evs))
    if (replayed.m.some((v, k) => v !== st.post[k])) fail(`sample "${s.title}": step ${st.idx + 1} events do not reproduce its end state`)
  }
  for (const key of trace.elim.keys()) {
    const [a, i, b, j] = key.split('.').map(Number)
    const sim = simulate(trace, { a, i, b, j })
    whatIfs++
    if (trace.elim.get(key)?.why.kind === 'anchor' || trace.elim.get(key)?.why.kind === 'sym') {
      if (!sim?.rotation) fail(`sample "${s.title}": anchor what-if ${key} should be a rotation`)
    } else if (!sim?.proven) fail(`sample "${s.title}": what-if ${key} not refuted (${sim?.clash})`)
  }
}

// ─── 4. the app's own puzzle generator: its text → my parser → my solver must give the generator's answer ───

{
  const GEN_SEEDS = Number(process.env.GEN_SEEDS ?? 12)
  const tally: Record<string, { checked: number; skipped: number }> = {}
  for (const topic of ['seating-circular', 'seating-linear', 'puzzle-floor', 'puzzle-schedule', 'puzzle-box'] as const) {
    const gen = MAINS_ARRANGE_WITH_PROOF[topic] as (rng: ReturnType<typeof createRng>, d: string, n: number) => { groups: any[]; proofs: any[] }
    tally[topic] = { checked: 0, skipped: 0 }
    for (let seed = 1; seed <= GEN_SEEDS; seed++) {
      const { groups, proofs } = gen(createRng(seed * 977), 'hard', 5)
      groups.forEach((g, gi) => {
        const proof = proofs[gi]
        // one vertical stack is a line of places, like a row; stacks side by side are not supported yet
        const kind: string = proof.geom.kind === 'stacks' && proof.geom.stacks === 1 ? 'row' : proof.geom.kind === 'mixed' && proof.geom.square ? 'square' : proof.geom.kind
        // same-facing round tables, single rows, two facing rows and single stacks are supported; mixed-facing / square tables and side-by-side stacks are not (yet)
        if (kind !== 'circle' && kind !== 'row' && kind !== 'tworow' && kind !== 'square') {
          tally[topic].skipped++
          return
        }
        tally[topic].checked++
        const where = `generator ${topic} seed ${seed}.${gi} (${kind})`
        const text = [g.stimulus.directions, ...g.stimulus.parts.flatMap((q: any) => q.paragraphs)].join('\n\n')
        const r = parsePuzzle(text)
        if (!r.puzzle || r.errors.length) return fail(`${where}: not parsed (${r.errors.join('; ')})`)
        if (r.unparsed.length) return fail(`${where}: sentence not understood: ${r.unparsed[0]}`)
        const e = enumerate(r.puzzle, 3, 800000)
        if (e.sols.length !== 1) return fail(`${where}: ${e.sols.length} solutions where the generator proves exactly one`)
        const sol = e.sols[0]
        const n = proof.names.length
        let shift: number | null = null
        r.puzzle.people.forEach((nm, i) => {
          const j = proof.names.indexOf(nm)
          const mine = sol.pos[i]
          const truth = proof.hidden[0][j]
          const sh = kind === 'circle' || kind === 'square' ? (((mine - truth) % n) + n) % n : mine - truth
          if (shift === null) shift = sh
          else if (sh !== shift) fail(`${where}: seating differs from the generator's answer`)
          r.puzzle!.cats.forEach((cat, c) => {
            const tv = proof.attrValues[c]?.[proof.hidden[c + 1].indexOf(truth)]
            if (!tv || cat.values[sol.val[c][i]].toLowerCase() !== String(tv).toLowerCase()) fail(`${where}: ${cat.name} of ${nm} differs from the generator's answer`)
          })
        })
        if (kind === 'square' && (shift as number | null) !== null && (shift as unknown as number) % 2 !== 0) fail(`${where}: corners and sides swapped places`)
        if ((kind === 'row' || kind === 'tworow') && shift !== 0) fail(`${where}: positions shifted`)
      })
    }
  }
  console.log('app generator, end to end: ' + Object.entries(tally).map(([k, v]) => `${k} ${v.checked} checked (${v.skipped} of an unsupported layout skipped)`).join('; '))
}

console.log(`parser: ${FLOOR_CASES.length + ROW_CASES.length + ORDER_CASES.length + DAY_CASES.length + CIRCLE_CASES.length + GRID_CASES.length + BOX_CASES.length + TWOROW_CASES.length + BDAY_CASES.length + SQUARE_CASES.length + PENT_CASES.length + RANK_CASES.length + VAC_CASES.length + SOUTH_CASES.length + WEEK_CASES.length + WEEK6_CASES.length + CLASS_CASES.length + YEAR_CASES.length + STOREY_CASES.length + GAPMONTH_CASES.length + SEVEN_CASES.length + EVENT_CASES.length + BOXCOLOR_CASES.length + ROW_NEITHER.length + FLOOR_VIZ.length + FLOOR_EXTRA.length + ORDER_EXTRA.length} phrasings checked`)
console.log(`engine vs brute force: ${compared} random puzzles (${uniqueTraced} with a unique answer traced, ${multiple} with several answers)`)
console.log(`step kinds: ${JSON.stringify(kinds)}; ${trials} case-analysis trials`)
console.log(`teaching trace: ${eliminations} crossings checked for soundness, ${whatIfs} what-if simulations refuted`)
if (failures) {
  console.error(`\n${failures} failure(s)`)
  process.exit(1)
}
console.log('OK')
