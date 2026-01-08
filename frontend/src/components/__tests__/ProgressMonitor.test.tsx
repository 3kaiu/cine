import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '../../test/utils'
import ProgressMonitor from '../ProgressMonitor'
import { useWebSocket } from '../../hooks/useWebSocket'

// Mock useWebSocket
vi.mock('../../hooks/useWebSocket', () => ({
  useWebSocket: vi.fn(),
}))

const mockUseWebSocket = useWebSocket as any

describe('ProgressMonitor', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseWebSocket.mockReturnValue({
      connected: true,
      messages: [],
      sendMessage: vi.fn(),
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('应该渲染进度监控组件', () => {
    mockUseWebSocket.mockReturnValue({
      connected: true,
      messages: [{ task_id: 'test-task', task_type: 'Scan', progress: 0, message: 'Started' }],
      sendMessage: vi.fn(),
    })

    render(<ProgressMonitor taskId="test-task" />)
    expect(screen.getByText(/进度/i)).toBeInTheDocument()
  })

  it('应该连接 WebSocket', () => {
    render(<ProgressMonitor taskId="test-task" />)
    expect(mockUseWebSocket).toHaveBeenCalled()
  })

  it('应该显示进度百分比', () => {
    mockUseWebSocket.mockReturnValue({
      connected: true,
      messages: [{ task_id: 'test-task', task_type: 'Scan', progress: 50, message: 'Processing...' }],
      sendMessage: vi.fn(),
    })

    render(<ProgressMonitor taskId="test-task" />)
    expect(screen.getByText(/50%/i)).toBeInTheDocument()
  })

  it('应该在任务完成时显示完成消息', () => {
    mockUseWebSocket.mockReturnValue({
      connected: true,
      messages: [{ task_id: 'test-task', task_type: 'Scan', progress: 100, status: 'completed', message: 'Task completed' }],
      sendMessage: vi.fn(),
    })

    render(<ProgressMonitor taskId="test-task" />)
    expect(screen.getByText(/Task completed/i)).toBeInTheDocument()
  })
})
