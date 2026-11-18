import { getIdToken } from '../auth'
import { getFavouriteMap, getProgress, MAX_PROGRESS, replaceUserData, setChangeListener } from './userData'
import type { PlayRecord, UserDataChange } from './userData'

/**
 * Keeps a signed-in person's starred questions and recently played answers in step with the server (Redis), so
 * they follow them from device to device. The browser's own copy stays the one the screens read, so everything
 * works signed out and offline too; this module only mirrors it.
 *
 * - Every change is added to a small "not yet saved" list kept in localStorage, so nothing is lost on a refresh
 *   or while offline, and is sent a few seconds later in one batch (and when the tab is hidden).
 * - When someone opens the site signed in, one "full" sync sends anything unsaved and brings back the merged lists.
 * - The first time an account signs in on a browser, everything already stored there (from before accounts) is
 *   merged into the account. If a different account signs in on the same browser, the first account's local copy
 *   is cleared (it is safe on the server) rather than mixed into the second.
 */

const STATE_KEY = 'prepbuddy:qbank:sync'
/** sessionStorage: which user this tab session has already pulled from the server, so a refresh does not pull again. */
const PULLED_KEY = 'prepbuddy:qbank:pulled'
const FLUSH_DELAY_MS = 6000
const RETRY_MIN_MS = 60_000
const RETRY_MAX_MS = 15 * 60_000
const KEEPALIVE_MAX_BYTES = 60_000

interface Pending {
  favAdd: Record<string, string>
  favRemove: string[]
  prog: Record<string, PlayRecord>
}

interface SyncState {
  /** The account whose data this browser's copy belongs to; null until someone signs in. */
  owner: string | null
  pending: Pending
}

const emptyPending = (): Pending => ({ favAdd: {}, favRemove: [], prog: {} })
const isEmpty = (p: Pending) => !Object.keys(p.favAdd).length && !p.favRemove.length && !Object.keys(p.prog).length

function readState(): SyncState {
  try {
    const raw = localStorage.getItem(STATE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<SyncState>
      const p = parsed.pending
      return {
        owner: typeof parsed.owner === 'string' ? parsed.owner : null,
        pending: {
          favAdd: p && typeof p.favAdd === 'object' && p.favAdd ? p.favAdd : {},
          favRemove: Array.isArray(p?.favRemove) ? p.favRemove : [],
          prog: p && typeof p.prog === 'object' && p.prog ? p.prog : {},
        },
      }
    }
  } catch {
    /* fall through to a fresh state */
  }
  return { owner: null, pending: emptyPending() }
}

function writeState(state: SyncState) {
  try {
    localStorage.setItem(STATE_KEY, JSON.stringify(state))
  } catch {
    /* storage unavailable: syncing still works for this visit */
  }
}

/** Records a change in the unsaved list (a later change to the same question replaces an earlier one). */
function addChange(pending: Pending, change: UserDataChange) {
  if (change.kind === 'favourite') {
    if (change.at) {
      pending.favAdd[change.id] = change.at
      pending.favRemove = pending.favRemove.filter((id) => id !== change.id)
    } else {
      delete pending.favAdd[change.id]
      if (!pending.favRemove.includes(change.id)) pending.favRemove.push(change.id)
    }
  } else {
    pending.prog[change.id] = change.record
    const entries = Object.entries(pending.prog)
    if (entries.length > MAX_PROGRESS) {
      pending.prog = Object.fromEntries(entries.sort((a, b) => b[1].at.localeCompare(a[1].at)).slice(0, MAX_PROGRESS))
    }
  }
}

/** Removes what was just saved from the unsaved list, keeping anything changed while the request was in flight. */
function subtractSent(pending: Pending, sent: Pending) {
  for (const [id, at] of Object.entries(sent.favAdd)) if (pending.favAdd[id] === at) delete pending.favAdd[id]
  const removed = new Set(sent.favRemove)
  pending.favRemove = pending.favRemove.filter((id) => !removed.has(id))
  for (const [id, record] of Object.entries(sent.prog)) if (pending.prog[id]?.at === record.at) delete pending.prog[id]
}

/** Everything stored locally, as an unsaved list (used the first time an account signs in on this browser). */
function pendingFromLocal(): Pending {
  const favAdd: Record<string, string> = {}
  for (const [id, at] of getFavouriteMap()) favAdd[id] = at ?? new Date().toISOString() // an undated star is dated now
  return { favAdd, favRemove: [], prog: Object.fromEntries(getProgress()) }
}

/** Where sign-in tokens come from. A parameter only so the tests can stand in for Firebase. */
let tokenProvider: (forceRefresh?: boolean) => Promise<string | null> = getIdToken
export function setTokenProviderForTests(provider: (forceRefresh?: boolean) => Promise<string | null>) {
  tokenProvider = provider
}

