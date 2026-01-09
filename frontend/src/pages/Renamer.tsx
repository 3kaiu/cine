import { useState } from 'react'
import { Card, Button, Input, Table, Space, message } from 'antd'
import { EditOutlined } from '@ant-design/icons'
import { mediaApi } from '@/api/media'
import { useQuery, useMutation } from '@tanstack/react-query'

export default function Renamer() {
  const [template, setTemplate] = useState('{title}.S{season:02d}E{episode:02d}.{ext}')
  const [selectedFiles, setSelectedFiles] = useState<string[]>([])

  const { data: files } = useQuery({
    queryKey: ['files'],
    queryFn: () => mediaApi.getFiles({ file_type: 'video', page_size: 100 })
  })

  const renameMutation = useMutation({
    mutationFn: mediaApi.batchRename,
    onSuccess: (data) => {
      message.success(data.message)
    },
    onError: (error: any) => {
      message.error('重命名失败: ' + error.message)
    },
  })

  const handlePreview = () => {
    if (selectedFiles.length === 0) {
      message.warning('请先选择要重命名的文件')
      return
    }
    renameMutation.mutate({
      file_ids: selectedFiles,
      template,
      preview: true,
    })
  }

  const handleRename = () => {
    if (selectedFiles.length === 0) {
      message.warning('请先选择要重命名的文件')
      return
    }
    renameMutation.mutate({
      file_ids: selectedFiles,
      template,
      preview: false,
    })
  }

  const columns = [
    {
      title: '原文件名',
      dataIndex: 'name',
      key: 'name',
      ellipsis: true,
    },
    {
      title: '新文件名',
      dataIndex: 'new_name',
      key: 'new_name',
      ellipsis: true,
      render: (text: string, record: any) => {
        // 这里应该显示预览结果
        return text || record.name
      },
    },
  ]

  return (
    <div>
      <Card title="批量重命名" style={{ marginBottom: 16 }}>
        <Space direction="vertical" style={{ width: '100%' }}>
          <div>
            <span>命名模板: </span>
            <Input
              value={template}
              onChange={(e) => setTemplate(e.target.value)}
              placeholder="{title}.S{season:02d}E{episode:02d}.{ext}"
              style={{ width: 400 }}
            />
          </div>
          <div>
            <span>可用变量: </span>
            <code>{'{title}'}</code>, <code>{'{year}'}</code>,{' '}
            <code>{'{season:02d}'}</code>, <code>{'{episode:02d}'}</code>,{' '}
            <code>{'{ext}'}</code>
          </div>
          <Space>
            <Button onClick={handlePreview} icon={<EditOutlined />}>
              预览
            </Button>
            <Button type="primary" onClick={handleRename}>
              执行重命名
            </Button>
          </Space>
        </Space>
      </Card>

      <Card title="文件列表">
        <Table
          columns={columns}
          dataSource={files?.files || []}
          rowKey="id"
          rowSelection={{
            selectedRowKeys: selectedFiles,
            onChange: (keys) => setSelectedFiles(keys as string[]),
          }}
          pagination={{
            total: files?.total || 0,
            pageSize: files?.page_size || 50,
          }}
        />
      </Card>
    </div>
  )
}
