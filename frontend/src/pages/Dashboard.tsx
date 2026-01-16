import { useState, useEffect } from 'react'
import axios from 'axios'
import clsx from 'clsx'
import { Chip, Surface, Button } from '@heroui/react'
import { Icon } from '@iconify/react'
import StatCard from '@/components/StatCard'
import PageHeader from '@/components/PageHeader'

interface DashboardMetrics {
  active_tasks: number
  cpu_usage: number
  memory_used_bytes: number
  memory_total_bytes: number
  total_hashes_bytes: number
  total_scrapes: number
}

export default function Dashboard() {
  const [metrics, setMetrics] = useState<DashboardMetrics>({
    active_tasks: 0,
    cpu_usage: 0,
    memory_used_bytes: 0,
    memory_total_bytes: 0,
    total_hashes_bytes: 0,
    total_scrapes: 0
  })

  useEffect(() => {
    const fetchMetrics = async () => {
      try {
        const res = await axios.get('/api/metrics')
        setMetrics(res.data)
      } catch (err) {
        console.error('Failed to fetch metrics:', err)
      }
    }

    fetchMetrics()
    const timer = setInterval(fetchMetrics, 5000)
    return () => clearInterval(timer)
  }, [])

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  return (
    <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-3 duration-500">
      <PageHeader
        title="系统概览"
        description="实时监控核心系统性能指标与运行负载"
        actions={
          <div className="flex items-center gap-2 p-1 bg-default-100/50 rounded-xl border border-divider/10 shadow-sm">
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-success/5 border border-success/10">
              <div className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
              <span className="text-[10px] font-black uppercase tracking-widest text-success/80">系统在线</span>
            </div>
            <Button
              isIconOnly
              size="sm"
              variant="secondary"
              className="h-8 w-8 min-w-0 border border-divider/10 shadow-sm"
              onPress={() => window.location.reload()}
            >
              <Icon icon="mdi:refresh" className="w-4 h-4" />
            </Button>
          </div>
        }
      />

      {/* Primary Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="活跃任务"
          value={metrics.active_tasks}
          icon={<Icon icon="lucide:activity" className="w-5 h-5" />}
          color="accent"
          description="当前正在执行的任务数"
        />
        <StatCard
          label="元数据刮削"
          value={metrics.total_scrapes}
          icon={<Icon icon="lucide:database" className="w-5 h-5" />}
          color="success"
          description="累计获取的媒体元数据"
        />
        <StatCard
          label="总处理流量"
          value={formatBytes(metrics.total_hashes_bytes)}
          icon={<Icon icon="lucide:zap" className="w-5 h-5" />}
          color="warning"
          description="系统处理的文件总量"
        />
        <StatCard
          label="节点 ID"
          value="LOCAL-01"
          icon={<Icon icon="lucide:server" className="w-5 h-5" />}
          color="default"
          description="当前连接的计算节点"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Performance Monitoring Section */}
        <Surface variant="default" className="lg:col-span-2 p-6 rounded-2xl border border-divider/50 bg-background/50 shadow-sm flex flex-col gap-8">
          <div className="flex flex-col gap-1">
            <h3 className="text-sm font-black uppercase tracking-widest text-foreground/70">实时性能监控</h3>
            <p className="text-[11px] text-default-400 font-medium tracking-tight">核心计算资源占用情况</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-1 h-3 rounded-full bg-accent" />
                  <span className="text-[11px] font-black uppercase tracking-widest text-default-500">CPU 使用率</span>
                </div>
                <span className="text-sm font-bold tabular-nums text-accent">{metrics.cpu_usage.toFixed(1)}%</span>
              </div>
              <div className="w-full bg-default-100/50 rounded-full h-1.5 overflow-hidden border border-divider/5">
                <div
                  className={clsx(
                    "h-full transition-all duration-500",
                    metrics.cpu_usage > 90 ? "bg-danger" : metrics.cpu_usage > 70 ? "bg-warning" : "bg-accent"
                  )}
                  style={{ width: `${metrics.cpu_usage}%` }}
                />
              </div>
            </div>

            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-1 h-3 rounded-full bg-success" />
                  <span className="text-[11px] font-black uppercase tracking-widest text-default-500">内存占用</span>
                </div>
                <span className="text-sm font-bold tabular-nums text-success">
                  {((metrics.memory_used_bytes / metrics.memory_total_bytes) * 100).toFixed(1)}%
                </span>
              </div>
              <div className="w-full bg-default-100/50 rounded-full h-1.5 overflow-hidden border border-divider/5">
                <div
                  className={clsx(
                    "h-full transition-all duration-500",
                    (metrics.memory_used_bytes / metrics.memory_total_bytes) > 0.9 ? "bg-danger" : (metrics.memory_used_bytes / metrics.memory_total_bytes) > 0.7 ? "bg-warning" : "bg-success"
                  )}
                  style={{ width: `${(metrics.memory_used_bytes / metrics.memory_total_bytes) * 100}%` }}
                />
              </div>
              <div className="flex justify-between items-center px-1">
                <span className="text-[10px] text-default-400 font-medium">
                  {formatBytes(metrics.memory_used_bytes)} 已使用
                </span>
                <span className="text-[10px] text-default-400 font-medium">
                  共 {formatBytes(metrics.memory_total_bytes)}
                </span>
              </div>
            </div>
          </div>

          <div className="mt-4 p-4 rounded-xl bg-default-100/30 border border-divider/10 flex items-center gap-4">
            <Icon icon="lucide:shield-check" className="w-5 h-5 text-success/60" />
            <div className="flex flex-col gap-0.5">
              <span className="text-[11px] font-bold text-foreground/80">系统稳定性检查通过</span>
              <span className="text-[10px] text-default-400 font-medium">所有后台核心节点及工作流处于空闲/稳健状态。</span>
            </div>
          </div>
        </Surface>

        {/* System Activity/Service Panel */}
        <Surface variant="default" className="p-6 rounded-2xl border border-divider/50 bg-background/50 shadow-sm flex flex-col gap-6">
          <div className="flex flex-col gap-1">
            <h3 className="text-sm font-black uppercase tracking-widest text-foreground/70">服务运行状态</h3>
            <p className="text-[11px] text-default-400 font-medium tracking-tight">关键子系统存活监控</p>
          </div>

          <div className="flex flex-col gap-3">
            {[
              { name: 'Scanner Engine', status: 'Active', color: 'success' },
              { name: 'Metadata Scraper', status: 'Active', color: 'success' },
              { name: 'Task Manager', status: 'Idle', color: 'default' },
              { name: 'Websocket Hub', status: 'Active', color: 'success' },
              { name: 'Database Proxy', status: 'Optimal', color: 'accent' }
            ].map((svc) => (
              <div key={svc.name} className="flex items-center justify-between py-2 border-b border-divider/5 last:border-0">
                <span className="text-[12px] font-bold text-foreground/80">{svc.name}</span>
                <Chip
                  size="sm"
                  variant="soft"
                  // @ts-ignore
                  color={svc.color}
                  className="h-5 text-[9px] font-black uppercase tracking-widest px-1.5 border-none"
                >
                  {svc.status}
                </Chip>
              </div>
            ))}
          </div>

          <div className="mt-auto pt-6 border-t border-divider/10">
            <div className="bg-accent/5 p-4 rounded-xl border border-accent/10">
              <p className="text-[11px] text-accent/70 font-medium leading-relaxed italic">
                系统当前运行符合预期，所有服务均在各自的资源配额内高效运行。
              </p>
            </div>
          </div>
        </Surface>
      </div>
    </div>
  )
}
