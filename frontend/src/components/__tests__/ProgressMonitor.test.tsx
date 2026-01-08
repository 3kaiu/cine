import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '../../test/utils'
import ProgressMonitor from '../ProgressMonitor'

// Mock WebSocket
const mockWebSocket = {
  send: vi.fn(),
  close: vi.fn(),
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
}

global.WebSocket = vi.fn(() => mockWebSocket as any) as any

describe('ProgressMonitor', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('应该渲染进度监控组件', () => {
    render(<ProgressMonitor taskId="test-task" />)
    expect(screen.getByText(/进度/i)).toBeInTheDocument()
  })

  it('应该连接 WebSocket', () => {
    render(<ProgressMonitor taskId="test-task" />)
    expect(global.WebSocket).toHaveBeenCalled()
  })

  it('应该显示进度百分比', async () => {
    render(<ProgressMonitor taskId="test-task" />)
    
    // 模拟 WebSocket 消息
    const messageHandler = (mockWebSocket.addEventListener as any).mock.calls.find(
      (call: any[]) => call[0] === 'message'
    )?.[1]

    if (messageHandler) {
      const event = {
        data: JSON.stringify({
          task_id: 'test-task',
          progress: 50,
          message: 'Processing...',
        }),
      }
      messageHandler(event)
    }

    await waitFor(() => {
      expect(screen.getByText(/50%/i)).toBeInTheDocument()
    })
  })

  it('应该在任务完成时显示完成消息', async () => {
    render(<ProgressMonitor taskId="test-task" />)
    
    const messageHandler = (mockWebSocket.addEventListener as any).mock.calls.find(
      (call: any[]) => call[0] === 'message'
    )?.[1]

    if (messageHandler) {
      const event = {
        data: JSON.stringify({
          task_id: 'test-task',
          progress: 100,
          status: 'completed',
          message: 'Task completed',
        }),
      }
      messageHandler(event)
    }

    await waitFor(() => {
      expect(screen.getByText(/完成/i)).toBeInTheDocument()
    })
  })
})
