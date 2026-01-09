import { Component, ReactNode } from 'react'
import { TriangleExclamation, ArrowsRotateRight } from '@gravity-ui/icons'
import { Button } from '@heroui/react'

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

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback
      }

      return (
        <div className="flex flex-col items-center justify-center min-h-[50vh] text-center p-8 bg-default-50/20 rounded-3xl backdrop-blur-sm border border-divider/5">
          <div className="w-20 h-20 rounded-2xl bg-danger/10 flex items-center justify-center mb-8 border border-danger/20 shadow-lg shadow-danger/5">
            <TriangleExclamation className="w-[36px] h-[36px] text-danger" />
          </div>
          <h2 className="text-2xl font-black mb-3 tracking-tight">发生了意外错误</h2>
          <p className="text-default-500 mb-10 max-w-md text-sm font-medium leading-relaxed">
            {this.state.error?.message || '加载此页面时发生了未知错误。这可能是一个临时问题。'}
          </p>
          <Button
            variant="secondary"
            size="md"
            className="font-bold px-8 border border-divider/10 shadow-md shadow-default-200/10 flex items-center gap-2"
            onPress={this.handleReset}
          >
            <ArrowsRotateRight className="w-[18px] h-[18px] text-default-400" />
            刷新并重试
          </Button>
        </div>
      )
    }

    return this.props.children
  }
}
