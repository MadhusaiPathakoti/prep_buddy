// Verification harness for the Surds comparison game.  Run:  npx tsx scripts/verify-surds.ts
// Re-derives every answer a second, exact way (integer comparison of squares for single-term pairs, BigInt-free since the
// numbers are tiny) and checks the decimal strings, the difficulty promises, equal-pair integrity and the surd table.
import { generateSurdQuestions, exprText, exprValue, fmtValue, judge, RELATION_CHOICES, surdTable, type Expr, type SurdDifficulty } from '../src/lib/surds'

const RUNS = Number(process.env.RUNS ?? 300)
let failures = 0
const fail = (msg: string) => {
  failures++
  if (failures <= 25) console.error('FAIL', msg)
}

/** Exact comparison for two single positive terms: c1√r1 vs c2√r2  ⇔  c1²·r1 vs c2²·r2. */
function exactSingle(l: Expr, r: Expr) {
  const a = l[0].coef ** 2 * l[0].rad
  const b = r[0].coef ** 2 * r[0].rad
  return a === b ? '=' : a < b ? '<' : '>'
}

let total = 0
const counts: Record<string, Record<string, number>> = {}
for (const d of ['easy', 'medium', 'hard', 'mixed'] as SurdDifficulty[]) {
  counts[d] = { '<': 0, '>': 0, '=': 0, sum: 0, equalForm: 0 }
  for (let run = 0; run < RUNS; run++) {
    const count = [5, 10, 20][run % 3]
    const qs = generateSurdQuestions(d, count)
    if (qs.length !== count) fail(`${d}: asked for ${count}, got ${qs.length}`)
    const keys = new Set(qs.map((q) => `${exprText(q.left)}|${exprText(q.right)}`))
    if (keys.size !== qs.length) fail(`${d}: repeated pair inside one session`)
    for (const q of qs) {
      total++
      counts[d][q.answer]++
      const lt = exprText(q.left)
      const rt = exprText(q.right)
      const where = `${d} ${lt} ? ${rt}`
      if (Math.abs(exprValue(q.left) - q.leftValue) > 1e-12 || Math.abs(exprValue(q.right) - q.rightValue) > 1e-12) fail(`${where}: stored values wrong`)
      if (q.left.length === 1 && q.right.length === 1) {
        const exact = exactSingle(q.left, q.right)
        if (exact !== q.answer) fail(`${where}: answer ${q.answer} but exact integer comparison says ${exact}`)
      } else {
        counts[d].sum++
        if (d === 'easy' || d === 'medium') fail(`${where}: sums must only appear on hard`)
      }
      // what the learner sees must be consistent with the verdict
      const l4 = fmtValue(q.leftValue)
      const r4 = fmtValue(q.rightValue)
      if (q.answer === '=' ? l4 !== r4 : l4 === r4) fail(`${where}: 4-decimal values ${l4} / ${r4} contradict the verdict ${q.answer}`)
      if (q.answer === '<' && !(Number(l4) < Number(r4))) fail(`${where}: decimals ${l4} / ${r4} contradict <`)
      if (q.answer === '>' && !(Number(l4) > Number(r4))) fail(`${where}: decimals ${l4} / ${r4} contradict >`)
      if (q.answer === '=' && (d === 'easy')) fail(`${where}: easy must not contain equal pairs`)
      if (q.leftValue < 0.5 || q.rightValue < 0.5 || q.leftValue > 45 || q.rightValue > 45) fail(`${where}: value out of range`)
      if (!q.note || /NaN|undefined/.test(q.note)) fail(`${where}: bad note: ${q.note}`)
      // judge(): only the exact relation is right, and ≤ / ≥ are explained
      for (const c of RELATION_CHOICES) {
        const j = judge(c, q.answer)
        if (j.correct !== (c === q.answer)) fail(`${where}: judge(${c}) = ${j.correct}`)
        if (!j.correct && !j.remark) fail(`${where}: no remark for wrong choice ${c}`)
        if ((c === '≤' || c === '≥') && !j.correct) {
          const trulyTrue = c === '≤' ? q.leftValue <= q.rightValue + 1e-9 : q.leftValue >= q.rightValue - 1e-9
          if (trulyTrue !== j.remark.includes('is true here')) fail(`${where}: remark for ${c} wrong: ${j.remark}`)
        }
      }
    }
  }
}
for (const d of ['medium', 'hard', 'mixed']) if (counts[d]['='] === 0) fail(`${d}: never produced an equal pair`)
if (counts.hard.sum === 0) fail('hard: never produced a sum/difference')
if (counts.easy['<'] === 0 || counts.easy['>'] === 0) fail('easy: answers are one-sided')

// the √2 … √20 table
const rows = surdTable()
if (rows.length !== 19 || rows[0].n !== 2 || rows[18].n !== 20) fail('surd table must run from 2 to 20')
const expectSimplified: Record<number, string> = { 4: '2', 8: '2√2', 9: '3', 12: '2√3', 16: '4', 18: '3√2', 20: '2√5' }
for (const row of rows) {
  if (Math.abs(row.value - Math.sqrt(row.n)) > 1e-15) fail(`table √${row.n} value wrong`)
  if ((row.simplified ?? null) !== (expectSimplified[row.n] ?? null)) fail(`table √${row.n} simplified "${row.simplified}" expected "${expectSimplified[row.n] ?? null}"`)
}
if (fmtValue(Math.sqrt(2)) !== '1.4142' || fmtValue(Math.sqrt(3)) !== '1.7321' || fmtValue(Math.sqrt(5)) !== '2.2361') fail('4-decimal formatting wrong')

if (failures > 0) {
  console.error(`\n${failures} failure(s)`)
  process.exit(1)
}
console.log(`ok: ${total} questions verified.`)
for (const [d, c] of Object.entries(counts)) console.log(`  ${d.padEnd(6)} <:${c['<']} >:${c['>']} =:${c['=']} sums:${c.sum}`)
