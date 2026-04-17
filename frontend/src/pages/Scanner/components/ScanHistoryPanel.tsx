import clsx from 'clsx'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import { Button, Chip, Surface } from '@/ui/heroui'
import { Icon } from '@iconify/react'
import { ArrowRotateLeft, Clock } from '@/ui/icons'
import type { ScanHistory } from '@/api/media'

dayjs.extend(relativeTime)

export function ScanHistoryPanel({
  history,
  selectedDirectory,
  onSelectDirectory,
  onRefresh,
  onRescan,
  scanning,
  taskId,
}: {
  history: ScanHistory[] | undefined
  selectedDirectory: string | null
  onSelectDirectory: (dir: string | null) => void
  onRefresh: () => void
  onRescan: (dir: string) => void
  scanning: boolean
  taskId: string | undefined
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Clock className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-semibold">扫描历史</h2>
          {history && history.length > 0 && (
            <Chip color="accent" variant="soft" size="sm">
              {history.length} 个目录
            </Chip>
          )}
        </div>
        <Button isIconOnly variant="ghost" onPress={onRefresh}>
          <Icon icon="mdi:refresh" className="w-4 h-4" />
        </Button>
      </div>

      {history && history.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {history.map((item) => {
            const fileTypes = parseFileTypes(item.file_types_json)
            const isSelected = selectedDirectory === item.directory

            return (
              <Surface
                key={item.directory}
                variant="default"
                className={clsx(
                  'rounded-xl border border-divider/50 shadow-sm transition-all overflow-hidden bg-background/50',
                  isSelected && 'ring-1 ring-primary border-primary/20',
                )}
              >
                <div className="p-4 flex flex-col gap-4">
                  <div className="flex flex-col gap-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <h3 className="text-sm font-bold truncate leading-tight" title={item.directory}>
                          {item.directory === '/' ? '根目录' : item.directory.split('/').pop() || '根目录'}
                        </h3>
                        <p
                          className="text-[11px] text-default-400 truncate mt-0.5 font-medium"
                          title={item.directory}
                        >
                          {item.directory}
                        </p>
                      </div>
                      <Button
                        isIconOnly
                        size="sm"
                        variant={isSelected ? 'primary' : 'ghost'}
                        onPress={() => onSelectDirectory(isSelected ? null : item.directory)}
                        className="rounded-full w-8 h-8"
                      >
                        <Icon icon={isSelected ? 'mdi:check-circle' : 'mdi:circle-outline'} className="w-4 h-4" />
                      </Button>
                    </div>
                    <div className="flex items-center gap-1.5 text-[10px] font-bold text-default-400 uppercase tracking-wider">
                      <Clock className="w-3 h-3 text-primary/70" />
                      <span>{dayjs(item.last_scanned_at).fromNow()}</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between py-2 border-y border-divider/10">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[10px] font-black text-default-400 uppercase tracking-widest">文件</span>
                      <span className="text-sm font-bold text-foreground">{item.total_files.toLocaleString()}</span>
                    </div>
                    <div className="flex flex-col gap-0.5 items-end">
                      <span className="text-[10px] font-black text-default-400 uppercase tracking-widest">存储</span>
                      <span className="text-sm font-bold text-foreground">{formatFileSize(item.total_size)}</span>
                    </div>
                  </div>

                  {Object.keys(fileTypes).length > 0 && (
                    <div className="flex gap-1.5 flex-wrap">
                      {Object.entries(fileTypes).map(([type, count]) => (
                        <Chip
                          key={type}
                          size="sm"
                          variant="soft"
                          color={type === 'video' ? 'accent' : type === 'audio' ? 'warning' : 'default'}
                          className="h-5 px-1.5 text-[10px] font-bold uppercase"
                        >
                          {type}: {count as React.ReactNode}
                        </Chip>
                      ))}
                    </div>
                  )}

                  <Button
                    size="sm"
                    variant="secondary"
                    fullWidth
                    onPress={() => onRescan(item.directory)}
                    isPending={scanning && taskId !== undefined}
                    className="font-bold h-8 shadow-none"
                  >
                    <ArrowRotateLeft className="w-3.5 h-3.5" />
                    立即更新
                  </Button>
                </div>
              </Surface>
            )
          })}
        </div>
      ) : (
        <Surface variant="secondary" className="rounded-xl p-12 text-center border border-divider">
          <div className="flex flex-col items-center gap-3">
            <div className="p-4 bg-default-100 rounded-full">
              <Icon icon="mdi:history" className="w-8 h-8 text-default-400" />
            </div>
            <div className="flex flex-col gap-1">
              <p className="text-sm font-semibold text-foreground">暂无扫描历史</p>
              <p className="text-xs text-default-400">前往工作流页面开始扫描</p>
            </div>
          </div>
        </Surface>
      )}
    </div>
  )
}

function parseFileTypes(fileTypesJson: string) {
  try {
    return JSON.parse(fileTypesJson || '{}') as Record<string, unknown>
  } catch {
    return {}
  }
}

function formatFileSize(bytes: number) {
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
