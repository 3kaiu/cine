import { useState, useCallback } from 'react'
import { Card, Button, Input, Space, message, Divider, Tag, Typography } from 'antd'
const { Text } = Typography
import { FolderOpenOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons'
import { mediaApi, MediaFile } from '@/api/media'
import { useQuery, useMutation } from '@tanstack/react-query'
import ProgressMonitor from '@/components/ProgressMonitor'
import VirtualizedTable from '@/components/VirtualizedTable'
import { handleError } from '@/utils/errorHandler'
import { debounce } from 'lodash'
import SubtitleHub from '@/components/SubtitleHub'

export default function Scanner() {
  const [directory, setDirectory] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [scanning, setScanning] = useState(false)
  const [taskId, setTaskId] = useState<string | undefined>(undefined)
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(50)
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
      message.success('扫描任务已启动')
      setScanning(true)
      setTaskId(data.task_id)
      refetchHistory()
      // 扫描任务由 WebSocket 实时跟踪，这里无需 setTimeout 轮询
    },
    onError: (error: any) => {
      handleError(error, '扫描失败')
      setScanning(false)
    },
  })

  const handleScan = () => {
    if (!directory.trim()) {
      message.warning('请输入目录路径')
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
      ellipsis: true,
      width: 300,
    },
    {
      title: '类型',
      dataIndex: 'file_type',
      key: 'file_type',
      width: 100,
    },
    {
      title: '大小',
      dataIndex: 'size',
      key: 'size',
      width: 120,
      render: (size: number) => formatSize(size),
    },
    {
      title: '路径',
      dataIndex: 'path',
      key: 'path',
      ellipsis: true,
    },
    {
      title: '质量',
      key: 'quality',
      width: 150,
      render: (_: any, record: MediaFile) => (
        <Space>
          {record.quality_score !== undefined && (
            <Tag color={record.quality_score > 70 ? 'success' : 'warning'}>
              {record.quality_score}分
            </Tag>
          )}
          {record.video_info?.is_dolby_vision && <Tag color="purple">DV</Tag>}
          {record.video_info?.is_hdr10_plus && <Tag color="orange">HDR10+</Tag>}
          {record.video_info?.is_hdr && !record.video_info?.is_dolby_vision && <Tag color="gold">HDR</Tag>}
          {record.video_info?.source && <Tag color="blue">{record.video_info.source}</Tag>}
          {record.video_info?.has_chinese_subtitle && <Tag color="cyan">中字</Tag>}
        </Space>
      )
    },
    {
      title: '操作',
      key: 'action',
      width: 100,
      render: (_: any, record: MediaFile) => (
        <Button
          type="link"
          size="small"
          onClick={() => setSubtitleFileId(record.id)}
        >
          字幕
        </Button>
      )
    },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card title="文件扫描与搜索">
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <Input
            placeholder="请输入要扫描的目录路径"
            value={directory}
            onChange={(e) => setDirectory(e.target.value)}
            prefix={<FolderOpenOutlined />}
            size="large"
          />
          <Space split={<Divider type="vertical" />}>
            <Button
              type="primary"
              onClick={handleScan}
              loading={scanning || scanMutation.isPending}
              icon={<ReloadOutlined />}
            >
              开始扫描
            </Button>
            <Input
              placeholder="搜索文件名..."
              onChange={(e) => debouncedSearch(e.target.value)}
              prefix={<SearchOutlined />}
              style={{ width: 300 }}
              allowClear
            />
            <Button onClick={() => refetch()} icon={<ReloadOutlined />}>
              刷新列表
            </Button>
          </Space>

          {(scanning || taskId) && (
            <div style={{ marginTop: 16 }}>
              <ProgressMonitor
                taskId={taskId}
              />
            </div>
          )}
        </Space>
      </Card>

      {history && history.length > 0 && (
        <Card title="扫描记录 (快照)" size="small">
          <div style={{ display: 'flex', gap: '16px', overflowX: 'auto', paddingBottom: '8px' }}>
            {history.map((item: any) => {
              const types = JSON.parse(item.file_types_json || '{}');
              return (
                <Card
                  key={item.directory}
                  hoverable
                  style={{ width: 300, flexShrink: 0 }}
                  bodyStyle={{ padding: '12px' }}
                  onClick={() => setDirectory(item.directory)}
                >
                  <Text strong ellipsis title={item.directory} style={{ display: 'block', marginBottom: '8px' }}>
                    {item.directory}
                  </Text>
                  <Space direction="vertical" size={0} style={{ width: '100%' }}>
                    <Text type="secondary" style={{ fontSize: '12px' }}>
                      文件数: {item.total_files} | 体积: {formatSize(item.total_size)}
                    </Text>
                    <div style={{ marginTop: '4px' }}>
                      {Object.entries(types).map(([type, count]) => (
                        <Tag key={type} style={{ fontSize: '10px' }}>
                          {type}: {count as number}
                        </Tag>
                      ))}
                    </div>
                  </Space>
                </Card>
              );
            })}
          </div>
        </Card>
      )}

      <Card title="文件库">
        <VirtualizedTable<MediaFile>
          columns={columns}
          dataSource={data?.files || []}
          height={600}
          rowHeight={50}
          loading={isPending}
          pagination={{
            total: data?.total || 0,
            pageSize,
            current: currentPage,
            onChange: (page, size) => {
              setCurrentPage(page);
              setPageSize(size);
            }
          }}
        />
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
