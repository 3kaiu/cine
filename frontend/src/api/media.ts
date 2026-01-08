import api from './client'

export interface MediaFile {
  id: string
  path: string
  name: string
  size: number
  file_type: string
  hash_xxhash?: string
  hash_md5?: string
  video_info?: any
  metadata?: any
  created_at: string
  updated_at: string
  last_modified: string
}

export interface ScanRequest {
  directory: string
  recursive?: boolean
  file_types?: string[]
}

export interface ScanResponse {
  task_id: string
  message: string
}

export const mediaApi = {
  // 扫描目录
  scanDirectory: (data: ScanRequest) =>
    api.post<ScanResponse>('/scan', data),

  // 获取文件列表
  getFiles: (params?: {
    page?: number
    page_size?: number
    file_type?: string
    min_size?: number
    max_size?: number
  }) => api.get<{
    files: MediaFile[]
    total: number
    page: number
    page_size: number
  }>('/files', { params }),

  // 计算文件哈希
  calculateHash: (fileId: string) =>
    api.post<{ task_id: string; message: string }>(`/files/${fileId}/hash`),

  // 获取视频信息
  getVideoInfo: (fileId: string) =>
    api.get<{ info?: any; error?: string }>(`/files/${fileId}/info`),

  // 刮削元数据
  scrapeMetadata: (data: {
    file_id: string
    source?: string
    auto_match?: boolean
    download_images?: boolean
    generate_nfo?: boolean
  }) => api.post<{
    metadata?: any
    error?: string
    poster_path?: string
    backdrop_path?: string
    nfo_path?: string
  }>('/scrape', data),

  // 批量刮削元数据
  batchScrapeMetadata: (data: {
    file_ids: string[]
    source?: string
    auto_match?: boolean
    download_images?: boolean
    generate_nfo?: boolean
  }) => api.post<{
    results: Array<{
      file_id: string
      file_name: string
      success: boolean
      metadata?: any
      error?: string
    }>
    total: number
    success: number
    failed: number
  }>('/scrape/batch', data),

  // 批量重命名
  batchRename: (data: {
    file_ids: string[]
    template: string
    preview?: boolean
  }) => api.post<{
    preview: Array<{
      file_id: string
      old_name: string
      new_name: string
    }>
    message: string
  }>('/rename', data),

  // 查找重复文件
  findDuplicates: () =>
    api.post<{
      groups: Array<{
        hash: string
        files: MediaFile[]
        total_size: number
      }>
      total_duplicates: number
      total_wasted_space: number
    }>('/dedupe'),

  // 查找大文件
  findLargeFiles: () =>
    api.get<MediaFile[]>('/large-files'),

  // 查找空文件夹
  findEmptyDirs: (params?: {
    directory?: string
    recursive?: boolean
    category?: string
  }) =>
    api.get<{
      dirs: Array<{
        path: string
        category: string
        depth: number
      }>
      total: number
      by_category: Record<string, number>
    }>('/empty-dirs', { params }),

  // 删除空文件夹
  deleteEmptyDirs: (dirs: string[]) =>
    api.post<{
      deleted: string[]
      message: string
    }>('/empty-dirs/delete', { dirs }),

  // 查找字幕文件
  findSubtitles: (fileId: string, params?: { subtitle_dir?: string }) =>
    api.get<{
      subtitles: Array<{
        path: string
        language: string
        format: string
        size: number
      }>
      total: number
    }>(`/files/${fileId}/subtitles`, { params }),

  // 移动文件
  moveFile: (data: { file_id: string; target_dir: string }) =>
    api.post<{ result: { file_id: string; success: boolean; new_path?: string; error?: string } }>(
      `/files/${data.file_id}/move`,
      { target_dir: data.target_dir }
    ),

  // 复制文件
  copyFile: (data: { file_id: string; target_dir: string }) =>
    api.post<{ result: { file_id: string; success: boolean; new_path?: string; error?: string } }>(
      `/files/${data.file_id}/copy`,
      { target_dir: data.target_dir }
    ),

  // 批量移动文件
  batchMoveFiles: (data: { file_ids: string[]; target_dir: string }) =>
    api.post<{
      results: Array<{ file_id: string; success: boolean; new_path?: string; error?: string }>
      total: number
      success: number
      failed: number
    }>('/files/batch-move', data),

  // 批量复制文件
  batchCopyFiles: (data: { file_ids: string[]; target_dir: string }) =>
    api.post<{
      results: Array<{ file_id: string; success: boolean; new_path?: string; error?: string }>
      total: number
      success: number
      failed: number
    }>('/files/batch-copy', data),

  // 回收站相关
  listTrash: () =>
    api.get<{
      items: Array<{
        id: string
        original_path: string
        original_name: string
        trash_path: string
        file_size: number
        deleted_at: string
        file_type: string
      }>
      total: number
    }>('/trash'),

  moveToTrash: (fileId: string) =>
    api.post<{
      id: string
      original_path: string
      original_name: string
      trash_path: string
      file_size: number
      deleted_at: string
      file_type: string
    }>(`/trash/${fileId}`),

  restoreFromTrash: (data: { file_id: string; target_path?: string }) =>
    api.post<{
      restored_path: string
      message: string
    }>(`/trash/${data.file_id}/restore`, { target_path: data.target_path }),

  permanentlyDelete: (fileId: string) =>
    api.delete<{ message: string }>(`/trash/${fileId}`),

  cleanupTrash: () =>
    api.post<{ deleted_count: number; message: string }>('/trash/cleanup'),
}
