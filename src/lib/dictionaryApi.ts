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

interface GeminiLookupResponse {
  meaning?: string
  example?: string
  partOfSpeech?: string
  error?: string
}

/**
 * Looks up a word/idiom/phrase via a Gemini-backed serverless function (api/lookup.js).
 * Unlike Wiktionary — which only matches exact page titles and often lacks an example for a
 * given sense — Gemini reliably returns both a meaning and a natural example together, so
 * this is tried first. Returns null (rather than throwing) on any failure — missing API key,
 * network error, malformed response — so the caller can fall through to Wiktionary.
 */
async function fetchFromGemini(word: string): Promise<WordLookupResult | null> {
  let data: GeminiLookupResponse
  try {
    const res = await fetch(`/api/lookup?term=${encodeURIComponent(word)}`)
    if (!res.ok) return null
    data = (await res.json()) as GeminiLookupResponse
  } catch {
    // Covers network failures and non-JSON responses — e.g. in local `vite dev`, this route
    // isn't a real serverless function, so it 200s with the file's raw source instead of JSON.
    return null
  }
  if (data.error || !data.meaning || !data.example) return null

  const chosenPos = (data.partOfSpeech ?? '').toLowerCase()
  return {
    meaning: data.meaning,
    example: data.example,
    hint: chosenPos ? `Part of speech: ${chosenPos}` : '',
    partOfSpeech: POS_ABBREVIATIONS[chosenPos] ?? '',
  }
}

/**
 * Looks up a word, idiom, or phrase for the "Add" flow of every bank (Vocabulary, Idioms,
 * One Word Substitution, Phrasal Verbs, and the word half of Synonyms/Antonyms). Tries
 * Gemini first (api/lookup.js) since it consistently returns both a meaning and an example;
 * falls back to Wiktionary's free, keyless REST API only if Gemini is unavailable (no API
 * key configured, network error) or genuinely can't find the phrase.
 */
export async function lookupWord(word: string): Promise<WordLookupResult> {
  const fromGemini = await fetchFromGemini(word)
  if (fromGemini) return fromGemini

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
