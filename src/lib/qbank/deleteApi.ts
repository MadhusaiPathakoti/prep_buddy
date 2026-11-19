import { postJson } from './addApi'

/** The small sum that has to be answered before a question is deleted. */
export interface DeleteChallenge {
  a: number
  b: number
  op: '+' | '-'
  /** Signed by the server; sent back with the answer. */
  token: string
}

export type StartResult = { ok: true; challenge: DeleteChallenge } | { ok: false; error: string }
export type ConfirmResult =
  | { kind: 'deleted' }
  /** The answer was wrong, or the check expired: a fresh sum is supplied when the server gave one. */
  | { kind: 'again'; message: string; challenge: DeleteChallenge | null }
  | { kind: 'error'; message: string }

const TIMEOUT_MS = 20_000

const asChallenge = (data: Record<string, unknown> | null): DeleteChallenge | null =>
  data && Number.isInteger(data.a) && Number.isInteger(data.b) && (data.op === '+' || data.op === '-') && typeof data.token === 'string'
    ? { a: data.a as number, b: data.b as number, op: data.op, token: data.token }
    : null

const messageOf = (data: Record<string, unknown> | null, fallback: string) => (typeof data?.message === 'string' && data.message ? data.message : fallback)

/** Step 1: asks the server for a sum. Fails with a plain message when this person may not delete the question. */
export async function startDelete(id: string): Promise<StartResult> {
  const out = await postJson('delete-start', { id }, TIMEOUT_MS)
  if (out.status === 0) return { ok: false, error: 'Could not reach the server. Check your connection and try again.' }
  const challenge = out.status === 200 ? asChallenge(out.data) : null
  if (challenge) return { ok: true, challenge }
  if (out.status === 401) return { ok: false, error: 'Please sign in to delete a question.' }
  return { ok: false, error: messageOf(out.data, 'This question cannot be deleted right now.') }
}

/** Step 2: sends the answer. The question is deleted only if it is right. */
export async function confirmDelete(id: string, challenge: DeleteChallenge, answer: string): Promise<ConfirmResult> {
  const out = await postJson('delete', { id, token: challenge.token, answer: answer.trim() }, TIMEOUT_MS)
  if (out.status === 0) return { kind: 'error', message: 'Could not reach the server. Nothing was deleted; try again.' }
  if (out.status === 200) return { kind: 'deleted' }
  if (out.status === 400 && (out.data?.code === 'wrong-answer' || out.data?.code === 'expired')) {
    return { kind: 'again', message: messageOf(out.data, 'That is not the right answer.'), challenge: asChallenge(out.data) }
  }
  if (out.status === 404) return { kind: 'deleted' } // already gone: the result is what they wanted
  return { kind: 'error', message: messageOf(out.data, 'The question could not be deleted. Please try again.') }
}
