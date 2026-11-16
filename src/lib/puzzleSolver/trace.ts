// The teaching layer. buildTrace() solves the puzzle the way a coach would talk it through:
//   • facts that are stated outright go on the board first,
//   • then, step by step, the clue that removes the most possibilities *right now* is used — and the ranking of all the
//     other clues is kept so the walkthrough can say why this one and not another,
//   • every possibility that dies carries its reason (so "why not anywhere else?" has an answer),
//   • when no clue helps on its own, each remaining possibility is tested ("if it were here…") and the ones that break the puzzle go,
//   • simulate() replays any crossed-out possibility as if it were true, until the puzzle contradicts itself.
import { bits, cellKey, Ctx, Grid, pop } from './core'
import { Engine, enumerate, failedClues, type Ev, type Why } from './engine'
import type { Atom, Clue, Puzzle, Solution, Term } from './types'

// ─── types ───────────────────────────────────────────────────────────────────

/** One pairing between two things, normalised so that a < b (a/b are category indices: 0 people, 1 positions, 2.. extra). */
export interface CellRef {
  a: number
  i: number
  b: number
  j: number
}

export type Tone = 'given' | 'clue' | 'deduce' | 'link' | 'case' | 'assume' | 'clash'

/** One narrated move: a headline, optional detail lines, and the raw events the board animates. */
export interface Beat {
  gid: number
  tone: Tone
  clue?: number
  headline: string
  details: string[]
  evs: Ev[]
  minor: number // follow-on crossings folded into this beat
}

export type ClueKind = 'fact' | 'pin' | 'relation' | 'floating'

export interface RankedClue {
  clue: number
  gain: number
  fixes: number
  kind: ClueKind
  note: string
}

export interface Selection {
  chosen: number[]
  ranking: RankedClue[]
  headline: string
  reasoning: string[]
  basedOn: string[]
  opening: boolean
}

export interface Trial {
  cell: CellRef
  beats: Beat[]
  clash: string
}

export type StepKind = 'given' | 'clue' | 'case' | 'search' | 'done' | 'stuck' | 'conflict'

export interface Step {
  idx: number
  kind: StepKind
  clues: number[]
  title: string
  summary: string
  selection: Selection | null
  beats: Beat[]
  fixes: CellRef[]
  rows: RowChange[]
  pre: Uint16Array
  post: Uint16Array
  activeBefore: number[]
  linkedBefore: number[]
  trials: Trial[]
}

/** A row of the candidate table (one person / value and one other category) that changed in a step. */
export interface RowChange {
  ea: number
  ei: number
  target: number
  fixed: boolean
}

export interface ElimInfo {
  step: number
  why: Why
}

export interface Trace {
  puzzle: Puzzle
  ctx: Ctx
  status: 'unique' | 'multiple' | 'none'
  solutions: Solution[]
  steps: Step[]
  elim: Map<string, ElimInfo>
  final: Solution | null
  unusedClues: number[]
  suspects: number[] // when there is no solution: clues whose removal would make it solvable
}

// ─── small helpers ───────────────────────────────────────────────────────────

const normCell = (a: number, i: number, b: number, j: number): CellRef => (a < b ? { a, i, b, j } : { a: b, i: j, b: a, j: i })

/** The person / value a table cell is "about", and what it is being matched with (people and values are preferred over positions). */
export function entityOf(c: CellRef): { ea: number; ei: number; target: number; tj: number } {
  if (c.a === 1) return { ea: c.b, ei: c.j, target: 1, tj: c.i }
  return { ea: c.a, ei: c.i, target: c.b, tj: c.j }
}

export function entityLabel(ctx: Ctx, ea: number, ei: number): string {
  return ea === 0 ? ctx.p.people[ei] : `the ${ctx.p.cats[ea - 2].values[ei]} person`
}

function termsOf(a: Atom): Term[] {
  switch (a.t) {
    case 'btw':
      return [a.x, a.y, a.z]
    case 'set':
      return [a.x]
    default:
      return [a.x, a.y]
  }
}

