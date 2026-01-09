import { useState } from 'react'
import { Button, Chip, TextField, InputGroup } from '@heroui/react'
import VirtualizedTable from '@/components/VirtualizedTable'
import { Pencil, Play, ArrowRotateLeft, Text, CircleInfo, Check } from '@gravity-ui/icons'
import { mediaApi, MediaFile } from '@/api/media'
import { useQuery, useMutation } from '@tanstack/react-query'
import clsx from 'clsx'

export default function Renamer() {
  const [template, setTemplate] = useState('{title}.S{season:02d}E{episode:02d}.{ext}')
  const [selectedKeys, setSelectedKeys] = useState<any>(new Set([]))
  const [previewMap, setPreviewMap] = useState<Record<string, string>>({})
  const [lastExecuted, setLastExecuted] = useState(false)

  const { data: files, refetch: refetchFiles } = useQuery({
    queryKey: ['files'],
    queryFn: () => mediaApi.getFiles({ file_type: 'video', page_size: 100 })
  })

  const selectedIds = Array.from(selectedKeys) as string[]

  const renameMutation = useMutation({
    mutationFn: mediaApi.batchRename,
    onSuccess: (res, variables) => {
      if (variables.preview) {
        const mapping: Record<string, string> = {}
        // @ts-ignore
        const previewData = res.data?.preview || res.preview || []
        previewData.forEach((p: any) => mapping[p.file_id] = p.new_name)
        setPreviewMap(mapping)
      } else {
        setLastExecuted(true)
        setPreviewMap({})
        refetchFiles()
      }
    }
  })

  const handlePreview = () => {
    if (selectedIds.length === 0) return
    renameMutation.mutate({
      file_ids: selectedIds,
      template,
      preview: true,
    })
  }

  const handleRename = () => {
    if (selectedIds.length === 0) return
    renameMutation.mutate({
      file_ids: selectedIds,
      template,
      preview: false,
    })
  }

  const columns = [
    {
      title: '原始文件名',
      dataIndex: 'name',
      key: 'name',
      width: 400,
      render: (text: string) => <span className="font-bold text-[13px] text-foreground/90">{text}</span>
    },
    {
      title: '预览新名称',
      key: 'new_name',
      width: 400,
      render: (_: any, record: MediaFile) => {
        const newName = previewMap[record.id]
        if (!newName) return <span className="text-default-400 italic text-[11px] opacity-60">尚未生成预览</span>
        const isChanged = newName !== record.name
        return (
          <div className="flex items-center gap-2.5">
            <span className={clsx("font-mono text-[12px] tracking-tight", isChanged ? "text-primary font-bold" : "text-default-500/80")}>
              {newName}
            </span>
            {isChanged && (
              <div className="flex items-center gap-1.5 px-2 py-0.5 bg-primary/5 rounded-md border border-primary/10 animate-in fade-in zoom-in duration-300">
                <Check className="w-[10px] h-[10px] text-primary/80" />
                <span className="text-[9px] font-black uppercase text-primary/80 tracking-tighter">Changed</span>
              </div>
            )}
          </div>
        )
      },
    },
  ]

  return (
    <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-3 duration-500">
      <div className="flex flex-col gap-6 pt-2 pb-4">
        <div className="flex items-center gap-4">
          <div className="p-2.5 bg-primary/5 rounded-2xl text-primary border border-primary/10 shadow-sm">
            <Pencil className="w-[22px] h-[22px]" />
          </div>
          <div className="flex flex-col gap-1">
            <h2 className="text-[18px] font-black tracking-tight text-foreground">批量重命名</h2>
            <p className="text-[11px] text-default-400 font-medium">使用预设模板快速重命名多个媒体文件。</p>
          </div>
        </div>

        <div className="flex flex-col gap-7 ml-12">
          <div className="flex flex-col gap-4">
            <div className="flex justify-between items-center px-1">
              <span className="text-[10px] font-black text-default-400/70 uppercase tracking-[0.2em]">命名模板</span>
              <span className="text-[9px] text-primary/50 font-bold uppercase tracking-wider">Auto-update enabled</span>
            </div>
            <TextField
              value={template}
              onChange={setTemplate}
              aria-label="Name Template"
            >
              <InputGroup className="bg-default-50/50 rounded-2xl border border-divider/10 shadow-sm overflow-hidden focus-within:ring-2 ring-primary/20 transition-all h-12">
                <InputGroup.Prefix className="pl-4">
                  <Text className="w-[18px] h-[18px] text-default-400" />
                </InputGroup.Prefix>
                <InputGroup.Input
                  placeholder="{title}.S{season:02d}E{episode:02d}.{ext}"
                  className="font-mono text-[14px] px-3 tracking-tight placeholder:text-default-400/40"
                />
              </InputGroup>
            </TextField>
            <div className="flex flex-wrap gap-2 px-1">
              {['{title}', '{year}', '{season:02d}', '{episode:02d}', '{ext}'].map(v => (
                <button
                  key={v}
                  onClick={() => setTemplate(t => t + v)}
                  className="px-3 py-1.5 bg-default-50/50 hover:bg-default-100 text-[10px] text-default-500 font-bold font-mono rounded-xl border border-divider/10 transition-all active:scale-95 shadow-sm"
                >
                  {v}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <Button
              onPress={handlePreview}
              size="md"
              isDisabled={!files?.files?.length || selectedIds.length === 0}
              className="font-bold border border-divider/10 px-6 bg-default-50/50 hover:bg-default-100/80 flex items-center gap-2.5 transition-all shadow-sm"
            >
              <CircleInfo className="w-[16px] h-[16px]" />
              预览变更
            </Button>
            <Button
              variant="primary"
              size="md"
              onPress={handleRename}
              isPending={renameMutation.isPending && !renameMutation.variables?.preview}
              isDisabled={!files?.files?.length || selectedIds.length === 0}
              className="font-bold shadow-md shadow-primary/20 px-8 flex items-center gap-2.5 transition-all hover:scale-[1.02] active:scale-[0.98]"
            >
              <Play className="w-[16px] h-[16px]" />
              提交重命名
            </Button>
            {lastExecuted && (
              <a href="/logs" className="ml-auto">
                <Button
                  variant="ghost"
                  size="sm"
                  className="font-bold text-warning flex items-center gap-2 hover:bg-warning/5 border-warning/10"
                >
                  <ArrowRotateLeft className="w-[14px] h-[14px]" />
                  查看日志以撤销
                </Button>
              </a>
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-5 border-t border-divider/5 pt-8">
        <div className="flex justify-between items-center w-full px-1">
          <div className="flex items-center gap-3">
            <h3 className="text-[10px] font-black text-default-400/70 uppercase tracking-[0.2em]">待重命名列表</h3>
            <span className="text-[10px] text-default-300 font-medium">|</span>
            <span className="text-[10px] text-default-400 font-bold">{files?.files?.length || 0} ITEMS FOUND</span>
          </div>
          {selectedIds.length > 0 && (
            <Chip color="accent" variant="soft" size="sm" className="font-black h-5 text-[9px] px-2.5 rounded-lg animate-in fade-in slide-in-from-right-2">
              SELECTED {selectedIds.length}
            </Chip>
          )}
        </div>
        <div className="h-[600px]">
          <VirtualizedTable<MediaFile>
            columns={columns}
            dataSource={files?.files || []}
            height={600}
            selectionMode="multiple"
            selectedKeys={selectedKeys}
            onSelectionChange={setSelectedKeys}
          />
        </div>
      </div>
    </div>
  )
}
