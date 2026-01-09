import { describe, it, expect } from 'vitest'
import { queryClient, queryKeys } from '../queryConfig'

describe('queryConfig', () => {
  describe('queryClient', () => {
    it('应该配置正确的默认选项', () => {
      const defaultOptions = queryClient.getDefaultOptions()
      
      expect(defaultOptions.queries?.staleTime).toBe(5 * 60 * 1000) // 5分钟
      expect(defaultOptions.queries?.gcTime).toBe(10 * 60 * 1000) // 10分钟
      expect(defaultOptions.queries?.retry).toBe(3)
      expect(defaultOptions.queries?.refetchOnWindowFocus).toBe(false)
      expect(defaultOptions.queries?.refetchOnReconnect).toBe(false)
      expect(defaultOptions.queries?.refetchOnMount).toBe(false)
    })

    it('应该配置正确的 mutation 选项', () => {
      const defaultOptions = queryClient.getDefaultOptions()
      
      expect(defaultOptions.mutations?.retry).toBe(1)
      expect(defaultOptions.mutations?.retryDelay).toBe(1000)
    })
  })

  describe('queryKeys', () => {
    it('应该生成正确的文件查询键', () => {
      const key = queryKeys.files({ page: 1, page_size: 50 })
      expect(key).toEqual(['files', { page: 1, page_size: 50 }])
    })

    it('应该生成正确的去重查询键', () => {
      const key = queryKeys.duplicates()
      expect(key).toEqual(['duplicates'])
    })

    it('应该生成正确的回收站查询键', () => {
      const key = queryKeys.trash()
      expect(key).toEqual(['trash'])
    })

    it('应该生成正确的空文件夹查询键', () => {
      const key = queryKeys.emptyDirs()
      expect(key).toEqual(['empty-dirs'])
    })

    it('应该生成正确的大文件查询键', () => {
      const key = queryKeys.largeFiles({ min_size: 1000000 })
      expect(key).toEqual(['large-files', { min_size: 1000000 }])
    })
  })
})