export function clueKind(clue: Clue): ClueKind {
  if (clue.atoms.every((a) => a.t === 'link' && !a.neg)) return 'fact'
  if (clue.atoms.some((a) => a.t === 'set')) return 'pin'
  const floating = clue.atoms.some((a) => a.t !== 'link' && termsOf(a).some((t) => t.k === 'v'))
  return floating ? 'floating' : 'relation'
}

// ─── events → narrated beats ─────────────────────────────────────────────────

export function makeBeats(evs: Ev[], ctx: Ctx, earlier: Set<number> = new Set()): Beat[] {
  const groups: Ev[][] = []
  for (const e of evs) {
    const last = groups[groups.length - 1]
    if (last && last[0].gid === e.gid) last.push(e)
    else groups.push([e])
  }
  const beats: Beat[] = []
  const on = ctx.onWord
  for (const g of groups) {
    const fix = g.find((e) => e.op === 'fix')
    const xs = g.filter((e) => e.op === 'x')
    const reasoned = xs.filter((e) => e.why.kind !== 'taken')
    const taken = xs.length - reasoned.length
    if (fix) {
      const cell = normCell(fix.a, fix.i, fix.b, fix.j)
      const pair = ctx.pair(cell.a, cell.i, cell.b, cell.j)
      const k = fix.why.kind
      if (k === 'given') beats.push({ gid: fix.gid, tone: 'given', clue: fix.why.clue, headline: `Clue ${fix.why.clue} tells us: ${pair}.`, details: [], evs: g, minor: taken })
      else if (k === 'assume') beats.push({ gid: fix.gid, tone: 'assume', headline: `${fix.why.text}.`, details: [], evs: g, minor: taken })
      else beats.push({ gid: fix.gid, tone: 'deduce', headline: `${fix.why.text} — so ${pair}.`, details: reasoned.map((e) => `${ctx.notPair(e.a, e.i, e.b, e.j)} — ${e.why.text}`), evs: g, minor: taken })
      continue
    }
    if (reasoned.length === 0) {
      const prev = beats[beats.length - 1]
      if (prev) {
        prev.evs.push(...g)
        prev.minor += xs.length
      } else beats.push({ gid: g[0].gid, tone: 'deduce', headline: 'Crossing out the rest of the row and column.', details: [], evs: g, minor: xs.length })
      continue
    }
    const kind = reasoned[0].why.kind
    // group "same person, same reason" so six floors ruled out by one clue read as one line
    const lines: string[] = []
    const seen = new Map<string, { ea: number; ei: number; tjs: number[]; text: string; target: number; cells: CellRef[] }>()
    for (const e of reasoned) {
      const cell = normCell(e.a, e.i, e.b, e.j)
      const en = entityOf(cell)
      const key = `${en.ea}.${en.ei}.${en.target}|${e.why.text}`
      const hit = seen.get(key)
      if (hit) {
        hit.tjs.push(en.tj)
        hit.cells.push(cell)
      } else seen.set(key, { ea: en.ea, ei: en.ei, tjs: [en.tj], text: e.why.text, target: en.target, cells: [cell] })
    }
    for (const h of seen.values()) {
      if (h.target === 1) {
        const nums = h.tjs.map((f) => ctx.posNum(f)).sort((x, y) => x - y)
        lines.push(`${entityLabel(ctx, h.ea, h.ei)} is not ${on} ${ctx.fmtNums(nums)} — ${h.text}`)
      } else for (const c of h.cells) lines.push(`${ctx.notPair(c.a, c.i, c.b, c.j)} — ${h.text}`)
    }
    if (kind === 'clue') {
      const id = reasoned[0].why.clue
      const label = `Clue ${id}${earlier.has(id as number) ? ' (again, with what we now know)' : ''}`
      beats.push({
        gid: g[0].gid,
        tone: 'clue',
        clue: id,
        headline: lines.length === 1 ? `${label}: ${lines[0]}` : `${label} rules out ${reasoned.length} options.`,
        details: lines.length === 1 ? [] : lines,
        evs: g,
        minor: taken,
      })
    } else if (kind === 'case') {
      beats.push({ gid: g[0].gid, tone: 'case', headline: lines.length === 1 ? lines[0] : `${reasoned.length} options fail when tested.`, details: lines.length === 1 ? [] : lines, evs: g, minor: taken })
    } else {
      beats.push({ gid: g[0].gid, tone: 'link', headline: '', details: lines, evs: g, minor: taken })
    }
  }
  // consecutive cross-checks read as one move ("the Kolkata person isn't on floor 2" x6 is really one fact), so merge them
  const merged: Beat[] = []
  for (const b of beats) {
    const last = merged[merged.length - 1]
    if (b.tone === 'link' && last && last.tone === 'link') {
      last.evs.push(...b.evs)
      last.details.push(...b.details)
      last.minor += b.minor
    } else merged.push(b)
  }
  for (const b of merged) {
    if (b.tone !== 'link') continue
    const k = b.details.length
    b.headline = k === 1 ? `Cross-checking the tables: ${b.details[0]}` : `Cross-checking the tables removes ${k} more options.`
    if (k === 1) b.details = []
  }
  return merged
}

