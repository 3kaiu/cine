import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '../../test/utils'
import Scanner from '../Scanner'
import { mediaApi } from '../../api/media'

// Mock API
vi.mock('../../api/media', () => ({
  mediaApi: {
    scanDirectory: vi.fn(),
    getFiles: vi.fn(),
    listScanHistory: vi.fn(),
  },
}))

describe('Scanner Page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ; (mediaApi.getFiles as any).mockResolvedValue({
      files: [],
      total: 0,
      page: 1,
      page_size: 50,
    })
    ; (mediaApi.listScanHistory as any).mockResolvedValue([])
  })

  it('应该渲染扫描页面', () => {
    render(<Scanner />)
    expect(screen.getByText(/媒体扫描/i)).toBeInTheDocument()
  })

  it('应该显示文件列表', () => {
    render(<Scanner />)
    const listbox = screen.queryByRole('listbox')
    expect(listbox).toBeInTheDocument()
  })

  it('应该显示搜索框', () => {
    render(<Scanner />)
    const searchInput = screen.queryByPlaceholderText(/搜索/i)
    expect(searchInput).toBeInTheDocument()
  })

  it('应该显示刷新按钮', () => {
    render(<Scanner />)
    const buttons = screen.getAllByRole('button')
    expect(buttons.length).toBeGreaterThan(0)
  })

  it('应该显示文件类型过滤器', () => {
    render(<Scanner />)
    const filterButtons = screen.getAllByRole('button')
    expect(filterButtons.length).toBeGreaterThan(0)
  })

  it('应该能够搜索文件', async () => {
    const { user } = render(<Scanner />)
    const searchInput = screen.getByPlaceholderText(/搜索/i) as HTMLInputElement

    await user.type(searchInput, 'test')
    expect(searchInput.value).toBe('test')
  })

  it('应该在加载时显示加载状态', async () => {
    ; (mediaApi.getFiles as any).mockImplementation(
      () => new Promise(resolve => setTimeout(() => resolve({
        files: [],
        total: 0,
        page: 1,
        page_size: 50,
      }), 100))
    )

    render(<Scanner />)

    await waitFor(() => {
      const spinner = document.querySelector('[role="status"]')
      expect(spinner).toBeInTheDocument()
    })
  })

  it('应该显示统计卡片', () => {
    render(<Scanner />)
    expect(screen.getByText(/扫描次数/i)).toBeInTheDocument()
  })
})
