import { getIdToken } from '../auth'
import { collectionForKey, keyForCollection, parseCollection, serializeCollection, type Entries } from './collections'

/**
 * Keeps a signed-in person's saved progress (favourites in every bank, learned words, game history and best scores,
 * grammar mastery, revise stats — see collections.ts) in step with the server, so it follows them from device to device.
 * The browser's own copy stays the one every screen reads, so everything works signed out and offline; this module only
 * mirrors it, and it needs no changes in the screens that save the data.
 *
 * How it works:
 * - After anything writes to a synced localStorage key (a hook on localStorage, see installStorageWatcher), a few seconds
 *   later the key is compared with a "shadow" copy of what was last captured. Each new/changed entry becomes an unsent change
 *   stamped with its version (when it changed) and each missing entry becomes a deletion marker. Unsent changes live in
 *   localStorage, so a refresh or being offline loses nothing; they are sent in batches (and when the tab is hidden).
 * - When someone opens the site signed in, one "full" sync sends what is unsent and brings back everything the server has.
 *   Per entry, the newer version wins; entries only the server has are written into localStorage.
 * - The first time an account signs in on a browser the shadow is empty, so EVERYTHING already stored there (from before
 *   accounts existed) is captured and merged into the account. If a different account signs in on the same browser, the
 *   first account's local copy is cleared (it is safe on the server) rather than mixed into the second.
 */

const STATE_KEY = 'prepbuddy:usersync:state'
const PULLED_KEY = 'prepbuddy:usersync:pulled'
const FLUSH_DELAY_MS = 5000
const RETRY_MIN_MS = 60_000
const RETRY_MAX_MS = 15 * 60_000
const KEEPALIVE_MAX_BYTES = 60_000
const REPULL_AFTER_MS = 5 * 60_000
const BATCH = 400
const ENDPOINT = '/api/qb?action=usersync'

/** field -> [version, hash of the JSON that was captured] */
type Shadow = Record<string, [number, string]>

interface State {
  /** The account this browser's copy belongs to; null until someone signs in. */
  owner: string | null
  shadow: Shadow
  /** field -> "<version>:<json>" ("<version>:null" is a deletion), changes not yet confirmed by the server. */
  pending: Record<string, string>
  lastPull: number
}

const emptyState = (owner: string | null = null): State => ({ owner, shadow: {}, pending: {}, lastPull: 0 })

