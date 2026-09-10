export interface WordLookupResult {
  meaning: string
  example: string
  hint: string
}

interface WiktionaryDefinition {
  definition: string
  examples?: string[]
}

interface WiktionaryEntry {
  partOfSpeech: string
  definitions: WiktionaryDefinition[]
}

interface WiktionaryResponse {
  en?: WiktionaryEntry[]
}

/** Strips HTML tags/entities from Wiktionary's markup, returning plain text. */
function stripHtml(html: string): string {
  const div = document.createElement('div')
  div.innerHTML = html
  return (div.textContent ?? '').replace(/\s+/g, ' ').trim()
}

/**
 * Looks up a word via Wiktionary's free, keyless REST API (CORS-enabled for browser use,
 * unlike most other free dictionary APIs) and picks the best definition + example.
 */
export async function lookupWord(word: string): Promise<WordLookupResult> {
  const cleaned = word.trim().toLowerCase()
  let res: Response
  try {
    res = await fetch(`https://en.wiktionary.org/api/rest_v1/page/definition/${encodeURIComponent(cleaned)}`)
  } catch {
    throw new Error('Could not reach the dictionary service. Check your connection and try again.')
  }

  if (!res.ok) {
    if (res.status === 404) {
      throw new Error(`No definition found for "${word}". Check the spelling and try again.`)
    }
    throw new Error('Something went wrong looking up that word. Please try again.')
  }

  const data = (await res.json()) as WiktionaryResponse
  const entries = data.en
  if (!entries || entries.length === 0) {
    throw new Error(`No English definition found for "${word}".`)
  }

  // Prefer a definition that already has an example sentence; fall back to the first definition.
  let chosenDef: WiktionaryDefinition | undefined
  let chosenPos = ''

  outer: for (const entry of entries) {
    for (const d of entry.definitions) {
      if (d.examples && d.examples.length > 0) {
        chosenDef = d
        chosenPos = entry.partOfSpeech
        break outer
      }
    }
  }
  if (!chosenDef) {
    const entry = entries[0]
    chosenDef = entry.definitions[0]
    chosenPos = entry.partOfSpeech
  }
  if (!chosenDef) {
    throw new Error(`No definition found for "${word}".`)
  }

  const meaning = stripHtml(chosenDef.definition)
  const example = chosenDef.examples?.[0] ? stripHtml(chosenDef.examples[0]) : `Try using "${word}" in a sentence of your own.`
  const hint = `Part of speech: ${chosenPos.toLowerCase()}`

  return { meaning, example, hint }
}
