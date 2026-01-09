import { Card, Button, Space, message, List, Tag, Typography, Progress } from 'antd'
import { DeleteOutlined, ReloadOutlined, SafetyCertificateOutlined, WarningOutlined } from '@ant-design/icons'
import { mediaApi, MediaFile } from '@/api/media'
import { useQuery, useMutation } from '@tanstack/react-query'

const { Text } = Typography

export default function Dedupe() {
  const { data, refetch, isPending } = useQuery({
    queryKey: ['duplicate-movies'],
    queryFn: async () => {
      const res = await mediaApi.findDuplicateMovies()
      return res.data
    },
    enabled: false,
  })

  // 移至回收站
  const trashMutation = useMutation({
    mutationFn: (id: string) => mediaApi.moveToTrash(id),
    onSuccess: () => {
      message.success('已移至回收站')
      refetch()
    },
  })

  const handleFind = () => {
    refetch()
  }

  return (
    <div style={{ padding: '24px' }}>
      <Card title="智能文件治理" style={{ marginBottom: 16 }}>
        <Space direction="vertical" style={{ width: '100%' }}>
          <Space>
            <Button
              type="primary"
              onClick={handleFind}
              loading={isPending}
              icon={<ReloadOutlined />}
            >
              查找重复影片 (基于 TMDB ID)
            </Button>
            {data && (
              <span>
                找到 {data.length} 组重复影片 (按影片 ID 分组)
              </span>
            )}
          </Space>
          <Text type="secondary">
            系统会根据分辨率、码率、以及是否包含中文字幕对同一影片的不同版本进行评分，帮助您清理低质量版本。
          </Text>
        </Space>
      </Card>

      {data && (
        <List
          grid={{ gutter: 16, column: 1 }}
          dataSource={data}
          renderItem={(group) => (
            <List.Item>
              <Card title={`${group.title} (ID: ${group.tmdb_id})`}>
                <List
                  dataSource={group.files}
                  renderItem={(file: MediaFile, index) => {
                    const isBest = index === 0 && group.files.length > 1;
                    const vInfo = file.video_info;

                    return (
                      <List.Item
                        actions={[
                          <Button
                            danger
                            icon={<DeleteOutlined />}
                            disabled={isBest || trashMutation.isPending}
                            onClick={() => trashMutation.mutate(file.id)}
                          >
                            {isBest ? '建议保留' : '移至回收站'}
                          </Button>
                        ]}
                      >
                        <List.Item.Meta
                          title={
                            <Space>
                              <Text strong={isBest}>{file.name}</Text>
                              {isBest && <Tag color="success" icon={<SafetyCertificateOutlined />}>最佳画质</Tag>}
                              {!isBest && group.files.length > 1 && <Tag color="warning" icon={<WarningOutlined />}>低质量建议删除</Tag>}
                            </Space>
                          }
                          description={
                            <Space direction="vertical" style={{ width: '100%' }}>
                              <Space split="|">
                                <Text type="secondary">大小: {formatSize(file.size)}</Text>
                                {vInfo && (
                                  <>
                                    <Text type="secondary">分辨率: {vInfo.width}x{vInfo.height}</Text>
                                    <Text type="secondary">编码: {vInfo.codec}</Text>
                                    <Text type="secondary">中字: {vInfo.has_chinese_subtitle ? '✅' : '❌'}</Text>
                                    {vInfo.is_dolby_vision && <Tag color="purple">DV</Tag>}
                                    {vInfo.is_hdr10_plus && <Tag color="orange">HDR10+</Tag>}
                                    {vInfo.is_hdr && !vInfo.is_dolby_vision && <Tag color="gold">HDR</Tag>}
                                    {vInfo.source && <Tag color="blue">{vInfo.source}</Tag>}
                                  </>
                                )}
                              </Space>
                              {file.quality_score !== undefined && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                  <Text type="secondary">质量评分:</Text>
                                  <Progress
                                    percent={file.quality_score}
                                    size="small"
                                    status={isBest ? "active" : "normal"}
                                    style={{ width: 200 }}
                                    strokeColor={isBest ? '#52c41a' : '#faad14'}
                                  />
                                </div>
                              )}
                              <Text type="secondary" ellipsis style={{ fontSize: '12px' }}>路径: {file.path}</Text>
                            </Space>
                          }
                        />
                      </List.Item>
                    )
                  }}
                />
              </Card>
            </List.Item>
          )}
        />
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
