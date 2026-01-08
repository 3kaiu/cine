import { describe, it, expect } from 'vitest'
import { render, screen } from '../../test/utils'
import LoadingWrapper from '../LoadingWrapper'

describe('LoadingWrapper', () => {
  it('应该显示加载状态', () => {
    render(
      <LoadingWrapper loading={true}>
        <div>Content</div>
      </LoadingWrapper>
    )

    expect(screen.getByText('加载中...')).toBeInTheDocument()
  })

  it('应该显示内容当不加载时', () => {
    render(
      <LoadingWrapper loading={false}>
        <div>Content</div>
      </LoadingWrapper>
    )

    expect(screen.getByText('Content')).toBeInTheDocument()
  })

  it('应该使用自定义提示', () => {
    render(
      <LoadingWrapper loading={true} tip="Custom loading...">
        <div>Content</div>
      </LoadingWrapper>
    )

    expect(screen.getByText('Custom loading...')).toBeInTheDocument()
  })
})
