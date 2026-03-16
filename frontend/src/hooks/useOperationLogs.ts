import { useQuery, type UseQueryOptions } from '@tanstack/react-query'
import { mediaApi, type OperationLog } from '@/api/media'
import { queryKeys } from '@/config/queryConfig'

export function useOperationLogs(options?: Omit<UseQueryOptions<OperationLog[]>, 'queryKey' | 'queryFn'>) {
  return useQuery({
    queryKey: queryKeys.logs(),
    queryFn: () => mediaApi.listOperationLogs(),
    ...(options ?? {}),
  })
}

