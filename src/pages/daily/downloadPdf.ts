import type { MockPaper } from '../../lib/mocks/types'

/** Builds the Daily Dose PDF (questions, then answer key and solutions) and saves it. The PDF code loads on demand. */
export async function downloadDailyPdf(paper: MockPaper): Promise<void> {
  const { buildDailyPaperPdf, dailyPdfFileName } = await import('../../lib/daily/pdf')
  buildDailyPaperPdf(paper).save(dailyPdfFileName(paper))
}