/** Replays events on a candidate table snapshot (only crossings change the table). */
export function applyEvents(base: Uint16Array, ctx: Ctx, evs: Ev[]): Grid {
  const g = Grid.from(base, ctx.n, ctx.K)
  for (const e of evs) if (e.op === 'x') g.clear(e.a, e.i, e.b, e.j)
  return g
}

// ─── step construction ───────────────────────────────────────────────────────

function changedRows(evs: Ev[], pre: Grid, post: Grid): RowChange[] {
  const rows = new Map<string, RowChange & { reasoned: boolean }>()
  const touch = (ea: number, ei: number, target: number, reasoned: boolean) => {
    const key = `${ea}.${ei}.${target}`
    const r = rows.get(key) ?? { ea, ei, target, fixed: false, reasoned: false }
    if (reasoned) r.reasoned = true
    rows.set(key, r)
  }
  for (const e of evs) {
    const cell = { a: e.a, i: e.i, b: e.b, j: e.j }
    const en = entityOf(cell)
    if (e.op === 'x') touch(en.ea, en.ei, en.target, e.why.kind === 'clue' || e.why.kind === 'case' || e.why.kind === 'assume')
    else touch(en.ea, en.ei, en.target, false)
  }
  const out: RowChange[] = []
  for (const r of rows.values()) {
    const before = rowMask(pre, r)
    const after = rowMask(post, r)
    if (before === after) continue
    const fixed = pop(after) === 1 && pop(before) > 1
    if (r.reasoned || fixed) out.push({ ea: r.ea, ei: r.ei, target: r.target, fixed })
  }
  out.sort((x, y) => Number(y.fixed) - Number(x.fixed) || x.ea - y.ea || x.ei - y.ei || x.target - y.target)
  return out
}

/** Mask of the candidates of a table row (entity ea/ei against category target). */
export function rowMask(grid: Grid, r: { ea: number; ei: number; target: number }): number {
  return grid.row(r.ea, r.ei, r.target)
}

function newFixes(evs: Ev[]): CellRef[] {
  return evs.filter((e) => e.op === 'fix' && e.why.kind !== 'assume').map((e) => ({ a: e.a, i: e.i, b: e.b, j: e.j }))
}

function summarise(ctx: Ctx, beats: Beat[], fixes: CellRef[], rows: RowChange[], post: Grid): string {
  const placed = fixes.filter((f) => f.a === 0 && f.b === 1)
  if (placed.length) {
    const txt = placed.slice(0, 4).map((f) => ctx.pair(f.a, f.i, f.b, f.j))
    return txt.join('; ') + (placed.length > 4 ? `; and ${placed.length - 4} more placed` : '')
  }
  const narrowed = rows
    .filter((r) => r.target === 1 && !r.fixed)
    .slice(0, 3)
    .map((r) => `${entityLabel(ctx, r.ea, r.ei)} can now only be ${ctx.onWord} ${ctx.fmtMask(post.row(r.ea, r.ei, 1))}`)
  if (narrowed.length) return narrowed.join('; ')
  const other = fixes.slice(0, 3).map((f) => ctx.pair(f.a, f.i, f.b, f.j))
  if (other.length) return other.join('; ')
  const first = beats.find((x) => x.tone === 'clue' || x.tone === 'case')
  return first ? first.headline.replace(/^Clue \d+[^:]*: /, '') : 'Nothing new could be concluded.'
}

