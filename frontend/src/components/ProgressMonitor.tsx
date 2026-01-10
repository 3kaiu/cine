import { Chip } from "@heroui/react";
import { useWebSocket } from '@/hooks/useWebSocket'
import { Icon } from '@iconify/react'

interface ProgressMonitorProps {
  taskId?: string
}

export default function ProgressMonitor({ taskId }: ProgressMonitorProps) {
  const { connected, messages } = useWebSocket(
    `ws://${window.location.host}/ws`
  )

  // Filter messages for specific task
  const taskMessages = taskId
    ? messages.filter((m) => m.task_id === taskId)
    : messages

  const latestMessage = taskMessages[taskMessages.length - 1]

  if (!latestMessage) {
    return null
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-2">
          <Icon icon="mdi:pulse" className="w-4 h-4 text-primary animate-pulse" />
          <span className="text-sm font-medium">{latestMessage.task_type}</span>
        </div>
        {!connected && (
          <Chip color="warning" size="sm" variant="soft">
            连接已断开
          </Chip>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <div className="flex justify-between items-center text-xs text-muted">
          <span>进度</span>
          <span className="font-medium">{latestMessage.progress}%</span>
        </div>
        <div className="w-full h-1.5 bg-default-100 rounded-full overflow-hidden">
          <div
            className={`h-full transition-all duration-500 ease-out rounded-full ${
              latestMessage.progress >= 100 ? "bg-success" : "bg-primary"
            }`}
            style={{ width: `${latestMessage.progress}%` }}
          />
        </div>
      </div>

      {latestMessage.current_file && (
        <div className="text-xs text-muted font-mono truncate p-2 bg-default-100 rounded-lg">
          {latestMessage.current_file}
        </div>
      )}

      {latestMessage.message && (
        <p className="text-xs text-muted">
          {latestMessage.message}
        </p>
      )}
    </div>
  )
}
