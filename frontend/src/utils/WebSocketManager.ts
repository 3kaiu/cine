import { ProgressMessage } from '@/hooks/useWebSocket'

// WebSocket连接状态
export enum ConnectionState {
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  DISCONNECTING = 'disconnecting',
  DISCONNECTED = 'disconnected',
  RECONNECTING = 'reconnecting',
  FAILED = 'failed',
}

// 连接配置
interface ConnectionConfig {
  url: string
  maxReconnectAttempts: number
  reconnectInterval: number
  maxReconnectInterval: number
  heartbeatInterval: number
  messageQueueSize: number
  compressionEnabled: boolean
}

// 消息处理器类型
type MessageHandler = (message: ProgressMessage) => void
type ConnectionHandler = (state: ConnectionState, error?: Error) => void

// WebSocket连接管理器
class WebSocketConnection {
  private ws: WebSocket | null = null
  private config: ConnectionConfig
  private state: ConnectionState = ConnectionState.DISCONNECTED
  private reconnectAttempts = 0
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null
  private heartbeatTimeout: ReturnType<typeof setTimeout> | null = null
  private messageQueue: string[] = []
  private isProcessingQueue = false
  private messageHandlers = new Set<MessageHandler>()
  private connectionHandlers = new Set<ConnectionHandler>()

  constructor(config: ConnectionConfig) {
    this.config = config
  }

  // 连接到WebSocket服务器
  async connect(): Promise<void> {
    if (this.state === ConnectionState.CONNECTING || this.state === ConnectionState.CONNECTED) {
      return
    }

    this.setState(ConnectionState.CONNECTING)

    try {
      this.ws = new WebSocket(this.config.url)

      this.ws.onopen = () => {
        console.log('WebSocket connected to', this.config.url)
        this.setState(ConnectionState.CONNECTED)
        this.reconnectAttempts = 0
        this.startHeartbeat()
        this.processMessageQueue()
      }

      this.ws.onmessage = (event) => {
        this.handleMessage(event)
      }

      this.ws.onclose = (event) => {
        console.log('WebSocket closed:', event.code, event.reason)
        this.handleDisconnect()
      }

      this.ws.onerror = (error) => {
        console.error('WebSocket error:', error)
        this.setState(ConnectionState.FAILED, new Error('WebSocket connection failed'))
      }

    } catch (error) {
      console.error('Failed to create WebSocket connection:', error)
      this.setState(ConnectionState.FAILED, error as Error)
      this.scheduleReconnect()
    }
  }