// ─── the planner ─────────────────────────────────────────────────────────────

const KIND_RANK: Record<ClueKind, number> = { pin: 0, relation: 1, fact: 2, floating: 3 }

export function buildTrace(puzzle: Puzzle): Trace {
  const ctx = new Ctx(puzzle)
  const clueOf = new Map(puzzle.clues.map((c) => [c.id, c]))
  const search = enumerate(puzzle, 12)
  const status: Trace['status'] = search.sols.length === 0 ? 'none' : search.sols.length === 1 ? 'unique' : 'multiple'
  const eng = new Engine(puzzle)
  const steps: Step[] = []
  const remaining = new Set(puzzle.clues.map((c) => c.id))
  const elim = new Map<string, ElimInfo>()

  const noteElims = (idx: number, evs: Ev[]) => {
    for (const e of evs) {
      if (e.op !== 'x') continue
      const key = cellKey(e.a, e.i, e.b, e.j)
      if (!elim.has(key)) elim.set(key, { step: idx, why: e.why })
    }
  }

  const finishStep = (
    partial: Pick<Step, 'kind' | 'clues' | 'title' | 'selection' | 'trials'>,
    pre: Uint16Array,
    activeBefore: number[],
    evStart: number,
    linkedBefore: number[],
  ): Step => {
    const evs = eng.events.slice(evStart)
    const idx = steps.length
    const post = eng.grid.snapshot()
    const earlier = new Set(steps.flatMap((x) => x.clues).filter((id) => !partial.clues.includes(id)))
    const beats = makeBeats(evs, ctx, earlier)
    const fixes = newFixes(evs)
    const rows = changedRows(evs, Grid.from(pre, ctx.n, ctx.K), eng.grid)
    const step: Step = { idx, ...partial, summary: summarise(ctx, beats, fixes, rows, eng.grid), beats, fixes, rows, pre, post, activeBefore, linkedBefore }
    noteElims(idx, evs)
    steps.push(step)
    return step
  }

  // 1 ─ facts that are stated outright ("W is from Pune"), including the free half of mixed clues
  const linkClues = puzzle.clues.filter((c) => c.atoms.some((x) => x.t === 'link' && !x.neg))
  const linkedSoFar = (): number[] => linkClues.map((c) => c.id)
  if (linkClues.length) {
    const pre = eng.grid.snapshot()
    const start = eng.events.length
    for (const c of linkClues) {
      eng.activate(c.id, true)
      if (clueKind(c) === 'fact') remaining.delete(c.id)
    }
    eng.propagate()
    const ids = linkClues.map((c) => c.id)
    const mixed = linkClues.filter((c) => clueKind(c) !== 'fact').map((c) => c.id)
    finishStep(
      {
        kind: 'given',
        clues: ids,
        title: 'Write down the facts that are stated outright',
        selection: {
          chosen: ids,
          ranking: [],
          headline: ids.length === 1 ? `Clue ${ids[0]} states a fact directly.` : `Clues ${ids.join(', ')} simply state who is who.`,
          reasoning: [
            'These facts need no thinking: each one just says that two things go together, so I note them before anything else.',
            `They do not say where anyone ${ctx.p.axis === 'floor' ? 'lives' : 'sits'} yet, but they turn later clues about "the person who ..." into clues about a named person.`,
            ...(mixed.length ? [`Clue${mixed.length > 1 ? 's' : ''} ${mixed.join(', ')} also say${mixed.length > 1 ? '' : 's'} where someone lives - only the "is from" part is used now; the rest waits for its turn.`] : []),
          ],
          basedOn: [],
          opening: true,
        },
        trials: [],
      },
      pre,
      [],
      start,
      [],
    )
  }

  // 2 ─ clue by clue, most informative first
  const scoreClue = (id: number) => {
    const e = eng.clone()
    e.activate(id)
    const ok = e.propagate()
    const gain = e.events.filter((v) => v.op === 'x').length
    const fixes = e.events.filter((v) => v.op === 'fix').length
    return { id, ok, gain, fixes, kind: clueKind(clueOf.get(id) as Clue) }
  }

  const noteFor = (id: number, kind: ClueKind): string => {
    const clue = clueOf.get(id) as Clue
    const atom = clue.atoms.find((a) => a.t !== 'link') ?? clue.atoms[0]
    const ts = termsOf(atom)
    if (kind === 'pin' && atom.t === 'set') {
      const k = atom.neg ? ctx.n - atom.fs.length : atom.fs.length
      return `pins ${ctx.termLabel(atom.x)} to ${k} of ${ctx.n} ${ctx.unit}s`
    }
    if (kind === 'floating') {
      const v = ts.find((t) => t.k === 'v')
      return `is partly about ${v ? ctx.termLabel(v) : 'someone'}, who has not been identified yet`
    }
    if (ts.length >= 2) return `only ties ${ctx.termLabel(ts[0])} to ${ctx.termLabel(ts[1])}`
    return 'adds a small restriction'
  }

  const knownAbout = (e: Engine, ids: number[]): string[] => {
    const seen = new Set<string>()
    const out: string[] = []
    for (const id of ids)
      for (const atom of (clueOf.get(id) as Clue).atoms) {
        if (atom.t === 'link') continue
        for (const t of termsOf(atom)) {
          if (t.k === 'f') continue
          const key = `${t.k}.${t.k === 'p' ? t.i : `${t.c}.${t.i}`}`
          if (seen.has(key)) continue
          seen.add(key)
          const mask = e.grid.row(ctx.termCat(t), ctx.termIdx(t), 1)
          if (pop(mask) === 1) out.push(`${ctx.termLabel(t)} is already known to be ${ctx.onWord} ${ctx.fmtMask(mask)}`)
          else if (pop(mask) < ctx.n) out.push(`${ctx.termLabel(t)} can only be ${ctx.onWord} ${ctx.fmtMask(mask)}`)
        }
      }
    return out
  }

  let guard = 0
  while (!eng.solved() && !eng.contra && guard++ < 80) {
    const rem = [...remaining]
    const scored = rem.map(scoreClue)
    const broken = scored.find((s) => !s.ok)
    scored.sort((x, y) => y.gain - x.gain || y.fixes - x.fixes || KIND_RANK[x.kind] - KIND_RANK[y.kind] || x.id - y.id)
    const best = broken ?? scored[0]
    if (best && (best.gain > 0 || broken)) {
      const opening = steps.every((s) => s.kind === 'given')
      const ranking: RankedClue[] = scored.map((s) => ({ clue: s.id, gain: s.gain, fixes: s.fixes, kind: s.kind, note: noteFor(s.id, s.kind) }))
      const top = ranking.find((r) => r.clue === best.id) as RankedClue
      const others = ranking.filter((r) => r.clue !== best.id)
      const reasoning: string[] = []
      reasoning.push(
        `I tried each unused clue on the board as it stands now and counted the possibilities it crosses out. Clue ${best.id} removes the most: ${top.gain}${top.fixes ? `, and it settles ${top.fixes} pairing${top.fixes > 1 ? 's' : ''} for good` : ''}.`,
      )
      if (best.kind === 'pin') reasoning.push(`It ${top.note} in one go. Clues that only compare two people cannot place anyone while both are still unknown, so a clue like this is the natural way in.`)
      else if (best.kind === 'relation') reasoning.push(`It ${top.note}, and what we already know about them is enough for it to cut down the options.`)
      else reasoning.push(`It ${top.note}; what we have worked out so far makes it useful now.`)
      if (opening) reasoning.push('This is the opening move: with nothing placed yet, the best start is the clue that restricts a single person the most.')
      const runner = others[0]
      if (runner) reasoning.push(`Runner-up: Clue ${runner.clue} would remove ${runner.gain} (it ${runner.note}).`)
      const basedOn = knownAbout(eng, [best.id])
      const pre = eng.grid.snapshot()
      const activeBefore = [...eng.active]
      const start = eng.events.length
      eng.activate(best.id)
      eng.propagate()
      remaining.delete(best.id)
      finishStep(
        {
          kind: 'clue',
          clues: [best.id],
          title: `Use Clue ${best.id}`,
          selection: { chosen: [best.id], ranking, headline: `Clue ${best.id} removes the most possibilities (${top.gain}).`, reasoning, basedOn, opening },
          trials: [],
        },
        pre,
        activeBefore,
        start,
        linkedSoFar(),
      )
      continue
    }

    // no single clue helps: maybe the remaining clues only work together
    if (rem.length > 1) {
      const together = eng.clone()
      for (const id of rem) together.activate(id)
      together.propagate()
      if (!together.contra && together.events.some((v) => v.op === 'x')) {
        const pre = eng.grid.snapshot()
        const activeBefore = [...eng.active]
        const start = eng.events.length
        for (const id of rem) eng.activate(id)
        eng.propagate()
        rem.forEach((id) => remaining.delete(id))
        finishStep(
          {
            kind: 'clue',
            clues: rem,
            title: `Use Clues ${rem.join(', ')} together`,
            selection: {
              chosen: rem,
              ranking: [],
              headline: 'No single clue helps now — but together they do.',
              reasoning: ['Each remaining clue, used alone, removes nothing new. Combined, they still narrow things down, so they are used at the same time.'],
              basedOn: [],
              opening: false,
            },
            trials: [],
          },
          pre,
          activeBefore,
          start,
          linkedSoFar(),
        )
        continue
      }
    }

    // 3 ─ case analysis: test each possibility of the most constrained row
    const pre = eng.grid.snapshot()
    const activeBefore = [...eng.active]
    const start = eng.events.length
    const work = eng.clone()
    for (const id of rem) work.activate(id)
    work.propagate()
    if (work.contra) {
      for (const id of rem) eng.activate(id)
      eng.propagate()
      break
    }
    type Pivot = { a: number; i: number; b: number; refuted: { cell: CellRef; clash: string; trialEvents: Ev[] }[]; size: number }
    let pivot: Pivot | null = null
    for (let a = 0; a < ctx.K; a++)
      for (let b = a + 1; b < ctx.K; b++)
        for (let i = 0; i < ctx.n; i++) {
          const mask = work.grid.row(a, i, b)
          if (pop(mask) < 2) continue
          const refuted: Pivot['refuted'] = []
          for (const j of bits(mask)) {
            const t = work.clone()
            const evStart = t.events.length
            t.assume(a, i, b, j)
            if (!t.propagate() && t.contra) refuted.push({ cell: { a, i, b, j }, clash: t.contra.text, trialEvents: t.events.slice(evStart) })
          }
          if (!refuted.length) continue
          const better = !pivot || refuted.length > pivot.refuted.length || (refuted.length === pivot.refuted.length && pop(mask) < pivot.size)
          if (better) pivot = { a, i, b, refuted, size: pop(mask) }
        }
    if (!pivot) {
      // deduction and testing cannot finish; if the arrangement is unique, state it and say how it was found
      if (status === 'unique') {
        for (const id of rem) {
          eng.activate(id)
          remaining.delete(id)
        }
        eng.reveal(search.sols[0])
        eng.propagate()
        finishStep(
          {
            kind: 'search',
            clues: rem,
            title: 'Try the remaining combinations',
            selection: {
              chosen: rem,
              ranking: [],
              headline: 'Deduction alone stalls here.',
              reasoning: ['Neither a single clue nor testing one person at a time settles the rest, so every way to finish the arrangement was checked — exactly one satisfies all the clues.'],
              basedOn: [],
              opening: false,
            },
            trials: [],
          },
          pre,
          activeBefore,
          start,
          linkedSoFar(),
        )
      }
      break
    }
    const pv = pivot as Pivot
    for (const id of rem) {
      eng.activate(id)
      remaining.delete(id)
    }
    eng.propagate()
    const trials: Trial[] = []
    for (const r of pv.refuted) {
      const cell = r.cell
      const pairText = ctx.pair(cell.a, cell.i, cell.b, cell.j)
      const beats = makeBeats(r.trialEvents, ctx)
      beats.push({ gid: -1, tone: 'clash', headline: `Contradiction: ${r.clash}.`, details: [], evs: [], minor: 0 })
      trials.push({ cell, beats, clash: r.clash })
      eng.eliminate(cell.a, cell.i, cell.b, cell.j, { kind: 'case', text: `if ${pairText}, then ${r.clash}` })
    }
    eng.propagate()
    const en = entityOf({ a: pv.a, i: pv.i, b: pv.b, j: 0 })
    finishStep(
      {
        kind: 'case',
        clues: rem,
        title: `Test the possibilities for ${entityLabel(ctx, en.ea, en.ei)}`,
        selection: {
          chosen: rem,
          ranking: [],
          headline: 'No clue settles anything by itself any more, so I test the possibilities.',
          reasoning: [
            `${entityLabel(ctx, en.ea, en.ei)} has only ${pv.size} possibilities left, the fewest of anything on the board — and testing them cannot go wrong: for each one I assume it is true and follow the clues.`,
            `${pv.refuted.length} of them lead to a contradiction, so they are impossible.`,
          ],
          basedOn: [],
          opening: false,
        },
        trials,
      },
      pre,
      activeBefore,
      start,
      linkedSoFar(),
    )
  }

  // 4 ─ closing step
  const final = eng.solved() ? eng.solution() : status === 'unique' ? search.sols[0] : null
  const pre = eng.grid.snapshot()
  const activeBefore = [...eng.active]
  const unused = [...remaining]
  const kind: StepKind = status === 'unique' ? 'done' : status === 'multiple' ? 'stuck' : 'conflict'
  const suspects: number[] = []
  if (status === 'none') {
    for (const c of puzzle.clues) {
      const without: Puzzle = { ...puzzle, clues: puzzle.clues.filter((x) => x.id !== c.id) }
      if (enumerate(without, 1, 20000).sols.length > 0) suspects.push(c.id)
    }
  }
  steps.push({
    idx: steps.length,
    kind,
    clues: unused,
    title: kind === 'done' ? 'Solved — check every clue' : kind === 'stuck' ? 'More than one arrangement fits' : 'The clues contradict each other',
    summary: '',
    selection: null,
    beats: eng.contra ? [{ gid: -1, tone: 'clash', headline: `Contradiction: ${eng.contra.text}.`, details: [], evs: [], minor: 0 }] : [],
    fixes: [],
    rows: [],
    pre,
    post: pre,
    activeBefore,
    linkedBefore: linkedSoFar(),
    trials: [],
  })

  const finalSol = final && failedClues(puzzle, final).length === 0 ? final : null
  return { puzzle, ctx, status, solutions: search.sols, steps, elim, final: finalSol, unusedClues: unused, suspects }
}

