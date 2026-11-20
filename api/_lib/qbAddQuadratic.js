// Adding a quadratic-equations question to the shared bank. The person pastes only the two equations; everything else
// (the instruction line, the five options, the answer and the worked solution) is made here by the exact solver in
// qbQuadratic.js, so no AI is involved, the answer is always right, and a browser cannot send in a made-up solution.
//   1. clean the input      2. solve exactly (a message if the equations cannot be read)
//   3. duplicate check on the CANONICAL form of the equations (so a retyped or rearranged copy is caught, in the added questions
//      and in the launch questions)      4. save to Firestore, then to the list

import { AuthError, authenticate } from './firebaseAuth.js'
import { firestoreConfigured, createDoc } from './firestoreAdmin.js'
import { rateLimit } from './guard.js'
import { MAX_USER_QUESTIONS, indexEntryFor, loadUserLookup, putIndexEntry } from './qbIndex.js'
import { QuadraticError, solveQuadraticPair } from './qbQuadratic.js'
import { questionKey, quadraticKey } from './qbankKey.js'
import { loadSeed, loadSeedQuadKeys } from './qbSeed.js'
import { signatureOf } from './qbSimilar.js'
import { BadInput, cleanQuadraticInput } from './qbValidate.js'
import { redisConfigured } from './redis.js'

export const QUADRATIC_TOPIC = 'quadratic-equations'

/**
 * The whole add flow with its collaborators passed in, so it can be tested with fakes.
 * deps: { seed, seedQuad (Map canonical id -> launch question id), loadUsers(), createQuestion(question), putIndex(entry), now() }
 */
export async function addQuadratic(input, user, deps) {
  let solved
  try {
    solved = solveQuadraticPair(input.text)
  } catch (err) {
    if (err instanceof QuadraticError) return { status: 422, body: { code: 'unsolvable', message: err.message } }
    throw err
  }

  const id = quadraticKey(solved.canonical)
  const users = await deps.loadUsers()
  if (users.has(id)) return { status: 409, body: { code: 'duplicate', id } }
  const launchId = deps.seedQuad.get(id)
  if (launchId) return { status: 409, body: { code: 'duplicate', id: launchId } }
  // the same text may already be in the bank under the general key (added through the ordinary add form, or generated)
  const textId = questionKey(solved.stem, solved.options)
  if (users.has(textId) || deps.seed.has(textId)) return { status: 409, body: { code: 'duplicate', id: textId } }
  if (users.size >= MAX_USER_QUESTIONS) return { status: 503, body: { code: 'full', message: 'The bank cannot take more added questions right now.' } }

  const question = {
    id,
    stem: solved.stem,
    options: solved.options,
    answer: solved.answerIndex,
    solution: solved.solution,
    shortcut: null,
    topic: QUADRATIC_TOPIC,
    difficulty: solved.difficulty,
    examName: input.examName,
    examType: input.examType,
    year: input.year,
    source: 'user',
    // worked out exactly (not by AI), so the key is as trustworthy as one a generator produced
    trust: 'proven',
    createdAt: new Date(deps.now()).toISOString(),
    addedBy: user.uid,
  }
  if ((await deps.createQuestion(question)) === 'exists') return { status: 409, body: { code: 'duplicate', id } }

  const entry = indexEntryFor(question, signatureOf(question.stem))
  let listed = true
  try {
    await deps.putIndex(entry)
  } catch (err) {
    // The question is saved; it just is not in the list yet. It can be restored from Firestore.
    listed = false
    console.error('[qb] saved a quadratic question but could not list it:', err?.message)
  }
  const { n: _n, w: _w, ...publicEntry } = entry
  const { addedBy: _addedBy, ...publicQuestion } = question
  return { status: 201, body: { ok: true, id, entry: publicEntry, question: publicQuestion, listed } }
}

export default async function handleAddQuadratic(req, res) {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }
  let user
  try {
    user = await authenticate(req)
  } catch (err) {
    if (err instanceof AuthError) res.status(401).json({ code: 'sign-in', message: 'Please sign in to add a question.' })
    else res.status(503).json({ message: 'Sign-in could not be checked right now.' })
    return
  }
  if (!user.emailVerified) {
    res.status(403).json({ code: 'verify-email', message: 'Verify your email address before adding questions. Open your account (top right) to resend the link.' })
    return
  }
  const seed = loadSeed()
  if (!redisConfigured() || !firestoreConfigured() || seed.size === 0) {
    res.status(503).json({ code: 'unavailable', message: 'Adding questions is not set up on this server yet.' })
    return
  }
  // no AI quota is spent here, so the limit is more generous than for the ordinary add form
  if (!(await rateLimit(req, res, { name: `qbaddquad-${user.uid}`, limit: 40, windowMs: 3_600_000 }))) return

  let input
  try {
    input = cleanQuadraticInput(req.body)
  } catch (err) {
    if (err instanceof BadInput) {
      res.status(400).json({ code: 'invalid', message: err.message })
      return
    }
    throw err
  }

  try {
    const result = await addQuadratic(input, user, {
      seed,
      seedQuad: loadSeedQuadKeys(),
      loadUsers: loadUserLookup,
      createQuestion: (question) => createDoc('quantQuestions', question.id, question),
      putIndex: putIndexEntry,
      now: Date.now,
    })
    res.status(result.status).json(result.body)
  } catch (err) {
    console.error('[qb] add quadratic failed:', err?.message)
    res.status(502).json({ code: 'error', message: 'Something went wrong while adding the question. Please try again.' })
  }
}
