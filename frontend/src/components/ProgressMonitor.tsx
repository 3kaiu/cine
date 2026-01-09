import { Card, CardBody, Progress, Chip } from "@heroui/react";
import { useWebSocket } from '@/hooks/useWebSocket'
import { Activity } from 'react-feather'

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
    <Card className="w-full bg-content2/50 backdrop-blur-sm border-none shadow-none">
      <CardBody className="gap-3">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2">
            <Activity size={16} className="text-primary animate-pulse" />
            <span className="text-sm font-semibold text-foreground/80">{latestMessage.task_type}</span>
          </div>
          {!connected && <Chip color="warning" size="sm" variant="flat">Disconnected</Chip>}
        </div>

        <Progress
          size="sm"
          value={latestMessage.progress}
          color={latestMessage.progress >= 100 ? "success" : "primary"}
          showValueLabel={true}
          className="max-w-full"
        />

        <div className="flex flex-col gap-1">
          {latestMessage.current_file && (
            <p className="text-xs text-foreground/60 truncate font-mono">
              {latestMessage.current_file}
            </p>
          )}
          {latestMessage.message && (
            <p className="text-xs text-foreground/50 italic">
              {latestMessage.message}
            </p>
          )}
        </div>
      </CardBody>
    </Card>
  )
}
