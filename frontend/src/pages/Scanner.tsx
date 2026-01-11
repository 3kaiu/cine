import { useState, useCallback, useEffect, useMemo } from 'react'
import { useWebSocket } from '@/hooks/useWebSocket'
import { Button, Chip, Card, SearchField, Surface, Select, ListBox, Popover } from "@heroui/react";
import { Icon } from '@iconify/react'
import {
  ArrowRotateLeft,
  Text,
  Clock,
} from '@gravity-ui/icons'
import { mediaApi, MediaFile, ScanHistory } from '@/api/media'
import { useQuery, useMutation } from '@tanstack/react-query'
import ProgressMonitor from '@/components/ProgressMonitor'
import VirtualizedTable from '@/components/VirtualizedTable'
import { handleError } from '@/utils/errorHandler'
import { debounce } from 'lodash-es'
import SubtitleHub from '@/components/SubtitleHub'
import PageHeader from '@/components/PageHeader'
import StatCard from '@/components/StatCard'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'

dayjs.extend(relativeTime)

export default function Scanner() {
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedDirectory, setSelectedDirectory] = useState<string | null>(null)
  const [fileTypeFilter, setFileTypeFilter] = useState<string>('all')
  const [scanning, setScanning] = useState(false)
  const [taskId, setTaskId] = useState<string | undefined>(undefined)
  const [currentPage] = useState(1)
  const [pageSize] = useState(50)
  const [subtitleFileId, setSubtitleFileId] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list')
  const [filterPopover, setFilterPopover] = useState(false)
  const [filterOptions, setFilterOptions] = useState({
    resolution: [] as string[],
    hdrType: [] as string[],
    hasChineseSubtitle: null as boolean | null
  })

  const { data: history, refetch: refetchHistory } = useQuery({
    queryKey: ['scan-history'],
    queryFn: async () => {
      const res = await mediaApi.listScanHistory()
      return res
    }
  })

  const { data: allFiles, refetch, isPending } = useQuery({
    queryKey: ['files', { page: currentPage, page_size: 10000, name: searchTerm, file_type: fileTypeFilter === 'all' ? undefined : fileTypeFilter }],
    queryFn: () => {
      const params: any = { page: currentPage, page_size: 10000 }
      if (searchTerm) params.name = searchTerm
      if (fileTypeFilter !== 'all') params.file_type = fileTypeFilter
      return mediaApi.getFiles(params)
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  })

  // 根据选中的目录过滤文件
  const filteredFiles = useMemo(() => {
    let result = allFiles?.files?.filter(file => {
      if (!selectedDirectory) return true
      return file.path.startsWith(selectedDirectory)
    }) || []
    
    // 高级筛选
    if (filterOptions.resolution.length > 0) {
      result = result.filter(file => {
        const vInfo = file.video_info
        if (!vInfo?.width || !vInfo?.height) return false
        if (vInfo.width >= 3840 || vInfo.height >= 2160) return filterOptions.resolution.includes('4K')
        if (vInfo.width >= 1920 || vInfo.height >= 1080) return filterOptions.resolution.includes('1080p')
        if (vInfo.width >= 1280 || vInfo.height >= 720) return filterOptions.resolution.includes('720p')
        return false
      })
    }
    
    if (filterOptions.hdrType.length > 0) {
      result = result.filter(file => {
        const vInfo = file.video_info
        if (!vInfo) return false
        if (filterOptions.hdrType.includes('DV') && !vInfo.is_dolby_vision) return false
        if (filterOptions.hdrType.includes('HDR10+') && !vInfo.is_hdr10_plus) return false
        if (filterOptions.hdrType.includes('HDR') && !vInfo.is_hdr) return false
        return true
      })
    }
    
    if (filterOptions.hasChineseSubtitle !== null) {
      result = result.filter(file => {
        const vInfo = file.video_info
        if (!vInfo) return !filterOptions.hasChineseSubtitle
        return vInfo.has_chinese_subtitle === filterOptions.hasChineseSubtitle
      })
    }
    
    return result
  }, [allFiles, selectedDirectory, filterOptions])

  // 统计数据
  const stats = useMemo(() => {
    if (!filteredFiles || filteredFiles.length === 0) {
      return { total: 0, video: 0, audio: 0, image: 0, totalSize: 0, avgQuality: 0 }
    }
    
    const video = filteredFiles.filter(f => f.file_type === 'video').length
    const audio = filteredFiles.filter(f => f.file_type === 'audio').length
    const image = filteredFiles.filter(f => f.file_type === 'image').length
    const totalSize = filteredFiles.reduce((sum, f) => sum + f.size, 0)
    
    let totalQuality = 0
    let qualityCount = 0
    filteredFiles.forEach(file => {
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
      avgQuality: qualityCount > 0 ? (totalQuality / qualityCount).toFixed(1) : 0
    }
  }, [filteredFiles])

  const data = {
    ...allFiles,
    files: filteredFiles.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    total: filteredFiles.length,
  }

  // 搜索防抖
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
    onError: (error: any) => {
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

  // 监听扫描完成
  const { messages } = useWebSocket(`ws://${window.location.host}/ws`)
  useEffect(() => {
    if (taskId && scanning) {
      const taskMessages = messages.filter(m => m.task_id === taskId)
      const latestMessage = taskMessages[taskMessages.length - 1]
      
      if (latestMessage && latestMessage.progress >= 100) {
        setScanning(false)
        refetch()
        refetchHistory()
      }
    }
  }, [messages, taskId, scanning, refetch, refetchHistory])

  const columns = [
    {
      title: '文件名',
      dataIndex: 'name',
      key: 'name',
      width: 400,
      render: (text: string) => <span className="text-sm font-medium text-foreground">{text}</span>
    },
    {
      title: '类型',
      dataIndex: 'file_type',
      key: 'file_type',
      width: 100,
      render: (type: string) => (
        <Chip size="sm" variant="soft" color={type === 'video' ? 'accent' : type === 'audio' ? 'warning' : 'default'}>
          {type.toUpperCase()}
        </Chip>
      )
    },
    {
      title: '大小',
      dataIndex: 'size',
      key: 'size',
      width: 120,
      render: (size: number) => <span className="text-xs text-muted font-mono">{formatSize(size)}</span>,
    },
    {
      title: '画质',
      key: 'quality',
      width: 250,
      render: (_: any, record: MediaFile) => (
        <div className="flex gap-1.5 flex-wrap">
          {record.quality_score !== undefined && (
            <Chip size="sm" color={record.quality_score > 70 ? 'success' : 'warning'} variant="soft">
              {record.quality_score}
            </Chip>
          )}
          {record.video_info?.is_dolby_vision && <Chip size="sm" color="warning" variant="soft">DV</Chip>}
          {record.video_info?.is_hdr10_plus && <Chip size="sm" color="warning" variant="soft">HDR10+</Chip>}
          {record.video_info?.is_hdr && !record.video_info?.is_dolby_vision && <Chip size="sm" color="warning" variant="soft">HDR</Chip>}
          {record.video_info?.source && <Chip size="sm" variant="soft">{record.video_info.source}</Chip>}
          {record.video_info?.has_chinese_subtitle && <Chip size="sm" color="accent" variant="soft">中字</Chip>}
        </div>
      )
    },
    {
      title: '操作',
      key: 'action',
      width: 100,
      render: (_: any, record: MediaFile) => (
        <Button
          size="sm"
          variant="ghost"
          onPress={() => setSubtitleFileId(record.id)}
        >
          <Text className="w-4 h-4" />
          字幕
        </Button>
      )
    },
  ]


  // 解析文件类型统计
  const parseFileTypes = (fileTypesJson: string) => {
    try {
      return JSON.parse(fileTypesJson || '{}')
    } catch {
      return {}
    }
  }

  // 格式化文件大小
  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 B'
    const units = ['B', 'KB', 'MB', 'GB', 'TB']
    let size = bytes
    let unitIndex = 0

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024
      unitIndex++
    }

    return `${size.toFixed(2)} ${units[unitIndex]}`
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="扫描结果"
        description="查看扫描历史和当前媒体库"
      />

      {/* 扫描历史列表 */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Clock className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-semibold">扫描历史</h2>
            {history && history.length > 0 && (
              <Chip color="accent" variant="soft" size="sm">
                {history.length} 个目录
              </Chip>
            )}
          </div>
          <Button
            isIconOnly
            variant="ghost"
            onPress={() => refetchHistory()}
          >
            <Icon icon="mdi:refresh" className="w-4 h-4" />
          </Button>
        </div>

        {history && history.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {history.map((item: ScanHistory) => {
              const fileTypes = parseFileTypes(item.file_types_json)
              const isSelected = selectedDirectory === item.directory
              
              return (
                <Card key={item.directory} className={isSelected ? 'ring-2 ring-primary' : ''}>
                  <Card.Header>
                    <div className="flex flex-col gap-2 w-full">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <Card.Title className="text-sm truncate" title={item.directory}>
                            {item.directory === "/" ? "根目录" : item.directory.split("/").pop() || "根目录"}
                          </Card.Title>
                          <Card.Description className="text-xs truncate mt-1" title={item.directory}>
                            {item.directory}
                          </Card.Description>
                        </div>
                        <Button
                          isIconOnly
                          size="sm"
                          variant={isSelected ? 'primary' : 'ghost'}
                          onPress={() => setSelectedDirectory(isSelected ? null : item.directory)}
                        >
                          <Icon icon={isSelected ? "mdi:check-circle" : "mdi:circle-outline"} className="w-4 h-4" />
                        </Button>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted">
                        <Clock className="w-3 h-3" />
                        <span>{dayjs(item.last_scanned_at).fromNow()}</span>
                      </div>
                    </div>
                  </Card.Header>
                  <Card.Content>
                    <div className="flex flex-col gap-3">
                      <div className="flex items-center justify-between">
                        <div className="flex flex-col gap-1">
                          <span className="text-xs text-muted">文件数量</span>
                          <span className="text-sm font-semibold">{item.total_files.toLocaleString()}</span>
                        </div>
                        <div className="flex flex-col gap-1 items-end">
                          <span className="text-xs text-muted">总大小</span>
                          <span className="text-sm font-semibold">{formatFileSize(item.total_size)}</span>
                        </div>
                      </div>
                      
                      {Object.keys(fileTypes).length > 0 && (
                        <div className="flex gap-1.5 flex-wrap">
                          {Object.entries(fileTypes).map(([type, count]: [string, any]) => (
                            <Chip key={type} size="sm" variant="soft" color={type === 'video' ? 'accent' : type === 'audio' ? 'warning' : 'default'}>
                              {type}: {count}
                            </Chip>
                          ))}
                        </div>
                      )}

                      <Button
                        size="sm"
                        variant="primary"
                        fullWidth
                        onPress={() => handleRescan(item.directory)}
                        isPending={scanning && taskId !== undefined}
                      >
                        <ArrowRotateLeft className="w-4 h-4" />
                        重新扫描
                      </Button>
                    </div>
                  </Card.Content>
                </Card>
              )
            })}
          </div>
        ) : (
          <Surface variant="secondary" className="rounded-xl p-12 text-center border border-divider">
            <div className="flex flex-col items-center gap-3">
              <div className="p-4 bg-default-100 rounded-full">
                <Icon icon="mdi:history" className="w-8 h-8 text-default-400" />
              </div>
              <div className="flex flex-col gap-1">
                <p className="text-sm font-semibold text-foreground">暂无扫描历史</p>
                <p className="text-xs text-default-400">前往工作流页面开始扫描</p>
              </div>
            </div>
          </Surface>
        )}
      </div>

      {(scanning || taskId) && (
        <Surface variant="secondary" className="rounded-xl p-4">
          <ProgressMonitor taskId={taskId} />
        </Surface>
      )}

      {/* 统计卡片 */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <StatCard
          label="总文件"
          value={stats.total}
          icon={<Icon icon="mdi:file-multiple" className="w-6 h-6" />}
          color="primary"
          description="媒体库文件总数"
        />
        <StatCard
          label="视频"
          value={stats.video}
          icon={<Icon icon="mdi:video" className="w-6 h-6" />}
          color="accent"
          description="视频文件数量"
        />
        <StatCard
          label="总大小"
          value={formatFileSize(stats.totalSize)}
          icon={<Icon icon="mdi:harddisk" className="w-6 h-6" />}
          color="warning"
          description="占用存储空间"
        />
        <StatCard
          label="平均质量"
          value={stats.avgQuality}
          icon={<Icon icon="mdi:star" className="w-6 h-6" />}
          color="success"
          description="视频平均质量"
        />
      </div>

      {/* 媒体库 */}
      <div className="flex-1 min-h-0">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div className="flex items-center gap-3 flex-wrap">
              <h2 className="text-lg font-semibold">媒体库</h2>
              <Chip color="accent" variant="soft" size="sm">
                {(data?.total || 0).toLocaleString()} 文件
              </Chip>
              {selectedDirectory && (
                <Chip 
                  color="accent" 
                  variant="soft" 
                  size="sm"
                >
                  {selectedDirectory.split("/").pop() || selectedDirectory}
                  <Button
                    isIconOnly
                    size="sm"
                    variant="ghost"
                    className="ml-1 h-auto min-w-0 p-0"
                    onPress={() => setSelectedDirectory(null)}
                  >
                    <Icon icon="mdi:close" className="w-3 h-3" />
                  </Button>
                </Chip>
              )}
            </div>
            <div className="flex gap-2 w-full sm:w-auto items-center">
              <Select
                selectedKey={fileTypeFilter}
                onSelectionChange={(keys) => {
                  if (!keys) return
                  const selected = Array.isArray(Array.from(keys as any)) 
                    ? Array.from(keys as any)[0] as string
                    : keys as string
                  if (selected) {
                    setFileTypeFilter(selected)
                  }
                }}
                className="min-w-[140px]"
                placeholder="文件类型"
              >
                <Select.Trigger>
                  <Select.Value />
                  <Select.Indicator />
                </Select.Trigger>
                <Select.Popover>
                  <ListBox>
                    <ListBox.Item key="all">全部类型</ListBox.Item>
                    <ListBox.Item key="video">视频</ListBox.Item>
                    <ListBox.Item key="audio">音频</ListBox.Item>
                    <ListBox.Item key="image">图片</ListBox.Item>
                  </ListBox>
                </Select.Popover>
              </Select>
              
              <Popover isOpen={filterPopover} onOpenChange={setFilterPopover}>
                <Popover.Trigger>
                  <Button
                    isIconOnly
                    size="sm"
                    variant={filterOptions.resolution.length > 0 || filterOptions.hdrType.length > 0 || filterOptions.hasChineseSubtitle !== null ? 'primary' : 'ghost'}
                  >
                    <Icon icon="mdi:filter" className="w-4 h-4" />
                  </Button>
                </Popover.Trigger>
                <Popover.Content className="p-4 w-[280px]">
                  <div className="flex flex-col gap-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold">高级筛选</span>
                      <Button
                        size="sm"
                        variant="ghost"
                        onPress={() => setFilterOptions({ resolution: [], hdrType: [], hasChineseSubtitle: null })}
                      >
                        清除
                      </Button>
                    </div>
                    
                    <div>
                      <p className="text-xs text-default-500 mb-2">分辨率</p>
                      <div className="flex flex-wrap gap-2">
                        {['4K', '1080p', '720p'].map(res => (
                          <Button
                            key={res}
                            size="sm"
                            variant={filterOptions.resolution.includes(res) ? 'primary' : 'ghost'}
                            onPress={() => {
                              setFilterOptions(prev => ({
                                ...prev,
                                resolution: prev.resolution.includes(res)
                                  ? prev.resolution.filter(r => r !== res)
                                  : [...prev.resolution, res]
                              }))
                            }}
                          >
                            {res}
                          </Button>
                        ))}
                      </div>
                    </div>
                    
                    <div>
                      <p className="text-xs text-default-500 mb-2">HDR 类型</p>
                      <div className="flex flex-wrap gap-2">
                        {['DV', 'HDR10+', 'HDR'].map(hdr => (
                          <Button
                            key={hdr}
                            size="sm"
                            variant={filterOptions.hdrType.includes(hdr) ? 'primary' : 'ghost'}
                            onPress={() => {
                              setFilterOptions(prev => ({
                                ...prev,
                                hdrType: prev.hdrType.includes(hdr)
                                  ? prev.hdrType.filter(h => h !== hdr)
                                  : [...prev.hdrType, hdr]
                              }))
                            }}
                          >
                            {hdr}
                          </Button>
                        ))}
                      </div>
                    </div>
                    
                    <div>
                      <p className="text-xs text-default-500 mb-2">中文字幕</p>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant={filterOptions.hasChineseSubtitle === true ? 'primary' : 'ghost'}
                          onPress={() => setFilterOptions(prev => ({ ...prev, hasChineseSubtitle: prev.hasChineseSubtitle === true ? null : true }))}
                        >
                          有
                        </Button>
                        <Button
                          size="sm"
                          variant={filterOptions.hasChineseSubtitle === false ? 'primary' : 'ghost'}
                          onPress={() => setFilterOptions(prev => ({ ...prev, hasChineseSubtitle: prev.hasChineseSubtitle === false ? null : false }))}
                        >
                          无
                        </Button>
                      </div>
                    </div>
                  </div>
                </Popover.Content>
              </Popover>
              
              <SearchField
                className="flex-1 sm:w-[300px]"
                value={searchTerm}
                onChange={handleSearchChange}
              >
                <SearchField.Group>
                  <SearchField.SearchIcon />
                  <SearchField.Input placeholder="搜索文件名..." />
                  <SearchField.ClearButton />
                </SearchField.Group>
              </SearchField>
              
              <div className="flex gap-1">
                <Button
                  isIconOnly
                  size="sm"
                  variant={viewMode === 'list' ? 'primary' : 'ghost'}
                  onPress={() => setViewMode('list')}
                >
                  <Icon icon="mdi:view-list" className="w-4 h-4" />
                </Button>
                <Button
                  isIconOnly
                  size="sm"
                  variant={viewMode === 'grid' ? 'primary' : 'ghost'}
                  onPress={() => setViewMode('grid')}
                >
                  <Icon icon="mdi:view-grid" className="w-4 h-4" />
                </Button>
              </div>
              
              <Button
                isIconOnly
                variant="ghost"
                onPress={() => refetch()}
              >
                <Icon icon="mdi:refresh" className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {viewMode === 'list' ? (
            <Surface className="rounded-xl overflow-hidden" variant="default">
              <VirtualizedTable<MediaFile>
                columns={columns}
                dataSource={data?.files || []}
                height={600}
                rowHeight={52}
                loading={isPending}
              />
            </Surface>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {data?.files.map((file: MediaFile) => (
                <Card key={file.id} className="overflow-hidden">
                  <Card.Content className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate mb-2">{file.name}</p>
                        <div className="flex items-center gap-2 mb-3">
                          <Chip size="sm" variant="soft" color={file.file_type === 'video' ? 'accent' : file.file_type === 'audio' ? 'warning' : 'default'}>
                            {file.file_type.toUpperCase()}
                          </Chip>
                          <span className="text-xs text-muted">{formatSize(file.size)}</span>
                        </div>
                        <div className="flex gap-1.5 flex-wrap">
                          {file.quality_score !== undefined && (
                            <Chip size="sm" color={file.quality_score > 70 ? 'success' : 'warning'} variant="soft">
                              {file.quality_score}
                            </Chip>
                          )}
                          {file.video_info?.is_dolby_vision && <Chip size="sm" color="warning" variant="soft">DV</Chip>}
                          {file.video_info?.is_hdr10_plus && <Chip size="sm" color="warning" variant="soft">HDR10+</Chip>}
                          {file.video_info?.is_hdr && !file.video_info?.is_dolby_vision && <Chip size="sm" color="warning" variant="soft">HDR</Chip>}
                          {file.video_info?.has_chinese_subtitle && <Chip size="sm" color="accent" variant="soft">中字</Chip>}
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        onPress={() => setSubtitleFileId(file.id)}
                      >
                        <Text className="w-4 h-4" />
                      </Button>
                    </div>
                  </Card.Content>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>

      <SubtitleHub
        fileId={subtitleFileId || ''}
        visible={!!subtitleFileId}
        onClose={() => setSubtitleFileId(null)}
      />
    </div>
  )
}

function formatSize(bytes: number): string {
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let size = bytes
  let unitIndex = 0

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024
    unitIndex++
  }

  return `${size.toFixed(2)} ${units[unitIndex]}`
}
