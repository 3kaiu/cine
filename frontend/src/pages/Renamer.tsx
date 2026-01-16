import { useState, useMemo, useCallback } from 'react'
import {
  Button,
  Chip,
  TextField,
  InputGroup,
  Surface,
  SearchField,
  Label
} from '@heroui/react'
import { Icon } from '@iconify/react'
import VirtualizedTable from '@/components/VirtualizedTable'
import { Play, Filmstrip, Tv, Check, CircleExclamation } from '@gravity-ui/icons'
import { mediaApi, MediaFile } from '@/api/media'
import { useQuery, useMutation } from '@tanstack/react-query'
import { handleError } from '@/utils/errorHandler'
import { showSuccess } from '@/utils/toast'
import { debounce } from 'lodash-es'
import PageHeader from '@/components/PageHeader'
import StatCard from '@/components/StatCard'

// 判断文件是电影还是电视剧
const isTVShow = (file: MediaFile): boolean => {
  try {
    if (file.metadata) {
      const metadata = typeof file.metadata === 'string'
        ? JSON.parse(file.metadata)
        : file.metadata

      if (metadata.season_number !== undefined || metadata.episode_number !== undefined) {
        return true
      }
      if (metadata.first_air_date || metadata.name || metadata.seasons) {
        return true
      }
      if (metadata.release_date && !metadata.season_number && !metadata.episode_number) {
        return false
      }
    }
  } catch (e) {
    // console.error(e)
  }
  const tvPattern = /[Ss]\d+[Ee]\d+/i
  return tvPattern.test(file.name)
}