// ─── "why not anywhere else?" ────────────────────────────────────────────────

export interface WhyOption {
  j: number
  label: string
  state: 'chosen' | 'open' | 'out'
  now: boolean // removed in this very step
  why?: Why
  step?: number
  cell: CellRef
}

export interface WhyNotRow {
  ea: number
  ei: number
  target: number
  title: string
  fixed: boolean
  options: WhyOption[]
}

export function whyNotRows(trace: Trace, step: Step): WhyNotRow[] {
  const { ctx } = trace
  const post = Grid.from(step.post, ctx.n, ctx.K)
  return step.rows.map((r) => {
    const after = rowMask(post, r)
    const options: WhyOption[] = []
    for (let j = 0; j < ctx.n; j++) {
      const cell = r.ea < r.target ? { a: r.ea, i: r.ei, b: r.target, j } : { a: r.target, i: j, b: r.ea, j: r.ei }
      const alive = ((after >> j) & 1) === 1
      const info = trace.elim.get(cellKey(cell.a, cell.i, cell.b, cell.j))
      options.push({
        j,
        label: r.target === 1 ? String(ctx.posNum(j)) : ctx.lab(r.target, j),
        state: alive ? (r.fixed && pop(after) === 1 ? 'chosen' : 'open') : 'out',
        now: !alive && info?.step === step.idx,
        why: alive ? undefined : info?.why,
        step: alive ? undefined : info?.step,
        cell,
      })
    }
    if (r.target === 1) options.sort((x, y) => ctx.posNum(y.j) - ctx.posNum(x.j))
    const what = r.target === 1 ? ctx.unit : ctx.catName(r.target)
    return { ea: r.ea, ei: r.ei, target: r.target, fixed: r.fixed, options, title: `${entityLabel(ctx, r.ea, r.ei)} → ${what}` }
  })
}

