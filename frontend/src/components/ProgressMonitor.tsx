import { Card, Chip } from "@heroui/react";
import { useWebSocket } from '@/hooks/useWebSocket'
import { Pulse } from '@gravity-ui/icons'

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

  const progressColor = latestMessage.progress >= 100 ? "bg-success" : "bg-primary"

  return (
    <Card className="w-full bg-default-50/50 backdrop-blur-sm border-none shadow-none p-0">
      <Card.Content className="gap-3 p-4">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2">
            <Pulse className="w-[16px] h-[16px] text-primary animate-pulse" />
            <span className="text-sm font-bold text-foreground/80 tracking-tight">{latestMessage.task_type}</span>
          </div>
          {!connected && <Chip color="warning" size="sm" variant="soft" className="text-[10px] font-bold h-5 px-2">连接已断开</Chip>}
        </div>

        {/* Custom Progress Bar */}
        <div className="w-full h-1.5 bg-default-100 rounded-full overflow-hidden">
          <div
            className={`h-full ${progressColor} transition-all duration-500 ease-out h-full rounded-full`}
            style={{ width: `${latestMessage.progress}%` }}
          />
        </div>
        <div className="flex justify-between items-center -mt-1">
          <span className="text-[10px] text-default-400 font-bold uppercase tracking-wider">Progress</span>
          <span className="text-[10px] text-primary font-black">{latestMessage.progress}%</span>
        </div>

        <div className="flex flex-col gap-1.5 pt-1">
          {latestMessage.current_file && (
            <p className="text-[11px] text-foreground/60 truncate font-mono bg-default-100/30 p-1.5 rounded-lg border border-divider/5">
              {latestMessage.current_file}
            </p>
          )}
          {latestMessage.message && (
            <p className="text-[11px] text-default-400 font-medium italic px-1">
              {latestMessage.message}
            </p>
          )}
        </div>
      </Card.Content>
    </Card>
  )
}
