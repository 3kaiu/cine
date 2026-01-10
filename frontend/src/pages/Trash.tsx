import { useState, useMemo } from 'react'
import { Button, Chip, Modal, Tooltip, Card, SearchField, Select, ListBox } from "@heroui/react";
import { TrashBin, ArrowRotateLeft } from '@gravity-ui/icons'
import { Icon } from '@iconify/react'
import { mediaApi } from '@/api/media'
import { useQuery, useMutation } from '@tanstack/react-query'
import LoadingWrapper from '@/components/LoadingWrapper'
import { handleError } from '@/utils/errorHandler'
import VirtualizedTable from '@/components/VirtualizedTable'
import PageHeader from '@/components/PageHeader'
import StatCard from '@/components/StatCard'

interface TrashItem {
  id: string
  original_path: string
  original_name: string
  trash_path: string
  file_size: number
  deleted_at: string
  file_type: string
}

interface TrashData {
  items: TrashItem[]
  total: number
}

export default function Trash() {
  const [selectedKeys, setSelectedKeys] = useState<any>(new Set([]));
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    type: 'restore' | 'delete' | 'cleanup' | null;
    count: number;
    targetId?: string;
  }>({ isOpen: false, type: null, count: 0 });
  const [searchTerm, setSearchTerm] = useState('')
  const [fileTypeFilter, setFileTypeFilter] = useState<string>('all')
  const [sortBy, setSortBy] = useState<'date' | 'size' | 'name'>('date')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list')

  const { data, refetch, isPending } = useQuery<TrashData>({
    queryKey: ['trash'],
    queryFn: mediaApi.listTrash
  })

  const selectedCount = useMemo(() => {
    if (selectedKeys === "all") return data?.items?.length || 0;
    return selectedKeys.size;
  }, [selectedKeys, data?.items?.length]);

  const selectedIds = useMemo(() => {
    if (selectedKeys === "all") return data?.items?.map(i => i.id) || [];
    return Array.from(selectedKeys) as string[];
  }, [selectedKeys, data?.items]);

  // 过滤和搜索
  const filteredItems = useMemo(() => {
    if (!data?.items) return []
    
    let result = [...data.items]
    
    // 搜索过滤
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase()
      result = result.filter(item => 
        item.original_name.toLowerCase().includes(term)
      )
    }
    
    // 文件类型过滤
    if (fileTypeFilter !== 'all') {
      result = result.filter(item => item.file_type === fileTypeFilter)
    }
    
    // 排序
    result.sort((a, b) => {
      let comparison = 0
      
      switch (sortBy) {
        case 'date':
          comparison = new Date(a.deleted_at).getTime() - new Date(b.deleted_at).getTime()
          break
        case 'size':
          comparison = a.file_size - b.file_size
          break
        case 'name':
          comparison = a.original_name.localeCompare(b.original_name)
          break
      }
      
      return sortOrder === 'asc' ? comparison : -comparison
    })
    
    return result
  }, [data, searchTerm, fileTypeFilter, sortBy, sortOrder])

  const restoreMutation = useMutation({
    mutationFn: mediaApi.restoreFromTrash,
    onSuccess: () => {
      setSelectedKeys(new Set([]));
      refetch();
      setConfirmModal({ ...confirmModal, isOpen: false });
    },
    onError: (error: any) => handleError(error, 'Restore failed'),
  })

  const deleteMutation = useMutation({
    mutationFn: mediaApi.permanentlyDelete,
    onSuccess: () => {
      setSelectedKeys(new Set([]));
      refetch();
      setConfirmModal({ ...confirmModal, isOpen: false });
    },
    onError: (error: any) => handleError(error, 'Deletion failed'),
  })

  const cleanupMutation = useMutation({
    mutationFn: mediaApi.cleanupTrash,
    onSuccess: () => {
      refetch();
      setConfirmModal({ ...confirmModal, isOpen: false });
    },
    onError: (error: any) => handleError(error, 'Cleanup failed'),
  })

  const handleConfirmAction = async () => {
    const { type, targetId } = confirmModal;
    if (type === 'restore') {
      if (targetId) {
        restoreMutation.mutate({ file_id: targetId })
      } else {
        for (const id of selectedIds) {
          await mediaApi.restoreFromTrash({ file_id: id }).catch(() => { })
        }
        refetch();
        setSelectedKeys(new Set([]));
        setConfirmModal({ ...confirmModal, isOpen: false })
      }
    } else if (type === 'delete') {
      if (targetId) {
        deleteMutation.mutate(targetId)
      } else {
        for (const id of selectedIds) {
          await mediaApi.permanentlyDelete(id).catch(() => { })
        }
        refetch();
        setSelectedKeys(new Set([]));
        setConfirmModal({ ...confirmModal, isOpen: false })
      }
    } else if (type === 'cleanup') {
      cleanupMutation.mutate()
    }
  }

  const columns = [
    {
      title: '原文件名',
      dataIndex: 'original_name',
      key: 'name',
      width: 400,
      render: (text: string) => <span className="font-bold text-[13px] text-foreground/90">{text}</span>
    },
    {
      title: '大小',
      dataIndex: 'file_size',
      key: 'size',
      width: 120,
      render: (size: number) => <span className="font-mono text-[11px] text-default-500 font-medium">{formatSize(size)}</span>
    },
    {
      title: '类型',
      dataIndex: 'file_type',
      key: 'type',
      width: 120,
      render: (type: string) => (
        <Chip size="sm" variant="soft" className="font-bold px-2">
          {type === 'video' ? '视频' :
            type === 'subtitle' ? '字幕' :
              type === 'image' ? '图片' :
                type === 'nfo' ? '信息' : type}
        </Chip>
      )
    },
    {
      title: '删除时间',
      dataIndex: 'deleted_at',
      key: 'date',
      width: 180,
      render: (date: string) => <span className="text-[11px] text-default-400 font-medium">{new Date(date).toLocaleString()}</span>
    },
    {
      title: '操作',
      key: 'actions',
      width: 100,
      render: (_: any, item: TrashItem) => (
        <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
          <Tooltip>
            <Button
              isIconOnly
              variant="ghost"
              size="sm"
              className="hover:scale-110 active:scale-95 transition-all"
              onPress={() => setConfirmModal({ isOpen: true, type: 'restore', count: 1, targetId: item.id })}
              isPending={restoreMutation.isPending && confirmModal.targetId === item.id && confirmModal.type === 'restore'}
            >
              <ArrowRotateLeft className="w-[14px] h-[14px] text-primary/80" />
            </Button>
            <Tooltip.Content>还原</Tooltip.Content>
          </Tooltip>
          <Tooltip>
            <Button
              isIconOnly
              variant="ghost"
              size="sm"
              className="hover:scale-110 active:scale-95 transition-all"
              onPress={() => setConfirmModal({ isOpen: true, type: 'delete', count: 1, targetId: item.id })}
              isPending={deleteMutation.isPending && confirmModal.targetId === item.id && confirmModal.type === 'delete'}
            >
              <TrashBin className="w-[14px] h-[14px] text-danger/80" />
            </Button>
            <Tooltip.Content>永久删除</Tooltip.Content>
          </Tooltip>
        </div>
      )
    }
  ]

  return (
    <div className="flex flex-col gap-4 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <PageHeader
        title="回收站"
        description="管理已删除的文件。文件默认将在回收站中保留 30 天"
        actions={
          <>
            {selectedCount > 0 && (
              <>
                <Button
                  onPress={() => setConfirmModal({ isOpen: true, type: 'restore', count: selectedCount })}
                  variant="ghost"
                  size="md"
                  className="font-medium text-primary border-primary/10 hover:bg-primary/5 px-4"
                >
                  <ArrowRotateLeft className="w-4 h-4" />
                  还原所选 ({selectedCount})
                </Button>
                <Button
                  onPress={() => setConfirmModal({ isOpen: true, type: 'delete', count: selectedCount })}
                  variant="ghost"
                  size="md"
                  className="font-medium text-danger border-danger/10 hover:bg-danger/5 px-4"
                >
                  <TrashBin className="w-4 h-4" />
                  彻底删除
                </Button>
              </>
            )}
            <Button
              onPress={() => setConfirmModal({ isOpen: true, type: 'cleanup', count: 0 })}
              isDisabled={(data?.items || []).length === 0}
              variant="ghost"
              size="md"
              className="font-medium text-danger border-danger/5 hover:bg-danger/5 px-4 opacity-70 hover:opacity-100"
            >
              <TrashBin className="w-4 h-4" />
              清空回收站
            </Button>
          </>
        }
      />

      {/* 统计卡片 */}
      {data && data.items.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <StatCard
            label="文件总数"
            value={data.total}
            icon={<TrashBin className="w-6 h-6" />}
            color="danger"
            description="回收站中的文件数量"
          />
          <StatCard
            label="占用空间"
            value={formatSize(data.items.reduce((sum, item) => sum + item.file_size, 0))}
            icon={<Icon icon="mdi:harddisk" className="w-6 h-6" />}
            color="warning"
            description="回收站占用存储"
          />
          <StatCard
            label="可恢复"
            value={data.items.length}
            icon={<ArrowRotateLeft className="w-6 h-6" />}
            color="primary"
            description="可恢复的文件数"
          />
        </div>
      )}

      {/* 搜索和筛选栏 */}
      {data && data.items.length > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          <SearchField
            className="flex-1 min-w-[200px]"
            value={searchTerm}
            onChange={setSearchTerm}
          >
            <SearchField.Group>
              <SearchField.SearchIcon />
              <SearchField.Input placeholder="搜索文件名..." />
              <SearchField.ClearButton />
            </SearchField.Group>
          </SearchField>
          
          <Select
            selectedKey={fileTypeFilter}
            onSelectionChange={(keys) => {
              if (!keys) return
              const selected = Array.isArray(Array.from(keys as any)) 
                ? Array.from(keys as any)[0] as string
                : keys as string
              if (selected) {
                setFileTypeFilter(selected)
              }
            }}
            className="w-[140px]"
          >
            <Select.Trigger>
              <Select.Value />
              <Select.Indicator />
            </Select.Trigger>
            <Select.Popover>
              <ListBox>
                <ListBox.Item key="all">全部类型</ListBox.Item>
                <ListBox.Item key="video">视频</ListBox.Item>
                <ListBox.Item key="subtitle">字幕</ListBox.Item>
                <ListBox.Item key="image">图片</ListBox.Item>
                <ListBox.Item key="nfo">信息</ListBox.Item>
              </ListBox>
            </Select.Popover>
          </Select>
          
          <Select
            selectedKey={`${sortBy}-${sortOrder}`}
            onSelectionChange={(keys) => {
              if (!keys) return
              const selected = Array.isArray(Array.from(keys as any)) 
                ? Array.from(keys as any)[0] as string
                : keys as string
              if (selected) {
                const [key, order] = selected.split('-')
                setSortBy(key as 'date' | 'size' | 'name')
                setSortOrder(order as 'asc' | 'desc')
              }
            }}
            className="w-[160px]"
          >
            <Select.Trigger>
              <Select.Value />
              <Select.Indicator />
            </Select.Trigger>
            <Select.Popover>
              <ListBox>
                <ListBox.Item key="date-desc">删除时间 (新→旧)</ListBox.Item>
                <ListBox.Item key="date-asc">删除时间 (旧→新)</ListBox.Item>
                <ListBox.Item key="size-desc">文件大小 (大→小)</ListBox.Item>
                <ListBox.Item key="size-asc">文件大小 (小→大)</ListBox.Item>
                <ListBox.Item key="name-asc">文件名 (A→Z)</ListBox.Item>
                <ListBox.Item key="name-desc">文件名 (Z→A)</ListBox.Item>
              </ListBox>
            </Select.Popover>
          </Select>
          
          <div className="flex gap-1 ml-auto">
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
          </div>
        </div>
      )}

      <div className="flex flex-col gap-4">
        {(!data || data.items.length === 0) ? (
          <div className="flex flex-col items-center justify-center py-20 border border-divider/10 rounded-2xl bg-default-50/30">
            <div className="p-6 bg-default-100 rounded-full mb-4">
              <TrashBin className="w-12 h-12 text-default-300" />
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-2">回收站为空</h3>
            <p className="text-sm text-default-400">已删除的文件将显示在这里</p>
          </div>
        ) : (
          <LoadingWrapper loading={isPending}>
            {viewMode === 'list' ? (
              <div className="h-[600px]">
                <VirtualizedTable<TrashItem>
                  columns={columns}
                  dataSource={filteredItems}
                  height={600}
                  selectionMode="multiple"
                  selectedKeys={selectedKeys}
                  onSelectionChange={setSelectedKeys}
                />
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {filteredItems.map((item: TrashItem) => (
                  <Card key={item.id} className="overflow-hidden">
                    <Card.Content className="p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate mb-2">{item.original_name}</p>
                          <div className="flex items-center gap-2 mb-3">
                            <Chip size="sm" variant="soft" className="font-bold px-2">
                              {item.file_type === 'video' ? '视频' :
                                item.file_type === 'subtitle' ? '字幕' :
                                  item.file_type === 'image' ? '图片' :
                                    item.file_type === 'nfo' ? '信息' : item.file_type}
                            </Chip>
                            <span className="text-xs text-muted">{formatSize(item.file_size)}</span>
                          </div>
                          <p className="text-xs text-default-400">删除于 {new Date(item.deleted_at).toLocaleString()}</p>
                        </div>
                        <div className="flex gap-1">
                          <Tooltip>
                            <Button
                              isIconOnly
                              variant="ghost"
                              size="sm"
                              onPress={() => setConfirmModal({ isOpen: true, type: 'restore', count: 1, targetId: item.id })}
                              isPending={restoreMutation.isPending && confirmModal.targetId === item.id && confirmModal.type === 'restore'}
                            >
                              <ArrowRotateLeft className="w-[14px] h-[14px] text-primary/80" />
                            </Button>
                            <Tooltip.Content>还原</Tooltip.Content>
                          </Tooltip>
                          <Tooltip>
                            <Button
                              isIconOnly
                              variant="ghost"
                              size="sm"
                              onPress={() => setConfirmModal({ isOpen: true, type: 'delete', count: 1, targetId: item.id })}
                              isPending={deleteMutation.isPending && confirmModal.targetId === item.id && confirmModal.type === 'delete'}
                            >
                              <TrashBin className="w-[14px] h-[14px] text-danger/80" />
                            </Button>
                            <Tooltip.Content>永久删除</Tooltip.Content>
                          </Tooltip>
                        </div>
                      </div>
                    </Card.Content>
                  </Card>
                ))}
              </div>
            )}
          </LoadingWrapper>
        )}
      </div>

      {/* Confirm Modal */}
      <Modal isOpen={confirmModal.isOpen} onOpenChange={(open) => setConfirmModal({ ...confirmModal, isOpen: open })}>
        <Modal.Backdrop variant="blur" />
        <Modal.Container>
          <Modal.Dialog>
            <Modal.Header className="flex flex-col gap-1 font-medium">确认操作</Modal.Header>
            <Modal.Body>
              <p className="text-sm text-default-500">
                {confirmModal.type === 'cleanup'
                  ? "确定要清空回收站吗？此操作不可恢复。"
                  : `确定要${confirmModal.type === 'delete' ? '彻底删除' : '还原'}选中的 ${confirmModal.targetId ? 1 : selectedCount} 个文件吗？`}
              </p>
              {(confirmModal.type === 'restore' || confirmModal.type === 'delete') && !confirmModal.targetId && selectedCount > 0 && (
                <div className="max-h-40 border border-divider/10 bg-default-50/50 rounded-xl p-3 mt-4 overflow-y-auto scrollbar-hide">
                  {(data?.items || []).filter(item => selectedIds.includes(item.id)).map(f => (
                    <div key={f.id} className="text-[11px] font-medium py-1.5 border-b border-divider/5 last:border-0 text-foreground/70">{f.original_name}</div>
                  ))}
                </div>
              )}
            </Modal.Body>
            <Modal.Footer className="pt-4">
              <Button variant="ghost" size="md" className="font-medium px-6" onPress={() => setConfirmModal({ ...confirmModal, isOpen: false })}>取消</Button>
              <Button
                variant={confirmModal.type === 'restore' ? 'primary' : 'danger'}
                size="md"
                className="font-medium px-10 shadow-lg"
                onPress={() => {
                  handleConfirmAction();
                }}
                isPending={restoreMutation.isPending || deleteMutation.isPending || cleanupMutation.isPending}
              >
                确认
              </Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal>
    </div >
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
