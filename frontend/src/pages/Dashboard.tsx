import { useEffect, useState } from 'react'
import { Card, Chip } from '@heroui/react'
import { Icon } from '@iconify/react'
import axios from 'axios'

interface DashboardMetrics {
  active_tasks: number
  total_hashes_bytes: number
  total_scrapes: number
  cpu_usage: number
  memory_used_bytes: number
  memory_total_bytes: number
  uptime_seconds: number
}

const formatBytes = (bytes: number) => {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

const formatUptime = (seconds: number) => {
  const d = Math.floor(seconds / (3600 * 24))
  const h = Math.floor((seconds % (3600 * 24)) / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  return `${d}d ${h}h ${m}m`
}

export default function Dashboard() {
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchMetrics = async () => {
    try {
      const response = await axios.get('/api/metrics')
      setMetrics(response.data as DashboardMetrics)
      setLoading(false)
    } catch (error) {
      console.error('Failed to fetch metrics:', error)
    }
  }

  useEffect(() => {
    fetchMetrics()
    const interval = setInterval(fetchMetrics, 3000)
    return () => clearInterval(interval)
  }, [])

  if (loading || !metrics) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Icon icon="lucide:loader-2" className="w-8 h-8 animate-spin text-primary" />
      </div>
    )
  }

  const memoryUsagePercent = (metrics.memory_used_bytes / metrics.memory_total_bytes) * 100

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">性能仪表盘</h1>
          <p className="text-default-500 text-sm">系统实时运行状态与性能指标</p>
        </div>
        <Chip variant="soft" color="accent">
          <div className="flex items-center gap-2">
            <Icon icon="lucide:clock" />
            <span>运行时间: {formatUptime(metrics.uptime_seconds)}</span>
          </div>
        </Chip>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Active Tasks Card */}
        <Card className="border-none bg-default-50/50 shadow-sm">
          <div className="flex flex-row items-center gap-4 p-4">
            <div className="p-3 bg-primary/10 rounded-xl text-primary">
              <Icon icon="lucide:list-checks" className="w-6 h-6" />
            </div>
            <div>
              <p className="text-[10px] text-default-400 font-black uppercase tracking-widest">活动任务</p>
              <p className="text-2xl font-bold">{metrics.active_tasks}</p>
            </div>
          </div>
        </Card>

        {/* CPU Usage Card */}
        <Card className="border-none bg-default-50/50 shadow-sm">
          <div className="space-y-3 p-4">
            <div className="flex items-center justify-between">
              <p className="text-[10px] text-default-400 font-black uppercase tracking-widest">CPU 使用率</p>
              <span className="text-sm font-bold">{metrics.cpu_usage.toFixed(1)}%</span>
            </div>
            <div className="h-1.5 bg-default-200 rounded-full overflow-hidden w-full max-w-md">
              <div
                className={`h-full rounded-full transition-all duration-500 ${metrics.cpu_usage > 80 ? "bg-danger" : metrics.cpu_usage > 50 ? "bg-warning" : "bg-primary"}`}
                style={{ width: `${metrics.cpu_usage}%` }}
              />
            </div>
          </div>
        </Card>

        {/* Memory Usage Card */}
        <Card className="border-none bg-default-50/50 shadow-sm">
          <div className="space-y-3 p-4">
            <div className="flex items-center justify-between">
              <p className="text-[10px] text-default-400 font-black uppercase tracking-widest">内存使用</p>
              <span className="text-sm font-bold">{memoryUsagePercent.toFixed(1)}%</span>
            </div>
            <div className="h-1.5 bg-default-200 rounded-full overflow-hidden w-full max-w-md">
              <div
                className={`h-full rounded-full transition-all duration-500 ${memoryUsagePercent > 90 ? "bg-danger" : memoryUsagePercent > 70 ? "bg-warning" : "bg-primary"}`}
                style={{ width: `${memoryUsagePercent}%` }}
              />
            </div>
            <div className="flex justify-between text-[10px] text-default-400 font-mono">
              <span>{formatBytes(metrics.memory_used_bytes)}</span>
              <span>{formatBytes(metrics.memory_total_bytes)}</span>
            </div>
          </div>
        </Card>

        {/* Throughput Card */}
        <Card className="border-none bg-default-50/50 shadow-sm">
          <div className="flex flex-row items-center gap-4 p-4">
            <div className="p-3 bg-success/10 rounded-xl text-success">
              <Icon icon="lucide:zap" className="w-6 h-6" />
            </div>
            <div>
              <p className="text-[10px] text-default-400 font-black uppercase tracking-widest">累计处理数据</p>
              <p className="text-lg font-bold truncate">{formatBytes(metrics.total_hashes_bytes)}</p>
            </div>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Scrape Stats Card */}
        <Card className="border-none bg-default-50/50 shadow-sm lg:col-span-1">
          <div className="p-6">
            <div className="flex items-center gap-3 mb-6">
              <Icon icon="lucide:cloud" className="text-primary w-5 h-5" />
              <h3 className="font-bold">刮削服务统计</h3>
            </div>
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-sm text-default-500">TMDB API 请求总数</span>
                <span className="text-sm font-mono font-bold">{metrics.total_scrapes}</span>
              </div>
              <div className="h-px bg-default-100 w-full" />
              <div className="bg-primary/5 p-4 rounded-xl border border-primary/10">
                <p className="text-xs text-primary/80 leading-relaxed italic">
                  该指标反映了应用在获取电影和剧集元数据时的活跃程度。
                </p>
              </div>
            </div>
          </div>
        </Card>

        {/* System Info Card */}
        <Card className="border-none bg-default-50/50 shadow-sm lg:col-span-2">
          <div className="p-6">
            <div className="flex items-center gap-3 mb-6">
              <Icon icon="lucide:server" className="text-primary w-5 h-5" />
              <h3 className="font-bold">节点状态</h3>
            </div>
            <div className="grid grid-cols-2 gap-8">
              <div className="space-y-2">
                <p className="text-[9px] text-default-400 font-black uppercase tracking-widest">任务处理速度（模拟）</p>
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-bold italic tracking-tighter">稳健</span>
                  <span className="text-sm text-success font-bold text-success/80 underline decoration-dotted">Optimal</span>
                </div>
              </div>
              <div className="space-y-2">
                <p className="text-[9px] text-default-400 font-black uppercase tracking-widest">IO 压力</p>
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-bold italic tracking-tighter">低</span>
                  <span className="text-sm text-primary font-bold opacity-50 italic">Minimal</span>
                </div>
              </div>
            </div>
            <div className="my-6 h-px bg-default-100 w-full" />
            <div className="flex items-center gap-2 text-xs text-default-400 font-mono">
              <Icon icon="lucide:shield-check" className="w-4 h-4 text-success" />
              <span>系统监控服务正常运行中...</span>
            </div>
          </div>
        </Card>
      </div>
    </div>
  )
}
