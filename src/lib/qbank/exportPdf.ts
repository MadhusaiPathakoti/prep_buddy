import { jsPDF } from 'jspdf'
import { autoTable } from 'jspdf-autotable'
import { createFlow, pdfText } from '../mocks/pdf'
import { OPTION_LETTERS } from '../mocks/report'
import { exportBlockedReason } from './filters'
import type { BankFilters } from './filters'
import { parseSolution } from './solution'
import { shortcutsFor } from './topicTips'
import { bankTopicLabel, DEFAULT_EXAM_NAME } from './types'
import type { QuantQuestion } from './types'

// The favourites export: one PDF with the questions first, then the answer key, then a worked solution and the exam
// shortcut for every question, laid out like the Daily Dose paper. Every page carries the PrepBuddy mark.

type RGB = [number, number, number]
const INK: RGB = [15, 23, 42]
const MUTED: RGB = [100, 116, 139]
const LINE: RGB = [226, 232, 240]
const BRAND: RGB = [79, 70, 229]
const SLATE: RGB = [51, 65, 85]
const AMBER: RGB = [146, 64, 14]
const OPTION_INDENT = 4

const ink = (doc: jsPDF, c: RGB) => doc.setTextColor(c[0], c[1], c[2])
const fill = (doc: jsPDF, c: RGB) => doc.setFillColor(c[0], c[1], c[2])

type WithGState = jsPDF & { GState: new (o: { opacity: number }) => unknown; setGState: (g: unknown) => void }

/** Header band, diagonal watermark and footer on every page. */
function brandPages(doc: jsPDF, label: string) {
  const total = doc.getNumberOfPages()
  const g = doc as WithGState
  for (let i = 1; i <= total; i++) {
    doc.setPage(i)
    const W = doc.internal.pageSize.getWidth()
    const H = doc.internal.pageSize.getHeight()

    fill(doc, BRAND)
    doc.rect(0, 0, W, 11, 'F')
    fill(doc, [255, 255, 255])
    doc.roundedRect(14, 2.4, 6.2, 6.2, 1.4, 1.4, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    ink(doc, BRAND)
    doc.text('P', 17.1, 7, { align: 'center' })
    ink(doc, [255, 255, 255])
    doc.setFontSize(10)
    doc.text('PrepBuddy', 22.5, 7)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.text('My favourite Quant questions', W - 14, 7, { align: 'right' })

    g.setGState(new g.GState({ opacity: 0.07 }))
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(70)
    ink(doc, BRAND)
    const wmWidth = doc.getTextWidth('PrepBuddy')
    const k = Math.SQRT1_2
    doc.text('PrepBuddy', W / 2 - (wmWidth / 2) * k, H / 2 + (wmWidth / 2) * k, { angle: 45 })
    g.setGState(new g.GState({ opacity: 1 }))

    doc.setDrawColor(LINE[0], LINE[1], LINE[2])
    doc.setLineWidth(0.2)
    doc.line(14, H - 10, W - 14, H - 10)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.5)
    ink(doc, MUTED)
    doc.text(pdfText(`PrepBuddy · ${label}`), 14, H - 6)
    doc.text(`Page ${i} of ${total}`, W - 14, H - 6, { align: 'right' })
  }
}

const dateText = (date: Date) => date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })

/** A file name that says what is inside: prepbuddy-favourites-percentage-hard-2026-11-18.pdf */
export function favouritesPdfFileName(filters: BankFilters, date: Date): string {
  const parts = [filters.topic, filters.difficulty, filters.examType, filters.examName, filters.year, filters.source === 'user' ? 'student-added' : filters.source ? 'practice' : '']
    .filter(Boolean)
    .map((p) => p.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''))
    .filter(Boolean)
  const iso = date.toISOString().slice(0, 10)
  return ['prepbuddy-favourites', ...parts, iso].join('-') + '.pdf'
}

export interface FavouritesPdfInput {
  questions: QuantQuestion[]
  /** The filters in words, e.g. ["Topic: Percentage", "Difficulty: Hard"]. */
  filters: string[]
  date: Date
}

/** The tags of one question on one line: "Percentage · Hard · PO · SBI PO · 2023". */
function tagLine(q: QuantQuestion): string {
  const parts = [bankTopicLabel(q.topic), q.difficulty[0].toUpperCase() + q.difficulty.slice(1), q.examType]
  if (q.examName !== DEFAULT_EXAM_NAME) parts.push(q.examName)
  if (q.year !== null) parts.push(String(q.year))
  return parts.join(' · ')
}

