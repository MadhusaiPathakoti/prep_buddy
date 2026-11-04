// Shared helpers for the Reasoning generators.
import type { Group } from '../types'
import type { Rng } from '../rng'

export const DIRECTIONS = 'Study the following information carefully and answer the questions given below:'

/** A generator result together with the machine-checkable proof objects the verification harness re-checks. */
export interface WithProof<P> {
  groups: Group[]
  /** proofs[i] describes groups[i] (every question of that group). */
  proofs: P[]
}

export const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

export function splitCount(count: number, size: number): number[] {
  const out: number[] = []
  let left = count
  while (left > 0) {
    const k = Math.min(size, left)
    out.push(k)
    left -= k
  }
  return out
}

export const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1)

export const NUMW = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten']
export const ORD = ['zeroth', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth']

export function ordinalNum(n: number): string {
  const m100 = n % 100
  if (m100 >= 11 && m100 <= 13) return `${n}th`
  switch (n % 10) {
    case 1:
      return `${n}st`
    case 2:
      return `${n}nd`
    case 3:
      return `${n}rd`
    default:
      return `${n}th`
  }
}

/** Puts `correct` at a uniformly random index among 5 options (wrong must hold >= 4 entries; extras ignored). Returns indices of each wrong option too. */
export function placeCorrect<T>(rng: Rng, correct: T, wrong: readonly T[]): { items: T[]; answer: number } {
  const items = wrong.slice(0, 4)
  const answer = rng.int(0, 4)
  items.splice(answer, 0, correct)
  return { items, answer }
}

const NAME_POOL = [
  'Aman', 'Bhavna', 'Chetan', 'Deepa', 'Esha', 'Farhan', 'Gauri', 'Harish', 'Isha', 'Jatin', 'Kavita', 'Lokesh',
  'Meera', 'Naveen', 'Ojas', 'Pooja', 'Rahul', 'Sneha', 'Tarun', 'Uma', 'Varun', 'Yash', 'Zoya', 'Arjun', 'Divya',
  'Karan', 'Nisha', 'Rohan', 'Sanjay', 'Tina', 'Vikram', 'Anil', 'Bela', 'Dev', 'Ritu', 'Sunil', 'Alice', 'Bob',
  'Carol', 'David', 'Emma', 'Frank', 'Grace', 'Henry', 'Irene', 'Jack', 'Kate', 'Liam', 'Mia', 'Noah', 'Olivia',
  'Paul', 'Quinn', 'Ryan', 'Sara', 'Tom', 'Vera', 'Walt', 'Ila', 'Mohit',
]

/** n distinct person names: single letters (A–H style / random letters) or first names with distinct initials. */
export function pickNames(rng: Rng, n: number, style?: 'letters' | 'names'): string[] {
  const st = style ?? (rng.chance(0.55) ? 'letters' : 'names')
  if (st === 'letters') {
    const mode = rng.int(0, 2)
    if (mode === 0) {
      const start = rng.int(0, 26 - n)
      return LETTERS.slice(start, start + n).split('')
    }
    // random distinct letters, listed alphabetically (excluding I/O to avoid 1/0 confusion)
    const pool = LETTERS.split('').filter((l) => l !== 'I' && l !== 'O')
    return rng.sample(pool, n).sort()
  }
  const byInitial = new Map<string, string[]>()
  for (const nm of NAME_POOL) {
    const k = nm[0]
    byInitial.set(k, [...(byInitial.get(k) ?? []), nm])
  }
  const initials = rng.sample([...byInitial.keys()], n)
  return rng.shuffle(initials.map((k) => rng.pick(byInitial.get(k) as string[])))
}

export function article(word: string): string {
  return /^[AEIOUaeiou]/.test(word) ? 'an' : 'a'
}

export function hasDup(strs: string[]): boolean {
  return new Set(strs.map((s) => s.trim().toLowerCase())).size !== strs.length
}

const MALE_NAMES = ['Aman', 'Chetan', 'Harish', 'Jatin', 'Lokesh', 'Naveen', 'Rahul', 'Tarun', 'Varun', 'Yash', 'Arjun', 'Karan', 'Rohan', 'Sanjay', 'Vikram', 'Anil', 'Dev', 'Sunil', 'Bob', 'David', 'Frank', 'Henry', 'Jack', 'Liam', 'Noah', 'Paul', 'Ryan', 'Tom', 'Mohit', 'Gopal', 'Ishan', 'Manoj', 'Prakash', 'Suresh', 'Umesh', 'Wasim', 'Zaheer', 'Ethan', 'Oscar', 'Quentin']
const FEMALE_NAMES = ['Bhavna', 'Deepa', 'Esha', 'Gauri', 'Isha', 'Kavita', 'Meera', 'Pooja', 'Sneha', 'Uma', 'Zoya', 'Divya', 'Nisha', 'Tina', 'Bela', 'Ritu', 'Alice', 'Carol', 'Emma', 'Grace', 'Irene', 'Kate', 'Mia', 'Olivia', 'Sara', 'Vera', 'Fiona', 'Hema', 'Jaya', 'Lata', 'Neha', 'Rekha', 'Usha', 'Wendy', 'Yami', 'Anita', 'Charu', 'Diana', 'Queen', 'Tara']

/** Distinct-initial names whose gender matches genders[i] (1 male, 0 female). */
export function pickGenderedNames(rng: Rng, genders: number[]): string[] {
  for (let attempt = 0; attempt < 200; attempt++) {
    const used = new Set<string>()
    const out: string[] = []
    let ok = true
    for (const g of genders) {
      const pool = (g === 1 ? MALE_NAMES : FEMALE_NAMES).filter((nm) => !used.has(nm[0]))
      if (!pool.length) {
        ok = false
        break
      }
      const nm = rng.pick(pool)
      used.add(nm[0])
      out.push(nm)
    }
    if (ok) return out
  }
  throw new Error('pickGenderedNames failed')
}
