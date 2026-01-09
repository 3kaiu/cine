import { Card, Table, Tag, Button, Space, Typography, message, Popconfirm } from 'antd'
import {
  UndoOutlined,
  HistoryOutlined,
  FileTextOutlined,
  DeleteOutlined,
  RestOutlined,
  SwapOutlined,
  RollbackOutlined
} from '@ant-design/icons'
import { mediaApi, OperationLog } from '@/api/media'
import { useQuery, useMutation } from '@tanstack/react-query'
import dayjs from 'dayjs'

const { Text } = Typography

export default function OperationLogs() {
  const { data: logs, refetch, isPending } = useQuery({
    queryKey: ['operation-logs'],
    queryFn: async () => {
      const res = await mediaApi.listOperationLogs()
      return res.data
    }
  })

  const undoMutation = useMutation({
    mutationFn: (id: string) => mediaApi.undoOperation(id),
    onSuccess: () => {
      message.success('已成功撤销操作')
      refetch()
    },
    onError: (error: any) => {
      message.error('撤销失败: ' + (error.response?.data || error.message))
    }
  })

  const getActionIcon = (action: string) => {
    switch (action) {
      case 'rename': return <SwapOutlined style={{ color: '#1890ff' }} />
      case 'trash': return <RestOutlined style={{ color: '#faad14' }} />
      case 'restore': return <RollbackOutlined style={{ color: '#52c41a' }} />
      case 'delete': return <DeleteOutlined style={{ color: '#ff4d4f' }} />
      default: return <FileTextOutlined />
    }
  }

  const getActionTag = (action: string) => {
    switch (action) {
      case 'rename': return <Tag color="blue">重命名</Tag>
      case 'trash': return <Tag color="orange">移至回收站</Tag>
      case 'restore': return <Tag color="green">还原</Tag>
      case 'delete': return <Tag color="error">永久删除</Tag>
      default: return <Tag>{action}</Tag>
    }
  }

  const columns = [
    {
      title: '操作',
      dataIndex: 'action',
      key: 'action',
      width: 120,
      render: (action: string) => (
        <Space>
          {getActionIcon(action)}
          {getActionTag(action)}
        </Space>
      )
    },
    {
      title: '路径变更',
      key: 'paths',
      render: (_: any, record: OperationLog) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <div>
            <Text type="secondary" style={{ fontSize: '12px' }}>原路径: </Text>
            <Text ellipsis title={record.old_path}>{record.old_path}</Text>
          </div>
          {record.new_path && (
            <div>
              <Text type="secondary" style={{ fontSize: '12px' }}>新路径: </Text>
              <Text strong ellipsis title={record.new_path}>{record.new_path}</Text>
            </div>
          )}
        </div>
      )
    },
    {
      title: '时间',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 180,
      render: (date: string) => dayjs(date).format('YYYY-MM-DD HH:mm:ss')
    },
    {
      title: '管理',
      key: 'management',
      width: 120,
      render: (_: any, record: OperationLog) => (
        <Space>
          {record.action === 'rename' && (
            <Popconfirm
              title="确定要撤销这次重命名吗？"
              description="系统将尝试把文件恢复到原始路径名称。"
              onConfirm={() => undoMutation.mutate(record.id)}
            >
              <Button
                type="link"
                size="small"
                icon={<UndoOutlined />}
                loading={undoMutation.isPending && undoMutation.variables === record.id}
              >
                撤销
              </Button>
            </Popconfirm>
          )}
        </Space>
      )
    }
  ]

  return (
    <div style={{ padding: '24px' }}>
      <Card
        title={
          <Space>
            <HistoryOutlined />
            <span>操作日志与审计</span>
          </Space>
        }
        extra={
          <Button onClick={() => refetch()} loading={isPending} icon={<HistoryOutlined />}>
            刷新
          </Button>
        }
      >
        <Table
          dataSource={logs}
          columns={columns}
          rowKey="id"
          loading={isPending}
          pagination={{ pageSize: 20 }}
        />
      </Card>
    </div>
  )
}
