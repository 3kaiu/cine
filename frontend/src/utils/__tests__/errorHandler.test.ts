import { describe, it, expect, vi, beforeEach } from 'vitest'
import { message } from 'antd'
import { formatErrorMessage, handleError } from '../errorHandler'

// Mock antd message
vi.mock('antd', () => ({
  message: {
    error: vi.fn(),
  },
}))

describe('errorHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('formatErrorMessage', () => {
    it('应该处理字符串错误', () => {
      const result = formatErrorMessage('Test error')
      expect(result).toBe('Test error')
    })

    it('应该处理 Error 对象', () => {
      const error = new Error('Test error message')
      const result = formatErrorMessage(error)
      expect(result).toBe('Test error message')
    })

    it('应该处理对象错误', () => {
      const error = { message: 'Object error', code: 500 }
      const result = formatErrorMessage(error)
      expect(result).toBe('Object error')
    })

    it('应该处理网络错误映射', () => {
      const result = formatErrorMessage('Network error')
      expect(result).toBe('网络连接失败，请检查网络后重试')
    })

    it('应该处理文件未找到错误', () => {
      const result = formatErrorMessage('File not found')
      expect(result).toBe('文件未找到')
    })

    it('应该处理未知错误', () => {
      const result = formatErrorMessage(null)
      expect(result).toBe('未知错误')
    })
  })

  describe('handleError', () => {
    it('应该显示错误提示', () => {
      handleError('Test error', undefined, true)
      expect(message.error).toHaveBeenCalledWith('Test error')
    })

    it('应该使用备用消息', () => {
      handleError(null, 'Fallback message', true)
      expect(message.error).toHaveBeenCalledWith('Fallback message')
    })

    it('应该不显示提示当 showToast 为 false', () => {
      handleError('Test error', undefined, false)
      expect(message.error).not.toHaveBeenCalled()
    })
  })
})
