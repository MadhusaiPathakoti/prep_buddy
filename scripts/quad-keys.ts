// The launch quadratic questions' canonical fingerprints (see api/_lib/qbQuadratic.js), written to api/_lib/seedQuadKeys.json so
// the server can tell that a pasted pair of equations is one of them however it was typed. Only questions the exact solver can
// read get a row (cubics and fractions with x in the denominator do not). Shared by build-quant-seed.ts and build-quad-keys.ts.
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { canonicalOfStem } from '../api/_lib/qbQuadratic.js'
import { quadraticKey } from '../api/_lib/qbankKey.js'

export function writeQuadKeys(questions: { id: string; stem: string }[]): number {
  const rows = new Map<string, string>()
  for (const q of questions) {
    const canonical = canonicalOfStem(q.stem)
    if (canonical) rows.set(quadraticKey(canonical), q.id)
  }
  writeFileSync(join(process.cwd(), 'api', '_lib', 'seedQuadKeys.json'), JSON.stringify([...rows]))
  return rows.size
}
