import { Card } from "@heroui/react"
import { HardDrive } from '@gravity-ui/icons'

interface StorageData {
  label: string
  value: number
  color: string
  icon: React.ReactNode
}

interface StorageChartProps {
  total: number
  used: number
  breakdown: StorageData[]
}

export default function StorageChart({ total, used, breakdown }: StorageChartProps) {
  const percentage = total > 0 ? Math.round((used / total) * 100) : 0
  const remaining = total - used

  return (
    <Card className="p-6 border border-divider/10">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <HardDrive className="w-5 h-5 text-default-500" />
          <h3 className="text-sm font-semibold text-foreground">存储空间</h3>
        </div>
        <span className="text-xs text-default-500">{percentage}% 已使用</span>
      </div>

      {/* Progress Bar */}
      <div className="mb-6">
        <div className="h-3 bg-default-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-primary to-accent rounded-full transition-all duration-500"
            style={{ width: `${percentage}%` }}
          />
        </div>
        <div className="flex justify-between mt-2 text-xs text-default-500">
          <span>{formatSize(used)} 已使用</span>
          <span>{formatSize(remaining)} 可用</span>
        </div>
      </div>

      {/* Breakdown */}
      <div className="space-y-3">
        {breakdown.map((item, index) => {
          const itemPercentage = total > 0 ? Math.round((item.value / total) * 100) : 0
          return (
            <div key={index} className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${item.color}20` }}>
                <span className="text-sm" style={{ color: item.color }}>{item.icon}</span>
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium text-foreground">{item.label}</span>
                  <span className="text-xs text-default-500">{formatSize(item.value)} ({itemPercentage}%)</span>
                </div>
                <div className="h-1.5 bg-default-100 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${itemPercentage}%`, backgroundColor: item.color }}
                  />
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </Card>
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

  return `${size.toFixed(1)} ${units[unitIndex]}`
}
