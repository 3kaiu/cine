import { useState, useEffect, useCallback, useMemo } from 'react'
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
import { useWebSocket } from '@/hooks/useWebSocket'
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
      const taskMessages = messages.filter(m => m.task_id === taskId)
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
      <Surface variant="secondary" className="rounded-xl p-4 border border-divider">
        <div className="flex items-center justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <Icon icon="mdi:cog" className="w-4 h-4 text-default-500" />
              <label className="text-sm font-semibold text-foreground">工作流控制</label>
            </div>
            <p className="text-xs text-default-500">启动或停止媒体处理工作流</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Label className="text-xs text-default-500">清理空目录</Label>
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
              className="min-w-[120px]"
            >
              {isRunning ? (
                <><Icon icon="mdi:stop" className="w-4 h-4 mr-1" />停止</>
              ) : (
                <><Play className="w-4 h-4 mr-1" />开始</>
              )}
            </Button>
          </div>
        </div>

        {/* 进度监控 */}
        {isRunning && taskId && (
          <Surface variant="default" className="rounded-lg p-4 border border-divider mt-4">
            <ProgressMonitor taskId={taskId} />
          </Surface>
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
            <h2 className="text-lg font-semibold">工作流步骤</h2>
            <Chip color="accent" variant="soft" size="sm">
              {enabledStepsCount} / {steps.length} 启用
            </Chip>
          </div>
          <div className="flex gap-2">
            <Button
              isIconOnly
              size="sm"
              variant={viewMode === 'cards' ? 'primary' : 'ghost'}
              onPress={() => setViewMode('cards')}
            >
              <Icon icon="mdi:view-grid" className="w-4 h-4" />
            </Button>
            <Button
              isIconOnly
              size="sm"
              variant={viewMode === 'timeline' ? 'primary' : 'ghost'}
              onPress={() => setViewMode('timeline')}
            >
              <Icon icon="mdi:timeline" className="w-4 h-4" />
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
                  variant="secondary"
                  className={`rounded-xl p-4 border transition-all duration-200 ${
                    isActive ? 'border-accent/30 shadow-sm' : 'border-divider/10'
                  } ${isCompleted ? 'border-success/20' : ''} ${isError ? 'border-danger/20' : ''}`}
                >
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-start gap-3 flex-1">
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
                        isActive ? 'bg-accent/20 text-accent' : 
                        isCompleted ? 'bg-success/20 text-success' : 
                        isError ? 'bg-danger/20 text-danger' : 
                        step.enabled ? 'bg-default-100 text-default-600' : 'bg-default-50 text-default-400'
                      }`}>
                        {getStepIcon(step.id, isActive, isCompleted, isError)}
                      </div>
                      <div className="flex flex-col gap-1 min-w-0">
                        <h3 className="text-sm font-semibold text-foreground">{step.name}</h3>
                        <p className="text-xs text-default-500 line-clamp-2">{step.description}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {isActive && (
                        <div className="flex items-center gap-1 px-2 py-1 rounded-md bg-accent/10 text-accent text-[11px] font-medium">
                          <Icon icon="mdi:sync" className="w-3 h-3 animate-spin" />
                          运行中
                        </div>
                      )}
                      {isCompleted && (
                        <div className="flex items-center gap-1 px-2 py-1 rounded-md bg-success/10 text-success text-[11px] font-medium">
                          <Icon icon="mdi:check" className="w-3 h-3" />
                          已完成
                        </div>
                      )}
                      {isError && (
                        <div className="flex items-center gap-1 px-2 py-1 rounded-md bg-danger/10 text-danger text-[11px] font-medium">
                          <Icon icon="mdi:close" className="w-3 h-3" />
                          失败
                        </div>
                      )}
                      {isPending && !step.enabled && (
                        <div className="flex items-center gap-1 px-2 py-1 rounded-md bg-default-100 text-default-500 text-[11px] font-medium">
                          <Icon icon="mdi:lock" className="w-3 h-3" />
                          已禁用
                        </div>
                      )}
                      {isPending && step.enabled && (
                        <div className="flex items-center gap-1 px-2 py-1 rounded-md bg-default-100 text-default-500 text-[11px] font-medium">
                          <Icon icon="mdi:clock-time-eight" className="w-3 h-3" />
                          等待中
                        </div>
                      )}
                      <Checkbox
                        id={`step-${step.id}-card`}
                        isSelected={step.enabled}
                        onChange={() => toggleStep(step.id)}
                        isDisabled={isRunning}
                      >
                        <Checkbox.Control>
                          <Checkbox.Indicator />
                        </Checkbox.Control>
                      </Checkbox>
                    </div>
                  </div>
                </Surface>
              )
            })}
          </div>
        ) : (
          <div className="flex flex-col gap-0">
            {steps.map((step, index) => {
              const isActive = currentStepIndex === index && isRunning
              const isCompleted = step.status === 'completed'
              const isError = step.status === 'error'
              const isPending = step.status === 'pending'

              return (
                <div key={step.id} className="flex items-start gap-3">
                  <div className="flex flex-col items-center pt-1">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                      isActive ? 'bg-accent text-white' : 
                      isCompleted ? 'bg-success text-white' : 
                      isError ? 'bg-danger text-white' : 
                      step.enabled ? 'bg-default-200 text-default-600' : 'bg-default-100 text-default-400'
                    }`}>
                      {getStepIcon(step.id, isActive, isCompleted, isError)}
                    </div>
                    {index < steps.length - 1 && (
                      <div className={`w-0.5 flex-1 my-2 ${
                        isCompleted ? 'bg-success/50' : 'bg-default-200'
                      }`} />
                    )}
                  </div>
                  <div className="flex-1 py-1">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex-1">
                        <h3 className="text-sm font-semibold text-foreground">{step.name}</h3>
                        <p className="text-xs text-default-500 line-clamp-2 mt-0.5">{step.description}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {isActive && (
                          <div className="flex items-center gap-1 px-2 py-1 rounded-md bg-accent/10 text-accent text-[11px] font-medium">
                            <Icon icon="mdi:sync" className="w-3 h-3 animate-spin" />
                            运行中
                          </div>
                        )}
                        {isCompleted && (
                          <div className="flex items-center gap-1 px-2 py-1 rounded-md bg-success/10 text-success text-[11px] font-medium">
                            <Icon icon="mdi:check" className="w-3 h-3" />
                            已完成
                          </div>
                        )}
                        {isError && (
                          <div className="flex items-center gap-1 px-2 py-1 rounded-md bg-danger/10 text-danger text-[11px] font-medium">
                            <Icon icon="mdi:close" className="w-3 h-3" />
                            失败
                          </div>
                        )}
                        {isPending && !step.enabled && (
                          <div className="flex items-center gap-1 px-2 py-1 rounded-md bg-default-100 text-default-500 text-[11px] font-medium">
                            <Icon icon="mdi:lock" className="w-3 h-3" />
                            已禁用
                          </div>
                        )}
                        {isPending && step.enabled && (
                          <div className="flex items-center gap-1 px-2 py-1 rounded-md bg-default-100 text-default-500 text-[11px] font-medium">
                            <Icon icon="mdi:clock-time-eight" className="w-3 h-3" />
                            等待中
                          </div>
                        )}
                        <Checkbox
                          id={`step-${step.id}-timeline`}
                          isSelected={step.enabled}
                          onChange={() => toggleStep(step.id)}
                          isDisabled={isRunning}
                        >
                          <Checkbox.Control>
                            <Checkbox.Indicator />
                          </Checkbox.Control>
                        </Checkbox>
                      </div>
                    </div>
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
  const iconClass = `w-4 h-4 ${
    isActive ? 'text-primary' : 
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
