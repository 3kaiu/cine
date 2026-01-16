import { useState, useMemo, useEffect, useRef } from 'react'
import { Button, Chip, Surface, SearchField, Select, Popover, ListBox, Tabs } from "@heroui/react";
import { useVirtualizer } from '@tanstack/react-virtual';
import { Icon } from '@iconify/react'
import {
  CircleExclamation,
  Filmstrip,
  TrashBin,
  ArrowRotateLeft,
  Check,
} from '@gravity-ui/icons'
import { mediaApi, MediaFile } from '@/api/media'
import { useQuery, useMutation } from '@tanstack/react-query'
import { handleError } from '@/utils/errorHandler'
import { showSuccess } from '@/utils/toast'
import clsx from 'clsx'
import PageHeader from '@/components/PageHeader'
import StatCard from '@/components/StatCard'

interface DedupeGroup {
  id: string
  title: string
  files: MediaFile[]
  similarity?: number
}

type FlatItem =
  | { type: 'header'; group: DedupeGroup; isExpanded: boolean; isSelected: boolean }
  | { type: 'best'; file: MediaFile }
  | { type: 'redundant'; file: MediaFile; bestFile: MediaFile };


type ViewMode = 'list' | 'grid' | 'compact'
type DedupeMode = 'hash' | 'fuzzy'
type SortBy = 'space' | 'count' | 'quality'
type SortOrder = 'asc' | 'desc'

interface FilterOptions {
  resolution: string[]
  hdrType: string[]
  hasChineseSubtitle: boolean | null
}

