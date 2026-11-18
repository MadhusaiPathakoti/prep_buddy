// Minimal Upstash Redis client over its REST API (no package needed; works the same on Vercel and in local dev).
// Needs UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN. Several commands in one call count as separate
// commands against the free monthly allowance, so callers batch on purpose and keep the number of commands low.

export function redisConfigured() {
  return Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN)
}

/** Runs commands in one request, e.g. [['HGETALL', 'k'], ['HLEN', 'k']]. Returns each command's result, in order. Throws if any fails. */
export async function redisPipeline(commands, timeoutMs = 5000) {
  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) throw new Error('Redis is not configured.')
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(`${url.replace(/\/$/, '')}/pipeline`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(commands),
      signal: controller.signal,
    })
    if (!res.ok) throw new Error(`Redis responded ${res.status}`)
    const out = await res.json()
    if (!Array.isArray(out)) throw new Error('Unexpected Redis response')
    return out.map((item) => {
      if (item?.error) throw new Error('A Redis command failed')
      return item?.result ?? null
    })
  } finally {
    clearTimeout(timer)
  }
}

/** HGETALL replies come back as a flat [field, value, field, value, ...] list (or an object); turn either into a Map. */
export function toMap(reply) {
  const map = new Map()
  if (Array.isArray(reply)) {
    for (let i = 0; i + 1 < reply.length; i += 2) map.set(String(reply[i]), String(reply[i + 1]))
  } else if (reply && typeof reply === 'object') {
    for (const [k, v] of Object.entries(reply)) map.set(k, String(v))
  }
  return map
}
