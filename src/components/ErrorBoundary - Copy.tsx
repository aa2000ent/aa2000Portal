import { Component, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
}

export default class ErrorBoundary extends Component<Props, State> {
  private retryTimer: number | null = null

  constructor(props: Props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: any) {
    console.error('[ErrorBoundary] Caught error:', error, info)
    // Transient HMR/runtime glitches can recover after a tick.
    // Soft-reset once so users don't get stuck on fallback UI.
    if (this.retryTimer != null) window.clearTimeout(this.retryTimer)
    this.retryTimer = window.setTimeout(() => {
      this.setState({ hasError: false })
      this.retryTimer = null
    }, 900)
  }

  componentWillUnmount() {
    if (this.retryTimer != null) {
      window.clearTimeout(this.retryTimer)
      this.retryTimer = null
    }
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback

      return (
        <div className="flex h-full w-full flex-col items-center justify-center p-8 text-center text-white min-h-[300px]">
          <div className="mb-4 rounded-full bg-white/10 p-3">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" /><path d="M12 9v4" /><path d="M12 17h.01" /></svg>
          </div>
          <h3 className="mb-1 text-lg font-bold">Content unavailable</h3>
          <p className="mb-6 text-sm text-slate-400 max-w-xs mx-auto">There was an error loading this section. Please try refreshing the page.</p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => this.setState({ hasError: false })}
              className="rounded-lg bg-white/10 px-5 py-2 text-sm font-semibold text-white transition-all hover:bg-white/20 active:scale-95"
            >
              Try again
            </button>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="rounded-lg bg-white/10 px-5 py-2 text-sm font-semibold text-white transition-all hover:bg-white/20 active:scale-95"
            >
              Reload Page
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
