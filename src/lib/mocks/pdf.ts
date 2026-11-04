import { jsPDF } from 'jspdf'
import { autoTable, type CellDef } from 'jspdf-autotable'
import { COHORT_DISCLAIMER, TIERS } from './cohort'
import { kindLabel, OPTION_LETTERS, pct, type Report } from './report'
import { formatHms, formatScore, type QuestionResult } from './scoring'
import { topicLabel } from './topics'
import type { MockPaper, MockQuestion, Stimulus, StimulusPart } from './types'

// Vector PDF of the result report. Layout follows the attached sample (Your Results cards → Rank
// Predictor → Performance Breakdown → Sectional Summary → Compare with Topper) and then adds topic
// analysis and the complete question-by-question solution analysis. jsPDF's built-in fonts are
// WinAnsi-only, so question text goes through `pdfText` first.

type RGB = [number, number, number]

const INK: RGB = [15, 23, 42]
const MUTED: RGB = [100, 116, 139]
const LINE: RGB = [226, 232, 240]
const GREEN: RGB = [16, 185, 129]
const RED: RGB = [239, 68, 68]
const GREY: RGB = [156, 163, 175]
const VIOLET: RGB = [124, 58, 237]
const BLUE: RGB = [59, 130, 246]
const AMBER: RGB = [245, 158, 11]
const CYAN: RGB = [6, 182, 212]
const ORANGE: RGB = [234, 88, 12]

const MAP: Record<string, string> = {
  '−': '-', '–': '-', '—': '-', '‘': "'", '’': "'", '“': '"', '”': '"', '…': '...', '•': '*', '√': 'sqrt ', '≤': '<=', '≥': '>=', '≠': '!=', '≈': '~', '₹': 'Rs.', '→': '->', '←': '<-', '∴': 'therefore', '✓': 'OK', '✕': 'x', '≡': '=', '∠': 'angle', 'π': 'pi', '∞': 'inf',
}

/** Maps text onto characters the built-in PDF fonts can draw; anything else becomes "?". */
export function pdfText(s: string): string {
  return s
    .normalize('NFC')
    .replace(/[^\t\n\r\x20-\x7E\xA0-\xFF]/gu, (c) => MAP[c] ?? '?')
    .replace(/­/g, '')
}

