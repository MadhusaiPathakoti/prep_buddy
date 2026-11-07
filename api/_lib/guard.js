// Shared request guard for the serverless functions (the leading underscore keeps this file from becoming a route).
//
// rateLimit(): a per-visitor request cap so one script can't drain the Gemini/Groq quota or run up the bill.
//   - Default: in-memory sliding window, per server instance. Cheap and dependency-free, but each Vercel instance counts
//     separately, so it is a best-effort brake rather than an exact global limit.
//   - Exact, shared across all instances: set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN (a free Upstash Redis
//     database works) and the same limit is counted in Redis instead. If Redis is unreachable it falls back to memory.

const memory = new Map() // key -> timestamps (ms) within the window
const MAX_KEYS = 20000

export function clientIp(req) {
  const fwd = req.headers?.['x-forwarded-for']
  const first = (Array.isArray(fwd) ? fwd[0] : String(fwd || '')).split(',')[0].trim()
  return first || req.headers?.['x-real-ip'] || req.socket?.remoteAddress || 'unknown'
}

function memoryCheck(key, limit, windowMs) {
  const now = Date.now()
  const recent = (memory.get(key) || []).filter((t) => now - t < windowMs)
  const allowed = recent.length < limit
  if (allowed) recent.push(now)
  memory.set(key, recent)
  if (memory.size > MAX_KEYS) {
    // drop the oldest quarter so the map cannot grow without bound under a flood of distinct addresses
    let n = Math.floor(MAX_KEYS / 4)
    for (const k of memory.keys()) {
      memory.delete(k)
      if (--n <= 0) break
    }
  }
  const oldest = recent[0] ?? now
  return { allowed, remaining: Math.max(0, limit - recent.length), retryAfterSec: Math.max(1, Math.ceil((oldest + windowMs - now) / 1000)) }
}

async function redisCheck(key, limit, windowMs) {
  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) return null
  const windowSec = Math.ceil(windowMs / 1000)
  const bucket = `rl:${key}:${Math.floor(Date.now() / windowMs)}`
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 800)
    const res = await fetch(`${url.replace(/\/$/, '')}/pipeline`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify([['INCR', bucket], ['EXPIRE', bucket, String(windowSec + 5), 'NX']]),
      signal: controller.signal,
    }).finally(() => clearTimeout(timer))
    if (!res.ok) return null
    const out = await res.json()
    const count = Number(out?.[0]?.result)
    if (!Number.isFinite(count)) return null
    return { allowed: count <= limit, remaining: Math.max(0, limit - count), retryAfterSec: Math.max(1, windowSec - (Math.floor(Date.now() / 1000) % windowSec)) }
  } catch {
    return null
  }
}

/** Returns true when the request may proceed; otherwise it has already answered with 429 and the caller must return. */
export async function rateLimit(req, res, { name, limit, windowMs = 60_000 }) {
  const key = `${name}:${clientIp(req)}`
  const verdict = (await redisCheck(key, limit, windowMs)) ?? memoryCheck(key, limit, windowMs)
  res.setHeader?.('X-RateLimit-Limit', String(limit))
  res.setHeader?.('X-RateLimit-Remaining', String(verdict.remaining))
  if (verdict.allowed) return true
  res.setHeader?.('Retry-After', String(verdict.retryAfterSec))
  res.setHeader?.('Cache-Control', 'no-store')
  res.status(429).json({ error: 'Too many requests. Please wait a moment and try again.' })
  return false
}
