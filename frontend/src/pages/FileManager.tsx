import { useState } from 'react'
import { Card, Button, Table, Space, message, Modal, Input } from 'antd'
import { CopyOutlined, FolderOutlined, RestOutlined } from '@ant-design/icons'
import { mediaApi } from '@/api/media'
import { useQuery, useMutation } from 'react-query'
import LoadingWrapper from '@/components/LoadingWrapper'
import { handleError } from '@/utils/errorHandler'

export default function FileManager() {
  const [selectedFiles, setSelectedFiles] = useState<string[]>([])
  const [moveModalVisible, setMoveModalVisible] = useState(false)
  const [copyModalVisible, setCopyModalVisible] = useState(false)
  const [targetDir, setTargetDir] = useState('')

  const { data: files, refetch } = useQuery('files', () =>
    mediaApi.getFiles({ page_size: 100 })
  )

  const moveMutation = useMutation(mediaApi.moveFile, {
    onSuccess: () => {
      message.success('文件移动成功')
      setMoveModalVisible(false)
      setTargetDir('')
      refetch()
    },
    onError: (error: any) => {
      handleError(error, '文件移动失败')
    },
  })

  const copyMutation = useMutation(mediaApi.copyFile, {
    onSuccess: () => {
      message.success('文件复制成功')
      setCopyModalVisible(false)
      setTargetDir('')
      refetch()
    },
    onError: (error: any) => {
      handleError(error, '文件复制失败')
    },
  })

  const batchMoveMutation = useMutation(mediaApi.batchMoveFiles, {
    onSuccess: (data) => {
      message.success(`批量移动完成: 成功 ${data.success} 个, 失败 ${data.failed} 个`)
      setMoveModalVisible(false)
      setTargetDir('')
      setSelectedFiles([])
      refetch()
    },
    onError: (error: any) => {
      handleError(error, '批量移动失败')
    },
  })

  const batchCopyMutation = useMutation(mediaApi.batchCopyFiles, {
    onSuccess: (data) => {
      message.success(`批量复制完成: 成功 ${data.success} 个, 失败 ${data.failed} 个`)
      setCopyModalVisible(false)
      setTargetDir('')
      setSelectedFiles([])
      refetch()
    },
    onError: (error: any) => {
      handleError(error, '批量复制失败')
    },
  })

  const handleMove = () => {
    if (selectedFiles.length === 0) {
      message.warning('请先选择要移动的文件')
      return
    }
    if (!targetDir.trim()) {
      message.warning('请输入目标目录')
      return
    }

    if (selectedFiles.length === 1) {
      moveMutation.mutate({
        file_id: selectedFiles[0],
        target_dir: targetDir.trim(),
      })
    } else {
      batchMoveMutation.mutate({
        file_ids: selectedFiles,
        target_dir: targetDir.trim(),
      })
    }
  }

  const handleCopy = () => {
    if (selectedFiles.length === 0) {
      message.warning('请先选择要复制的文件')
      return
    }
    if (!targetDir.trim()) {
      message.warning('请输入目标目录')
      return
    }

    if (selectedFiles.length === 1) {
      copyMutation.mutate({
        file_id: selectedFiles[0],
        target_dir: targetDir.trim(),
      })
    } else {
      batchCopyMutation.mutate({
        file_ids: selectedFiles,
        target_dir: targetDir.trim(),
      })
    }
  }

  const columns = [
    {
      title: '文件名',
      dataIndex: 'name',
      key: 'name',
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
      title: '类型',
      dataIndex: 'file_type',
      key: 'file_type',
      width: 100,
    },
    {
      title: '路径',
      dataIndex: 'path',
      key: 'path',
      ellipsis: true,
    },
  ]

  return (
    <LoadingWrapper loading={moveMutation.isLoading || copyMutation.isLoading}>
      <div>
        <Card title="文件管理" style={{ marginBottom: 16 }}>
          <Space>
            <Button
              icon={<RestOutlined />}
              onClick={() => setMoveModalVisible(true)}
              disabled={selectedFiles.length === 0}
            >
              移动 ({selectedFiles.length})
            </Button>
            <Button
              icon={<CopyOutlined />}
              onClick={() => setCopyModalVisible(true)}
              disabled={selectedFiles.length === 0}
            >
              复制 ({selectedFiles.length})
            </Button>
            {selectedFiles.length > 0 && (
              <Button onClick={() => setSelectedFiles([])}>清空选择</Button>
            )}
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

        <Modal
          title="移动文件"
          open={moveModalVisible}
          onOk={handleMove}
          onCancel={() => {
            setMoveModalVisible(false)
            setTargetDir('')
          }}
          confirmLoading={moveMutation.isLoading || batchMoveMutation.isLoading}
        >
          <Input
            placeholder="请输入目标目录路径"
            value={targetDir}
            onChange={(e) => setTargetDir(e.target.value)}
            prefix={<FolderOutlined />}
            style={{ marginTop: 16 }}
          />
          <div style={{ marginTop: 8, color: '#999' }}>
            将移动 {selectedFiles.length} 个文件到目标目录
          </div>
        </Modal>

        <Modal
          title="复制文件"
          open={copyModalVisible}
          onOk={handleCopy}
          onCancel={() => {
            setCopyModalVisible(false)
            setTargetDir('')
          }}
          confirmLoading={copyMutation.isLoading || batchCopyMutation.isLoading}
        >
          <Input
            placeholder="请输入目标目录路径"
            value={targetDir}
            onChange={(e) => setTargetDir(e.target.value)}
            prefix={<FolderOutlined />}
            style={{ marginTop: 16 }}
          />
          <div style={{ marginTop: 8, color: '#999' }}>
            将复制 {selectedFiles.length} 个文件到目标目录
          </div>
        </Modal>
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
