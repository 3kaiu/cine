import { useState, useMemo, useCallback, useEffect } from 'react'
import clsx from 'clsx'
import { Button, Chip, Checkbox, Label, Modal, Surface } from "@/ui/heroui"
import { Icon } from '@iconify/react'
import { ArrowsRotateRight, Pause, Play, Xmark, TrashBin } from '@/ui/icons'
import { useNavigate } from 'react-router-dom'
import PageHeader from '@/components/PageHeader'
import StatCard from '@/components/StatCard'
import VirtualizedTable from '@/components/VirtualizedTable'
import { useTasksQuery, useTaskMutations } from '@/hooks/useTasksQuery'
import { mediaApi } from '@/api/media'
import { tasksApi } from '@/api/tasks'
import type { TaskInfo, TaskStatus } from '@/api/tasks'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/config/queryConfig'
import { showSuccess } from '@/utils/toast'
import { handleError } from '@/utils/errorHandler'
import { buildTaskSummary, candidateKey, parseTaskResult } from './tasksResult'

// 任务类型标签
const taskTypeLabels: Record<string, string> = {
  scan: '扫描',
  hash: '哈希',
  scrape: '刮削',
  rename: '重命名',
  batch_move: '批量移动',
  batch_copy: '批量复制',
  cleanup: '清理',
}

// 状态颜色
const statusColors: Record<string, 'primary' | 'success' | 'warning' | 'danger' | 'default'> = {
  pending: 'default',
  running: 'primary',
  paused: 'warning',
  completed: 'success',
  failed: 'danger',
  cancelled: 'default',
}

// 状态标签
const statusLabels: Record<string, string> = {
  pending: '等待中',
  running: '运行中',
  paused: '已暂停',
  completed: '已完成',
  failed: '失败',
  cancelled: '已取消',
}

