import { useState, useCallback } from 'react'
import { Card, CardBody, CardHeader, Button, Input, Divider, Chip } from "@heroui/react";
import { Folder, Search, RefreshCw, Activity, Type } from 'react-feather'
import { mediaApi, MediaFile } from '@/api/media'
import { useQuery, useMutation } from '@tanstack/react-query'
import ProgressMonitor from '@/components/ProgressMonitor'
import VirtualizedTable from '@/components/VirtualizedTable'
import { handleError } from '@/utils/errorHandler'
import { debounce } from 'lodash'
import SubtitleHub from '@/components/SubtitleHub'
import clsx from 'clsx'

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
      // message.success('扫描任务已启动') 
      // Replace with toast later
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
      title: 'Filename',
      dataIndex: 'name',
      key: 'name',
      width: 300,
      render: (text: string) => <span className="font-medium text-foreground">{text}</span>
    },
    {
      title: 'Type',
      dataIndex: 'file_type',
      key: 'file_type',
      width: 100,
      render: (type: string) => (
        <Chip size="sm" variant="flat" color={type === 'video' ? 'primary' : type === 'audio' ? 'secondary' : 'default'}>
          {type.toUpperCase()}
        </Chip>
      )
    },
    {
      title: 'Size',
      dataIndex: 'size',
      key: 'size',
      width: 120,
      render: (size: number) => <span className="text-foreground/60 font-mono text-xs">{formatSize(size)}</span>,
    },
    {
      title: 'Path',
      dataIndex: 'path',
      key: 'path',
    },
    {
      title: 'Quality',
      key: 'quality',
      width: 200,
      render: (_: any, record: MediaFile) => (
        <div className="flex gap-1 flex-wrap">
          {record.quality_score !== undefined && (
            <Chip size="sm" color={record.quality_score > 70 ? 'success' : 'warning'} variant="dot">
              {record.quality_score}
            </Chip>
          )}
          {record.video_info?.is_dolby_vision && <Chip size="sm" color="secondary" variant="flat">DV</Chip>}
          {record.video_info?.is_hdr10_plus && <Chip size="sm" color="warning" variant="flat">HDR10+</Chip>}
          {record.video_info?.is_hdr && !record.video_info?.is_dolby_vision && <Chip size="sm" color="warning" variant="flat">HDR</Chip>}
          {record.video_info?.source && <Chip size="sm" variant="bordered">{record.video_info.source}</Chip>}
          {record.video_info?.has_chinese_subtitle && <Chip size="sm" color="primary" variant="flat">CN</Chip>}
        </div>
      )
    },
    {
      title: 'Actions',
      key: 'action',
      width: 100,
      render: (_: any, record: MediaFile) => (
        <Button
          size="sm"
          variant="light"
          onPress={() => setSubtitleFileId(record.id)}
          startContent={<Type size={14} />}
        >
          Subs
        </Button>
      )
    },
  ]

  return (
    <div className="flex flex-col gap-6">

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="col-span-2">
          <CardHeader className="flex gap-3">
            <div className="p-2 bg-primary/10 rounded-lg text-primary">
              <Folder size={24} />
            </div>
            <div className="flex flex-col">
              <p className="text-md font-bold">Scanner</p>
              <p className="text-small text-default-500">Scan directories for new media</p>
            </div>
          </CardHeader>
          <Divider />
          <CardBody className="gap-4">
            <div className="flex gap-2">
              <Input
                placeholder="/data/media/movies" // Enhanced placeholder
                value={directory}
                onValueChange={setDirectory}
                startContent={<Folder className="text-default-400" size={18} />}
              />
              <Button
                color="primary"
                onPress={handleScan}
                isLoading={scanning || scanMutation.isPending}
                startContent={!scanning && <Activity size={18} />}
              >
                Scan
              </Button>
            </div>

            {(scanning || taskId) && (
              <ProgressMonitor taskId={taskId} />
            )}
          </CardBody>
        </Card>

        {history && history.length > 0 && (
          <Card>
            <CardHeader className="flex justify-between items-center">
              <span className="font-semibold text-sm">Recent Scans</span>
              <Chip size="sm" variant="flat">{history.length}</Chip>
            </CardHeader>
            <Divider />
            <CardBody className="p-0">
              <div className="flex flex-col overflow-y-auto max-h-[160px]">
                {history.map((item: any, idx: number) => {
                  const isLast = idx === history.length - 1;
                  return (
                    <div
                      key={item.directory}
                      onClick={() => setDirectory(item.directory)}
                      className={clsx(
                        "px-4 py-3 hover:bg-default-100 cursor-pointer transition-colors",
                        !isLast && "border-b border-divider"
                      )}
                    >
                      <p className="text-xs font-medium truncate" title={item.directory}>{item.directory}</p>
                      <div className="flex justify-between mt-1">
                        <span className="text-[10px] text-default-400">{item.total_files} files</span>
                        <span className="text-[10px] text-default-400 font-mono">{formatSize(item.total_size)}</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </CardBody>
          </Card>
        )}
      </div>

      <Card className="flex-1">
        <CardHeader className="flex justify-between items-center px-6 py-4">
          <div className="flex items-center gap-2">
            <span className="text-lg font-bold">Media Library</span>
            <span className="text-sm text-default-400 font-mono">({data?.total || 0})</span>
          </div>
          <div className="flex gap-2 w-full max-w-sm">
            <Input
              placeholder="Search files..."
              size="sm"
              startContent={<Search size={14} className="text-default-400" />}
              onValueChange={debouncedSearch}
            />
            <Button isIconOnly size="sm" variant="ghost" onPress={() => refetch()}>
              <RefreshCw size={14} />
            </Button>
          </div>
        </CardHeader>
        <Divider />
        <CardBody className="p-0">
          <VirtualizedTable<MediaFile>
            columns={columns}
            dataSource={data?.files || []}
            height={600}
            rowHeight={56}
            loading={isPending}
            threshold={50}
          />
        </CardBody>
      </Card>

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
