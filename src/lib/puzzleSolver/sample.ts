// Example puzzles for the "Try an example" buttons (and the verify script).

export interface SamplePuzzle {
  id: string
  title: string
  text: string
  /** the clues deliberately leave several arrangements open (the answer key lists the alternatives) */
  multi?: boolean
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
  {
    id: 'facing-line',
    title: 'A line facing north / south',
    text: `Eight friends are sitting in a straight line equidistant from each other but not necessarily in the same order. Each of them like one fruit. Some of them are facing south while some are facing north.

I sits to the left of L, who is not at any end.
B and I faces same direction.
One who likes Kiwi sits at one end immediate left of M, who likes Guava.
D who likes Fig sits immediate right of P, who does not like Apple.
F is to the right of D.
One who likes Apple sits to the left of the person who likes Grapes.
P do not sit at any end.
F sits fourth to the left of Q, who sits at one end.
One who likes Papaya sits immediate right of one who likes Lemon.
One who likes Mango sits immediate to the person who likes Guava.
Two persons sits between P and F.
Persons who likes Apple and Papaya faces towards same direction.
L faces towards south direction.
One who likes Papaya do not sit immediate to one who likes Fig.
B neither likes Mango nor likes Kiwi.`,
  },
  {
    id: 'square-table',
    title: 'A square table',
    text: `Eight friends S, T, U, V, W, X, Y & Z are sitting around a square table, but not necessarily in the same order. Each corner and each side of the table have only one seat. No seat is left vacant. People sitting at the corners are facing outside the table and the remaining all are facing inside the table.

T sits adjacent to Y.
V sits immediate left of T.
U sits second to the left of X.
Y is third to the left of U.
S sits adjacent to U.
There are two persons sits between S and W, when counted from the right of W.
Z sits at one of the corners of the table but not adjacent to X.
W sits adjacent to Z.`,
  },
  {
    id: 'pentagon-table',
    title: 'A pentagon table',
    text: `Ten people A, B, C, D, E, F, H, I, J & K are sitting around a pentagon shaped table, but not necessarily in the same order. Five people are sitting at the corners of the table and five people are sitting on each side of the table. Persons sitting at the corners are facing inside and the persons sitting at the side are facing outside.

D sits third to the right of K.
Two persons sit between D and E, who does not sit adjacent to K.
Three persons sit between E and B.
J sits second to the right of B.
I sits immediate right and immediate left of A and C respectively.
C sits second to the left of H.
I does not sit on the side of the table.`,
  },
  {
    id: 'ranks-line',
    title: 'A line & ranks',
    text: `Six students viz. T, U, W, X, Y & Z are standing in a straight line such that all of them are facing towards north, but not necessarily in the same order. Each person holds different ranks from I to VI but not necessarily in the same order.

Y stands at the right most end and immediate right of the one who holds the top rank.
Z doesn’t hold IInd rank whereas U doesn’t hold Vth rank.
Only two persons stand between the one who holds IIIrd rank and Z, who stands second to the left of the one who holds VIth rank.
X stands second from one of the ends and immediate right of the one who holds IIIrd rank.
The one who holds Vth rank stands third to the left of the one who holds the top rank and immediate left of W.
As many persons to the left of the one who holds VIth rank is same as to the right of T.`,
  },
  {
    id: 'square-fruits',
    title: 'Square table & fruits',
    text: `Eight persons M, N, O, P, Q, R, S & T sit around a square shaped table such that one person sits at each side of the table and one person sits at each corner of the table. The distance between two adjacent persons is same. Each of them likes different fruits among Grapes, Mango, Cherry, Kiwi, Orange, Guava, Fig and Lemon but not necessarily in the same order. The persons, who sit at the side of the table, face towards the centre and the persons, who sit at the corner of the table face away from the centre.

The one, who likes Lemon and the one, who likes Fig sit opposite to each other.
R, who likes Mango, sits adjacent to P.
T doesn't like Cherry.
The one, who likes Guava, sits immediate left of the one, who likes Lemon.
P faces towards the centre of the table.
N, who likes Kiwi, doesn't sit immediate right of M and S.
Only two persons sit between R and T, who sits second to the left of M.
O, who likes Grapes, sits immediate left of the one, who likes Cherry.
S, who likes Orange, sits second to the right of P.`,
  },
  {
    id: 'cities-bikes',
    multi: true,
    title: 'Cities & bikes (no seating)',
    text: `Seven persons A, E, B, F, C, G & D live in different cities among Agra, Bhopal, Jaipur, Pune, Mumbai, Ranchi and Raipur. Also, each person like different bikes among Honda, Yamaha, Hero, Bajaj, Ducati, Apache and Pulsar but not necessarily in the same order.

G lives neither in Raipur nor in Ranchi.
Neither F nor B likes Bajaj and Hero.
The one, who lives in Jaipur, doesn't like Honda.
A likes Apache and E likes Honda.
The one, who lives in Agra, likes neither Hero nor Bajaj.
The one, who lives in Pune, doesn't like Apache.
D likes neither Pulsar nor Bajaj.
The one, who likes Pulsar, lives in Raipur.
The one, who likes Hero, lives in neither Pune nor Jaipur.
F lives in Mumbai and B lives in Bhopal.`,
  },
  {
    id: 'divorce-dates',
    title: 'Dates in months (3 months × 2 dates)',
    text: `Six people, namely H, I, J, K, L & M are getting divorced on different dates the 16th and 25th of three different months i.e. March, June, and October within the same year. Each day has only one separating scheduled.

K is getting divorced on an even-numbered date.
J is not getting divorced on an odd-numbered date.
M is getting divorced after K, but neither in October nor on the 16th of any month.
There are two people getting divorced between M and H.
I is getting divorced after L and more than one people are getting divorced between L and I.`,
  },
  {
    id: 'vacant-dates',
    title: 'Dates with one vacant',
    text: `Seven people P, Q, R, S, T, U & V are getting interviewed on different dates, the 5th, 12th, 19th and 26th of two different months i.e. March and August of the same year. Each day has only one interview scheduled. One date is vacant.

P is interviewed on an odd-numbered date.
Q is interviewed after P, but not in August.
Q is interviewed on the 12th of a month.
R is interviewed on the 26th of a month.
There are two people interviewed between R and U.
T is interviewed in the same month as S.
V is interviewed on the same date as R but in a different month.
Only one person is interviewed between Q and S.`,
  },
  {
    id: 'south-row',
    title: 'A row facing south',
    text: `Eight persons B, E, A, F, C, G, D & H sit in a linear row however not necessarily in the same order. All of them face towards the south. Each of them likes different colors among Purple, Black, Pink, Azure, Blue, Yellow, White and Coral.

A sits third to the left of C.
H sits adjacent to the one, who likes Coral.
Neither G nor the one, who likes Black sits at the extreme end.
The one, who likes Yellow sits fourth to the right of the one, who likes Blue.
Only three persons sits between H and E, who likes Azure.
Only four persons sit between G and the one, who likes Black.
B likes White and sits immediate right of G.
D sits immediate right of the one, who likes Pink.
F doesn't like Blue.
The number of persons sit to the right of B is equal to the number of persons sit to the left of the one, who likes Coral.`,
  },
  {
    id: 'week-bikes',
    title: 'Bikes bought in a week',
    text: `Seven friends namely Virat, Mayank, Rohit, Hardik, Yuvraj, Gautam and Shivam buy seven different bikes namely Honda, KTM, Ronin, Ducati, Yamaha, Bajaj and Benelli in a week but not necessarily in the same order. The week is starting from Monday.

Mayank buys either KTM or Yamaha.
Hardik buys Benelli on penultimate day of the week.
Yuvraj buys Ronin.
Virat buys Honda on Friday.
Bajaj is purchased by one of the person in middle of the week.
No one buys after Rohit's purchasing.
Mayank purchased after two days of the one who purchased Ducati.
Number of days between Yuvraj and Mayank is not same as between Shivam and Virat.
There are three days between Rohit and the one who purchased KTM.
Mayank purchase one of the things before Virat.`,
  },
  {
    id: 'candidates-months',
    title: 'Candidates born in months (two-letter names)',
    text: `Eight candidates were born in four different months viz. May, June, July, and August but not necessarily in the same order. They were born on the 17th and 28th date of each month and each candidate was born on different dates.

Cd was born in the month having 30 days.
Ec was born immediate before Ce.
Ce and Ec were born in different months.
Ce and Ab were not born in the same month.
Eb was born immediately after Ea.
Cc was born on 17th of a month.
Aa was born before Ab.
Two persons were born between Ea and Cd.
Ab and Cd were not born in the same month.
Cc was not born in the month of May.`,
  },
  {
    id: 'week-vacant',
    title: 'Bikes in a week (one day vacant)',
    text: `Six friends—namely Virat, Mayank, Rohit, Hardik, Yuvraj, and Shivam—buy six different bikes—namely Honda, KTM, Ronin, Ducati, Yamaha, and Benelli—in a week starting from Monday, though not necessarily in the same order. Only one person buys a bike on a given day, and there is one day in the week on which no one purchases any bike.

Mayank buys either KTM or Yamaha.
Hardik buys Benelli on the penultimate day of the week.
Yuvraj buys Ronin.
Virat buys Honda on Friday.
No bike is purchased on the day that falls right in the middle of the week.
No one buys after Rohit's purchase.
Mayank purchased his bike two days after the one who purchased Ducati.
The number of days between Yuvraj and Mayank is not the same as the number of days between Shivam and Virat.
There are three days between Rohit and the one who purchased KTM.
Mayank purchases his bike before Virat.`,
  },
  {
    id: 'classes-colors',
    title: 'Classes & colours (senior / junior)',
    text: `Eight people i.e. A, B, C, D, E, F, G & H like different colors i.e. Crimson, Black, Red, Yellow, Pink, Hex, Blue and Orange but not necessarily in the same order. They all are from eight different classes i.e. class 1, class 2, class 3, class 4, class 5, class 6, class 7 and class 8 but not necessarily in the same order.

A neither likes Orange nor likes Yellow.
One who likes Hex is in even numbered class.
One who likes Orange is immediate junior to H.
G neither likes Yellow nor likes Orange.
One who likes Yellow is immediate senior to H.
F is immediate senior to the person who likes Hex.
C is immediate junior to D.
One who likes Crimson is junior to one who likes Red.
E who likes Pink is neither in class 1 nor in class 8.
A is senior to F.
One who likes Red is junior to one who likes Blue.
One who likes Black is in even numbered class.
Three persons are between the classes in which F and H studies.`,
  },
  {
    id: 'years-ages',
    title: 'Birth years & ages',
    text: `Eight people A, B, C, D, E, F, G & H are born in 8 different years i.e., 1998, 2005, 1993, 1959, 1986, 1976, 1990 and 1979 but not necessarily in the same order. The base year for the calculation of their ages is 2023.

The number of persons born after F is the same as the number of persons born before B.
The age of F is a perfect square number.
D born before C.
The number of persons born before G is the same as the number of persons born after H.
The difference between the ages of G and A is the same as the difference between the ages of F and C.
The difference between the ages of E and B is the same as the difference between the ages of B and H.
The age of G is a multiple of 11.
There are three persons born between G and F.`,
  },
]
