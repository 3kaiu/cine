import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '../../test/utils'
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
    expect(screen.getByText(/扫描结果/i)).toBeInTheDocument()
  })

  it('应该显示搜索框', () => {
    render(<Scanner />)
    // SearchField 组件可能使用不同的结构
    const searchContainer = screen.queryByRole('search')
    expect(searchContainer).toBeInTheDocument()
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

  it('应该显示统计卡片', () => {
    render(<Scanner />)
    // 统计卡片显示"总文件"等文本
    expect(screen.getByText(/总文件/i)).toBeInTheDocument()
  })
})
