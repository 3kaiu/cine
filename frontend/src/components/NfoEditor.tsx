import { useState, useEffect } from 'react'
import { Modal, Form, Input, InputNumber, message, Spin, Skeleton } from 'antd'
import { mediaApi, MovieNfo } from '@/api/media'
import { useQuery, useMutation } from '@tanstack/react-query'

interface NfoEditorProps {
  fileId: string
  visible: boolean
  onClose: () => void
}

export default function NfoEditor({ fileId, visible, onClose }: NfoEditorProps) {
  const [form] = Form.useForm()

  const { data: nfo, isLoading, isError } = useQuery({
    queryKey: ['nfo', fileId],
    queryFn: async () => {
      const res = await mediaApi.getNfo(fileId)
      return res.data
    },
    enabled: visible && !!fileId
  })

  useEffect(() => {
    if (nfo) {
      form.setFieldsValue(nfo)
    }
  }, [nfo, form])

  const mutation = useMutation({
    mutationFn: (values: MovieNfo) => mediaApi.updateNfo(fileId, values),
    onSuccess: () => {
      message.success('元数据已更新到 NFO')
      onClose()
    }
  })

  return (
    <Modal
      title="编辑 NFO 元数据"
      open={visible}
      onCancel={onClose}
      onOk={() => form.submit()}
      confirmLoading={mutation.isPending}
      width={600}
      destroyOnClose
    >
      {isLoading ? (
        <Skeleton active />
      ) : isError ? (
        <div style={{ padding: '20px', textAlign: 'center', color: '#ff4d4f' }}>
          未找到 NFO 文件，请先执行“刮削”生成。
        </div>
      ) : (
        <Form form={form} layout="vertical" onFinish={(v) => mutation.mutate(v)}>
          <Form.Item label="影片标题" name="title" rules={[{ required: true }]}>
            <Input placeholder="例如：铁血战士：杀戮之地" />
          </Form.Item>
          <Form.Item label="原始标题" name="originaltitle">
            <Input placeholder="例如：Predator: Badlands" />
          </Form.Item>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <Form.Item label="年份" name="year">
              <InputNumber style={{ width: '100%' }} placeholder="2025" />
            </Form.Item>
            <Form.Item label="评分" name="rating">
              <InputNumber step={0.1} min={0} max={10} style={{ width: '100%' }} placeholder="8.5" />
            </Form.Item>
          </div>
          <Form.Item label="剧情简介" name="plot">
            <Input.TextArea rows={4} placeholder="输入影片详细剧情..." />
          </Form.Item>
          <Form.Item label="TMDB ID" name="tmdbid">
            <Input placeholder="例如：12345" />
          </Form.Item>
        </Form>
      )}
    </Modal>
  )
}
