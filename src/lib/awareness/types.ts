/** Colour themes a chapter can use (mapped to Tailwind classes in theme.ts). */
export const CA_THEMES = ['indigo', 'sky', 'emerald', 'amber', 'rose', 'violet', 'teal', 'orange', 'fuchsia', 'cyan', 'lime', 'slate'] as const
export type CaTheme = (typeof CA_THEMES)[number]

/** Static facts about a chapter, known without loading its content. */
export interface CaChapterMeta {
  id: string
  number: number
  title: string
  tagline: string
  icon: string
  theme: CaTheme
}

export type CalloutKind = 'remember' | 'trap' | 'tip' | 'fact'
export type FigureKind = 'flow' | 'layers' | 'pyramid' | 'cycle'

/** One piece of a book section. Text fields may contain **bold** spans. */
export type CaBlock =
  | { type: 'text'; text: string }
  | { type: 'bullets'; title?: string; items: string[] }
  | { type: 'keyvalue'; title?: string; rows: [string, string][] }
  | { type: 'table'; title?: string; headers: string[]; rows: string[][] }
  | { type: 'steps'; title?: string; items: string[] }
  | { type: 'timeline'; title?: string; items: [string, string][] }
  | { type: 'callout'; kind: CalloutKind; title?: string; text: string }
  | { type: 'figure'; kind: FigureKind; title: string; items: [string, string?][] }
  /** A memory aid: `phrase` is the mnemonic; `letters` spell out what each letter / part stands for. */
  | { type: 'mnemonic'; title: string; phrase: string; letters?: [string, string][]; note?: string }

export interface CaSection {
  id: string
  title: string
  icon: string
  blocks: CaBlock[]
}

export interface CaMindmap {
  center: string
  branches: { label: string; children: string[] }[]
}

/** The book content of one chapter. */
export interface CaChapter {
  id: string
  sections: CaSection[]
  /** One-line facts for the "quick revision" box at the end of the chapter. */
  revision: string[]
  mindmap: CaMindmap
}

export interface CaQuestion {
  /** Globally unique, e.g. "computer-hardware-07". Only letters, digits and hyphens (it is also the favourites key). */
  id: string
  q: string
  options: [string, string, string, string]
  /** Index (0-3) of the correct option. */
  answer: number
  explain: string
  /** Id of the book section this question comes from. */
  section: string
  /** Exam and year it was asked in, when known (e.g. "SBI PO 2019"). */
  exam?: string
}

/** A question with its chapter attached, as the bank and the quiz use it. */
export interface CaBankQuestion extends CaQuestion {
  chapterId: string
  chapterTitle: string
}
