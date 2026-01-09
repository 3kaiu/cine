import { useState } from 'react'
import { Card, Button, Input, Space, message } from 'antd'
import { FolderOpenOutlined, ReloadOutlined } from '@ant-design/icons'
import { mediaApi, MediaFile } from '@/api/media'
import { useQuery, useMutation } from '@tanstack/react-query'
import ProgressMonitor from '@/components/ProgressMonitor'
import LoadingWrapper from '@/components/LoadingWrapper'
import VirtualizedTable from '@/components/VirtualizedTable'
import { handleError } from '@/utils/errorHandler'

export default function Scanner() {
  const [directory, setDirectory] = useState('')
  const [scanning, setScanning] = useState(false)
  const [taskId, setTaskId] = useState<string | undefined>(undefined)

  const { data, refetch } = useQuery({
    queryKey: ['files', { page: 1, page_size: 50 }],
    queryFn: () => mediaApi.getFiles({ page: 1, page_size: 50 }),
    enabled: false,
    staleTime: 5 * 60 * 1000, // 5分钟
    gcTime: 10 * 60 * 1000, // 10分钟 (v5: cacheTime renamed)
  })

  const scanMutation = useMutation({
    mutationFn: mediaApi.scanDirectory,
    onSuccess: (data) => {
      message.success('扫描任务已启动')
      setScanning(true)
      setTaskId(data.task_id)
      // 延迟刷新列表，给扫描一些时间
      setTimeout(() => {
        setScanning(false)
        refetch()
      }, 5000)
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
      file_types: ['video', 'audio'],
    })
  }

  const columns = [
    {
      title: '文件名',
      dataIndex: 'name',
      key: 'name',
      ellipsis: true,
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
  ]

  return (
    <LoadingWrapper loading={scanMutation.isPending}>
      <div>
        <Card title="文件扫描" style={{ marginBottom: 16 }}>
          <Space direction="vertical" style={{ width: '100%' }}>
            <Input
              placeholder="请输入要扫描的目录路径"
              value={directory}
              onChange={(e) => setDirectory(e.target.value)}
              prefix={<FolderOpenOutlined />}
              size="large"
            />
            <Space>
              <Button
                type="primary"
                onClick={handleScan}
                loading={scanning || scanMutation.isPending}
                icon={<ReloadOutlined />}
              >
                开始扫描
              </Button>
              <Button onClick={() => refetch()} icon={<ReloadOutlined />}>
                刷新列表
              </Button>
            </Space>
            {scanning && taskId && (
              <ProgressMonitor taskId={taskId} />
            )}
          </Space>
        </Card>

        <Card title="文件列表">
          <VirtualizedTable<MediaFile>
            columns={columns}
            dataSource={data?.files || []}
            height={600}
            rowHeight={50}
            loading={!data && scanMutation.isPending}
            pagination={{
              total: data?.total || 0,
              pageSize: data?.page_size || 50,
              current: data?.page || 1,
            }}
          />
        </Card>
      </div>
    </LoadingWrapper>
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
