import { useQuery, type UseQueryOptions } from '@tanstack/react-query'
import { mediaApi, type GetFilesParams } from '@/api/media'
import { queryKeys } from '@/config/queryConfig'

type FilesResponse = Awaited<ReturnType<typeof mediaApi.getFiles>>

export function useFilesQuery(
  params?: GetFilesParams,
  options?: Omit<UseQueryOptions<FilesResponse>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: queryKeys.files(params as unknown as Record<string, unknown> | undefined),
    queryFn: () => mediaApi.getFiles(params),
    ...(options ?? {}),
  })
}
