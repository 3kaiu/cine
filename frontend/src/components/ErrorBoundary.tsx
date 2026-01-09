import { Component, ReactNode } from 'react'
import { AlertTriangle, RefreshCw } from 'react-feather'
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
        <div className="flex flex-col items-center justify-center min-h-[50vh] text-center p-8">
          <div className="w-16 h-16 rounded-full bg-danger/10 flex items-center justify-center mb-6">
            <AlertTriangle size={32} className="text-danger" />
          </div>
          <h2 className="text-2xl font-bold mb-2">Something went wrong</h2>
          <p className="text-foreground/60 mb-8 max-w-md">
            {this.state.error?.message || 'An unexpected error occurred while loading this page.'}
          </p>
          <Button
            color="primary"
            variant="flat"
            startContent={<RefreshCw size={18} />}
            onPress={this.handleReset}
          >
            Reload Application
          </Button>
        </div>
      )
    }

    return this.props.children
  }
}
