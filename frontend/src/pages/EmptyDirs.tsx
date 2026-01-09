
import { useState } from 'react'
import { Button, Select, SelectTrigger, SelectValue, SelectIndicator, SelectPopover, Tooltip, ModalRoot, ModalHeader, ModalBody, ModalFooter, ModalContainer, ModalDialog, ModalBackdrop, InputGroup, ListBox, Label, TextField } from "@heroui/react";
import clsx from 'clsx';
import { TrashBin, ArrowRotateLeft, Folder, CircleExclamation, Layers, ChevronDown } from '@gravity-ui/icons'
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

  const handleDelete = (path: string) => {
    setConfirmModal({ isOpen: true, paths: [path] })
  }

  const handleDeleteAll = () => {
    if (!data?.dirs || data.dirs.length === 0) return
    const dirs = data.dirs.map((d) => d.path)
    setConfirmModal({ isOpen: true, paths: dirs })
  }

  const handleConfirmDelete = () => {
    if (confirmModal.paths.length > 0) {
      deleteMutation.mutate(confirmModal.paths)
    }
  }

  return (
    <div className="flex flex-col gap-4 animate-in fade-in slide-in-from-bottom-3 duration-500">
      <div className="flex flex-col gap-5 pt-2 pb-4">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 bg-warning/5 rounded-lg text-warning/80 shadow-sm border border-warning/10">
            <Layers className="w-[16px] h-[16px]" />
          </div>
          <div className="flex flex-col">
            <h2 className="text-[16px] font-black tracking-tight text-foreground/90 uppercase">空目录清理</h2>
            <p className="text-[11px] text-default-400 font-medium">查找并删除空文件夹，保持文件系统的整洁。</p>
          </div>
        </div>

        <div className="flex flex-col gap-6 ml-9">
          <div className="flex flex-wrap items-end gap-3 px-1">
            <TextField
              value={directory}
              onChange={setDirectory}
              className="max-w-xs"
            >
              <Label className="text-[11px] font-black text-default-400 uppercase tracking-widest ml-1 mb-2">扫描根目录</Label>
              <InputGroup>
                <InputGroup.Prefix className="pl-3">
                  <Folder className="w-[15px] h-[15px] text-default-400" />
                </InputGroup.Prefix>
                <InputGroup.Input
                  aria-label="扫描根目录"
                  placeholder="留空则从当前目录开始"
                  className="bg-default-100/40 border border-divider/10 hover:bg-default-100/60 transition-all rounded-xl h-11 px-3 text-[13px] font-medium"
                />
              </InputGroup>
            </TextField>

            <Select
              value={category}
              onChange={(val) => setCategory(val as string)}
              className="max-w-[180px]"
            >
              <Label className="text-[11px] font-black text-default-400 uppercase tracking-widest ml-1 mb-2">类别过滤</Label>
              <SelectTrigger className="bg-default-100/40 border border-divider/10 hover:bg-default-100/60 transition-all rounded-xl h-11 px-3">
                <SelectValue className="text-[13px] font-medium" />
                <SelectIndicator>
                  <ChevronDown className="w-[14px] h-[14px] text-default-400" />
                </SelectIndicator>
              </SelectTrigger>
              <SelectPopover className="min-w-[180px]">
                <ListBox>
                  <ListBox.Item id="all" textValue="所有类别" className="text-[13px] font-medium py-2">所有类别</ListBox.Item>
                  <ListBox.Item id="cache" textValue="缓存目录 (Cache)" className="text-[13px] font-medium py-2">缓存目录 (Cache)</ListBox.Item>
                  <ListBox.Item id="build" textValue="构建产物 (Build)" className="text-[13px] font-medium py-2">构建产物 (Build)</ListBox.Item>
                  <ListBox.Item id="system" textValue="系统目录 (System)" className="text-[13px] font-medium py-2">系统目录 (System)</ListBox.Item>
                  <ListBox.Item id="other" textValue="其他 (Other)" className="text-[13px] font-medium py-2">其他 (Other)</ListBox.Item>
                </ListBox>
              </SelectPopover>
            </Select>

            <Button
              variant="primary"
              size="md"
              onPress={handleFind}
              isPending={isLoading}
              className="font-bold shadow-md ml-2 flex items-center gap-2"
            >
              {!isLoading && <ArrowRotateLeft className="w-[15px] h-[15px]" />}
              重新扫描
            </Button>

            {data && data.dirs.length > 0 && (
              <Button
                onPress={handleDeleteAll}
                size="md"
                className="font-bold bg-danger/5 hover:bg-danger/10 border border-danger/10 text-danger"
              >
                <TrashBin className="w-[15px] h-[15px]" />
                清理全部 ({data.total})
              </Button>
            )}
          </div>

          {data && (
            <div className="flex gap-2 flex-wrap items-center pt-2">
              <div className="text-[10px] font-black text-default-400/70 uppercase tracking-widest mr-2">实时统计</div>
              {Object.entries(data.by_category || {}).map(([cat, count]) => (
                <div key={cat} className="flex items-center gap-2 px-2.5 h-6 bg-default-100/40 border border-divider/10 rounded-lg">
                  <span className="text-[9px] font-black text-default-500 uppercase tracking-tighter">{cat}: {count}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {data && data.dirs.length > 0 && (
        <div className="flex flex-col gap-4 border-t border-divider/5 pt-6">
          <h3 className="text-[10px] font-black text-default-400/70 uppercase tracking-[0.2em] px-1">空目录列表</h3>
          <div className="rounded-2xl border border-divider/10 overflow-hidden bg-default-50/10 shadow-sm">
            <div className="w-full overflow-hidden">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-default-100/30 text-default-400 font-black uppercase text-[9px] tracking-[.15em] h-11 border-b border-divider/5">
                    <th className="px-5">路径</th>
                    <th className="px-5 w-[120px]">类别</th>
                    <th className="px-5 w-[100px]">深度</th>
                    <th className="px-5 w-[100px] text-right">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-divider/5">
                  {data.dirs.map((dir) => (
                    <tr key={dir.path} className="hover:bg-default-100/40 transition-colors group">
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div className="p-1 px-1.5 bg-default-100/80 rounded-lg border border-divider/20 text-default-400 shadow-sm">
                            <Folder className="w-[14px] h-[14px]" />
                          </div>
                          <span className="text-[12px] font-mono text-foreground/80 font-bold max-w-[400px] truncate">{dir.path}</span>
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <div className={clsx("flex items-center gap-2 px-2.5 h-5 w-fit rounded-lg border text-[9px] font-black uppercase tracking-tighter",
                          dir.category === 'system' ? 'bg-danger/5 border-danger/10 text-danger/80' :
                            dir.category === 'cache' ? 'bg-warning/5 border-warning/10 text-warning/80' :
                              dir.category === 'build' ? 'bg-primary/5 border-primary/10 text-primary/80' : 'bg-default-100/50 border-divider/10 text-default-400')}>
                          {dir.category === 'system' ? 'System' :
                            dir.category === 'cache' ? 'Cache' :
                              dir.category === 'build' ? 'Build' : 'Other'}
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <span className="font-mono text-[11px] text-default-400/80 font-black">{dir.depth}</span>
                      </td>
                      <td className="px-5 py-4 text-right">
                        <Tooltip>
                          <Button
                            isIconOnly
                            size="sm"
                            variant="ghost"
                            onPress={() => handleDelete(dir.path)}
                            className="bg-danger/5 hover:bg-danger/10 border border-danger/10 text-danger shadow-sm"
                          >
                            <TrashBin className="w-[14px] h-[14px]" />
                          </Button>
                          <Tooltip.Content className="text-[10px] font-bold py-1 px-2">删除此目录</Tooltip.Content>
                        </Tooltip>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      <ModalRoot isOpen={confirmModal.isOpen} onOpenChange={(open) => !open && setConfirmModal({ ...confirmModal, isOpen: false })}>
        <ModalBackdrop variant="blur" />
        <ModalContainer size="md" scroll="inside">
          <ModalDialog>
            <ModalHeader className="flex gap-2.5 items-center text-danger pb-2">
              <div className="p-1.5 bg-danger/5 rounded-lg border border-danger/10">
                <CircleExclamation className="w-[18px] h-[18px]" />
              </div>
              <h2 className="text-[16px] font-black tracking-tight">确认删除目录</h2>
            </ModalHeader>
            <ModalBody className="py-2">
              <div className="flex flex-col gap-4">
                <p className="font-bold text-[13px] text-default-600 leading-relaxed">确定要永久删除选中的 <span className="text-danger font-black">{confirmModal.paths?.length || 0}</span> 个目录吗？此操作无法撤销。</p>
                <div className="max-h-48 overflow-y-auto bg-default-100/50 p-3 rounded-2xl text-[11px] font-mono text-default-500 border border-divider/5 flex flex-col gap-1.5">
                  {confirmModal.paths?.map(p => <div key={p} className="truncate px-1 italic">› {p}</div>)}
                </div>
              </div>
            </ModalBody>
            <ModalFooter className="flex gap-3 pt-4">
              <Button variant="ghost" size="md" className="font-bold px-6" onPress={() => setConfirmModal({ ...confirmModal, isOpen: false })}>取消</Button>
              <Button
                variant="danger"
                size="md"
                onPress={handleConfirmDelete}
                isPending={deleteMutation.isPending}
                className="font-bold px-10 shadow-lg shadow-danger/10"
              >
                确认清理
              </Button>
            </ModalFooter>
          </ModalDialog>
        </ModalContainer>
      </ModalRoot>
    </div>
  )
}
