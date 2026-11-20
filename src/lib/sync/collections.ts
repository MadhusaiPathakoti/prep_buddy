// What gets synced across a signed-in user's devices, and how each kind of local data maps to entries.
//
// Each synced localStorage key is one "collection" (a name the server understands, see api/_lib/userSync.js) made of
// entries { id -> value, version }. The version is when the entry last changed (or, for best scores, the score itself), and
// the newer version wins when two devices disagree. Not synced on purpose: caches (pronunciations, generated papers),
// unfinished-quiz drafts, per-device settings (theme) and full mock/daily-exam attempts (large). The question bank's own
// stars and answers have their own older sync (src/lib/qbank/sync.ts).
//
//   key                                    collection            entries
//   prepbuddy:favorites:<bank>             fav:<bank>            word id -> ISO time starred ('' when saved before dates were tracked)
//   prepbuddy:<bank>:learn                 learn:<bank>          word number -> ISO time marked learned
//   prepbuddy:<game>:history               hist:<game>           session date -> the session record (newest 30 kept)
//   prepbuddy:<game>:best:<seconds>        best:<game>-<seconds> 'v' -> best score (the highest wins)
//   prepbuddy:mnemonic:stats               stats:mnemonic        word number -> revise stats
//   prepbuddy:grammar-rules:progress       grammar:rules         rule number -> mastery box / due date

export interface Entry {
  /** A JSON-able value (never null: a deleted entry simply is not in the map). */
  value: unknown
  /** Milliseconds the entry last changed; for best scores, the score. */
  version: number
}

export type Entries = Map<string, Entry>

/** Games keep this many sessions (see lib/storage.ts); a merged history is cut to the same size. */
export const HISTORY_CAP = 30

const ID_OK = /^[A-Za-z0-9._:-]{1,128}$/
const FAV_KEY = /^prepbuddy:favorites:([a-z0-9-]{1,60})$/
const LEARN_KEY = /^prepbuddy:([a-z0-9-]{1,60}):learn$/
const HIST_KEY = /^prepbuddy:([a-z0-9-]{1,60}):history$/
const BEST_KEY = /^prepbuddy:([a-z0-9-]{1,50}):best:(\d{1,6})$/
const STATS_KEY = 'prepbuddy:mnemonic:stats'
const GRAMMAR_KEY = 'prepbuddy:grammar-rules:progress'
/** Banks whose favourites have their own sync. */
const OWN_SYNC_BANKS = new Set(['quant-bank'])

/** The collection a localStorage key belongs to, or null when that key is not synced. */
export function collectionForKey(key: string | null): string | null {
  if (!key) return null
  let m = FAV_KEY.exec(key)
  if (m) return OWN_SYNC_BANKS.has(m[1]) ? null : `fav:${m[1]}`
  if (key === STATS_KEY) return 'stats:mnemonic'
  if (key === GRAMMAR_KEY) return 'grammar:rules'
  if ((m = BEST_KEY.exec(key))) return `best:${m[1]}-${m[2]}`
  if ((m = HIST_KEY.exec(key))) return `hist:${m[1]}`
  if ((m = LEARN_KEY.exec(key))) return `learn:${m[1]}`
  return null
}

/** The localStorage key for a collection (the inverse of collectionForKey), or null for a collection this build does not know. */
export function keyForCollection(collection: string): string | null {
  const cut = collection.indexOf(':')
  if (cut < 1) return null
  const kind = collection.slice(0, cut)
  const rest = collection.slice(cut + 1)
  if (kind === 'fav' && /^[a-z0-9-]{1,60}$/.test(rest) && !OWN_SYNC_BANKS.has(rest)) return `prepbuddy:favorites:${rest}`
  if (kind === 'learn' && /^[a-z0-9-]{1,60}$/.test(rest)) return `prepbuddy:${rest}:learn`
  if (kind === 'hist' && /^[a-z0-9-]{1,60}$/.test(rest)) return `prepbuddy:${rest}:history`
  if (kind === 'stats' && rest === 'mnemonic') return STATS_KEY
  if (kind === 'grammar' && rest === 'rules') return GRAMMAR_KEY
  if (kind === 'best') {
    const m = /^([a-z0-9-]{1,50})-(\d{1,6})$/.exec(rest)
    if (m) return `prepbuddy:${m[1]}:best:${m[2]}`
  }
  return null
}

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

function parseJson(raw: string): unknown {
  return JSON.parse(raw)
}

function ms(iso: unknown): number {
  const t = typeof iso === 'string' ? Date.parse(iso) : NaN
  return Number.isFinite(t) && t > 0 ? t : 1
}

/**
 * The entries stored under a collection's key. Null when the stored text cannot be understood: the caller must then leave
 * that key alone (treating it as "everything was deleted" would wipe it from the server). A missing key is just empty.
 */
