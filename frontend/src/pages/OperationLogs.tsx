import { useState, useMemo } from 'react'
import { Button, Tooltip, Modal, SearchField, Select, ListBox } from "@heroui/react";
import clsx from 'clsx';
import { ArrowsRotateRight, ArrowRotateLeft, TrashBin, Pencil, File } from '@gravity-ui/icons'
import { mediaApi, OperationLog } from '@/api/media'
import { useQuery, useMutation } from '@tanstack/react-query'
import PageHeader from '@/components/PageHeader'
import StatCard from '@/components/StatCard'
import VirtualizedTable from '@/components/VirtualizedTable'
import { Icon } from '@iconify/react'
import dayjs from 'dayjs'

export default function OperationLogs() {
  const [confirmUndo, setConfirmUndo] = useState<{ isOpen: boolean, logId: string | null }>({ isOpen: false, logId: null })
  const [searchTerm, setSearchTerm] = useState('')
  const [actionFilter, setActionFilter] = useState<string>('all')
  const [selectedLogs, setSelectedLogs] = useState<string[]>([])
  const [confirmDelete, setConfirmDelete] = useState<{ isOpen: boolean, logIds: string[] }>({ isOpen: false, logIds: [] })
  const [detailModal, setDetailModal] = useState<{ isOpen: boolean, log: OperationLog | null }>({ isOpen: false, log: null })

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

  const deleteMutation = useMutation({
    mutationFn: (_ids: string[]) => {
      return Promise.resolve()
    },
    onSuccess: () => {
      refetch()
      setSelectedLogs([])
      setConfirmDelete({ isOpen: false, logIds: [] })
    }
  })

  const filteredLogs = useMemo(() => {
    if (!logs) return []
    let result = [...logs]
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase()
      result = result.filter(log =>
        log.old_path.toLowerCase().includes(term) ||
        (log.new_path && log.new_path.toLowerCase().includes(term))
      )
    }
    if (actionFilter !== 'all') {
      result = result.filter(log => log.action === actionFilter)
    }
    return result
  }, [logs, searchTerm, actionFilter])

  const stats = useMemo(() => {
    if (!logs) return { total: 0, rename: 0, trash: 0, restore: 0, delete: 0 }
    return {
      total: logs.length,
      rename: logs.filter(l => l.action === 'rename').length,
      trash: logs.filter(l => l.action === 'trash').length,
      restore: logs.filter(l => l.action === 'restore').length,
      delete: logs.filter(l => l.action === 'delete').length,
    }
  }, [logs])

  const getActionIcon = (action: string) => {
    switch (action) {
      case 'rename': return <Pencil className="w-[14px] h-[14px] text-primary/70" />
      case 'trash': return <TrashBin className="w-[14px] h-[14px] text-warning/70" />
      case 'restore': return <ArrowRotateLeft className="w-[14px] h-[14px] text-success/70" />
      case 'delete': return <TrashBin className="w-[14px] h-[14px] text-danger/70" />
      default: return <File className="w-[14px] h-[14px] text-default-400" />
    }
  }

  const getActionLabel = (action: string) => {
    const labels: Record<string, { color: "primary" | "warning" | "success" | "danger" | "default", text: string }> = {
      rename: { color: "primary", text: "重命名" },
      trash: { color: "warning", text: "移入回收站" },
      restore: { color: "success", text: "还原" },
      delete: { color: "danger", text: "永久删除" },
    }
    const config = labels[action] || { color: "default", text: action }
    return (
      <div className={clsx("flex items-center px-1.5 h-5 rounded border text-[9px] font-black uppercase tracking-tighter",
        config.color === 'primary' ? 'bg-primary/5 border-primary/10 text-primary/80' :
          config.color === 'warning' ? 'bg-warning/5 border-warning/10 text-warning/80' :
            config.color === 'success' ? 'bg-success/5 border-success/10 text-success/80' :
              config.color === 'danger' ? 'bg-danger/5 border-danger/10 text-danger/80' : 'bg-default-100/50 border-divider/10 text-default-400')}>
        {config.text}
      </div>
    )
  }

  // 表格列定义
  const columns = useMemo(() => [
    {
      title: '动作',
      dataIndex: 'action',
      width: 160,
      render: (action: string) => (
        <div className="flex gap-2.5 items-center">
          <div className="p-1 px-1.5 bg-default-100/50 rounded-md border border-divider/10">
            {getActionIcon(action)}
          </div>
          {getActionLabel(action)}
        </div>
      )
    },
    {
      title: '路径变更',
      dataIndex: 'old_path',
      render: (_: any, record: OperationLog) => (
        <div className="flex flex-col gap-1 max-w-[400px]">
          <div className="flex gap-2 items-center text-[10px] text-default-400/80 font-mono">
            <span className="w-6 shrink-0 font-black opacity-50 text-[8px] tracking-tighter uppercase">FROM</span>
            <span className="truncate" title={record.old_path}>{record.old_path}</span>
          </div>
          {record.new_path && (
            <div className="flex gap-2 items-center text-[10px] font-mono">
              <span className="w-6 shrink-0 font-black text-primary/60 text-[8px] tracking-tighter uppercase">TO</span>
              <span className="font-bold text-foreground/80 truncate" title={record.new_path}>{record.new_path}</span>
            </div>
          )}
        </div>
      )
    },
    {
      title: '执行时间',
      dataIndex: 'created_at',
      width: 180,
      render: (created_at: string) => (
        <span className="text-[11px] text-default-400 font-mono font-medium">{dayjs(created_at).format('YYYY-MM-DD HH:mm:ss')}</span>
      )
    },
    {
      title: '操作',
      dataIndex: 'id',
      width: 80,
      render: (_: any, record: OperationLog) => (
        <div className="flex gap-1">
          <Button
            isIconOnly
            size="sm"
            variant="ghost"
            onPress={() => setDetailModal({ isOpen: true, log: record })}
          >
            <Icon icon="mdi:eye" className="w-[13px] h-[13px] text-default-400" />
          </Button>
          {record.action === 'rename' && (
            <Tooltip closeDelay={0}>
              <Button
                isIconOnly
                size="sm"
                variant="ghost"
                onPress={() => setConfirmUndo({ isOpen: true, logId: record.id })}
                className="bg-warning/5 hover:bg-warning/10 border border-warning/10 text-warning"
              >
                <ArrowRotateLeft className="w-[13px] h-[13px] text-warning/80" />
              </Button>
              <Tooltip.Content>
                撤销重命名
              </Tooltip.Content>
            </Tooltip>
          )}
        </div>
      )
    }
  ], [])

  return (
    <div className="flex flex-col gap-4 animate-in fade-in slide-in-from-bottom-3 duration-500">
      <PageHeader
        title="操作日志"
        description="记录文件操作和系统行为的审计轨迹"
        actions={
          <>
            {selectedLogs.length > 0 && (
              <Button
                variant="danger"
                size="md"
                onPress={() => setConfirmDelete({ isOpen: true, logIds: selectedLogs })}
                className="font-medium"
              >
                <TrashBin className="w-[14px] h-[14px]" />
                删除 ({selectedLogs.length})
              </Button>
            )}
            <Button
              variant="ghost"
              size="md"
              onPress={() => refetch()}
              isPending={isPending}
              className="font-medium border border-divider/10 bg-default-50/50 shadow-sm transition-all flex items-center gap-2"
            >
              {!isPending && <ArrowsRotateRight className="w-[14px] h-[14px]" />}
              刷新日志
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <StatCard
          label="总日志"
          value={stats.total}
          icon={<File className="w-6 h-6" />}
          color="primary"
          description="所有操作日志数量"
        />
        <StatCard
          label="重命名"
          value={stats.rename}
          icon={<Pencil className="w-6 h-6" />}
          color="primary"
          description="文件重命名操作"
        />
        <StatCard
          label="移入回收站"
          value={stats.trash}
          icon={<TrashBin className="w-6 h-6" />}
          color="warning"
          description="删除到回收站"
        />
        <StatCard
          label="恢复操作"
          value={stats.restore}
          icon={<ArrowRotateLeft className="w-6 h-6" />}
          color="success"
          description="从回收站恢复"
        />
      </div>

      <div className="flex flex-col gap-4 border-t border-divider/5 pt-4">
        <div className="flex items-center justify-between">
          <h3 className="text-[10px] font-semibold text-default-400/70 uppercase tracking-widest px-1">审计轨迹</h3>
          <div className="flex gap-2 items-center">
            <SearchField
              className="w-[240px]"
              value={searchTerm}
              onChange={setSearchTerm}
            >
              <SearchField.Group>
                <SearchField.SearchIcon />
                <SearchField.Input placeholder="搜索路径..." />
                <SearchField.ClearButton />
              </SearchField.Group>
            </SearchField>
            <Select
              selectedKey={actionFilter}
              onSelectionChange={(keys) => {
                if (!keys) return
                const selected = Array.isArray(Array.from(keys as any))
                  ? Array.from(keys as any)[0] as string
                  : keys as string
                if (selected) {
                  setActionFilter(selected)
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
                  <ListBox.Item key="all">全部</ListBox.Item>
                  <ListBox.Item key="rename">重命名</ListBox.Item>
                  <ListBox.Item key="trash">移入回收站</ListBox.Item>
                  <ListBox.Item key="restore">还原</ListBox.Item>
                  <ListBox.Item key="delete">永久删除</ListBox.Item>
                </ListBox>
              </Select.Popover>
            </Select>
          </div>
        </div>
        <div className="rounded-2xl border border-divider/10 overflow-hidden bg-background/5">
          {filteredLogs.length === 0 ? (
            <div className="py-8 text-center text-[11px] text-default-400">暂无操作记录。</div>
          ) : (
            <VirtualizedTable<OperationLog>
              dataSource={filteredLogs}
              columns={columns}
              height={400}
              rowHeight={60}
              loading={isPending}
            />
          )}
        </div>
      </div>

      <Modal isOpen={confirmUndo.isOpen} onOpenChange={(open) => setConfirmUndo({ ...confirmUndo, isOpen: open })}>
        <Modal.Backdrop />
        <Modal.Container>
          <Modal.Dialog>
            <Modal.Header className="flex flex-col gap-1">确认撤销</Modal.Header>
            <Modal.Body>
              <p>确定要撤销此操作吗？这将尝试恢复文件到原来的状态。</p>
            </Modal.Body>
            <Modal.Footer>
              <Button variant="ghost" size="md" onPress={() => setConfirmUndo({ ...confirmUndo, isOpen: false })} className="font-bold">取消</Button>
              <Button
                variant="ghost"
                size="md"
                onPress={() => confirmUndo.logId && undoMutation.mutate(confirmUndo.logId)}
                isPending={undoMutation.isPending}
                className="font-bold bg-warning/10 text-warning"
              >
                确认并撤销
              </Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal>

      <Modal isOpen={detailModal.isOpen} onOpenChange={(open) => setDetailModal({ ...detailModal, isOpen: open })}>
        <Modal.Backdrop />
        <Modal.Container>
          <Modal.Dialog>
            <Modal.Header>日志详情</Modal.Header>
            <Modal.Body>
              {detailModal.log && (
                <div className="flex flex-col gap-4">
                  <div>
                    <p className="text-xs text-default-500 mb-1">操作类型</p>
                    <div className="flex items-center gap-2">
                      {getActionIcon(detailModal.log.action)}
                      {getActionLabel(detailModal.log.action)}
                    </div>
                  </div>
                  <div>
                    <p className="text-xs text-default-500 mb-1">原始路径</p>
                    <p className="text-sm font-mono bg-default-100 p-2 rounded">{detailModal.log.old_path}</p>
                  </div>
                  {detailModal.log.new_path && (
                    <div>
                      <p className="text-xs text-default-500 mb-1">新路径</p>
                      <p className="text-sm font-mono bg-default-100 p-2 rounded">{detailModal.log.new_path}</p>
                    </div>
                  )}
                  <div>
                    <p className="text-xs text-default-500 mb-1">执行时间</p>
                    <p className="text-sm">{dayjs(detailModal.log.created_at).format('YYYY-MM-DD HH:mm:ss')}</p>
                  </div>
                </div>
              )}
            </Modal.Body>
            <Modal.Footer>
              <Button variant="ghost" size="md" onPress={() => setDetailModal({ ...detailModal, isOpen: false })}>关闭</Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal>

      <Modal isOpen={confirmDelete.isOpen} onOpenChange={(open) => setConfirmDelete({ ...confirmDelete, isOpen: open })}>
        <Modal.Backdrop />
        <Modal.Container>
          <Modal.Dialog>
            <Modal.Header>确认删除</Modal.Header>
            <Modal.Body>
              <p>确定要删除选中的 {confirmDelete.logIds.length} 条日志吗？此操作无法撤销。</p>
            </Modal.Body>
            <Modal.Footer>
              <Button variant="ghost" size="md" className="font-medium px-6" onPress={() => setConfirmDelete({ ...confirmDelete, isOpen: false })}>取消</Button>
              <Button
                variant="danger"
                size="md"
                onPress={() => deleteMutation.mutate(confirmDelete.logIds)}
                isPending={deleteMutation.isPending}
              >
                确认删除
              </Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal>
    </div>
  )
}
