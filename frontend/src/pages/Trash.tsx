import { useState } from 'react'
import { Card, CardBody, CardHeader, Button, Table, TableHeader, TableColumn, TableBody, TableRow, TableCell, Chip, Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, Divider, Tooltip } from "@heroui/react";
import { Trash2, RotateCcw, AlertTriangle, XSquare } from 'react-feather'
import { mediaApi } from '@/api/media'
import { useQuery, useMutation } from '@tanstack/react-query'
import LoadingWrapper from '@/components/LoadingWrapper'
import { handleError } from '@/utils/errorHandler'

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
  const [selectedRowKeys, setSelectedRowKeys] = useState<string[]>([]) // Use Set for better performance if huge, but array is fine for UI lib compat
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    type: 'restore' | 'delete' | 'cleanup' | null;
    count: number;
    targetId?: string; // If single action
  }>({ isOpen: false, type: null, count: 0 });

  const { data, refetch, isPending } = useQuery<TrashData>({
    queryKey: ['trash'],
    queryFn: mediaApi.listTrash
  })



  const restoreMutation = useMutation({
    mutationFn: mediaApi.restoreFromTrash,
    onSuccess: () => {
      setSelectedRowKeys([])
      refetch()
      setConfirmModal({ ...confirmModal, isOpen: false })
    },
    onError: (error: any) => handleError(error, 'Restore failed'),
  })

  const deleteMutation = useMutation({
    mutationFn: mediaApi.permanentlyDelete,
    onSuccess: () => {
      setSelectedRowKeys([])
      refetch()
      setConfirmModal({ ...confirmModal, isOpen: false })
    },
    onError: (error: any) => handleError(error, 'Deletion failed'),
  })

  const cleanupMutation = useMutation({
    mutationFn: mediaApi.cleanupTrash,
    onSuccess: () => {
      refetch()
      setConfirmModal({ ...confirmModal, isOpen: false })
    },
    onError: (error: any) => handleError(error, 'Cleanup failed'),
  })

  const handleBatchRestore = () => {
    setConfirmModal({ isOpen: true, type: 'restore', count: selectedRowKeys.length })
  }

  const handleBatchDelete = () => {
    setConfirmModal({ isOpen: true, type: 'delete', count: selectedRowKeys.length })
  }

  const handleCleanup = () => {
    setConfirmModal({ isOpen: true, type: 'cleanup', count: 0 })
  }

  const handleConfirmAction = async () => {
    const { type, targetId } = confirmModal;
    if (type === 'restore') {
      if (targetId) {
        restoreMutation.mutate({ file_id: targetId })
      } else {
        // Batch
        for (const id of selectedRowKeys) {
          await mediaApi.restoreFromTrash({ file_id: id }).catch(() => { })
        }
        refetch();
        setSelectedRowKeys([]);
        setConfirmModal({ ...confirmModal, isOpen: false })
      }
    } else if (type === 'delete') {
      if (targetId) {
        deleteMutation.mutate(targetId)
      } else {
        // Batch
        for (const id of selectedRowKeys) {
          await mediaApi.permanentlyDelete(id).catch(() => { })
        }
        refetch();
        setSelectedRowKeys([]);
        setConfirmModal({ ...confirmModal, isOpen: false })
      }
    } else if (type === 'cleanup') {
      cleanupMutation.mutate()
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader className="flex gap-3">
          <div className="p-2 bg-danger/10 rounded-lg text-danger">
            <Trash2 size={24} />
          </div>
          <div className="flex flex-col">
            <p className="text-md font-bold">Trash Bin</p>
            <p className="text-small text-default-500">Manage deleted files. Items are kept for 30 days by default.</p>
          </div>
        </CardHeader>
        <Divider />
        <CardBody className="gap-4">
          <div className="flex justify-between items-center">
            <div className="flex gap-4">
              <Button
                onPress={handleBatchRestore}
                isDisabled={selectedRowKeys.length === 0}
                color="primary"
                startContent={<RotateCcw size={18} />}
              >
                Restore Selected ({selectedRowKeys.length})
              </Button>
              <Button
                onPress={handleBatchDelete}
                isDisabled={selectedRowKeys.length === 0}
                color="danger"
                variant="flat"
                startContent={<XSquare size={18} />}
              >
                Delete Permanently
              </Button>
            </div>

            <Button
              onPress={handleCleanup}
              color="warning"
              variant="light"
              startContent={<Trash2 size={18} />}
            >
              Empty Trash
            </Button>
          </div>
        </CardBody>
      </Card>

      <Card className="flex-1">
        <LoadingWrapper loading={isPending}>
          {/* Note: HeroUI Table selection handling needs to match keys. */}
          <Table
            aria-label="Trash Items"
            selectionMode="multiple"
            selectedKeys={new Set(selectedRowKeys)}
            onSelectionChange={(keys) => setSelectedRowKeys(Array.from(keys) as string[])}
            removeWrapper
          >
            <TableHeader>
              <TableColumn>ORIGINAL NAME</TableColumn>
              <TableColumn>SIZE</TableColumn>
              <TableColumn>TYPE</TableColumn>
              <TableColumn>DELETED AT</TableColumn>
              <TableColumn>ACTIONS</TableColumn>
            </TableHeader>
            <TableBody emptyContent="Trash is empty.">
              {(data?.items || []).map((item) => (
                <TableRow key={item.id}>
                  <TableCell>
                    <span className="font-medium text-sm">{item.original_name}</span>
                  </TableCell>
                  <TableCell>
                    <span className="font-mono text-xs text-default-500">{formatSize(item.file_size)}</span>
                  </TableCell>
                  <TableCell>
                    <Chip size="sm" variant="flat">{item.file_type}</Chip>
                  </TableCell>
                  <TableCell>
                    <span className="text-xs text-default-500">{new Date(item.deleted_at).toLocaleString()}</span>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Tooltip content="Restore">
                        <span
                          className="text-primary cursor-pointer active:opacity-50"
                          onClick={() => setConfirmModal({ isOpen: true, type: 'restore', count: 1, targetId: item.id })}
                        >
                          <RotateCcw size={18} />
                        </span>
                      </Tooltip>
                      <Tooltip content="Delete Forever" color="danger">
                        <span
                          className="text-danger cursor-pointer active:opacity-50"
                          onClick={() => setConfirmModal({ isOpen: true, type: 'delete', count: 1, targetId: item.id })}
                        >
                          <XSquare size={18} />
                        </span>
                      </Tooltip>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </LoadingWrapper>
      </Card>

      {/* Confirmation Modal */}
      <Modal isOpen={confirmModal.isOpen} onClose={() => setConfirmModal({ ...confirmModal, isOpen: false })}>
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader className="flex gap-1 items-center">
                <AlertTriangle className="text-warning" size={24} />
                Confirm Action
              </ModalHeader>
              <ModalBody>
                <p>
                  {confirmModal.type === 'restore' && `Are you sure you want to restore ${confirmModal.count} item(s)?`}
                  {confirmModal.type === 'delete' && `Are you sure you want to PERMANENTLY delete ${confirmModal.count} item(s)? This cannot be undone.`}
                  {confirmModal.type === 'cleanup' && `Are you sure you want to empty the trash bin? All items will be lost forever.`}
                </p>
              </ModalBody>
              <ModalFooter>
                <Button variant="light" onPress={onClose}>Cancel</Button>
                <Button
                  color={confirmModal.type === 'restore' ? "primary" : "danger"}
                  onPress={handleConfirmAction}
                  isLoading={restoreMutation.isPending || deleteMutation.isPending || cleanupMutation.isPending}
                >
                  Confirm
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
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

  return `${size.toFixed(2)} ${units[unitIndex]} `
}
