import { useState, useCallback } from 'react'
import { Button, Chip, TextField, InputGroup } from "@heroui/react";

import {
  FolderOpen,
  Magnifier,
  Thunderbolt,
  Text,
  ChevronRight,
  ArrowRotateLeft,
  ArrowsRotateRight,
  Clock,
} from '@gravity-ui/icons'
import { mediaApi, MediaFile } from '@/api/media'
import { useQuery, useMutation } from '@tanstack/react-query'
import ProgressMonitor from '@/components/ProgressMonitor'
import VirtualizedTable from '@/components/VirtualizedTable'
import { handleError } from '@/utils/errorHandler'
import { debounce } from 'lodash-es'
import SubtitleHub from '@/components/SubtitleHub'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'

dayjs.extend(relativeTime)

export default function Scanner() {
  const [directory, setDirectory] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [scanning, setScanning] = useState(false)
  const [taskId, setTaskId] = useState<string | undefined>(undefined)
  const [currentPage] = useState(1)
  const [pageSize] = useState(50)
  const [subtitleFileId, setSubtitleFileId] = useState<string | null>(null)

  const { data: history, refetch: refetchHistory } = useQuery({
    queryKey: ['scan-history'],
    queryFn: async () => {
      const res = await mediaApi.listScanHistory()
      return res
    }
  })

  const { data, refetch, isPending } = useQuery({
    queryKey: ['files', { page: currentPage, page_size: pageSize, name: searchTerm }],
    queryFn: () => mediaApi.getFiles({ page: currentPage, page_size: pageSize, name: searchTerm }),
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  })

  // 搜索防抖
  const debouncedSearch = useCallback(
    debounce((value: string) => {
      setSearchTerm(value)
    }, 500),
    []
  )

  const scanMutation = useMutation({
    mutationFn: mediaApi.scanDirectory,
    onSuccess: (data) => {
      setScanning(true)
      setTaskId(data.task_id)
      refetchHistory()
    },
    onError: (error: any) => {
      handleError(error, 'Scan failed')
      setScanning(false)
    },
  })

  const handleScan = () => {
    if (!directory.trim()) {
      return
    }
    scanMutation.mutate({
      directory: directory.trim(),
      recursive: true,
      file_types: ['video', 'audio', 'image'],
    })
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
      title: '类型',
      dataIndex: 'file_type',
      key: 'file_type',
      width: 100,
      render: (type: string) => (
        <Chip size="sm" variant="soft" color={type === 'video' ? 'accent' : type === 'audio' ? 'warning' : 'default'} className="font-black px-2">
          {type.toUpperCase()}
        </Chip>
      )
    },
    {
      title: '大小',
      dataIndex: 'size',
      key: 'size',
      width: 120,
      render: (size: number) => <span className="text-default-400 font-mono text-[11px] font-medium tracking-tight">{formatSize(size)}</span>,
    },
    {
      title: '画质',
      key: 'quality',
      width: 250,
      render: (_: any, record: MediaFile) => (
        <div className="flex gap-1.5 flex-wrap">
          {record.quality_score !== undefined && (
            <Chip size="sm" color={record.quality_score > 70 ? 'success' : 'warning'} variant="soft" className="font-black px-2">
              {record.quality_score}
            </Chip>
          )}
          {record.video_info?.is_dolby_vision && <Chip size="sm" color="warning" variant="soft" className="font-black px-2">DV</Chip>}
          {record.video_info?.is_hdr10_plus && <Chip size="sm" color="warning" variant="soft" className="font-black px-2">HDR10+</Chip>}
          {record.video_info?.is_hdr && !record.video_info?.is_dolby_vision && <Chip size="sm" color="warning" variant="soft" className="font-black px-2">HDR</Chip>}
          {record.video_info?.source && <Chip size="sm" variant="soft" className="font-black px-2">{record.video_info.source}</Chip>}
          {record.video_info?.has_chinese_subtitle && <Chip size="sm" color="accent" variant="soft" className="font-black px-2">中字</Chip>}
        </div>
      )
    },
    {
      title: '操作',
      key: 'action',
      width: 100,
      render: (_: any, record: MediaFile) => (
        <Button
          size="sm"
          variant="ghost"
          onPress={() => setSubtitleFileId(record.id)}
          className="font-bold border border-divider/10 bg-default-50/50 hover:bg-default-100 flex items-center gap-1.5 transition-all"
        >
          <Text className="w-[12px] h-[12px] text-default-400" />
          字幕
        </Button>
      )
    },
  ]


  return (
    <div className="flex flex-col gap-4 animate-in fade-in slide-in-from-bottom-3 duration-500">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="col-span-2 flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-4">
              <div className="p-2.5 bg-primary/5 rounded-2xl text-primary border border-primary/10 shadow-sm">
                <ArrowRotateLeft className="w-[14px] h-[14px]" />
              </div>
              <div className="flex flex-col gap-1">
                <h2 className="text-[18px] font-black tracking-tight text-foreground">本地扫描器</h2>
                <p className="text-[11px] text-default-400 font-medium">指定目录快速索引。支持自动质量评估与媒体信息提取。</p>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-4 ml-14">
            <div className="flex gap-4">
              <TextField
                className="w-full"
                aria-label="Scan Directory"
                value={directory}
                onChange={setDirectory}
              >
                <InputGroup className="bg-default-50/50 rounded-xl border border-divider/10 shadow-sm focus-within:ring-2 ring-primary/20 transition-all h-10 overflow-hidden">
                  <InputGroup.Prefix className="pl-3">
                    <FolderOpen className="w-[18px] h-[18px] text-default-400" />
                  </InputGroup.Prefix>
                  <InputGroup.Input
                    placeholder="例如: /data/media/movies"
                    className="text-[13px] px-3 tracking-tight placeholder:text-default-400/40"
                    value={directory}
                    onChange={(e) => setDirectory(e.target.value)}
                  />
                </InputGroup>
              </TextField>
              <Button
                variant="primary"
                size="lg"
                onPress={handleScan}
                isPending={scanning || scanMutation.isPending}
                data-loading={scanning || scanMutation.isPending ? "true" : "false"}
                className="font-bold shadow-md shadow-primary/20 px-8 flex items-center gap-2.5 transition-all hover:scale-[1.02] active:scale-[0.98]"
              >
                {(!scanning && !scanMutation.isPending) && <Thunderbolt className="w-[18px] h-[18px]" />}
                开始扫描
              </Button>
            </div>

            <div className="flex flex-col gap-3">
              <div className="flex justify-between items-center px-1">
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
                  <span className="text-[10px] font-black text-default-400/70 uppercase tracking-[0.2em]">实时任务监控</span>
                </div>
                <span className="text-[9px] text-primary/40 font-bold uppercase tracking-wider">WebSocket Connected</span>
              </div>
              {(scanning || taskId) && (
                <div className="p-4 bg-default-50/30 rounded-2xl border border-divider/5 shadow-sm">
                  <ProgressMonitor taskId={taskId} />
                </div>
              )}
            </div>
          </div>
        </div>

        {history && history.length > 0 && (
          <div className="flex flex-col gap-5 bg-default-50/20 p-6 rounded-3xl border border-divider/5 shadow-sm backdrop-blur-sm self-start">
            <div className="flex items-center gap-3 px-1">
              <Clock className="w-[16px] h-[16px] text-default-400" />
              <h3 className="text-[10px] font-black text-default-400/70 uppercase tracking-[0.2em]">最近扫描历史</h3>
            </div>
            <div className="space-y-3 overflow-y-auto max-h-[350px] pr-2 scrollbar-hide">
              {history.map((item: any) => (
                <button
                  key={item.directory}
                  onClick={() => setDirectory(item.directory)}
                  className="flex flex-col gap-2.5 p-4 rounded-2xl bg-background border border-divider/5 hover:border-primary/20 hover:bg-default-50/50 cursor-pointer transition-all group text-left w-full shadow-sm hover:shadow-md"
                >
                  <div className="flex justify-between items-start gap-4">
                    <span className="text-[12px] font-bold text-foreground/80 group-hover:text-primary transition-colors line-clamp-1 break-all" title={item.directory}>
                      {item.directory === "/" ? "根目录" : item.directory.split("/").pop() || "根目录"}
                    </span>
                    <span className="text-[9px] text-default-400/60 font-medium whitespace-nowrap shrink-0 mt-0.5">{dayjs(item.timestamp).fromNow()}</span>
                  </div>
                  <div className="flex justify-between items-end">
                    <div className="flex gap-2 items-center">
                      <div className="px-2 py-0.5 rounded-md bg-default-100 text-[10px] font-black text-default-500">
                        {item.total_files} <span className="text-[9px] font-bold text-default-400 ml-0.5">FILES</span>
                      </div>
                    </div>
                    <ChevronRight className="w-[14px] h-[14px] text-default-300 group-hover:text-primary/50 transition-colors transform group-hover:translate-x-0.5 transition-transform" />
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-4 pt-4 mt-4 border-t border-divider/5">
        <div className="flex justify-between items-center w-full px-1">
          <div className="flex items-center gap-3">
            <h2 className="text-[10px] font-black text-default-400/70 uppercase tracking-[0.2em]">媒体库概览</h2>
            <span className="text-[10px] text-default-300 font-medium">|</span>
            <Chip color="accent" variant="soft" size="sm" className="font-black px-2.5">
              {(data?.total || 0).toLocaleString()} 总文件数
            </Chip>
          </div>
          <div className="flex gap-3 w-full max-w-[400px]">
            <TextField
              aria-label="Search Files"
              onChange={debouncedSearch}
              className="flex-1"
            >
              <InputGroup className="bg-default-50/50 rounded-xl border border-divider/10 shadow-sm focus-within:ring-2 ring-primary/20 transition-all overflow-hidden h-10">
                <InputGroup.Prefix className="pl-3">
                  <Magnifier className="w-[14px] h-[14px] text-default-400" />
                </InputGroup.Prefix>
                <InputGroup.Input
                  placeholder="快速定位文件名..."
                  className="text-[12px] tracking-tight placeholder:text-default-400/50 px-2 flex-1 outline-none"
                />
              </InputGroup>
            </TextField>
            <Button
              isIconOnly
              size="md"
              variant="ghost"
              className="bg-default-50/50 hover:bg-default-100/80 transition-all border border-divider/10 shadow-sm"
              onPress={() => refetch()}
            >
              <ArrowsRotateRight className="w-[16px] h-[16px] text-default-500" />
            </Button>
          </div>
        </div>
        <div className="h-[600px] mt-2">
          <VirtualizedTable<MediaFile>
            columns={columns}
            dataSource={data?.files || []}
            height={600}
            rowHeight={52}
            loading={isPending}
          />
        </div>
      </div>

      <SubtitleHub
        fileId={subtitleFileId || ''}
        visible={!!subtitleFileId}
        onClose={() => setSubtitleFileId(null)}
      />
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
