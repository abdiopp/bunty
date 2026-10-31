import { Component, type ErrorInfo, type ReactNode } from 'react'

interface State {
  error: Error | null
}

/**
 * A rendering bug shows a way out instead of a blank window. Data lives in the main process,
 * so reloading the page loses nothing that was saved.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Bunty hit a rendering error:', error, info.componentStack)
  }

  render(): ReactNode {
    if (!this.state.error) return this.props.children
    return (
      <div role="alert" className="grid h-full place-items-center p-8">
        <div className="bg-card max-w-sm rounded-xl border p-6 text-center shadow-xs">
          <p className="font-medium">Something went wrong on this screen.</p>
          <p className="text-muted-foreground mt-1.5 text-sm">
            Your tasks are safe. Reloading usually fixes it.
          </p>
          <button
            onClick={() => location.reload()}
            className="bg-primary text-primary-foreground mt-4 rounded-md px-3 py-1.5 text-sm font-medium"
          >
            Reload
          </button>
        </div>
      </div>
    )
  }
}