export default function Dedupe() {
  const [dedupeMode, setDedupeMode] = useState<DedupeMode>('hash')
  const [similarityThreshold, setSimilarityThreshold] = useState(0.8)
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set())
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedGroups, setSelectedGroups] = useState<Set<string>>(new Set())
  const [viewMode, setViewMode] = useState<ViewMode>('list')
  const [sortBy, setSortBy] = useState<SortBy>('space')
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc')
  const [filterOptions, setFilterOptions] = useState<FilterOptions>({
    resolution: [],
    hdrType: [],
    hasChineseSubtitle: null
  })
  const [showFilterPopover, setShowFilterPopover] = useState(false)

  const { data, refetch, isPending } = useQuery({
    queryKey: ['duplicates', dedupeMode, similarityThreshold],
    queryFn: async () => {
      if (dedupeMode === 'hash') {
        const res = await mediaApi.findDuplicateMovies()
        return res.map(g => ({
          id: String(g.tmdb_id),
          title: g.title,
          files: g.files
        })) as DedupeGroup[]
      } else {
        const res = await mediaApi.findSimilarFiles({ threshold: similarityThreshold })
        return res.groups.map((g, idx) => ({
          id: `fuzzy-${idx}`,
          title: g.representative_name,
          files: g.files,
          similarity: g.similarity
        })) as DedupeGroup[]
      }
    },
    enabled: false,
  })

  const trashMutation = useMutation({
    mutationFn: (id: string) => mediaApi.moveToTrash(id),
    onSuccess: () => {
      refetch()
      showSuccess('文件已移入回收站')
    },
    onError: (error: any) => {
      handleError(error, '移动失败')
    },
  })

  const batchTrashMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const results = await Promise.allSettled(
        ids.map(id => mediaApi.moveToTrash(id))
      )
      const failed = results.filter(r => r.status === 'rejected').length
      if (failed > 0) {
        throw new Error(`${failed} 个文件移动失败`)
      }
      return ids.length
    },
    onSuccess: (count: number) => {
      refetch()
      setSelectedGroups(new Set())
      showSuccess(`成功移入 ${count} 个文件到回收站`)
    },
    onError: (error: any) => {
      handleError(error, '批量移动失败')
    },
  })

  // 过滤和搜索
  const filteredData = useMemo(() => {
    if (!data) return []

    let result = [...data]

    // 搜索过滤
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase()
      result = result.filter((group: DedupeGroup) =>
        group.title.toLowerCase().includes(term) ||
        group.files.some(f => f.name.toLowerCase().includes(term))
      )
    }

    // 分辨率过滤
    if (filterOptions.resolution.length > 0) {
      result = result.filter((group: DedupeGroup) => {
        return group.files.some(file => {
          const vInfo = file.video_info
          if (!vInfo?.width || !vInfo?.height) return false
          const width = vInfo.width
          const height = vInfo.height
          return filterOptions.resolution.some(res => {
            if (res === '4K') return width >= 3840 || height >= 2160
            if (res === '1080p') return width >= 1920 || height >= 1080
            if (res === '720p') return width >= 1280 || height >= 720
            return false
          })
        })
      })
    }

    // HDR类型过滤
    if (filterOptions.hdrType.length > 0) {
      result = result.filter((group: DedupeGroup) => {
        return group.files.some(file => {
          const vInfo = file.video_info
          if (!vInfo) return false
          return filterOptions.hdrType.some(hdr => {
            if (hdr === 'DV') return vInfo.is_dolby_vision
            if (hdr === 'HDR10+') return vInfo.is_hdr10_plus
            if (hdr === 'HDR') return vInfo.is_hdr
            return false
          })
        })
      })
    }

    // 中文字幕过滤
    if (filterOptions.hasChineseSubtitle !== null) {
      result = result.filter((group: DedupeGroup) => {
        return group.files.some(file =>
          file.video_info?.has_chinese_subtitle === filterOptions.hasChineseSubtitle
        )
      })
    }

    return result
  }, [data, searchTerm, filterOptions])

  // 排序
  const sortedData = useMemo(() => {
    const result = [...filteredData]
    result.sort((a: DedupeGroup, b: DedupeGroup) => {
      let aValue = 0
      let bValue = 0

      if (sortBy === 'space') {
        const aSorted = [...a.files].sort((x, y) => (y.quality_score || 0) - (x.quality_score || 0))
        const bSorted = [...b.files].sort((x, y) => (y.quality_score || 0) - (x.quality_score || 0))
        aValue = aSorted.slice(1).reduce((sum, f) => sum + f.size, 0)
        bValue = bSorted.slice(1).reduce((sum, f) => sum + f.size, 0)
      } else if (sortBy === 'count') {
        aValue = a.files.length
        bValue = b.files.length
      } else if (sortBy === 'quality') {
        aValue = Math.max(...a.files.map(f => f.quality_score || 0))
        bValue = Math.max(...b.files.map(f => f.quality_score || 0))
      }

      return sortOrder === 'asc' ? aValue - bValue : bValue - aValue
    })
    return result
  }, [filteredData, sortBy, sortOrder])

  // 计算统计信息
  const stats = useMemo(() => {
    if (!sortedData || sortedData.length === 0) return null

    const groups = sortedData.length
    const totalDuplicates = sortedData.reduce((acc: number, group: DedupeGroup) =>
      acc + Math.max(0, group.files.length - 1), 0
    )
    const totalWastedSpace = sortedData.reduce((acc: number, group: DedupeGroup) => {
      if (group.files.length <= 1) return acc
      const sorted = [...group.files].sort((a, b) =>
        (b.quality_score || 0) - (a.quality_score || 0)
      )
      const wasted = sorted.slice(1).reduce((sum, f) => sum + f.size, 0)
      return acc + wasted
    }, 0)

    return { groups, totalDuplicates, totalWastedSpace }
  }, [sortedData])

  // 获取选中组的所有冗余文件
  const getSelectedRedundantFiles = () => {
    const files: string[] = []
    sortedData?.forEach((group: DedupeGroup) => {
      if (selectedGroups.has(group.id)) {
        const sorted = [...group.files].sort((a, b) =>
          (b.quality_score || 0) - (a.quality_score || 0)
        )
        files.push(...sorted.slice(1).map(f => f.id))
      }
    })
    return files
  }

  const handleScan = () => {
    refetch()
  }

  const handleBatchDelete = () => {
    const files = getSelectedRedundantFiles()
    if (files.length === 0) return
    batchTrashMutation.mutate(files)
  }

  const handleSelectAll = () => {
    if (selectedGroups.size === sortedData?.length) {
      setSelectedGroups(new Set())
    } else {
      setSelectedGroups(new Set(sortedData?.map((g: DedupeGroup) => g.id) || []))
    }
  }

  const handleExpandAll = () => {
    if (expandedKeys.size === sortedData?.length) {
      setExpandedKeys(new Set())
    } else {
      setExpandedKeys(new Set(sortedData?.map((g: DedupeGroup) => g.id) || []))
    }
  }

  const handleSmartSelect = () => {
    setSelectedGroups(new Set(sortedData?.map((g: DedupeGroup) => g.id) || []))
  }

  // 快捷键支持
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'a') {
        e.preventDefault()
        handleSelectAll()
      } else if (e.key === 'Escape') {
        setSelectedGroups(new Set())
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selectedGroups, sortedData])

  const handleToggleFilter = (type: 'resolution' | 'hdrType', value: string) => {
    const current = filterOptions[type]
    const updated = current.includes(value)
      ? current.filter(v => v !== value)
      : [...current, value]
    setFilterOptions(prev => ({ ...prev, [type]: updated }))
  }

  const handleToggleSubtitle = () => {
    setFilterOptions(prev => ({
      ...prev,
      hasChineseSubtitle: prev.hasChineseSubtitle === null ? true :
        prev.hasChineseSubtitle === true ? false : null
    }))
  }

  const clearFilters = () => {
    setFilterOptions({
      resolution: [],
      hdrType: [],
      hasChineseSubtitle: null
    })
  }

  const hasActiveFilters = filterOptions.resolution.length > 0 ||
    filterOptions.hdrType.length > 0 ||
    filterOptions.hasChineseSubtitle !== null


  /* ------------------ Virtualization Logic ------------------ */

  const parentRef = useRef<HTMLDivElement>(null);

  const flatData = useMemo<FlatItem[]>(() => {
    if (!sortedData) return [];

    const items: FlatItem[] = [];

    sortedData.forEach((group: DedupeGroup) => {
      const groupKey = group.id;
      const isExpanded = expandedKeys.has(groupKey);
      const isSelected = selectedGroups.has(group.id);

      items.push({
        type: 'header',
        group,
        isExpanded,
        isSelected
      });

      if (isExpanded) {
        // Sort files by quality score
        const sortedFiles = [...group.files].sort((a, b) =>
          (b.quality_score || 0) - (a.quality_score || 0)
        );
        const bestFile = sortedFiles[0];
        const redundantFiles = sortedFiles.slice(1);

        // Add best file
        items.push({ type: 'best', file: bestFile });

        // Add redundant files
        redundantFiles.forEach(f => {
          items.push({ type: 'redundant', file: f, bestFile });
        });
      }
    });

    return items;
  }, [sortedData, expandedKeys, selectedGroups]);

  const rowVirtualizer = useVirtualizer({
    count: flatData.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (index) => {
      const item = flatData[index];
      if (item.type === 'header') return 64;
      if (item.type === 'best') return 140;
      if (item.type === 'redundant') return 160;
      return 60;
    },
    overscan: 10,
  });

  return (
    <div className="flex flex-col gap-4 h-full animate-in fade-in slide-in-from-bottom-4 duration-700">
      <PageHeader
        title="去重管理"
        description="智能分析并清理影片的冗余副本"
        actions={
          <>
            <Button
              variant="primary"
              onPress={handleScan}
              isPending={isPending}
              className="font-medium flex items-center gap-2"
            >
              <ArrowRotateLeft className="w-4 h-4" />
              扫描重复文件
            </Button>
            <div className="flex items-center gap-1 bg-default-100 rounded-lg p-1">
              <Button
                isIconOnly
                size="sm"
                variant={viewMode === 'list' ? 'primary' : 'ghost'}
                onPress={() => setViewMode('list')}
              >
                <Icon icon="mdi:view-list" className="w-4 h-4" />
              </Button>
              <Button
                isIconOnly
                size="sm"
                variant={viewMode === 'grid' ? 'primary' : 'ghost'}
                onPress={() => setViewMode('grid')}
              >
                <Icon icon="mdi:view-grid" className="w-4 h-4" />
              </Button>
              <Button
                isIconOnly
                size="sm"
                variant={viewMode === 'compact' ? 'primary' : 'ghost'}
                onPress={() => setViewMode('compact')}
              >
                <Icon icon="mdi:view-compact" className="w-4 h-4" />
              </Button>
            </div>
          </>
        }
      />

      <div className="flex items-center justify-between gap-4">
        <Tabs
          aria-label="去重模式"
          selectedKey={dedupeMode}
          onSelectionChange={(key) => setDedupeMode(key as DedupeMode)}
          className="w-full sm:w-auto"
        >
          <Tabs.ListContainer>
            <Tabs.List>
              <Tabs.Tab id="hash">
                <Tabs.Indicator />
                <div className="flex items-center gap-2">
                  <Icon icon="mdi:file-certificate" className="w-4 h-4" />
                  <span>精确匹配 (Hash/TMDB)</span>
                </div>
              </Tabs.Tab>
              <Tabs.Tab id="fuzzy">
                <Tabs.Indicator />
                <div className="flex items-center gap-2">
                  <Icon icon="mdi:text-search" className="w-4 h-4" />
                  <span>模糊匹配 (文件名)</span>
                </div>
              </Tabs.Tab>
            </Tabs.List>
          </Tabs.ListContainer>
        </Tabs>

        {dedupeMode === 'fuzzy' && (
          <div className="flex items-center gap-2 bg-surface p-1 px-3 rounded-lg border border-divider/50">
            <span className="text-xs font-medium text-default-500">相似度阈值</span>
            <Select
              selectedKey={String(similarityThreshold)}
              onSelectionChange={(keys) => {
                if (!keys) return
                const selected = Array.from(keys as any)[0] as string
                setSimilarityThreshold(parseFloat(selected))
              }}
              className="w-[100px]"
            >
              <Select.Trigger className="h-7 min-h-0 py-0">
                <Select.Value />
                <Select.Indicator />
              </Select.Trigger>
              <Select.Popover>
                <ListBox>
                  <ListBox.Item key="0.95">0.95 (极高)</ListBox.Item>
                  <ListBox.Item key="0.9">0.90 (高)</ListBox.Item>
                  <ListBox.Item key="0.8">0.80 (标准)</ListBox.Item>
                  <ListBox.Item key="0.7">0.70 (宽松)</ListBox.Item>
                  <ListBox.Item key="0.6">0.60 (非常宽松)</ListBox.Item>
                </ListBox>
              </Select.Popover>
            </Select>
          </div>
        )}
      </div>

      {/* 统计卡片 */}
      {stats && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <StatCard
            label="重复组数"
            value={stats.groups}
            icon={<Icon icon="mdi:file-multiple" className="w-6 h-6" />}
            color="warning"
            description="检测到的重复影片组"
          />
          <StatCard
            label="冗余文件"
            value={stats.totalDuplicates}
            icon={<Icon icon="mdi:file-alert" className="w-6 h-6" />}
            color="danger"
            description="可删除的重复文件"
          />
          <StatCard
            label="可释放空间"
            value={formatSize(stats.totalWastedSpace)}
            icon={<Icon icon="mdi:harddisk" className="w-6 h-6" />}
            color="success"
            description="清理后可释放的存储"
          />
        </div>
      )}

      {/* 搜索和筛选栏 */}
      {sortedData && sortedData.length > 0 && (
        <div className="mt-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <SearchField
                className="w-full sm:w-[300px]"
                value={searchTerm}
                onChange={setSearchTerm}
              >
                <SearchField.Group>
                  <SearchField.SearchIcon />
                  <SearchField.Input placeholder="搜索影片名称..." />
                  <SearchField.ClearButton />
                </SearchField.Group>
              </SearchField>
            </div>

            <div className="flex items-center gap-2">
              {/* 排序 */}
              <Select
                selectedKey={sortBy}
                onSelectionChange={(keys) => {
                  if (!keys) return
                  const selected = Array.isArray(Array.from(keys as any))
                    ? Array.from(keys as any)[0] as SortBy
                    : keys as SortBy
                  if (selected) {
                    setSortBy(selected)
                  }
                }}
                className="w-[120px]"
                placeholder="排序"
              >
                <Select.Trigger>
                  <Select.Value />
                  <Select.Indicator />
                </Select.Trigger>
                <Select.Popover>
                  <ListBox>
                    <ListBox.Item key="space">可释放空间</ListBox.Item>
                    <ListBox.Item key="count">冗余数量</ListBox.Item>
                    <ListBox.Item key="quality">质量分数</ListBox.Item>
                  </ListBox>
                </Select.Popover>
              </Select>

              <Button
                isIconOnly
                size="sm"
                variant="ghost"
                onPress={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
              >
                <Icon
                  icon={sortOrder === 'asc' ? 'mdi:sort-ascending' : 'mdi:sort-descending'}
                  className="w-4 h-4"
                />
              </Button>

              {/* 筛选按钮 */}
              <Popover
                isOpen={showFilterPopover}
                onOpenChange={setShowFilterPopover}
              >
                <Popover.Trigger>
                  <Button
                    isIconOnly
                    size="sm"
                    variant={hasActiveFilters ? 'primary' : 'ghost'}
                  >
                    <Icon icon="mdi:filter" className="w-4 h-4" />
                  </Button>
                </Popover.Trigger>
                <Popover.Content className="p-4 w-[280px]">
                  <div className="flex flex-col gap-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold">筛选条件</span>
                      {hasActiveFilters && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onPress={clearFilters}
                        >
                          清除
                        </Button>
                      )}
                    </div>

                    {/* 分辨率筛选 */}
                    <div>
                      <p className="text-xs text-default-500 mb-2">分辨率</p>
                      <div className="flex flex-wrap gap-2">
                        {['4K', '1080p', '720p'].map(res => (
                          <Button
                            key={res}
                            size="sm"
                            variant={filterOptions.resolution.includes(res) ? 'primary' : 'ghost'}
                            onPress={() => handleToggleFilter('resolution', res)}
                          >
                            {res}
                          </Button>
                        ))}
                      </div>
                    </div>

                    {/* HDR类型筛选 */}
                    <div>
                      <p className="text-xs text-default-500 mb-2">HDR 类型</p>
                      <div className="flex flex-wrap gap-2">
                        {['DV', 'HDR10+', 'HDR'].map(hdr => (
                          <Button
                            key={hdr}
                            size="sm"
                            variant={filterOptions.hdrType.includes(hdr) ? 'primary' : 'ghost'}
                            onPress={() => handleToggleFilter('hdrType', hdr)}
                          >
                            {hdr}
                          </Button>
                        ))}
                      </div>
                    </div>

                    {/* 中文字幕筛选 */}
                    <div>
                      <p className="text-xs text-default-500 mb-2">中文字幕</p>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant={filterOptions.hasChineseSubtitle === true ? 'primary' : 'ghost'}
                          onPress={handleToggleSubtitle}
                        >
                          有
                        </Button>
                        <Button
                          size="sm"
                          variant={filterOptions.hasChineseSubtitle === false ? 'primary' : 'ghost'}
                          onPress={handleToggleSubtitle}
                        >
                          无
                        </Button>
                      </div>
                    </div>
                  </div>
                </Popover.Content>
              </Popover>

              {/* 展开/折叠 */}
              <Button
                isIconOnly
                size="sm"
                variant="ghost"
                onPress={handleExpandAll}
              >
                <Icon
                  icon={expandedKeys.size === sortedData?.length ? 'mdi:chevron-up' : 'mdi:chevron-down'}
                  className="w-4 h-4"
                />
              </Button>

              {/* 智能选择 */}
              <Button
                size="sm"
                variant="ghost"
                onPress={handleSmartSelect}
              >
                <Check className="w-4 h-4" />
                智能选择
              </Button>

              <Button
                size="sm"
                variant="ghost"
                onPress={handleSelectAll}
              >
                {selectedGroups.size === sortedData.length ? '取消全选' : '全选组'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* 重复组列表 */}
      <div className="flex-1 min-h-0">
        {sortedData && sortedData.length > 0 ? (
          <div className="flex flex-col gap-4 h-full">
            <h2 className="text-lg font-semibold shrink-0">重复组列表</h2>
            <div ref={parentRef} className="flex-1 overflow-auto scrollbar-hide relative bg-background/5 rounded-xl border border-divider/10">
              <div
                style={{
                  height: `${rowVirtualizer.getTotalSize()}px`,
                  width: '100%',
                  position: 'relative',
                }}
              >
                {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                  const item = flatData[virtualRow.index];
                  const style = {
                    position: 'absolute' as const,
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: `${virtualRow.size}px`,
                    transform: `translateY(${virtualRow.start}px)`,
                  };

                  if (item.type === 'header') {
                    const { group, isExpanded, isSelected } = item;
                    const redundantCount = group.files.length - 1;
                    const sortedFiles = [...group.files].sort((a, b) => (b.quality_score || 0) - (a.quality_score || 0));
                    const redundantFiles = sortedFiles.slice(1);
                    const wastedSpace = redundantFiles.reduce((sum, f) => sum + f.size, 0);

                    return (
                      <div key={virtualRow.key} style={{ ...style, paddingBottom: '4px', zIndex: 10 }} className="px-1 pt-1">
                        <Surface
                          variant="default"
                          className={clsx(
                            "w-full rounded-lg border transition-all cursor-pointer h-full flex flex-col justify-center",
                            isExpanded ? "border-primary/50 bg-default-50" : "border-divider/50 bg-surface hover:bg-default-50"
                          )}
                          onClick={() => {
                            const newExpanded = new Set(expandedKeys);
                            if (isExpanded) newExpanded.delete(group.id);
                            else newExpanded.add(group.id);
                            setExpandedKeys(newExpanded);
                          }}
                        >
                          <div className="flex items-center justify-between w-full px-4 py-2">
                            <div className="flex items-center gap-3 flex-1 min-w-0">
                              <div
                                className="shrink-0 z-20"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const newSelected = new Set(selectedGroups)
                                  if (isSelected) {
                                    newSelected.delete(group.id)
                                  } else {
                                    newSelected.add(group.id)
                                  }
                                  setSelectedGroups(newSelected)
                                }}
                              >
                                <div className="p-1 cursor-pointer hover:bg-default-200 rounded-full transition-colors">
                                  {isSelected ? (
                                    <Check className="w-4 h-4 text-primary" />
                                  ) : (
                                    <div className="w-4 h-4 border-2 border-default-300 rounded" />
                                  )}
                                </div>
                              </div>
                              <Filmstrip className="w-5 h-5 text-primary shrink-0" />
                              <div className="flex flex-col gap-1 text-left min-w-0 flex-1">
                                <span className="text-base font-semibold truncate">{group.title}</span>
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-xs text-muted">
                                    {dedupeMode === 'hash' ? `TMDB ID: ${group.id}` : `相似度: ${((group.similarity || 0) * 100).toFixed(1)}%`}
                                  </span>
                                  <Chip variant="soft" size="sm" color="warning">
                                    {redundantCount} 个冗余
                                  </Chip>
                                  <Chip variant="soft" size="sm" color="accent">
                                    {formatSize(wastedSpace)} 可释放
                                  </Chip>
                                </div>
                              </div>
                            </div>
                            <div className="text-default-400">
                              <Icon icon={isExpanded ? "mdi:chevron-up" : "mdi:chevron-down"} className="w-5 h-5" />
                            </div>
                          </div>
                        </Surface>
                      </div>
                    )
                  }
                  else if (item.type === 'best') {
                    return (
                      <div key={virtualRow.key} style={{ ...style, paddingBottom: '8px' }} className="pl-6 pr-1">
                        <Surface
                          variant="secondary"
                          className="rounded-lg p-4 border-2 border-success/50 h-full flex flex-col justify-center shadow-sm"
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-2">
                                <Chip color="success" variant="soft" size="sm">
                                  <Check className="w-3 h-3 mr-1" />
                                  推荐保留
                                </Chip>
                                <span className="text-sm font-semibold text-foreground truncate">{item.file.name}</span>
                              </div>
                              <FileInfo file={item.file} />
                            </div>
                            <div className="flex flex-col gap-2 shrink-0">
                              <Chip color="success" variant="soft" size="sm">质量: {item.file.quality_score || 0}</Chip>
                            </div>
                          </div>
                        </Surface>
                      </div>
                    )
                  }
                  else if (item.type === 'redundant') {
                    return (
                      <div key={virtualRow.key} style={{ ...style, paddingBottom: '8px' }} className="pl-6 pr-1">
                        <Surface
                          variant="default"
                          className="rounded-lg p-4 border border-divider/50 h-full flex flex-col justify-center shadow-sm hover:border-danger/30 transition-colors"
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-2">
                                <span className="text-sm font-medium text-foreground truncate">
                                  {item.file.name}
                                </span>
                                <Chip variant="soft" size="sm" color="danger">
                                  冗余版本
                                </Chip>
                              </div>
                              <FileInfo file={item.file} compareWith={item.bestFile} />
                            </div>
                            <div className="flex flex-col gap-2 shrink-0">
                              <Button
                                size="sm"
                                variant="danger"
                                onPress={() => trashMutation.mutate(item.file.id)}
                                isPending={trashMutation.isPending}
                              >
                                <TrashBin className="w-4 h-4" />
                                移入回收站
                              </Button>
                            </div>
                          </div>
                        </Surface>
                      </div>
                    )
                  }
                  return null;
                })}
              </div>
            </div>
          </div>
        ) : data && data.length === 0 ? (
          <Surface variant="secondary" className="rounded-xl p-12 text-center border border-divider">
            <div className="flex flex-col items-center gap-3">
              <div className="p-4 bg-success/10 rounded-full">
                <Icon icon="mdi:check-circle" className="w-8 h-8 text-success" />
              </div>
              <div className="flex flex-col gap-1">
                <p className="text-sm font-semibold text-foreground">未发现重复文件</p>
                <p className="text-xs text-default-400">您的媒体库中没有重复的影片</p>
              </div>
            </div>
          </Surface>
        ) : (
          <Surface variant="secondary" className="rounded-xl p-12 text-center border border-divider">
            <div className="flex flex-col items-center gap-3">
              <div className="p-4 bg-default-100 rounded-full">
                <CircleExclamation className="w-8 h-8 text-default-400" />
              </div>
              <div className="flex flex-col gap-1">
                <p className="text-sm font-semibold text-foreground">开始扫描</p>
                <p className="text-xs text-default-400">点击上方按钮开始扫描重复文件</p>
              </div>
            </div>
          </Surface>
        )}
      </div>

      {/* 固定底部操作栏 */}
      {selectedGroups.size > 0 && (
        <Surface variant="secondary" className="fixed bottom-0 left-0 right-0 border-t border-divider p-4 z-50">
          <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Check className="w-5 h-5 text-primary" />
              <span className="text-sm font-medium">
                已选择 <span className="text-primary font-semibold">{selectedGroups.size}</span> 组，
                可删除 <span className="text-danger font-semibold">{getSelectedRedundantFiles().length}</span> 个冗余文件
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="ghost"
                onPress={() => setSelectedGroups(new Set())}
              >
                取消选择
              </Button>
              <Button
                size="sm"
                variant="danger"
                onPress={handleBatchDelete}
                isPending={batchTrashMutation.isPending}
              >
                <TrashBin className="w-4 h-4" />
                批量删除 ({getSelectedRedundantFiles().length})
              </Button>
            </div>
          </div>
        </Surface>
      )}
    </div>
  )
}