export default function Tasks() {
  const navigate = useNavigate()
  const [confirmModal, setConfirmModal] = useState<{ isOpen: boolean; taskId: string | null; action: 'cancel' | 'cleanup' }>({
    isOpen: false,
    taskId: null,
    action: 'cancel',
  })
  const [detailTaskId, setDetailTaskId] = useState<string | null>(null)

  const { data, refetch, isPending } = useTasksQuery()
  const { pauseMutation, resumeMutation, cancelMutation, cleanupMutation, requeueMutation, rerunMutation } = useTaskMutations()

  const tasks = data?.data?.tasks ?? []
  const activeCount = data?.data?.active || 0
  const totalCount = data?.data?.total || 0

  const stats = {
    total: totalCount,
    active: activeCount,
    completed: tasks.filter(t => t.status.status === 'completed').length,
    failed: tasks.filter(t => t.status.status === 'failed').length,
  }
  const listedDetailTask = tasks.find((task) => task.id === detailTaskId) || null
  const { data: detailTaskResponse } = useQuery({
    queryKey: queryKeys.task(detailTaskId || ''),
    queryFn: async () => {
      if (!detailTaskId) return null
      const res = await tasksApi.get(detailTaskId)
      return res.data || null
    },
    enabled: Boolean(detailTaskId),
    refetchInterval: detailTaskId ? 2000 : false,
  })
  const detailTask = detailTaskResponse || listedDetailTask

  const handleCancelSuccess = useCallback(() => {
    setConfirmModal(prev => ({ ...prev, isOpen: false }))
  }, [])

  const handleCleanupSuccess = useCallback(() => {
    setConfirmModal(prev => ({ ...prev, isOpen: false }))
  }, [])

  const getStatusInfo = useCallback((status: TaskStatus) => {
    const statusKey = status.status
    return {
      label: statusLabels[statusKey] || statusKey,
      color: statusColors[statusKey] || 'default',
      progress: 'progress' in status ? status.progress : undefined,
      message: 'message' in status ? status.message : undefined,
      error: 'error' in status ? status.error : undefined,
      duration: 'duration_secs' in status ? status.duration_secs : undefined,
    }
  }, [])

  const getLeaseStatus = useCallback((task: TaskInfo) => {
    if (!task.lease_until) return { label: '-', color: 'default' as const }
    const until = new Date(task.lease_until).getTime()
    const now = Date.now()
    const deltaMs = until - now
    if (deltaMs <= 0) return { label: '已过期', color: 'danger' as const }
    if (deltaMs <= 60_000) return { label: '即将超时', color: 'warning' as const }
    return { label: '正常', color: 'success' as const }
  }, [])

  const columns = useMemo(() => [
    {
      title: '任务类型',
      dataIndex: 'task_type',
      width: 120,
      render: (type: unknown) => (
        <Chip size="sm" variant="soft" className="font-medium">
          {taskTypeLabels[type as string] || (type as string)}
        </Chip>
      ),
    },
    {
      title: '描述',
      dataIndex: 'description',
      width: 280,
      render: (_desc: unknown, task: TaskInfo) => {
        const summary = buildTaskSummary(task)
        return (
          <div className="flex flex-col gap-1">
            <span className="text-sm text-foreground/80 line-clamp-1">
              {task.description || '-'}
            </span>
            {summary && (
              <span className="text-[10px] text-default-400 font-medium line-clamp-2">
                {summary}
              </span>
            )}
          </div>
        )
      },
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 150,
      render: (status: unknown) => {
        const info = getStatusInfo(status as TaskStatus)
        return (
          <div className="flex flex-col gap-1.5">
            <Chip
              size="sm"
              variant="soft"
              color={(info.color === 'primary' ? 'accent' : info.color) as "default" | "accent" | "success" | "warning" | "danger" | undefined}
              className="h-5 text-[10px] font-black uppercase tracking-tighter px-1.5 border-none"
            >
              {info.label}
              {info.progress !== undefined && ` ${info.progress.toFixed(0)}%`}
            </Chip>
            {info.message && (
              <p className="text-[10px] text-default-400 font-medium line-clamp-1 leading-tight">{info.message}</p>
            )}
            {info.error && (
              <p className="text-[10px] text-danger font-medium line-clamp-1 leading-tight">{info.error}</p>
            )}
          </div>
        )
      },
    },
    {
      title: '进度',
      dataIndex: 'status',
      width: 120,
      render: (rawStatus: unknown) => {
        const status = rawStatus as TaskStatus;
        if (status.status !== 'running' && status.status !== 'paused') {
          return <span className="text-default-300 text-[10px] font-bold uppercase tracking-widest pl-1">-</span>
        }
        const progress = 'progress' in status ? status.progress : 0
        return (
          <div className="flex flex-col gap-1.5 px-1 pr-4">
            <div className="w-full bg-default-100/50 rounded-full h-1.5 overflow-hidden border border-divider/5">
              <div
                className={clsx(
                  "h-full transition-all duration-500",
                  status.status === 'paused' ? "bg-warning shadow-[0_0_8px_rgba(var(--warning-rgb),0.3)]" : "bg-accent shadow-[0_0_8px_rgba(var(--accent-rgb),0.3)]"
                )}
                style={{ width: `${progress}%` }}
              />
            </div>
            <span className="text-[10px] font-black text-default-400 uppercase tracking-widest">
              {progress.toFixed(0)}%
            </span>
          </div>
        )
      },
    },
    {
      title: '重试',
      dataIndex: 'retry_count',
      width: 80,
      render: (n: unknown) => (
        <span className="text-[11px] text-default-500 font-mono">
          {typeof n === 'number' ? n : 0}
        </span>
      ),
    },
    {
      title: '租约',
      dataIndex: 'lease_until',
      width: 110,
      render: (_: unknown, task: TaskInfo) => {
        const ls = getLeaseStatus(task)
        return (
          <Chip
            size="sm"
            variant="soft"
            color={ls.color as "default" | "success" | "warning" | "danger" | undefined}
            className="h-5 text-[10px] font-black uppercase tracking-tighter px-1.5 border-none"
          >
            {ls.label}
          </Chip>
        )
      },
    },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      width: 160,
      render: (time: unknown) => (
        <span className="text-[11px] text-default-400 font-mono">
          {new Date(time as string).toLocaleString()}
        </span>
      ),
    },
    {
      title: '操作',
      dataIndex: 'id',
      width: 200,
      render: (_: unknown, task: TaskInfo) => {
        const status = task.status.status
        const canPause = status === 'running'
        const canResume = status === 'paused'
        const canCancel = status === 'running' || status === 'paused' || status === 'pending'
        const canRequeue = status === 'failed' || status === 'cancelled'
        const canRerun = status === 'failed' || status === 'cancelled' || status === 'completed'
        const canInspect = Boolean(task.result) || status === 'failed'

        return (
          <div className="flex gap-2">
            {canInspect && (
              <Button
                isIconOnly
                size="sm"
                variant="secondary"
                onPress={() => setDetailTaskId(task.id)}
                className="h-7 w-7 min-w-0 bg-accent/10 text-accent hover:bg-accent/20 border-none shadow-none"
              >
                <Icon icon="mdi:file-document-search-outline" className="w-3.5 h-3.5" />
              </Button>
            )}
            {canPause && (
              <Button
                isIconOnly
                size="sm"
                variant="secondary"
                onPress={() => pauseMutation.mutate(task.id)}
                className="h-7 w-7 min-w-0 bg-warning/10 text-warning hover:bg-warning-soft-hover border-none shadow-none"
              >
                <Pause className="w-3.5 h-3.5" />
              </Button>
            )}
            {canResume && (
              <Button
                isIconOnly
                size="sm"
                variant="secondary"
                onPress={() => resumeMutation.mutate(task.id)}
                className="h-7 w-7 min-w-0 bg-success/10 text-success hover:bg-success-soft-hover border-none shadow-none"
              >
                <Play className="w-3.5 h-3.5" />
              </Button>
            )}
            {canCancel && (
              <Button
                isIconOnly
                size="sm"
                variant="secondary"
                onPress={() => setConfirmModal({ isOpen: true, taskId: task.id, action: 'cancel' })}
                className="h-7 w-7 min-w-0 bg-danger/10 text-danger hover:bg-danger-soft-hover border-none shadow-none"
              >
                <Xmark className="w-3.5 h-3.5" />
              </Button>
            )}
            {canRequeue && (
              <Button
                isIconOnly
                size="sm"
                variant="secondary"
                onPress={() => requeueMutation.mutate(task.id)}
                className="h-7 w-7 min-w-0 bg-default-200/10 text-default-600 hover:bg-default-200/20 border-none shadow-none"
              >
                <ArrowsRotateRight className="w-3.5 h-3.5" />
              </Button>
            )}
            {canRerun && (
              <Button
                isIconOnly
                size="sm"
                variant="secondary"
                onPress={() => rerunMutation.mutate(task.id)}
                className="h-7 w-7 min-w-0 bg-primary/10 text-primary hover:bg-primary/20 border-none shadow-none"
              >
                <Play className="w-3.5 h-3.5" />
              </Button>
            )}
          </div>
        )
      },
    },
  ], [getStatusInfo, getLeaseStatus, pauseMutation, resumeMutation, requeueMutation, rerunMutation])

  return (
    <div className="flex flex-col gap-4 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <PageHeader
        title="任务队列"
        description="管理后台运行的任务，支持暂停、恢复和取消操作"
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="danger"
              size="md"
              onPress={() => setConfirmModal({ isOpen: true, taskId: null, action: 'cleanup' })}
              isDisabled={stats.completed + stats.failed === 0}
              className="font-bold flex items-center gap-2 px-4 shadow-none"
            >
              <TrashBin className="w-4 h-4" />
              清理历史
            </Button>
            <div className="w-px h-4 bg-divider/20 mx-1" />
            <Button
              variant="ghost"
              size="md"
              onPress={() => refetch()}
              className="font-bold border border-divider/10 bg-default-50/50 shadow-sm transition-all flex items-center gap-2 px-4 text-default-600 hover:text-foreground"
            >
              <ArrowsRotateRight className="w-4 h-4" />
              刷新队列
            </Button>
          </div>
        }
      />

      {/* 统计卡片 */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <StatCard
          label="总任务"
          value={stats.total}
          icon={<Icon icon="mdi:list-status" className="w-6 h-6" />}
          color="primary"
          description="队列中的任务总数"
        />
        <StatCard
          label="运行中"
          value={stats.active}
          icon={<Play className="w-6 h-6" />}
          color="accent"
          description="正在执行的任务"
        />
        <StatCard
          label="已完成"
          value={stats.completed}
          icon={<Icon icon="mdi:check-circle" className="w-6 h-6" />}
          color="success"
          description="成功完成的任务"
        />
        <StatCard
          label="失败"
          value={stats.failed}
          icon={<Icon icon="mdi:alert-circle" className="w-6 h-6" />}
          color="danger"
          description="执行失败的任务"
        />
      </div>

      {/* 任务列表 */}
      <Surface variant="secondary" className="rounded-2xl border border-divider/10 overflow-hidden bg-background/5">
        {tasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 bg-background/50">
            <Icon icon="mdi:clipboard-list-outline" className="w-16 h-16 text-default-200 mb-4 opacity-50" />
            <p className="text-sm font-bold text-default-400 uppercase tracking-widest">暂无运行中的任务</p>
          </div>
        ) : (
          <VirtualizedTable<TaskInfo>
            dataSource={tasks}
            columns={columns}
            height={500}
            rowHeight={72}
            loading={isPending}
          />
        )}
      </Surface>

      {/* 确认对话框 */}
      <Modal isOpen={confirmModal.isOpen} onOpenChange={(open) => setConfirmModal({ ...confirmModal, isOpen: open })}>
        <Modal.Backdrop />
        <Modal.Container>
          <Modal.Dialog>
            <Modal.Header>
              {confirmModal.action === 'cancel' ? '确认取消任务' : '确认清理'}
            </Modal.Header>
            <Modal.Body>
              <p className="text-sm text-default-500">
                {confirmModal.action === 'cancel'
                  ? '确定要取消此任务吗？正在执行的操作将被中断。'
                  : '确定要清理所有已完成、失败和已取消的任务吗？'}
              </p>
            </Modal.Body>
            <Modal.Footer>
              <Button
                variant="ghost"
                size="md"
                onPress={() => setConfirmModal({ ...confirmModal, isOpen: false })}
              >
                取消
              </Button>
              <Button
                variant="danger"
                size="md"
                onPress={() => {
                  if (confirmModal.action === 'cancel' && confirmModal.taskId) {
                    cancelMutation.mutate(confirmModal.taskId, { onSuccess: handleCancelSuccess })
                  } else if (confirmModal.action === 'cleanup') {
                    cleanupMutation.mutate(undefined, { onSuccess: handleCleanupSuccess })
                  }
                }}
              >
                确认
              </Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal>

      <Modal isOpen={!!detailTaskId} onOpenChange={(open) => !open && setDetailTaskId(null)}>
        <Modal.Backdrop />
        <Modal.Container size="lg">
          <Modal.Dialog className="max-h-[85vh]">
            <Modal.Header>
              任务详情
            </Modal.Header>
            <Modal.Body className="space-y-4 overflow-y-auto">
              {detailTask && (
                <TaskDetailContent
                  task={detailTask}
                  onOpenScraper={(taskId, focus = 'review') => navigate(`/scraper?task=${taskId}&focus=${focus}`)}
                  onOpenTask={setDetailTaskId}
                />
              )}
            </Modal.Body>
            <Modal.Footer>
              <Button variant="ghost" onPress={() => setDetailTaskId(null)}>
                关闭
              </Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal>
    </div>
  )
}

