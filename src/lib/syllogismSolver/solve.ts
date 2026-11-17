// Turns a parsed question into everything the screen needs: a step-by-step "build the picture" story, for every conclusion the
// pictures that prove or refute it, and — for each of the five answer options — an explanation of why it is right or wrong.

import type { Form } from '../syllogism'
import { buildModel, buildReasoning, blockerOf, consistent, correctOption, holdsIn, isComplementary, OPTION_TEXT, proofOf, verdictOf, type Literal, type Model, type Reasoning, type Rel } from './engine'
import { findWorlds, type World } from './layout'
import type { ParsedQuestion, Sentence } from './parse'

/** What a picture is meant to show about one statement or conclusion; the regions are worked out from the drawn zones. */
export interface Highlight {
  form: Form
  x: number
  y: number
  tone: 'ok' | 'bad' | 'info'
}

export interface Picture {
  world: World
  /** Is the conclusion true in this picture? */
  truth: boolean
  title: string
  caption: string
  highlights: Highlight[]
}

export interface ConclusionInfo {
  index: number
  label: string
  sentence: Sentence
  text: string
  follows: boolean
  possible: boolean
  /** follows = true in every picture · open = true in some pictures only · never = true in none */
  kind: 'follows' | 'open' | 'never'
  headline: string
  reasons: string[]
  pictures: Picture[]
}

export interface BuildStep {
  title: string
  caption: string
  visible: number[]
  highlight: Highlight | null
}

export interface PicRef {
  conc: number // conclusion index, or -1 for the extra "both false" picture
  idx: number
}

export interface Point {
  tone: 'good' | 'bad' | 'info'
  text: string
  ref?: PicRef
}

export interface Feedback {
  option: number
  correct: boolean
  headline: string
  points: Point[]
}

export interface Solution {
  q: ParsedQuestion
  model: Model
  conclusions: ConclusionInfo[]
  buildWorld: World | null
  steps: BuildStep[]
  /** Only questions with exactly two conclusions use the five answer options. */
  hasOptions: boolean
  correct: number | null
  either: boolean
  bothFalse: Picture | null
  contradictory: boolean
  feedback: (option: number) => Feedback
  picture: (ref: PicRef) => Picture | null
}

const ROMAN = ['I', 'II', 'III', 'IV']

// ---------- wording helpers ----------

const label = (q: ParsedQuestion, t: number) => q.terms[t].label

/** What the highlighted part of a picture is, in words. */
export function regionPhrase(q: ParsedQuestion, h: Highlight, truth: boolean): string {
  const X = label(q, h.x)
  const Y = label(q, h.y)
  switch (h.form) {
    case 'I':
      return truth ? `the region shared by ${X} and ${Y}` : `${X} and ${Y} do not meet — there is no shared region`
    case 'E':
      return truth ? `${X} and ${Y} do not meet — there is no shared region` : `the region shared by ${X} and ${Y}`
    case 'A':
      return truth ? `${X} lies completely inside ${Y}` : `the part of ${X} that sticks out of ${Y}`
    case 'O':
      return truth ? `the part of ${X} that lies outside ${Y}` : `${X} lies completely inside ${Y} — nothing sticks out`
  }
}

function ruleCaption(q: ParsedQuestion, s: Sentence): string {
  const X = label(q, s.x)
  const Y = label(q, s.y)
  if (s.few) return `“Only a few” means some ${X} are ${Y} and some are not — so ${X} partly overlaps ${Y}: part inside, part outside, with someone (●) in each part.`
  switch (s.form) {
    case 'A':
      return `“All” means ${X} must sit completely inside ${Y}.`
    case 'E':
      return `“No” means the ${X} and ${Y} circles must not touch.`
    case 'I':
      return `“Some” means the ${X} and ${Y} circles share a region, with someone (●) in it.`
    case 'O':
      return `“Some … not” means part of ${X} lies outside ${Y}, with someone (●) out there.`
  }
}

// ---------- which circles matter, and how to prefer drawing them ----------

/** The groups lying on some chain of statements between x and y (the others cannot change the verdict). */
function focusTerms(q: ParsedQuestion, x: number, y: number): number[] {
  const adj = new Map<number, Set<number>>()
  for (const s of q.statements) {
    if (!adj.has(s.x)) adj.set(s.x, new Set())
    if (!adj.has(s.y)) adj.set(s.y, new Set())
    adj.get(s.x)!.add(s.y)
    adj.get(s.y)!.add(s.x)
  }
  const on = new Set<number>([x, y])
  const path: number[] = [x]
  const walk = (at: number) => {
    if (at === y) {
      for (const p of path) on.add(p)
      return
    }
    for (const nxt of adj.get(at) ?? []) {
      if (path.includes(nxt)) continue
      path.push(nxt)
      walk(nxt)
      path.pop()
    }
  }
  walk(x)
  return [...on].sort((a, b) => a - b)
}

