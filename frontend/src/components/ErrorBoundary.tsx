import { Component, ReactNode } from 'react'
import { Icon } from '@iconify/react'
import { Button, Surface } from '@heroui/react'

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
          <Surface variant="secondary" className="w-full max-w-md rounded-xl p-6 border border-divider/10">
            <div className="flex flex-col items-center text-center space-y-4">
              <div className="w-12 h-12 rounded-lg bg-danger/10 flex items-center justify-center">
                <Icon icon="mdi:alert-circle" className="w-6 h-6 text-danger" />
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
              <Button
                variant="secondary"
                size="md"
                className="flex-1 font-medium"
                onPress={this.handleGoHome}
              >
                <Icon icon="mdi:arrow-left" className="w-4 h-4 mr-2" />
                返回首页
              </Button>
              <Button
                variant="primary"
                size="md"
                className="flex-1 font-medium"
                onPress={this.handleReset}
              >
                <Icon icon="mdi:refresh" className="w-4 h-4 mr-2" />
                刷新重试
              </Button>
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
          </Surface>
        </div>
      )
    }

    return this.props.children
  }
}
