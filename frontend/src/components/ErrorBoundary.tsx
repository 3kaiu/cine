import { Component, ReactNode } from 'react'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo)
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null })
    window.location.reload()
  }

  handleGoHome = () => {
    this.setState({ hasError: false, error: null })
    window.location.href = '/'
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback
      }

      return (
        <div className="flex flex-col items-center justify-center min-h-screen p-6 bg-background">
          <div className="w-full max-w-md rounded-xl p-6 border border-divider/10 bg-default-50">
            <div className="flex flex-col items-center text-center space-y-4">
              <div className="w-12 h-12 rounded-lg bg-danger/10 flex items-center justify-center">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-6 h-6 text-danger">
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 7v6" />
                  <circle cx="12" cy="16.5" r="1" fill="currentColor" stroke="none" />
                </svg>
              </div>
              
              <div className="space-y-2">
                <h1 className="text-lg font-semibold tracking-tight text-foreground">
                  发生了意外错误
                </h1>
                <p className="text-xs text-default-500 leading-relaxed">
                  {this.state.error?.message || '加载此页面时发生了未知错误。这可能是一个临时问题。'}
                </p>
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                className="flex-1 font-medium"
                onClick={this.handleGoHome}
              >
                <span className="inline-flex items-center justify-center gap-2 rounded-xl border border-divider/20 bg-default-100 px-4 py-2.5 text-sm">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-4 h-4">
                    <path d="M15 18l-6-6 6-6" />
                  </svg>
                  返回首页
                </span>
              </button>
              <button
                type="button"
                className="flex-1 font-medium"
                onClick={this.handleReset}
              >
                <span className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm text-primary-foreground">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-4 h-4">
                    <path d="M20 11a8 8 0 1 0 2 5.3" />
                    <path d="M20 4v7h-7" />
                  </svg>
                  刷新重试
                </span>
              </button>
            </div>

            {this.state.error && (
              <details className="group pt-2">
                <summary className="text-xs text-default-400 cursor-pointer hover:text-default-500 transition-colors">
                  查看错误详情
                </summary>
                <div className="mt-3 p-3 bg-default-50 rounded-lg border border-divider/10">
                  <pre className="text-[10px] text-default-600 font-mono whitespace-pre-wrap break-all">
                    {this.state.error.toString()}
                  </pre>
                </div>
              </details>
            )}
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