function orderFor(q: ParsedQuestion): (a: number, b: number) => Rel[] {
  const all: Rel[] = ['DJ', 'OV', 'IN', 'CT']
  return (a, b) => {
    const s = q.statements.find((t) => (t.x === a && t.y === b) || (t.x === b && t.y === a))
    if (!s) return all
    let first: Rel
    if (s.few || s.form === 'I' || s.form === 'O') first = 'OV'
    else if (s.form === 'E') first = 'DJ'
    else first = s.x === a ? 'IN' : 'CT'
    return [first, ...all.filter((r) => r !== first)]
  }
}

const lit = (c: Sentence, truth: boolean): Literal => ({ form: c.form, x: c.x, y: c.y, truth })

// ---------- the solution ----------

export function solve(q: ParsedQuestion): Solution {
  const model = buildModel(q)
  if (!consistent(model)) throw new Error('The statements contradict each other.')
  const rs: Reasoning = buildReasoning(q)
  const order = orderFor(q)
  const all = q.terms.map((_, i) => i)
  const quote = (s: Sentence) => `“${s.text}”`

  // ---- the build-up ----
  const buildWorld = findWorlds(model, { focus: all, lits: [], want: 1, order })[0] ?? null
  const steps: BuildStep[] = [
    {
      title: 'Start',
      caption: 'Every group becomes a circle. We add the statements one by one. A dot ● means someone really is in that region — a region with nobody in it is not drawn.',
      visible: [],
      highlight: null,
    },
  ]
  const seen: number[] = []
  q.statements.forEach((s, i) => {
    for (const t of [s.x, s.y]) if (!seen.includes(t)) seen.push(t)
    steps.push({
      title: `Statement ${i + 1}`,
      caption: `${quote(s)} → ${ruleCaption(q, s)}`,
      visible: [...seen],
      highlight: s.few ? { form: 'I', x: s.x, y: s.y, tone: 'info' } : { form: s.form, x: s.x, y: s.y, tone: 'info' },
    })
  })
  steps.push({
    title: 'Done',
    caption: 'This is one picture in which every statement is true. The statements often allow other pictures too — a conclusion follows only if it is true in ALL of them. Use “Check” beside a conclusion to see the pictures.',
    visible: all.filter((t) => seen.includes(t)),
    highlight: null,
  })

  // ---- every conclusion ----
  const conclusions: ConclusionInfo[] = q.conclusions.map((c, index) => {
    const v = verdictOf(model, c)
    const focus = focusTerms(q, c.x, c.y)
    const labelText = ROMAN[index] ?? String(index + 1)
    const claim = quote(c)
    const hl = (tone: Highlight['tone']): Highlight[] => [{ form: c.form, x: c.x, y: c.y, tone }]
    const trueHl = hl('ok')
    const falseHl = hl('bad')
    const get = (truth: boolean, want: number) => findWorlds(model, { focus, lits: [lit(c, truth)], want, order })
    const kind: ConclusionInfo['kind'] = v.follows ? 'follows' : v.possible && !c.possibility ? 'open' : 'never'
    const pictures: Picture[] = []
    const reasons: string[] = []
    let headline: string

    const trueRegion = regionPhrase(q, trueHl[0], true)
    const falseRegion = regionPhrase(q, falseHl[0], false)

    if (c.possibility) {
      if (v.possible) {
        headline = `${labelText} is possible — it can be true`
        reasons.push(`A “can be” conclusion only needs ONE valid picture. Here is one where all statements hold and ${claim} is true.`)
        get(true, 1).forEach((w) =>
          pictures.push({ world: w, truth: true, title: 'A picture where it is true', caption: `All the statements hold here, and ${trueRegion} shows ${claim} is true. One picture is enough for a possibility.`, highlights: trueHl }),
        )
      } else {
        const b = blockerOf(rs, c.form, c.x, c.y)
        headline = `${labelText} is not possible`
        reasons.push(b ? `The statements force “${b.text}”${b.lines.length ? ` (${b.lines.join('; ')})` : ''}, so ${claim} can never be true.` : `No valid picture makes ${claim} true.`)
        get(false, 2).forEach((w) =>
          pictures.push({ world: w, truth: false, title: 'Every picture looks like this', caption: `In every valid picture, ${falseRegion}. So ${claim} is never true.`, highlights: falseHl }),
        )
      }
    } else if (kind === 'follows') {
      const proof = proofOf(rs, c.form, c.x, c.y)
      headline = `${labelText} follows`
      reasons.push(
        proof && proof.length
          ? `Chain the statements: ${proof.join(' → ')}.`
          : proof
            ? 'It is stated directly.'
            : 'Every way of drawing the statements gives it — there is no valid picture in which it is false.',
      )
      reasons.push('A conclusion follows when it is true in EVERY possible picture — and here it is.')
      get(true, 2).forEach((w, n) =>
        pictures.push({
          world: w,
          truth: true,
          title: `Picture ${n + 1}`,
          caption:
            n === 0
              ? `All the statements hold, and ${trueRegion} confirms ${claim}. Try drawing the statements any other way — you cannot get rid of it.`
              : `A different valid picture. ${claim} is still true here — ${trueRegion}.`,
          highlights: trueHl,
        }),
      )
    } else if (kind === 'open') {
      headline = `${labelText} does not follow`
      reasons.push(`It is not forced: in the first picture ${claim} is false (${falseRegion}), although in the second it is true. A conclusion must hold in EVERY picture.`)
      get(false, 1).forEach((w) =>
        pictures.push({
          world: w,
          truth: false,
          title: 'A picture where it is false',
          caption: `Every statement is still true here, but ${falseRegion} — so ${claim} is false. One such picture is enough to say it does not follow.`,
          highlights: falseHl,
        }),
      )
      get(true, 1).forEach((w) =>
        pictures.push({
          world: w,
          truth: true,
          title: 'A picture where it is true',
          caption: `Here ${claim} happens to be true — ${trueRegion}. But “could be true” is not “must be true”: the picture before this one shows it can fail.`,
          highlights: trueHl,
        }),
      )
    } else {
      const b = blockerOf(rs, c.form, c.x, c.y)
      headline = `${labelText} does not follow — it is never true`
      reasons.push(b ? `The statements force “${b.text}”${b.lines.length ? ` (${b.lines.join('; ')})` : ''}, the opposite of ${claim}.` : `In every valid picture the opposite of ${claim} holds.`)
      get(false, 2).forEach((w, n) =>
        pictures.push({
          world: w,
          truth: false,
          title: `Picture ${n + 1}`,
          caption: `Whatever way you draw the statements, ${falseRegion}. So ${claim} cannot be true.`,
          highlights: falseHl,
        }),
      )
    }
    return { index, label: labelText, sentence: c, text: c.text, follows: v.follows, possible: v.possible, kind, headline, reasons, pictures }
  })

  // ---- the five options ----
  const hasOptions = conclusions.length === 2
  let correct: number | null = null
  let either = false
  let bothFalse: Picture | null = null
  let contradictory = false
  if (hasOptions) {
    const [a, b] = conclusions
    either = !a.follows && !b.follows && isComplementary(a.sentence, b.sentence)
    contradictory = isComplementary(a.sentence, b.sentence)
    correct = correctOption(a.follows, b.follows, either)
    if (!a.follows && !b.follows && !either) {
      const focus = [...new Set([...focusTerms(q, a.sentence.x, a.sentence.y), ...focusTerms(q, b.sentence.x, b.sentence.y)])].sort((x, y) => x - y)
      const w = findWorlds(model, { focus, lits: [lit(a.sentence, false), lit(b.sentence, false)], want: 1, order })[0]
      if (w) {
        bothFalse = {
          world: w,
          truth: false,
          title: 'A picture where both are false',
          caption: `Every statement holds here, yet ${quote(a.sentence)} is false AND ${quote(b.sentence)} is false. Nothing forces either one.`,
          highlights: [
            { form: a.sentence.form, x: a.sentence.x, y: a.sentence.y, tone: 'bad' },
            { form: b.sentence.form, x: b.sentence.x, y: b.sentence.y, tone: 'bad' },
          ],
        }
      }
    }
  }

  const picture = (ref: PicRef): Picture | null => (ref.conc < 0 ? bothFalse : (conclusions[ref.conc]?.pictures[ref.idx] ?? null))
  const picOf = (i: number, truth: boolean): PicRef | undefined => {
    const idx = conclusions[i].pictures.findIndex((p) => p.truth === truth)
    return idx < 0 ? undefined : { conc: i, idx }
  }

  const verdictPoint = (i: number): Point => {
    const c = conclusions[i]
    const ref = picOf(i, c.kind === 'open' ? false : c.kind === 'follows')
    return { tone: c.follows ? 'good' : 'bad', text: `${c.headline}. ${c.reasons.join(' ')}`, ref: ref ?? (c.pictures.length ? { conc: i, idx: 0 } : undefined) }
  }
  const eitherPoint = (): Point => {
    const [a, b] = conclusions
    return {
      tone: 'info',
      text: `${quote(a.sentence)} and ${quote(b.sentence)} are opposites about the same two groups. Neither is forced on its own (one picture has ${a.label} true, another has ${b.label} true) — yet in every picture exactly one of them holds. That is exactly the “Either … or” case.`,
      ref: picOf(0, true),
    }
  }

  const feedback = (option: number): Feedback => {
    const ok = option === correct
    const points: Point[] = []
    const [a, b] = conclusions
    if (ok) {
      if (either) points.push(eitherPoint())
      points.push(verdictPoint(0), verdictPoint(1))
      return { option, correct: true, headline: `Correct — ${OPTION_TEXT[option]}`, points }
    }
    const headline = `Not quite — “${OPTION_TEXT[option]}” is wrong`
    switch (option) {
      case 0: // only I
      case 1: {
        const mine = option === 0 ? a : b
        const other = option === 0 ? b : a
        if (!mine.follows) points.push({ ...verdictPoint(mine.index), tone: 'bad' })
        if (other.follows) points.push({ tone: 'bad', text: `${other.label} follows as well, so saying that only ${mine.label} follows leaves ${other.label} out. ${other.reasons[0] ?? ''}`, ref: picOf(other.index, true) })
        if (either) points.push(eitherPoint())
        break
      }
      case 2: {
        // either
        for (const c of conclusions) {
          if (c.follows) points.push({ tone: 'bad', text: `${c.label} follows by itself (${c.reasons[0] ?? 'it is true in every picture'}), so this is not an “Either … or” case.`, ref: picOf(c.index, true) })
        }
        if (!a.follows && !b.follows) {
          points.push({
            tone: 'bad',
            text: `“Either … or” needs I and II to be exact opposites about the same two groups (Some ↔ No, or All ↔ Some … not). These are not, so nothing forces one of them to be true.${bothFalse ? ' In the picture shown, both are false.' : ''}`,
            ref: bothFalse ? { conc: -1, idx: 0 } : picOf(0, false),
          })
        }
        break
      }
      case 3: {
        // neither
        for (const c of conclusions) if (c.follows) points.push({ ...verdictPoint(c.index), tone: 'bad' })
        if (either) {
          points.push({
            tone: 'bad',
            text: `True, neither follows on its own — but ${a.label} and ${b.label} are opposites about the same two groups, so in every picture exactly one of them holds. In this picture ${a.label} is true (and ${b.label} is false).`,
            ref: picOf(0, true),
          })
          points.push({ tone: 'bad', text: `In this one ${b.label} is true (and ${a.label} is false). There is no picture where both fail — so “Neither” cannot be right.`, ref: picOf(1, true) })
        }
        break
      }
      case 4: {
        // both
        for (const c of conclusions) if (!c.follows) points.push({ ...verdictPoint(c.index), tone: 'bad' })
        if (either) points.push({ tone: 'bad', text: `They are opposites, so they can never both be true in the same picture — at most one holds.`, ref: picOf(0, true) })
        break
      }
    }
    return { option, correct: false, headline, points }
  }

  return { q, model, conclusions, buildWorld, steps, hasOptions, correct, either, bothFalse, contradictory, feedback, picture }
}

