// Example puzzles for the "Try an example" buttons (and the verify script).

export interface SamplePuzzle {
  id: string
  title: string
  text: string
}

export const SAMPLES: SamplePuzzle[] = [
  {
    id: 'floors-cities',
    title: 'Floors & cities',
    text: `Eight persons - A, B, D, N, P, T, W, X - live on eight different floors of a building, such that the lowermost floor is numbered 1, the floor above it is numbered 2 and so on up to the topmost floor, which is numbered 8.

Each of them is from a different city - Nagpur, Delhi, Bhopal, Kolkata, Pune, Jaipur, Mumbai, Patna (not necessarily in the same order).

T lives two floors below the person from Bhopal.

A lives immediately below X.

A, who is from Kolkata, lives on either the topmost or the lowest floor.

W is from Pune.

T lives immediately above W.

N lives immediately above the person from Mumbai.

Two persons live between P and A.

T is from Nagpur.

The person from Patna lives immediately above X.

D is from Jaipur.`,
  },
  {
    id: 'months-cities',
    title: 'Months & cities',
    text: `Eight persons - D, G, J, N, T, V, W, Y - were born in eight different months of the same year, from May to December (not necessarily in the same order). Each person was born in one month only.

Each of them is from a different city - Mumbai, Jaipur, Pune, Lucknow, Indore, Chennai, Nagpur, Delhi (not necessarily in the same order).

T was born immediately after N.

The person from Jaipur was born immediately before the person from Mumbai.

D is from Chennai.

Two persons were born between D and G.

V, who is from Jaipur, was born in July.

D was born immediately after the person from Pune.

W, who is from Lucknow, was born in either the first or the last month of the list.

The person from Nagpur was born immediately after the person from Lucknow.

Y is from Indore.`,
  },
  {
    id: 'round-ages',
    title: 'Round table & ages',
    text: `Eight persons - Isha, Henry, Quinn, Frank, Yash, Mia, Walt, Olivia - are sitting around a circular table, all of them facing outside (away from the centre). (Left and right of a person are with respect to the direction that person is facing.)

Each of them has a different age - 26 years, 28 years, 37 years, 32 years, 23 years, 41 years, 35 years, 29 years (not necessarily in the same order).

The person who is 29 years old sits third to the left of the person who is 26 years old.

The person who is 41 years old sits at the immediate left of Frank.

If the person who is 32 years old sits exactly opposite to Frank, then the person who is 32 years old sits second to the left of the person who is 29 years old.

Henry sits at the immediate left of Yash.

Two persons sit between Henry and the person who is 28 years old when counted from the left of Henry.

Two persons sit between Mia and Walt when counted from the right of Mia.

The person who is 37 years old sits third to the right of Isha.

Olivia sits exactly opposite to Henry.

Either Frank sits exactly opposite to Walt or the person who is 32 years old sits second to the left of Frank, but not both.

It is not true that two persons sit between the person who is 41 years old and the person who is 37 years old when counted from the right of the person who is 41 years old.

If one person sits between the person who is 41 years old and Isha when counted from the left of the person who is 41 years old, then one person sits between the person who is 35 years old and the person who is 41 years old when counted from the right of the person who is 35 years old.

Neither Olivia nor the person who is 41 years old is an immediate neighbour of the person who is 35 years old.

Walt is 32 years old.`,
  },
  {
    id: 'flats-building',
    title: 'Flats in a building',
    text: `8 persons named A, I, O, U, E, L, R & Z live on a four
storeyed building, such that the ground floor is
numbered as 1, immediate above that is numbered
as 2 and the top floor is numbered as 4. Each floor
has 2 flats, which is Flat A and Flat B. Flat A of
floor 2 is immediately above Flat A of floor 1 and
immediately below Flat A of floor 3 and similarly
in case of Flat B also. Flat A is to the west of Flat B.
All the flats are of same size.
R and Z are having flats on the same floor. U’s flat
is to the south-east of E’s flat. O and A live on
different lettered flats. L lives above R in the same
type of flat. L and R live on even numbered floors.
The floor number of O’s flat is more than the floor
number of A’s flat. E lives in flat A but not on floor
number 1. A’s flat is to the north-east of I’s flat.`,
  },
  {
    id: 'stack-boxes',
    title: 'Stack of boxes',
    text: `Seven boxes H, I, J, K, L, M & O are kept one above
the other. Each of the boxes contains seven
different fruits i.e., Bananas, Cherry, Avocado,
Papaya, Kiwi, Pear and Mango but not in the same
order. The bottommost box is numbered 1 and the
topmost box is numbered 7.
The box, which contains Mango, is placed three
boxes below the box L. Box H is a prime numbered
box and placed immediately above the box, which
contains Avocado. Box J is placed immediately
above the box, which contains Pear. The box, which
contains Avocado, is placed two boxes above the
box M. Box K is placed immediately below the box,
which contains Cherry. Box M is two boxes above
the box, which contains Papaya. Box O is placed
below box I. Box, which contains Banana, is placed
two places above the box, which contains Kiwi.`,
  },
  {
    id: 'row-colours',
    title: 'A row & colours',
    text: `Six friends - A, B, C, D, E and F - sit in a row. Each of them likes a different colour - Red, Blue, Green, Yellow, Pink, Black.

A sits at the extreme left end.
B sits immediately to the right of A.
D sits immediately to the right of B.
D likes Green.
The one who likes Blue sits immediately to the left of the one who likes Pink.
The one who likes Pink sits two places to the right of D.
E sits to the right of C.
C does not sit at either end.
F likes Black.
B likes Yellow.`,
  },
  {
    id: 'two-rows',
    title: 'Two facing rows',
    text: `Twelve persons are standing in two parallel rows and facing each other. In Row1- A, B, C, D, E & F are standing and facing south. In row2- L, M, N, O, P & Q are standing and facing north.

C stands immediate left of the one who stands third to the right of A.
The number of persons standing to the left of D is the same as the number of persons standing to the right of A.
The one who stands opposite to C stands third to the left of M.
L stands second to the left of M.
O neither stands opposite to C nor F.
Only one person stands between E and D.
Q stands fourth to the left of the one who stands the immediate right of P.
E does not stand at the end of the row.
N stands third to the left of the one who faces E.`,
  },
  {
    id: 'birthdays',
    title: 'Birthdays: months & dates',
    text: `8 persons named A, B, C, D, E, F, G & H have birthdays in the month of January, April, May and September on two different dates i.e. 11th and 16th of the same year, not necessarily in the same order. No two persons have birthdays on the same day.

D was not born immediately before B, who was born in the month of April.
H was not born in the month of January.
C and H were born in the same month.
F was born in the month having 31 days.
A and G were born in different months.
G and F were born on the same date but in different months.
Three persons were born between E and H.
D was born before B on the 16th of a month.
Not more than four persons were born before E.`,
  },
  {
    id: 'professions',
    title: 'Professions in a building',
    text: `Seven persons viz. A, B, C, D, E, F & G are staying in a seven-storey building, but not necessarily in the same order. Each of them is of different profession viz. Dentist, Farmer, Chef, Fireman, Nurse, Baker, and Author. Not more than one person from the same profession stays on the same floor. The lowermost floor is numbered as 1 and the floor immediately above is numbered as 2 and so on.

Two floors are between E and the one who is the Fireman.
As many floors between B and D is same as between E and A.
The number of floors above G is the same as the number of floors below the one who is the Fireman.
B stays on an even-numbered floor and immediately below the one who is a Author.
The one who is a Chef stays above F.
The one who is a Dentist stays on the topmost floor.
Only two floors are there between the one who is a Author and G, who is a Nurse.
C is not a Author whereas E is not an Farmer.
D is a Baker but doesn't stay above B.`,
  },
]
