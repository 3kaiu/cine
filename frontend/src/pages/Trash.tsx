import { useState, useMemo } from 'react'
import clsx from 'clsx'
import {
  Button,
  Chip,
  Modal,
  SearchField,
  Select,
  ListBox,
  Surface,
  Tooltip
} from "@heroui/react";
import { Icon } from '@iconify/react'
import { ArrowRotateLeft, TrashBin } from '@gravity-ui/icons'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { mediaApi } from '@/api/media'
import VirtualizedTable from '@/components/VirtualizedTable'
import { handleError } from '@/utils/errorHandler'
import { showSuccess } from '@/utils/toast'
import PageHeader from '@/components/PageHeader'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'

dayjs.extend(relativeTime)

interface TrashItem {
  id: string
  original_path: string
  original_name: string
  trash_path: string
  file_size: number
  deleted_at: string
  file_type: string
}

export default function Trash() {
  const queryClient = useQueryClient()
  const [selectedKeys, setSelectedKeys] = useState<any>(new Set([]))
  const [searchTerm, setSearchTerm] = useState('')
  const [fileTypeFilter, setFileTypeFilter] = useState('all')
  const [sortBy, setSortBy] = useState('deleted_at_desc')
  const [isConfirmOpen, setIsConfirmOpen] = useState(false)
  const [confirmAction, setConfirmAction] = useState<'restore' | 'delete' | 'clear' | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['trash', searchTerm, fileTypeFilter, sortBy],
    queryFn: () => mediaApi.listTrash()
  })

  const selectedItems = useMemo(() => {
    return selectedKeys === 'all'
      ? new Set(data?.items.map(f => f.id) || [])
      : (selectedKeys as Set<string>)
  }, [selectedKeys, data])

  const filteredFiles = useMemo(() => {
    if (!data?.items) return []
    let files = [...data.items]

    if (searchTerm) {
      files = files.filter(f => f.original_name.toLowerCase().includes(searchTerm.toLowerCase()))
    }

    if (fileTypeFilter !== 'all') {
      files = files.filter(f => f.file_type === fileTypeFilter)
    }

    files.sort((a, b) => {
      if (sortBy === 'deleted_at_desc') return dayjs(b.deleted_at).unix() - dayjs(a.deleted_at).unix()
      if (sortBy === 'deleted_at_asc') return dayjs(a.deleted_at).unix() - dayjs(b.deleted_at).unix()
      if (sortBy === 'name_asc') return a.original_name.localeCompare(b.original_name)
      if (sortBy === 'size_desc') return b.file_size - a.file_size
      return 0
    })

    return files
  }, [data, searchTerm, fileTypeFilter, sortBy])

  const restoreMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      await Promise.all(ids.map(id => mediaApi.restoreFromTrash({ file_id: id })))
    },
    onSuccess: () => {
      showSuccess('文件还原成功')
      queryClient.invalidateQueries({ queryKey: ['trash'] })
      setSelectedKeys(new Set([]))
    },
    onError: (err: unknown) => handleError(err)
  })

  const deleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      await Promise.all(ids.map(id => mediaApi.permanentlyDelete(id)))
    },
    onSuccess: () => {
      showSuccess('文件已彻底删除')
      queryClient.invalidateQueries({ queryKey: ['trash'] })
      setSelectedKeys(new Set([]))
    },
    onError: (err: unknown) => handleError(err)
  })

  const clearMutation = useMutation({
    mutationFn: () => mediaApi.cleanupTrash(),
    onSuccess: () => {
      showSuccess('回收站已清空')
      queryClient.invalidateQueries({ queryKey: ['trash'] })
      setSelectedKeys(new Set([]))
    },
    onError: handleError
  })

  const handleAction = (action: 'restore' | 'delete' | 'clear') => {
    setConfirmAction(action)
    setIsConfirmOpen(true)
  }

  const confirmExecute = () => {
    const ids = Array.from(selectedItems) as string[]
    if (confirmAction === 'restore') restoreMutation.mutate(ids)
    if (confirmAction === 'delete') deleteMutation.mutate(ids)
    if (confirmAction === 'clear') clearMutation.mutate(undefined)
    setIsConfirmOpen(false)
  }

  return (
    <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-3 duration-500">
      <PageHeader
        title="回收站"
        description="管理已删除的文件，支持还原或彻底删除"
        actions={
          <div className="flex items-center gap-2 p-1 bg-default-100/50 rounded-xl border border-divider/10 shadow-sm">
            <Button
              variant="secondary"
              isDisabled={selectedItems.size === 0}
              onPress={() => handleAction('restore')}
              className="font-bold h-9 px-4 border border-divider/10 bg-background/50 shadow-sm transition-all text-accent hover:text-accent/80"
            >
              <ArrowRotateLeft className="w-4 h-4 mr-2" />
              还原所选
            </Button>
            <Button
              variant="danger"
              isDisabled={selectedItems.size === 0}
              onPress={() => handleAction('delete')}
              className="font-bold h-9 px-4 shadow-none"
            >
              <TrashBin className="w-4 h-4 mr-2" />
              彻底删除
            </Button>
            <div className="w-px h-4 bg-divider/20 mx-1" />
            <Button
              variant="ghost"
              onPress={() => handleAction('clear')}
              className="font-bold h-9 px-4 border border-divider/10 bg-background/50 shadow-sm transition-all text-danger/80 hover:text-danger"
            >
              <Icon icon="mdi:trash-can-sweep-outline" className="w-4 h-4 mr-2" />
              清空回收站
            </Button>
          </div>
        }
      />

      <Surface variant="default" className="rounded-xl p-4 border border-divider/50 shadow-sm bg-background/50">
        <div className="flex flex-col md:flex-row gap-4 items-center">
          <div className="flex items-center gap-3">
            <h3 className="text-sm font-black uppercase tracking-widest text-foreground/70 shrink-0">项目列表</h3>
            <Chip color="accent" variant="soft" className="h-5 text-[10px] font-bold px-2 uppercase tracking-tight">
              {selectedItems.size} / {data?.items.length || 0} 已选
            </Chip>
          </div>

          <div className="flex-1 flex items-center gap-4 w-full">
            <SearchField
              value={searchTerm}
              onChange={setSearchTerm}
              className="flex-1"
            >
              <SearchField.Group className="bg-default-100/50 border border-divider/20 focus-within:border-accent/50 transition-colors h-9">
                <SearchField.Input placeholder="搜索回收站内容..." className="text-sm" />
                <SearchField.ClearButton />
              </SearchField.Group>
            </SearchField>

            <div className="flex items-center gap-2 px-1 py-1 rounded-lg bg-default-100/50 border border-divider/10">
              <Select
                selectedKey={fileTypeFilter}
                onSelectionChange={(keys) => {
                  if (!keys) return
                  const selected = Array.from(keys as any)[0] as string
                  if (selected) setFileTypeFilter(selected)
                }}
                className="w-24 border-none"
              >
                <Select.Trigger className="h-7 min-h-0 bg-transparent border-none shadow-none text-xs font-bold">
                  <Select.Value />
                  <Select.Indicator />
                </Select.Trigger>
                <Select.Popover>
                  <ListBox className="text-xs">
                    <ListBox.Item key="all">全部类型</ListBox.Item>
                    <ListBox.Item key="video">视频文件</ListBox.Item>
                    <ListBox.Item key="nfo">元数据</ListBox.Item>
                    <ListBox.Item key="image">图片海报</ListBox.Item>
                  </ListBox>
                </Select.Popover>
              </Select>
              <div className="w-px h-4 bg-divider/20" />
              <Select
                selectedKey={sortBy}
                onSelectionChange={(keys) => {
                  if (!keys) return
                  const selected = Array.from(keys as any)[0] as string
                  if (selected) setSortBy(selected)
                }}
                className="w-32 border-none"
              >
                <Select.Trigger className="h-7 min-h-0 bg-transparent border-none shadow-none text-xs font-bold">
                  <Select.Value />
                  <Select.Indicator />
                </Select.Trigger>
                <Select.Popover>
                  <ListBox className="text-xs">
                    <ListBox.Item key="deleted_at_desc">删除时间 ↓</ListBox.Item>
                    <ListBox.Item key="deleted_at_asc">删除时间 ↑</ListBox.Item>
                    <ListBox.Item key="name_asc">名称 A-Z</ListBox.Item>
                    <ListBox.Item key="size_desc">文件大小 ↓</ListBox.Item>
                  </ListBox>
                </Select.Popover>
              </Select>
            </div>
          </div>
        </div>
      </Surface>

      <Surface variant="default" className="rounded-2xl overflow-hidden border border-divider/50 shadow-sm bg-background/50 h-[600px] flex flex-col">
        {!isLoading && filteredFiles.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center py-20 px-4">
            <Surface variant="secondary" className="p-8 rounded-full mb-6 border border-divider/10 bg-default-50/30">
              <Icon icon="mdi:trash-can-outline" className="w-16 h-16 text-default-200 opacity-50" />
            </Surface>
            <h3 className="text-lg font-bold text-foreground/70 mb-2">回收站为空</h3>
            <p className="text-sm text-default-400 font-medium max-w-xs text-center">
              这里没有任何已删除的项目。您可以放心地继续管理您的媒体库。
            </p>
          </div>
        ) : (
          <div className="flex-1 min-h-0">
            <VirtualizedTable
              dataSource={filteredFiles}
              rowHeight={72}
              onSelectionChange={setSelectedKeys}
              selectedKeys={selectedKeys}
              selectionMode="multiple"
              columns={[
                {
                  title: '文件名',
                  dataIndex: 'original_name',
                  width: 400,
                  render: (_: any, file: TrashItem) => (
                    <div className="flex flex-col gap-1 py-1">
                      <div className="flex items-center gap-2">
                        <Icon
                          icon={file.file_type === 'video' ? 'mdi:movie-outline' : 'mdi:file-outline'}
                          className={clsx("w-4 h-4", file.file_type === 'video' ? "text-accent" : "text-default-400")}
                        />
                        <span className="text-[13px] font-bold truncate text-foreground/90">{file.original_name}</span>
                      </div>
                      <span className="text-[10px] text-default-400 truncate font-medium">{file.original_path}</span>
                    </div>
                  )
                },
                {
                  title: '大小',
                  dataIndex: 'file_size',
                  width: 120,
                  render: (_: any, file: TrashItem) => (
                    <span className="text-[11px] font-bold text-default-500 tabular-nums">
                      {formatSize(file.file_size)}
                    </span>
                  )
                },
                {
                  title: '删除时间',
                  dataIndex: 'deleted_at',
                  width: 160,
                  render: (_: any, file: TrashItem) => (
                    <div className="flex flex-col">
                      <span className="text-[11px] font-bold text-default-600">
                        {dayjs(file.deleted_at).fromNow()}
                      </span>
                      <span className="text-[10px] text-default-400 font-medium tracking-tight">
                        {dayjs(file.deleted_at).format('YYYY-MM-DD HH:mm')}
                      </span>
                    </div>
                  )
                },
                {
                  title: '',
                  dataIndex: 'id',
                  width: 120,
                  render: (_: any, file: TrashItem) => (
                    <div className="flex justify-end pr-4">
                      <Tooltip closeDelay={0}>
                        <Button
                          isIconOnly
                          size="sm"
                          variant="secondary"
                          onPress={() => restoreMutation.mutate([file.id])}
                          className="h-8 w-8 min-w-0 bg-transparent hover:bg-default-100 text-accent"
                        >
                          <ArrowRotateLeft className="w-4 h-4" />
                        </Button>
                        <Tooltip.Content>还原文件</Tooltip.Content>
                      </Tooltip>
                      <Tooltip closeDelay={0}>
                        <Button
                          isIconOnly
                          size="sm"
                          variant="secondary"
                          onPress={() => deleteMutation.mutate([file.id])}
                          className="h-8 w-8 min-w-0 bg-transparent hover:bg-default-100 text-danger/70"
                        >
                          <TrashBin className="w-4 h-4" />
                        </Button>
                        <Tooltip.Content>彻底删除</Tooltip.Content>
                      </Tooltip>
                    </div>
                  )
                }
              ]}
            />
          </div>
        )}
      </Surface>

      <Modal isOpen={isConfirmOpen} onOpenChange={setIsConfirmOpen}>
        <Modal.Backdrop />
        <Modal.Container size="sm" scroll="inside">
          <Modal.Dialog>
            <Modal.Header>
              <div className={clsx(
                "w-1.5 h-1.5 rounded-full animate-pulse",
                confirmAction === 'restore' ? "bg-accent" : "bg-danger"
              )} />
              <span className="text-sm font-black uppercase tracking-widest text-foreground/90">确认操作</span>
            </Modal.Header>
            <Modal.Body className="px-6 pb-6">
              <p className="text-sm font-medium text-foreground/80 leading-relaxed mb-4">
                {confirmAction === 'restore'
                  ? `确认要还原选中的 ${selectedItems.size} 个文件吗？`
                  : confirmAction === 'delete'
                    ? `将永久删除选中的 ${selectedItems.size} 个文件，此操作不可撤销！`
                    : '确认要清空回收站中所有的文件吗？此操作不可撤销！'}
              </p>
              {confirmAction !== 'clear' && selectedItems.size > 0 && (
                <div className="p-3 rounded-xl bg-default-100/30 border border-divider/10 max-h-32 overflow-y-auto">
                  <div className="flex flex-col gap-1.5">
                    {Array.from(selectedItems).slice(0, 3).map((id: any) => {
                      const fileId = id as string
                      const file = data?.items.find((f: TrashItem) => f.id === fileId)
                      return (
                        <div key={fileId} className="text-[11px] font-bold text-foreground/60 truncate">
                          • {file?.original_name || fileId}
                        </div>
                      )
                    })}
                    {selectedItems.size > 3 && (
                      <div className="text-[10px] text-default-400 font-black uppercase tracking-widest mt-1">
                        ... 以及另外 {selectedItems.size - 3} 个项目
                      </div>
                    )}
                  </div>
                </div>
              )}
            </Modal.Body>
            <Modal.Footer className="px-6 pb-6 pt-0 flex gap-3">
              <Button
                variant="secondary"
                onPress={() => setIsConfirmOpen(false)}
                className="flex-1 font-bold h-10 min-h-0 border border-divider/10"
              >
                取消
              </Button>
              <Button
                variant={confirmAction === 'restore' ? 'primary' : 'danger'}
                onPress={confirmExecute}
                className="flex-1 font-bold h-10 min-h-0 shadow-none px-8"
              >
                确认操作
              </Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal>
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
