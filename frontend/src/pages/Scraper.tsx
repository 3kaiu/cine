import { useState } from 'react'
import { Button, Checkbox, ModalRoot as Modal, ModalHeader, ModalBody, ModalFooter, ModalContainer, ModalDialog, ModalBackdrop, Chip } from "@heroui/react";
import VirtualizedTable from '@/components/VirtualizedTable';
import {
  Cloud,
  Filmstrip,
  Magnifier,
  ArrowDownToLine,
  MagicWand,
  Pencil,
} from '@gravity-ui/icons'
import { mediaApi, MediaFile } from '@/api/media'
import { useQuery, useMutation } from '@tanstack/react-query'
import clsx from 'clsx'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import NfoEditor from '@/components/NfoEditor'

dayjs.extend(relativeTime)

export default function Scraper() {
  const [selectedFile, setSelectedFile] = useState<string | null>(null)
  const [source, setSource] = useState<string>('tmdb')
  const [downloadImages, setDownloadImages] = useState(true)
  const [generateNfo, setGenerateNfo] = useState(true)
  const [selectedFiles, setSelectedFiles] = useState<string[]>([])
  const [previewVisible, setPreviewVisible] = useState(false)
  const [previewMetadata, setPreviewMetadata] = useState<any>(null)
  const [editingFileId, setEditingFileId] = useState<string | null>(null)

  const { data: files, refetch, isPending } = useQuery({
    queryKey: ['files'],
    queryFn: () => mediaApi.getFiles({ file_type: 'video', page_size: 100 })
  })

  const currentFile = files?.files?.find((f: any) => f.id === selectedFile)

  // Mutations (Simplified error handling for brevity)
  const scrapeMutation = useMutation({
    mutationFn: mediaApi.scrapeMetadata,
    onSuccess: () => {
      refetch()
    }
  })

  const batchScrapeMutation = useMutation({
    mutationFn: mediaApi.batchScrapeMetadata,
    onSuccess: () => {
      refetch()
    }
  })

  const handleScrape = async (fileId: string, autoMatch: boolean = true) => {
    setSelectedFile(fileId)
    if (!autoMatch) {
      try {
        const result = await mediaApi.scrapeMetadata({
          file_id: fileId,
          source,
          auto_match: false,
          download_images: false,
          generate_nfo: false,
        })
        if (result.metadata && Array.isArray(result.metadata)) {
          setPreviewMetadata(result.metadata)
          setPreviewVisible(true)
          return
        }
      } catch (e) {
        // Silently fail to auto-match
      }
    }

    scrapeMutation.mutate({
      file_id: fileId,
      source,
      auto_match: autoMatch,
      download_images: downloadImages,
      generate_nfo: generateNfo,
    })
  }

  const handleBatchScrape = () => {
    if (selectedFiles.length === 0) return
    batchScrapeMutation.mutate({
      file_ids: selectedFiles,
      source,
      auto_match: true,
      download_images: downloadImages,
      generate_nfo: generateNfo,
    })
  }

  const handleSelectMetadata = (metadata?: any) => {
    if (!selectedFile) return

    scrapeMutation.mutate({
      file_id: selectedFile,
      source,
      auto_match: !metadata,
      download_images: downloadImages,
      generate_nfo: generateNfo,
      tmdb_id: metadata?.tmdb_id,
      douban_id: metadata?.douban_id,
    })
    setPreviewVisible(false)
  }

  const columns = [
    {
      title: '文件名',
      dataIndex: 'name',
      key: 'name',
      width: 400,
      render: (text: string) => <span className="font-bold text-foreground/90 text-[13px]">{text}</span>
    },
    {
      title: '大小',
      dataIndex: 'size',
      key: 'size',
      width: 100,
      render: (size: number) => <span className="text-default-400 font-mono text-[11px] font-medium">{formatSize(size)}</span>,
    },
    {
      title: '元数据状态',
      dataIndex: 'metadata',
      key: 'metadata',
      render: (metadata: any) => {
        if (!metadata) return <Chip size="sm" variant="soft" className="text-[10px] font-bold h-5">未刮削</Chip>
        try {
          const data = typeof metadata === 'string' ? JSON.parse(metadata) : metadata
          return (
            <div className="flex items-center gap-2">
              <Chip size="sm" color="success" variant="soft" className="text-[11px] font-bold h-6">{data.title || data.name}</Chip>
              {data.poster_url && <Filmstrip className="w-[12px] h-[12px] text-secondary/60" />}
              {data.rating && <span className="text-[11px] text-warning font-black tracking-tight flex items-center gap-0.5">★ {data.rating}</span>}
            </div>
          )
        } catch {
          return <Chip size="sm" color="accent" variant="soft" className="text-[10px] font-bold h-5">已刮削</Chip>
        }
      },
    },
    {
      title: '操作',
      key: 'action',
      width: 150,
      render: (_: any, record: MediaFile) => (
        <div className="flex gap-1.5 px-1">
          <Button
            size="sm"
            variant="ghost"
            onPress={() => handleScrape(record.id, true)}
            isPending={scrapeMutation.isPending && selectedFile === record.id}
            isIconOnly
            className="bg-primary/5 hover:bg-primary/10 border border-primary/10 text-primary"
          >
            <MagicWand className="w-[14px] h-[14px]" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onPress={() => handleScrape(record.id, false)}
            isPending={scrapeMutation.isPending && selectedFile === record.id}
            isIconOnly
            className="bg-default-100/50 border border-divider/10"
          >
            <Magnifier className="w-[14px] h-[14px]" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onPress={() => setEditingFileId(record.id)}
            isIconOnly
            className="bg-default-100/50 border border-divider/10"
          >
            <Pencil className="w-[14px] h-[14px]" />
          </Button>
        </div>
      ),
    },
  ]

  return (
    <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-3 duration-500">
      <div className="flex flex-col gap-6 pt-2 pb-4">
        <div className="flex items-center gap-4">
          <div className="p-2.5 bg-secondary/5 rounded-2xl text-secondary/80 shadow-sm border border-secondary/10">
            <Cloud className="w-[22px] h-[22px]" />
          </div>
          <div className="flex flex-col gap-1">
            <h2 className="text-[18px] font-black tracking-tight text-foreground">元数据刮削</h2>
            <p className="text-[11px] text-default-400 font-medium">从 TMDB/豆瓣获取信息并生成 NFO 文件</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-10 items-center ml-12">
          <div className="flex items-center gap-3">
            <span className="text-[10px] font-black text-default-400/70 uppercase tracking-[0.2em] flex items-center gap-2">
              <Filmstrip className="w-[16px] h-[16px]" /> 数据源
            </span>
            <div className="flex bg-default-100/40 p-1 rounded-xl border border-divider/10 shadow-sm h-11 items-center">
              {['tmdb', 'douban'].map((s) => (
                <button
                  key={s}
                  onClick={() => setSource(s)}
                  className={clsx(
                    "px-5 h-9 rounded-lg text-[11px] font-bold transition-all",
                    source === s
                      ? "bg-background text-foreground shadow-sm ring-1 ring-border/10"
                      : "text-default-400 hover:text-foreground/80"
                  )}
                >
                  {s === 'tmdb' ? 'TMDB' : '豆瓣'}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-6 h-11">
            <Checkbox
              isSelected={downloadImages}
              onChange={setDownloadImages}
            >
              <div className="text-[11px] font-bold text-default-400/80 uppercase tracking-tight">下载图片</div>
            </Checkbox>
            <Checkbox
              isSelected={generateNfo}
              onChange={setGenerateNfo}
            >
              <div className="text-[11px] font-bold text-default-400/80 uppercase tracking-tight">生成 NFO</div>
            </Checkbox>
          </div>

          {selectedFiles.length > 0 && (
            <div className="flex gap-2 animate-in fade-in zoom-in-95 duration-300">
              <Button
                variant="primary"
                size="md"
                onPress={handleBatchScrape}
                isPending={batchScrapeMutation.isPending}
                className="font-bold shadow-md shadow-primary/10 px-6 flex items-center gap-2.5 transition-all hover:scale-[1.02] active:scale-[0.98]"
              >
                {!batchScrapeMutation.isPending && <ArrowDownToLine className="w-[16px] h-[16px]" />}
                批量刮削 ({selectedFiles.length})
              </Button>
              <Button
                onPress={() => setSelectedFiles([])}
                variant="ghost"
                size="md"
                className="border border-divider/10 font-bold px-5 hover:bg-default-100/50"
              >
                取消
              </Button>
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-5 border-t border-divider/5 pt-8">
        <h3 className="text-[10px] font-black text-default-400/70 uppercase tracking-[0.2em] px-1">视频文件</h3>
        <div className="h-[600px]">
          <VirtualizedTable<MediaFile>
            columns={columns}
            dataSource={files?.files || []}
            height={600}
            rowHeight={56}
            loading={isPending}
            selectionMode="multiple"
            selectedKeys={new Set(selectedFiles)}
            onSelectionChange={(keys) => {
              if (keys === "all") {
                setSelectedFiles(files?.files?.map((f: any) => f.id) || [])
              } else {
                setSelectedFiles(Array.from(keys) as string[])
              }
            }}
          />
        </div>
      </div>

      <Modal isOpen={previewVisible} onOpenChange={setPreviewVisible}>
        <ModalBackdrop variant="blur" />
        <ModalContainer size="lg">
          <ModalDialog className="max-w-[80vw] h-[80vh]">
            {({ close }: any) => (
              <>
                <ModalHeader className="flex gap-1 items-center font-bold">
                  <MagicWand className="w-[18px] h-[18px] text-primary" />
                  手动刮削
                  {currentFile && <span className="text-default-400 text-sm font-normal ml-2">{(currentFile as any).title || currentFile.name}</span>}
                </ModalHeader>
                <ModalBody className="p-0 overflow-hidden">
                  <div className="flex h-full w-full">
                    <div className="w-[300px] border-r border-divider/50 flex flex-col bg-default-50/30 overflow-y-auto scrollbar-hide">
                      <div className="p-4 space-y-3">
                        {previewMetadata && Array.isArray(previewMetadata) && previewMetadata.map((item: any) => (
                          <button
                            key={item.tmdb_id || item.douban_id}
                            onClick={() => handleSelectMetadata(item)}
                            className="text-left w-full p-2.5 hover:bg-default-100 rounded-xl text-xs transition-colors border border-transparent hover:border-divider/10"
                          >
                            <div className="font-bold text-foreground/90">{item.title || item.name}</div>
                            <div className="text-[10px] text-default-500 mt-0.5">{item.year}</div>
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="flex-1 p-4 overflow-y-auto flex items-center justify-center text-default-400 text-[13px] font-medium bg-background/50">
                      请从左侧选择一个结果进行预览
                    </div>
                  </div>
                </ModalBody>
                <ModalFooter className="border-t border-divider/5">
                  <Button variant="ghost" className="font-bold" onPress={close}>
                    关闭
                  </Button>
                  <Button variant="primary" className="font-bold px-6" onPress={() => handleSelectMetadata()}>
                    自动匹配
                  </Button>
                </ModalFooter>
              </>
            )}
          </ModalDialog>
        </ModalContainer>
      </Modal>

      <NfoEditor
        fileId={editingFileId || ''}
        visible={!!editingFileId}
        onClose={() => setEditingFileId(null)}
      />
    </div>
  )
}

function formatSize(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let size = bytes
  let unitIndex = 0

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024
    unitIndex++
  }

  return `${size.toFixed(2)} ${units[unitIndex]}`
}
