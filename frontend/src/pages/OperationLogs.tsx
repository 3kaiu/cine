
import { Card, CardBody, CardHeader, Button, Table, TableHeader, TableColumn, TableBody, TableRow, TableCell, Chip, Divider, Tooltip, Modal, ModalContent, ModalHeader, ModalBody, ModalFooter } from "@heroui/react";
import { Clock, RefreshCw, RotateCcw, Trash2, Edit2, FileText, AlertTriangle } from 'react-feather'
import { mediaApi, OperationLog } from '@/api/media'
import { useQuery, useMutation } from '@tanstack/react-query'
import dayjs from 'dayjs'
import { useState } from "react";

export default function OperationLogs() {
  const [confirmUndo, setConfirmUndo] = useState<{ isOpen: boolean, logId: string | null }>({ isOpen: false, logId: null })

  const { data: logs, refetch, isPending } = useQuery<OperationLog[]>({
    queryKey: ['operation-logs'],
    queryFn: async () => {
      const res = await mediaApi.listOperationLogs()
      return res
    }
  })

  const undoMutation = useMutation({
    mutationFn: (id: string) => mediaApi.undoOperation(id),
    onSuccess: () => {
      refetch()
      setConfirmUndo({ isOpen: false, logId: null })
    }
  })

  const getActionIcon = (action: string) => {
    switch (action) {
      case 'rename': return <Edit2 size={16} className="text-primary" />
      case 'trash': return <Trash2 size={16} className="text-warning" />
      case 'restore': return <RotateCcw size={16} className="text-success" />
      case 'delete': return <Trash2 size={16} className="text-danger" />
      default: return <FileText size={16} className="text-default-500" />
    }
  }

  const getActionLabel = (action: string) => {
    switch (action) {
      case 'rename': return <Chip size="sm" color="primary" variant="flat">Rename</Chip>
      case 'trash': return <Chip size="sm" color="warning" variant="flat">Trash</Chip>
      case 'restore': return <Chip size="sm" color="success" variant="flat">Restore</Chip>
      case 'delete': return <Chip size="sm" color="danger" variant="flat">Delete</Chip>
      default: return <Chip size="sm" variant="flat">{action}</Chip>
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader className="flex justify-between items-center">
          <div className="flex gap-3 items-center">
            <div className="p-2 bg-default-100 rounded-lg text-default-600">
              <Clock size={24} />
            </div>
            <div className="flex flex-col">
              <p className="text-md font-bold">Operation Logs</p>
              <p className="text-small text-default-500">Audit trail of file operations and system actions.</p>
            </div>
          </div>
          <Button
            variant="light"
            onPress={() => refetch()}
            isLoading={isPending}
            startContent={<RefreshCw size={18} />}
            isIconOnly
          />
        </CardHeader>
        <Divider />
        <CardBody className="p-0">
          <Table aria-label="Operation Logs" removeWrapper>
            <TableHeader>
              <TableColumn>ACTION</TableColumn>
              <TableColumn>PATH CHANGES</TableColumn>
              <TableColumn>TIME</TableColumn>
              <TableColumn>ACTIONS</TableColumn>
            </TableHeader>
            <TableBody emptyContent="No logs found.">
              {(logs || []).map((log: OperationLog) => (
                <TableRow key={log.id}>
                  <TableCell>
                    <div className="flex gap-2 items-center">
                      {getActionIcon(log.action)}
                      {getActionLabel(log.action)}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1 text-xs">
                      <div className="flex gap-2 items-center text-default-500">
                        <span className="w-8">From:</span>
                        <span className="font-mono break-all line-clamp-1" title={log.old_path}>{log.old_path}</span>
                      </div>
                      {log.new_path && (
                        <div className="flex gap-2 items-center">
                          <span className="w-8 text-primary">To:</span>
                          <span className="font-mono font-bold break-all line-clamp-1" title={log.new_path}>{log.new_path}</span>
                        </div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="text-xs text-default-500">{dayjs(log.created_at).format('YYYY-MM-DD HH:mm:ss')}</span>
                  </TableCell>
                  <TableCell>
                    {log.action === 'rename' && (
                      <Tooltip content="Undo Rename">
                        <span
                          className="text-warning cursor-pointer active:opacity-50"
                          onClick={() => setConfirmUndo({ isOpen: true, logId: log.id })}
                        >
                          <RotateCcw size={18} />
                        </span>
                      </Tooltip>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardBody>
      </Card>

      <Modal isOpen={confirmUndo.isOpen} onClose={() => setConfirmUndo({ isOpen: false, logId: null })}>
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader className="flex gap-2 items-center">
                <AlertTriangle className="text-warning" />
                Confirm Undo
              </ModalHeader>
              <ModalBody>
                <p>Are you sure you want to undo this rename operation?</p>
                <p className="text-small text-default-500">The system will attempt to restore the file to its original name.</p>
              </ModalBody>
              <ModalFooter>
                <Button variant="light" onPress={onClose}>Cancel</Button>
                <Button
                  color="warning"
                  onPress={() => confirmUndo.logId && undoMutation.mutate(confirmUndo.logId)}
                  isLoading={undoMutation.isPending}
                >
                  Undo Rename
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>
    </div>
  )
}