export interface SyncStorage {
  readonly length: number
  key(index: number): string | null
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export interface Applied {
  /** True for the first full sync of this tab session (the screens already on display were built from the old local copy). */
  initial: boolean
  /** How many entries were written to or removed from localStorage. */
  changed: number
}

export interface SyncDeps {
  storage: SyncStorage
  session?: Pick<SyncStorage, 'getItem' | 'setItem'>
  fetch: typeof fetch
  getToken: (forceRefresh?: boolean) => Promise<string | null>
  now?: () => number
  onApplied?: (applied: Applied) => void
  /** Timers are skipped in tests, which call syncNow() themselves. */
  timers?: boolean
}

export interface UserDataSync {
  setUser(uid: string | null): Promise<void>
  /** Tell the engine a localStorage key was written or removed. */
  notifyKeyChanged(key: string | null): void
  /** Capture local changes now (normally done a few seconds after a write). */
  scan(): void
  /** One sync attempt; resolves true on success. A full sync also pulls everything from the server. */
  syncNow(full: boolean): Promise<boolean>
  pendingCount(): number
}

function hash(text: string): string {
  let h = 5381
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0
  return `${(h >>> 0).toString(36)}.${text.length}`
}

function splitField(field: string): { collection: string; id: string } | null {
  const cut = field.indexOf('|')
  return cut > 0 ? { collection: field.slice(0, cut), id: field.slice(cut + 1) } : null
}

function splitValue(value: string): { version: number; json: string } | null {
  const cut = value.indexOf(':')
  const version = Number(value.slice(0, cut))
  return cut > 0 && Number.isFinite(version) ? { version, json: value.slice(cut + 1) } : null
}

export function createUserDataSync(deps: SyncDeps): UserDataSync {
  const { storage, session, getToken } = deps
  const now = deps.now ?? (() => Date.now())
  const useTimers = deps.timers !== false

  let currentUid: string | null = null
  let flushTimer: ReturnType<typeof setTimeout> | null = null
  let retryTimer: ReturnType<typeof setTimeout> | null = null
  let retryDelay = RETRY_MIN_MS
  let running = false
  let rerun: { full: boolean } | null = null
  let applying = false

  /* ---------------------------------------------------------------- state */

  function readState(): State {
    try {
      const raw = storage.getItem(STATE_KEY)
      if (raw) {
        const p = JSON.parse(raw) as Partial<State>
        return {
          owner: typeof p.owner === 'string' ? p.owner : null,
          shadow: p.shadow && typeof p.shadow === 'object' ? p.shadow : {},
          pending: p.pending && typeof p.pending === 'object' ? p.pending : {},
          lastPull: typeof p.lastPull === 'number' ? p.lastPull : 0,
        }
      }
    } catch {
      /* fall through to a fresh state */
    }
    return emptyState()
  }

  function writeState(state: State) {
    try {
      storage.setItem(STATE_KEY, JSON.stringify(state))
    } catch {
      /* storage unavailable or full: syncing still works for this visit */
    }
  }

  function allSyncedKeys(): string[] {
    const keys: string[] = []
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i)
      if (key && collectionForKey(key)) keys.push(key)
    }
    return keys
  }

  /* ----------------------------------------------------------- capturing */

  /** Compares every synced key with the shadow and records what changed as unsent changes. Returns how many. */
  function scanState(state: State): number {
    // collections currently held locally, entry by entry; `unreadable` ones are left alone
    const local = new Map<string, Entries>()
    const unreadable = new Set<string>()
    const collections = new Set<string>()
    for (const key of allSyncedKeys()) collections.add(collectionForKey(key) as string)
    // collections that were captured before but whose key may be gone now (so their entries were deleted)
    for (const field of Object.keys(state.shadow)) {
      const f = splitField(field)
      if (f) collections.add(f.collection)
    }
    for (const collection of collections) {
      const key = keyForCollection(collection)
      if (!key) continue
      const entries = parseCollection(collection, storage.getItem(key))
      if (entries === null) unreadable.add(collection)
      else local.set(collection, entries)
    }

    let changes = 0
    const t = now()
    for (const [collection, entries] of local) {
      for (const [id, entry] of entries) {
        const field = `${collection}|${id}`
        const json = JSON.stringify(entry.value)
        const h = hash(json)
        const known = state.shadow[field]
        if (known && known[1] === h) continue
        const pendingVersion = state.pending[field] ? (splitValue(state.pending[field])?.version ?? 0) : 0
        const floor = Math.max(known ? known[0] : 0, pendingVersion)
        // a best score's version IS the score; every other entry must be newer than whatever was captured before
        const version = collection.startsWith('best:') ? entry.version : Math.max(entry.version, floor + 1)
        state.pending[field] = `${version}:${json}`
        state.shadow[field] = [version, h]
        changes++
      }
    }
    // entries captured before but gone now were deleted locally
    for (const field of Object.keys(state.shadow)) {
      const f = splitField(field)
      if (!f || unreadable.has(f.collection)) continue
      const entries = local.get(f.collection)
      if (!entries || entries.has(f.id)) continue
      if (f.collection.startsWith('best:')) {
        delete state.shadow[field] // a score is never "deleted"
        continue
      }
      const pendingVersion = state.pending[field] ? (splitValue(state.pending[field])?.version ?? 0) : 0
      state.pending[field] = `${Math.max(t, state.shadow[field][0] + 1, pendingVersion + 1)}:null`
      delete state.shadow[field]
      changes++
    }
    return changes
  }

  function scan() {
    const state = readState()
    if (state.owner === null) return
    if (scanState(state) > 0) writeState(state)
  }

  /* ------------------------------------------------------------- applying */

  /** Writes the server's newer entries into localStorage. Returns how many local entries changed. */
  function applyRemote(remote: Record<string, string>): number {
    // anything changed while the request was in flight is captured first, so it is compared fairly with the reply
    const state = readState()
    scanState(state)

    const changes = new Map<string, Map<string, { version: number; json: string }>>()
    for (const [field, raw] of Object.entries(remote)) {
      const f = splitField(field)
      const v = splitValue(raw)
      if (!f || !v || !keyForCollection(f.collection)) continue
      const known = state.shadow[field]
      const pendingVersion = state.pending[field] ? (splitValue(state.pending[field])?.version ?? 0) : 0
      const localVersion = Math.max(known ? known[0] : -1, pendingVersion)
      if (!(v.version > localVersion)) continue
      if (v.json === 'null' && !known && !pendingVersion) continue // a deletion of something this browser never had
      if (v.json !== 'null' && known && !pendingVersion && known[1] === hash(v.json)) {
        state.shadow[field] = [v.version, known[1]] // the same content, just stamped later elsewhere: nothing to write
        continue
      }
      let byId = changes.get(f.collection)
      if (!byId) changes.set(f.collection, (byId = new Map()))
      byId.set(f.id, v)
    }

    let changed = 0
    applying = true
    try {
      for (const [collection, byId] of changes) {
        const key = keyForCollection(collection) as string
        const currentRaw = storage.getItem(key)
        const entries = parseCollection(collection, currentRaw)
        if (entries === null) continue // unreadable locally: leave it alone
        for (const [id, v] of byId) {
          if (v.json === 'null') {
            if (entries.delete(id)) changed++
            continue
          }
          try {
            entries.set(id, { value: JSON.parse(v.json), version: v.version })
            changed++
          } catch {
            /* skip an entry that does not parse */
          }
        }
        const nextRaw = serializeCollection(collection, entries, currentRaw)
        if (nextRaw !== currentRaw) {
          if (nextRaw === null) storage.removeItem(key)
          else storage.setItem(key, nextRaw)
        }
        // the shadow now matches what is stored; a remote entry beats any older unsent change to it
        const actual = parseCollection(collection, storage.getItem(key)) ?? new Map()
        for (const field of Object.keys(state.shadow)) {
          const f = splitField(field)
          if (f && f.collection === collection && !actual.has(f.id)) delete state.shadow[field]
        }
        for (const [id, v] of byId) {
          const field = `${collection}|${id}`
          delete state.pending[field]
          const entry = actual.get(id)
          if (v.json !== 'null' && entry) state.shadow[field] = [v.version, hash(JSON.stringify(entry.value))]
          else delete state.shadow[field]
        }
      }
    } finally {
      applying = false
    }
    writeState(state)
    return changed
  }

  /* -------------------------------------------------------------- network */

  async function post(token: string, payload: object, keepalive: boolean): Promise<Response> {
    const body = JSON.stringify(payload)
    return deps.fetch(ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body,
      keepalive: keepalive && body.length < KEEPALIVE_MAX_BYTES,
    })
  }

  async function send(payload: object, keepalive: boolean): Promise<{ fields?: Record<string, string> }> {
    let token = await getToken()
    if (!token) throw new Error('not signed in')
    let res = await post(token, payload, keepalive)
    if (res.status === 401) {
      token = await getToken(true)
      if (!token) throw new Error('not signed in')
      res = await post(token, payload, keepalive)
    }
    if (!res.ok) throw new Error(`sync failed (${res.status})`)
    return (await res.json()) as { fields?: Record<string, string> }
  }

  async function attempt(full: boolean, keepalive: boolean) {
    const uid = currentUid
    if (!uid) return
    scan()
    const start = readState()
    if (start.owner !== uid) return
    const entries = Object.entries(start.pending)
    if (!full && entries.length === 0) return

    const batches: [string, string][][] = []
    for (let i = 0; i < entries.length; i += BATCH) batches.push(entries.slice(i, i + BATCH))
    if (batches.length === 0) batches.push([])

    let reply: { fields?: Record<string, string> } = {}
    for (let i = 0; i < batches.length; i++) {
      const last = i === batches.length - 1
      const batch = batches[i]
      reply = await send({ full: full && last, set: Object.fromEntries(batch) }, keepalive)
      // forget what was saved, keeping anything changed again while the request was in flight
      const after = readState()
      if (after.owner !== uid) return
      for (const [field, value] of batch) if (after.pending[field] === value) delete after.pending[field]
      writeState(after)
    }

    if (full && reply.fields) {
      const changed = applyRemote(reply.fields)
      const after = readState()
      after.lastPull = now()
      writeState(after)
      let initial = false
      try {
        initial = session ? session.getItem(PULLED_KEY) !== uid : false
        session?.setItem(PULLED_KEY, uid)
      } catch {
        /* ignore */
      }
      deps.onApplied?.({ initial, changed })
    }
  }

  function clearTimers() {
    if (flushTimer) clearTimeout(flushTimer)
    if (retryTimer) clearTimeout(retryTimer)
    flushTimer = retryTimer = null
  }

  async function run(full: boolean, keepalive = false): Promise<boolean> {
    if (running) {
      rerun = { full: full || !!rerun?.full }
      return true
    }
    running = true
    let ok = true
    try {
      await attempt(full, keepalive)
      retryDelay = RETRY_MIN_MS
    } catch {
      // Offline, server unavailable or sync not set up: nothing is lost, it stays unsent and is retried.
      ok = false
      if (useTimers && currentUid && !retryTimer) {
        retryTimer = setTimeout(() => {
          retryTimer = null
          void run(full)
        }, retryDelay)
        retryDelay = Math.min(retryDelay * 2, RETRY_MAX_MS)
      }
    } finally {
      running = false
      const next = rerun
      rerun = null
      if (next) void run(next.full, keepalive)
    }
    return ok
  }

  function scheduleFlush() {
    if (!useTimers || flushTimer) return
    flushTimer = setTimeout(() => {
      flushTimer = null
      void run(false)
    }, FLUSH_DELAY_MS)
  }

  /* ------------------------------------------------------------------ API */

  return {
    notifyKeyChanged(key) {
      if (applying || !collectionForKey(key)) return
      if (readState().owner === null) return // before anyone signs in, the whole local copy is captured at first sign-in
      if (currentUid) scheduleFlush()
      else scan() // signed out after having had an account: keep recording, so it is sent when they sign back in
    },

    scan,

    async syncNow(full) {
      return run(full)
    },

    pendingCount: () => Object.keys(readState().pending).length,

    async setUser(uid) {
      currentUid = uid
      clearTimers()
      if (!uid) return

      let state = readState()
      let full = false
      if (state.owner === null) {
        // First account on this browser: everything stored here from before accounts becomes this account's (the empty shadow
        // makes the scan below capture all of it).
        state = emptyState(uid)
        writeState(state)
        full = true
      } else if (state.owner !== uid) {
        // A different account used this browser before: its copy is safe on the server, so clear it rather than mix the two.
        applying = true
        try {
          for (const key of allSyncedKeys()) storage.removeItem(key)
        } finally {
          applying = false
        }
        state = emptyState(uid)
        writeState(state)
        full = true
        deps.onApplied?.({ initial: true, changed: 1 })
      }
      scan()
      if (!full) {
        try {
          const pulledThisSession = session ? session.getItem(PULLED_KEY) === uid : false
          full = !pulledThisSession || now() - readState().lastPull > REPULL_AFTER_MS
        } catch {
          full = true
        }
      }
      await run(full)
    },
  }
}

