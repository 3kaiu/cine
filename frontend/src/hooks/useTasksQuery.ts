import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { tasksApi } from '@/api/tasks'
import { queryKeys } from '@/config/queryConfig'
import { handleError } from '@/utils/errorHandler'
import { showSuccess } from '@/utils/toast'

/**
 * 任务列表查询 Hook
 * 统一封装 tasks API + React Query
 */
export function useTasksQuery(params?: { page?: number; page_size?: number }) {
  return useQuery({
    queryKey: queryKeys.tasks(params),
    queryFn: async () => {
      const res = await tasksApi.list(params)
      return res
    },
    refetchInterval: 2000,
  })
}

/**
 * 任务操作 Mutations
 */
export function useTaskMutations() {
  const queryClient = useQueryClient()

  const pauseMutation = useMutation({
    mutationFn: (id: string) => tasksApi.pause(id),
    onSuccess: () => {
      showSuccess('任务已暂停')
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
    },
    onError: (e: unknown) => handleError(e, '暂停失败'),
  })

  const resumeMutation = useMutation({
    mutationFn: (id: string) => tasksApi.resume(id),
    onSuccess: () => {
      showSuccess('任务已恢复')
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
    },
    onError: (e: unknown) => handleError(e, '恢复失败'),
  })

  const cancelMutation = useMutation({
    mutationFn: (id: string) => tasksApi.cancel(id),
    onSuccess: () => {
      showSuccess('任务已取消')
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
    },
    onError: (e: unknown) => handleError(e, '取消失败'),
  })

  const cleanupMutation = useMutation({
    mutationFn: () => tasksApi.cleanup(),
    onSuccess: () => {
      showSuccess('已清理完成的任务')
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
    },
    onError: (e: unknown) => handleError(e, '清理失败'),
  })

  const requeueMutation = useMutation({
    mutationFn: (id: string) => tasksApi.requeue(id),
    onSuccess: () => {
      showSuccess('任务已重新排队')
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
    },
    onError: (e: unknown) => handleError(e, '重新排队失败'),
  })

  const rerunMutation = useMutation({
    mutationFn: (id: string) => tasksApi.rerun(id),
    onSuccess: () => {
      showSuccess('任务已重新创建')
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
    },
    onError: (e: unknown) => handleError(e, '重新执行失败'),
  })

  return { pauseMutation, resumeMutation, cancelMutation, cleanupMutation, requeueMutation, rerunMutation }
}
