import { useState } from 'react'
import { confirmDelete, startDelete } from '../../lib/qbank/deleteApi'
import type { DeleteChallenge } from '../../lib/qbank/deleteApi'

interface Props {
  questionId: string
  /** Called once the server has deleted the question. */
  onDeleted: () => void
}

/**
 * "Delete this question" for a question the signed-in person added. Two steps: press the button, then answer a small sum
 * (two two-digit numbers, added or subtracted). The server checks both who is asking and the answer.
 */
export default function DeleteQuestion({ questionId, onDeleted }: Props) {
  const [step, setStep] = useState<'idle' | 'loading' | 'sum' | 'deleting'>('idle')
  const [challenge, setChallenge] = useState<DeleteChallenge | null>(null)
  const [answer, setAnswer] = useState('')
  const [message, setMessage] = useState<string | null>(null)

  async function begin() {
    setStep('loading')
    setMessage(null)
    const out = await startDelete(questionId)
    if (!out.ok) {
      setStep('idle')
      setMessage(out.error)
      return
    }
    setChallenge(out.challenge)
    setAnswer('')
    setStep('sum')
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!challenge || step !== 'sum' || !answer.trim()) return
    setStep('deleting')
    const out = await confirmDelete(questionId, challenge, answer)
    if (out.kind === 'deleted') {
      onDeleted()
      return
    }
    setMessage(out.message)
    if (out.kind === 'again' && out.challenge) {
      setChallenge(out.challenge)
      setAnswer('')
      setStep('sum')
    } else {
      setStep(out.kind === 'again' ? 'idle' : 'sum')
    }
  }

  function cancel() {
    setStep('idle')
    setChallenge(null)
    setMessage(null)
  }

  if (step === 'idle' || step === 'loading') {
    return (
      <div className="mt-8 border-t border-slate-200 pt-4 text-right dark:border-slate-700">
        <button type="button" disabled={step === 'loading'} onClick={() => void begin()} className="text-sm font-medium text-rose-600 hover:underline disabled:opacity-50 dark:text-rose-400">
          {step === 'loading' ? 'Please wait…' : 'Delete this question'}
        </button>
        {message && <p role="alert" className="mt-2 text-sm text-rose-600 dark:text-rose-400">{message}</p>}
      </div>
    )
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="mt-8 rounded-2xl border border-rose-300 bg-rose-50 p-4 dark:border-rose-500/40 dark:bg-rose-500/10" aria-label="Confirm deleting this question">
      <p className="text-sm font-semibold text-rose-800 dark:text-rose-200">Delete this question for everyone? This cannot be undone.</p>
      <label className="mt-3 block text-sm text-rose-900 dark:text-rose-100">
        To confirm, what is{' '}
        <strong className="whitespace-nowrap">
          {challenge?.a} {challenge?.op === '-' ? '−' : '+'} {challenge?.b}
        </strong>
        ?
        <input
          type="text"
          inputMode="numeric"
          autoComplete="off"
          autoFocus
          value={answer}
          onChange={(e) => setAnswer(e.target.value.replace(/[^\d-]/g, '').slice(0, 5))}
          className="ml-2 w-24 rounded-lg border border-rose-300 bg-white px-3 py-1.5 text-sm text-slate-900 dark:border-rose-500/40 dark:bg-slate-900 dark:text-slate-100"
        />
      </label>
      {message && <p role="alert" className="mt-2 text-sm text-rose-700 dark:text-rose-300">{message}</p>}
      <div className="mt-3 flex gap-2">
        <button type="submit" disabled={step === 'deleting' || !answer.trim()} className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-50">
          {step === 'deleting' ? 'Deleting…' : 'Delete'}
        </button>
        <button type="button" disabled={step === 'deleting'} onClick={cancel} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-white dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800">
          Cancel
        </button>
      </div>
    </form>
  )
}
