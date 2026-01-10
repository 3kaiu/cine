import { useState, useEffect } from 'react'
import { Modal, Button, Input, TextArea, Skeleton, TextField, Label, InputGroup } from "@heroui/react";
import { mediaApi, MovieNfo } from '@/api/media'
import { useQuery, useMutation } from '@tanstack/react-query'
import { CircleInfo, Pencil, FloppyDisk } from '@gravity-ui/icons'

interface NfoEditorProps {
  fileId: string
  visible: boolean
  onClose: () => void
}

export default function NfoEditor({ fileId, visible, onClose }: NfoEditorProps) {
  const [formData, setFormData] = useState<Partial<MovieNfo>>({})

  const { data: nfo, isLoading, isError } = useQuery({
    queryKey: ['nfo', fileId],
    queryFn: async () => {
      const res = await mediaApi.getNfo(fileId)
      return res
    },
    enabled: visible && !!fileId
  })

  useEffect(() => {
    if (nfo) {
      setFormData(nfo)
    }
  }, [nfo])

  const mutation = useMutation({
    mutationFn: (values: MovieNfo) => mediaApi.updateNfo(fileId, values),
    onSuccess: () => {
      onClose()
    }
  })

  const handleSave = () => {
    if (formData.title) {
      mutation.mutate(formData as MovieNfo)
    }
  }

  const handleChange = (key: keyof MovieNfo, value: string) => {
    setFormData(prev => ({ ...prev, [key]: value }))
  }

  return (
    <Modal isOpen={visible} onOpenChange={(open) => !open && onClose()}>
      <Modal.Backdrop variant="blur" />
      <Modal.Container size="lg" scroll="inside">
        <Modal.Dialog className="max-h-[90vh]">
          <Modal.CloseTrigger />
          <Modal.Header className="flex flex-col gap-1 pb-2">
            <div className="flex items-center gap-2.5">
              <div className="p-1.5 bg-primary/5 rounded-lg text-primary border border-primary/10">
                <Pencil className="w-[18px] h-[18px]" />
              </div>
              <h2 className="text-[16px] font-black tracking-tight text-foreground/90 uppercase">编辑 NFO 元数据</h2>
            </div>
            <p className="text-[11px] text-default-400 font-medium ml-10">精准编辑元数据，确保媒体库信息完美契合。</p>
          </Modal.Header>

          <Modal.Body className="px-6 py-4 overflow-hidden flex flex-col min-h-[450px]">
            {isLoading ? (
              <div className="flex flex-col gap-6 py-4">
                <div className="space-y-2">
                  <div className="h-3 w-16 bg-default-100 rounded-full animate-pulse" />
                  <Skeleton className="rounded-xl h-11 w-full" />
                </div>
                <div className="space-y-2">
                  <div className="h-3 w-16 bg-default-100 rounded-full animate-pulse" />
                  <Skeleton className="rounded-xl h-11 w-full" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <div className="h-3 w-16 bg-default-100 rounded-full animate-pulse" />
                    <Skeleton className="rounded-xl h-11 w-full" />
                  </div>
                  <div className="space-y-2">
                    <div className="h-3 w-16 bg-default-100 rounded-full animate-pulse" />
                    <Skeleton className="rounded-xl h-11 w-full" />
                  </div>
                </div>
              </div>
            ) : isError ? (
              <div className="py-12 px-6 text-center flex flex-col items-center gap-4 bg-danger/5 rounded-3xl border border-danger/10 my-4 shadow-sm shadow-danger/5">
                <div className="w-12 h-12 rounded-2xl bg-danger/10 flex items-center justify-center text-danger border border-danger/10">
                  <CircleInfo className="w-[24px] h-[24px]" />
                </div>
                <div className="flex flex-col gap-1">
                  <p className="text-[14px] font-black text-danger/90">未找到 NFO 文件</p>
                  <p className="text-[11px] text-danger/60 font-medium max-w-[240px]">请先对该视频文件执行刮削操作以生成基础元数据。</p>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-6 py-2 overflow-y-auto scrollbar-hide">
                <TextField
                  value={formData.title || ''}
                  onChange={(v) => handleChange('title', v)}
                  isRequired
                  isInvalid={!formData.title && mutation.isPending}
                  fullWidth
                  className="flex-1"
                >
                  <Label className="text-[11px] font-black text-default-400/80 uppercase tracking-widest ml-1 mb-2">主标题</Label>
                  <InputGroup>
                    <InputGroup.Prefix className="pl-3">
                      <Pencil className="w-[14px] h-[14px] text-default-400" />
                    </InputGroup.Prefix>
                    <InputGroup.Input
                      aria-label="标题"
                      placeholder="例如：流浪地球"
                      className="bg-default-100/50 border-divider/10 hover:bg-default-100/80 transition-all rounded-xl h-11 text-[13px] font-medium px-4"
                    />
                  </InputGroup>
                </TextField>

                <div className="grid grid-cols-2 gap-5">
                  <TextField
                    value={formData.originaltitle || ''}
                    onChange={(v) => handleChange('originaltitle', v)}
                    fullWidth
                  >
                    <Label className="text-[11px] font-black text-default-400/80 uppercase tracking-widest ml-1 mb-2">原始名称</Label>
                    <InputGroup>
                      <InputGroup.Prefix className="pl-3">
                        <CircleInfo className="w-[14px] h-[14px] text-default-400" />
                      </InputGroup.Prefix>
                      <InputGroup.Input
                        aria-label="原名"
                        placeholder="原名（通常为英文或各语种原名）"
                        className="bg-default-100/50 border-divider/10 hover:bg-default-100/80 transition-all rounded-xl h-11 text-[13px] font-medium px-4"
                      />
                    </InputGroup>
                  </TextField>
                  <TextField
                    value={formData.year?.toString() || ''}
                    onChange={(v) => handleChange('year', v)}
                    fullWidth
                  >
                    <Label className="text-[11px] font-black text-default-400/80 uppercase tracking-widest ml-1 mb-2">发行年份</Label>
                    <InputGroup>
                      <InputGroup.Prefix className="pl-3">
                        <CircleInfo className="w-[14px] h-[14px] text-default-400" />
                      </InputGroup.Prefix>
                      <InputGroup.Input
                        aria-label="年份"
                        placeholder="2025"
                        type="number"
                        className="bg-default-100/50 border-divider/10 hover:bg-default-100/80 transition-all rounded-xl h-11 text-[13px] font-medium px-4"
                      />
                    </InputGroup>
                  </TextField>
                </div>

                <TextField
                  value={formData.rating?.toString() || ''}
                  onChange={(v) => handleChange('rating', v)}
                  fullWidth
                >
                  <Label className="text-[11px] font-black text-default-400/80 uppercase tracking-widest ml-1 mb-2">影片评分</Label>
                  <Input
                    placeholder="8.5"
                    type="number"
                    step="0.1"
                    className="bg-default-100/50 border-divider/10 hover:bg-default-100/80 transition-all rounded-xl h-11 text-[13px] font-medium px-4"
                  />
                </TextField>

                <TextField
                  value={formData.plot || ''}
                  onChange={(v) => handleChange('plot', v)}
                  fullWidth
                >
                  <Label className="text-[11px] font-black text-default-400/80 uppercase tracking-widest ml-1 mb-2">剧情简介</Label>
                  <TextArea
                    placeholder="在此输入影片的详细剧情介绍..."
                    className="bg-default-100/50 border-divider/10 hover:bg-default-100/80 transition-all rounded-2xl p-4 text-[13px] font-medium leading-relaxed min-h-[120px]"
                    rows={4}
                  />
                </TextField>

                <TextField
                  value={formData.tmdbid?.toString() || ''}
                  onChange={(v) => handleChange('tmdbid', v)}
                  fullWidth
                >
                  <Label className="text-[11px] font-black text-default-400/80 uppercase tracking-widest ml-1 mb-2">TMDB 标识符</Label>
                  <Input
                    placeholder="123456"
                    className="bg-default-100/50 border-divider/10 hover:bg-default-100/80 transition-all rounded-xl h-11 text-[13px] font-medium px-4"
                  />
                </TextField>
              </div>
            )}
          </Modal.Body>

          <Modal.Footer className="border-t border-divider/5 px-6 py-4 flex justify-end gap-3">
            <Button
              variant="ghost"
              size="md"
              className="font-bold border border-divider/10"
              onPress={onClose}
            >
              取消
            </Button>
            <Button
              variant="primary"
              size="md"
              className="font-bold flex items-center gap-2 shadow-lg shadow-primary/10"
              onPress={handleSave}
              isPending={mutation.isPending}
              isDisabled={isError || isLoading}
            >
              {!mutation.isPending && <FloppyDisk className="w-[14px] h-[14px]" />}
              保存变更
            </Button>
          </Modal.Footer>
        </Modal.Dialog>
      </Modal.Container>
    </Modal>
  )
}