function hex(c: string): RGB {
  const n = parseInt(c.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function mix(a: RGB, b: RGB, t: number): RGB {
  return [Math.round(a[0] + (b[0] - a[0]) * t), Math.round(a[1] + (b[1] - a[1]) * t), Math.round(a[2] + (b[2] - a[2]) * t)]
}

const fill = (doc: jsPDF, c: RGB) => doc.setFillColor(c[0], c[1], c[2])
const ink = (doc: jsPDF, c: RGB) => doc.setTextColor(c[0], c[1], c[2])
const stroke = (doc: jsPDF, c: RGB) => doc.setDrawColor(c[0], c[1], c[2])

function finalY(doc: jsPDF): number {
  return (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 0
}

function heading(doc: jsPDF, text: string, x: number, y: number) {
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(13)
  ink(doc, INK)
  doc.text(pdfText(text), x, y)
}

function card(doc: jsPDF, x: number, y: number, w: number, h: number) {
  fill(doc, [255, 255, 255])
  stroke(doc, LINE)
  doc.setLineWidth(0.3)
  doc.roundedRect(x, y, w, h, 2.5, 2.5, 'FD')
}

function statCard(doc: jsPDF, x: number, y: number, w: number, label: string, value: string, suffix: string | undefined, color: RGB) {
  const h = 27
  card(doc, x, y, w, h)
  fill(doc, color)
  doc.roundedRect(x, y, w, 2, 1, 1, 'F')
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  ink(doc, MUTED)
  doc.text(pdfText(label), x + 5, y + 10)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(18)
  ink(doc, INK)
  doc.text(pdfText(value), x + 5, y + 21)
  if (suffix) {
    const vw = doc.getTextWidth(pdfText(value))
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    ink(doc, GREY)
    doc.text(pdfText(suffix), x + 6 + vw, y + 21)
  }
}

function pill(doc: jsPDF, x: number, y: number, text: string, color: RGB, active = false) {
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  const w = doc.getTextWidth(text) + 11
  fill(doc, active ? [241, 245, 249] : [255, 255, 255])
  stroke(doc, active ? MUTED : LINE)
  doc.roundedRect(x, y, w, 6.5, 3.25, 3.25, 'FD')
  fill(doc, color)
  doc.circle(x + 4, y + 3.25, 1.3, 'F')
  ink(doc, INK)
  doc.text(text, x + 7, y + 4.5)
  return w
}

function pageFooter(doc: jsPDF, label: string) {
  const total = doc.getNumberOfPages()
  for (let i = 1; i <= total; i++) {
    doc.setPage(i)
    const w = doc.internal.pageSize.getWidth()
    const h = doc.internal.pageSize.getHeight()
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.5)
    ink(doc, GREY)
    doc.text(pdfText(`PrepBuddy · ${label}`), 12, h - 6)
    doc.text(`Page ${i} of ${total}`, w - 12, h - 6, { align: 'right' })
  }
}

function overviewPages(doc: jsPDF, report: Report) {
  const { sc, cohort, attempt } = report
  const paper = attempt.paper
  const o = sc.overall
  const W = doc.internal.pageSize.getWidth()
  const M = 12

  // Title
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(17)
  ink(doc, INK)
  doc.text(pdfText(paper.title), M, 16)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  ink(doc, MUTED)
  doc.text(pdfText(`${kindLabel(paper.kind)} · attempt ${attempt.attemptNo} · ${new Date(attempt.finishedAt ?? Date.now()).toLocaleString()}`), M, 22)
  doc.text(pdfText(`Candidate: ${attempt.candidate}`), W - M, 16, { align: 'right' })
  doc.text(pdfText(`Marking: +${paper.marksPerQuestion} / -${paper.negativeMarks}`), W - M, 22, { align: 'right' })

  // Your Results
  heading(doc, 'Your Results', M, 33)
  const cw = (W - 2 * M - 3 * 5) / 4
  const cx = (i: number) => M + i * (cw + 5)
  statCard(doc, cx(0), 37, cw, 'Your Score', formatScore(o.score), `/${o.maxScore}`, AMBER)
  statCard(doc, cx(1), 37, cw, 'Rank (estimated)', cohort.rank.toLocaleString('en-IN'), `/${cohort.size.toLocaleString('en-IN')}`, VIOLET)
  statCard(doc, cx(2), 37, cw, 'Percentile (estimated)', `${cohort.percentile.toFixed(2)}%`, undefined, BLUE)
  statCard(doc, cx(3), 37, cw, 'Correct', String(o.correct), undefined, GREEN)
  statCard(doc, cx(0), 68, cw, 'Incorrect', String(o.incorrect), undefined, RED)
  statCard(doc, cx(1), 68, cw, 'Unattempted', String(o.unattempted), undefined, GREY)
  statCard(doc, cx(2), 68, cw, 'Accuracy', o.accuracy.toFixed(2), '%', CYAN)

  // Rank Predictor
  heading(doc, 'Rank Predictor', M, 107)
  const ly = 111
  const lh = 74
  const lw = 98
  card(doc, M, ly, lw, lh)
  pill(doc, M + 5, ly + 5, cohort.tier.id, hex(cohort.tier.color), true)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(26)
  ink(doc, INK)
  doc.text(`#${cohort.rank.toLocaleString('en-IN')}`, M + 5, ly + 25)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  ink(doc, MUTED)
  doc.text(`out of ${cohort.size.toLocaleString('en-IN')} members (simulated)`, M + 5, ly + 31)
  const boxW = (lw - 10 - 6) / 3
  const boxes: [string, string, RGB][] = [
    ['Marks', `${formatScore(o.score)}/${o.maxScore}`, INK],
    ['Members ahead', cohort.ahead.toLocaleString('en-IN'), GREEN],
    ['Members behind', cohort.behind.toLocaleString('en-IN'), RED],
  ]
  boxes.forEach(([label, value, color], i) => {
    const bx = M + 5 + i * (boxW + 3)
    fill(doc, [248, 250, 252])
    stroke(doc, LINE)
    doc.roundedRect(bx, ly + 37, boxW, 16, 2, 2, 'FD')
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7)
    ink(doc, MUTED)
    doc.text(label, bx + boxW / 2, ly + 42, { align: 'center' })
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    ink(doc, color)
    doc.text(pdfText(value), bx + boxW / 2, ly + 49.5, { align: 'center' })
  })
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  ink(doc, MUTED)
  doc.text(cohort.nextTier ? `Progress to ${cohort.nextTier.id}` : 'Top tier reached', M + 5, ly + 61)
  doc.setFont('helvetica', 'bold')
  ink(doc, INK)
  doc.text(`${Math.round(cohort.progressToNext)}%`, M + lw - 5, ly + 61, { align: 'right' })
  fill(doc, [226, 232, 240])
  doc.roundedRect(M + 5, ly + 64, lw - 10, 2.2, 1.1, 1.1, 'F')
  fill(doc, hex((cohort.nextTier ?? cohort.tier).color))
  if (cohort.progressToNext > 0) doc.roundedRect(M + 5, ly + 64, Math.max(2.2, ((lw - 10) * cohort.progressToNext) / 100), 2.2, 1.1, 1.1, 'F')

  const rx = M + lw + 5
  const rw = W - M - rx
  card(doc, rx, ly, rw, lh)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10.5)
  ink(doc, INK)
  doc.text('Rank & Tier Breakdown', rx + 6, ly + 9)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  ink(doc, MUTED)
  doc.text('Rank Distribution', rx + 6, ly + 20)
  pill(doc, rx + rw - 6 - 24, ly + 15.5, cohort.tier.id, hex(cohort.tier.color), true)
  const barX = rx + 6
  const barW = rw - 12
  const steps = 60
  const stops: RGB[] = [RED, AMBER, [234, 179, 8], [34, 197, 94]]
  for (let i = 0; i < steps; i++) {
    const t = (i / (steps - 1)) * (stops.length - 1)
    const k = Math.min(stops.length - 2, Math.floor(t))
    fill(doc, mix(stops[k], stops[k + 1], t - k))
    doc.rect(barX + (barW / steps) * i, ly + 27, barW / steps + 0.2, 2.2, 'F')
  }
  fill(doc, INK)
  doc.circle(barX + (barW * cohort.percentile) / 100, ly + 28.1, 2, 'F')
  stroke(doc, [255, 255, 255])
  doc.setLineWidth(0.5)
  doc.circle(barX + (barW * cohort.percentile) / 100, ly + 28.1, 2, 'S')
  for (const t of TIERS) {
    fill(doc, hex(t.color))
    doc.circle(barX + (barW * t.min) / 100, ly + 33, 0.9, 'F')
  }
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  ink(doc, INK)
  doc.text('Rank Tiers', rx + 6, ly + 43)
  let px = rx + 6
  let py = ly + 47
  for (const t of TIERS) {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    const w = doc.getTextWidth(t.id) + 11
    if (px + w > rx + rw - 5) {
      px = rx + 6
      py += 9
    }
    px += pill(doc, px, py, t.id, hex(t.color), t.id === cohort.tier.id) + 3
  }

  // Page 2: Performance Breakdown + Sectional Summary
  doc.addPage()
  heading(doc, 'Performance Breakdown', M, 18)
  const bars: [string, number, RGB][] = [
    ['Correct', o.correct, GREEN],
    ['Incorrect', o.incorrect, RED],
    ['Unattempted', o.unattempted, GREY],
  ]
  let lx = W - M
  for (const [label, , color] of [...bars].reverse()) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8.5)
    const tw = doc.getTextWidth(label)
    ink(doc, MUTED)
    doc.text(label, lx, 18, { align: 'right' })
    fill(doc, color)
    doc.circle(lx - tw - 3, 16.9, 1.2, 'F')
    lx -= tw + 10
  }
  const chartX = M + 12
  const chartY = 26
  const chartW = W - 2 * M - 12
  const chartH = 78
  card(doc, M, chartY - 4, W - 2 * M, chartH + 16)
  const axisMax = Math.max(20, Math.ceil(Math.max(...bars.map((b) => b[1])) / 20) * 20)
  for (let i = 0; i <= 4; i++) {
    const v = (axisMax * i) / 4
    const y = chartY + chartH - (v / axisMax) * chartH
    stroke(doc, LINE)
    doc.setLineWidth(0.2)
    doc.line(chartX, y, chartX + chartW - 6, y)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7)
    ink(doc, GREY)
    doc.text(String(Math.round(v)), chartX - 2, y + 1, { align: 'right' })
  }
  const slot = (chartW - 6) / 3
  bars.forEach(([label, n, color], i) => {
    const bw = 24
    const bx = chartX + slot * i + (slot - bw) / 2
    const bh = (n / axisMax) * chartH
    fill(doc, color)
    if (bh > 0) doc.rect(bx, chartY + chartH - bh, bw, bh, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    ink(doc, color)
    doc.text(String(n), bx + bw / 2, chartY + chartH - bh - 2, { align: 'center' })
    if (bh > 6) {
      doc.setFontSize(7.5)
      ink(doc, [255, 255, 255])
      doc.text(`${Math.round(pct(n, o.total))}%`, bx + bw / 2, chartY + chartH - bh / 2 + 1, { align: 'center' })
    }
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8.5)
    ink(doc, MUTED)
    doc.text(label, bx + bw / 2, chartY + chartH + 6, { align: 'center' })
  })

  heading(doc, 'Sectional Summary', M, chartY + chartH + 24)
  const rows = [...sc.sections, sc.overall].map((s) => {
    const c = (text: string, color: RGB, sub?: string): CellDef => ({ content: sub ? `${text}\n${sub}` : text, styles: { textColor: color, fontStyle: 'bold' } })
    return [
      { content: pdfText(s.name), styles: { fontStyle: 'bold' as const, textColor: INK } },
      c(`${formatScore(s.score)} /${s.maxScore}`, VIOLET),
      c(`${s.attempted} /${s.total}`, BLUE, 'of total Qs'),
      c(`${s.accuracy.toFixed(2)}%`, GREEN, 'accuracy'),
      c(`${s.correct} /${s.total}`, GREEN, `${s.accuracy.toFixed(2)}% accuracy`),
      c(`${s.incorrect} /${s.total}`, RED, `${s.attempted ? ((s.incorrect / s.attempted) * 100).toFixed(2) : '0.00'}% of attempted`),
      c(`${s.unattempted} /${s.total}`, MUTED, 'skipped'),
      c(formatHms(s.timeMs), ORANGE, 'hh:mm:ss'),
    ]
  })
  autoTable(doc, {
    startY: chartY + chartH + 28,
    margin: { left: M, right: M },
    head: [['Section Name', 'Score', 'Attempted', 'Accuracy', 'Correct', 'Incorrect', 'Unattempted', 'Time']],
    body: rows,
    theme: 'grid',
    styles: { font: 'helvetica', fontSize: 9, cellPadding: 3, lineColor: LINE, lineWidth: 0.2, valign: 'middle' },
    headStyles: { fillColor: [248, 250, 252], textColor: MUTED, fontStyle: 'bold' },
    columnStyles: { 0: { cellWidth: 52 } },
  })

  // Page 3: Compare with Topper
  doc.addPage()
  heading(doc, 'Compare with Topper', M, 18)
  const you = { score: o.score, maxScore: o.maxScore, accuracy: o.accuracy, correct: o.correct, wrong: o.incorrect, timeSec: report.usedSec }
  const cols: [string, typeof you, RGB, RGB][] = [
    ['TOPPER (benchmark)', cohort.topper, AMBER, [255, 255, 255]],
    ['YOU', you, GREEN, [255, 255, 255]],
    ['AVERAGE (benchmark)', cohort.average, [229, 231, 235], INK],
  ]
  const tw = (W - 2 * M - 2 * 6) / 3
  cols.forEach(([title, b, headColor, headText], i) => {
    autoTable(doc, {
      startY: 24,
      margin: { left: M + i * (tw + 6) },
      tableWidth: tw,
      head: [[{ content: title, colSpan: 2, styles: { fillColor: headColor, textColor: headText, fontStyle: 'bold', halign: 'left' } }]],
      body: [
        ['Score', `${formatScore(b.score)} / ${formatScore(b.maxScore)}`],
        ['Accuracy', `${b.accuracy.toFixed(2)}%`],
        ['Correct', String(b.correct)],
        ['Wrong', String(b.wrong)],
        ['Time', formatHms(b.timeSec * 1000)],
      ],
      theme: 'grid',
      styles: { font: 'helvetica', fontSize: 9.5, cellPadding: 3.2, lineColor: LINE, lineWidth: 0.2 },
      columnStyles: { 0: { textColor: MUTED }, 1: { halign: 'right', fontStyle: 'bold', textColor: i === 0 ? ORANGE : i === 1 ? [5, 150, 105] : INK } },
    })
  })
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  ink(doc, MUTED)
  const note = doc.splitTextToSize(pdfText(COHORT_DISCLAIMER + ' Topper and average are model benchmarks for this exam level.'), W - 2 * M)
  doc.text(note, M, 24 + 6 * 12 + 8)

  // Topic analysis
  const ty = 24 + 6 * 12 + 8 + note.length * 4 + 6
  heading(doc, 'Topic Analysis', M, ty)
  autoTable(doc, {
    startY: ty + 4,
    margin: { left: M, right: M },
    head: [['Topic', 'Section', 'Questions', 'Attempted', 'Correct', 'Incorrect', 'Accuracy', 'Avg time / Q']],
    body: [...sc.topics]
      .sort((a, b) => a.accuracy - b.accuracy)
      .map((t) => [pdfText(t.label), t.section, String(t.total), String(t.attempted), String(t.correct), String(t.incorrect), t.attempted ? `${t.accuracy.toFixed(0)}%` : '-', `${Math.round(t.timeMs / 1000 / t.total)}s`]),
    theme: 'striped',
    styles: { font: 'helvetica', fontSize: 8.5, cellPadding: 2.2 },
    headStyles: { fillColor: [241, 245, 249], textColor: MUTED, fontStyle: 'bold' },
  })
}

