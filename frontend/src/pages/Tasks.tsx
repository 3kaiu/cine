import { useState } from 'react'
import clsx from 'clsx'
import { Button, Chip, Modal, Surface } from "@heroui/react"
import { Icon } from '@iconify/react'
import { ArrowsRotateRight, Pause, Play, Xmark, TrashBin } from '@gravity-ui/icons'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import PageHeader from '@/components/PageHeader'
import StatCard from '@/components/StatCard'
import VirtualizedTable from '@/components/VirtualizedTable'
import { handleError } from '@/utils/errorHandler'
import { showSuccess } from '@/utils/toast'

// API 类型定义
interface TaskInfo {
  id: string
  task_type: string
  status: TaskStatus
  created_at: string
  updated_at: string
  description: string | null
}

type TaskStatus =
  | { status: 'pending' }
  | { status: 'running'; progress: number; message: string | null }
  | { status: 'paused'; progress: number }
  | { status: 'completed'; duration_secs: number; result: string | null }
  | { status: 'failed'; error: string }
  | { status: 'cancelled' }

interface TaskListResponse {
  success: boolean
  data: {
    tasks: TaskInfo[]
    total: number
    active: number
  }
}

// API 调用
const tasksApi = {
  list: async (): Promise<TaskListResponse> => {
    const res = await fetch('/api/tasks')
    return res.json()
  },
  pause: async (id: string) => {
    const res = await fetch(`/api/tasks/${id}/pause`, { method: 'POST' })
    return res.json()
  },
  resume: async (id: string) => {
    const res = await fetch(`/api/tasks/${id}/resume`, { method: 'POST' })
    return res.json()
  },
  cancel: async (id: string) => {
    const res = await fetch(`/api/tasks/${id}`, { method: 'DELETE' })
    return res.json()
  },
  cleanup: async () => {
    const res = await fetch('/api/tasks/cleanup', { method: 'POST' })
    return res.json()
  },
}

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
  const queryClient = useQueryClient()
  const [confirmModal, setConfirmModal] = useState<{ isOpen: boolean; taskId: string | null; action: 'cancel' | 'cleanup' }>({
    isOpen: false,
    taskId: null,
    action: 'cancel',
  })

  // 获取任务列表
  const { data, refetch, isPending } = useQuery({
    queryKey: ['tasks'],
    queryFn: tasksApi.list,
    refetchInterval: 2000, // 每 2 秒刷新
  })

  const tasks = data?.data?.tasks || []
  const activeCount = data?.data?.active || 0
  const totalCount = data?.data?.total || 0

  // 统计
  const stats = {
    total: totalCount,
    active: activeCount,
    completed: tasks.filter(t => t.status.status === 'completed').length,
    failed: tasks.filter(t => t.status.status === 'failed').length,
  }

  // 暂停任务
  const pauseMutation = useMutation({
    mutationFn: tasksApi.pause,
    onSuccess: () => {
      showSuccess('任务已暂停')
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
    },
    onError: (e: any) => handleError(e, '暂停失败'),
  })

  // 恢复任务
  const resumeMutation = useMutation({
    mutationFn: tasksApi.resume,
    onSuccess: () => {
      showSuccess('任务已恢复')
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
    },
    onError: (e: any) => handleError(e, '恢复失败'),
  })

  // 取消任务
  const cancelMutation = useMutation({
    mutationFn: tasksApi.cancel,
    onSuccess: () => {
      showSuccess('任务已取消')
      setConfirmModal({ ...confirmModal, isOpen: false })
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
    },
    onError: (e: any) => handleError(e, '取消失败'),
  })

  // 清理任务
  const cleanupMutation = useMutation({
    mutationFn: tasksApi.cleanup,
    onSuccess: () => {
      showSuccess('已清理完成的任务')
      setConfirmModal({ ...confirmModal, isOpen: false })
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
    },
    onError: (e: any) => handleError(e, '清理失败'),
  })

  // 获取状态显示信息
  const getStatusInfo = (status: TaskStatus) => {
    const statusKey = status.status
    return {
      label: statusLabels[statusKey] || statusKey,
      color: statusColors[statusKey] || 'default',
      progress: 'progress' in status ? status.progress : undefined,
      message: 'message' in status ? status.message : undefined,
      error: 'error' in status ? status.error : undefined,
      duration: 'duration_secs' in status ? status.duration_secs : undefined,
    }
  }

  // 表格列定义
  const columns = [
    {
      title: '任务类型',
      dataIndex: 'task_type',
      width: 120,
      render: (type: string) => (
        <Chip size="sm" variant="soft" className="font-medium">
          {taskTypeLabels[type] || type}
        </Chip>
      ),
    },
    {
      title: '描述',
      dataIndex: 'description',
      width: 200,
      render: (desc: string | null) => (
        <span className="text-sm text-foreground/80 line-clamp-1">
          {desc || '-'}
        </span>
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 150,
      render: (status: TaskStatus) => {
        const info = getStatusInfo(status)
        return (
          <div className="flex flex-col gap-1.5">
            <Chip
              size="sm"
              variant="soft"
              color={info.color as any}
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
      render: (status: TaskStatus) => {
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
      title: '创建时间',
      dataIndex: 'created_at',
      width: 160,
      render: (time: string) => (
        <span className="text-[11px] text-default-400 font-mono">
          {new Date(time).toLocaleString()}
        </span>
      ),
    },
    {
      title: '操作',
      dataIndex: 'id',
      width: 100,
      render: (_: any, task: TaskInfo) => {
        const status = task.status.status
        const canPause = status === 'running'
        const canResume = status === 'paused'
        const canCancel = status === 'running' || status === 'paused' || status === 'pending'

        return (
          <div className="flex gap-2">
            {canPause && (
              <Button
                isIconOnly
                size="sm"
                variant="secondary"
                onPress={() => pauseMutation.mutate(task.id)}
                className="h-7 w-7 min-w-0 bg-warning/10 text-warning hover:bg-warning/20 border-none shadow-none"
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
                className="h-7 w-7 min-w-0 bg-success/10 text-success hover:bg-success/20 border-none shadow-none"
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
                className="h-7 w-7 min-w-0 bg-danger/10 text-danger hover:bg-danger/20 border-none shadow-none"
              >
                <Xmark className="w-3.5 h-3.5" />
              </Button>
            )}
          </div>
        )
      },
    },
  ]

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
                    cancelMutation.mutate(confirmModal.taskId)
                  } else if (confirmModal.action === 'cleanup') {
                    cleanupMutation.mutate()
                  }
                }}
              >
                确认
              </Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal>
    </div>
  )
}
