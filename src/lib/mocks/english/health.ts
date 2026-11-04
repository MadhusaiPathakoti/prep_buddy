// Client-side memory of failing models and of token budgets (localStorage, with an in-memory mirror). The serverless
// function is stateless across instances, so the client sends the models it knows are cooling down as `skipModels`
// (and the per-model token budgets it last saw as `budgets`) in every request, and persists the updates every reply
// carries. Model ids are "provider/model". Everything is wrapped: no storage just means the in-memory mirror is used
// for the life of the page.

export const HEALTH_KEY = 'prepbuddy:mocks:englishModelHealth:v1'
const HEALTH_VERSION = 1

export type ModelFailClass = 'unavailable' | 'quota-day' | 'rate-minute' | 'overload' | 'timeout' | 'network'

export interface HealthEntry {
  cls: ModelFailClass
  /** Epoch ms until which the model must not be called. */
  until: number
  quotaId?: string
  quotaValue?: string
  retryDelayMs?: number
}

/** One update as reported by the server (cooldown is relative, so client/server clock skew does not matter). */
export interface HealthUpdate {
  model: string
  /** 'ok' clears the model; anything else is a failure class. */
  cls: string
  cooldownMs?: number
  quotaId?: string
  quotaValue?: string
  retryDelayMs?: number
}

/** A token budget as reported by the server (reset is relative). */
export interface BudgetUpdate {
  model: string
  limit: number
  remaining: number
  resetMs: number
}
interface StoredBudget {
  limit: number
  remaining: number
  /** Epoch ms when the bucket refills. */
  resetAt: number
}

interface Store {
  models: Record<string, HealthEntry>
  budgets: Record<string, StoredBudget>
}

const CLASSES: string[] = ['unavailable', 'quota-day', 'rate-minute', 'overload', 'timeout', 'network']
let mirror: Store = { models: {}, budgets: {} }

function storage(): Storage | null {
  try {
    return typeof globalThis !== 'undefined' && globalThis.localStorage ? globalThis.localStorage : null
  } catch {
    return null
  }
}

function readStore(now: number): Store {
  let all: Store = mirror
  try {
    const raw = storage()?.getItem(HEALTH_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as { v?: number; models?: Record<string, HealthEntry>; budgets?: Record<string, StoredBudget> } | null
      if (parsed && parsed.v === HEALTH_VERSION && parsed.models && typeof parsed.models === 'object' && !Array.isArray(parsed.models)) {
        all = { models: parsed.models, budgets: parsed.budgets && typeof parsed.budgets === 'object' && !Array.isArray(parsed.budgets) ? parsed.budgets : {} }
      }
    }
  } catch {
    /* corrupt: fall back to the mirror */
  }
  const out: Store = { models: {}, budgets: {} }
  for (const [m, e] of Object.entries(all.models)) {
    if (e && typeof e.until === 'number' && e.until > now && CLASSES.includes(e.cls)) out.models[m] = e
  }
  for (const [m, b] of Object.entries(all.budgets)) {
    if (b && typeof b.resetAt === 'number' && b.resetAt > now && Number.isFinite(b.remaining) && Number.isFinite(b.limit)) out.budgets[m] = b
  }
  return out
}

function writeStore(store: Store) {
  mirror = store
  try {
    storage()?.setItem(HEALTH_KEY, JSON.stringify({ v: HEALTH_VERSION, ...store }))
  } catch {
    /* blocked or full: the mirror still works */
  }
}

/** Applies server-reported updates; `scale` multiplies cooldowns (tests shrink it, production uses 1). */
export function applyHealthUpdates(updates: HealthUpdate[] | undefined, scale: number, now = Date.now()) {
  if (!Array.isArray(updates) || updates.length === 0) return
  const store = readStore(now)
  for (const u of updates) {
    if (!u || typeof u.model !== 'string' || !u.model) continue
    if (u.cls === 'ok') {
      delete store.models[u.model]
    } else if (CLASSES.includes(u.cls) && typeof u.cooldownMs === 'number' && u.cooldownMs > 0) {
      store.models[u.model] = { cls: u.cls as ModelFailClass, until: now + u.cooldownMs * scale, quotaId: u.quotaId, quotaValue: u.quotaValue, retryDelayMs: u.retryDelayMs }
    }
  }
  writeStore(store)
}

/** Remembers token budgets (a bucket is only useful until it refills). */
export function applyBudgetUpdates(updates: BudgetUpdate[] | undefined, scale: number, now = Date.now()) {
  if (!Array.isArray(updates) || updates.length === 0) return
  const store = readStore(now)
  for (const u of updates) {
    if (!u || typeof u.model !== 'string' || !Number.isFinite(u.limit) || !Number.isFinite(u.remaining) || !Number.isFinite(u.resetMs)) continue
    if (u.resetMs > 0) store.budgets[u.model] = { limit: u.limit, remaining: u.remaining, resetAt: now + u.resetMs * scale }
    else delete store.budgets[u.model]
  }
  writeStore(store)
}

/** Budgets still in force, in the shape the server expects (reset is relative). */
export function budgetsForRequest(now = Date.now()): BudgetUpdate[] {
  try {
    return Object.entries(readStore(now).budgets).map(([model, b]) => ({ model, limit: b.limit, remaining: b.remaining, resetMs: Math.max(0, b.resetAt - now) }))
  } catch {
    return []
  }
}

/** Models that must not be called right now (sent to the server as skipModels). */
export function healthSkipList(now = Date.now()): string[] {
  try {
    return Object.keys(readStore(now).models)
  } catch {
    return []
  }
}

export function healthState(model: string, now = Date.now()): HealthEntry | undefined {
  try {
    return readStore(now).models[model]
  } catch {
    return undefined
  }
}

export function modelHealthSnapshot(now = Date.now()): Record<string, HealthEntry> {
  return readStore(now).models
}

/** Forgets everything (the "I enabled billing / switched key" button, and tests). */
export function clearEnglishModelHealth() {
  mirror = { models: {}, budgets: {} }
  try {
    storage()?.removeItem(HEALTH_KEY)
  } catch {
    /* ignore */
  }
}
