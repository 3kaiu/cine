import { QueryClient } from '@tanstack/react-query'

/**
 * React Query 全局配置
 * 优化缓存策略和请求行为
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // 数据在5分钟内被认为是新鲜的
      staleTime: 5 * 60 * 1000, // 5分钟
      
      // 缓存时间10分钟
      gcTime: 10 * 60 * 1000, // 10分钟
      
      // 失败时重试3次
      retry: 3,
      
      // 重试延迟：指数退避
      retryDelay: (attemptIndex: number) => Math.min(1000 * 2 ** attemptIndex, 30000),
      
      // 窗口失去焦点时不重新获取
      refetchOnWindowFocus: false,
      
      // 网络重连时不重新获取
      refetchOnReconnect: false,
      
      // 挂载时不重新获取（如果数据已存在）
      refetchOnMount: false,
    },
    mutations: {
      // 失败时重试1次
      retry: 1,
      
      // 重试延迟
      retryDelay: 1000,
    },
  },
})

/**
 * 查询键工厂
 * 统一管理查询键，避免重复
 */
export const queryKeys = {
  files: (params?: any) => ['files', params],
  duplicates: () => ['duplicates'],
  trash: () => ['trash'],
  emptyDirs: () => ['empty-dirs'],
  largeFiles: (params?: any) => ['large-files', params],
} as const
