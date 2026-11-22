// A family tree in plain words: who is married to whom, whose children are whose, who are brothers and sisters.
// Shared by the Puzzle Solver (under the diagram) and the Family Tree game (in the review).

import { siblingGroups } from './analyze'
import type { World } from './model'

export function treeInWords(w: World): string[] {
  const nm = (i: number) => w.names[i]
  const lines: string[] = []
  for (const g of [...new Set(w.gen)].sort((a, b) => a - b)) {
    const people = w.names.map((_, i) => i).filter((i) => w.gen[i] === g)
    const parts: string[] = []
    const done = new Set<number>()
    for (const i of people) {
      if (done.has(i)) continue
      done.add(i)
      const s = w.spouse[i]
      if (s >= 0) {
        done.add(s)
        parts.push(`${nm(w.gender[i] === 'M' ? i : s)} (husband) = ${nm(w.gender[i] === 'M' ? s : i)} (wife)`)
      } else parts.push(`${nm(i)} (${w.gender[i] === 'M' ? 'man' : 'woman'}, not married)`)
    }
    lines.push(`Generation ${g}: ${parts.join('; ')}`)
  }
  const kids = new Map<string, number[]>()
  for (let i = 0; i < w.n; i++) {
    if (w.father[i] < 0 && w.mother[i] < 0) continue
    const key = `${w.father[i]}.${w.mother[i]}`
    kids.set(key, [...(kids.get(key) ?? []), i])
  }
  for (const [key, children] of kids) {
    const [f, m] = key.split('.').map(Number)
    const who = [f, m].filter((x) => x >= 0).map(nm).join(' and ')
    lines.push(`${who} ${f >= 0 && m >= 0 ? 'have' : 'has'} ${children.map((c) => `${nm(c)} (${w.gender[c] === 'M' ? 'son' : 'daughter'})`).join(', ')}`)
  }
  for (const g of siblingGroups(w)) lines.push(`${g.map(nm).join(', ')} ${g.length === 2 ? 'are' : 'are all'} brothers and sisters`)
  return lines
}
