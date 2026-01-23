import { useOptimizedWebSocket } from '@/utils/WebSocketManager'

export interface ProgressMessage {
  task_id: string
  task_type: string
  progress: number
  current_file?: string
  message?: string
}

/**
 * 优化的WebSocket Hook
 *
 * 特性：
 * - 连接池复用：相同URL共享连接
 * - 智能重连：指数退避重连策略
 * - 消息压缩：批量消息压缩传输
 * - 心跳检测：自动检测连接健康状态
 * - 消息队列：离线时自动排队发送
 * - 内存管理：限制消息历史长度
 */
export function useWebSocket(url: string) {
  const { connected, messages, send, sendBatch } = useOptimizedWebSocket(url)

  return { connected, messages, send, sendBatch }
}