let currentUid: string | null = null
let flushTimer: ReturnType<typeof setTimeout> | null = null
let retryTimer: ReturnType<typeof setTimeout> | null = null
let retryDelay = RETRY_MIN_MS
let running = false
let rerun: { full: boolean } | null = null
let started = false

function clearTimers() {
  if (flushTimer) clearTimeout(flushTimer)
  if (retryTimer) clearTimeout(retryTimer)
  flushTimer = retryTimer = null
}

function scheduleFlush() {
  if (flushTimer || !currentUid) return
  flushTimer = setTimeout(() => {
    flushTimer = null
    void run(false)
  }, FLUSH_DELAY_MS)
}

async function post(token: string, payload: object, allowKeepalive: boolean): Promise<Response> {
  const body = JSON.stringify(payload)
  return fetch('/api/qb?action=sync', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body,
    keepalive: allowKeepalive && body.length < KEEPALIVE_MAX_BYTES,
  })
}

/** One request to the server: sends the unsaved changes and, for a full sync, merges the reply into the local copy. */
async function attempt(full: boolean, allowKeepalive: boolean) {
  const uid = currentUid
  if (!uid) return
  const state = readState()
  if (state.owner !== uid) return
  const sent: Pending = JSON.parse(JSON.stringify(state.pending))
  if (!full && isEmpty(sent)) return

  const payload = { full, favAdd: sent.favAdd, favRemove: sent.favRemove, prog: sent.prog }
  let token = await tokenProvider()
  if (!token) return
  let res = await post(token, payload, allowKeepalive)
  if (res.status === 401) {
    token = await tokenProvider(true)
    if (!token) return
    res = await post(token, payload, allowKeepalive)
  }
  if (!res.ok) throw new Error(`sync failed (${res.status})`)
  const body = (await res.json()) as { favourites?: Record<string, string>; progress?: Record<string, PlayRecord> }

  // The person may have changed things while the request was in flight: keep those unsaved, and layer them over the reply.
  const after = readState()
  if (after.owner !== uid) return
  subtractSent(after.pending, sent)
  writeState(after)

  if (full && body.favourites && body.progress) {
    const favourites = new Map<string, string | null>(Object.entries(body.favourites))
    const progress = new Map<string, PlayRecord>(Object.entries(body.progress))
    for (const id of after.pending.favRemove) favourites.delete(id)
    for (const [id, at] of Object.entries(after.pending.favAdd)) favourites.set(id, at)
    for (const [id, record] of Object.entries(after.pending.prog)) {
      const current = progress.get(id)
      if (!current || record.at > current.at) progress.set(id, record)
    }
    replaceUserData(favourites, progress)
    try {
      sessionStorage.setItem(PULLED_KEY, uid)
    } catch {
      /* ignore */
    }
  }
}

/** Runs one sync at a time; a request made while one is running is carried out right after it. */
async function run(full: boolean, allowKeepalive = false) {
  if (running) {
    rerun = { full: full || !!rerun?.full }
    return
  }
  running = true
  try {
    await attempt(full, allowKeepalive)
    retryDelay = RETRY_MIN_MS
  } catch {
    // Offline, server unavailable or sync not set up: nothing is lost, it stays in the unsaved list and is retried.
    if (currentUid && !retryTimer) {
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
    if (next) void run(next.full, allowKeepalive)
  }
}

function onChange(change: UserDataChange) {
  const state = readState()
  // Before anyone has signed in, the whole local copy is taken at first sign-in, so there is nothing to queue.
  if (state.owner === null) return
  addChange(state.pending, change)
  writeState(state)
  if (currentUid === state.owner) scheduleFlush()
}

/** Call once at start-up: hooks into local changes and sends unsaved ones when the tab is hidden or the device comes back online. */
export function startQbankSync() {
  if (started || typeof window === 'undefined') return
  started = true
  setChangeListener(onChange)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'hidden' || !currentUid) return
    if (flushTimer) clearTimeout(flushTimer)
    flushTimer = null
    void run(false, true)
  })
  window.addEventListener('online', () => {
    if (currentUid) void run(false)
  })
}

/** Tell the sync who is signed in (null when nobody is). Call whenever that changes. */
export async function syncUser(uid: string | null) {
  startQbankSync()
  currentUid = uid
  clearTimers()
  if (!uid) return

  let state = readState()
  let full = false
  if (state.owner === null) {
    // First account on this browser: everything stored here from before accounts becomes this account's.
    state = { owner: uid, pending: pendingFromLocal() }
    full = true
  } else if (state.owner !== uid) {
    // A different account used this browser before: its copy is safe on the server, so clear it rather than mix the two.
    replaceUserData(new Map(), new Map())
    state = { owner: uid, pending: emptyPending() }
    full = true
  }
  writeState(state)
  if (!full) {
    try {
      full = sessionStorage.getItem(PULLED_KEY) !== uid
    } catch {
      full = true
    }
  }
  await run(full)
}
