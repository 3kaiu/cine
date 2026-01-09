import api from './client'

export interface MediaFile {
  id: string
  path: string
  name: string
  size: number
  file_type: string
  hash_xxhash?: string
  hash_md5?: string
  tmdb_id?: number
  quality_score?: number
  video_info?: VideoInfo
  metadata?: any
  created_at: string
  updated_at: string
  last_modified: string
}

export interface VideoInfo {
  duration?: number
  width?: number
  height?: number
  codec?: string
  bitrate?: number
  format?: string
  audio_codec?: string
  audio_channels?: number
  is_hdr?: boolean
  is_dolby_vision?: boolean
  is_hdr10_plus?: boolean
  source?: string
  has_chinese_subtitle?: boolean
  audio_streams: Array<{
    codec: string
    channels: number
    language?: string
    title?: string
  }>
  subtitle_streams: Array<{
    codec: string
    language?: string
    title?: string
    is_external: boolean
  }>
}

export interface MovieNfo {
  title?: string
  originaltitle?: string
  sorttitle?: string
  rating?: number
  year?: number
  plot?: string
  tagline?: string
  runtime?: number
  thumb?: string
  fanart?: string
  tmdbid?: string
  id?: string
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

export interface OperationLog {
  id: string
  action: 'rename' | 'trash' | 'restore' | 'delete' | 'move' | 'copy'
  file_id?: string
  old_path: string
  new_path?: string
  created_at: string
}

export interface ScanHistory {
  directory: string
  total_files: number
  total_size: number
  file_types_json: string
  last_scanned_at: string
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
    name?: string
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
    tmdb_id?: string
    douban_id?: string
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

  // 按影片查找重复
  findDuplicateMovies: () =>
    api.get<Array<{
      tmdb_id: number
      title: string
      files: MediaFile[]
    }>>('/dedupe/movies'),

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

  // 操作日志相关
  listOperationLogs: () =>
    api.get<OperationLog[]>('/logs'),

  undoOperation: (id: string) =>
    api.post<string>(`/logs/${id}/undo`),

  // 扫描历史相关
  listScanHistory: () =>
    api.get<ScanHistory[]>('/history'),

  // NFO 相关
  getNfo: (fileId: string) =>
    api.get<MovieNfo>(`/files/${fileId}/nfo`),

  updateNfo: (fileId: string, nfo: MovieNfo) =>
    api.put(`/files/${fileId}/nfo`, nfo),
}