// ---------- reading a highlight off a set of zones ----------

const bit = (m: number, t: number) => ((m >> t) & 1) === 1

export interface ResolvedHighlight {
  zones: number[]
  gap: [number, number] | null
  tone: Highlight['tone']
  truth: boolean
}

/** Which of the drawn zones a highlight talks about (and whether it holds in the drawing). */
export function resolveHighlight(masks: number[], h: Highlight): ResolvedHighlight {
  const { x, y } = h
  const truth = holdsIn(masks, h.form, x, y)
  const both = masks.filter((m) => bit(m, x) && bit(m, y))
  const xOnly = masks.filter((m) => bit(m, x) && !bit(m, y))
  const xAll = masks.filter((m) => bit(m, x))
  const tone = h.tone === 'info' ? 'info' : truth ? 'ok' : 'bad'
  switch (h.form) {
    case 'I':
      return truth ? { zones: both, gap: null, tone, truth } : { zones: [], gap: [x, y], tone, truth }
    case 'E':
      return truth ? { zones: [], gap: [x, y], tone, truth } : { zones: both, gap: null, tone, truth }
    case 'A':
      return truth ? { zones: xAll, gap: null, tone, truth } : { zones: xOnly, gap: null, tone, truth }
    case 'O':
      return truth ? { zones: xOnly, gap: null, tone, truth } : { zones: xAll, gap: null, tone, truth }
  }
}
