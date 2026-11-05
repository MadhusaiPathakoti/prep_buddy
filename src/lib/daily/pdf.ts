import { jsPDF } from 'jspdf'
import { autoTable } from 'jspdf-autotable'
import { createFlow, pdfText } from '../mocks/pdf'
import { OPTION_LETTERS } from '../mocks/report'
import { topicLabel } from '../mocks/topics'
import type { MockPaper, MockQuestion } from '../mocks/types'
import { formatDateKey, sectionInfo } from './compose'

// The Daily Dose paper as one PDF: the questions first, then the answer key, then a worked solution for every
// question (laid out like the reference practice sheets: an "Answers:" block followed by "Solutions:").
// Every page carries the PrepBuddy mark: a header band, a diagonal watermark and a footer.

type RGB = [number, number, number]
const INK: RGB = [15, 23, 42]
const MUTED: RGB = [100, 116, 139]
const LINE: RGB = [226, 232, 240]
const BRAND: RGB = [79, 70, 229]
const SLATE: RGB = [51, 65, 85]
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

    // Header band with the logo mark.
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
    doc.text('Daily Dose of Practice', W - 14, 7, { align: 'right' })

    // Diagonal watermark.
    g.setGState(new g.GState({ opacity: 0.07 }))
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(70)
    ink(doc, BRAND)
    const wmWidth = doc.getTextWidth('PrepBuddy')
    const k = Math.SQRT1_2
    doc.text('PrepBuddy', W / 2 - (wmWidth / 2) * k, H / 2 + (wmWidth / 2) * k, { angle: 45 })
    g.setGState(new g.GState({ opacity: 1 }))

    // Footer.
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

export function dailyPdfFileName(paper: MockPaper): string {
  const section = paper.daily?.section ?? 'daily'
  return `prepbuddy-daily-dose-${section}-${paper.daily?.dateKey ?? 'paper'}.pdf`
}

export function buildDailyPaperPdf(paper: MockPaper): jsPDF {
  const dateKey = paper.daily?.dateKey ?? ''
  const info = sectionInfo(paper.daily?.section ?? 'quant')
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const label = `Daily Dose · ${info.name} · ${formatDateKey(dateKey)}`
  doc.setProperties({ title: pdfText(label), author: 'PrepBuddy', creator: 'PrepBuddy' })

  const f = createFlow(doc, 22)
  const { M, TW, ensure, para, drawStimulus } = f
  const byId = new Map(paper.questions.map((q) => [q.id, q]))
  const ordered = paper.sections.flatMap((s) => s.questionIds).map((id) => byId.get(id) as MockQuestion)

  // ---- Title block
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  ink(doc, INK)
  doc.text(pdfText(`Daily Dose of Practice · ${info.name}`), M, f.y)
  f.y += 7
  para(`${formatDateKey(dateKey)} · ${ordered.length} questions · No time limit · SBI PO (Prelims + Mains) pattern`, 9, 'normal', MUTED, 0, 0.6)
  para(`Marking (for self-assessment): +${paper.marksPerQuestion} for each correct answer, -${paper.negativeMarks} for each wrong answer. Every question has five options (A to E). The answer key and detailed solutions are at the end of this paper.`, 8.5, 'italic', MUTED, 0, 4)

  // ---- Questions
  const shownSets = new Set<string>()
  ordered.forEach((q, i) => {
    if (q.setId && !shownSets.has(q.setId)) {
      shownSets.add(q.setId)
      ensure(26)
      doc.setDrawColor(LINE[0], LINE[1], LINE[2])
      doc.setLineWidth(0.2)
      doc.line(M, f.y - 2, M + TW, f.y - 2)
      f.y += 2
      const members = ordered.map((x, n) => (x.setId === q.setId ? n + 1 : 0)).filter(Boolean)
      para(`Common data / passage for Q${members[0]}${members.length > 1 ? ` to Q${members[members.length - 1]}` : ''}:`, 8.5, 'bold', INK, 0, 0.5)
      drawStimulus(paper.sets[q.setId])
    }
    ensure(34)
    para(`Q${i + 1}. ${q.stem}`, 9.5, 'bold', INK, 0, 1)
    q.options.forEach((o, oi) => para(`${OPTION_LETTERS[oi]}. ${o}`, 9, 'normal', SLATE, OPTION_INDENT, 0.4))
    f.y += 3.5
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
  for (let i = 0; i < ordered.length; i += cols) {
    rows.push(Array.from({ length: cols }, (_, c) => (ordered[i + c] ? `${i + c + 1}. ${OPTION_LETTERS[ordered[i + c].answer]}` : '')))
  }
  autoTable(doc, {
    startY: f.y,
    margin: { left: M, right: M, top: 18 },
    body: rows,
    theme: 'grid',
    styles: { font: 'helvetica', fontSize: 10.5, cellPadding: 2.6, lineColor: LINE, lineWidth: 0.2, textColor: INK, fontStyle: 'bold', halign: 'left' },
  })
  f.y = ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? f.y) + 9

  // ---- Solutions
  ensure(24)
  highlight('Solutions:')
  f.y += 1
  const stepsOf = (text: string) => text.split(/\n+/).map((l) => l.trim()).filter(Boolean)
  ordered.forEach((q, i) => {
    ensure(22)
    const letter = OPTION_LETTERS[q.answer]
    para(`${i + 1}. Correct answer: (${letter}) ${q.options[q.answer]}`, 9.5, 'bold', INK, 0, 0.6)
    para(`${topicLabel(q.topic)}`, 7.5, 'italic', MUTED, OPTION_INDENT, 0.4)
    // Generators end their working with "Correct answer: (X) ..."; the heading above already says that.
    const echo = `correct answer: (${letter.toLowerCase()}) ${q.options[q.answer].toLowerCase()}`
    const steps = stepsOf(q.explanation).filter((s) => s.toLowerCase().replace(/\.$/, '') !== echo)
    for (const step of steps) para(step, 9, 'normal', SLATE, OPTION_INDENT, 0.7)
    f.y += 3.5
  })

  brandPages(doc, label)
  return doc
}
