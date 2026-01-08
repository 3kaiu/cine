
import { Card, Button, Table, Space, message, Popconfirm, Tag } from 'antd'
import { DeleteOutlined, RestOutlined, ClearOutlined } from '@ant-design/icons'
import { mediaApi } from '@/api/media'
import { useQuery, useMutation } from 'react-query'
import LoadingWrapper from '@/components/LoadingWrapper'
import { handleError } from '@/utils/errorHandler'

interface TrashItem {
  id: string
  original_path: string
  original_name: string
  trash_path: string
  file_size: number
  deleted_at: string
  file_type: string
}

export default function Trash() {
  const { data, refetch, isLoading } = useQuery('trash', mediaApi.listTrash)

  const restoreMutation = useMutation(mediaApi.restoreFromTrash, {
    onSuccess: () => {
      message.success('文件恢复成功')
      refetch()
    },
    onError: (error: any) => {
      handleError(error, '文件恢复失败')
    },
  })

  const deleteMutation = useMutation(mediaApi.permanentlyDelete, {
    onSuccess: () => {
      message.success('文件已永久删除')
      refetch()
    },
    onError: (error: any) => {
      handleError(error, '删除失败')
    },
  })

  const cleanupMutation = useMutation(mediaApi.cleanupTrash, {
    onSuccess: (data: any) => {
      message.success(data.message || '清理完成')
      refetch()
    },
    onError: (error: any) => {
      handleError(error, '清理失败')
    },
  })

  const handleRestore = (fileId: string) => {
    restoreMutation.mutate({ file_id: fileId })
  }

  const handleDelete = (fileId: string) => {
    deleteMutation.mutate(fileId)
  }

  const handleCleanup = () => {
    cleanupMutation.mutate()
  }

  const columns = [
    {
      title: '原文件名',
      dataIndex: 'original_name',
      key: 'original_name',
      ellipsis: true,
    },
    {
      title: '原路径',
      dataIndex: 'original_path',
      key: 'original_path',
      ellipsis: true,
    },
    {
      title: '大小',
      dataIndex: 'file_size',
      key: 'file_size',
      width: 120,
      render: (size: number) => formatSize(size),
    },
    {
      title: '类型',
      dataIndex: 'file_type',
      key: 'file_type',
      width: 100,
      render: (type: string) => <Tag>{type}</Tag>,
    },
    {
      title: '删除时间',
      dataIndex: 'deleted_at',
      key: 'deleted_at',
      width: 180,
      render: (time: string) => new Date(time).toLocaleString(),
    },
    {
      title: '操作',
      key: 'action',
      width: 200,
      render: (_: any, record: TrashItem) => (
        <Space>
          <Button
            size="small"
            icon={<RestOutlined />}
            onClick={() => handleRestore(record.id)}
            loading={restoreMutation.isLoading}
          >
            恢复
          </Button>
          <Popconfirm
            title="确定要永久删除这个文件吗？此操作不可恢复！"
            onConfirm={() => handleDelete(record.id)}
          >
            <Button
              danger
              size="small"
              icon={<DeleteOutlined />}
              loading={deleteMutation.isLoading}
            >
              永久删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <LoadingWrapper loading={isLoading}>
      <div>
        <Card title="回收站" style={{ marginBottom: 16 }}>
          <Space>
            <Popconfirm
              title="确定要清理所有过期文件吗？"
              onConfirm={handleCleanup}
            >
              <Button
                icon={<ClearOutlined />}
                loading={cleanupMutation.isLoading}
              >
                清理过期文件
              </Button>
            </Popconfirm>
            {data && (
              <span>共 {data.total} 个文件</span>
            )}
          </Space>
        </Card>

        <Card title="已删除文件">
          <Table
            columns={columns}
            dataSource={data?.items || []}
            rowKey="id"
            pagination={{
              pageSize: 50,
              showSizeChanger: true,
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

  return `${size.toFixed(2)} ${units[unitIndex]} `
}