function stimulusParts(part: StimulusPart): { kind: 'text'; lines: string[]; bold?: boolean } | { kind: 'table'; heading?: string; head: string[]; body: string[][]; note?: string } {
  if (part.kind === 'text') return { kind: 'text', lines: [...(part.heading ? [part.heading] : []), ...part.paragraphs] }
  if (part.kind === 'table') return { kind: 'table', heading: part.heading, head: part.columns.map(String), body: part.rows.map((r) => r.map(String)), note: part.note }
  if (part.kind === 'pie') {
    const total = part.slices.reduce((n, s) => n + s.value, 0)
    return { kind: 'table', heading: part.heading ?? 'Pie chart data', head: ['Category', `Value${part.unit ? ` (${part.unit})` : ''}`, 'Share'], body: part.slices.map((s) => [s.label, String(s.value), `${((s.value / total) * 100).toFixed(1)}%`]) }
  }
  // bar / line: chart data as a table (series as rows)
  return {
    kind: 'table',
    heading: `${part.heading ?? (part.kind === 'bar' ? 'Bar graph' : 'Line graph')} - data${part.unit ? ` (${part.unit})` : ''}`,
    head: ['', ...part.categories],
    body: part.series.map((s) => [s.name, ...s.values.map(String)]),
  }
}

