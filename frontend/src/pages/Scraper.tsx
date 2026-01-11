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
        } catch {}
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
        if (!metadata) return <Chip size="sm" variant="soft">未刮削</Chip>
        try {
          const data = typeof metadata === 'string' ? JSON.parse(metadata) : metadata
          return (
            <div className="flex items-center gap-2">
              <Chip size="sm" color="success" variant="soft">{data.title || data.name}</Chip>
              {data.poster_url && <Filmstrip className="w-4 h-4 text-muted" />}
              {data.rating && (
                <span className="text-xs text-warning font-medium flex items-center gap-0.5">
                  <Icon icon="mdi:star" className="w-3 h-3" />
                  {data.rating}
                </span>
              )}
            </div>
          )
        } catch {
          return <Chip size="sm" color="accent" variant="soft">已刮削</Chip>
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
          <>
            <Button
              variant="primary"
              onPress={handleBatchScrape}
              isDisabled={selectedFiles.length === 0}
              className="font-medium flex items-center gap-2"
            >
              <MagicWand className="w-4 h-4" />
              批量刮削
            </Button>
          </>
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
      <Surface variant="secondary" className="rounded-xl p-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-6">
            <Checkbox
              id="download-images"
              isSelected={downloadImages}
              onChange={setDownloadImages}
            >
              <Checkbox.Control>
                <Checkbox.Indicator />
              </Checkbox.Control>
              <Checkbox.Content>
                <Label htmlFor="download-images">下载图片</Label>
              </Checkbox.Content>
            </Checkbox>
            <Checkbox
              id="generate-nfo"
              isSelected={generateNfo}
              onChange={setGenerateNfo}
            >
              <Checkbox.Control>
                <Checkbox.Indicator />
              </Checkbox.Control>
              <Checkbox.Content>
                <Label htmlFor="generate-nfo">生成 NFO</Label>
              </Checkbox.Content>
            </Checkbox>
          </div>

          <div className="flex gap-1 ml-auto">
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
        </div>
      </Surface>

      {/* 搜索和筛选栏 */}
      <div className="flex flex-wrap items-center gap-3">
        <SearchField
          className="flex-1 min-w-[200px]"
          value={searchTerm}
          onChange={setSearchTerm}
        >
          <SearchField.Group>
            <SearchField.SearchIcon />
            <SearchField.Input placeholder="搜索文件名..." />
            <SearchField.ClearButton />
          </SearchField.Group>
        </SearchField>

        <Select
          selectedKey={filterStatus}
          onSelectionChange={(keys) => {
            if (!keys) return
            const selected = Array.isArray(Array.from(keys as any)) 
              ? Array.from(keys as any)[0] as string
              : keys as string
            if (selected) {
              setFilterStatus(selected)
            }
          }}
          className="w-[140px]"
        >
          <Select.Trigger>
            <Select.Value />
            <Select.Indicator />
          </Select.Trigger>
          <Select.Popover>
            <ListBox>
              <ListBox.Item key="all">全部</ListBox.Item>
              <ListBox.Item key="scraped">已刮削</ListBox.Item>
              <ListBox.Item key="unscraped">未刮削</ListBox.Item>
            </ListBox>
          </Select.Popover>
        </Select>
      </div>

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
            <Modal.Body>
              <div className="space-y-2">
                {previewMetadata && Array.isArray(previewMetadata) && previewMetadata.length > 0 ? (
                  previewMetadata.map((item: any, idx: number) => (
                    <button
                      key={item.tmdb_id || idx}
                      onClick={() => handleSelectMetadata(item)}
                      className="w-full text-left p-4 rounded-lg hover:bg-default-100 transition-colors border border-divider"
                    >
                      <div className="flex items-start gap-4">
                        {item.poster_url && (
                          <img
                            src={item.poster_url}
                            alt={item.title || item.name}
                            className="w-16 h-24 object-cover rounded-lg shrink-0"
                          />
                        )}
                        <div className="flex-1 min-w-0">
                          <h3 className="text-lg font-semibold mb-1">{item.title || item.name}</h3>
                          {item.overview && (
                            <p className="text-sm text-muted line-clamp-2 mb-2">{item.overview}</p>
                          )}
                          <div className="flex items-center gap-4 text-sm">
                            {item.year && (
                              <span className="text-muted">年份: <span className="font-medium text-foreground">{item.year}</span></span>
                            )}
                            {item.rating && (
                              <span className="text-muted flex items-center gap-1">
                                评分: <span className="font-medium text-warning flex items-center gap-0.5">
                                  <Icon icon="mdi:star" className="w-3 h-3" />
                                  {item.rating}
                                </span>
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </button>
                  ))
                ) : (
                  <div className="text-center py-12 text-muted">
                    未找到搜索结果
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