function TaskDetailContent({
  task,
  onOpenScraper,
  onOpenTask,
}: {
  task: TaskInfo
  onOpenScraper: (taskId: string, focus?: 'review' | 'matched' | 'all') => void
  onOpenTask: (taskId: string) => void
}) {
  const parsed = parseTaskResult(task)
  const queryClient = useQueryClient()
  const [selectedCandidates, setSelectedCandidates] = useState<Record<string, string>>({})
  const [lockMatch, setLockMatch] = useState(true)
  const [downloadImages, setDownloadImages] = useState(true)
  const [generateNfo, setGenerateNfo] = useState(true)
  const previewSummary = useMemo(() => {
    if (parsed.type !== 'identify_preview') return null

    return {
      total: parsed.results.length,
      review: parsed.results.filter((item) => item.needs_review).length,
      recommended: parsed.results.filter((item) => item.recommended).length,
      autoApplicable: parsed.results.filter((item) => !item.needs_review && item.recommended).length,
      candidates: parsed.results.reduce((sum, item) => sum + item.candidates.length, 0),
    }
  }, [parsed])
  const applySummary = useMemo(() => {
    if (parsed.type !== 'identify_apply') return null

    const providers = new Set(
      parsed.applied
        .map((item) => item.metadata.provider)
        .filter((provider): provider is string => typeof provider === 'string' && provider.length > 0)
    )

    return {
      total: parsed.applied.length,
      providers: providers.size,
      locked: parsed.applied.filter((item) => item.metadata.locked === true).length,
      withImages: parsed.applied.filter((item) => item.metadata.thumb_path || item.metadata.poster_path).length,
    }
  }, [parsed])

  useEffect(() => {
    if (parsed.type !== 'identify_preview') return

    const defaults = parsed.results.reduce<Record<string, string>>((acc, item) => {
      const preferred = item.recommended || item.candidates[0]
      if (preferred) {
        acc[item.file_id] = candidateKey(preferred)
      }
      return acc
    }, {})

    setSelectedCandidates(defaults)
  }, [parsed])

  const applyBatchMutation = useMutation({
    mutationFn: (selections: Array<{
      file_id: string
      provider: string
      external_id: string
      media_type: string
      lock_match?: boolean
      download_images?: boolean
      generate_nfo?: boolean
    }>) => mediaApi.identifyApplyBatch({ selections }),
    onSuccess: (result) => {
      showSuccess(`已创建批量应用任务 ${result.task_id}`)
      queryClient.invalidateQueries({ queryKey: queryKeys.tasks() })
      queryClient.invalidateQueries({ queryKey: queryKeys.task(result.task_id) })
      queryClient.invalidateQueries({ queryKey: ['files'] })
      onOpenTask(result.task_id)
    },
    onError: (error: unknown) => handleError(error, '提交批量应用任务失败'),
  })

  const handleApplySelected = () => {
    if (parsed.type !== 'identify_preview') return

    const selections = parsed.results
      .map((item) => {
        const selected = item.candidates.find((candidate) => candidateKey(candidate) === selectedCandidates[item.file_id])
        if (!selected) return null
        return {
          file_id: item.file_id,
          provider: selected.provider,
          external_id: selected.external_id,
          media_type: selected.media_type,
          lock_match: lockMatch,
          download_images: downloadImages,
          generate_nfo: generateNfo,
        }
      })
      .filter(Boolean) as Array<{
        file_id: string
        provider: string
        external_id: string
        media_type: string
        lock_match?: boolean
        download_images?: boolean
        generate_nfo?: boolean
      }>

    if (selections.length === 0) return
    applyBatchMutation.mutate(selections)
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Surface variant="secondary" className="rounded-xl border border-divider/10 p-4">
          <p className="text-[10px] font-black uppercase tracking-widest text-default-500">任务</p>
          <p className="mt-2 text-sm font-semibold">{task.description || '-'}</p>
          <p className="mt-1 text-xs text-default-400 font-mono">{task.id}</p>
        </Surface>
        <Surface variant="secondary" className="rounded-xl border border-divider/10 p-4">
          <p className="text-[10px] font-black uppercase tracking-widest text-default-500">状态</p>
          <p className="mt-2 text-sm font-semibold">{statusLabels[task.status.status] || task.status.status}</p>
          <p className="mt-1 text-xs text-default-400">{new Date(task.updated_at).toLocaleString()}</p>
        </Surface>
      </div>

      {parsed.type === 'identify_preview' && (
        <div className="flex flex-col gap-3">
          <Surface variant="secondary" className="rounded-xl border border-divider/10 p-4">
            <p className="text-[10px] font-black uppercase tracking-widest text-default-500">识别结果摘要</p>
            <p className="mt-2 text-sm text-foreground/80">
              共 {parsed.results.length} 个文件，推荐 {parsed.results.filter((item) => item.recommended).length} 个，待确认 {parsed.results.filter((item) => item.needs_review).length} 个。
            </p>
            {previewSummary && (
              <div className="mt-4 flex flex-wrap gap-2">
                <Chip size="sm" variant="soft" color="default">总计 {previewSummary.total}</Chip>
                <Chip size="sm" variant="soft" color="warning">待确认 {previewSummary.review}</Chip>
                <Chip size="sm" variant="soft" color="success">可自动应用 {previewSummary.autoApplicable}</Chip>
                <Chip size="sm" variant="soft" color="accent">候选 {previewSummary.candidates}</Chip>
              </div>
            )}
            <div className="mt-4 flex flex-wrap items-center gap-4">
              <Checkbox isSelected={lockMatch} onChange={setLockMatch} className="group">
                <Checkbox.Control className="w-4 h-4 rounded border-divider/50 group-data-[selected=true]:bg-primary group-data-[selected=true]:border-primary">
                  <Checkbox.Indicator className="w-2.5 h-2.5" />
                </Checkbox.Control>
                <Checkbox.Content>
                  <Label className="text-sm font-medium">锁定匹配</Label>
                </Checkbox.Content>
              </Checkbox>
              <Checkbox isSelected={downloadImages} onChange={setDownloadImages} className="group">
                <Checkbox.Control className="w-4 h-4 rounded border-divider/50 group-data-[selected=true]:bg-primary group-data-[selected=true]:border-primary">
                  <Checkbox.Indicator className="w-2.5 h-2.5" />
                </Checkbox.Control>
                <Checkbox.Content>
                  <Label className="text-sm font-medium">下载图片</Label>
                </Checkbox.Content>
              </Checkbox>
              <Checkbox isSelected={generateNfo} onChange={setGenerateNfo} className="group">
                <Checkbox.Control className="w-4 h-4 rounded border-divider/50 group-data-[selected=true]:bg-primary group-data-[selected=true]:border-primary">
                  <Checkbox.Indicator className="w-2.5 h-2.5" />
                </Checkbox.Control>
                <Checkbox.Content>
                  <Label className="text-sm font-medium">生成 NFO</Label>
                </Checkbox.Content>
              </Checkbox>
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="ghost"
                  size="md"
                  onPress={() => onOpenScraper(task.id, 'review')}
                  isDisabled={!previewSummary || previewSummary.review === 0}
                >
                  查看待确认
                </Button>
                <Button
                  variant="ghost"
                  size="md"
                  onPress={() => onOpenScraper(task.id, 'matched')}
                  isDisabled={!previewSummary || previewSummary.recommended === 0}
                >
                  查看已匹配
                </Button>
                <Button variant="ghost" size="md" onPress={() => onOpenScraper(task.id, 'all')}>
                  查看任务范围
                </Button>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="primary"
                  size="md"
                  onPress={handleApplySelected}
                  isPending={applyBatchMutation.isPending}
                  isDisabled={applyBatchMutation.isPending || parsed.results.every((item) => !selectedCandidates[item.file_id])}
                >
                  提交批量应用
                </Button>
              </div>
            </div>
          </Surface>
          {parsed.results.map((item, index) => (
            <Surface key={`${item.file_id}-${index}`} variant="secondary" className="rounded-xl border border-divider/10 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold">{item.file_name}</p>
                  <p className="mt-1 text-xs text-default-400">
                    {item.parse.title || '未解析标题'}
                    {item.parse.year ? ` (${item.parse.year})` : ''}
                    {' / '}
                    {item.parse.parser_provider}
                    {' / '}
                    {Math.round(item.parse.confidence * 100)}%
                  </p>
                </div>
                <Chip size="sm" variant="soft" color={item.needs_review ? 'warning' : 'success'}>
                  {item.needs_review ? '待确认' : '可自动应用'}
                </Chip>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {item.candidates.map((candidate, candidateIndex) => {
                  const isSelected = selectedCandidates[item.file_id] === candidateKey(candidate)
                  const isRecommended = item.recommended && candidateKey(item.recommended) === candidateKey(candidate)

                  return (
                    <button
                      key={`${candidate.provider}:${candidate.external_id}:${candidateIndex}`}
                      type="button"
                      onClick={() => setSelectedCandidates((prev) => ({ ...prev, [item.file_id]: candidateKey(candidate) }))}
                      className={clsx(
                        "rounded-full border px-3 py-1.5 text-left text-xs transition-colors",
                        isSelected
                          ? "border-accent bg-accent/10 text-accent"
                          : "border-divider/20 bg-default-100/40 text-default-500 hover:bg-default-100"
                      )}
                    >
                      <span className="font-semibold">{candidate.title}</span>
                      <span className="ml-2">{candidate.provider.toUpperCase()}</span>
                      <span className="ml-2">{Math.round(candidate.score * 100)}%</span>
                      {isRecommended && <span className="ml-2 font-semibold">推荐</span>}
                    </button>
                  )
                })}
              </div>
            </Surface>
          ))}
        </div>
      )}

      {parsed.type === 'identify_apply' && (
        <div className="flex flex-col gap-3">
          <Surface variant="secondary" className="rounded-xl border border-divider/10 p-4">
            <p className="text-[10px] font-black uppercase tracking-widest text-default-500">批量应用结果</p>
            <p className="mt-2 text-sm text-foreground/80">已应用 {parsed.applied.length} 个识别结果。</p>
            {applySummary && (
              <div className="mt-4 flex flex-wrap gap-2">
                <Chip size="sm" variant="soft" color="success">已应用 {applySummary.total}</Chip>
                <Chip size="sm" variant="soft" color="accent">来源 {applySummary.providers}</Chip>
                <Chip size="sm" variant="soft" color="warning">已锁定 {applySummary.locked}</Chip>
                <Chip size="sm" variant="soft" color="default">含图片 {applySummary.withImages}</Chip>
              </div>
            )}
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <Button
                variant="ghost"
                size="md"
                onPress={() => onOpenScraper(task.id, 'matched')}
                isDisabled={!applySummary || applySummary.total === 0}
              >
                查看已匹配
              </Button>
              <Button
                variant="ghost"
                size="md"
                onPress={() => onOpenScraper(task.id, 'all')}
                isDisabled={!applySummary || applySummary.total === 0}
              >
                查看任务范围
              </Button>
            </div>
          </Surface>
          {parsed.applied.map((item, index) => (
            <Surface key={`${item.file_id}-${index}`} variant="secondary" className="rounded-xl border border-divider/10 p-4">
              <p className="text-sm font-semibold">{readTaskMetadataTitle(item.metadata) || item.file_id}</p>
              <p className="mt-1 text-xs text-default-400">
                {item.metadata.provider ? `来源 ${String(item.metadata.provider).toUpperCase()} / ` : ''}
                {item.metadata.media_type ? `类型 ${String(item.metadata.media_type)} / ` : ''}
                {item.metadata.year ? `年份 ${item.metadata.year}` : '已写入元数据'}
              </p>
            </Surface>
          ))}
        </div>
      )}

      {parsed.type === 'raw' && (
        <Surface variant="secondary" className="rounded-xl border border-divider/10 p-4">
          <p className="text-[10px] font-black uppercase tracking-widest text-default-500">原始结果</p>
          <pre className="mt-3 whitespace-pre-wrap break-all text-xs text-default-500 font-mono">{parsed.text}</pre>
        </Surface>
      )}

      {task.status.status === 'failed' && 'error' in task.status && (
        <Surface variant="secondary" className="rounded-xl border border-danger/20 bg-danger/5 p-4">
          <p className="text-[10px] font-black uppercase tracking-widest text-danger">错误信息</p>
          <p className="mt-2 text-sm text-danger/80">{task.status.error}</p>
        </Surface>
      )}
    </div>
  )
}

function readTaskMetadataTitle(metadata: Record<string, unknown>): string | null {
  const title = metadata.title ?? metadata.name ?? metadata.original_title
  return typeof title === 'string' && title ? title : null
}