/** Top-to-bottom text layout on portrait pages: tracks the cursor, breaks pages, wraps text, draws a set's stimulus. */
function createFlow(doc: jsPDF, startY = 20) {
  const W = doc.internal.pageSize.getWidth()
  const H = doc.internal.pageSize.getHeight()
  const M = 14
  const TW = W - 2 * M
  const f = {
    y: startY,
    W,
    H,
    M,
    TW,
    ensure(h: number) {
      if (f.y + h > H - 14) {
        doc.addPage('a4', 'portrait')
        f.y = 18
      }
    },
    para(text: string, size: number, style: 'normal' | 'bold' | 'italic', color: RGB, indent = 0, gap = 1.2) {
      doc.setFont('helvetica', style)
      doc.setFontSize(size)
      ink(doc, color)
      const lines: string[] = doc.splitTextToSize(pdfText(text), TW - indent)
      const lh = size * 0.4
      for (const line of lines) {
        f.ensure(lh + 1)
        doc.text(line, M + indent, f.y)
        f.y += lh
      }
      f.y += gap
    },
    drawStimulus(stim: Stimulus) {
      if (stim.directions) f.para(stim.directions, 8.5, 'italic', MUTED)
      for (const p of stim.parts) {
        const s = stimulusParts(p)
        if (s.kind === 'text') {
          s.lines.forEach((l, i) => f.para(l, 8.5, p.kind === 'text' && p.heading && i === 0 ? 'bold' : 'normal', [51, 65, 85], 3))
        } else {
          if (s.heading) f.para(s.heading, 8.5, 'bold', INK, 3)
          f.ensure(8 + (s.body.length + 1) * 6.5) // keep a data table on one page
          autoTable(doc, {
            startY: f.y,
            margin: { left: M + 3, right: M },
            head: [s.head.map(pdfText)],
            body: s.body.map((r) => r.map(pdfText)),
            theme: 'grid',
            styles: { font: 'helvetica', fontSize: 7.5, cellPadding: 1.4, halign: 'center', lineColor: LINE, lineWidth: 0.2 },
            headStyles: { fillColor: [241, 245, 249], textColor: INK },
            tableWidth: 'wrap',
          })
          f.y = finalY(doc) + 4
          if (s.note) f.para(s.note, 7.5, 'italic', MUTED, 3)
        }
      }
      f.y += 1
    },
  }
  return f
}

