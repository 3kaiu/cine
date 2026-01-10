import { useState, useMemo, useEffect } from 'react'
import { Button, Chip, TextField, InputGroup, Surface, SearchField, Alert } from '@heroui/react'
import { Icon } from '@iconify/react'
import VirtualizedTable from '@/components/VirtualizedTable'
import { Play, ArrowRotateLeft, Check, CircleExclamation, Filmstrip, Tv } from '@gravity-ui/icons'
import { mediaApi, MediaFile } from '@/api/media'
import { useQuery, useMutation } from '@tanstack/react-query'
import { handleError } from '@/utils/errorHandler'
import { showSuccess } from '@/utils/toast'
import clsx from 'clsx'
import { useCallback } from 'react'
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
      
      // 检查是否有季数和集数信息
      if (metadata.season_number !== undefined || metadata.episode_number !== undefined) {
        return true
      }
      
      // 检查是否有剧集相关字段
      if (metadata.first_air_date || metadata.name || metadata.seasons) {
        return true
      }
      
      // 检查是否是电影（有release_date但没有season/episode）
      if (metadata.release_date && !metadata.season_number && !metadata.episode_number) {
        return false
      }
    }
    
    // 从文件名判断（包含 S01E01 格式）
    const tvPattern = /[Ss]\d+[Ee]\d+/i
    return tvPattern.test(file.name)
  } catch {
    // 解析失败时从文件名判断
    const tvPattern = /[Ss]\d+[Ee]\d+/i
    return tvPattern.test(file.name)
  }
}

