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
]
