// Adding a question to the shared bank. Anyone signed in (with a verified email) may add one; it is published at once
// if it is not already there. The order of the checks matters: the cheap ones that can reject a question run first,
// so a duplicate never costs any AI quota.
//   1. clean the input             2. exact duplicate (same text, any option order)      3. similar question (same numbers, mostly same words)
//   4. two AIs solve it blind      5. the key the person typed (if any) must agree      6. save to Firestore, then to the list

import { AuthError, authenticate } from './firebaseAuth.js'
import { firestoreConfigured, createDoc } from './firestoreAdmin.js'
import { rateLimit } from './guard.js'
import { isEnabled } from './llm.js'
import { MAX_USER_QUESTIONS, indexEntryFor, loadUserLookup, putIndexEntry } from './qbIndex.js'
import { questionKey } from './qbankKey.js'
import { loadSeed } from './qbSeed.js'
import { signatureOf } from './qbSimilar.js'
import { SOLVE_CHAIN, VERIFY_CHAIN, solutionText, solveAndVerify } from './qbSolve.js'
import { BadInput, cleanQuestionInput } from './qbValidate.js'
import { redisConfigured } from './redis.js'

/**
 * The whole add flow with its collaborators passed in, so it can be tested with fakes.
 * deps: { seed, loadUsers(), solve(input), createQuestion(question), putIndex(entry), now() }
 */
export async function addQuestion(input, user, deps) {
  const id = questionKey(input.stem, input.options)
  const users = await deps.loadUsers()
  if (deps.seed.has(id) || users.has(id)) return { status: 409, body: { code: 'duplicate', id } }
  if (users.size >= MAX_USER_QUESTIONS) return { status: 503, body: { code: 'full', message: 'The bank cannot take more added questions right now.' } }

  const sig = signatureOf(input.stem)
  if (!input.allowSimilar) {
    const similarId = deps.seed.similar.find(sig) ?? users.similar.find(sig)
    if (similarId) return { status: 409, body: { code: 'similar', id: similarId } }
  }

  const decision = await deps.solve({ stem: input.stem, options: input.options, answer: input.answer })
  if (!decision.ok) return { status: decision.code === 'busy' ? 503 : 422, body: { code: decision.code, message: decision.message } }
  if (input.answer !== null && input.answer !== decision.answerIndex) {
    return { status: 409, body: { code: 'key-mismatch', aiAnswer: decision.answerIndex, yourAnswer: input.answer } }
  }

  const question = {
    id,
    stem: input.stem,
    options: input.options,
    answer: decision.answerIndex,
    solution: solutionText(decision.steps, input.options, decision.answerIndex),
    shortcut: decision.shortcut,
    topic: decision.topic,
    difficulty: decision.difficulty,
    examName: input.examName,
    examType: input.examType,
    year: input.year,
    source: 'user',
    trust: 'ai-agreed',
    createdAt: new Date(deps.now()).toISOString(),
    addedBy: user.uid,
  }
  if ((await deps.createQuestion(question)) === 'exists') return { status: 409, body: { code: 'duplicate', id } }

  const entry = indexEntryFor(question, sig)
  let listed = true
  try {
    await deps.putIndex(entry)
  } catch (err) {
    // The question is saved; it just is not in the list yet. It can be restored from Firestore.
    listed = false
    console.error('[qb] saved a question but could not list it:', err?.message)
  }
  const { n: _n, w: _w, ...publicEntry } = entry
  // the full question comes back too, so the person can play it at once; who added it is not shown
  const { addedBy: _addedBy, ...publicQuestion } = question
  return { status: 201, body: { ok: true, id, entry: publicEntry, question: publicQuestion, listed } }
}

export default async function handleAdd(req, res) {
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
  const solversReady = [...SOLVE_CHAIN, ...VERIFY_CHAIN].some(isEnabled)
  if (!redisConfigured() || !firestoreConfigured() || !solversReady || seed.size === 0) {
    res.status(503).json({ code: 'unavailable', message: 'Adding questions is not set up on this server yet.' })
    return
  }
  if (!(await rateLimit(req, res, { name: `qbadd-${user.uid}`, limit: 12, windowMs: 3_600_000 }))) return

  let input
  try {
    input = cleanQuestionInput(req.body)
  } catch (err) {
    if (err instanceof BadInput) {
      res.status(400).json({ code: 'invalid', message: err.message })
      return
    }
    throw err
  }

  try {
    const result = await addQuestion(input, user, {
      seed,
      loadUsers: loadUserLookup,
      solve: solveAndVerify,
      createQuestion: (question) => createDoc('quantQuestions', question.id, question),
      putIndex: putIndexEntry,
      now: Date.now,
    })
    res.status(result.status).json(result.body)
  } catch (err) {
    console.error('[qb] add failed:', err?.message)
    res.status(502).json({ code: 'error', message: 'Something went wrong while adding the question. Please try again.' })
  }
}