function solutionPages(doc: jsPDF, report: Report) {
  const { sc, attempt } = report
  const paper = attempt.paper
  doc.addPage('a4', 'portrait')
  const f = createFlow(doc)
  const { W, M, TW, ensure, para, drawStimulus } = f

  heading(doc, 'Solution Analysis', M, f.y)
  f.y += 8
  const shownSets = new Set<string>()
  const sectionIndexShown = new Set<number>()

  const drawQuestion = (r: QuestionResult) => {
    const { q } = r
    if (!sectionIndexShown.has(r.sectionIndex)) {
      sectionIndexShown.add(r.sectionIndex)
      ensure(16)
      fill(doc, [238, 242, 255])
      doc.rect(M, f.y - 4.5, TW, 7, 'F')
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(10)
      ink(doc, [67, 56, 202])
      doc.text(pdfText(paper.sections[r.sectionIndex].name), M + 2, f.y)
      f.y += 8
    }
    if (q.setId && !shownSets.has(q.setId)) {
      shownSets.add(q.setId)
      ensure(20)
      para('Common data / passage for the following question(s):', 8.5, 'bold', INK, 0, 0.5)
      drawStimulus(paper.sets[q.setId])
    }
    ensure(30)
    const color = r.verdict === 'correct' ? GREEN : r.verdict === 'incorrect' ? RED : GREY
    stroke(doc, LINE)
    doc.setLineWidth(0.2)
    doc.line(M, f.y - 3, M + TW, f.y - 3)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    ink(doc, INK)
    const head = `Q${r.number} (${paper.sections[r.sectionIndex].name.split(' ')[0]} · ${topicLabel(q.topic)})`
    doc.text(pdfText(head), M, f.y)
    const status = r.verdict === 'correct' ? 'CORRECT' : r.verdict === 'incorrect' ? 'INCORRECT' : 'UNATTEMPTED'
    ink(doc, color)
    const right = `${status}${r.marked ? ' · marked' : ''} · ${formatHms(r.timeMs)}`
    doc.text(right, W - M, f.y, { align: 'right' })
    f.y += 5
    para(q.stem, 9.5, 'normal', INK)
    q.options.forEach((o, i) => {
      const isAnswer = i === q.answer
      const isYours = i === r.selected
      const tag = isAnswer && isYours ? '   [Correct - your answer]' : isAnswer ? '   [Correct]' : isYours ? '   [Your answer]' : ''
      para(`${OPTION_LETTERS[i]}. ${o}${tag}`, 9, isAnswer || isYours ? 'bold' : 'normal', isAnswer ? [5, 150, 105] : isYours ? RED : [51, 65, 85], 4, 0.4)
    })
    if (r.selected === null) para('Not attempted.', 8.5, 'italic', MUTED, 4, 0.4)
    para(`Solution: ${q.explanation}`, 8.5, 'normal', [67, 56, 202], 0, 4)
  }

  for (const r of sc.questions) drawQuestion(r)
}

