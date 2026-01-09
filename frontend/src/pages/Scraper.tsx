import { useState } from 'react'
import { Card, Button, Table, Space, message, Tag, Select, Checkbox, Modal, Image, Row, Col, Typography } from 'antd'
import { CloudDownloadOutlined, PictureOutlined } from '@ant-design/icons'
import { mediaApi, MediaFile } from '@/api/media'
import { useQuery, useMutation } from '@tanstack/react-query'

const { Text, Paragraph } = Typography

export default function Scraper() {
  const [selectedFile, setSelectedFile] = useState<string | null>(null)
  const [source, setSource] = useState('tmdb')
  const [downloadImages, setDownloadImages] = useState(true)
  const [generateNfo, setGenerateNfo] = useState(true)
  const [selectedFiles, setSelectedFiles] = useState<string[]>([])
  const [previewVisible, setPreviewVisible] = useState(false)
  const [previewMetadata, setPreviewMetadata] = useState<any>(null)

  const { data: files, refetch } = useQuery({
    queryKey: ['files'],
    queryFn: () => mediaApi.getFiles({ file_type: 'video', page_size: 100 })
  })

  const scrapeMutation = useMutation({
    mutationFn: mediaApi.scrapeMetadata,
    onSuccess: (data) => {
      if (data.error) {
        message.error('刮削失败: ' + data.error)
      } else {
        message.success('元数据刮削成功')
        if (data.poster_path || data.nfo_path) {
          message.info(`已下载海报: ${data.poster_path ? '是' : '否'}, 已生成NFO: ${data.nfo_path ? '是' : '否'}`)
        }
        refetch()
      }
    },
    onError: (error: any) => {
      message.error('刮削失败: ' + error.message)
    },
  })

  const batchScrapeMutation = useMutation({
    mutationFn: mediaApi.batchScrapeMetadata,
    onSuccess: (data) => {
      message.success(`批量刮削完成: 成功 ${data.success} 个, 失败 ${data.failed} 个`)
      refetch()
    },
    onError: (error: any) => {
      message.error('批量刮削失败: ' + error.message)
    },
  })

  const handleScrape = async (fileId: string, autoMatch: boolean = true) => {
    setSelectedFile(fileId)
    if (!autoMatch) {
      // 先搜索，显示结果供选择
      try {
        const result = await mediaApi.scrapeMetadata({
          file_id: fileId,
          source,
          auto_match: false,
          download_images: false,
          generate_nfo: false,
        })
        if (result.metadata && Array.isArray(result.metadata)) {
          setPreviewMetadata(result.metadata)
          setPreviewVisible(true)
          return
        }
      } catch (e) {
        // 如果失败，继续自动匹配
      }
    }

    scrapeMutation.mutate({
      file_id: fileId,
      source,
      auto_match: autoMatch,
      download_images: downloadImages,
      generate_nfo: generateNfo,
    })
  }

  const handleBatchScrape = () => {
    if (selectedFiles.length === 0) {
      message.warning('请先选择要刮削的文件')
      return
    }
    batchScrapeMutation.mutate({
      file_ids: selectedFiles,
      source,
      auto_match: true,
      download_images: downloadImages,
      generate_nfo: generateNfo,
    })
  }

  const handleSelectMetadata = () => {
    const file = files?.files.find(f => f.id === selectedFile)
    if (!file) return

    // 使用选中的元数据执行刮削
    scrapeMutation.mutate({
      file_id: file.id,
      source,
      auto_match: true,
      download_images: downloadImages,
      generate_nfo: generateNfo,
    })
    setPreviewVisible(false)
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
      title: '元数据',
      dataIndex: 'metadata',
      key: 'metadata',
      render: (metadata: any) => {
        if (!metadata) return <Tag>未刮削</Tag>
        try {
          const data = typeof metadata === 'string' ? JSON.parse(metadata) : metadata
          return (
            <Space>
              <Tag color="green">{data.title || data.name}</Tag>
              {data.poster_url && <PictureOutlined />}
              {data.rating && <Text type="secondary">⭐ {data.rating}</Text>}
            </Space>
          )
        } catch {
          return <Tag>已刮削</Tag>
        }
      },
    },
    {
      title: '操作',
      key: 'action',
      width: 200,
      render: (_: any, record: MediaFile) => (
        <Space>
          <Button
            type="primary"
            size="small"
            icon={<CloudDownloadOutlined />}
            onClick={() => handleScrape(record.id, true)}
            loading={scrapeMutation.isPending && selectedFile === record.id}
          >
            自动
          </Button>
          <Button
            size="small"
            onClick={() => handleScrape(record.id, false)}
            loading={scrapeMutation.isPending && selectedFile === record.id}
          >
            选择
          </Button>
        </Space>
      ),
    },
  ]

  return (
    <div>
      <Card title="元数据刮削" style={{ marginBottom: 16 }}>
        <Space direction="vertical" style={{ width: '100%' }}>
          <Space>
            <span>数据源:</span>
            <Select
              value={source}
              onChange={setSource}
              style={{ width: 200 }}
              options={[
                { label: 'TMDB', value: 'tmdb' },
                { label: '豆瓣', value: 'douban' },
              ]}
            />
            <Checkbox
              checked={downloadImages}
              onChange={(e) => setDownloadImages(e.target.checked)}
            >
              下载海报
            </Checkbox>
            <Checkbox
              checked={generateNfo}
              onChange={(e) => setGenerateNfo(e.target.checked)}
            >
              生成 NFO
            </Checkbox>
          </Space>
          {selectedFiles.length > 0 && (
            <Space>
              <Button
                type="primary"
                onClick={handleBatchScrape}
                loading={batchScrapeMutation.isPending}
                icon={<CloudDownloadOutlined />}
              >
                批量刮削 ({selectedFiles.length})
              </Button>
              <Button onClick={() => setSelectedFiles([])}>清空选择</Button>
            </Space>
          )}
        </Space>
      </Card>

      <Card title="视频文件列表">
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
        title="选择元数据"
        open={previewVisible}
        onCancel={() => setPreviewVisible(false)}
        footer={null}
        width={800}
      >
        <div style={{ maxHeight: '60vh', overflowY: 'auto' }}>
          {previewMetadata && Array.isArray(previewMetadata) && previewMetadata.map((item: any, index: number) => (
            <Card
              key={index}
              style={{ marginBottom: 16 }}
              hoverable
              onClick={() => handleSelectMetadata()}
            >
              <Row gutter={16}>
                <Col span={6}>
                  {item.poster_url && (
                    <Image
                      src={item.poster_url}
                      alt={item.title || item.name}
                      style={{ width: '100%' }}
                      preview={false}
                    />
                  )}
                </Col>
                <Col span={18}>
                  <Typography.Title level={4}>
                    {item.title || item.name}
                  </Typography.Title>
                  {item.original_title && (
                    <Text type="secondary">{item.original_title}</Text>
                  )}
                  <Paragraph ellipsis={{ rows: 3 }}>
                    {item.overview}
                  </Paragraph>
                  <Space>
                    {item.year && <Tag>年份: {item.year}</Tag>}
                    {item.rating && <Tag>评分: {item.rating}</Tag>}
                    {item.release_date && <Tag>上映: {item.release_date}</Tag>}
                  </Space>
                </Col>
              </Row>
            </Card>
          ))}
        </div>
      </Modal>
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