export default function Renamer() {
  const [movieTemplate, setMovieTemplate] = useState('{title} ({year}) [{quality}].{ext}')
  const [tvTemplate, setTvTemplate] = useState('{title}.S{season:02d}E{episode:02d}.{ext}')
  const [selectedKeys, setSelectedKeys] = useState<any>(new Set([]))
  const [previewMap, setPreviewMap] = useState<Record<string, string>>({})
  const [lastExecuted, setLastExecuted] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')

  const { data: filesData, refetch: refetchFiles } = useQuery({
    queryKey: ['files', searchTerm],
    queryFn: () => mediaApi.getFiles({ file_type: 'video', page_size: 1000, name: searchTerm || undefined }),
  })

  // 搜索防抖
  const handleSearchChange = useCallback((value: string) => {
    const debouncedFn = debounce((val: string) => {
      setSearchTerm(val)
    }, 500)
    debouncedFn(value)
  }, [])

  // 根据文件类型分类
  const { movies, tvShows } = useMemo(() => {
    const files = filesData?.files?.filter(f => f.metadata) || []
    const movieItems: MediaFile[] = []
    const tvItems: MediaFile[] = []

    files.forEach(file => {
      if (isTVShow(file)) {
        tvItems.push(file)
      } else {
        movieItems.push(file)
      }
    })

    return { movies: movieItems, tvShows: tvItems }
  }, [filesData])

  const stats = useMemo(() => {
    const filesWithMetadata = filesData?.files?.filter(f => f.metadata) || []
    return {
      total: filesWithMetadata.length,
      movies: movies.length,
      tvShows: tvShows.length,
      others: (filesData?.files?.length || 0) - filesWithMetadata.length
    }
  }, [filesData, movies, tvShows])

  const filesWithMetadata = useMemo(() => [...movies, ...tvShows], [movies, tvShows])

  const selectedIds = useMemo(() => {
    if (selectedKeys === 'all') return filesWithMetadata.map(f => f.id)
    return Array.from(selectedKeys as Set<string>)
  }, [selectedKeys, filesWithMetadata])

  const handleSelectAll = () => {
    if (selectedIds.length === filesWithMetadata.length) {
      setSelectedKeys(new Set([]))
    } else {
      setSelectedKeys(new Set(filesWithMetadata.map(f => f.id)))
    }
  }

  const previewMutation = useMutation({
    mutationFn: async () => {
      const results: Record<string, string> = {}
      for (const id of selectedIds) {
        const file = filesWithMetadata.find(f => f.id === id)
        if (!file) continue
        const template = isTVShow(file) ? tvTemplate : movieTemplate
        const res = await mediaApi.batchRename({
          file_ids: [id],
          template,
          preview: true
        })
        if (res.preview && res.preview[0]?.new_name) {
          results[id] = res.preview[0].new_name
        }
      }
      return results
    },
    onSuccess: (data) => {
      setPreviewMap(data)
      showSuccess(`已生成 ${Object.keys(data).length} 个文件的预览`)
    },
    onError: handleError
  })

  const renameMutation = useMutation({
    mutationFn: async () => {
      const selectedMovies = movies.filter(m => selectedIds.includes(m.id))
      const selectedTvShows = tvShows.filter(t => selectedIds.includes(t.id))

      if (selectedMovies.length > 0) {
        await mediaApi.batchRename({
          file_ids: selectedMovies.map(m => m.id),
          template: movieTemplate,
          preview: false
        })
      }
      if (selectedTvShows.length > 0) {
        await mediaApi.batchRename({
          file_ids: selectedTvShows.map(t => t.id),
          template: tvTemplate,
          preview: false
        })
      }
    },
    onSuccess: () => {
      showSuccess('重命名任务已启动')
      setLastExecuted(true)
      setSelectedKeys(new Set([]))
      setPreviewMap({})
      refetchFiles()
    },
    onError: handleError
  })

  return (
    <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-3 duration-500">
      <PageHeader
        title="批量重命名"
        description="基于元数据模板自动优化媒体库文件名"
        actions={
          <div className="flex items-center gap-2 p-1 bg-default-100/50 rounded-xl border border-divider/10 shadow-sm">
            <Button
              variant="secondary"
              onPress={() => previewMutation.mutate(undefined)}
              isDisabled={selectedIds.length === 0 || previewMutation.isPending}
              isPending={previewMutation.isPending}
              className="font-bold h-9 px-4 border border-divider/10 shadow-sm"
            >
              <Icon icon="mdi:eye-outline" className="w-4 h-4 mr-2" />
              预览更改
            </Button>
            <Button
              variant="primary"
              onPress={() => renameMutation.mutate(undefined)}
              isDisabled={selectedIds.length === 0 || renameMutation.isPending}
              isPending={renameMutation.isPending}
              className="font-bold h-9 px-6 shadow-none"
            >
              <Play className="w-4 h-4 mr-2" />
              开始重命名
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard
          icon={<Filmstrip className="w-5 h-5" />}
          label="电影总数"
          value={stats.movies}
          color="accent"
        />
        <StatCard
          icon={<Tv className="w-5 h-5" />}
          label="剧集总数"
          value={stats.tvShows}
          color="success"
        />
        <StatCard
          icon={<CircleExclamation className="w-5 h-5" />}
          label="未匹配"
          value={stats.others}
          color="warning"
        />
        <StatCard
          icon={<Check className="w-5 h-5" />}
          label="总记录数"
          value={stats.total}
          color="default"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <div className="lg:col-span-2 flex flex-col gap-4">
          <Surface variant="default" className="p-6 rounded-2xl border border-divider/50 bg-background/50 shadow-sm h-full">
            <div className="flex flex-col gap-6">
              <div className="flex flex-col gap-1">
                <h3 className="text-sm font-black uppercase tracking-widest text-foreground/70">命名规则配置</h3>
                <p className="text-[11px] text-default-400 font-medium tracking-tight">自定义电影与剧集的重命名模版</p>
              </div>

              <div className="space-y-6">
                <TextField
                  value={movieTemplate}
                  onChange={setMovieTemplate}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-accent" />
                      <Label className="text-[10px] font-black uppercase tracking-widest text-default-500">电影命名模板</Label>
                    </div>
                  </div>
                  <InputGroup className="bg-default-100/50 border border-divider/20 focus-within:border-accent/50 transition-colors">
                    <InputGroup.Input placeholder="{title} ({year})" className="text-sm font-medium" />
                  </InputGroup>
                </TextField>

                <TextField
                  value={tvTemplate}
                  onChange={setTvTemplate}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-success" />
                      <Label className="text-[10px] font-black uppercase tracking-widest text-default-500">剧集命名模板</Label>
                    </div>
                  </div>
                  <InputGroup className="bg-default-100/50 border border-divider/20 focus-within:border-accent/50 transition-colors">
                    <InputGroup.Input placeholder="{title}.S{season:02d}E{episode:02d}" className="text-sm font-medium" />
                  </InputGroup>
                </TextField>
              </div>

              <div className="mt-4 p-4 rounded-xl bg-default-100/30 border border-divider/10 space-y-3">
                <h4 className="text-[10px] font-black uppercase tracking-widest text-default-500">可用变量说明</h4>
                <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                  <div className="flex items-center justify-between">
                    <code className="text-[11px] text-accent font-bold">{"{title}"}</code>
                    <span className="text-[10px] text-default-400">标题</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <code className="text-[11px] text-accent font-bold">{"{year}"}</code>
                    <span className="text-[10px] text-default-400">年份</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <code className="text-[11px] text-success font-bold">{"{season}"}</code>
                    <span className="text-[10px] text-default-400">季号</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <code className="text-[11px] text-success font-bold">{"{episode}"}</code>
                    <span className="text-[10px] text-default-400">集号</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <code className="text-[11px] text-default-400 font-bold">{"{quality}"}</code>
                    <span className="text-[10px] text-default-400">分辨率</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <code className="text-[11px] text-default-400 font-bold">{"{ext}"}</code>
                    <span className="text-[10px] text-default-400">扩展名</span>
                  </div>
                </div>
              </div>

              {lastExecuted && (
                <Surface variant="default" className="p-4 rounded-xl border border-success/20 bg-success/5">
                  <div className="flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full bg-success" />
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[12px] font-bold text-success">执行成功</span>
                      <span className="text-[10px] text-success/70 font-medium">重命名任务已提交到后台处理，您可以在任务列表中查看进度。</span>
                    </div>
                  </div>
                </Surface>
              )}
            </div>
          </Surface>
        </div>

        <div className="lg:col-span-3 flex flex-col gap-4">
          <Surface variant="default" className="rounded-2xl border border-divider/50 bg-background/50 shadow-sm overflow-hidden flex flex-col h-[600px]">
            <div className="p-4 border-b border-divider/10 bg-default-100/20 flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-black uppercase tracking-widest text-foreground/70">待处理文件</h3>
                  <Chip color="accent" variant="soft" className="h-5 text-[10px] font-bold px-2 uppercase tracking-tight">
                    {selectedIds.length} / {filesWithMetadata.length} 已选
                  </Chip>
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  onPress={handleSelectAll}
                  className="h-7 text-[10px] font-bold px-3 border border-divider/10 bg-background shadow-sm transition-all"
                >
                  <Icon icon="mdi:checkbox-multiple-marked-outline" className="w-3.5 h-3.5 mr-1.5" />
                  {selectedIds.length === filesWithMetadata.length ? '取消全选' : '全选'}
                </Button>
              </div>

              <div className="flex items-center gap-3">
                <SearchField
                  value={searchTerm}
                  onChange={handleSearchChange}
                  className="flex-1"
                >
                  <SearchField.Group className="bg-background border border-divider/20 focus-within:border-accent/40 transition-colors h-9">
                    <SearchField.Input placeholder="搜索待重命名文件..." className="text-xs" />
                    <SearchField.ClearButton />
                  </SearchField.Group>
                </SearchField>
              </div>
            </div>

            <div className="flex-1 min-h-0">
              <VirtualizedTable
                dataSource={filesWithMetadata}
                rowHeight={72}
                onSelectionChange={setSelectedKeys}
                selectionMode="multiple"
                selectedKeys={selectedKeys}
                columns={[
                  {
                    title: '文件信息',
                    dataIndex: 'name',
                    width: 400,
                    render: (_: any, file: MediaFile) => (
                      <div className="flex flex-col gap-1 py-1">
                        <div className="flex items-center gap-2">
                          {isTVShow(file) ? (
                            <Tv className="w-3.5 h-3.5 text-success/70" />
                          ) : (
                            <Filmstrip className="w-3.5 h-3.5 text-accent/70" />
                          )}
                          <span className="text-[13px] font-bold truncate text-foreground/90">{file.name}</span>
                        </div>
                        <span className="text-[10px] text-default-400 truncate font-medium">{file.path}</span>
                      </div>
                    )
                  },
                  {
                    title: '预览结果',
                    dataIndex: 'id',
                    width: 280,
                    render: (_: any, file: MediaFile) => {
                      const previewName = previewMap[file.id]
                      return (
                        <div className="flex flex-col gap-1">
                          {previewName ? (
                            <>
                              <div className="flex items-center gap-1.5">
                                <Icon icon="mdi:arrow-right" className="w-3 h-3 text-success" />
                                <span className="text-[12px] font-bold text-success truncate">{previewName}</span>
                              </div>
                              <span className="text-[10px] text-success/50 font-medium">预览就绪</span>
                            </>
                          ) : (
                            <span className="text-[11px] text-default-300 font-medium italic">等待预览...</span>
                          )}
                        </div>
                      )
                    }
                  }
                ]}
              />
            </div>
          </Surface>
        </div>
      </div>
    </div>
  )
}
