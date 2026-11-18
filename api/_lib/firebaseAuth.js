// Checks a Firebase sign-in token (the "ID token" the browser gets after Google / email sign-in) on the server,
// without any extra package: the token is a signed JWT, and Google publishes the public certificates it is signed with.
// Whoever calls our API proves who they are with it, so a user can only ever touch their own data.

import { X509Certificate, createVerify } from 'node:crypto'

// Same public project id as the web config in the browser bundle; not a secret.
export const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'prepbuddy-564d8'
const CERTS_URL = 'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com'
const MAX_TOKEN_LENGTH = 8192
const CLOCK_SKEW_SEC = 300

export class AuthError extends Error {}

let certCache = { certs: {}, expiresAt: 0 }

/** Google's current signing certificates, cached for as long as Google says (they rotate every few days). */
async function loadCerts(force = false) {
  if (!force && certCache.expiresAt > Date.now()) return certCache.certs
  const res = await fetch(CERTS_URL)
  if (!res.ok) throw new Error('Could not load the sign-in certificates.')
  const certs = await res.json()
  const maxAge = Number(/max-age=(\d+)/.exec(res.headers.get('cache-control') || '')?.[1] ?? 3600)
  certCache = { certs, expiresAt: Date.now() + Math.max(60, maxAge) * 1000 }
  return certs
}

function decodePart(part) {
  try {
    return JSON.parse(Buffer.from(part, 'base64url').toString('utf8'))
  } catch {
    throw new AuthError('Malformed sign-in token.')
  }
}

/**
 * Verifies a token against the given certificates ({ keyId: pemCertificate }). Returns who signed in, or throws AuthError.
 * `now` (ms) and `projectId` are only parameters so tests can pin them.
 */
export function verifyWithCerts(token, certs, { now = Date.now(), projectId = PROJECT_ID } = {}) {
  if (typeof token !== 'string' || token.length > MAX_TOKEN_LENGTH) throw new AuthError('Missing sign-in token.')
  const parts = token.split('.')
  if (parts.length !== 3 || parts.some((p) => !p)) throw new AuthError('Malformed sign-in token.')
  const [headerPart, payloadPart, signaturePart] = parts
  const header = decodePart(headerPart)
  const payload = decodePart(payloadPart)
  if (header.alg !== 'RS256' || typeof header.kid !== 'string') throw new AuthError('Unsupported sign-in token.')
  const pem = certs?.[header.kid]
  if (!pem) throw new AuthError('Unknown signing key.')

  let valid = false
  try {
    const key = new X509Certificate(pem).publicKey
    valid = createVerify('RSA-SHA256').update(`${headerPart}.${payloadPart}`).verify(key, Buffer.from(signaturePart, 'base64url'))
  } catch {
    valid = false
  }
  if (!valid) throw new AuthError('Invalid sign-in token.')

  const nowSec = Math.floor(now / 1000)
  if (typeof payload.exp !== 'number' || payload.exp <= nowSec) throw new AuthError('Sign-in has expired.')
  if (typeof payload.iat !== 'number' || payload.iat > nowSec + CLOCK_SKEW_SEC) throw new AuthError('Invalid sign-in token.')
  if (payload.aud !== projectId || payload.iss !== `https://securetoken.google.com/${projectId}`) throw new AuthError('Sign-in token is for a different app.')
  if (typeof payload.sub !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(payload.sub)) throw new AuthError('Invalid sign-in token.')
  return { uid: payload.sub, email: typeof payload.email === 'string' ? payload.email : null, emailVerified: payload.email_verified === true }
}

/** Verifies a token with Google's live certificates, refreshing them once if the token names a key we have not seen. */
export async function verifyIdToken(token) {
  let certs = await loadCerts()
  const kid = (() => {
    try {
      return decodePart(String(token).split('.')[0]).kid
    } catch {
      return undefined
    }
  })()
  if (kid && !certs[kid]) certs = await loadCerts(true)
  return verifyWithCerts(token, certs)
}

/** The signed-in user for a request (`Authorization: Bearer <token>`), or throws AuthError. */
export async function authenticate(req) {
  const header = String(req.headers?.authorization || '')
  const match = /^Bearer\s+(\S+)$/i.exec(header)
  if (!match) throw new AuthError('Sign in required.')
  return verifyIdToken(match[1])
}
