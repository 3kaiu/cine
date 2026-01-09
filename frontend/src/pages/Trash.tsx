import { useState, useMemo } from 'react'
import { Card, Button, Table, Space, message, Popconfirm, Tag, Modal, Typography, Badge } from 'antd'
import { DeleteOutlined, RestOutlined, ClearOutlined, ExclamationCircleOutlined } from '@ant-design/icons'
import { mediaApi } from '@/api/media'
import { useQuery, useMutation } from '@tanstack/react-query'
import LoadingWrapper from '@/components/LoadingWrapper'
import { handleError } from '@/utils/errorHandler'

const { Text } = Typography
const { confirm } = Modal

interface TrashItem {
  id: string
  original_path: string
  original_name: string
  trash_path: string
  file_size: number
  deleted_at: string
  file_type: string
}

interface TrashData {
  items: TrashItem[]
  total: number
}

export default function Trash() {
  const [selectedRowKeys, setSelectedRowKeys] = useState<string[]>([])

  const { data, refetch, isPending } = useQuery<TrashData>({
    queryKey: ['trash'],
    queryFn: mediaApi.listTrash
  })

  const selectedItems = useMemo(() => {
    return (data?.items || []).filter(item => selectedRowKeys.includes(item.id))
  }, [data, selectedRowKeys])

  const restoreMutation = useMutation({
    mutationFn: mediaApi.restoreFromTrash,
    onSuccess: () => {
      message.success('恢复成功')
      setSelectedRowKeys([])
      refetch()
    },
    onError: (error: any) => handleError(error, '恢复失败'),
  })

  const deleteMutation = useMutation({
    mutationFn: mediaApi.permanentlyDelete,
    onSuccess: () => {
      message.success('永久删除成功')
      setSelectedRowKeys([])
      refetch()
    },
    onError: (error: any) => handleError(error, '删除失败'),
  })

  const cleanupMutation = useMutation({
    mutationFn: mediaApi.cleanupTrash,
    onSuccess: (data: any) => {
      message.success(data.message || '清理完成')
      refetch()
    },
    onError: (error: any) => handleError(error, '清理失败'),
  })

  const handleBatchRestore = () => {
    confirm({
      title: `确定要恢复这 ${selectedRowKeys.length} 个文件吗？`,
      icon: <RestOutlined style={{ color: '#1890ff' }} />,
      onOk: async () => {
        let success = 0
        let failed = 0
        for (const id of selectedRowKeys) {
          try {
            await mediaApi.restoreFromTrash({ file_id: id })
            success++
          } catch (e) {
            failed++
          }
        }
        message.info(`处理完成: 成功 ${success} 个, 失败 ${failed} 个`)
        setSelectedRowKeys([])
        refetch()
      }
    })
  }

  const handleBatchDelete = () => {
    confirm({
      title: `确定要永久删除这 ${selectedRowKeys.length} 个文件吗？`,
      icon: <ExclamationCircleOutlined />,
      content: '此操作不可撤销，文件将从磁盘上物理删除。',
      okType: 'danger',
      onOk: async () => {
        let success = 0
        let failed = 0
        for (const id of selectedRowKeys) {
          try {
            await mediaApi.permanentlyDelete(id)
            success++
          } catch (e) {
            failed++
          }
        }
        message.info(`处理完成: 成功 ${success} 个, 失败 ${failed} 个`)
        setSelectedRowKeys([])
        refetch()
      }
    })
  }

  const columns = [
    {
      title: '原文件名',
      dataIndex: 'original_name',
      key: 'original_name',
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
      width: 150,
      render: (_: any, record: TrashItem) => (
        <Space>
          <Button
            size="small"
            type="link"
            onClick={() => restoreMutation.mutate({ file_id: record.id })}
          >
            恢复
          </Button>
          <Popconfirm
            title="永久删除？不可恢复！"
            onConfirm={() => deleteMutation.mutate(record.id)}
            okText="确定"
            cancelText="取消"
          >
            <Button size="small" type="link" danger>删除</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card title="回收站管理">
        <Space direction="vertical" style={{ width: '100%' }}>
          <Space size="middle">
            <Button
              icon={<RestOutlined />}
              onClick={handleBatchRestore}
              disabled={selectedRowKeys.length === 0}
            >
              批量恢复 {selectedRowKeys.length > 0 && <Badge count={selectedRowKeys.length} offset={[10, -10]} />}
            </Button>
            <Button
              danger
              icon={<DeleteOutlined />}
              onClick={handleBatchDelete}
              disabled={selectedRowKeys.length === 0}
            >
              批量永久删除
            </Button>
            <Divider type="vertical" />
            <Popconfirm
              title="确定要清理所有过期文件吗？"
              onConfirm={() => cleanupMutation.mutate()}
            >
              <Button icon={<ClearOutlined />}>清理过期</Button>
            </Popconfirm>
          </Space>
          {selectedRowKeys.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <Text type="secondary">
                已选择 {selectedRowKeys.length} 个文件，共 {formatSize(selectedItems.reduce((acc, i) => acc + i.file_size, 0))}
              </Text>
              <Button type="link" size="small" onClick={() => setSelectedRowKeys([])}>清空选择</Button>
            </div>
          )}
        </Space>
      </Card>

      <Card title={`已删除文件(${data?.total || 0})`}>
        <LoadingWrapper loading={isPending}>
          <Table
            columns={columns}
            dataSource={data?.items || []}
            rowKey="id"
            rowSelection={{
              selectedRowKeys,
              onChange: (keys) => setSelectedRowKeys(keys as string[]),
            }}
            pagination={{
              pageSize: 50,
              showSizeChanger: true,
            }}
          />
        </LoadingWrapper>
      </Card>
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

  return `${size.toFixed(2)} ${units[unitIndex]} `
}

const Divider = ({ type }: { type?: 'vertical' | 'horizontal' }) => (
  <span style={{
    display: 'inline-block',
    borderLeft: type === 'vertical' ? '1px solid #f0f0f0' : 'none',
    borderTop: type === 'horizontal' ? '1px solid #f0f0f0' : 'none',
    margin: '0 8px',
    height: type === 'vertical' ? 14 : 0,
    width: type === 'horizontal' ? '100%' : 0,
    verticalAlign: 'middle'
  }} />
)
