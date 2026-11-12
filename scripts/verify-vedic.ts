// Verification harness for the Vedic Maths tricks.  Run:  npx tsx scripts/verify-vedic.ts
// For every trick x difficulty x many random questions (and every hand-picked lesson demo) this checks that the answer
// worked out BY THE TRICK equals plain arithmetic, that the shown steps end on that answer, and that the generators
// respect their own difficulty promises.  Exits non-zero on any failure.
import { VEDIC_IMPLS, generateVedicQuestions } from '../src/lib/vedic'
import { VEDIC_META } from '../src/lib/vedicCatalog'

const RUNS = Number(process.env.RUNS ?? 400)
let failures = 0
const fail = (msg: string) => {
  failures++
  if (failures <= 25) console.error('FAIL', msg)
}

// the catalogue and the implementations must describe the same tricks
for (const m of VEDIC_META) if (!VEDIC_IMPLS[m.id]) fail(`catalogue entry "${m.id}" has no implementation`)
for (const id of Object.keys(VEDIC_IMPLS)) if (!VEDIC_META.some((m) => m.id === id)) fail(`implementation "${id}" is missing from the catalogue`)

let checked = 0
for (const impl of Object.values(VEDIC_IMPLS)) {
  const difficulty = ['easy', 'medium', 'hard', 'mixed']
  const modes = impl.groups.find((g) => g.key === 'mode')?.options.map((o) => o.id) ?? [undefined]

  const check = (args: number[], where: string) => {
    const p = impl.solve(args)
    const t = impl.truth(args)
    checked++
    if (p.answer !== t) fail(`${impl.id} ${where} [${args}] ${p.prompt}: trick gives ${p.answer}, arithmetic gives ${t}`)
    if (!Number.isInteger(p.answer) || p.answer < 0) fail(`${impl.id} ${where} [${args}] answer ${p.answer} is not a whole number >= 0`)
    if (p.steps.length < 2) fail(`${impl.id} ${where} [${args}] has too few steps`)
    const last = p.steps[p.steps.length - 1]
    if (!last.includes(String(p.answer))) fail(`${impl.id} ${where} [${args}] last step "${last}" does not mention ${p.answer}`)
    if (p.steps.some((s) => /NaN|undefined|Infinity/.test(s))) fail(`${impl.id} ${where} [${args}] bad text in steps: ${p.steps.join(' / ')}`)
    return p
  }

  for (const demo of impl.demos) check(demo, 'demo')

  for (const d of difficulty) {
    for (const mode of modes) {
      const choice: Record<string, string> = { difficulty: d, ...(mode ? { mode } : {}) }
      for (let i = 0; i < RUNS; i++) {
        const args = impl.random(choice, i)
        if (args) check(args, `${d}/${mode ?? '-'}`)
      }
      for (const count of [10, 20, 50]) {
        const qs = generateVedicQuestions(impl.id, choice, count)
        if (qs.length !== count) fail(`${impl.id} ${d}/${mode ?? '-'}: asked for ${count} questions, got ${qs.length}`)
        if (new Set(qs.map((q) => q.id)).size !== qs.length) fail(`${impl.id}: duplicate question ids`)
      }
    }
  }
}

if (failures > 0) {
  console.error(`\n${failures} failure(s)`)
  process.exit(1)
}
console.log(`ok: ${Object.keys(VEDIC_IMPLS).length} tricks, ${checked} problems verified against plain arithmetic`)
