import { useEffect, useRef, useState } from 'react'

export interface ProgressMessage {
  task_id: string
  task_type: string
  progress: number
  current_file?: string
  message?: string
}

export function useWebSocket(url: string) {
  const [connected, setConnected] = useState(false)
  const [messages, setMessages] = useState<ProgressMessage[]>([])
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => {
    const connect = () => {
      try {
        const ws = new WebSocket(url)
        wsRef.current = ws

        ws.onopen = () => {
          console.log('WebSocket connected')
          setConnected(true)
        }

        ws.onmessage = (event) => {
          try {
            const message: ProgressMessage = JSON.parse(event.data)
            setMessages((prev) => [...prev, message])
          } catch (e) {
            console.error('Failed to parse WebSocket message:', e)
          }
        }

        ws.onerror = (error) => {
          console.error('WebSocket error:', error)
          setConnected(false)
        }

        ws.onclose = () => {
          console.log('WebSocket disconnected')
          setConnected(false)
          // 自动重连
          reconnectTimeoutRef.current = setTimeout(() => {
            connect()
          }, 3000)
        }
      } catch (error) {
        console.error('Failed to create WebSocket:', error)
        setConnected(false)
      }
    }

    connect()

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
      }
      if (wsRef.current) {
        wsRef.current.close()
      }
    }
  }, [url])

  const send = (message: string) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(message)
    }
  }

  return { connected, messages, send }
}
