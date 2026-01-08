import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mediaApi } from '../media'
import api from '../client'

vi.mock('../client', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    interceptors: {
      request: { use: vi.fn() },
      response: { use: vi.fn() },
    },
  },
}))

describe('Media API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('scanDirectory', () => {
    it('应该发送扫描请求', async () => {
      ; (api.post as any).mockResolvedValue({ task_id: 'test-task' })

      const result = await mediaApi.scanDirectory({
        directory: '/test/path',
        recursive: true,
        file_types: ['video'],
      })

      expect(result.task_id).toBe('test-task')
    })

    it('应该处理扫描错误', async () => {
      ; (api.post as any).mockRejectedValue(new Error('Scan failed'))

      await expect(
        mediaApi.scanDirectory({
          directory: '/test/path',
          recursive: true,
          file_types: ['video'],
        })
      ).rejects.toThrow()
    })
  })

  describe('getFiles', () => {
    it('应该获取文件列表', async () => {
      const mockFiles = {
        files: [
          { id: '1', name: 'file1.mp4', size: 1000 },
          { id: '2', name: 'file2.mp4', size: 2000 },
        ],
        total: 2,
        page: 1,
        page_size: 50,
      }

        ; (api.get as any).mockResolvedValue(mockFiles)

      const result = await mediaApi.getFiles({})

      expect(result.files).toHaveLength(2)
      expect(result.total).toBe(2)
    })

    it('应该支持分页参数', async () => {
      ; (api.get as any).mockResolvedValue({ data: { files: [], total: 0 } })

      await mediaApi.getFiles({ page: 2, page_size: 10 })

      expect(api.get).toHaveBeenCalledWith('/files', {
        params: { page: 2, page_size: 10 },
      })
    })

    it('应该支持文件类型过滤', async () => {
      ; (api.get as any).mockResolvedValue({ data: { files: [], total: 0 } })

      await mediaApi.getFiles({ file_type: 'video' })

      expect(api.get).toHaveBeenCalledWith('/files', {
        params: { file_type: 'video' },
      })
    })
  })

  describe('scrapeMetadata', () => {
    it('应该发送刮削请求', async () => {
      const mockMetadata = {
        title: 'Test Movie',
        year: 2024,
      }

        ; (api.post as any).mockResolvedValue({ metadata: mockMetadata })

      const result = await mediaApi.scrapeMetadata({
        file_id: 'test-id',
        source: 'tmdb',
        auto_match: true,
      })

      expect(result.metadata).toEqual(mockMetadata)
    })
  })
})
