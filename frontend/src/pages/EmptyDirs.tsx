import { useState } from 'react'
import { Card, Button, Table, Space, message, Tag, Popconfirm, Select, Input } from 'antd'
import { DeleteOutlined, ReloadOutlined, FolderOutlined } from '@ant-design/icons'
import { mediaApi } from '@/api/media'
import { useQuery, useMutation } from '@tanstack/react-query'

interface EmptyDirInfo {
  path: string
  category: string
  depth: number
}

interface EmptyDirsData {
  dirs: EmptyDirInfo[]
  total: number
  by_category: Record<string, number>
}

export default function EmptyDirs() {
  const [directory, setDirectory] = useState('')
  const [category, setCategory] = useState<string | undefined>(undefined)

  const { data, refetch, isLoading } = useQuery<EmptyDirsData>({
    queryKey: ['empty-dirs', directory, category],
    queryFn: () => {
      const params: any = {}
      if (directory) params.directory = directory
      if (category) params.category = category
      return mediaApi.findEmptyDirs(params)
    },
    enabled: false,
  })

  const deleteMutation = useMutation({
    mutationFn: mediaApi.deleteEmptyDirs,
    onSuccess: () => {
      message.success('删除成功')
      refetch()
    },
    onError: (error: any) => {
      message.error('删除失败: ' + error.message)
    },
  })

  const handleFind = () => {
    refetch()
  }

  const handleDelete = (dirs: string[]) => {
    deleteMutation.mutate(dirs)
  }

  const handleDeleteAll = () => {
    if (!data?.dirs || data.dirs.length === 0) {
      message.warning('没有可删除的空文件夹')
      return
    }
    const dirs = data.dirs.map((d) => d.path)
    handleDelete(dirs)
  }

  const columns = [
    {
      title: '路径',
      dataIndex: 'path',
      key: 'path',
      ellipsis: true,
      render: (text: string) => (
        <span>
          <FolderOutlined style={{ marginRight: 8 }} />
          {text}
        </span>
      ),
    },
    {
      title: '分类',
      dataIndex: 'category',
      key: 'category',
      width: 120,
      render: (category: string) => {
        const colors: Record<string, string> = {
          cache: 'orange',
          build: 'blue',
          system: 'red',
          other: 'default',
        }
        return <Tag color={colors[category] || 'default'}>{category}</Tag>
      },
    },
    {
      title: '深度',
      dataIndex: 'depth',
      key: 'depth',
      width: 80,
    },
    {
      title: '操作',
      key: 'action',
      width: 100,
      render: (_: any, record: EmptyDirInfo) => (
        <Popconfirm
          title="确定要删除这个空文件夹吗？"
          onConfirm={() => handleDelete([record.path])}
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
      <Card title="空文件夹清理" style={{ marginBottom: 16 }}>
        <Space direction="vertical" style={{ width: '100%' }}>
          <Space>
            <Input
              placeholder="要扫描的目录（留空为当前目录）"
              value={directory}
              onChange={(e) => setDirectory(e.target.value)}
              prefix={<FolderOutlined />}
              style={{ width: 300 }}
            />
            <Select
              placeholder="筛选分类"
              value={category}
              onChange={setCategory}
              allowClear
              style={{ width: 150 }}
              options={[
                { label: '缓存', value: 'cache' },
                { label: '构建产物', value: 'build' },
                { label: '系统目录', value: 'system' },
                { label: '其他', value: 'other' },
              ]}
            />
            <Button
              type="primary"
              onClick={handleFind}
              loading={isLoading}
              icon={<ReloadOutlined />}
            >
              查找空文件夹
            </Button>
            {data && data.dirs.length > 0 && (
              <Popconfirm
                title={`确定要删除所有 ${data.total} 个空文件夹吗？`}
                onConfirm={handleDeleteAll}
              >
                <Button danger icon={<DeleteOutlined />}>
                  删除全部
                </Button>
              </Popconfirm>
            )}
          </Space>
          {data && (
            <Space>
              <span>找到 {data.total} 个空文件夹</span>
              {Object.entries(data.by_category || {}).map(([cat, count]) => (
                <Tag key={cat}>
                  {cat}: {count}
                </Tag>
              ))}
            </Space>
          )}
        </Space>
      </Card>

      {data && data.dirs.length > 0 && (
        <Card title="空文件夹列表">
          <Table
            columns={columns}
            dataSource={data.dirs}
            rowKey="path"
            pagination={{
              pageSize: 50,
              showSizeChanger: true,
            }}
          />
        </Card>
      )}
    </div>
  )
}
