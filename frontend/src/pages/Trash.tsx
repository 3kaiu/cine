import { useState, useMemo } from 'react'
import { Button, Chip, ModalRoot as Modal, ModalHeader, ModalBody, ModalFooter, ModalContainer, ModalDialog, ModalBackdrop, Tooltip } from "@heroui/react";
import { TrashBin, ArrowRotateLeft } from '@gravity-ui/icons'
import { mediaApi } from '@/api/media'
import { useQuery, useMutation } from '@tanstack/react-query'
import LoadingWrapper from '@/components/LoadingWrapper'
import { handleError } from '@/utils/errorHandler'
import VirtualizedTable from '@/components/VirtualizedTable'

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
      <div className="flex justify-between items-end pt-2 pb-2">
        <div className="flex items-center gap-4">
          <div className="p-2.5 bg-danger/5 rounded-2xl text-danger border border-danger/10 shadow-sm">
            <TrashBin className="w-[22px] h-[22px]" />
          </div>
          <div className="flex flex-col gap-1">
            <h2 className="text-[18px] font-black tracking-tight text-foreground">回收站</h2>
            <p className="text-[11px] text-default-400 font-medium">管理已删除的文件。文件默认将在回收站中保留 30 天。</p>
          </div>
        </div>
        <div className="flex gap-2">
          {selectedCount > 0 && (
            <>
              <Button
                onPress={() => setConfirmModal({ isOpen: true, type: 'restore', count: selectedCount })}
                variant="ghost"
                size="md"
                className="font-bold text-primary border-primary/10 hover:bg-primary/5 px-4"
              >
                <ArrowRotateLeft className="w-[14px] h-[14px]" />
                还原所选 ({selectedCount})
              </Button>
              <Button
                onPress={() => setConfirmModal({ isOpen: true, type: 'delete', count: selectedCount })}
                variant="ghost"
                size="md"
                className="font-bold text-danger border-danger/10 hover:bg-danger/5 px-4"
              >
                <TrashBin className="w-[14px] h-[14px]" />
                彻底删除
              </Button>
            </>
          )}
          <Button
            onPress={() => setConfirmModal({ isOpen: true, type: 'cleanup', count: 0 })}
            isDisabled={(data?.items || []).length === 0}
            variant="ghost"
            size="md"
            className="font-bold text-danger border-danger/5 hover:bg-danger/5 px-4 opacity-70 hover:opacity-100"
          >
            <TrashBin className="w-[14px] h-[14px]" />
            清空回收站
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <LoadingWrapper loading={isPending}>
          <div className="h-[600px]">
            <VirtualizedTable<TrashItem>
              columns={columns}
              dataSource={data?.items || []}
              height={600}
              selectionMode="multiple"
              selectedKeys={selectedKeys}
              onSelectionChange={setSelectedKeys}
            />
          </div>
        </LoadingWrapper>
      </div>

      {/* Confirm Modal */}
      <Modal isOpen={confirmModal.isOpen} onOpenChange={(open) => setConfirmModal({ ...confirmModal, isOpen: open })}>
        <ModalBackdrop variant="blur" />
        <ModalContainer>
          <ModalDialog>
            {({ close }: any) => (
              <>
                <ModalHeader className="flex flex-col gap-1 font-bold">确认操作</ModalHeader>
                <ModalBody>
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
                </ModalBody>
                <ModalFooter className="pt-4">
                  <Button variant="ghost" size="md" className="font-bold px-6" onPress={close}>取消</Button>
                  <Button
                    variant={confirmModal.type === 'restore' ? 'primary' : 'danger'}
                    size="md"
                    className="font-bold px-10 shadow-lg"
                    onPress={() => {
                      handleConfirmAction();
                    }}
                    isPending={restoreMutation.isPending || deleteMutation.isPending || cleanupMutation.isPending}
                  >
                    确认
                  </Button>
                </ModalFooter>
              </>
            )}
          </ModalDialog>
        </ModalContainer>
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
