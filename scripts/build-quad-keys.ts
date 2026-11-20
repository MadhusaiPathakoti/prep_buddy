// Rebuilds api/_lib/seedQuadKeys.json from the launch questions already in public/qbank/seed (build-quant-seed.ts does this
// too when it runs; use this one on its own after changing the equation reader).  Run:  npm run build:quadkeys
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { writeQuadKeys } from './quad-keys'

const questions = JSON.parse(readFileSync(join(process.cwd(), 'public', 'qbank', 'seed', 'quadratic-equations.json'), 'utf8')) as { id: string; stem: string }[]
console.log(`${writeQuadKeys(questions)} of ${questions.length} launch quadratic questions can be recognised as duplicates`)
