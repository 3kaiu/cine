import { useState, useMemo } from 'react'
import { Card, CardBody, CardHeader, Button, Table, TableHeader, TableColumn, TableBody, TableRow, TableCell, Chip, Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, Input, Divider, Pagination, ScrollShadow } from "@heroui/react";
import { Folder, Copy, Trash2, Move, File, HardDrive, AlertTriangle } from 'react-feather'
import { mediaApi } from '@/api/media'
import { useQuery, useMutation } from '@tanstack/react-query'
import LoadingWrapper from '@/components/LoadingWrapper'
import { handleError } from '@/utils/errorHandler'

export default function FileManager() {
  const [selectedRowKeys, setSelectedRowKeys] = useState<string[]>([]) // IDs
  const [moveModalVisible, setMoveModalVisible] = useState(false)
  const [copyModalVisible, setCopyModalVisible] = useState(false)
  const [trashModalVisible, setTrashModalVisible] = useState(false)
  const [targetDir, setTargetDir] = useState('')
  const [page, setPage] = useState(1)

  const { data: filesData, refetch, isPending } = useQuery({
    queryKey: ['files', page],
    queryFn: () => mediaApi.getFiles({ page_size: 100, page: page }) // Ensure API supports page
  })

  const selectedFiles = useMemo(() => {
    return (filesData?.files || []).filter(f => selectedRowKeys.includes(f.id))
  }, [filesData, selectedRowKeys])

  const totalSelectedSize = useMemo(() => {
    return selectedFiles.reduce((sum, f) => sum + f.size, 0)
  }, [selectedFiles])

  // Mutations
  const moveMutation = useMutation({
    mutationFn: mediaApi.moveFile,
    onSuccess: () => {
      setMoveModalVisible(false)
      setTargetDir('')
      refetch()
    },
    onError: (error: any) => handleError(error, 'Move failed'),
  })

  const copyMutation = useMutation({
    mutationFn: mediaApi.copyFile,
    onSuccess: () => {
      setCopyModalVisible(false)
      setTargetDir('')
      refetch()
    },
    onError: (error: any) => handleError(error, 'Copy failed'),
  })

  const batchMoveMutation = useMutation({
    mutationFn: mediaApi.batchMoveFiles,
    onSuccess: () => {
      setMoveModalVisible(false)
      setTargetDir('')
      setSelectedRowKeys([])
      refetch()
    },
    onError: (error: any) => handleError(error, 'Batch move failed'),
  })

  const batchCopyMutation = useMutation({
    mutationFn: mediaApi.batchCopyFiles,
    onSuccess: () => {
      setCopyModalVisible(false)
      setTargetDir('')
      setSelectedRowKeys([])
      refetch()
    },
    onError: (error: any) => handleError(error, 'Batch copy failed'),
  })

  const handleMove = () => {
    if (!targetDir.trim()) return
    if (selectedRowKeys.length === 1) {
      moveMutation.mutate({ file_id: selectedRowKeys[0], target_dir: targetDir.trim() })
    } else {
      batchMoveMutation.mutate({ file_ids: selectedRowKeys, target_dir: targetDir.trim() })
    }
  }

  const handleCopy = () => {
    if (!targetDir.trim()) return
    if (selectedRowKeys.length === 1) {
      copyMutation.mutate({ file_id: selectedRowKeys[0], target_dir: targetDir.trim() })
    } else {
      batchCopyMutation.mutate({ file_ids: selectedRowKeys, target_dir: targetDir.trim() })
    }
  }

  const handleBatchTrash = async () => {
    // Batch trash isn't supported by backend as a single atomic op in the original code, but we can loop or use a batch endpoint if it exists. 
    // Original code looped. We'll loop here too inside the confirm handler.
    // But wait, the original code had a confirm dialog. We'll do that here too.

    let success = 0
    let failed = 0
    for (const id of selectedRowKeys) {
      try {
        await mediaApi.moveToTrash(id)
        success++
      } catch (e) {
        failed++
      }
    }
    setSelectedRowKeys([])
    refetch()
    setTrashModalVisible(false)
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader className="flex gap-3">
          <div className="p-2 bg-secondary/10 rounded-lg text-secondary">
            <HardDrive size={24} />
          </div>
          <div className="flex flex-col">
            <p className="text-md font-bold">File Manager</p>
            <p className="text-small text-default-500">Browse and manage your media library files.</p>
          </div>
        </CardHeader>
        <Divider />
        <CardBody className="gap-4">
          <div className="flex gap-4">
            <Button
              onPress={() => setMoveModalVisible(true)}
              isDisabled={selectedRowKeys.length === 0}
              color="primary"
              startContent={<Move size={18} />}
            >
              Move Selected
            </Button>
            <Button
              onPress={() => setCopyModalVisible(true)}
              isDisabled={selectedRowKeys.length === 0}
              variant="flat"
              startContent={<Copy size={18} />}
            >
              Copy Selected
            </Button>
            <Button
              onPress={() => setTrashModalVisible(true)}
              isDisabled={selectedRowKeys.length === 0}
              color="danger"
              variant="flat"
              startContent={<Trash2 size={18} />}
            >
              Move to Trash
            </Button>
          </div>
        </CardBody>
      </Card>

      <Card className="flex-1">
        <LoadingWrapper loading={isPending}>
          <Table
            aria-label="File List"
            selectionMode="multiple"
            selectedKeys={new Set(selectedRowKeys)}
            onSelectionChange={(keys) => setSelectedRowKeys(Array.from(keys) as string[])}
            bottomContent={
              filesData?.total ? (
                <div className="flex w-full justify-center">
                  <Pagination
                    isCompact
                    showControls
                    showShadow
                    color="primary"
                    page={page}
                    total={Math.ceil((filesData.total || 0) / (filesData.page_size || 100))}
                    onChange={(page) => setPage(page)}
                  />
                </div>
              ) : null
            }
          >
            <TableHeader>
              <TableColumn>NAME</TableColumn>
              <TableColumn>SIZE</TableColumn>
              <TableColumn>TYPE</TableColumn>
              <TableColumn>PATH</TableColumn>
            </TableHeader>
            <TableBody emptyContent="No files found.">
              {(filesData?.files || []).map((file) => (
                <TableRow key={file.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <File size={16} className="text-default-400" />
                      <span className="font-medium text-sm">{file.name}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="font-mono text-xs text-default-500">{formatSize(file.size)}</span>
                  </TableCell>
                  <TableCell>
                    <Chip size="sm" variant="flat">{file.file_type}</Chip>
                  </TableCell>
                  <TableCell>
                    <div className="truncate max-w-xs text-xs text-default-500" title={file.path}>
                      {file.path}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </LoadingWrapper>
      </Card>

      {/* Move/Copy Modal */}
      <Modal isOpen={moveModalVisible || copyModalVisible} onClose={() => { setMoveModalVisible(false); setCopyModalVisible(false) }}>
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader className="flex gap-2 items-center">
                {moveModalVisible ? <Move /> : <Copy />}
                {moveModalVisible ? 'Move Files' : 'Copy Files'}
              </ModalHeader>
              <ModalBody>
                <p className="text-sm text-default-500">Selected {selectedFiles.length} files ({formatSize(totalSelectedSize)})</p>
                <ScrollShadow className="max-h-32 border border-default-200 rounded-lg p-2">
                  {selectedFiles.map(f => (
                    <div key={f.id} className="text-xs py-1 line-clamp-1">{f.name}</div>
                  ))}
                </ScrollShadow>
                <Input
                  label="Target Directory"
                  placeholder="/absolute/path/to/target"
                  value={targetDir}
                  onValueChange={setTargetDir}
                  startContent={<Folder size={16} className="text-default-400" />}
                />
              </ModalBody>
              <ModalFooter>
                <Button variant="light" onPress={onClose}>Cancel</Button>
                <Button
                  color="primary"
                  onPress={moveModalVisible ? handleMove : handleCopy}
                  isLoading={moveMutation.isPending || batchMoveMutation.isPending || copyMutation.isPending || batchCopyMutation.isPending}
                >
                  {moveModalVisible ? 'Move' : 'Copy'}
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>

      {/* Trash Modal */}
      <Modal isOpen={trashModalVisible} onClose={() => setTrashModalVisible(false)}>
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader className="flex gap-2 items-center">
                <AlertTriangle className="text-warning" />
                Confirm Move to Trash
              </ModalHeader>
              <ModalBody>
                <p>Are you sure you want to move {selectedFiles.length} files to the trash?</p>
                <p className="text-xs text-default-500">Total size: {formatSize(totalSelectedSize)}</p>
                <ScrollShadow className="max-h-32 border border-default-200 rounded-lg p-2">
                  {selectedFiles.map(f => (
                    <div key={f.id} className="text-xs py-1 line-clamp-1">{f.name}</div>
                  ))}
                </ScrollShadow>
              </ModalBody>
              <ModalFooter>
                <Button variant="light" onPress={onClose}>Cancel</Button>
                <Button color="danger" onPress={handleBatchTrash}>Move to Trash</Button>
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

  return `${size.toFixed(2)} ${units[unitIndex]}`
}
