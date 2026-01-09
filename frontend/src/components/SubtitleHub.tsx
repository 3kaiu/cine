import { useState } from 'react'
import { Modal, Table, Button, Space, Tag, Typography, message, Tabs } from 'antd'
import { CloudDownloadOutlined, SearchOutlined } from '@ant-design/icons'
import { useQuery } from '@tanstack/react-query'
import axios from 'axios'

const { Text } = Typography

interface SubtitleHubProps {
  fileId: string
  visible: boolean
  onClose: () => void
}

export default function SubtitleHub({ fileId, visible, onClose }: SubtitleHubProps) {
  const [activeTab, setActiveTab] = useState('local')

  const { data: localData, isLoading: localLoading } = useQuery({
    queryKey: ['subtitles-local', fileId],
    queryFn: async () => {
      const res = await axios.get(`/api/files/${fileId}/subtitles`)
      return res.data
    },
    enabled: visible
  })

  const { data: remoteData, isLoading: remoteLoading, refetch: searchRemote } = useQuery({
    queryKey: ['subtitles-remote', fileId],
    queryFn: async () => {
      const res = await axios.get(`/api/files/${fileId}/subtitles/search`)
      return res.data
    },
    enabled: visible && activeTab === 'remote'
  })

  return (
    <Modal
      title="字幕中心 (Subtitle Hub)"
      open={visible}
      onCancel={onClose}
      footer={null}
      width={700}
    >
      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        items={[
          {
            key: 'local',
            label: '本地字幕',
            children: (
              <Table
                dataSource={localData?.subtitles || []}
                pagination={false}
                loading={localLoading}
                columns={[
                  { title: '文件', dataIndex: 'path', key: 'path', ellipsis: true, render: (p) => p.split('/').pop() },
                  { title: '语言', dataIndex: 'language', key: 'language' },
                  { title: '格式', dataIndex: 'format', key: 'format', render: (f) => <Tag>{f}</Tag> },
                ]}
              />
            )
          },
          {
            key: 'remote',
            label: '在线搜索',
            children: (
              <Space direction="vertical" style={{ width: '100%' }}>
                <Table
                  dataSource={remoteData || []}
                  loading={remoteLoading}
                  pagination={false}
                  columns={[
                    { title: '文件名', dataIndex: 'filename', key: 'filename' },
                    { title: '语言', dataIndex: 'language', key: 'language' },
                    { title: '评分', dataIndex: 'score', key: 'score', render: (s) => <Text type={s > 90 ? 'success' : 'warning'}>{s}/100</Text> },
                    {
                      title: '操作',
                      render: () => (
                        <Button type="primary" size="small" icon={<CloudDownloadOutlined />} onClick={() => message.info('下载功能开发中')}>
                          下载
                        </Button>
                      )
                    }
                  ]}
                />
                <Button icon={<SearchOutlined />} onClick={() => searchRemote()} style={{ marginTop: 8 }}>
                  重新搜索
                </Button>
              </Space>
            )
          }
        ]}
      />
    </Modal>
  )
}
