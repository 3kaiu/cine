import { useQuery, type UseQueryOptions } from '@tanstack/react-query'
import { mediaApi, type ScanHistory } from '@/api/media'
import { queryKeys } from '@/config/queryConfig'

export function useScanHistory(options?: Omit<UseQueryOptions<ScanHistory[]>, 'queryKey' | 'queryFn'>) {
  return useQuery({
    queryKey: queryKeys.scanHistory(),
    queryFn: () => mediaApi.listScanHistory(),
    ...(options ?? {}),
  })
}

