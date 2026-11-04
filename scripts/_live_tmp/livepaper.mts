import { writeFileSync } from 'node:fs'
import handler from '../../api/mockEnglish.js'
import { composePaper } from '../../src/lib/mocks/compose.ts'
const realFetch = globalThis.fetch
globalThis.fetch = (async (input: any, init: any = {}) => {
  const url = typeof input === 'string' ? input : input.url
  if (!url.includes('/api/mockEnglish')) return realFetch(input, init)
  let status = 200, payload: any
  const headers: Record<string, string> = {}
  const res: any = { setHeader(k: string, v: string) { headers[k] = v }, status(c: number) { status = c; return res }, json(o: unknown) { payload = o; return res } }
  await handler({ method: 'POST', body: JSON.parse(init.body) }, res)
  return new Response(JSON.stringify(payload), { status, headers: { 'Content-Type': 'application/json', ...headers } })
}) as typeof fetch
const exam = (process.argv[3] ?? 'po') as 'po' | 'clerk'
const t0 = Date.now()
const paper = await composePaper({ exam, kind: 'full' }, { onProgress: () => {} })
console.log(`composed ${exam} full paper: ${paper.questions.length} questions in ${((Date.now() - t0) / 1000).toFixed(1)}s; sections ${paper.sections.map((s) => s.questionIds.length).join('/')}`)
writeFileSync(`${process.argv[2]}/live-${exam}.json`, JSON.stringify(paper))