export function buildFavouritesPdf({ questions, filters, date }: FavouritesPdfInput): jsPDF {
  if (questions.length === 0) throw new Error('There are no questions to export.')
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const label = `Favourites · ${dateText(date)}`
  doc.setProperties({ title: pdfText(`My favourite Quant questions · ${dateText(date)}`), author: 'PrepBuddy', creator: 'PrepBuddy' })

  const f = createFlow(doc, 22)
  const { M, ensure, para } = f

  // ---- Title block
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  ink(doc, INK)
  doc.text(pdfText('My favourite Quant questions'), M, f.y)
  f.y += 7
  para(`${questions.length} question${questions.length === 1 ? '' : 's'} · ${dateText(date)}`, 9, 'normal', MUTED, 0, 0.6)
  if (filters.length) para(`Filters: ${filters.join(' · ')}`, 9, 'normal', MUTED, 0, 0.6)
  para('The answer key, step-by-step solutions and exam shortcuts are at the end.', 8.5, 'italic', MUTED, 0, 4)

  // ---- Questions
  questions.forEach((q, i) => {
    ensure(34)
    para(`Q${i + 1}. ${q.stem}`, 9.5, 'bold', INK, 0, 0.8)
    q.options.forEach((o, oi) => para(`${OPTION_LETTERS[oi]}. ${o}`, 9, 'normal', SLATE, OPTION_INDENT, 0.4))
    para(tagLine(q), 7.5, 'italic', MUTED, OPTION_INDENT, 0.5)
    f.y += 3
  })

  // ---- Answer key
  doc.addPage('a4', 'portrait')
  f.y = 22
  const highlight = (text: string) => {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(13)
    const w = doc.getTextWidth(text)
    fill(doc, [255, 235, 0])
    doc.rect(M - 1, f.y - 5.2, w + 2, 7.4, 'F')
    ink(doc, INK)
    doc.text(text, M, f.y)
    f.y += 8
  }
  highlight('Answers:')
  const cols = 5
  const rows: string[][] = []
  for (let i = 0; i < questions.length; i += cols) {
    rows.push(Array.from({ length: cols }, (_, c) => (questions[i + c] ? `${i + c + 1}. ${OPTION_LETTERS[questions[i + c].answer]}` : '')))
  }
  autoTable(doc, {
    startY: f.y,
    margin: { left: M, right: M, top: 18 },
    body: rows,
    theme: 'grid',
    styles: { font: 'helvetica', fontSize: 10.5, cellPadding: 2.6, lineColor: LINE, lineWidth: 0.2, textColor: INK, fontStyle: 'bold', halign: 'left' },
  })
  f.y = ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? f.y) + 9

  // ---- Solutions and shortcuts
  ensure(24)
  highlight('Solutions:')
  f.y += 1
  questions.forEach((q, i) => {
    ensure(26)
    const letter = OPTION_LETTERS[q.answer]
    para(`${i + 1}. Correct answer: (${letter}) ${q.options[q.answer]}`, 9.5, 'bold', INK, 0, 0.6)
    para(tagLine(q), 7.5, 'italic', MUTED, OPTION_INDENT, 0.4)
    // The working ends with its own "Correct answer" line, which the heading above already says.
    const solution = parseSolution(q.solution)
    for (const step of solution.steps) {
      const text = step.lines.join(' ')
      para(step.label ? `${step.label}: ${text}` : text, 9, 'normal', SLATE, OPTION_INDENT, 0.7)
    }
    for (const tip of shortcutsFor(q)) para(`Shortcut: ${tip}`, 8.5, 'italic', AMBER, OPTION_INDENT, 0.5)
    if (q.trust === 'unverified') para('Note: this answer key could not be independently confirmed.', 8, 'italic', MUTED, OPTION_INDENT, 0.5)
    f.y += 3.5
  })

  brandPages(doc, label)
  return doc
}

/**
 * Builds and downloads the PDF for a filtered set of favourites. Refuses unless the favourites have been filtered by
 * at least one tag (the same rule the Export button follows), so no code path can export an unfiltered list.
 */
export function downloadFavouritesPdf(filters: BankFilters, filterWords: string[], questions: QuantQuestion[], date = new Date()): void {
  const blocked = exportBlockedReason(filters, questions.length)
  if (blocked) throw new Error(blocked)
  buildFavouritesPdf({ questions, filters: filterWords, date }).save(favouritesPdfFileName(filters, date))
}
