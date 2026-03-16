import { Icon } from '@iconify/react'
import StatCard from '@/components/StatCard'

export function MediaStatsCards({
  stats,
}: {
  stats: { total: number; video: number; audio: number; image: number; totalSize: number; avgQuality: number }
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
      <StatCard
        label="总文件"
        value={stats.total}
        icon={<Icon icon="mdi:file-multiple" className="w-6 h-6" />}
        color="primary"
        description="媒体库文件总数"
      />
      <StatCard
        label="视频"
        value={stats.video}
        icon={<Icon icon="mdi:video" className="w-6 h-6" />}
        color="accent"
        description="视频文件数量"
      />
      <StatCard
        label="总大小"
        value={formatSize(stats.totalSize)}
        icon={<Icon icon="mdi:harddisk" className="w-6 h-6" />}
        color="warning"
        description="占用存储空间"
      />
      <StatCard
        label="平均质量"
        value={stats.avgQuality}
        icon={<Icon icon="mdi:star" className="w-6 h-6" />}
        color="success"
        description="视频平均质量"
      />
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

