import { useState } from 'react'
import { Card, Button, Input, Table, Space, message, Typography } from 'antd'
const { Text } = Typography
import { EditOutlined } from '@ant-design/icons'
import { mediaApi } from '@/api/media'
import { useQuery, useMutation } from '@tanstack/react-query'

export default function Renamer() {
  const [template, setTemplate] = useState('{title}.S{season:02d}E{episode:02d}.{ext}')
  const [selectedFiles, setSelectedFiles] = useState<string[]>([])

  const { data: files, refetch: refetchFiles } = useQuery({
    queryKey: ['files'],
    queryFn: () => mediaApi.getFiles({ file_type: 'video', page_size: 100 })
  })

  const [previewMap, setPreviewMap] = useState<Record<string, string>>({})
  const [lastExecuted, setLastExecuted] = useState(false)

  const renameMutation = useMutation({
    mutationFn: mediaApi.batchRename,
    onSuccess: (res, variables) => {
      if (variables.preview) {
        const mapping: Record<string, string> = {}
        res.data.preview.forEach(p => mapping[p.file_id] = p.new_name)
        setPreviewMap(mapping)
        message.info('预览已生成')
      } else {
        message.success(res.data.message)
        setLastExecuted(true)
        setPreviewMap({})
        refetchFiles()
      }
    },
    onError: (error: any) => {
      message.error('操作失败: ' + (error.response?.data || error.message))
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
      title: '预期新文件名',
      key: 'new_name',
      ellipsis: true,
      render: (_: any, record: any) => {
        const newName = previewMap[record.id]
        if (!newName) return <Text type="secondary">尚未预览</Text>
        return <Text strong color={newName !== record.name ? 'blue' : undefined}>{newName}</Text>
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
            <Button onClick={handlePreview} loading={renameMutation.isPending} icon={<EditOutlined />}>
              预览
            </Button>
            <Button type="primary" onClick={handleRename} loading={renameMutation.isPending}>
              执行重命名
            </Button>
            {lastExecuted && (
              <Button type="link" href="/logs">
                查看日志以撤销
              </Button>
            )}
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
