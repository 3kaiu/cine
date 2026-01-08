import { Layout, Menu } from 'antd'
import { useNavigate, useLocation } from 'react-router-dom'
import {
  ScanOutlined,
  CloudDownloadOutlined,
  DeleteOutlined,
  EditOutlined,
  FolderOutlined,
  FolderOpenOutlined,
  RestOutlined,
  SettingOutlined,
} from '@ant-design/icons'

const { Sider } = Layout

const menuItems = [
  {
    key: '/',
    icon: <ScanOutlined />,
    label: '文件扫描',
  },
  {
    key: '/scraper',
    icon: <CloudDownloadOutlined />,
    label: '元数据刮削',
  },
  {
    key: '/dedupe',
    icon: <DeleteOutlined />,
    label: '文件去重',
  },
  {
    key: '/renamer',
    icon: <EditOutlined />,
    label: '批量重命名',
  },
  {
    key: '/empty-dirs',
    icon: <FolderOutlined />,
    label: '空文件夹清理',
  },
  {
    key: '/file-manager',
    icon: <FolderOpenOutlined />,
    label: '文件管理',
  },
  {
    key: '/trash',
    icon: <RestOutlined />,
    label: '回收站',
  },
  {
    key: '/settings',
    icon: <SettingOutlined />,
    label: '设置',
  },
]

export default function Sidebar() {
  const navigate = useNavigate()
  const location = useLocation()

  return (
    <Sider width={200} style={{ background: '#fff' }}>
      <div style={{ padding: '16px', fontSize: '18px', fontWeight: 'bold' }}>
        Media Toolbox
      </div>
      <Menu
        mode="inline"
        selectedKeys={[location.pathname]}
        items={menuItems}
        onClick={({ key }) => navigate(key)}
      />
    </Sider>
  )
}
