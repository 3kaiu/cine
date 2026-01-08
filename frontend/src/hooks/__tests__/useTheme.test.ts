import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useTheme } from '../useTheme'

describe('useTheme', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.spyOn(window, 'matchMedia').mockReturnValue({
      matches: false,
      media: '',
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    } as any)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('应该初始化主题', () => {
    const { result } = renderHook(() => useTheme())
    
    expect(result.current.isDark).toBe(false)
    expect(result.current.algorithm).toBeDefined()
  })

  it('应该切换主题', () => {
    const { result } = renderHook(() => useTheme())
    
    act(() => {
      result.current.toggleTheme()
    })

    expect(result.current.isDark).toBe(true)
  })

  it('应该从 localStorage 恢复主题', () => {
    localStorage.setItem('theme', 'dark')
    
    const { result } = renderHook(() => useTheme())
    
    expect(result.current.isDark).toBe(true)
  })

  it('应该保存主题到 localStorage', () => {
    const { result } = renderHook(() => useTheme())
    
    act(() => {
      result.current.toggleTheme()
    })

    expect(localStorage.getItem('theme')).toBe('dark')
  })
})
