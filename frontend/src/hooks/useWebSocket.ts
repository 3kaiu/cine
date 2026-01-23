import { useState, useEffect, useCallback } from 'react'
import { WebSocketManager, ConnectionState } from '@/utils/WebSocketManager'

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
  const manager = WebSocketManager.getInstance()
  const connection = manager.getConnection(url)

  const [connected, setConnected] = useState(connection.getState() === ConnectionState.CONNECTED)
  const [messages, setMessages] = useState<ProgressMessage[]>([])

  useEffect(() => {
    // 连接到WebSocket
    connection.connect().catch(console.error)

    // 监听连接状态变化
    const removeConnectionHandler = connection.addConnectionHandler((state) => {
      setConnected(state === ConnectionState.CONNECTED)
    })

    // 监听消息
    const removeMessageHandler = connection.addMessageHandler((message) => {
      setMessages((prev: ProgressMessage[]) => {
        // 限制消息历史长度，避免内存泄漏
        const newMessages = [...prev, message]
        if (newMessages.length > 100) {
          return newMessages.slice(-100)
        }
        return newMessages
      })
    })

    return () => {
      removeConnectionHandler()
      removeMessageHandler()
    }
  }, [connection])

  const send = useCallback((message: string) => {
    return connection.send(message)
  }, [connection])

  const sendBatch = useCallback((messages: string[]) => {
    return connection.sendBatch(messages)
  }, [connection])

  return { connected, messages, send, sendBatch }
}
