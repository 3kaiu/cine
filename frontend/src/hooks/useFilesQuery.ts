import { useQuery, type UseQueryOptions } from '@tanstack/react-query'
import { mediaApi } from '@/api/media'
import { queryKeys } from '@/config/queryConfig'

type FilesParams = {
  page?: number
  page_size?: number
  file_type?: string
  name?: string
  min_size?: number
  max_size?: number
}

type FilesResponse = Awaited<ReturnType<typeof mediaApi.getFiles>>

export function useFilesQuery(
  params?: FilesParams,
  options?: Omit<UseQueryOptions<FilesResponse>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: queryKeys.files(params as unknown as Record<string, unknown> | undefined),
    queryFn: () => mediaApi.getFiles(params),
    ...(options ?? {}),
  })
}