/* ---------------------------------------------------------------------------- browser wiring */

/**
 * Calls `onKey` whenever this page writes to or removes from localStorage (the page's own setItem / removeItem / clear).
 * The sync uses it to notice changes without every screen having to tell it.
 */
export function installStorageWatcher(onKey: (key: string | null) => void) {
  const proto = Storage.prototype
  const { setItem, removeItem, clear } = proto
  const isLocal = (s: Storage) => {
    try {
      return s === window.localStorage
    } catch {
      return false
    }
  }
  proto.setItem = function (this: Storage, key: string, value: string) {
    setItem.call(this, key, value)
    if (isLocal(this)) onKey(key)
  }
  proto.removeItem = function (this: Storage, key: string) {
    removeItem.call(this, key)
    if (isLocal(this)) onKey(key)
  }
  proto.clear = function (this: Storage) {
    clear.call(this)
    if (isLocal(this)) onKey(null)
  }
}

let singleton: UserDataSync | null = null
let appliedListeners: ((applied: Applied) => void)[] = []

/** Subscribe to "the server's data was written into localStorage" (so screens can re-read it). Returns an unsubscribe. */
export function onUserDataApplied(listener: (applied: Applied) => void): () => void {
  appliedListeners.push(listener)
  return () => {
    appliedListeners = appliedListeners.filter((l) => l !== listener)
  }
}

function browserSync(): UserDataSync {
  if (!singleton) {
    singleton = createUserDataSync({
      storage: window.localStorage,
      session: window.sessionStorage,
      fetch: (input, init) => window.fetch(input, init),
      getToken: getIdToken,
      onApplied: (applied) => appliedListeners.forEach((l) => l(applied)),
    })
    const sync = singleton
    installStorageWatcher((key) => sync.notifyKeyChanged(key))
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        sync.scan()
        void sync.syncNow(false)
      } else {
        void sync.setUser(currentBrowserUid) // pulls again if it has been a while since the last pull
      }
    })
    window.addEventListener('online', () => void sync.syncNow(false))
  }
  return singleton
}

let currentBrowserUid: string | null = null

/** Tell the sync who is signed in (null when nobody is). Call whenever that changes. */
export async function syncUserData(uid: string | null) {
  if (typeof window === 'undefined') return
  currentBrowserUid = uid
  await browserSync().setUser(uid)
}
