import { Card, Form, Input, Button, message } from 'antd'

export default function Settings() {
  const [form] = Form.useForm()

  const handleSave = (values: any) => {
    console.log('Settings:', values)
    message.success('设置已保存')
  }

  return (
    <Card title="设置">
      <Form
        form={form}
        layout="vertical"
        onFinish={handleSave}
        initialValues={{
          tmdb_api_key: '',
          default_scan_directory: '',
        }}
      >
        <Form.Item
          label="TMDB API Key"
          name="tmdb_api_key"
          rules={[{ required: true, message: '请输入 TMDB API Key' }]}
        >
          <Input.Password placeholder="输入你的 TMDB API Key" />
        </Form.Item>

        <Form.Item
          label="默认扫描目录"
          name="default_scan_directory"
        >
          <Input placeholder="/path/to/media" />
        </Form.Item>

        <Form.Item>
          <Button type="primary" htmlType="submit">
            保存设置
          </Button>
        </Form.Item>
      </Form>
    </Card>
  )
}
