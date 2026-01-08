import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '../../test/utils'
import Scanner from '../Scanner'
import { mediaApi } from '../../api/media'

// Mock API
vi.mock('../../api/media', () => ({
  mediaApi: {
    scanDirectory: vi.fn(),
    getFiles: vi.fn(),
  },
}))

describe('Scanner Page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(mediaApi.getFiles as any).mockResolvedValue({
      files: [],
      total: 0,
      page: 1,
      page_size: 50,
    })
  })

  it('应该渲染扫描页面', () => {
    render(<Scanner />)
    expect(screen.getByText(/文件扫描/i)).toBeInTheDocument()
  })

  it('应该显示目录输入框', () => {
    render(<Scanner />)
    const input = screen.getByPlaceholderText(/目录路径/i)
    expect(input).toBeInTheDocument()
  })

  it('应该显示扫描按钮', () => {
    render(<Scanner />)
    const button = screen.getByText(/开始扫描/i)
    expect(button).toBeInTheDocument()
  })

  it('应该显示刷新按钮', () => {
    render(<Scanner />)
    const button = screen.getByText(/刷新列表/i)
    expect(button).toBeInTheDocument()
  })

  it('应该能够输入目录路径', async () => {
    const { user } = render(<Scanner />)
    const input = screen.getByPlaceholderText(/目录路径/i) as HTMLInputElement
    
    await user.type(input, '/test/path')
    expect(input.value).toBe('/test/path')
  })

  it('应该在扫描时显示加载状态', async () => {
    ;(mediaApi.scanDirectory as any).mockImplementation(
      () => new Promise(resolve => setTimeout(() => resolve({ task_id: 'test-task' }), 100))
    )

    const { user } = render(<Scanner />)
    const input = screen.getByPlaceholderText(/目录路径/i)
    const button = screen.getByText(/开始扫描/i)

    await user.type(input, '/test/path')
    await user.click(button)

    // 应该显示加载状态
    await waitFor(() => {
      expect(button).toBeDisabled()
    })
  })
})
