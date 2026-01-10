import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import VirtualizedTable from '../VirtualizedTable'

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

  it('应该在小数据量时使用虚拟滚动', () => {
    const smallData = mockData.slice(0, 50)
    const { container } = render(
      <VirtualizedTable dataSource={smallData} columns={columns} />
    )

    // 组件始终使用虚拟滚动，检查 ListBox 是否存在
    expect(container.querySelector('[role="listbox"]')).toBeTruthy()
  })

  it('应该在大数据量时使用虚拟滚动', () => {
    const { container } = render(
      <VirtualizedTable dataSource={mockData} columns={columns} />
    )

    // 应该渲染虚拟列表
    expect(container.querySelector('[role="listbox"]')).toBeTruthy()
    expect(container.querySelector('[aria-label="Virtualized List"]')).toBeTruthy()
  })

  it('应该始终使用虚拟滚动渲染', () => {
    const data = mockData.slice(0, 120)

    const { container } = render(
      <VirtualizedTable dataSource={data} columns={columns} />
    )
    expect(container.querySelector('[role="listbox"]')).toBeTruthy()
    expect(container.querySelector('[aria-label="Virtualized List"]')).toBeTruthy()
  })

  it('应该显示加载状态', () => {
    const { container } = render(
      <VirtualizedTable dataSource={mockData} columns={columns} loading={true} />
    )

    // 应该显示加载容器
    const loadingContainer = container.querySelector('.flex.justify-center.p-12')
    expect(loadingContainer).toBeInTheDocument()
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

    // 空数据应该渲染虚拟列表容器，但列表为空
    expect(container.querySelector('[role="listbox"]')).toBeTruthy()
  })
})
