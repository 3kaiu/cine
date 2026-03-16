import { useMemo, useState } from 'react'
import { Button, Card, Chip, Popover, SearchField, Select, ListBox, Surface } from '@heroui/react'
import { Icon } from '@iconify/react'
import { Text } from '@gravity-ui/icons'
import VirtualizedTable from '@/components/VirtualizedTable'
import type { MediaFile } from '@/api/media'
import type { ScannerFilterOptions, ScannerViewMode } from '../ScannerPage'

export function MediaLibraryPanel({
  title,
  total,
  selectedDirectory,
  onClearDirectory,
  searchTerm,
  onSearchChange,
  fileTypeFilter,
  onFileTypeChange,
  filterOptions,
  onFilterOptionsChange,
  viewMode,
  onViewModeChange,
  files,
  isPending,
  onRefresh,
  onOpenSubtitles,
}: {
  title: string
  total: number
  selectedDirectory: string | null
  onClearDirectory: () => void
  searchTerm: string
  onSearchChange: (value: string) => void
  fileTypeFilter: string
  onFileTypeChange: (value: string) => void
  filterOptions: ScannerFilterOptions
  onFilterOptionsChange: (next: ScannerFilterOptions) => void
  viewMode: ScannerViewMode
  onViewModeChange: (mode: ScannerViewMode) => void
  files: MediaFile[]
  isPending: boolean
  onRefresh: () => void
  onOpenSubtitles: (file: MediaFile) => void
}) {
  const [filterPopover, setFilterPopover] = useState(false)

  const columns = useMemo(
    () => [
      {
        title: '文件名',
        dataIndex: 'name',
        key: 'name',
        width: 400,
        render: (text: unknown) => <span className="text-sm font-medium text-foreground">{text as string}</span>,
      },
      {
        title: '类型',
        dataIndex: 'file_type',
        key: 'file_type',
        width: 100,
        render: (type: unknown) => (
          <Chip
            size="sm"
            variant="soft"
            color={(type as string) === 'video' ? 'accent' : (type as string) === 'audio' ? 'warning' : 'default'}
            className="h-5 text-[10px] font-bold px-2 uppercase tracking-tight"
          >
            {(type as string) === 'video'
              ? '视频'
              : (type as string) === 'audio'
                ? '音频'
                : (type as string).toUpperCase()}
          </Chip>
        ),
      },
      {
        title: '大小',
        dataIndex: 'size',
        key: 'size',
        width: 120,
        render: (size: unknown) => <span className="text-xs text-muted font-mono">{formatSize(size as number)}</span>,
      },
      {
        title: '画质',
        key: 'quality',
        width: 250,
        render: (_: unknown, record: MediaFile) => (
          <div className="flex gap-1.5 flex-wrap">
            {record.quality_score !== undefined && (
              <Chip size="sm" color={record.quality_score > 70 ? 'success' : 'warning'} variant="soft">
                {record.quality_score}
              </Chip>
            )}
            {record.video_info?.is_dolby_vision && (
              <Chip size="sm" color="warning" variant="soft">
                DV
              </Chip>
            )}
            {record.video_info?.is_hdr10_plus && (
              <Chip size="sm" color="warning" variant="soft">
                HDR10+
              </Chip>
            )}
            {record.video_info?.is_hdr && !record.video_info?.is_dolby_vision && (
              <Chip size="sm" color="warning" variant="soft">
                HDR
              </Chip>
            )}
            {record.video_info?.source && (
              <Chip size="sm" variant="soft">
                {record.video_info.source}
              </Chip>
            )}
            {record.video_info?.has_chinese_subtitle && (
              <Chip size="sm" color="accent" variant="soft">
                中字
              </Chip>
            )}
          </div>
        ),
      },
      {
        title: '操作',
        key: 'action',
        width: 100,
        render: (_: unknown, record: MediaFile) => (
          <Button size="sm" variant="ghost" onPress={() => onOpenSubtitles(record)}>
            <Text className="w-4 h-4" />
            字幕
          </Button>
        ),
      },
    ],
    [onOpenSubtitles],
  )

  const hasActiveFilters =
    filterOptions.resolution.length > 0 || filterOptions.hdrType.length > 0 || filterOptions.hasChineseSubtitle !== null

  return (
    <div className="flex-1 min-h-0">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="flex items-center gap-3 flex-wrap">
            <h2 className="text-lg font-semibold">{title}</h2>
            <Chip color="accent" variant="soft" size="sm">
              {total.toLocaleString()} 文件
            </Chip>
            {selectedDirectory && (
              <Chip color="accent" variant="soft" size="sm">
                {selectedDirectory.split('/').pop() || selectedDirectory}
                <Button
                  isIconOnly
                  size="sm"
                  variant="ghost"
                  className="ml-1 h-auto min-w-0 p-0"
                  onPress={onClearDirectory}
                >
                  <Icon icon="mdi:close" className="w-3 h-3" />
                </Button>
              </Chip>
            )}
          </div>

          <div className="flex gap-2 w-full sm:w-auto items-center">
            <Surface
              variant="default"
              className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 rounded-xl border border-divider/50 shadow-sm"
            >
              <div className="flex flex-wrap gap-4 items-center w-full sm:w-auto">
                <SearchField className="w-full sm:w-[320px]" value={searchTerm} onChange={onSearchChange}>
                  <SearchField.Group className="bg-default-100/50 border border-divider/20 focus-within:border-primary/50 transition-colors h-9">
                    <SearchField.SearchIcon className="text-default-400" />
                    <SearchField.Input placeholder="搜索文件名..." className="text-sm" />
                    <SearchField.ClearButton />
                  </SearchField.Group>
                </SearchField>

                <div className="flex items-center gap-2 bg-default-100/50 px-2 py-1 rounded-md border border-divider/20">
                  <span className="text-[11px] font-bold text-default-500 uppercase tracking-wider">类型</span>
                  <Select
                    selectedKey={fileTypeFilter}
                    onSelectionChange={(keys) => {
                      if (!keys) return
                      const selected = Array.from(keys as Iterable<unknown>)[0] as string
                      if (selected) onFileTypeChange(selected)
                    }}
                    className="w-[120px]"
                  >
                    <Select.Trigger className="h-7 min-h-0 bg-transparent border-none shadow-none text-xs font-bold">
                      <Select.Value />
                      <Select.Indicator />
                    </Select.Trigger>
                    <Select.Popover>
                      <ListBox className="text-xs">
                        <ListBox.Item key="all">全部类型</ListBox.Item>
                        <ListBox.Item key="video">视频文件</ListBox.Item>
                        <ListBox.Item key="audio">音频文件</ListBox.Item>
                        <ListBox.Item key="image">图片文件</ListBox.Item>
                      </ListBox>
                    </Select.Popover>
                  </Select>
                </div>

                <Popover isOpen={filterPopover} onOpenChange={setFilterPopover}>
                  <Popover.Trigger>
                    <Button
                      variant={hasActiveFilters ? 'primary' : 'ghost'}
                      size="md"
                      className="font-bold flex items-center gap-2 border border-divider/10 shadow-none px-4"
                    >
                      <Icon icon="mdi:filter-variant" className="w-4 h-4" />
                      高级筛选
                      {hasActiveFilters && <div className="w-1.5 h-1.5 rounded-full bg-primary" />}
                    </Button>
                  </Popover.Trigger>
                  <Popover.Content className="p-4 w-[280px] bg-background border border-divider/50 shadow-xl rounded-xl">
                    <div className="flex flex-col gap-4">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-black uppercase tracking-widest text-default-400">过滤条件</span>
                        <Button
                          size="sm"
                          variant="ghost"
                          onPress={() => onFilterOptionsChange({ resolution: [], hdrType: [], hasChineseSubtitle: null })}
                          className="h-6 text-[10px] font-bold px-2"
                        >
                          重置
                        </Button>
                      </div>

                      <div className="space-y-1.5">
                        <p className="text-[10px] font-bold text-default-400 uppercase tracking-wider">分辨率</p>
                        <div className="flex flex-wrap gap-1.5">
                          {['4K', '1080p', '720p'].map((res) => (
                            <Button
                              key={res}
                              size="sm"
                              variant={filterOptions.resolution.includes(res) ? 'primary' : 'secondary'}
                              onPress={() => {
                                const next = filterOptions.resolution.includes(res)
                                  ? filterOptions.resolution.filter((r) => r !== res)
                                  : [...filterOptions.resolution, res]
                                onFilterOptionsChange({ ...filterOptions, resolution: next })
                              }}
                              className="h-7 px-2.5 text-xs font-bold shadow-none"
                            >
                              {res}
                            </Button>
                          ))}
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <p className="text-[10px] font-bold text-default-400 uppercase tracking-wider">动态范围</p>
                        <div className="flex flex-wrap gap-1.5">
                          {['DV', 'HDR10+', 'HDR'].map((hdr) => (
                            <Button
                              key={hdr}
                              size="sm"
                              variant={filterOptions.hdrType.includes(hdr) ? 'primary' : 'secondary'}
                              onPress={() => {
                                const next = filterOptions.hdrType.includes(hdr)
                                  ? filterOptions.hdrType.filter((h) => h !== hdr)
                                  : [...filterOptions.hdrType, hdr]
                                onFilterOptionsChange({ ...filterOptions, hdrType: next })
                              }}
                              className="h-7 px-2.5 text-xs font-bold shadow-none"
                            >
                              {hdr}
                            </Button>
                          ))}
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <p className="text-[10px] font-bold text-default-400 uppercase tracking-wider">中文字幕</p>
                        <div className="flex gap-1.5">
                          <Button
                            size="sm"
                            variant={filterOptions.hasChineseSubtitle === true ? 'primary' : 'secondary'}
                            onPress={() =>
                              onFilterOptionsChange({
                                ...filterOptions,
                                hasChineseSubtitle: filterOptions.hasChineseSubtitle === true ? null : true,
                              })
                            }
                            className="h-7 px-3 text-xs font-bold shadow-none flex-1"
                          >
                            有中字
                          </Button>
                          <Button
                            size="sm"
                            variant={filterOptions.hasChineseSubtitle === false ? 'primary' : 'secondary'}
                            onPress={() =>
                              onFilterOptionsChange({
                                ...filterOptions,
                                hasChineseSubtitle: filterOptions.hasChineseSubtitle === false ? null : false,
                              })
                            }
                            className="h-7 px-3 text-xs font-bold shadow-none flex-1"
                          >
                            无中字
                          </Button>
                        </div>
                      </div>
                    </div>
                  </Popover.Content>
                </Popover>
              </div>

              <div className="flex items-center gap-2">
                <div className="flex bg-default-100/50 p-1 rounded-lg border border-divider/20 h-9">
                  <Button
                    isIconOnly
                    size="sm"
                    variant={viewMode === 'list' ? 'primary' : 'ghost'}
                    onPress={() => onViewModeChange('list')}
                    className="w-8 h-7 rounded-md"
                  >
                    <Icon icon="mdi:view-list" className="w-4 h-4" />
                  </Button>
                  <Button
                    isIconOnly
                    size="sm"
                    variant={viewMode === 'grid' ? 'primary' : 'ghost'}
                    onPress={() => onViewModeChange('grid')}
                    className="w-8 h-7 rounded-md"
                  >
                    <Icon icon="mdi:view-grid" className="w-4 h-4" />
                  </Button>
                </div>

                <Button
                  isIconOnly
                  variant="ghost"
                  onPress={onRefresh}
                  className="h-9 w-9 border border-divider/20 bg-default-100/50"
                >
                  <Icon icon="mdi:refresh" className="w-4 h-4" />
                </Button>
              </div>
            </Surface>
          </div>
        </div>

        {viewMode === 'list' ? (
          <Surface className="rounded-xl overflow-hidden" variant="default">
            <VirtualizedTable<MediaFile>
              columns={columns}
              dataSource={files}
              height={600}
              rowHeight={52}
              loading={isPending}
            />
          </Surface>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {files.map((file) => (
              <Card key={file.id} className="overflow-hidden">
                <Card.Content className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate mb-2">{file.name}</p>
                      <div className="flex items-center gap-2 mb-3">
                        <Chip
                          size="sm"
                          variant="soft"
                          color={file.file_type === 'video' ? 'accent' : file.file_type === 'audio' ? 'warning' : 'default'}
                        >
                          {file.file_type.toUpperCase()}
                        </Chip>
                        <span className="text-xs text-muted">{formatSize(file.size)}</span>
                      </div>
                      <div className="flex gap-1.5 flex-wrap">
                        {file.quality_score !== undefined && (
                          <Chip size="sm" color={file.quality_score > 70 ? 'success' : 'warning'} variant="soft">
                            {file.quality_score}
                          </Chip>
                        )}
                        {file.video_info?.is_dolby_vision && (
                          <Chip size="sm" color="warning" variant="soft">
                            DV
                          </Chip>
                        )}
                        {file.video_info?.is_hdr10_plus && (
                          <Chip size="sm" color="warning" variant="soft">
                            HDR10+
                          </Chip>
                        )}
                        {file.video_info?.is_hdr && !file.video_info?.is_dolby_vision && (
                          <Chip size="sm" color="warning" variant="soft">
                            HDR
                          </Chip>
                        )}
                        {file.video_info?.has_chinese_subtitle && (
                          <Chip size="sm" color="accent" variant="soft">
                            中字
                          </Chip>
                        )}
                      </div>
                    </div>
                    <Button size="sm" variant="ghost" onPress={() => onOpenSubtitles(file)}>
                      <Text className="w-4 h-4" />
                    </Button>
                  </div>
                </Card.Content>
              </Card>
            ))}
          </div>
        )}
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