export default function Renamer() {
  const [movieTemplate, setMovieTemplate] = useState('{title} ({year}) [{quality}].{ext}')
  const [tvTemplate, setTvTemplate] = useState('{title}.S{season:02d}E{episode:02d}.{ext}')
  const [selectedKeys, setSelectedKeys] = useState<any>(new Set([]))
  const [previewMap, setPreviewMap] = useState<Record<string, string>>({})
  const [lastExecuted, setLastExecuted] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')

  const { data: files, refetch: refetchFiles } = useQuery({
    queryKey: ['files', searchTerm],
    queryFn: () => mediaApi.getFiles({ file_type: 'video', page_size: 1000, name: searchTerm || undefined }),
  })

  const selectedIds = Array.from(selectedKeys) as string[]

  // 搜索防抖
  const debouncedSearch = useCallback(
    debounce((value: string) => {
      setSearchTerm(value)
    }, 500),
    []
  )

  const handleSearchChange = useCallback((value: string) => {
    debouncedSearch(value)
  }, [debouncedSearch])

  // 根据文件类型分类
  const { movies, tvShows } = useMemo(() => {
    const filesWithMetadata = files?.files?.filter(f => f.metadata) || []
    const movies: MediaFile[] = []
    const tvShows: MediaFile[] = []
    
    filesWithMetadata.forEach(file => {
      if (isTVShow(file)) {
        tvShows.push(file)
      } else {
        movies.push(file)
      }
    })
    
    return { movies, tvShows }
  }, [files])

  const stats = useMemo(() => {
    const filesWithMetadata = files?.files?.filter(f => f.metadata) || []
    return {
      total: filesWithMetadata.length,
      movies: movies.length,
      tvShows: tvShows.length,
      others: filesWithMetadata.length - movies.length - tvShows.length
    }
  }, [files, movies, tvShows])

  const renameMutation = useMutation({
    mutationFn: async (data: { file_ids: string[], isPreview: boolean }) => {
      // 为电影和电视剧分别调用API
      const movieFiles = data.file_ids.filter(id => {
        const file = [...movies, ...tvShows].find(f => f.id === id)
        return file && !isTVShow(file)
      })
      const tvFiles = data.file_ids.filter(id => {
        const file = [...movies, ...tvShows].find(f => f.id === id)
        return file && isTVShow(file)
      })
      
      const results: any[] = []
      
      if (movieFiles.length > 0) {
        const movieRes = await mediaApi.batchRename({
          file_ids: movieFiles,
          template: movieTemplate,
          preview: data.isPreview,
        })
        if (movieRes.preview) {
          results.push(...movieRes.preview)
        }
      }
      
      if (tvFiles.length > 0) {
        const tvRes = await mediaApi.batchRename({
          file_ids: tvFiles,
          template: tvTemplate,
          preview: data.isPreview,
        })
        if (tvRes.preview) {
          results.push(...tvRes.preview)
        }
      }
      
      return { data: { preview: results, message: 'Preview generated' } }
    },
    onSuccess: (res, variables) => {
      if (variables.isPreview) {
        const mapping: Record<string, string> = {}
        // @ts-ignore
        const previewData = res.data?.preview || res.preview || []
        previewData.forEach((p: any) => mapping[p.file_id] = p.new_name)
        setPreviewMap(mapping)
        showSuccess('预览生成成功')
      } else {
        setLastExecuted(true)
        setPreviewMap({})
        refetchFiles()
        setSelectedKeys(new Set([]))
        showSuccess(`成功重命名 ${selectedIds.length} 个文件`)
      }
    },
    onError: (error: any) => handleError(error, '重命名失败')
  })

  const handlePreview = () => {
    if (selectedIds.length === 0) return
    renameMutation.mutate({
      file_ids: selectedIds,
      isPreview: true,
    })
  }

  const handleRename = () => {
    if (selectedIds.length === 0) return
    renameMutation.mutate({
      file_ids: selectedIds,
      isPreview: false,
    })
  }

  // 过滤有元数据的文件
  const filesWithMetadata = [...movies, ...tvShows]

  // 全选/反选
  const handleSelectAll = () => {
    if (selectedIds.length === filesWithMetadata.length) {
      setSelectedKeys(new Set([]))
    } else {
      setSelectedKeys(new Set(filesWithMetadata.map(f => f.id)))
    }
  }

  // 快捷键支持
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd/Ctrl + A: 全选
      if ((e.metaKey || e.ctrlKey) && e.key === 'a') {
        e.preventDefault()
        handleSelectAll()
      }
      // Cmd/Ctrl + P: 生成预览
      else if ((e.metaKey || e.ctrlKey) && e.key === 'p' && selectedIds.length > 0) {
        e.preventDefault()
        handlePreview()
      }
      // Cmd/Ctrl + Enter: 执行重命名
      else if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && selectedIds.length > 0) {
        e.preventDefault()
        handleRename()
      }
      // Escape: 清除选择和预览
      else if (e.key === 'Escape') {
        setSelectedKeys(new Set([]))
        setPreviewMap({})
      }
      // Cmd/Ctrl + F: 聚焦搜索框
      else if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
        e.preventDefault()
        const searchInput = document.querySelector('input[placeholder*="搜索"]') as HTMLInputElement
        if (searchInput) {
          searchInput.focus()
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selectedIds, filesWithMetadata])

  // 预览统计
  const previewStats = useMemo(() => {
    const previewNames = Object.values(previewMap)
    const changedCount = previewNames.filter((newName, index) => {
      const fileId = Object.keys(previewMap)[index]
      const file = filesWithMetadata.find(f => f.id === fileId)
      return file && newName !== file.name
    }).length

    // 检测重名冲突
    const nameCounts = new Map<string, number>()
    previewNames.forEach(name => {
      nameCounts.set(name, (nameCounts.get(name) || 0) + 1)
    })
    const duplicateCount = Array.from(nameCounts.values()).filter(count => count > 1).length

    return {
      total: previewNames.length,
      changed: changedCount,
      unchanged: previewNames.length - changedCount,
      duplicates: duplicateCount,
    }
  }, [previewMap, filesWithMetadata])

  // 检测重名冲突的文件
  const duplicateNames = useMemo(() => {
    const nameToFiles = new Map<string, string[]>()
    Object.entries(previewMap).forEach(([fileId, newName]) => {
      if (!nameToFiles.has(newName)) {
        nameToFiles.set(newName, [])
      }
      nameToFiles.get(newName)!.push(fileId)
    })
    return Array.from(nameToFiles.entries())
      .filter(([_, fileIds]) => fileIds.length > 1)
      .map(([name, fileIds]) => ({ name, fileIds }))
  }, [previewMap])

  const columns = [
    {
      title: '原始文件名',
      dataIndex: 'name',
      key: 'name',
      width: 350,
      render: (text: string, record: MediaFile) => (
        <div className="flex items-center gap-2">
          <Chip 
            size="sm" 
            variant="soft" 
            color={isTVShow(record) ? 'accent' : 'warning'}
            className="shrink-0"
          >
            {isTVShow(record) ? '剧集' : '电影'}
          </Chip>
          <div className="flex flex-col gap-1 min-w-0">
            <span className="text-sm font-medium text-foreground truncate">{text}</span>
            <span className="text-xs text-default-400 truncate max-w-[300px]" title={record.path}>
              {record.path}
            </span>
          </div>
        </div>
      )
    },
    {
      title: '预览新名称',
      key: 'new_name',
      width: 400,
      render: (_: any, record: MediaFile) => {
        const newName = previewMap[record.id]
        if (!newName) {
          return <span className="text-xs text-default-400 italic">尚未生成预览</span>
        }
        const isChanged = newName !== record.name
        const isDuplicate = duplicateNames.some(d => d.fileIds.includes(record.id))
        
        return (
          <div className="flex items-center gap-2">
            <span className={clsx(
              "text-sm font-mono",
              isChanged ? "text-primary font-semibold" : "text-default-500",
              isDuplicate && "text-danger"
            )}>
              {newName}
            </span>
            {isChanged && !isDuplicate && (
              <Chip size="sm" color="accent" variant="soft">
                <Check className="w-3 h-3 mr-1" />
                已变更
              </Chip>
            )}
            {isDuplicate && (
              <Chip size="sm" color="danger" variant="soft">
                <CircleExclamation className="w-3 h-3 mr-1" />
                重名
              </Chip>
            )}
          </div>
        )
      },
    },
  ]

  const templateVariables = [
    { label: '{title}', desc: '影片标题' },
    { label: '{year}', desc: '年份' },
    { label: '{season:02d}', desc: '季号(补零)' },
    { label: '{episode:02d}', desc: '集号(补零)' },
    { label: '{quality}', desc: '质量标签(4K/DV/HDR等)' },
    { label: '{resolution}', desc: '分辨率(4K/1080p/720p)' },
    { label: '{hdr}', desc: 'HDR类型(DV/HDR10+/HDR)' },
    { label: '{source}', desc: '来源(BluRay/WEB-DL等)' },
    { label: '{ext}', desc: '扩展名' },
  ]

  return (
    <div className="flex flex-col gap-4 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <PageHeader
        title="批量重命名"
        description="支持电影和电视剧分别设置命名规则"
        actions={
          <>
            <Button
              variant="primary"
              onPress={handlePreview}
              isDisabled={selectedIds.length === 0}
              className="font-medium flex items-center gap-2"
            >
              <Play className="w-4 h-4" />
              生成预览
            </Button>
            <Button
              variant="primary"
              onPress={handleRename}
              isDisabled={selectedIds.length === 0 || Object.keys(previewMap).length === 0}
              className="font-medium flex items-center gap-2"
            >
              <ArrowRotateLeft className="w-4 h-4" />
              执行重命名
            </Button>
          </>
        }
      />

      {/* 统计卡片 */}
      {stats.total > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <StatCard
            label="总文件数"
            value={stats.total}
            icon={<Icon icon="mdi:file-document" className="w-6 h-6" />}
            color="primary"
            description="待重命名的文件总数"
          />
          <StatCard
            label="电影"
            value={stats.movies}
            icon={<Filmstrip className="w-6 h-6" />}
            color="warning"
            description="电影文件数量"
          />
          <StatCard
            label="剧集"
            value={stats.tvShows}
            icon={<Tv className="w-6 h-6" />}
            color="accent"
            description="电视剧集数量"
          />
          <StatCard
            label="其他"
            value={stats.others}
            icon={<Icon icon="mdi:file-question" className="w-6 h-6" />}
            color="success"
            description="其他类型文件"
          />
        </div>
      )}

      {/* 模板配置区域 */}
      <Surface variant="secondary" className="rounded-xl p-6 border border-divider">
        <div className="flex flex-col gap-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Icon icon="mdi:format-text" className="w-4 h-4 text-default-500" />
              <label className="text-sm font-semibold text-foreground">命名模板</label>
            </div>
            <div className="flex items-center gap-3">
              <Chip size="sm" variant="soft" color="warning">
                {movies.length} 电影
              </Chip>
              <Chip size="sm" variant="soft" color="accent">
                {tvShows.length} 剧集
              </Chip>
            </div>
          </div>

          <div className="flex flex-col gap-5">
            {/* 电影模板 */}
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <Icon icon="mdi:movie" className="w-4 h-4 text-warning" />
                <label className="text-sm font-medium text-foreground">电影模板</label>
              </div>
              <div className="w-full">
                <TextField
                  value={movieTemplate}
                  onChange={setMovieTemplate}
                  fullWidth
                  className="w-full"
                >
                  <InputGroup className="w-full">
                    <InputGroup.Prefix>
                      <Icon icon="mdi:code-tags" className="w-4 h-4 shrink-0" />
                    </InputGroup.Prefix>
                    <InputGroup.Input 
                      className="font-mono text-sm w-full" 
                    />
                  </InputGroup>
                </TextField>
              </div>
            </div>

            {/* 剧集模板 */}
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <Icon icon="mdi:television" className="w-4 h-4 text-accent" />
                <label className="text-sm font-medium text-foreground">剧集模板</label>
              </div>
              <div className="w-full">
                <TextField
                  value={tvTemplate}
                  onChange={setTvTemplate}
                  fullWidth
                  className="w-full"
                >
                  <InputGroup className="w-full">
                    <InputGroup.Prefix>
                      <Icon icon="mdi:code-tags" className="w-4 h-4 shrink-0" />
                    </InputGroup.Prefix>
                    <InputGroup.Input 
                      className="font-mono text-sm w-full" 
                    />
                  </InputGroup>
                </TextField>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <span className="text-xs font-medium text-default-600">模板变量：点击插入</span>
            <div className="flex flex-wrap gap-2.5">
              {templateVariables.map(({ label, desc }) => (
                <Button
                  key={label}
                  size="sm"
                  variant="ghost"
                  onPress={() => {
                    setMovieTemplate(t => t + label)
                    setTvTemplate(t => t + label)
                  }}
                  className="font-mono text-xs h-8 px-3 border border-divider hover:border-primary/30 hover:bg-primary/5"
                >
                  <span className="text-foreground">{label}</span>
                  <span className="ml-1.5 text-[10px] text-default-400 normal-case font-normal">({desc})</span>
                </Button>
              ))}
            </div>
          </div>

          {/* 预览统计 */}
          {previewStats.total > 0 && (
            <div className="flex flex-col gap-3 mt-4">
              <div className="flex items-center gap-4 flex-wrap">
                <div className="flex items-center gap-2">
                  <Icon icon="mdi:information-outline" className="w-4 h-4 text-default-500" />
                  <span className="text-xs text-default-600">预览统计：</span>
                </div>
                <Chip size="sm" variant="soft" color="accent">
                  总计 {previewStats.total}
                </Chip>
                <Chip size="sm" variant="soft" color="accent">
                  将变更 {previewStats.changed}
                </Chip>
                {previewStats.unchanged > 0 && (
                  <Chip size="sm" variant="soft" color="default">
                    不变 {previewStats.unchanged}
                  </Chip>
                )}
                {previewStats.duplicates > 0 && (
                  <Chip size="sm" variant="soft" color="danger">
                    重名冲突 {previewStats.duplicates}
                  </Chip>
                )}
              </div>
              {duplicateNames.length > 0 && (
                <Alert status="danger">
                  <Alert.Indicator />
                  <Alert.Content>
                    <Alert.Title>检测到重名冲突</Alert.Title>
                    <Alert.Description>
                      以下文件名会重复：{duplicateNames.slice(0, 3).map(d => d.name).join(', ')}{duplicateNames.length > 3 ? '...' : ''}
                    </Alert.Description>
                  </Alert.Content>
                </Alert>
              )}
            </div>
          )}

          <div className="flex items-center gap-3 flex-wrap mt-4">
            <Button
              variant="secondary"
              size="md"
              onPress={handlePreview}
              isDisabled={filesWithMetadata.length === 0 || selectedIds.length === 0}
              isPending={renameMutation.isPending && renameMutation.variables?.isPreview}
            >
              <Icon icon="mdi:eye-outline" className="w-4 h-4" />
              预览变更
            </Button>
            <Button
              variant="primary"
              size="md"
              onPress={handleRename}
              isPending={renameMutation.isPending && !renameMutation.variables?.isPreview}
              isDisabled={filesWithMetadata.length === 0 || selectedIds.length === 0 || Object.keys(previewMap).length === 0 || duplicateNames.length > 0}
            >
              <Play className="w-4 h-4" />
              提交重命名
            </Button>
            {lastExecuted && (
              <a
                href="/logs"
                className="ml-auto text-xs text-primary hover:underline"
              >
                <ArrowRotateLeft className="w-4 h-4 inline mr-1" />
                查看日志以撤销
              </a>
            )}
          </div>
        </div>
      </Surface>

      {/* 文件列表区域 */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="flex items-center gap-3 flex-wrap">
            <h2 className="text-lg font-semibold">待重命名文件</h2>
            <Chip color="accent" variant="soft" size="sm">
              {filesWithMetadata.length} 个文件
            </Chip>
            {movies.length > 0 && (
              <Chip color="warning" variant="soft" size="sm">
                {movies.length} 电影
              </Chip>
            )}
            {tvShows.length > 0 && (
              <Chip color="accent" variant="soft" size="sm">
                {tvShows.length} 剧集
              </Chip>
            )}
            {selectedIds.length > 0 && (
              <>
                <Chip color="accent" variant="soft" size="sm">
                  已选择 {selectedIds.length}
                </Chip>
                <Button
                  size="sm"
                  variant="ghost"
                  onPress={handleSelectAll}
                  className="text-xs"
                >
                  {selectedIds.length === filesWithMetadata.length ? '取消全选' : '全选'}
                </Button>
              </>
            )}
            {Object.keys(previewMap).length > 0 && (
              <Chip color="success" variant="soft" size="sm">
                已预览 {Object.keys(previewMap).length}
              </Chip>
            )}
          </div>
          <div className="flex gap-2 w-full sm:w-auto sm:min-w-[300px]">
            <SearchField
              fullWidth
              value={searchTerm}
              onChange={handleSearchChange}
            >
              <SearchField.Group>
                <SearchField.SearchIcon />
                <SearchField.Input placeholder="搜索文件名..." />
                <SearchField.ClearButton />
              </SearchField.Group>
            </SearchField>
          </div>
        </div>

        {filesWithMetadata.length === 0 ? (
          <Surface variant="secondary" className="rounded-xl p-12 text-center border border-divider">
            <div className="flex flex-col items-center gap-3">
              <div className="p-4 bg-default-100 rounded-full">
                <Icon icon="mdi:tag-edit-outline" className="w-8 h-8 text-default-400" />
              </div>
              <div className="flex flex-col gap-1">
                <p className="text-sm font-semibold text-foreground">暂无待重命名文件</p>
                <p className="text-xs text-default-400">请确保文件已获取元数据</p>
              </div>
            </div>
          </Surface>
        ) : (
          <Surface className="rounded-xl overflow-hidden border border-divider" variant="default">
            <VirtualizedTable<MediaFile>
              columns={columns}
              dataSource={filesWithMetadata}
              height={600}
              rowHeight={60}
              selectionMode="multiple"
              selectedKeys={selectedKeys}
              onSelectionChange={setSelectedKeys}
            />
          </Surface>
        )}
      </div>
    </div>
  )
}
