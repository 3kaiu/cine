import { useQuery, type UseQueryOptions } from '@tanstack/react-query'
import { mediaApi, type MediaFile } from '@/api/media'
import { queryKeys } from '@/config/queryConfig'

export type DedupeMode = 'hash' | 'fuzzy'

export interface DedupeGroup {
  id: string
  title: string
  files: MediaFile[]
  similarity?: number
}

export function useDuplicates(
  params: { mode: DedupeMode; similarityThreshold?: number; enabled?: boolean },
  options?: Omit<UseQueryOptions<DedupeGroup[]>, 'queryKey' | 'queryFn' | 'enabled'>
) {
  const threshold = params.similarityThreshold ?? 0.8

  return useQuery({
    queryKey: queryKeys.duplicates({ mode: params.mode, threshold }),
    enabled: params.enabled ?? true,
    queryFn: async () => {
      if (params.mode === 'hash') {
        const res = await mediaApi.findDuplicateMovies()
        return res.map((g) => ({
          id: String(g.tmdb_id),
          title: g.title,
          files: g.files,
        })) as DedupeGroup[]
      }

      const res = await mediaApi.findSimilarFiles({ threshold })
      return res.groups.map((g, idx) => ({
        id: `fuzzy-${idx}`,
        title: g.representative_name,
        files: g.files,
        similarity: g.similarity,
      })) as DedupeGroup[]
    },
    ...(options ?? {}),
  })
}

