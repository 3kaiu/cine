import { useState } from 'react'
import { Card, Table, Button, Space, Modal, Form, Input, Switch, message, Typography, Tabs } from 'antd'
import { PlusOutlined, DeleteOutlined, MonitorOutlined, ClockCircleOutlined, SettingOutlined } from '@ant-design/icons'
import { useQuery, useMutation } from '@tanstack/react-query'
import { mediaApi } from '@/api/media'
import axios from 'axios'

const { Text, Title } = Typography

interface WatchFolder {
  id: string
  path: string
  auto_scrape: boolean
  auto_rename: boolean
  enabled: boolean
}

export default function Settings() {
  const [form] = Form.useForm()
  const [isModalOpen, setIsModalOpen] = useState(false)

  const { data: watchFolders, refetch } = useQuery({
    queryKey: ['watch-folders'],
    queryFn: async () => {
      const res = await axios.get<WatchFolder[]>('/api/watch-folders')
      return res.data
    }
  })

  const addMutation = useMutation({
    mutationFn: (values: any) => axios.post('/api/watch-folders', values),
    onSuccess: () => {
      message.success('已添加监控目录')
      setIsModalOpen(false)
      form.resetFields()
      refetch()
    }
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => axios.delete(`/api/watch-folders/${id}`),
    onSuccess: () => {
      message.success('已删除监控目录')
      refetch()
    }
  })

  return (
    <div style={{ padding: '24px' }}>
      <Title level={2}>系统设置</Title>

      <Tabs defaultActiveKey="1" items={[
        {
          key: '1',
          label: <span><SettingOutlined /> 常规设置</span>,
          children: (
            <Card title="基础配置">
              <Form layout="vertical">
                <Form.Item label="TMDB API Key" name="tmdb_api_key">
                  <Input.Password placeholder="未设置" />
                </Form.Item>
                <Form.Item label="默认扫描目录" name="default_dir">
                  <Input placeholder="/path/to/media" />
                </Form.Item>
                <Button type="primary">保存基础配置</Button>
              </Form>
            </Card>
          )
        },
        {
          key: '2',
          label: <span><MonitorOutlined /> 自动化监控 (Watcher)</span>,
          children: (
            <Card title="实时监控中心" extra={<Button type="primary" icon={<PlusOutlined />} onClick={() => setIsModalOpen(true)}>添加监控目录</Button>}>
              <Table
                dataSource={watchFolders}
                pagination={false}
                rowKey="id"
                columns={[
                  { title: '路径', dataIndex: 'path', key: 'path' },
                  { title: '自动刮削', dataIndex: 'auto_scrape', render: (val) => val ? '开启' : '关闭' },
                  { title: '状态', dataIndex: 'enabled', render: (val) => val ? <Text type="success">运行中</Text> : '已禁用' },
                  {
                    title: '操作',
                    render: (record) => (
                      <Button danger icon={<DeleteOutlined />} size="small" onClick={() => deleteMutation.mutate(record.id)} />
                    )
                  }
                ]}
              />
              <div style={{ marginTop: 16 }}>
                <Text type="secondary">系统将实时监控上述目录，一旦检测到新文件落盘（如下载完成），将自动触发分析、刮削与命名逻辑。</Text>
              </div>
            </Card>
          )
        },
        {
          key: '3',
          label: <span><ClockCircleOutlined /> 定时任务 (Scheduler)</span>,
          children: (
            <Card title="排程计划">
              <Space direction="vertical" style={{ width: '100%' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Space direction="vertical" size={0}>
                    <Text strong>全库每日自动清理</Text>
                    <Text type="secondary">凌晨 3:00 自动删除扫描结果中不存在的无效记录与空文件夹。</Text>
                  </Space>
                  <Switch defaultChecked />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Space direction="vertical" size={0}>
                    <Text strong>每周自动更新刮削评分</Text>
                    <Text type="secondary">根据最新的 TMDB 数据和 Cine 评分规则更新库中影片的质量分。</Text>
                  </Space>
                  <Switch defaultChecked />
                </div>
              </Space>
            </Card>
          )
        }
      ]} />

      <Modal
        title="添加监控目录"
        open={isModalOpen}
        onOk={() => form.submit()}
        onCancel={() => setIsModalOpen(false)}
        confirmLoading={addMutation.isPending}
      >
        <Form form={form} layout="vertical" onFinish={(v) => addMutation.mutate(v)}>
          <Form.Item label="路径" name="path" rules={[{ required: true }]}>
            <Input placeholder="/volume1/downloads" />
          </Form.Item>
          <Form.Item label="自动刮削" name="auto_scrape" valuePropName="checked" initialValue={true}>
            <Switch />
          </Form.Item>
          <Form.Item label="自动重命名" name="auto_rename" valuePropName="checked" initialValue={false}>
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
