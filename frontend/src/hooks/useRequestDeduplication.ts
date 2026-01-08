import { useCallback, useRef } from 'react'

/**
 * 请求去重 Hook
 * 防止相同请求的重复发送
 */
const requestCache = new Map<string, Promise<any>>()

export function useRequestDeduplication() {
  const cacheRef = useRef(requestCache)

  return useCallback((key: string, fn: () => Promise<any>) => {
    const cache = cacheRef.current
    
    // 如果已有相同请求在进行，返回该请求
    if (cache.has(key)) {
      return cache.get(key)!
    }

    // 创建新请求
    const promise = fn()
      .finally(() => {
        // 请求完成后清除缓存
        cache.delete(key)
      })
    
    cache.set(key, promise)
    return promise
  }, [])
}
