
import { Button, Tooltip, Modal } from "@heroui/react";
import clsx from 'clsx';
import { Clock, ArrowsRotateRight, ArrowRotateLeft, TrashBin, Pencil, File } from '@gravity-ui/icons'
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

  return (
    <div className="flex flex-col gap-4 animate-in fade-in slide-in-from-bottom-3 duration-500">
      <div className="flex justify-between items-center pt-2 pb-4">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 bg-default-100/80 rounded-lg text-default-400 shadow-sm border border-divider/10">
            <Clock className="w-[16px] h-[16px]" />
          </div>
          <div className="flex flex-col">
            <h2 className="text-[16px] font-bold tracking-tight text-foreground/90">操作日志</h2>
            <p className="text-[11px] text-default-400 font-medium">记录文件操作和系统行为的审计轨迹。</p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="md"
          onPress={() => refetch()}
          isPending={isPending}
          className="font-bold border border-divider/10 bg-default-50/50 shadow-sm transition-all flex items-center gap-2"
        >
          {!isPending && <ArrowsRotateRight className="w-[14px] h-[14px]" />}
          刷新日志
        </Button>
      </div>

      <div className="flex flex-col gap-4 border-t border-divider/5 pt-4">
        <h3 className="text-[10px] font-bold text-default-400/70 uppercase tracking-widest px-1">审计轨迹</h3>
        <div className="rounded-2xl border border-divider/10 overflow-hidden bg-background/5">
          <div className="w-full overflow-hidden">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-default-50/50 text-default-400 font-bold uppercase text-[9px] tracking-[.15em] h-10 border-b border-divider/5">
                  <th className="px-2 font-normal w-[160px]">动作</th>
                  <th className="px-2 font-normal">路径变更</th>
                  <th className="px-2 font-normal w-[180px]">执行时间</th>
                  <th className="px-2 font-normal w-[80px]">操作</th>
                </tr>
              </thead>
              <tbody>
                {(logs || []).length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-8 text-center text-[11px] text-default-400">暂无操作记录。</td>
                  </tr>
                ) : (
                  (logs || []).map((log: OperationLog) => (
                    <tr key={log.id} className="hover:bg-default-100/40 transition-colors border-b border-divider/5 last:border-0">
                      <td className="py-3 px-2">
                        <div className="flex gap-2.5 items-center">
                          <div className="p-1 px-1.5 bg-default-100/50 rounded-md border border-divider/10">
                            {getActionIcon(log.action)}
                          </div>
                          {getActionLabel(log.action)}
                        </div>
                      </td>
                      <td className="py-3 px-2">
                        <div className="flex flex-col gap-1 max-w-[400px]">
                          <div className="flex gap-2 items-center text-[10px] text-default-400/80 font-mono">
                            <span className="w-6 shrink-0 font-black opacity-50 text-[8px] tracking-tighter uppercase">FROM</span>
                            <span className="truncate" title={log.old_path}>{log.old_path}</span>
                          </div>
                          {log.new_path && (
                            <div className="flex gap-2 items-center text-[10px] font-mono">
                              <span className="w-6 shrink-0 font-black text-primary/60 text-[8px] tracking-tighter uppercase">TO</span>
                              <span className="font-bold text-foreground/80 truncate" title={log.new_path}>{log.new_path}</span>
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-2">
                        <span className="text-[11px] text-default-400 font-mono font-medium">{dayjs(log.created_at).format('YYYY-MM-DD HH:mm:ss')}</span>
                      </td>
                      <td className="py-3 px-2">
                        {log.action === 'rename' && (
                          <Tooltip closeDelay={0}>
                            <Button
                              isIconOnly
                              size="sm"
                              variant="ghost"
                              onPress={() => setConfirmUndo({ isOpen: true, logId: log.id })}
                              className="bg-warning/5 hover:bg-warning/10 border border-warning/10 text-warning"
                            >
                              <ArrowRotateLeft className="w-[13px] h-[13px] text-warning/80" />
                            </Button>
                            <Tooltip.Content>
                              撤销重命名
                            </Tooltip.Content>
                          </Tooltip>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <Modal isOpen={confirmUndo.isOpen} onOpenChange={(open) => setConfirmUndo({ ...confirmUndo, isOpen: open })}>
        <Modal.Backdrop />
        <Modal.Container>
          <Modal.Dialog>
            {({ close }) => (
              <>
                <Modal.Header className="flex flex-col gap-1">确认撤销</Modal.Header>
                <Modal.Body>
                  <p>确定要撤销此操作吗？这将尝试恢复文件到原来的状态。</p>
                </Modal.Body>
                <Modal.Footer>
                  <Button variant="ghost" size="md" onPress={close} className="font-bold">取消</Button>
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
              </>
            )}
          </Modal.Dialog>
        </Modal.Container>
      </Modal>
    </div>
  )
}
