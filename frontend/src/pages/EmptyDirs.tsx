import { useState } from 'react'
import { Card, CardBody, CardHeader, Button, Table, TableHeader, TableColumn, TableBody, TableRow, TableCell, Chip, Input, Select, SelectItem, Divider, Tooltip, Modal, ModalContent, ModalHeader, ModalBody, ModalFooter } from "@heroui/react";
import { Trash2, RefreshCw, Folder, AlertTriangle, Layers } from 'react-feather'
import { mediaApi } from '@/api/media'
import { useQuery, useMutation } from '@tanstack/react-query'
import { handleError } from '@/utils/errorHandler'

interface EmptyDirInfo {
  path: string
  category: string
  depth: number
}

interface EmptyDirsData {
  dirs: EmptyDirInfo[]
  total: number
  by_category: Record<string, number>
}

export default function EmptyDirs() {
  const [directory, setDirectory] = useState('')
  const [category, setCategory] = useState<string>('all')
  const [confirmModal, setConfirmModal] = useState<{ isOpen: boolean, paths: string[] }>({ isOpen: false, paths: [] })

  const { data, refetch, isLoading } = useQuery<EmptyDirsData>({
    queryKey: ['empty-dirs', directory, category],
    queryFn: () => {
      const params: any = {}
      if (directory) params.directory = directory
      if (category && category !== 'all') params.category = category
      return mediaApi.findEmptyDirs(params)
    },
    enabled: false,
  })

  const deleteMutation = useMutation({
    mutationFn: mediaApi.deleteEmptyDirs,
    onSuccess: () => {
      refetch()
      setConfirmModal({ isOpen: false, paths: [] })
    },
    onError: (error: any) => handleError(error, 'Deletion failed'),
  })

  const handleFind = () => {
    refetch()
  }

  const handleDelete = (paths: string[]) => {
    setConfirmModal({ isOpen: true, paths })
  }

  const handleDeleteAll = () => {
    if (!data?.dirs || data.dirs.length === 0) return
    const dirs = data.dirs.map((d) => d.path)
    handleDelete(dirs)
  }

  const handleConfirmDelete = () => {
    deleteMutation.mutate(confirmModal.paths)
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader className="flex gap-3">
          <div className="p-2 bg-warning/10 rounded-lg text-warning">
            <Layers size={24} />
          </div>
          <div className="flex flex-col">
            <p className="text-md font-bold">Empty Directory Cleaner</p>
            <p className="text-small text-default-500">Find and remove empty folders to keep your filesystem clean.</p>
          </div>
        </CardHeader>
        <Divider />
        <CardBody className="gap-4">
          <div className="flex flex-wrap items-end gap-4">
            <Input
              label="Root Directory"
              placeholder="Leave empty for current root"
              value={directory}
              onValueChange={setDirectory}
              startContent={<Folder size={16} className="text-default-400" />}
              className="max-w-xs"
            />
            <Select
              label="Category Filter"
              placeholder="All Categories"
              selectedKeys={[category]}
              onSelectionChange={(keys) => setCategory(Array.from(keys)[0] as string)}
              className="max-w-xs"
            >
              <SelectItem key="all">All Categories</SelectItem>
              <SelectItem key="cache">Cache</SelectItem>
              <SelectItem key="build">Build Artifacts</SelectItem>
              <SelectItem key="system">System Folders</SelectItem>
              <SelectItem key="other">Other</SelectItem>
            </Select>
            <Button
              color="primary"
              onPress={handleFind}
              isLoading={isLoading}
              startContent={<RefreshCw size={18} />}
            >
              Scan Folders
            </Button>

            {data && data.dirs.length > 0 && (
              <Button
                color="danger"
                variant="flat"
                onPress={handleDeleteAll}
                startContent={<Trash2 size={18} />}
              >
                Delete All ({data.total})
              </Button>
            )}
          </div>

          {data && (
            <div className="flex gap-2 flex-wrap">
              <div className="text-sm text-default-500 mr-2 flex items-center">Found {data.total} empty folders:</div>
              {Object.entries(data.by_category || {}).map(([cat, count]) => (
                <Chip key={cat} size="sm" variant="flat">{cat}: {count}</Chip>
              ))}
            </div>
          )}
        </CardBody>
      </Card>

      {data && data.dirs.length > 0 && (
        <Card className="flex-1">
          <CardHeader><h3 className="font-bold">Empty Directories</h3></CardHeader>
          <Divider />
          <CardBody className="p-0">
            <Table aria-label="Empty Directories" removeWrapper>
              <TableHeader>
                <TableColumn>PATH</TableColumn>
                <TableColumn>CATEGORY</TableColumn>
                <TableColumn>DEPTH</TableColumn>
                <TableColumn>ACTION</TableColumn>
              </TableHeader>
              <TableBody>
                {data.dirs.map((dir) => (
                  <TableRow key={dir.path}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Folder size={16} className="text-default-400" />
                        <span className="text-small font-mono">{dir.path}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Chip
                        size="sm"
                        color={
                          dir.category === 'system' ? 'danger' :
                            dir.category === 'cache' ? 'warning' :
                              dir.category === 'build' ? 'primary' : 'default'
                        }
                        variant="flat"
                      >
                        {dir.category}
                      </Chip>
                    </TableCell>
                    <TableCell>{dir.depth}</TableCell>
                    <TableCell>
                      <Tooltip content="Delete Folder" color="danger">
                        <span
                          className="text-danger cursor-pointer active:opacity-50"
                          onClick={() => handleDelete([dir.path])}
                        >
                          <Trash2 size={18} />
                        </span>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardBody>
        </Card>
      )}

      <Modal isOpen={confirmModal.isOpen} onClose={() => setConfirmModal({ isOpen: false, paths: [] })}>
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader className="flex gap-2 items-center">
                <AlertTriangle className="text-warning" />
                Confirm Deletion
              </ModalHeader>
              <ModalBody>
                <p>Are you sure you want to delete {confirmModal.paths.length} folder(s)?</p>
                <div className="max-h-32 overflow-y-auto bg-default-100 p-2 rounded text-xs font-mono">
                  {confirmModal.paths.map(p => <div key={p}>{p}</div>)}
                </div>
              </ModalBody>
              <ModalFooter>
                <Button variant="light" onPress={onClose}>Cancel</Button>
                <Button color="danger" onPress={handleConfirmDelete} isLoading={deleteMutation.isPending}>Delete</Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>
    </div>
  )
}
