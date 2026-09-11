export interface WordLookupResult {
  meaning: string
  example: string
  hint: string
  partOfSpeech: string
}

const POS_ABBREVIATIONS: Record<string, string> = {
  noun: 'n',
  verb: 'v',
  adjective: 'adj',
  adverb: 'adv',
  'proper noun': 'n',
  conjunction: 'conj',
  preposition: 'prep',
  pronoun: 'pron',
  interjection: 'interj',
  determiner: 'det',
  numeral: 'num',
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
  // Wiktionary sometimes embeds TemplateStyles <style> blocks (e.g. for "(dated)" qualifiers)
  // inside the definition/example markup. textContent walks into them since a <style>
  // element's content model is text, so its CSS would otherwise leak into the plain text.
  div.querySelectorAll('style, script').forEach((el) => el.remove())
  return (div.textContent ?? '').replace(/\s+/g, ' ').trim()
}

async function fetchDefinitionEntries(phrase: string): Promise<WiktionaryEntry[] | null> {
  let res: Response
  try {
    res = await fetch(`https://en.wiktionary.org/api/rest_v1/page/definition/${encodeURIComponent(phrase)}`)
  } catch {
    throw new Error('Could not reach the dictionary service. Check your connection and try again.')
  }

  if (res.status === 404) return null
  if (!res.ok) {
    throw new Error('Something went wrong looking up that word. Please try again.')
  }

  const data = (await res.json()) as WiktionaryResponse
  return data.en ?? null
}

/**
 * Looks up a word or phrase via Wiktionary's free, keyless REST API (CORS-enabled for
 * browser use, unlike most other free dictionary APIs) and picks the best definition +
 * example.
 */
export async function lookupWord(word: string): Promise<WordLookupResult> {
  const cleaned = word.trim().toLowerCase()
  let entries = await fetchDefinitionEntries(cleaned)

  // Wiktionary often titles idiom pages without a leading article (e.g. "blessing in
  // disguise" rather than "a blessing in disguise"), so retry without one before giving up.
  if (!entries) {
    const withoutArticle = cleaned.replace(/^(a|an|the)\s+/, '')
    if (withoutArticle !== cleaned) {
      entries = await fetchDefinitionEntries(withoutArticle)
    }
  }

  if (!entries || entries.length === 0) {
    throw new Error(`No definition found for "${word}". Check the spelling and try again.`)
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
  const example = chosenDef.examples?.[0] ? stripHtml(chosenDef.examples[0]) : ''
  const hint = `Part of speech: ${chosenPos.toLowerCase()}`
  const partOfSpeech = POS_ABBREVIATIONS[chosenPos.toLowerCase()] ?? ''

  return { meaning, example, hint, partOfSpeech }
}