// 文件信息组件
function FileInfo({ file, compareWith }: { file: MediaFile; compareWith?: MediaFile }) {
  const vInfo = file.video_info

  const getResolution = () => {
    if (vInfo?.width && vInfo?.height) {
      if (vInfo.width >= 3840 || vInfo.height >= 2160) return '4K'
      if (vInfo.width >= 1920 || vInfo.height >= 1080) return '1080p'
      if (vInfo.width >= 1280 || vInfo.height >= 720) return '720p'
      return 'SD'
    }
    return null
  }

  const getHDRType = () => {
    if (!vInfo) return null
    if (vInfo.is_dolby_vision) return 'DV'
    if (vInfo.is_hdr10_plus) return 'HDR10+'
    if (vInfo.is_hdr) return 'HDR'
    return null
  }

  const resolution = getResolution()
  const hdrType = getHDRType()

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="font-mono text-default-600">{formatSize(file.size)}</span>
        {resolution && (
          <>
            <span className="text-default-400">·</span>
            <Chip size="sm" variant="soft" color="accent">
              {resolution}
            </Chip>
          </>
        )}
        {hdrType && (
          <Chip size="sm" variant="soft" color="warning">
            {hdrType}
          </Chip>
        )}
        {vInfo?.source && (
          <Chip size="sm" variant="soft" color="default">
            {vInfo.source}
          </Chip>
        )}
        {vInfo?.has_chinese_subtitle && (
          <Chip size="sm" variant="soft" color="accent">
            中字
          </Chip>
        )}
        {vInfo?.codec && (
          <>
            <span className="text-default-400">·</span>
            <span className="text-default-500 font-mono">{vInfo.codec}</span>
          </>
        )}
      </div>

      {file.quality_score !== undefined && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-default-500">质量评分</span>
          <div className="flex-1 h-2 bg-default-100 rounded-full overflow-hidden max-w-[200px]">
            <div
              className={clsx(
                "h-full rounded-full transition-all",
                file.quality_score >= 70 ? "bg-success" :
                  file.quality_score >= 50 ? "bg-warning" : "bg-danger"
              )}
              style={{ width: `${file.quality_score}%` }}
            />
          </div>
          <span className={clsx(
            "text-xs font-semibold min-w-[30px] text-right",
            file.quality_score >= 70 ? "text-success" :
              file.quality_score >= 50 ? "text-warning" : "text-danger"
          )}>
            {file.quality_score}
          </span>
          {compareWith && compareWith.quality_score !== undefined && (
            <span className={clsx(
              "text-xs",
              file.quality_score < compareWith.quality_score ? "text-danger" : "text-default-400"
            )}>
              ({file.quality_score < compareWith.quality_score ? '-' : '+'}
              {Math.abs(file.quality_score - compareWith.quality_score)})
            </span>
          )}
        </div>
      )}

      <div className="text-xs text-default-400 font-mono truncate" title={file.path}>
        {file.path}
      </div>
    </div>
  )
}

function formatSize(bytes: number): string {
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let size = bytes
  let unitIndex = 0

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024
    unitIndex++
  }

  return `${size.toFixed(2)} ${units[unitIndex]}`
}
