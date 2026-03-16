import { useState, useCallback, useEffect, useMemo } from 'react'
import { useWebSocket, ProgressMessage } from '@/hooks/useWebSocket'
import { mediaApi, MediaFile } from '@/api/media'
import { useQuery, useMutation } from '@tanstack/react-query'
import ProgressMonitor from '@/components/ProgressMonitor'
import SubtitleHub from '@/components/SubtitleHub'
import PageHeader from '@/components/PageHeader'
import { handleError } from '@/utils/errorHandler'
import { debounce } from 'lodash-es'

import { MediaStatsCards } from './components/MediaStatsCards'
import { ScanHistoryPanel } from './components/ScanHistoryPanel'
import { MediaLibraryPanel } from './components/MediaLibraryPanel'

export type ScannerViewMode = 'list' | 'grid'

export interface ScannerFilterOptions {
  resolution: string[]
  hdrType: string[]
  hasChineseSubtitle: boolean | null
}

export default function ScannerPage() {
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedDirectory, setSelectedDirectory] = useState<string | null>(null)
  const [fileTypeFilter, setFileTypeFilter] = useState<string>('all')
  const [scanning, setScanning] = useState(false)
  const [taskId, setTaskId] = useState<string | undefined>(undefined)
  const [currentPage] = useState(1)
  const [pageSize] = useState(50)
  const [subtitleFileId, setSubtitleFileId] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<ScannerViewMode>('list')
  const [filterOptions, setFilterOptions] = useState<ScannerFilterOptions>({
    resolution: [],
    hdrType: [],
    hasChineseSubtitle: null,
  })

  const { data: history, refetch: refetchHistory } = useQuery({
    queryKey: ['scan-history'],
    queryFn: async () => {
      const res = await mediaApi.listScanHistory()
      return res
    },
  })

  const { data: allFiles, refetch, isPending } = useQuery({
    queryKey: [
      'files',
      {
        page: currentPage,
        page_size: pageSize,
        name: searchTerm,
        file_type: fileTypeFilter === 'all' ? undefined : fileTypeFilter,
      },
    ],
    queryFn: () => {
      const params: Record<string, unknown> = { page: currentPage, page_size: pageSize }
      if (searchTerm) params.name = searchTerm
      if (fileTypeFilter !== 'all') params.file_type = fileTypeFilter
      return mediaApi.getFiles(params)
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  })

  const filteredFiles = useMemo(() => {
    let result =
      allFiles?.files?.filter((file) => {
        if (!selectedDirectory) return true
        return file.path.startsWith(selectedDirectory)
      }) || []

    if (filterOptions.resolution.length > 0) {
      result = result.filter((file) => {
        const vInfo = file.video_info
        if (!vInfo?.width || !vInfo?.height) return false
        if (vInfo.width >= 3840 || vInfo.height >= 2160) return filterOptions.resolution.includes('4K')
        if (vInfo.width >= 1920 || vInfo.height >= 1080) return filterOptions.resolution.includes('1080p')
        if (vInfo.width >= 1280 || vInfo.height >= 720) return filterOptions.resolution.includes('720p')
        return false
      })
    }

    if (filterOptions.hdrType.length > 0) {
      result = result.filter((file) => {
        const vInfo = file.video_info
        if (!vInfo) return false
        if (filterOptions.hdrType.includes('DV') && !vInfo.is_dolby_vision) return false
        if (filterOptions.hdrType.includes('HDR10+') && !vInfo.is_hdr10_plus) return false
        if (filterOptions.hdrType.includes('HDR') && !vInfo.is_hdr) return false
        return true
      })
    }

    if (filterOptions.hasChineseSubtitle !== null) {
      result = result.filter((file) => {
        const vInfo = file.video_info
        if (!vInfo) return !filterOptions.hasChineseSubtitle
        return vInfo.has_chinese_subtitle === filterOptions.hasChineseSubtitle
      })
    }

    return result
  }, [allFiles, selectedDirectory, filterOptions])

  const stats = useMemo(() => {
    if (!filteredFiles || filteredFiles.length === 0) {
      return { total: 0, video: 0, audio: 0, image: 0, totalSize: 0, avgQuality: 0 }
    }

    const video = filteredFiles.filter((f) => f.file_type === 'video').length
    const audio = filteredFiles.filter((f) => f.file_type === 'audio').length
    const image = filteredFiles.filter((f) => f.file_type === 'image').length
    const totalSize = filteredFiles.reduce((sum, f) => sum + f.size, 0)

    let totalQuality = 0
    let qualityCount = 0
    filteredFiles.forEach((file) => {
      if (file.quality_score !== undefined) {
        totalQuality += file.quality_score
        qualityCount++
      }
    })

    return {
      total: filteredFiles.length,
      video,
      audio,
      image,
      totalSize,
      avgQuality: qualityCount > 0 ? Number((totalQuality / qualityCount).toFixed(1)) : 0,
    }
  }, [filteredFiles])

  const data = useMemo(() => {
    return {
      ...allFiles,
      files: filteredFiles.slice((currentPage - 1) * pageSize, currentPage * pageSize),
      total: filteredFiles.length,
    }
  }, [allFiles, filteredFiles, currentPage, pageSize])

  const handleSearchChange = useCallback((value: string) => {
    const debouncedFn = debounce((val: string) => {
      setSearchTerm(val)
    }, 500)
    debouncedFn(value)
  }, [])

  const scanMutation = useMutation({
    mutationFn: mediaApi.scanDirectory,
    onSuccess: (data) => {
      setScanning(true)
      setTaskId(data.task_id)
      refetchHistory()
    },
    onError: (error: Error) => {
      handleError(error, '扫描失败')
      setScanning(false)
    },
  })

  const handleRescan = (directory: string) => {
    scanMutation.mutate({
      directory,
      recursive: true,
      file_types: ['video', 'audio', 'image'],
    })
  }

  const { messages } = useWebSocket(`ws://${window.location.host}/ws`)
  useEffect(() => {
    if (taskId && scanning) {
      const taskMessages = messages.filter((m: ProgressMessage) => m.task_id === taskId)
      const latestMessage = taskMessages[taskMessages.length - 1]

      if (latestMessage && latestMessage.progress >= 100) {
        setScanning(false)
        refetch()
        refetchHistory()
      }
    }
  }, [messages, taskId, scanning, refetch, refetchHistory])

  const handleOpenSubtitles = (file: MediaFile) => setSubtitleFileId(file.id)

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="扫描结果" description="查看扫描历史和当前媒体库" />

      <ScanHistoryPanel
        history={history}
        selectedDirectory={selectedDirectory}
        onSelectDirectory={setSelectedDirectory}
        onRefresh={refetchHistory}
        onRescan={handleRescan}
        scanning={scanning}
        taskId={taskId}
      />

      {(scanning || taskId) && (
        <div className="rounded-xl p-4 bg-default-100/30 border border-divider/30">
          <ProgressMonitor taskId={taskId} />
        </div>
      )}

      <MediaStatsCards stats={stats} />

      <MediaLibraryPanel
        title="媒体库"
        total={data?.total || 0}
        selectedDirectory={selectedDirectory}
        onClearDirectory={() => setSelectedDirectory(null)}
        searchTerm={searchTerm}
        onSearchChange={handleSearchChange}
        fileTypeFilter={fileTypeFilter}
        onFileTypeChange={setFileTypeFilter}
        filterOptions={filterOptions}
        onFilterOptionsChange={setFilterOptions}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        files={data?.files || []}
        isPending={isPending}
        onRefresh={refetch}
        onOpenSubtitles={handleOpenSubtitles}
      />

      <SubtitleHub fileId={subtitleFileId || ''} visible={!!subtitleFileId} onClose={() => setSubtitleFileId(null)} />
    </div>
  )
}