// ─── what if it were placed differently? ─────────────────────────────────────

export interface SimResult {
  cell: CellRef
  stepIdx: number
  base: Uint16Array
  beats: Beat[]
  clash: string
  proven: boolean // a contradiction was reached
}

export function simulate(trace: Trace, cell: CellRef): SimResult | null {
  const info = trace.elim.get(cellKey(cell.a, cell.i, cell.b, cell.j))
  if (!info) return null
  const { puzzle, ctx } = trace
  const step = trace.steps[info.step]
  const eng = Engine.fromSnapshot(puzzle, step.pre, step.activeBefore, step.linkedBefore)
  for (const id of step.clues) eng.activate(id, step.kind === 'given')
  const base = eng.grid.snapshot()
  const startEv = eng.events.length
  const clueTag = info.why.clue ? `Clue ${info.why.clue}` : 'the earlier deductions'
  if (!eng.grid.has(cell.a, cell.i, cell.b, cell.j)) {
    const pairText = ctx.pair(cell.a, cell.i, cell.b, cell.j)
    const clash = `${pairText} contradicts ${clueTag}: ${info.why.text}`
    return {
      cell,
      stepIdx: info.step,
      base,
      beats: [
        { gid: -2, tone: 'assume', headline: `Suppose ${pairText}.`, details: [], evs: [], minor: 0 },
        { gid: -1, tone: 'clash', headline: `Contradiction: ${clash}.`, details: [], evs: [], minor: 0 },
      ],
      clash,
      proven: true,
    }
  }
  eng.assume(cell.a, cell.i, cell.b, cell.j)
  const ok = eng.propagate()
  const beats = makeBeats(eng.events.slice(startEv), ctx)
  // in a what-if the crossed-out cell is the very thing we supposed, so say "this clue breaks it" rather than "it is not here"
  for (const b of beats) {
    if (b.tone !== 'clue' || b.details.length) continue
    const why = b.evs.find((e) => e.op === 'x' && e.why.kind === 'clue')
    if (why) b.headline = `Clue ${b.clue} breaks it: ${why.why.text}`
  }
  if (!ok && eng.contra) {
    beats.push({ gid: -1, tone: 'clash', headline: `Contradiction: ${eng.contra.text}.`, details: [], evs: [], minor: 0 })
    return { cell, stepIdx: info.step, base, beats, clash: eng.contra.text, proven: true }
  }
  // simple deduction found no clash: try every way of finishing the arrangement
  const dead = refutedBySearch(eng)
  const note = dead
    ? 'Simple deduction finds no clash from here, but trying every way to complete the arrangement fails — it cannot be right.'
    : 'No clash was found: this placement is not actually ruled out at this point.'
  beats.push({ gid: -1, tone: dead ? 'clash' : 'deduce', headline: note, details: [], evs: [], minor: 0 })
  return { cell, stepIdx: info.step, base, beats, clash: note, proven: dead }
}

function refutedBySearch(start: Engine, cap = 20000): boolean {
  let nodes = 0
  const dfs = (e: Engine): boolean => {
    if (++nodes > cap) return false
    if (!e.propagate()) return true
    const open = e.smallestOpenRow()
    if (!open) {
      const s = e.solution()
      return !(s && failedClues(e.ctx.p, s).length === 0)
    }
    for (const j of bits(e.grid.row(open.a, open.i, open.b))) {
      const n = e.clone()
      n.assume(open.a, open.i, open.b, j)
      if (!dfs(n)) return false
    }
    return true
  }
  const root = start.clone()
  root.quiet = true
  return dfs(root)
}
