import { Component, type ErrorInfo, type ReactNode } from 'react'

interface State {
  failed: boolean
  chunkError: boolean
}

/**
 * Catches a crash anywhere below it so the visitor sees a message and a way back instead of a blank page.
 * A failed lazy-loaded chunk (usually a stale tab after a new deploy) gets a "reload" prompt, since reloading fixes it.
 */
export default class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { failed: false, chunkError: false }

  static getDerivedStateFromError(error: unknown): State {
    const message = String((error as { message?: string })?.message ?? error)
    return { failed: true, chunkError: /dynamically imported module|Loading chunk|Importing a module script failed/i.test(message) }
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error('Unhandled render error:', error, info.componentStack)
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <h1 className="text-2xl font-extrabold text-slate-900 dark:text-slate-100">{this.state.chunkError ? 'A new version is available' : 'Something went wrong'}</h1>
        <p className="mt-3 text-slate-500 dark:text-slate-400">
          {this.state.chunkError ? 'Reload the page to get the latest version.' : 'The page hit an unexpected error. Your saved progress is safe.'}
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <button onClick={() => window.location.reload()} className="rounded-xl bg-indigo-600 px-5 py-2.5 font-semibold text-white transition hover:bg-indigo-500">
            Reload
          </button>
          <a href="#/" onClick={() => this.setState({ failed: false, chunkError: false })} className="rounded-xl bg-slate-100 dark:bg-slate-700 px-5 py-2.5 font-semibold text-slate-700 dark:text-slate-300 transition hover:bg-slate-200">
            Home
          </a>
        </div>
      </div>
    )
  }
}
