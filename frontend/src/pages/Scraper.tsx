import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button, Checkbox, Chip, Card, Modal, Surface, Label, SearchField, ListBox, Select } from "@/ui/heroui"
import { Icon } from '@iconify/react'
import { useSearchParams } from 'react-router-dom'
import {
  Filmstrip,
  MagicWand,
  Pencil,
  Check,
} from '@/ui/icons'
import { mediaApi, MediaFile, type IdentifyCandidate, type IdentifyPreview } from '@/api/media'
import { useMutation, useQuery } from '@tanstack/react-query'
import { tasksApi, type TaskInfo } from '@/api/tasks'
import VirtualizedTable from '@/components/VirtualizedTable'
import NfoEditor from '@/components/NfoEditor'
import { handleError } from '@/utils/errorHandler'
import { showSuccess, showBatchProgress, updateBatchProgress, dismissLoading } from '@/utils/toast'
import PageHeader from '@/components/PageHeader'
import StatCard from '@/components/StatCard'

type GroupStatus = 'locked' | 'review' | 'matched' | 'unmatched'
type AuditPreset = 'task_all' | 'review' | 'unlocked' | 'matched' | 'custom'

interface ReviewGroup {
  id: string
  title: string
  subtitle: string
  status: GroupStatus
  files: MediaFile[]
}

