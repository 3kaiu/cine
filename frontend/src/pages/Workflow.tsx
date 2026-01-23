import { useState, useEffect, useCallback, useMemo } from 'react'
import clsx from 'clsx'
import { Button, Checkbox, Chip, Surface, Label, Switch } from "@heroui/react";
import { Icon } from '@iconify/react'
import {
  Play,
  ArrowRotateLeft,
  Cloud,
  CircleExclamation,
  Pencil,
  Clock,
  TrashBin,
} from '@gravity-ui/icons'
import { mediaApi } from '@/api/media'
import { useMutation, useQuery } from '@tanstack/react-query'
import ProgressMonitor from '@/components/ProgressMonitor'
import { useWebSocket, ProgressMessage } from '@/hooks/useWebSocket'
import { handleError } from '@/utils/errorHandler'
import PageHeader from '@/components/PageHeader'
import StatCard from '@/components/StatCard'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'

dayjs.extend(relativeTime)

interface WorkflowStep {
  id: string
  name: string
  description: string
  enabled: boolean
  status: 'pending' | 'running' | 'completed' | 'error'
  progress?: number
}

export default function Workflow() {
  const DEFAULT_DIRECTORY = '/'
  const [steps, setSteps] = useState<WorkflowStep[]>([
    {
      id: 'scan',
      name: '扫描目录',
      description: '发现并索引媒体文件',
      enabled: true,
      status: 'pending',
    },
    {
      id: 'scrape',
      name: '获取元数据',
      description: '从 TMDB 获取影片信息',
      enabled: true,
      status: 'pending',
    },
    {
      id: 'dedupe',
      name: '去重分析',
      description: '识别并标记重复文件',
      enabled: true,
      status: 'pending',
    },
    {
      id: 'rename',
      name: '批量重命名',
      description: '根据元数据规范化文件名',
      enabled: true,
      status: 'pending',
    },
  ])
  const [cleanupEmptyDirs, setCleanupEmptyDirs] = useState(false)
  const [isRunning, setIsRunning] = useState(false)
  const [currentStepIndex, setCurrentStepIndex] = useState(-1)
  const [viewMode, setViewMode] = useState<'cards' | 'timeline'>('cards')
  const [taskId, setTaskId] = useState<string | undefined>(undefined)
  const [scanCompleted, setScanCompleted] = useState(false)
  const [nextStepIndex, setNextStepIndex] = useState<number | null>(null)

  const { messages } = useWebSocket(`ws://${window.location.host}/ws`)

  // 获取扫描历史
  const { data: scanHistory } = useQuery({
    queryKey: ['scan-history'],
    queryFn: async () => {
      const res = await mediaApi.listScanHistory()
      return res
    }
  })

  // 统计数据
  const stats = useMemo(() => {
    if (!scanHistory || scanHistory.length === 0) {
      return { totalScans: 0, totalFiles: 0, totalSize: 0, lastScan: null }
    }

    const totalScans = scanHistory.length
    const totalFiles = scanHistory.reduce((sum, h: any) => sum + (h.total_files || 0), 0)
    const totalSize = scanHistory.reduce((sum, h: any) => sum + (h.total_size || 0), 0)
    const lastScan = scanHistory[0]?.last_scanned_at || null

    return { totalScans, totalFiles, totalSize, lastScan }
  }, [scanHistory])

  const updateStepStatus = useCallback((stepId: string, status: WorkflowStep['status'], progress?: number) => {
    setSteps(prev => prev.map(step =>
      step.id === stepId ? { ...step, status, progress } : step
    ))
  }, [])

  // 先定义所有 mutations
  const scanMutation = useMutation({
    mutationFn: mediaApi.scanDirectory,
    onSuccess: (data) => {
      setTaskId(data.task_id)
      updateStepStatus('scan', 'running')
    },
    onError: (error: any) => {
      handleError(error, '扫描失败')
      updateStepStatus('scan', 'error')
      setIsRunning(false)
    },
  })

  const scrapeMutation = useMutation({
    mutationFn: mediaApi.batchScrapeMetadata,
    onSuccess: () => {
      updateStepStatus('scrape', 'completed')
      // 延迟一下再进入下一步，让用户看到完成状态
      setTimeout(() => {
        setNextStepIndex(2)
      }, 500)
    },
    onError: (error: any) => {
      handleError(error, '元数据获取失败')
      updateStepStatus('scrape', 'error')
      setIsRunning(false)
      setCurrentStepIndex(-1)
    },
  })

  const dedupeMutation = useMutation({
    mutationFn: mediaApi.findDuplicateMovies,
    onSuccess: () => {
      updateStepStatus('dedupe', 'completed')
      setTimeout(() => {
        setNextStepIndex(3)
      }, 500)
    },
    onError: (error: any) => {
      handleError(error, '去重分析失败')
      updateStepStatus('dedupe', 'error')
      setIsRunning(false)
      setCurrentStepIndex(-1)
    },
  })

  const renameMutation = useMutation({
    mutationFn: mediaApi.batchRename,
    onSuccess: () => {
      updateStepStatus('rename', 'completed')
      setTimeout(() => {
        setNextStepIndex(4)
      }, 500)
    },
    onError: (error: any) => {
      handleError(error, '重命名失败')
      updateStepStatus('rename', 'error')
      setIsRunning(false)
      setCurrentStepIndex(-1)
    },
  })

  const cleanupMutation = useMutation({
    mutationFn: async () => {
      if (!cleanupEmptyDirs) return
      // 查找并删除空目录
      const emptyDirs = await mediaApi.findEmptyDirs({ directory: DEFAULT_DIRECTORY })
      if (emptyDirs.dirs && emptyDirs.dirs.length > 0) {
        await mediaApi.deleteEmptyDirs(emptyDirs.dirs.map(d => d.path))
      }
    },
    onSuccess: () => {
      if (cleanupEmptyDirs) {
        updateStepStatus('cleanup', 'completed')
      }
      setTimeout(() => {
        setIsRunning(false)
        setCurrentStepIndex(-1)
      }, 1000)
    },
    onError: (error: any) => {
      if (cleanupEmptyDirs) {
        handleError(error, '清理空目录失败')
        updateStepStatus('cleanup', 'error')
      }
      setIsRunning(false)
      setCurrentStepIndex(-1)
    },
  })

  // 现在定义 runNextStep，可以使用所有 mutations
  const runNextStep = useCallback(async (stepIndex: number) => {
    if (stepIndex >= steps.length) {
      setIsRunning(false)
      setCurrentStepIndex(-1)
      return
    }

    const step = steps[stepIndex]
    if (!step.enabled) {
      updateStepStatus(step.id, 'completed')
      runNextStep(stepIndex + 1)
      return
    }

    setCurrentStepIndex(stepIndex)
    updateStepStatus(step.id, 'running')

    try {
      switch (step.id) {
        case 'scan':
          // 扫描已经在运行，等待完成（通过WebSocket监听）
          break
        case 'scrape':
          // 获取所有视频文件并批量刮削
          const files = await mediaApi.getFiles({ file_type: 'video', page_size: 1000 })
          if (files.files && files.files.length > 0) {
            scrapeMutation.mutate({
              file_ids: files.files.map(f => f.id),
              source: 'tmdb',
              auto_match: true,
              download_images: true,
              generate_nfo: true,
            })
          } else {
            updateStepStatus('scrape', 'completed')
            runNextStep(stepIndex + 1)
          }
          break
        case 'dedupe':
          // 去重分析（只是查找，不自动删除）
          await dedupeMutation.mutateAsync()
          break
        case 'rename':
          // 获取所有已刮削的文件并重命名
          const scrapedFiles = await mediaApi.getFiles({ file_type: 'video', page_size: 1000 })
          const filesWithMetadata = scrapedFiles.files?.filter(f => f.metadata) || []
          if (filesWithMetadata.length > 0) {
            renameMutation.mutate({
              file_ids: filesWithMetadata.map(f => f.id),
              template: '{title} ({year}).{ext}',
            })
          } else {
            updateStepStatus('rename', 'completed')
            runNextStep(stepIndex + 1)
          }
          break
        case 'cleanup':
          // 清理空目录
          await cleanupMutation.mutateAsync()
          break
      }
    } catch (error) {
      console.error('Step error:', error)
      updateStepStatus(step.id, 'error')
      setIsRunning(false)
      setCurrentStepIndex(-1)
    }
  }, [steps, scrapeMutation, dedupeMutation, renameMutation, cleanupMutation, cleanupEmptyDirs, updateStepStatus])

  // 监听 nextStepIndex 变化，触发下一步
  useEffect(() => {
    if (nextStepIndex !== null && isRunning) {
      runNextStep(nextStepIndex)
      setNextStepIndex(null)
    }
  }, [nextStepIndex, isRunning, runNextStep])

  // 监听扫描任务完成
  useEffect(() => {
    if (taskId && isRunning && currentStepIndex === 0 && !scanCompleted) {
      const taskMessages = messages.filter((m: ProgressMessage) => m.task_id === taskId)
      const latestMessage = taskMessages[taskMessages.length - 1]

      if (latestMessage && latestMessage.progress >= 100) {
        setScanCompleted(true)
        updateStepStatus('scan', 'completed')
        // 扫描完成，进入下一步
        setTimeout(() => {
          runNextStep(1)
        }, 1000)
      }
    }
  }, [messages, taskId, isRunning, currentStepIndex, scanCompleted, updateStepStatus, runNextStep])

  const handleStart = async () => {
    // 重置所有步骤状态
    setSteps(prev => prev.map(step => ({ ...step, status: 'pending' as const, progress: undefined })))
    setIsRunning(true)
    setCurrentStepIndex(0)
    setTaskId(undefined)
    setScanCompleted(false)

    // 开始第一步：扫描
    scanMutation.mutate({
      directory: DEFAULT_DIRECTORY,
      recursive: true,
      file_types: ['video', 'audio', 'image'],
    })
  }

  const toggleStep = (stepId: string) => {
    setSteps(prev => prev.map(step =>
      step.id === stepId ? { ...step, enabled: !step.enabled } : step
    ))
  }

  const enabledStepsCount = steps.filter(s => s.enabled).length

  return (
    <div className="flex flex-col gap-4 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <PageHeader
        title="自动化工作流"
        description="一键完成扫描、元数据获取、去重和重命名"
      />

      {/* 工作流控制 */}
      <Surface variant="default" className="rounded-xl p-4 border border-divider/50 shadow-sm bg-background/50">
        <div className="flex items-center justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <Icon icon="mdi:cog-outline" className="w-4 h-4 text-primary" />
              <label className="text-sm font-black uppercase tracking-widest text-foreground/80">工作流控制</label>
            </div>
            <p className="text-xs text-default-400 font-medium">配置并启动媒体自动化处理流水线</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-3 px-3 py-1.5 rounded-lg bg-default-100/50 border border-divider/10">
              <Label className="text-[10px] font-black uppercase tracking-widest text-default-500">清理空目录</Label>
              <Switch
                isSelected={cleanupEmptyDirs}
                onChange={setCleanupEmptyDirs}
                size="sm"
                isDisabled={isRunning}
              >
                <Switch.Control>
                  <Switch.Thumb />
                </Switch.Control>
              </Switch>
            </div>
            <Button
              variant={isRunning ? 'danger' : 'primary'}
              size="md"
              onPress={handleStart}
              isPending={isRunning}
              className="min-w-[120px] font-bold shadow-none"
            >
              {isRunning ? (
                <><Icon icon="mdi:stop-circle-outline" className="w-4 h-4 mr-2" />停止运行</>
              ) : (
                <><Play className="w-4 h-4 mr-2" />启动工作流</>
              )}
            </Button>
          </div>
        </div>

        {/* 进度监控 */}
        {isRunning && taskId && (
          <div className="mt-4 pt-4 border-t border-divider/10">
            <ProgressMonitor taskId={taskId} />
          </div>
        )}
      </Surface>

      {/* 统计卡片 */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <StatCard
          label="扫描次数"
          value={stats.totalScans}
          icon={<ArrowRotateLeft className="w-6 h-6" />}
          color="primary"
          description="累计完成的目录扫描"
        />
        <StatCard
          label="总文件数"
          value={stats.totalFiles}
          icon={<Icon icon="mdi:file-multiple" className="w-6 h-6" />}
          color="accent"
          description="已索引的媒体文件总数"
        />
        <StatCard
          label="总大小"
          value={formatSize(stats.totalSize)}
          icon={<Icon icon="mdi:harddisk" className="w-6 h-6" />}
          color="warning"
          description="媒体库占用存储空间"
        />
        <StatCard
          label="最近扫描"
          value={stats.lastScan ? dayjs(stats.lastScan).fromNow() : '无'}
          icon={<Clock className="w-6 h-6" />}
          color="success"
          description="上次扫描时间"
        />
      </div>

      {/* 工作流步骤 */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-black uppercase tracking-widest text-foreground/70">执行阶段</h2>
            <Chip color="accent" variant="soft" className="h-5 text-[10px] font-bold px-2 uppercase tracking-tight">
              {enabledStepsCount} / {steps.length} 启用
            </Chip>
          </div>
          <div className="flex gap-1 p-1 bg-default-100/50 rounded-lg border border-divider/10">
            <Button
              isIconOnly
              size="sm"
              variant="secondary"
              onPress={() => setViewMode('cards')}
              className={clsx(
                "h-7 w-7 min-w-0 transition-all border-none shadow-none",
                viewMode === 'cards' ? "bg-background text-primary" : "bg-transparent text-default-400"
              )}
            >
              <Icon icon="mdi:view-grid-outline" className="w-4 h-4" />
            </Button>
            <Button
              isIconOnly
              size="sm"
              variant="secondary"
              onPress={() => setViewMode('timeline')}
              className={clsx(
                "h-7 w-7 min-w-0 transition-all border-none shadow-none",
                viewMode === 'timeline' ? "bg-background text-primary" : "bg-transparent text-default-400"
              )}
            >
              <Icon icon="mdi:timeline-outline" className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {viewMode === 'cards' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {steps.map((step, index) => {
              const isActive = currentStepIndex === index && isRunning
              const isCompleted = step.status === 'completed'
              const isError = step.status === 'error'
              const isPending = step.status === 'pending'

              return (
                <Surface
                  key={step.id}
                  variant="default"
                  className={clsx(
                    "rounded-xl p-4 border transition-all duration-200 bg-background/50",
                    isActive ? "border-primary/50 ring-1 ring-primary/20 shadow-md" : "border-divider/50 shadow-sm",
                    isCompleted && "border-success/30",
                    isError && "border-danger/30"
                  )}
                >
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-start gap-4 flex-1">
                      <div className={clsx(
                        "w-12 h-12 rounded-xl flex items-center justify-center shrink-0 border border-divider/10 transition-colors",
                        isActive ? "bg-primary/10 text-primary border-primary/20" :
                          isCompleted ? "bg-success/10 text-success border-success/20" :
                            isError ? "bg-danger/10 text-danger border-danger/20" :
                              "bg-default-100/50 text-default-400"
                      )}>
                        {getStepIcon(step.id, isActive, isCompleted, isError)}
                      </div>
                      <div className="flex flex-col gap-1 min-w-0">
                        <h3 className="text-[13px] font-bold text-foreground/90">{step.name}</h3>
                        <p className="text-[11px] text-default-400 font-medium line-clamp-2 leading-relaxed">{step.description}</p>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-3 shrink-0">
                      <Checkbox
                        id={`step-${step.id}-card`}
                        isSelected={step.enabled}
                        onChange={() => toggleStep(step.id)}
                        isDisabled={isRunning}
                        className="p-0 m-0"
                      >
                        <Checkbox.Control className="w-4 h-4" />
                      </Checkbox>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {isActive && (
                          <Chip size="sm" variant="soft" color="accent" className="h-5 text-[10px] font-bold px-2 uppercase tracking-tight">
                            <Icon icon="mdi:loading" className="w-3 h-3 animate-spin mr-1" />
                            运行中
                          </Chip>
                        )}
                        {isCompleted && (
                          <Chip size="sm" variant="soft" color="success" className="h-5 text-[10px] font-bold px-2 uppercase tracking-tight">
                            <Icon icon="mdi:check" className="w-3 h-3 mr-1" />
                            已完成
                          </Chip>
                        )}
                        {isError && (
                          <Chip size="sm" variant="soft" color="danger" className="h-5 text-[10px] font-bold px-2 uppercase tracking-tight">
                            <Icon icon="mdi:close" className="w-3 h-3 mr-1" />
                            失败
                          </Chip>
                        )}
                        {isPending && !step.enabled && (
                          <Chip size="sm" variant="soft" color="default" className="h-5 text-[10px] font-bold px-2 uppercase tracking-tight opacity-60">
                            禁用
                          </Chip>
                        )}
                        {isPending && step.enabled && (
                          <Chip size="sm" variant="soft" color="default" className="h-5 text-[10px] font-bold px-2 uppercase tracking-tight">
                            待执行
                          </Chip>
                        )}
                      </div>
                    </div>
                  </div>
                </Surface>
              )
            })}
          </div>
        ) : (
          <div className="flex flex-col gap-0 px-4">
            {steps.map((step, index) => {
              const isActive = currentStepIndex === index && isRunning
              const isCompleted = step.status === 'completed'
              const isError = step.status === 'error'
              const isPending = step.status === 'pending'

              return (
                <div key={step.id} className="flex items-start gap-6">
                  <div className="flex flex-col items-center pt-2">
                    <div className={clsx(
                      "w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border border-divider/10 transition-all duration-300 z-10",
                      isActive ? "bg-primary text-white shadow-lg shadow-primary/20 scale-110" :
                        isCompleted ? "bg-success/20 text-success border-success/30" :
                          isError ? "bg-danger text-white" :
                            step.enabled ? "bg-background border-divider/50 text-default-600 shadow-sm" : "bg-default-50 text-default-400 border-divider/20"
                    )}>
                      {getStepIcon(step.id, isActive, isCompleted, isError)}
                    </div>
                    {index < steps.length - 1 && (
                      <div className={clsx(
                        "w-0.5 flex-1 my-2 transition-colors duration-500 h-12",
                        isCompleted ? "bg-gradient-to-b from-success/30 to-default-200" : "bg-default-200"
                      )} />
                    )}
                  </div>
                  <div className="flex-1 py-1.5">
                    <Surface variant="default" className={clsx(
                      "p-4 rounded-2xl border transition-all duration-300 bg-background/50",
                      isActive ? "border-primary/40 ring-1 ring-primary/10 shadow-md translate-x-1" : "border-divider/30 shadow-sm"
                    )}>
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex-1">
                          <h3 className="text-[13px] font-bold text-foreground/90">{step.name}</h3>
                          <p className="text-[11px] text-default-400 font-medium mt-1 leading-relaxed">{step.description}</p>
                        </div>
                        <div className="flex flex-col items-end gap-3 shrink-0">
                          <Checkbox
                            id={`step-${step.id}-timeline`}
                            isSelected={step.enabled}
                            onChange={() => toggleStep(step.id)}
                            isDisabled={isRunning}
                            className="p-0 m-0"
                          >
                            <Checkbox.Control className="w-4 h-4" />
                          </Checkbox>

                          <div className="flex items-center gap-1.5 shrink-0">
                            {isActive && (
                              <Chip size="sm" variant="soft" color="accent" className="h-5 text-[10px] font-bold px-2 uppercase tracking-tight">
                                <Icon icon="mdi:sync" className="w-3 h-3 animate-spin mr-1" />
                                运行中
                              </Chip>
                            )}
                            {isCompleted && (
                              <Chip size="sm" variant="soft" color="success" className="h-5 text-[10px] font-bold px-2 uppercase tracking-tight">
                                <Icon icon="mdi:check" className="w-3 h-3 mr-1" />
                                完成
                              </Chip>
                            )}
                            {isError && (
                              <Chip size="sm" variant="soft" color="danger" className="h-5 text-[10px] font-bold px-2 uppercase tracking-tight">
                                <Icon icon="mdi:close" className="w-3 h-3 mr-1" />
                                失败
                              </Chip>
                            )}
                            {isPending && !step.enabled && (
                              <Chip size="sm" variant="soft" color="default" className="h-5 text-[10px] font-bold px-2 uppercase tracking-tight opacity-60">
                                禁用
                              </Chip>
                            )}
                            {isPending && step.enabled && (
                              <Chip size="sm" variant="soft" color="default" className="h-5 text-[10px] font-bold px-2 uppercase tracking-tight">
                                待执行
                              </Chip>
                            )}
                          </div>
                        </div>
                      </div>
                    </Surface>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
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

function getStepIcon(stepId: string, isActive: boolean, isCompleted: boolean, isError: boolean) {
  const iconClass = `w-4 h-4 ${isActive ? 'text-primary' :
    isCompleted ? 'text-success' :
      isError ? 'text-danger' :
        'text-default-500'
    }`

  if (isActive) {
    return <Icon icon="mdi:loading" className={`${iconClass} animate-spin`} />
  }

  switch (stepId) {
    case 'scan':
      return <ArrowRotateLeft className={iconClass} />
    case 'scrape':
      return <Cloud className={iconClass} />
    case 'dedupe':
      return <CircleExclamation className={iconClass} />
    case 'rename':
      return <Pencil className={iconClass} />
    case 'cleanup':
      return <TrashBin className={iconClass} />
    default:
      return null
  }
}
