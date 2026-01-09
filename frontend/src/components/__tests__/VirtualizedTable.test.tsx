import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import VirtualizedTable from '../VirtualizedTable'

// Mock react-window
vi.mock('react-window', () => ({
  FixedSizeList: ({ children, itemCount }: any) => (
    <div data-testid="virtual-list">
      {Array.from({ length: Math.min(itemCount, 10) }).map((_, i) => (
        <div key={i}>{children({ index: i, style: {} })}</div>
      ))}
    </div>
  ),
}))

describe('VirtualizedTable', () => {
  const mockData = Array.from({ length: 150 }, (_, i) => ({
    id: `id-${i}`,
    name: `File ${i}`,
    size: 1000 + i,
    type: 'video',
  }))

  const columns = [
    { title: '文件名', dataIndex: 'name', key: 'name' },
    { title: '大小', dataIndex: 'size', key: 'size', width: 100 },
    { title: '类型', dataIndex: 'type', key: 'type', width: 80 },
  ]

  it('应该在小数据量时使用普通表格', () => {
    const smallData = mockData.slice(0, 50)
    const { container } = render(
      <VirtualizedTable dataSource={smallData} columns={columns} />
    )

    // 应该渲染 Table
    expect(container.querySelector('table')).toBeTruthy()
  })

  it('应该在大数据量时使用虚拟滚动', () => {
    const { container } = render(
      <VirtualizedTable dataSource={mockData} columns={columns} />
    )

    // 应该渲染虚拟列表
    expect(screen.getByTestId('virtual-list')).toBeTruthy()
    expect(container.querySelector('table')).toBeFalsy()
  })

  it('应该根据阈值切换渲染方式', () => {
    const data = mockData.slice(0, 120)

    // 阈值100，数据120，应该使用虚拟滚动
    render(
      <VirtualizedTable dataSource={data} columns={columns} />
    )
    expect(screen.getByTestId('virtual-list')).toBeTruthy()

    // 阈值150，数据120，应该使用普通表格
    const { container: container2 } = render(
      <VirtualizedTable dataSource={data} columns={columns} />
    )
    expect(container2.querySelector('table')).toBeTruthy()
  })

  it('应该显示加载状态', () => {
    const { container } = render(
      <VirtualizedTable dataSource={mockData} columns={columns} loading={true} />
    )

    // 应该显示 Spinner 组件
    expect(container.querySelector('[aria-label="Loading"]')).toBeTruthy()
  })

  it('应该正确渲染列标题', () => {
    render(
      <VirtualizedTable dataSource={mockData} columns={columns} />
    )

    columns.forEach(col => {
      expect(screen.getByText(col.title)).toBeTruthy()
    })
  })

  it('应该处理空数据', () => {
    const { container } = render(
      <VirtualizedTable dataSource={[]} columns={columns} />
    )

    // 空数据应该使用普通表格
    expect(container.querySelector('table')).toBeTruthy()
  })
})
