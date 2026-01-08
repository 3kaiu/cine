import { Card, Progress, List, Typography } from 'antd'
import { useWebSocket, ProgressMessage } from '@/hooks/useWebSocket'

const { Text } = Typography

interface ProgressMonitorProps {
  taskId?: string
}

export default function ProgressMonitor({ taskId }: ProgressMonitorProps) {
  const { connected, messages } = useWebSocket(
    `ws://${window.location.host}/ws`
  )

  // 过滤特定任务的进度
  const taskMessages = taskId
    ? messages.filter((m) => m.task_id === taskId)
    : messages

  const latestMessage = taskMessages[taskMessages.length - 1]

  if (!latestMessage) {
    return null
  }

  return (
    <Card
      title={`任务进度 - ${latestMessage.task_type}`}
      size="small"
      style={{ marginBottom: 16 }}
    >
      <Progress
        percent={Math.round(latestMessage.progress)}
        status={latestMessage.progress >= 100 ? 'success' : 'active'}
        showInfo
      />
      {latestMessage.current_file && (
        <Text type="secondary" style={{ display: 'block', marginTop: 8 }}>
          当前文件: {latestMessage.current_file}
        </Text>
      )}
      {latestMessage.message && (
        <Text type="secondary" style={{ display: 'block', marginTop: 4 }}>
          {latestMessage.message}
        </Text>
      )}
      {!connected && (
        <Text type="warning" style={{ display: 'block', marginTop: 8 }}>
          WebSocket 未连接
        </Text>
      )}
    </Card>
  )
}
