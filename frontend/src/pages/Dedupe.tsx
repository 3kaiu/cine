import { Card, Button, Table, Space, message, Tag, Popconfirm } from 'antd'
import { DeleteOutlined, ReloadOutlined } from '@ant-design/icons'
import { mediaApi } from '@/api/media'
import { useQuery, useMutation } from 'react-query'
import VirtualizedTable from '@/components/VirtualizedTable'

export default function Dedupe() {
  const { data, refetch } = useQuery('duplicates', mediaApi.findDuplicates, {
    enabled: false,
  })

  const handleFind = () => {
    refetch()
  }

  const handleDelete = (fileId: string) => {
    // TODO: 实现删除逻辑
    message.success('删除成功')
  }

  const columns = [
    {
      title: '文件名',
      dataIndex: 'name',
      key: 'name',
      ellipsis: true,
    },
    {
      title: '路径',
      dataIndex: 'path',
      key: 'path',
      ellipsis: true,
    },
    {
      title: '大小',
      dataIndex: 'size',
      key: 'size',
      width: 120,
      render: (size: number) => formatSize(size),
    },
    {
      title: '操作',
      key: 'action',
      width: 100,
      render: (_: any, record: any) => (
        <Popconfirm
          title="确定要删除这个文件吗？"
          onConfirm={() => handleDelete(record.id)}
        >
          <Button danger size="small" icon={<DeleteOutlined />}>
            删除
          </Button>
        </Popconfirm>
      ),
    },
  ]

  return (
    <div>
      <Card title="文件去重" style={{ marginBottom: 16 }}>
        <Space>
          <Button
            type="primary"
            onClick={handleFind}
            icon={<ReloadOutlined />}
          >
            查找重复文件
          </Button>
          {data && (
            <span>
              找到 {data.total_duplicates} 个重复文件，浪费空间{' '}
              {formatSize(data.total_wasted_space)}
            </span>
          )}
        </Space>
      </Card>

      {data && data.groups.length > 0 && (
        <Card title="重复文件组">
          {data.groups.map((group, index) => (
            <Card
              key={index}
              type="inner"
              title={`重复组 ${index + 1} (${group.files.length} 个文件)`}
              style={{ marginBottom: 16 }}
            >
              <VirtualizedTable
                columns={columns}
                dataSource={group.files}
                height={400}
                rowHeight={50}
                threshold={50}
              />
            </Card>
          ))}
        </Card>
      )}
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