export function parseCollection(collection: string, raw: string | null): Entries | null {
  const out: Entries = new Map()
  if (raw === null) return out
  const kind = collection.slice(0, collection.indexOf(':'))
  try {
    if (kind === 'best') {
      const score = Math.floor(Number(raw))
      if (Number.isFinite(score) && score > 0) out.set('v', { value: score, version: score })
      return out
    }
    const data = parseJson(raw)
    if (kind === 'fav') {
      // saved as { id: ISO | null }; the oldest format was a plain list of ids (undated)
      const pairs: [string, unknown][] = Array.isArray(data) ? data.map((id) => [String(id), null]) : isObject(data) ? Object.entries(data) : []
      for (const [id, at] of pairs) if (ID_OK.test(id)) out.set(id, { value: typeof at === 'string' ? at : '', version: ms(at) })
    } else if (kind === 'learn') {
      const learned = isObject(data) && isObject(data.learned) ? data.learned : {}
      for (const [n, at] of Object.entries(learned)) if (ID_OK.test(n) && typeof at === 'string') out.set(n, { value: at, version: ms(at) })
    } else if (kind === 'hist') {
      if (!Array.isArray(data)) return out
      for (const rec of data) {
        if (isObject(rec) && typeof rec.date === 'string' && ID_OK.test(rec.date)) out.set(rec.date, { value: rec, version: ms(rec.date) })
      }
    } else if (kind === 'stats') {
      if (!isObject(data)) return out
      for (const [n, s] of Object.entries(data)) if (ID_OK.test(n) && isObject(s)) out.set(n, { value: s, version: ms(s.at) })
    } else if (kind === 'grammar') {
      if (!isObject(data)) return out
      for (const [id, p] of Object.entries(data)) {
        if (!ID_OK.test(id) || !isObject(p)) continue
        out.set(id, { value: p, version: typeof p.lastSeen === 'number' && p.lastSeen > 0 ? Math.floor(p.lastSeen) : 1 })
      }
    }
    return out
  } catch {
    return null
  }
}

/**
 * The text to store for a collection after merging: `entries` replace the synced entries, anything else already stored
 * (e.g. an entry with an id the server would refuse, a setting kept in the same key) is left as it was.
 * Returns null when the key should not exist at all.
 */
export function serializeCollection(collection: string, entries: Entries, currentRaw: string | null): string | null {
  const kind = collection.slice(0, collection.indexOf(':'))
  let current: unknown = null
  if (currentRaw !== null) {
    try {
      current = parseJson(currentRaw)
    } catch {
      current = null
    }
  }

  if (kind === 'best') {
    const remote = entries.get('v')
    const local = Math.floor(Number(currentRaw))
    const best = Math.max(Number.isFinite(local) ? local : 0, typeof remote?.value === 'number' ? remote.value : 0)
    return best > 0 ? String(best) : null
  }

  if (kind === 'fav') {
    const obj: Record<string, string | null> = {}
    if (Array.isArray(current)) for (const id of current) obj[String(id)] = null
    else if (isObject(current)) for (const [id, at] of Object.entries(current)) obj[id] = typeof at === 'string' ? at : null
    for (const id of Object.keys(obj)) if (ID_OK.test(id) && !entries.has(id)) delete obj[id]
    for (const [id, e] of entries) obj[id] = typeof e.value === 'string' && e.value ? e.value : null
    return Object.keys(obj).length === 0 && currentRaw === null ? null : JSON.stringify(obj)
  }

  if (kind === 'learn') {
    const base = isObject(current) ? { ...current } : {}
    const learned: Record<string, unknown> = isObject(base.learned) ? { ...base.learned } : {}
    for (const n of Object.keys(learned)) if (ID_OK.test(n) && !entries.has(n)) delete learned[n]
    for (const [n, e] of entries) learned[n] = e.value
    if (Object.keys(learned).length === 0 && currentRaw === null) return null
    return JSON.stringify({ ...base, learned })
  }

  if (kind === 'hist') {
    const records = [...entries.values()].map((e) => e.value as { date: string })
    records.sort((a, b) => b.date.localeCompare(a.date))
    // entries with an id the server would refuse are not synced, so they cannot be in `entries`: keep them too
    const kept = Array.isArray(current) ? current.filter((r) => !(isObject(r) && typeof r.date === 'string' && ID_OK.test(r.date))) : []
    const all = [...records, ...kept].slice(0, HISTORY_CAP)
    return all.length === 0 && currentRaw === null ? null : JSON.stringify(all)
  }

  // stats / grammar: a plain { id: object } map
  const obj: Record<string, unknown> = isObject(current) ? { ...current } : {}
  for (const id of Object.keys(obj)) if (ID_OK.test(id) && !entries.has(id)) delete obj[id]
  for (const [id, e] of entries) obj[id] = e.value
  return Object.keys(obj).length === 0 && currentRaw === null ? null : JSON.stringify(obj)
}
