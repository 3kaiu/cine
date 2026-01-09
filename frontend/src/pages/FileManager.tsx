import { useState, useMemo } from 'react'
import { Card, Button, Table, Space, message, Modal, Input, List, Typography, Badge } from 'antd'
import { CopyOutlined, FolderOutlined, RestOutlined, DeleteOutlined, ExclamationCircleOutlined } from '@ant-design/icons'
import { mediaApi } from '@/api/media'
import { useQuery, useMutation } from '@tanstack/react-query'
import LoadingWrapper from '@/components/LoadingWrapper'
import { handleError } from '@/utils/errorHandler'

const { Text } = Typography
const { confirm } = Modal

export default function FileManager() {
  const [selectedRowKeys, setSelectedRowKeys] = useState<string[]>([])
  const [moveModalVisible, setMoveModalVisible] = useState(false)
  const [copyModalVisible, setCopyModalVisible] = useState(false)
  const [targetDir, setTargetDir] = useState('')

  const { data: filesData, refetch, isPending } = useQuery({
    queryKey: ['files'],
    queryFn: () => mediaApi.getFiles({ page_size: 100 })
  })

  const selectedFiles = useMemo(() => {
    return (filesData?.files || []).filter(f => selectedRowKeys.includes(f.id))
  }, [filesData, selectedRowKeys])

  const totalSelectedSize = useMemo(() => {
    return selectedFiles.reduce((sum, f) => sum + f.size, 0)
  }, [selectedFiles])

  // Mutations
  const moveMutation = useMutation({
    mutationFn: mediaApi.moveFile,
    onSuccess: () => {
      message.success('文件移动成功')
      setMoveModalVisible(false)
      setTargetDir('')
      refetch()
    },
    onError: (error: any) => handleError(error, '文件移动失败'),
  })

  const copyMutation = useMutation({
    mutationFn: mediaApi.copyFile,
    onSuccess: () => {
      message.success('文件复制成功')
      setCopyModalVisible(false)
      setTargetDir('')
      refetch()
    },
    onError: (error: any) => handleError(error, '文件复制失败'),
  })

  const batchMoveMutation = useMutation({
    mutationFn: mediaApi.batchMoveFiles,
    onSuccess: (data) => {
      message.success(`批量移动完成: 成功 ${data.success} 个, 失败 ${data.failed} 个`)
      setMoveModalVisible(false)
      setTargetDir('')
      setSelectedRowKeys([])
      refetch()
    },
    onError: (error: any) => handleError(error, '批量移动失败'),
  })

  const batchCopyMutation = useMutation({
    mutationFn: mediaApi.batchCopyFiles,
    onSuccess: (data) => {
      message.success(`批量复制完成: 成功 ${data.success} 个, 失败 ${data.failed} 个`)
      setCopyModalVisible(false)
      setTargetDir('')
      setSelectedRowKeys([])
      refetch()
    },
    onError: (error: any) => handleError(error, '批量复制失败'),
  })

  // Handlers
  const handleMove = () => {
    if (!targetDir.trim()) {
      message.warning('请输入目标目录')
      return
    }
    if (selectedRowKeys.length === 1) {
      moveMutation.mutate({ file_id: selectedRowKeys[0], target_dir: targetDir.trim() })
    } else {
      batchMoveMutation.mutate({ file_ids: selectedRowKeys, target_dir: targetDir.trim() })
    }
  }

  const handleCopy = () => {
    if (!targetDir.trim()) {
      message.warning('请输入目标目录')
      return
    }
    if (selectedRowKeys.length === 1) {
      copyMutation.mutate({ file_id: selectedRowKeys[0], target_dir: targetDir.trim() })
    } else {
      batchCopyMutation.mutate({ file_ids: selectedRowKeys, target_dir: targetDir.trim() })
    }
  }

  const handleBatchTrash = () => {
    confirm({
      title: `确定要将这 ${selectedFiles.length} 个文件移至回收站吗？`,
      icon: <ExclamationCircleOutlined />,
      content: (
        <div>
          <Text type="secondary">总大小: {formatSize(totalSelectedSize)}</Text>
          <div style={{ maxHeight: 200, overflowY: 'auto', marginTop: 8 }}>
            <List
              size="small"
              dataSource={selectedFiles}
              renderItem={item => <List.Item>{item.name}</List.Item>}
            />
          </div>
        </div>
      ),
      onOk: async () => {
        // 后端目前没有批量移至回收站接口，轮询执行
        // TODO: 后端增加批量接口
        let success = 0
        let failed = 0
        for (const id of selectedRowKeys) {
          try {
            await mediaApi.moveToTrash(id)
            success++
          } catch (e) {
            failed++
          }
        }
        message.info(`处理完成: 成功 ${success} 个, 失败 ${failed} 个`)
        setSelectedRowKeys([])
        refetch()
      },
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

  const SelectedFileList = () => (
    <div style={{ maxHeight: 150, overflowY: 'auto', border: '1px solid #f0f0f0', padding: 8, borderRadius: 4 }}>
      <List
        size="small"
        dataSource={selectedFiles}
        renderItem={item => (
          <List.Item style={{ padding: '4px 0' }}>
            <Text ellipsis style={{ width: '100%' }}>{item.name}</Text>
          </List.Item>
        )}
      />
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card title="文件库管理">
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <Space size="middle">
            <Button
              icon={<RestOutlined />}
              onClick={() => setMoveModalVisible(true)}
              disabled={selectedRowKeys.length === 0}
            >
              移动 {selectedRowKeys.length > 0 && <Badge count={selectedRowKeys.length} offset={[10, -10]} />}
            </Button>
            <Button
              icon={<CopyOutlined />}
              onClick={() => setCopyModalVisible(true)}
              disabled={selectedRowKeys.length === 0}
            >
              复制 {selectedRowKeys.length > 0 && <Badge count={selectedRowKeys.length} offset={[10, -10]} />}
            </Button>
            <Button
              danger
              icon={<DeleteOutlined />}
              onClick={handleBatchTrash}
              disabled={selectedRowKeys.length === 0}
            >
              移至回收站
            </Button>
            {selectedRowKeys.length > 0 && (
              <Button type="link" onClick={() => setSelectedRowKeys([])}>清空选择</Button>
            )}
          </Space>
        </Space>
      </Card>

      <Card title="所有文件">
        <LoadingWrapper loading={isPending}>
          <Table
            columns={columns}
            dataSource={filesData?.files || []}
            rowKey="id"
            rowSelection={{
              selectedRowKeys,
              onChange: (keys) => setSelectedRowKeys(keys as string[]),
            }}
            pagination={{
              total: filesData?.total || 0,
              pageSize: filesData?.page_size || 50,
            }}
          />
        </LoadingWrapper>
      </Card>

      {/* 移动模态框 */}
      <Modal
        title="移动文件"
        open={moveModalVisible}
        onOk={handleMove}
        onCancel={() => {
          setMoveModalVisible(false)
          setTargetDir('')
        }}
        confirmLoading={moveMutation.isPending || batchMoveMutation.isPending}
        width={600}
      >
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <div>
            <Text strong>已选中 {selectedFiles.length} 个文件</Text>
            <Text type="secondary" style={{ marginLeft: 16 }}>总大小: {formatSize(totalSelectedSize)}</Text>
          </div>
          <SelectedFileList />
          <Input
            placeholder="请输入目标目录绝对路径"
            value={targetDir}
            onChange={(e) => setTargetDir(e.target.value)}
            prefix={<FolderOutlined />}
            size="large"
          />
        </Space>
      </Modal>

      {/* 复制模态框 */}
      <Modal
        title="复制文件"
        open={copyModalVisible}
        onOk={handleCopy}
        onCancel={() => {
          setCopyModalVisible(false)
          setTargetDir('')
        }}
        confirmLoading={copyMutation.isPending || batchCopyMutation.isPending}
        width={600}
      >
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <div>
            <Text strong>已选中 {selectedFiles.length} 个文件</Text>
            <Text type="secondary" style={{ marginLeft: 16 }}>总大小: {formatSize(totalSelectedSize)}</Text>
          </div>
          <SelectedFileList />
          <Input
            placeholder="请输入目标目录绝对路径"
            value={targetDir}
            onChange={(e) => setTargetDir(e.target.value)}
            prefix={<FolderOutlined />}
            size="large"
          />
        </Space>
      </Modal>
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