  // 断开连接
  disconnect(): void {
    if (this.state === ConnectionState.DISCONNECTING || this.state === ConnectionState.DISCONNECTED) {
      return
    }

    this.setState(ConnectionState.DISCONNECTING)

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout)
      this.reconnectTimeout = null
    }

    if (this.heartbeatTimeout) {
      clearTimeout(this.heartbeatTimeout)
      this.heartbeatTimeout = null
    }

    if (this.ws) {
      this.ws.close(1000, 'Client disconnect')
      this.ws = null
    }

    this.setState(ConnectionState.DISCONNECTED)
  }

  // 发送消息
  send(message: string): boolean {
    if (this.state !== ConnectionState.CONNECTED || !this.ws) {
      // 连接未就绪，加入队列
      this.enqueueMessage(message)
      return false
    }

    try {
      this.ws.send(message)
      return true
    } catch (error) {
      console.error('Failed to send message:', error)
      this.enqueueMessage(message)
      return false
    }
  }

  // 批量发送消息
  sendBatch(messages: string[]): boolean {
    if (messages.length === 0) return true

    if (this.state !== ConnectionState.CONNECTED || !this.ws) {
      messages.forEach(msg => this.enqueueMessage(msg))
      return false
    }

    try {
      // 如果启用压缩，对批量消息进行压缩
      if (this.config.compressionEnabled && messages.length > 1) {
        const batchMessage = JSON.stringify({
          type: 'batch',
          messages,
          timestamp: Date.now(),
        })
        this.ws.send(batchMessage)
      } else {
        messages.forEach(msg => this.ws!.send(msg))
      }
      return true
    } catch (error) {
      console.error('Failed to send batch messages:', error)
      messages.forEach(msg => this.enqueueMessage(msg))
      return false
    }
  }

  // 添加消息处理器
  addMessageHandler(handler: MessageHandler): () => void {
    this.messageHandlers.add(handler)
    return () => this.messageHandlers.delete(handler)
  }

  // 添加连接状态处理器
  addConnectionHandler(handler: ConnectionHandler): () => void {
    this.connectionHandlers.add(handler)
    return () => this.connectionHandlers.delete(handler)
  }

  // 获取当前状态
  getState(): ConnectionState {
    return this.state
  }

  private setState(state: ConnectionState, error?: Error): void {
    this.state = state
    this.connectionHandlers.forEach(handler => handler(state, error))
  }

  private handleMessage(event: MessageEvent): void {
    try {
      const data = JSON.parse(event.data)

      // 处理批量消息
      if (data.type === 'batch' && Array.isArray(data.messages)) {
        data.messages.forEach((msg: any) => {
          const message: ProgressMessage = typeof msg === 'string' ? JSON.parse(msg) : msg
          this.messageHandlers.forEach(handler => handler(message))
        })
      } else {
        const message: ProgressMessage = data
        this.messageHandlers.forEach(handler => handler(message))
      }

      // 心跳确认收到（可用于未来实现心跳超时检测）
    } catch (error) {
      console.error('Failed to parse WebSocket message:', error)
    }
  }

  private handleDisconnect(): void {
    this.stopHeartbeat()
    this.setState(ConnectionState.DISCONNECTED)

    if (this.reconnectAttempts < this.config.maxReconnectAttempts) {
      this.scheduleReconnect()
    } else {
      this.setState(ConnectionState.FAILED, new Error('Max reconnection attempts reached'))
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimeout) return

    this.setState(ConnectionState.RECONNECTING)

    // 指数退避重连策略
    const delay = Math.min(
      this.config.reconnectInterval * Math.pow(2, this.reconnectAttempts),
      this.config.maxReconnectInterval
    )

    this.reconnectTimeout = setTimeout(() => {
      this.reconnectTimeout = null
      this.reconnectAttempts++
      console.log(`Reconnecting to WebSocket (attempt ${this.reconnectAttempts})...`)
      this.connect()
    }, delay)
  }

  private startHeartbeat(): void {
    if (this.heartbeatTimeout) return

    const sendHeartbeat = () => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'heartbeat', timestamp: Date.now() }))
      }
    }

    // 立即发送一次心跳
    sendHeartbeat()

    // 设置定期心跳
    this.heartbeatTimeout = setInterval(sendHeartbeat, this.config.heartbeatInterval)
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimeout) {
      clearInterval(this.heartbeatTimeout)
      this.heartbeatTimeout = null
    }
  }

  private enqueueMessage(message: string): void {
    if (this.messageQueue.length >= this.config.messageQueueSize) {
      // 队列满时，移除最旧的消息
      this.messageQueue.shift()
    }
    this.messageQueue.push(message)
  }

  private async processMessageQueue(): Promise<void> {
    if (this.isProcessingQueue || this.messageQueue.length === 0) return

    this.isProcessingQueue = true

    try {
      // 分批处理队列中的消息
      const batchSize = 10
      while (this.messageQueue.length > 0 && this.state === ConnectionState.CONNECTED) {
        const batch = this.messageQueue.splice(0, batchSize)
        this.sendBatch(batch)

        // 小延迟避免发送过快
        await new Promise(resolve => setTimeout(resolve, 10))
      }
    } finally {
      this.isProcessingQueue = false
    }
  }
}

// WebSocket连接池管理器
export class WebSocketManager {
  private static instance: WebSocketManager | null = null
  private connections = new Map<string, WebSocketConnection>()
  private defaultConfig: ConnectionConfig = {
    url: '',
    maxReconnectAttempts: 10,
    reconnectInterval: 1000,
    maxReconnectInterval: 30000,
    heartbeatInterval: 30000,
    messageQueueSize: 1000,
    compressionEnabled: true,
  }

  static getInstance(): WebSocketManager {
    if (!WebSocketManager.instance) {
      WebSocketManager.instance = new WebSocketManager()
    }
    return WebSocketManager.instance
  }

  // 获取或创建连接
  getConnection(url: string, config?: Partial<ConnectionConfig>): WebSocketConnection {
    if (!this.connections.has(url)) {
      const connectionConfig = { ...this.defaultConfig, url, ...config }
      const connection = new WebSocketConnection(connectionConfig)
      this.connections.set(url, connection)
    }

    return this.connections.get(url)!
  }

  // 关闭所有连接
  closeAll(): void {
    this.connections.forEach(connection => connection.disconnect())
    this.connections.clear()
  }

  // 获取连接状态统计
  getStats(): { [url: string]: ConnectionState } {
    const stats: { [url: string]: ConnectionState } = {}
    this.connections.forEach((connection, url) => {
      stats[url] = connection.getState()
    })
    return stats
  }
}

// 优化的React Hook
// WebSocketManager 是一个纯工具类，不包含React hooks
// React hooks代码已移动到 useWebSocket hook中