export default function Scraper() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [selectedFile, setSelectedFile] = useState<string | null>(null)
  const [downloadImages, setDownloadImages] = useState(true)
  const [generateNfo, setGenerateNfo] = useState(true)
  const [selectedFiles, setSelectedFiles] = useState<string[]>([])
  const [previewVisible, setPreviewVisible] = useState(false)
  const [previewMetadata, setPreviewMetadata] = useState<IdentifyCandidate[] | null>(null)
  const [previewResult, setPreviewResult] = useState<IdentifyPreview | null>(null)
  const [editingFileId, setEditingFileId] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [viewMode, setViewMode] = useState<'list' | 'grid' | 'review'>('list')
  const [focusedFileIds, setFocusedFileIds] = useState<string[]>([])
  const [auditPreset, setAuditPreset] = useState<AuditPreset>('custom')
  const taskId = searchParams.get('task')
  const taskFocus = searchParams.get('focus')

  const { data: files, refetch, isPending } = useQuery({
    queryKey: ['files'],
    queryFn: () =>
      mediaApi.getFiles({
        file_type: 'video',
        page_size: 100,
        include_video_info: false,
        include_metadata: true,
      })
  })

  const { data: taskContext } = useQuery({
    queryKey: ['tasks', taskId],
    queryFn: async () => {
      if (!taskId) return null
      const res = await tasksApi.get(taskId)
      return res.data || null
    },
    enabled: Boolean(taskId),
  })

  const filteredFiles = useMemo(() => {
    if (!files?.files) return []

    let result = [...files.files]

    if (focusedFileIds.length > 0) {
      const focused = new Set(focusedFileIds)
      result = result.filter((file: MediaFile) => focused.has(file.id))
    }

    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase()
      result = result.filter((file: MediaFile) =>
        file.name.toLowerCase().includes(term) ||
        (file.detected_title || '').toLowerCase().includes(term) ||
        (readMetadataTitle(readMetadata(file.metadata)) || '').toLowerCase().includes(term)
      )
    }

    if (filterStatus !== 'all') {
      result = result.filter((file: MediaFile) => {
        const hasMetadata = !!file.metadata
        if (filterStatus === 'scraped') return hasMetadata
        if (filterStatus === 'unscraped') return !hasMetadata
        if (filterStatus === 'review') return file.review_state === 'needs_review'
        if (filterStatus === 'locked') return !!file.locked_match_provider
        if (filterStatus === 'unlocked') return !file.locked_match_provider
        if (filterStatus === 'matched') return !!file.match_provider || hasMetadata
        return true
      })
    }

    return result
  }, [files, focusedFileIds, searchTerm, filterStatus])

  const stats = useMemo(() => {
    if (!files?.files) {
      return { total: 0, scraped: 0, unscraped: 0, review: 0, locked: 0 }
    }

    return {
      total: files.files.length,
      scraped: files.files.filter((f: MediaFile) => !!f.metadata).length,
      unscraped: files.files.filter((f: MediaFile) => !f.metadata).length,
      review: files.files.filter((f: MediaFile) => f.review_state === 'needs_review').length,
      locked: files.files.filter((f: MediaFile) => !!f.locked_match_provider).length,
    }
  }, [files])

  const groupedFiles = useMemo<ReviewGroup[]>(() => {
    const groups = new Map<string, ReviewGroup>()

    filteredFiles.forEach((file: MediaFile) => {
      const metadata = readMetadata(file.metadata)
      const metadataTitle = readMetadataTitle(metadata)
      const groupTitle = file.detected_title || metadataTitle || '未识别文件'
      const year = file.detected_year || readMetadataYear(metadata)
      const source = file.locked_match_provider || file.match_provider || file.parser_provider || 'rules'
      const season = file.detected_season ? `S${String(file.detected_season).padStart(2, '0')}` : undefined
      const episode = file.detected_episode ? `E${String(file.detected_episode).padStart(2, '0')}` : undefined
      const subtitle = [source, year ? String(year) : undefined, season, episode].filter(Boolean).join(' / ') || '等待识别'

      let status: GroupStatus = 'unmatched'
      let id = `unmatched:${file.id}`

      if (file.locked_match_provider && file.locked_match_external_id) {
        status = 'locked'
        id = `locked:${file.locked_match_provider}:${file.locked_match_external_id}`
      } else if (file.match_provider && file.match_external_id) {
        status = file.review_state === 'needs_review' ? 'review' : 'matched'
        id = `${status}:${file.match_provider}:${file.match_external_id}`
      } else if (file.detected_title) {
        status = file.review_state === 'needs_review' ? 'review' : 'unmatched'
        id = `${status}:${normalizeKey(file.detected_title)}:${year || 'na'}:${file.detected_season || 'na'}`
      }

      if (!groups.has(id)) {
        groups.set(id, {
          id,
          title: groupTitle,
          subtitle,
          status,
          files: [],
        })
      }

      groups.get(id)?.files.push(file)
    })

    return Array.from(groups.values()).sort((a, b) => {
      const weight = statusRank(a.status) - statusRank(b.status)
      if (weight !== 0) return weight
      return b.files.length - a.files.length || a.title.localeCompare(b.title)
    })
  }, [filteredFiles])

  const currentFile = files?.files?.find((f) => f.id === selectedFile)
  const currentScopeFileIds = useMemo(
    () => filteredFiles.map((file: MediaFile) => file.id),
    [filteredFiles]
  )
  const autoApplyEligibleFileIds = useMemo(
    () =>
      filteredFiles
        .filter((file: MediaFile) =>
          !file.locked_match_provider &&
          file.review_state !== 'needs_review' &&
          (!!file.match_provider || !!file.metadata)
        )
        .map((file: MediaFile) => file.id),
    [filteredFiles]
  )
  const taskSummary = useMemo(() => {
    if (!taskContext || !files?.files || focusedFileIds.length === 0) return null

    const focused = new Set(focusedFileIds)
    const scopedFiles = files.files.filter((file: MediaFile) => focused.has(file.id))
    const parsed = parseScraperTaskResult(taskContext)

    return {
      total: scopedFiles.length,
      review: scopedFiles.filter((file: MediaFile) => file.review_state === 'needs_review').length,
      locked: scopedFiles.filter((file: MediaFile) => !!file.locked_match_provider).length,
      unlocked: scopedFiles.filter((file: MediaFile) => !file.locked_match_provider).length,
      matched: scopedFiles.filter((file: MediaFile) => !!file.match_provider || !!file.metadata).length,
      autoApplyEligible: scopedFiles.filter((file: MediaFile) =>
        !file.locked_match_provider &&
        file.review_state !== 'needs_review' &&
        (!!file.match_provider || !!file.metadata)
      ).length,
      mode: parsed.type,
    }
  }, [taskContext, files, focusedFileIds])

  useEffect(() => {
    if (!taskContext) {
      setFocusedFileIds([])
      return
    }

    const parsed = parseScraperTaskResult(taskContext)
    if (parsed.type === 'identify_preview') {
      const ids = parsed.results.map((item) => item.file_id)
      setFocusedFileIds(ids)
      setSelectedFiles(ids)
      if (taskFocus === 'review') {
        setViewMode('review')
        setFilterStatus('review')
        setAuditPreset('review')
      } else if (taskFocus === 'matched') {
        setViewMode('review')
        setFilterStatus('matched')
        setAuditPreset('matched')
      } else if (taskFocus === 'all') {
        setViewMode('review')
        setFilterStatus('all')
        setAuditPreset('task_all')
      }
      return
    }

    if (parsed.type === 'identify_apply') {
      const ids = parsed.applied.map((item) => item.file_id)
      setFocusedFileIds(ids)
      setSelectedFiles(ids)
      if (taskFocus === 'review') {
        setViewMode('review')
        setFilterStatus('review')
        setAuditPreset('review')
      } else if (taskFocus === 'matched') {
        setViewMode('review')
        setFilterStatus('matched')
        setAuditPreset('matched')
      } else if (taskFocus === 'all') {
        setViewMode('review')
        setFilterStatus('all')
        setAuditPreset('task_all')
      }
      return
    }

    setFocusedFileIds([])
    setAuditPreset('custom')
  }, [taskContext, taskFocus])

  const applyAuditPreset = useCallback((preset: Exclude<AuditPreset, 'custom'>) => {
    setViewMode('review')
    setAuditPreset(preset)
    if (preset === 'task_all') {
      setFilterStatus('all')
      return
    }
    setFilterStatus(preset)
  }, [])

  const scrapeMutation = useMutation({
    mutationFn: mediaApi.scrapeMetadata,
    onSuccess: () => {
      refetch()
      setPreviewVisible(false)
      setPreviewResult(null)
      setPreviewMetadata(null)
      showSuccess('元数据刮削成功')
    },
    onError: (error: Error) => handleError(error, '刮削失败'),
  })

  const applyIdentifyMutation = useMutation({
    mutationFn: mediaApi.identifyApply,
    onSuccess: () => {
      refetch()
      setPreviewVisible(false)
      setPreviewResult(null)
      setPreviewMetadata(null)
      showSuccess('匹配结果已应用')
    },
    onError: (error: Error) => handleError(error, '应用匹配失败'),
  })

  const previewIdentifyBatchMutation = useMutation({
    mutationFn: mediaApi.identifyPreviewBatch,
    onSuccess: (result) => {
      showSuccess(`已创建识别预览任务 ${result.task_id}`)
    },
    onError: (error: Error) => handleError(error, '提交识别预览任务失败'),
  })

  const handleScrape = async (fileId: string, autoMatch: boolean = true) => {
    setSelectedFile(fileId)

    if (!autoMatch) {
      try {
        const result = await mediaApi.identifyPreview({ file_id: fileId, allow_ai: true })
        if (result.results?.[0]) {
          setPreviewResult(result.results[0])
          setPreviewMetadata(result.results[0].candidates)
          setPreviewVisible(true)
          return
        }
      } catch (e) {
        handleError(e, '获取搜索结果失败')
        return
      }
    }

    scrapeMutation.mutate({
      file_id: fileId,
      auto_match: autoMatch,
      download_images: downloadImages,
      generate_nfo: generateNfo,
    })
  }

  const handleSelectMetadata = (metadata?: IdentifyCandidate) => {
    if (!selectedFile) return

    if (!metadata) {
      scrapeMutation.mutate({
        file_id: selectedFile,
        auto_match: true,
        download_images: downloadImages,
        generate_nfo: generateNfo,
      })
      setPreviewVisible(false)
      return
    }

    applyIdentifyMutation.mutate({
      selections: [{
        file_id: selectedFile,
        provider: metadata.provider,
        external_id: metadata.external_id,
        media_type: metadata.media_type,
        lock_match: true,
        download_images: downloadImages,
        generate_nfo: generateNfo,
      }]
    })
  }

  const runBatchScrape = useCallback(async (fileIds: string[], label: string) => {
    if (fileIds.length === 0) return

    const toastId = showBatchProgress(0, fileIds.length, label)

    for (let i = 0; i < fileIds.length; i++) {
      try {
        await mediaApi.scrapeMetadata({
          file_id: fileIds[i],
          auto_match: true,
          download_images: downloadImages,
          generate_nfo: generateNfo,
        })
        updateBatchProgress(toastId, i + 1, fileIds.length, label)
      } catch (e) {
        handleError(e, `刮削失败: ${fileIds[i]}`)
      }
    }

    refetch()
    dismissLoading(toastId, `成功刮削 ${fileIds.length} 个文件`, 'success')
  }, [downloadImages, generateNfo, refetch])

  const handleBatchScrape = useCallback(async () => {
    await runBatchScrape(selectedFiles, '正在刮削...')
    setSelectedFiles([])
  }, [selectedFiles, runBatchScrape])

  const handleScopedBatchScrape = useCallback(async () => {
    await runBatchScrape(autoApplyEligibleFileIds, '正在自动应用已匹配文件...')
  }, [autoApplyEligibleFileIds, runBatchScrape])

  const submitIdentifyPreviewBatch = useCallback((fileIds: string[]) => {
    if (fileIds.length === 0) return

    previewIdentifyBatchMutation.mutate({
      file_ids: fileIds,
      allow_ai: true,
    })
  }, [previewIdentifyBatchMutation])

  const handleBatchIdentifyPreview = useCallback(() => {
    submitIdentifyPreviewBatch(selectedFiles)
  }, [selectedFiles, submitIdentifyPreviewBatch])

  const handleScopedIdentifyPreview = useCallback(() => {
    submitIdentifyPreviewBatch(currentScopeFileIds)
  }, [currentScopeFileIds, submitIdentifyPreviewBatch])

  const applyRecommendedBatchMutation = useMutation({
    mutationFn: mediaApi.identifyApplyBatch,
    onSuccess: (result) => {
      showSuccess(`已创建推荐项应用任务 ${result.task_id}`)
      setSearchParams({
        task: result.task_id,
        focus: 'matched',
      })
    },
    onError: (error: Error) => handleError(error, '提交推荐项应用任务失败'),
  })

  const handleApplyRecommendedMatches = useCallback(() => {
    if (!taskContext) return

    const parsed = parseScraperTaskResult(taskContext)
    if (parsed.type !== 'identify_preview') return

    const focused = new Set(currentScopeFileIds)
    const selections = parsed.results
      .filter((item) => focused.size === 0 || focused.has(item.file_id))
      .filter((item) => item.recommended && !item.needs_review)
      .map((item) => ({
        file_id: item.file_id,
        provider: item.recommended!.provider,
        external_id: item.recommended!.external_id,
        media_type: item.recommended!.media_type,
        lock_match: true,
        download_images: downloadImages,
        generate_nfo: generateNfo,
      }))

    if (selections.length === 0) return
    applyRecommendedBatchMutation.mutate({ selections })
  }, [taskContext, currentScopeFileIds, downloadImages, generateNfo, applyRecommendedBatchMutation])

  const handleGroupIdentifyPreview = useCallback((group: ReviewGroup) => {
    submitIdentifyPreviewBatch(group.files.map((file) => file.id))
  }, [submitIdentifyPreviewBatch])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'a') {
        e.preventDefault()
        if (filteredFiles.length > 0) {
          setSelectedFiles(filteredFiles.map(f => f.id))
        }
      } else if ((e.metaKey || e.ctrlKey) && e.key === 's' && selectedFiles.length > 0) {
        e.preventDefault()
        handleBatchScrape()
      } else if ((e.metaKey || e.ctrlKey) && e.key === 'g' && selectedFiles.length > 0) {
        e.preventDefault()
        handleBatchIdentifyPreview()
      } else if ((e.metaKey || e.ctrlKey) && e.key === 'e' && selectedFiles.length === 1) {
        e.preventDefault()
        setEditingFileId(selectedFiles[0])
      } else if (e.key === 'Escape') {
        setSelectedFiles([])
        setEditingFileId(null)
      } else if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
        e.preventDefault()
        const searchInput = document.querySelector('input[placeholder*="搜索"]') as HTMLInputElement
        searchInput?.focus()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [filteredFiles, selectedFiles, handleBatchScrape, handleBatchIdentifyPreview])

  const columns = [
    {
      title: '文件名',
      dataIndex: 'name',
      key: 'name',
      width: 400,
      render: (text: unknown) => <span className="text-sm font-medium text-foreground">{text as string}</span>
    },
    {
      title: '大小',
      dataIndex: 'size',
      key: 'size',
      width: 120,
      render: (size: unknown) => <span className="text-xs text-muted font-mono">{formatSize(size as number)}</span>,
    },
    {
      title: '识别状态',
      dataIndex: 'metadata',
      key: 'metadata',
      width: 360,
      render: (_metadata: unknown, record: MediaFile) => {
        const metadata = readMetadata(record.metadata)
        const title = readMetadataTitle(metadata) || record.detected_title

        return (
          <div className="flex items-center gap-2 flex-wrap">
            <Chip size="sm" variant="soft" color={record.metadata ? 'success' : record.review_state === 'needs_review' ? 'warning' : 'default'}>
              {record.metadata ? (title || '已刮削') : record.review_state === 'needs_review' ? '待确认' : '未刮削'}
            </Chip>
            {record.locked_match_provider && (
              <Chip size="sm" color="accent" variant="soft">已锁定</Chip>
            )}
            {record.parser_provider && (
              <Chip size="sm" variant="soft">{record.parser_provider}</Chip>
            )}
            {typeof record.confidence_score === 'number' && (
              <span className="text-[10px] font-bold text-default-400">
                {Math.round(record.confidence_score * 100)}%
              </span>
            )}
          </div>
        )
      },
    },
    {
      title: '操作',
      key: 'action',
      width: 170,
      render: (_: unknown, record: MediaFile) => (
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
            isPending={applyIdentifyMutation.isPending && selectedFile === record.id}
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
        description="规则解析优先，TMDB + Bangumi 检索，Cloudflare Workers AI 仅做低置信度兜底"
        actions={(
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              onPress={handleBatchIdentifyPreview}
              isDisabled={selectedFiles.length === 0 || previewIdentifyBatchMutation.isPending}
              isPending={previewIdentifyBatchMutation.isPending}
              className="font-bold flex items-center gap-2 px-4 shadow-none"
            >
              <Icon icon="mdi:text-box-search-outline" className="w-4 h-4" />
              批量预览 ({selectedFiles.length})
            </Button>
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
        )}
      />

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
            description="已落库元数据"
          />
          <StatCard
            label="未刮削"
            value={stats.unscraped}
            icon={<MagicWand className="w-6 h-6" />}
            color="warning"
            description="待处理文件数量"
          />
          <StatCard
            label="待确认 / 已锁定"
            value={`${stats.review} / ${stats.locked}`}
            icon={<Icon icon="mdi:link-variant" className="w-6 h-6" />}
            color="accent"
            description="识别审核状态"
          />
        </div>
      )}

      {taskContext && (
        <Surface variant="default" className="rounded-xl border border-accent/20 bg-accent/5 p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <Chip size="sm" variant="soft" color="accent">
                  来自任务队列
                </Chip>
                <Chip size="sm" variant="soft">
                  {taskContext.id}
                </Chip>
                {taskSummary && (
                  <>
                    <Chip size="sm" variant="soft" color="warning">
                      待确认 {taskSummary.review}
                    </Chip>
                    <Chip size="sm" variant="soft">
                      未锁定 {taskSummary.unlocked}
                    </Chip>
                    <Chip size="sm" variant="soft" color="accent">
                      已锁定 {taskSummary.locked}
                    </Chip>
                    <Chip size="sm" variant="soft" color="success">
                      已匹配 {taskSummary.matched}
                    </Chip>
                    <Chip size="sm" variant="soft" color="success">
                      可自动应用 {taskSummary.autoApplyEligible}
                    </Chip>
                  </>
                )}
              </div>
              <p className="mt-2 text-sm font-semibold text-foreground">
                {taskContext.description || '识别任务结果'}
              </p>
              <p className="mt-1 text-xs text-default-400">
                当前已聚焦 {focusedFileIds.length} 个文件，便于继续审核或确认。
                {taskSummary?.mode === 'identify_preview' ? ' 这批结果适合先处理待确认项。' : ''}
              </p>
            </div>
            <div className="flex flex-col items-end gap-3">
              <div className="flex items-center gap-2 flex-wrap justify-end">
                <Button
                  size="sm"
                  variant={auditPreset === 'task_all' ? 'primary' : 'secondary'}
                  onPress={() => applyAuditPreset('task_all')}
                  isDisabled={!taskSummary || taskSummary.total === 0}
                >
                  本任务全部
                </Button>
                <Button
                  size="sm"
                  variant={auditPreset === 'review' ? 'primary' : 'secondary'}
                  onPress={() => applyAuditPreset('review')}
                  isDisabled={!taskSummary || taskSummary.review === 0}
                >
                  待确认
                </Button>
                <Button
                  size="sm"
                  variant={auditPreset === 'unlocked' ? 'primary' : 'secondary'}
                  onPress={() => applyAuditPreset('unlocked')}
                  isDisabled={!taskSummary || taskSummary.unlocked === 0}
                >
                  未锁定
                </Button>
                <Button
                  size="sm"
                  variant={auditPreset === 'matched' ? 'primary' : 'secondary'}
                  onPress={() => applyAuditPreset('matched')}
                  isDisabled={!taskSummary || taskSummary.matched === 0}
                >
                  已匹配
                </Button>
              </div>
              <div className="flex items-center gap-2 flex-wrap justify-end">
                <Button
                  size="sm"
                  variant="ghost"
                  onPress={() => applyAuditPreset('task_all')}
                >
                  查看全部
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onPress={() => {
                    applyAuditPreset('review')
                    setViewMode('review')
                  }}
                  isDisabled={!taskSummary || taskSummary.review === 0}
                >
                  仅处理待确认项
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onPress={() => {
                    applyAuditPreset('unlocked')
                    setViewMode('review')
                  }}
                  isDisabled={!taskSummary || taskSummary.unlocked === 0}
                >
                  仅看未锁定文件
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onPress={handleApplyRecommendedMatches}
                  isPending={applyRecommendedBatchMutation.isPending}
                  isDisabled={!taskSummary || taskSummary.autoApplyEligible === 0}
                >
                  应用推荐项
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onPress={handleScopedIdentifyPreview}
                  isPending={previewIdentifyBatchMutation.isPending}
                  isDisabled={currentScopeFileIds.length === 0}
                >
                  重新识别当前范围
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onPress={handleScopedBatchScrape}
                  isPending={scrapeMutation.isPending}
                  isDisabled={autoApplyEligibleFileIds.length === 0}
                >
                  自动应用已匹配未锁定
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onPress={() => {
                    setSearchParams({})
                    setFocusedFileIds([])
                    setSelectedFiles([])
                    setAuditPreset('custom')
                    setFilterStatus('all')
                  }}
                >
                  清除聚焦
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onPress={() => setViewMode('review')}
                >
                  打开审核视图
                </Button>
              </div>
            </div>
          </div>
        </Surface>
      )}

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
              variant={viewMode === 'review' ? 'primary' : 'ghost'}
              onPress={() => setViewMode('review')}
              className="w-8 h-7 rounded-md"
            >
              <Icon icon="mdi:table-of-contents" className="w-4 h-4" />
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
              <SearchField.Input placeholder="搜索文件名或识别标题..." className="text-sm" />
              <SearchField.ClearButton />
            </SearchField.Group>
          </SearchField>

          <div className="flex items-center gap-2 bg-default-100/50 px-2 py-1 rounded-md border border-divider/20">
            <span className="text-[11px] font-bold text-default-500 uppercase tracking-wider">状态</span>
            <Select
              selectedKey={filterStatus}
              onSelectionChange={(keys) => {
                if (!keys) return
                const selected = Array.from(keys as Iterable<unknown>)[0] as string
                if (selected) {
                  setFilterStatus(selected)
                  setAuditPreset('custom')
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
                <ListBox.Item key="review">待确认</ListBox.Item>
                <ListBox.Item key="matched">已匹配</ListBox.Item>
                <ListBox.Item key="locked">已锁定</ListBox.Item>
                <ListBox.Item key="unlocked">未锁定</ListBox.Item>
              </ListBox>
              </Select.Popover>
            </Select>
          </div>
        </div>
      </Surface>

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
                if (keys === 'all') {
                  setSelectedFiles(filteredFiles.map((f: MediaFile) => f.id))
                } else {
                  setSelectedFiles(Array.from(keys as Iterable<unknown>) as string[])
                }
              }}
            />
          </Surface>
        ) : viewMode === 'review' ? (
          <div className="flex flex-col gap-4">
            {groupedFiles.map((group) => (
              <Surface key={group.id} variant="default" className="rounded-2xl border border-divider/30 p-4 shadow-sm">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex flex-col gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-black tracking-tight">{group.title}</h3>
                      <Chip size="sm" variant="soft" color={group.status === 'locked' ? 'accent' : group.status === 'review' ? 'warning' : group.status === 'matched' ? 'success' : 'default'}>
                        {group.status === 'locked' ? '已锁定' : group.status === 'review' ? '待确认' : group.status === 'matched' ? '已匹配' : '未识别'}
                      </Chip>
                      <Chip size="sm" variant="soft">{group.files.length} 个文件</Chip>
                    </div>
                    <p className="text-xs text-default-400">{group.subtitle}</p>
                  </div>
                  <div className="text-right text-xs text-default-400">
                    <div>按识别结果聚合</div>
                    <div>便于批量审核同一条目</div>
                  </div>
                </div>

                <div className="mt-3 flex justify-end">
                  <Button
                    size="sm"
                    variant="secondary"
                    onPress={() => handleGroupIdentifyPreview(group)}
                    isPending={previewIdentifyBatchMutation.isPending}
                  >
                    提交本组识别预览
                  </Button>
                </div>

                <div className="mt-4 flex flex-col gap-2">
                  {group.files.map((file) => (
                    <div key={file.id} className="flex items-center justify-between gap-3 rounded-xl border border-divider/20 bg-default-100/20 px-3 py-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="truncate text-sm font-medium">{file.name}</p>
                          {file.parser_provider && (
                            <Chip size="sm" variant="soft">{file.parser_provider}</Chip>
                          )}
                          {file.ai_disabled_reason && (
                            <Chip size="sm" variant="soft" color="warning">{file.ai_disabled_reason}</Chip>
                          )}
                        </div>
                        <p className="mt-1 text-xs text-default-400">
                          {buildFileSummary(file)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          onPress={() => handleScrape(file.id, true)}
                          isPending={scrapeMutation.isPending && selectedFile === file.id}
                        >
                          自动
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          onPress={() => handleScrape(file.id, false)}
                        >
                          审核
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onPress={() => setEditingFileId(file.id)}
                        >
                          NFO
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </Surface>
            ))}
          </div>
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
                        <div className="flex items-center gap-2 flex-wrap">
                          <Chip size="sm" color="success" variant="soft">已刮削</Chip>
                          {file.locked_match_provider && <Chip size="sm" color="accent" variant="soft">已锁定</Chip>}
                          {file.parser_provider && <Chip size="sm" variant="soft">{file.parser_provider}</Chip>}
                        </div>
                      ) : file.review_state === 'needs_review' ? (
                        <Chip size="sm" color="warning" variant="soft">待确认</Chip>
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
                        onPress={() => handleScrape(file.id, false)}
                      >
                        <Icon icon="mdi:magnify" className="w-4 h-4" />
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
                {previewResult && (
                  <div className="border-b border-divider/50 bg-default-100/30 px-5 py-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <Chip size="sm" variant="soft" color="accent">
                        解析: {previewResult.parse.parser_provider}
                      </Chip>
                      <Chip size="sm" variant="soft" color={previewResult.needs_review ? 'warning' : 'success'}>
                        {previewResult.needs_review ? '需要人工确认' : '可自动应用'}
                      </Chip>
                      <Chip size="sm" variant="soft">
                        预算: {previewResult.budget_state}
                      </Chip>
                      {previewResult.ai_used && (
                        <Chip size="sm" variant="soft" color="success">
                          已使用 Cloudflare AI
                        </Chip>
                      )}
                    </div>
                    <p className="mt-3 text-sm font-semibold text-foreground">
                      {previewResult.parse.title || '未解析出标题'}
                      {previewResult.parse.year ? ` (${previewResult.parse.year})` : ''}
                    </p>
                    <p className="mt-1 text-xs text-default-400">{buildParseSummary(previewResult)}</p>
                  </div>
                )}

                {previewMetadata && previewMetadata.length > 0 ? (
                  previewMetadata.map((item: IdentifyCandidate, idx: number) => (
                    <button
                      key={`${item.provider}:${item.external_id}:${idx}`}
                      onClick={() => handleSelectMetadata(item)}
                      className="w-full text-left p-4 hover:bg-default-100 transition-colors border-b border-divider/50 last:border-b-0 flex items-start gap-4 group"
                    >
                      {item.poster_url && (
                        <div className="relative w-16 h-24 shrink-0 rounded-md overflow-hidden shadow-sm border border-divider/20 group-hover:border-primary/50 transition-colors">
                          <img
                            src={item.poster_url}
                            alt={item.title}
                            className="w-full h-full object-cover"
                          />
                        </div>
                      )}
                      <div className="flex-1 min-w-0 py-1">
                        <div className="mb-1.5 flex items-center gap-2 flex-wrap">
                          <h3 className="text-sm font-bold group-hover:text-primary transition-colors">{item.title}</h3>
                          {previewResult?.recommended?.provider === item.provider && previewResult?.recommended?.external_id === item.external_id && (
                            <Chip size="sm" variant="soft" color="success">推荐</Chip>
                          )}
                        </div>
                        {item.overview && (
                          <p className="text-[11px] text-default-400 line-clamp-2 mb-2 font-medium leading-relaxed">{item.overview}</p>
                        )}
                        <div className="flex items-center gap-4 flex-wrap">
                          {item.year && (
                            <span className="text-[10px] font-black text-default-400 uppercase tracking-widest">
                              年份 <span className="text-foreground ml-1">{item.year}</span>
                            </span>
                          )}
                          <span className="text-[10px] font-black text-default-400 uppercase tracking-widest">
                            来源 <span className="text-foreground ml-1">{item.provider.toUpperCase()}</span>
                          </span>
                          <span className="text-[10px] font-black text-default-400 uppercase tracking-widest">
                            置信度 <span className="text-foreground ml-1">{Math.round(item.score * 100)}%</span>
                          </span>
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
                自动匹配推荐项
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

function normalizeKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '')
}

function statusRank(status: GroupStatus): number {
  if (status === 'review') return 0
  if (status === 'unmatched') return 1
  if (status === 'locked') return 2
  return 3
}

function readMetadata(metadata: MediaFile['metadata']): Record<string, unknown> | undefined {
  if (!metadata) return undefined
  if (typeof metadata === 'string') {
    try {
      return JSON.parse(metadata) as Record<string, unknown>
    } catch {
      return undefined
    }
  }
  return metadata
}

function readMetadataTitle(metadata?: Record<string, unknown>): string | undefined {
  const title = metadata?.title ?? metadata?.name
  return typeof title === 'string' && title ? title : undefined
}

function readMetadataYear(metadata?: Record<string, unknown>): number | undefined {
  return typeof metadata?.year === 'number' ? metadata.year : undefined
}

function buildFileSummary(file: MediaFile): string {
  const parts = [
    file.detected_title ? `解析标题 ${file.detected_title}` : undefined,
    typeof file.confidence_score === 'number' ? `置信度 ${Math.round(file.confidence_score * 100)}%` : undefined,
    file.match_provider ? `匹配源 ${file.match_provider}` : undefined,
    file.locked_match_provider ? `锁定 ${file.locked_match_provider}` : undefined,
  ].filter(Boolean)

  return parts.join(' / ') || '尚未生成识别信息'
}

function buildParseSummary(result: IdentifyPreview): string {
  const parts = [
    result.parse.season ? `S${String(result.parse.season).padStart(2, '0')}` : undefined,
    result.parse.episode ? `E${String(result.parse.episode).padStart(2, '0')}` : undefined,
    `置信度 ${Math.round(result.parse.confidence * 100)}%`,
    `候选 ${result.candidates.length}`,
    result.parse.ai_disabled_reason || undefined,
  ].filter(Boolean)

  return parts.join(' / ')
}

function parseScraperTaskResult(task: TaskInfo):
  | { type: 'identify_preview'; results: Array<{ file_id: string; recommended?: IdentifyCandidate; needs_review?: boolean }> }
  | { type: 'identify_apply'; applied: Array<{ file_id: string }> }
  | { type: 'other' } {
  if (task.status.status !== 'completed' || !task.result) {
    return { type: 'other' }
  }

  try {
    const parsed = JSON.parse(task.result) as {
      results?: Array<{ file_id: string; recommended?: IdentifyCandidate; needs_review?: boolean }>
      applied?: Array<{ file_id: string }>
    }

    if (Array.isArray(parsed.results)) {
      return { type: 'identify_preview', results: parsed.results }
    }

    if (Array.isArray(parsed.applied)) {
      return { type: 'identify_apply', applied: parsed.applied }
    }
  } catch {
    return { type: 'other' }
  }

  return { type: 'other' }
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
