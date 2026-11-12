/**
 * Light-weight catalogue of the Vedic Maths tricks (card text only). The lessons and generators live in
 * `vedic.ts`, which is only loaded by the lesson/practice pages; this file is cheap enough for the Maths hub and Home.
 */

export type VedicGroup = 'squares' | 'multiply' | 'add-sub'

export interface VedicMeta {
  id: string
  title: string
  /** The classical sutra (or sub-sutra) the trick comes from. */
  sutra: string
  icon: string
  /** One-line teaser shown on the Maths hub card. */
  blurb: string
  group: VedicGroup
}

export const VEDIC_GROUP_LABELS: Record<VedicGroup, string> = {
  squares: 'Squares',
  multiply: 'Multiplication',
  'add-sub': 'Adding & subtracting',
}

/** In recommended learning order. */
export const VEDIC_META: VedicMeta[] = [
  {
    id: 'squares-near-50',
    title: 'Squares near 50 & 100',
    sutra: 'Yāvadūnam (the deficiency)',
    icon: '49²',
    blurb: '49² → (25 − 1) | 1² = 2401. Square anything close to 50 or 100 in one breath.',
    group: 'squares',
  },
  {
    id: 'squares-ending-5',
    title: 'Squares ending in 5',
    sutra: 'Ekādhikena Pūrvena (one more than the previous)',
    icon: '75²',
    blurb: '75² → 7 × 8 = 56, then 25 → 5625. Works for 15, 25 … 195.',
    group: 'squares',
  },
  {
    id: 'duplex-squares',
    title: 'Squaring any 2-digit number',
    sutra: 'Dvandva-yoga (the duplex)',
    icon: '63²',
    blurb: '63² → 6² | 2×6×3 | 3² = 36 | 36 | 09 = 3969. No base needed.',
    group: 'squares',
  },
  {
    id: 'units-add-to-10',
    title: 'Same tens, units add to 10',
    sutra: 'Antyayor Daśake’pi (last digits total ten)',
    icon: '43×47',
    blurb: '43 × 47 → 4 × 5 = 20 | 3 × 7 = 21 → 2021. Two-digit products in three seconds.',
    group: 'multiply',
  },
  {
    id: 'times-11',
    title: 'Multiply by 11',
    sutra: 'Antyayor-eva (the ends and the middle)',
    icon: '×11',
    blurb: '253 × 11 → 2 | 2+5 | 5+3 | 3 = 2783. Add the neighbours, keep the ends.',
    group: 'multiply',
  },
  {
    id: 'teens-times-teens',
    title: 'Teens × teens (and the 20s)',
    sutra: 'Nikhilam (base 10 and base 20)',
    icon: '14×16',
    blurb: '14 × 16 → (14 + 6) | 4 × 6 → 200 + 24 = 224. The base method on small numbers.',
    group: 'multiply',
  },
  {
    id: 'times-nines',
    title: '× 9, × 99, × 999',
    sutra: 'Ekanyūnena Pūrvena (one less than the previous)',
    icon: '×99',
    blurb: '47 × 99 → 4700 − 47 = 4653. Multiply by a round number, subtract once.',
    group: 'multiply',
  },
  {
    id: 'five-25-125',
    title: '× and ÷ by 5, 25, 125',
    sutra: 'Anurūpyena (proportionally)',
    icon: '×25',
    blurb: '36 × 25 → 36 ÷ 4 = 9, then × 100 = 900. Halve, quarter or eighth, then shift.',
    group: 'multiply',
  },
  {
    id: 'crosswise',
    title: '2-digit × 2-digit, crosswise',
    sutra: 'Ūrdhva-Tiryagbhyām (vertically and crosswise)',
    icon: '23×41',
    blurb: '23 × 41 → 2×4 | 2×1 + 3×4 | 3×1 = 8 | 14 | 3 = 943. Works for any pair.',
    group: 'multiply',
  },
  {
    id: 'all-from-9',
    title: 'Subtract from 100, 1000 …',
    sutra: 'Nikhilam Navataścaramaṁ Daśataḥ (all from 9, the last from 10)',
    icon: '1000−',
    blurb: '1000 − 468 → 9−4, 9−6, 10−8 → 532. No borrowing, ever.',
    group: 'add-sub',
  },
  {
    id: 'compensation',
    title: 'Add & subtract near round numbers',
    sutra: 'Ekanyūnena (round up, then correct)',
    icon: '+198',
    blurb: '467 + 198 → 467 + 200 − 2 = 665. Round the awkward number, fix the difference.',
    group: 'add-sub',
  },
]

export const vedicMetaById = (id: string): VedicMeta | undefined => VEDIC_META.find((m) => m.id === id)

/** Each trick records its practice sessions under this game id. */
export const vedicGameId = (id: string) => `vedic-${id}`