export function buildResultPdf(report: Report): jsPDF {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  doc.setProperties({ title: pdfText(`${report.attempt.paper.title} - Result`), author: 'PrepBuddy', creator: 'PrepBuddy' })
  overviewPages(doc, report)
  solutionPages(doc, report)
  pageFooter(doc, report.attempt.paper.title)
  return doc
}

/**
 * A printable practice copy of one section: the questions (with each set's passage/data once) and no
 * answer key, so it is safe to offer while the test is still running. Charts are given as data tables.
 */
export function buildQuestionPaperPdf(paper: MockPaper, sectionIndex: number, candidate?: string): jsPDF {
  const section = paper.sections[sectionIndex]
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const label = `${paper.title} - ${section.name} (question paper)`
  doc.setProperties({ title: pdfText(label), author: 'PrepBuddy', creator: 'PrepBuddy' })
  const f = createFlow(doc)
  const { M, TW, ensure, para, drawStimulus } = f

  heading(doc, paper.title, M, f.y)
  f.y += 7
  para(section.name, 11, 'bold', [67, 56, 202], 0, 1)
  const minutes = section.durationSec / 60
  para(`${section.questionIds.length} questions · ${Number.isInteger(minutes) ? minutes : minutes.toFixed(1)} minutes · +${paper.marksPerQuestion} for each correct answer, -${paper.negativeMarks} for each wrong answer${candidate ? ` · ${candidate}` : ''}`, 8.5, 'normal', MUTED, 0, 0.5)
  para('Practice copy: attempt it against the clock, then check your answers in your PrepBuddy result (solution analysis). The answer key is not included.', 8.5, 'italic', MUTED, 0, 4)

  const byId = new Map(paper.questions.map((q) => [q.id, q]))
  const shownSets = new Set<string>()
  section.questionIds.forEach((id, i) => {
    const q = byId.get(id) as MockQuestion
    if (q.setId && !shownSets.has(q.setId)) {
      shownSets.add(q.setId)
      ensure(24)
      stroke(doc, LINE)
      doc.setLineWidth(0.2)
      doc.line(M, f.y - 2, M + TW, f.y - 2)
      f.y += 2
      para('Common data / passage for the following question(s):', 8.5, 'bold', INK, 0, 0.5)
      drawStimulus(paper.sets[q.setId])
    }
    ensure(34)
    para(`Q${i + 1}. ${q.stem}`, 9.5, 'bold', INK, 0, 1)
    q.options.forEach((o, oi) => para(`${OPTION_LETTERS[oi]}. ${o}`, 9, 'normal', [51, 65, 85], 4, 0.4))
    f.y += 3.5
  })

  pageFooter(doc, label)
  return doc
}
