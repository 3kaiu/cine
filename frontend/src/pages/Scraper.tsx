import { useState, useMemo, useEffect } from 'react'
import { Button, Checkbox, Chip, Card, Modal, Surface, Label, SearchField, ListBox, Select } from "@heroui/react";
import { Icon } from '@iconify/react'
import {
  Filmstrip,
  MagicWand,
  Pencil,
  Check,
} from '@gravity-ui/icons'
import { mediaApi, MediaFile } from '@/api/media'
import { useQuery, useMutation } from '@tanstack/react-query'
import VirtualizedTable from '@/components/VirtualizedTable'
import NfoEditor from '@/components/NfoEditor'
import { handleError } from '@/utils/errorHandler'
import { showSuccess, showBatchProgress, updateBatchProgress, dismissLoading } from '@/utils/toast'
import PageHeader from '@/components/PageHeader'
import StatCard from '@/components/StatCard'

export default function Scraper() {
  const [selectedFile, setSelectedFile] = useState<string | null>(null)
  const [downloadImages, setDownloadImages] = useState(true)
  const [generateNfo, setGenerateNfo] = useState(true)
  const [selectedFiles, setSelectedFiles] = useState<string[]>([])
  const [previewVisible, setPreviewVisible] = useState(false)
  const [previewMetadata, setPreviewMetadata] = useState<any>(null)
  const [editingFileId, setEditingFileId] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list')

  const { data: files, refetch, isPending } = useQuery({
    queryKey: ['files'],
    queryFn: () => mediaApi.getFiles({ file_type: 'video', page_size: 100 })
  })

  // 过滤和搜索
  const filteredFiles = useMemo(() => {
    if (!files?.files) return []

    let result = [...files.files]

    // 搜索过滤
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase()
      result = result.filter((file: MediaFile) =>
        file.name.toLowerCase().includes(term)
      )
    }

    // 状态过滤
    if (filterStatus !== 'all') {
      result = result.filter((file: MediaFile) => {
        const hasMetadata = !!file.metadata
        if (filterStatus === 'scraped') return hasMetadata
        if (filterStatus === 'unscraped') return !hasMetadata
        return true
      })
    }

    return result
  }, [files, searchTerm, filterStatus])

  // 统计数据
  const stats = useMemo(() => {
    if (!files?.files) return { total: 0, scraped: 0, unscraped: 0, avgRating: 0 }

    const scraped = files.files.filter((f: MediaFile) => f.metadata).length
    const unscraped = files.files.length - scraped

    let totalRating = 0
    let ratingCount = 0
    files.files.forEach((file: MediaFile) => {
      if (file.metadata) {
        try {
          const data = typeof file.metadata === 'string' ? JSON.parse(file.metadata) : file.metadata
          if (data.rating) {
            totalRating += data.rating
            ratingCount++
          }
        } catch { }
      }
    })

    return {
      total: files.files.length,
      scraped,
      unscraped,
      avgRating: ratingCount > 0 ? (totalRating / ratingCount).toFixed(1) : 0
    }
  }, [files])

  const currentFile = files?.files?.find((f: any) => f.id === selectedFile)

  const scrapeMutation = useMutation({
    mutationFn: mediaApi.scrapeMetadata,
    onSuccess: () => {
      refetch()
      setPreviewVisible(false)
      showSuccess('元数据刮削成功')
    },
    onError: (error: any) => handleError(error, '刮削失败'),
  })

  // 刮削元数据（支持手动选择）
  const handleScrape = async (fileId: string, autoMatch: boolean = true) => {
    setSelectedFile(fileId)

    if (!autoMatch) {
      // 手动模式：先获取搜索结果供用户选择
      try {
        const result = await mediaApi.scrapeMetadata({
          file_id: fileId,
          source: 'tmdb',
          auto_match: false,
          download_images: false,
          generate_nfo: false,
        })
        if (result.metadata && Array.isArray(result.metadata)) {
          setPreviewMetadata(result.metadata)
          setPreviewVisible(true)
          return
        }
      } catch (e) {
        handleError(e, '获取搜索结果失败')
      }
    }

    // 自动匹配模式：直接应用
    scrapeMutation.mutate({
      file_id: fileId,
      source: 'tmdb',
      auto_match: autoMatch,
      download_images: downloadImages,
      generate_nfo: generateNfo,
    })
  }

  // 选择并应用元数据
  const handleSelectMetadata = (metadata?: any) => {
    if (!selectedFile) return

    scrapeMutation.mutate({
      file_id: selectedFile,
      source: 'tmdb',
      auto_match: !metadata,
      download_images: downloadImages,
      generate_nfo: generateNfo,
      tmdb_id: metadata?.tmdb_id,
    })
    setPreviewVisible(false)
  }

  const handleBatchScrape = async () => {
    if (selectedFiles.length === 0) return

    const toastId = showBatchProgress(0, selectedFiles.length, '正在刮削...')

    for (let i = 0; i < selectedFiles.length; i++) {
      try {
        await mediaApi.scrapeMetadata({
          file_id: selectedFiles[i],
          source: 'tmdb',
          auto_match: true,
          download_images: downloadImages,
          generate_nfo: generateNfo,
        })
        updateBatchProgress(toastId, i + 1, selectedFiles.length, '正在刮削...')
      } catch (e) {
        handleError(e, `刮削失败: ${selectedFiles[i]}`)
      }
    }

    refetch()
    setSelectedFiles([])
    dismissLoading(toastId, `成功刮削 ${selectedFiles.length} 个文件`, 'success')
  }

  // 快捷键支持
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd/Ctrl + A: 全选
      if ((e.metaKey || e.ctrlKey) && e.key === 'a') {
        e.preventDefault()
        if (filteredFiles.length > 0) {
          setSelectedFiles(filteredFiles.map(f => f.id))
        }
      }
      // Cmd/Ctrl + S: 刮削选中
      else if ((e.metaKey || e.ctrlKey) && e.key === 's' && selectedFiles.length > 0) {
        e.preventDefault()
        handleBatchScrape()
      }
      // Cmd/Ctrl + E: 编辑 NFO
      else if ((e.metaKey || e.ctrlKey) && e.key === 'e' && selectedFiles.length === 1) {
        e.preventDefault()
        setEditingFileId(selectedFiles[0])
      }
      // Escape: 清除选择
      else if (e.key === 'Escape') {
        setSelectedFiles([])
        setEditingFileId(null)
      }
      // Cmd/Ctrl + F: 聚焦搜索框
      else if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
        e.preventDefault()
        const searchInput = document.querySelector('input[placeholder*="搜索"]') as HTMLInputElement
        if (searchInput) {
          searchInput.focus()
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [filteredFiles, selectedFiles, handleBatchScrape])

  const columns = [
    {
      title: '文件名',
      dataIndex: 'name',
      key: 'name',
      width: 400,
      render: (text: string) => <span className="text-sm font-medium text-foreground">{text}</span>
    },
    {
      title: '大小',
      dataIndex: 'size',
      key: 'size',
      width: 120,
      render: (size: number) => <span className="text-xs text-muted font-mono">{formatSize(size)}</span>,
    },
    {
      title: '元数据状态',
      dataIndex: 'metadata',
      key: 'metadata',
      width: 300,
      render: (metadata: any) => {
        if (!metadata) return <Chip size="sm" variant="soft" className="h-5 px-1.5 text-[10px] font-bold">未刮削</Chip>
        try {
          const data = typeof metadata === 'string' ? JSON.parse(metadata) : metadata
          return (
            <div className="flex items-center gap-2">
              <Chip size="sm" color="success" variant="soft" className="h-5 px-1.5 text-[10px] font-bold">{data.title || data.name}</Chip>
              {data.poster_url && <Filmstrip className="w-3.5 h-3.5 text-default-400" />}
              {data.rating && (
                <span className="text-[10px] text-warning font-bold flex items-center gap-0.5">
                  <Icon icon="mdi:star" className="w-3 h-3" />
                  {data.rating}
                </span>
              )}
            </div>
          )
        } catch {
          return <Chip size="sm" color="accent" variant="soft" className="h-5 px-1.5 text-[10px] font-bold">已刮削</Chip>
        }
      },
    },
    {
      title: '操作',
      key: 'action',
      width: 150,
      render: (_: any, record: MediaFile) => (
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="ghost"
            onPress={() => handleScrape(record.id, true)}
            isPending={scrapeMutation.isPending && selectedFile === record.id}
            isIconOnly
          >
            <MagicWand className="w-4 h-4" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onPress={() => handleScrape(record.id, false)}
            isPending={scrapeMutation.isPending && selectedFile === record.id}
            isIconOnly
          >
            <Icon icon="mdi:magnify" className="w-4 h-4" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onPress={() => setEditingFileId(record.id)}
            isIconOnly
          >
            <Pencil className="w-4 h-4" />
          </Button>
        </div>
      ),
    },
  ]

  return (
    <div className="flex flex-col gap-4 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <PageHeader
        title="元数据刮削"
        description="从 TMDB 获取元数据并生成 NFO 文件"
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="primary"
              onPress={handleBatchScrape}
              isDisabled={selectedFiles.length === 0}
              className="font-bold flex items-center gap-2 px-4 shadow-none"
            >
              <MagicWand className="w-4 h-4" />
              批量刮削 ({selectedFiles.length})
            </Button>
          </div>
        }
      />

      {/* 统计卡片 */}
      {stats.total > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <StatCard
            label="视频文件"
            value={stats.total}
            icon={<Filmstrip className="w-6 h-6" />}
            color="primary"
            description="库中视频文件总数"
          />
          <StatCard
            label="已刮削"
            value={stats.scraped}
            icon={<Check className="w-6 h-6" />}
            color="success"
            description="已获取元数据的文件"
          />
          <StatCard
            label="未刮削"
            value={stats.unscraped}
            icon={<MagicWand className="w-6 h-6" />}
            color="warning"
            description="待刮削的文件数量"
          />
          <StatCard
            label="平均评分"
            value={stats.avgRating}
            icon={<Icon icon="mdi:star" className="w-6 h-6" />}
            color="accent"
            description="TMDB 平均评分"
          />
        </div>
      )}

      {/* 操作栏 */}
      <Surface variant="default" className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 rounded-xl border border-divider/50 shadow-sm">
        <div className="flex flex-wrap items-center gap-8">
          <div className="flex items-center gap-4">
            <Checkbox
              id="download-images"
              isSelected={downloadImages}
              onChange={setDownloadImages}
              className="group"
            >
              <Checkbox.Control className="w-4 h-4 rounded border-divider/50 group-data-[selected=true]:bg-primary group-data-[selected=true]:border-primary transition-colors">
                <Checkbox.Indicator className="w-2.5 h-2.5" />
              </Checkbox.Control>
              <Checkbox.Content>
                <Label htmlFor="download-images" className="text-sm font-bold text-default-600 select-none cursor-pointer">下载图片</Label>
              </Checkbox.Content>
            </Checkbox>
            <Checkbox
              id="generate-nfo"
              isSelected={generateNfo}
              onChange={setGenerateNfo}
              className="group"
            >
              <Checkbox.Control className="w-4 h-4 rounded border-divider/50 group-data-[selected=true]:bg-primary group-data-[selected=true]:border-primary transition-colors">
                <Checkbox.Indicator className="w-2.5 h-2.5" />
              </Checkbox.Control>
              <Checkbox.Content>
                <Label htmlFor="generate-nfo" className="text-sm font-bold text-default-600 select-none cursor-pointer">生成 NFO</Label>
              </Checkbox.Content>
            </Checkbox>
          </div>

          <div className="w-px h-4 bg-divider/20" />

          <div className="flex bg-default-100/50 p-1 rounded-lg border border-divider/20">
            <Button
              isIconOnly
              size="sm"
              variant={viewMode === 'list' ? 'primary' : 'ghost'}
              onPress={() => setViewMode('list')}
              className="w-8 h-7 rounded-md"
            >
              <Icon icon="mdi:view-list" className="w-4 h-4" />
            </Button>
            <Button
              isIconOnly
              size="sm"
              variant={viewMode === 'grid' ? 'primary' : 'ghost'}
              onPress={() => setViewMode('grid')}
              className="w-8 h-7 rounded-md"
            >
              <Icon icon="mdi:view-grid" className="w-4 h-4" />
            </Button>
          </div>
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto">
          <SearchField
            className="flex-1 sm:w-[240px]"
            value={searchTerm}
            onChange={setSearchTerm}
          >
            <SearchField.Group className="bg-default-100/50 border border-divider/20 focus-within:border-primary/50 transition-colors h-9">
              <SearchField.SearchIcon className="text-default-400" />
              <SearchField.Input placeholder="搜索文件名..." className="text-sm" />
              <SearchField.ClearButton />
            </SearchField.Group>
          </SearchField>

          <div className="flex items-center gap-2 bg-default-100/50 px-2 py-1 rounded-md border border-divider/20">
            <span className="text-[11px] font-bold text-default-500 uppercase tracking-wider">状态</span>
            <Select
              selectedKey={filterStatus}
              onSelectionChange={(keys) => {
                if (!keys) return
                const selected = Array.from(keys as any)[0] as string
                if (selected) {
                  setFilterStatus(selected)
                }
              }}
              className="w-[120px]"
            >
              <Select.Trigger className="h-7 min-h-0 bg-transparent border-none shadow-none text-xs font-bold">
                <Select.Value />
                <Select.Indicator />
              </Select.Trigger>
              <Select.Popover>
                <ListBox className="text-xs">
                  <ListBox.Item key="all">全部文件</ListBox.Item>
                  <ListBox.Item key="scraped">已刮削</ListBox.Item>
                  <ListBox.Item key="unscraped">未刮削</ListBox.Item>
                </ListBox>
              </Select.Popover>
            </Select>
          </div>
        </div>
      </Surface>

      {/* 文件列表 */}
      <div className="flex-1 min-h-0">
        {viewMode === 'list' ? (
          <Surface className="rounded-xl overflow-hidden" variant="default">
            <VirtualizedTable<MediaFile>
              columns={columns}
              dataSource={filteredFiles}
              height={600}
              rowHeight={56}
              loading={isPending}
              selectionMode="multiple"
              selectedKeys={new Set(selectedFiles)}
              onSelectionChange={(keys) => {
                if (keys === "all") {
                  setSelectedFiles(filteredFiles.map((f: any) => f.id) || [])
                } else {
                  setSelectedFiles(Array.from(keys) as string[])
                }
              }}
            />
          </Surface>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredFiles.map((file: MediaFile) => (
              <Card key={file.id} className="overflow-hidden">
                <Card.Content className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate mb-2">{file.name}</p>
                      <p className="text-xs text-muted mb-3">{formatSize(file.size)}</p>
                      {file.metadata ? (
                        <div className="flex items-center gap-2">
                          <Chip size="sm" color="success" variant="soft">已刮削</Chip>
                        </div>
                      ) : (
                        <Chip size="sm" variant="soft">未刮削</Chip>
                      )}
                    </div>
                    <div className="flex gap-1">
                      <Button
                        isIconOnly
                        size="sm"
                        variant="ghost"
                        onPress={() => handleScrape(file.id, true)}
                        isPending={scrapeMutation.isPending && selectedFile === file.id}
                      >
                        <MagicWand className="w-4 h-4" />
                      </Button>
                      <Button
                        isIconOnly
                        size="sm"
                        variant="ghost"
                        onPress={() => setEditingFileId(file.id)}
                      >
                        <Pencil className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </Card.Content>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* 搜索结果选择模态框 */}
      <Modal.Backdrop isOpen={previewVisible} onOpenChange={setPreviewVisible}>
        <Modal.Container size="lg" scroll="inside">
          <Modal.Dialog className="max-h-[85vh]">
            <Modal.CloseTrigger />
            <Modal.Header>
              <Modal.Icon className="bg-accent-soft text-accent-soft-foreground">
                <MagicWand className="w-5 h-5" />
              </Modal.Icon>
              <Modal.Heading>选择元数据</Modal.Heading>
              {currentFile && (
                <p className="text-sm text-muted mt-1">{currentFile.name}</p>
              )}
            </Modal.Header>
            <Modal.Body className="p-0">
              <div className="flex flex-col">
                {previewMetadata && Array.isArray(previewMetadata) && previewMetadata.length > 0 ? (
                  previewMetadata.map((item: any, idx: number) => (
                    <button
                      key={item.tmdb_id || idx}
                      onClick={() => handleSelectMetadata(item)}
                      className="w-full text-left p-4 hover:bg-default-100 transition-colors border-b border-divider/50 last:border-b-0 flex items-start gap-4 group"
                    >
                      {item.poster_url && (
                        <div className="relative w-16 h-24 shrink-0 rounded-md overflow-hidden shadow-sm border border-divider/20 group-hover:border-primary/50 transition-colors">
                          <img
                            src={item.poster_url}
                            alt={item.title || item.name}
                            className="w-full h-full object-cover"
                          />
                        </div>
                      )}
                      <div className="flex-1 min-w-0 py-1">
                        <h3 className="text-sm font-bold mb-1.5 group-hover:text-primary transition-colors">{item.title || item.name}</h3>
                        {item.overview && (
                          <p className="text-[11px] text-default-400 line-clamp-2 mb-2 font-medium leading-relaxed">{item.overview}</p>
                        )}
                        <div className="flex items-center gap-4">
                          {item.year && (
                            <span className="text-[10px] font-black text-default-400 uppercase tracking-widest">
                              年份 <span className="text-foreground ml-1">{item.year}</span>
                            </span>
                          )}
                          {item.rating && (
                            <div className="flex items-center gap-1">
                              <span className="text-[10px] font-black text-default-400 uppercase tracking-widest">评分</span>
                              <span className="text-[10px] font-bold text-warning flex items-center gap-0.5 ml-1">
                                <Icon icon="mdi:star" className="w-3 h-3" />
                                {item.rating}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                      <Icon icon="mdi:chevron-right" className="w-5 h-5 text-default-300 self-center group-hover:text-primary transition-colors" />
                    </button>
                  ))
                ) : (
                  <div className="text-center py-20 text-default-400">
                    <Icon icon="mdi:movie-search" className="w-12 h-12 mx-auto mb-3 opacity-20" />
                    <p className="text-sm font-medium">未找到匹配的媒体信息</p>
                  </div>
                )}
              </div>
            </Modal.Body>
            <Modal.Footer>
              <Button variant="ghost" slot="close">
                取消
              </Button>
              <Button variant="primary" onPress={() => handleSelectMetadata()}>
                自动匹配第一个
              </Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>

      <NfoEditor
        fileId={editingFileId || ''}
        visible={!!editingFileId}
        onClose={() => setEditingFileId(null)}
      />
    </div>
  )
}


function formatSize(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let size = bytes
  let unitIndex = 0

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024
    unitIndex++
  }

  return `${size.toFixed(2)} ${units[unitIndex]}`
}
