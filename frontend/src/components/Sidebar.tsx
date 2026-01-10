import { NavLink } from 'react-router-dom'
import { Icon } from '@iconify/react'
import {
  TrashBin,
  Gear,
} from '@gravity-ui/icons'
import clsx from 'clsx'
import ThemeToggle from './ThemeToggle'

const menuItems = [
  {
    path: '/',
    icon: <Icon icon="lucide:play-circle" />,
    label: '自动化工作流',
  },
  {
    path: '/scanner',
    icon: <Icon icon="lucide:scan-search" />,
    label: '媒体扫描',
  },
  {
    path: '/scraper',
    icon: <Icon icon="lucide:cloud" />,
    label: '元数据处理',
  },
  {
    path: '/dedupe',
    icon: <Icon icon="lucide:check-circle-2" />,
    label: '去重管理',
  },
  {
    path: '/renamer',
    icon: <Icon icon="lucide:type" />,
    label: '批量重命名',
  },
  {
    path: '/file-manager',
    icon: <Icon icon="lucide:package" />,
    label: '文件管理',
  },
  {
    path: '/trash',
    icon: <TrashBin />,
    label: '回收站',
  },
  {
    path: '/logs',
    icon: <Icon icon="lucide:scroll-text" />,
    label: '系统日志',
  },
  {
    path: '/settings',
    icon: <Gear />,
    label: '设置中心',
  },
]

export default function Sidebar() {
  return (
    <div data-testid="sidebar" className="w-[160px] h-full flex flex-col border-r border-default-100 bg-default-50/50 backdrop-blur-xl shrink-0">
      <div className="h-[88px] flex items-center justify-center py-3 border-b border-transparent">
        <img src="/icon.svg" alt="Cine Logo" className="w-16 h-16 drop-shadow-sm" />
      </div>

      <nav className="flex-1 px-4 pt-0 pb-6 space-y-1 overflow-y-auto scrollbar-hide">
        {menuItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) =>
              clsx(
                "flex items-center gap-2.5 px-3 py-2 rounded-xl text-[12px] font-bold transition-all duration-300 group relative truncate",
                isActive
                  ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20"
                  : "text-default-500 hover:bg-default-100/80 hover:text-default-900"
              )
            }
          >
            <div className={clsx(
              "transition-transform duration-300 group-hover:scale-110 shrink-0 opacity-90",
              "[&>svg]:w-[18px] [&>svg]:h-[18px]"
            )}>
              {item.icon}
            </div>
            <span className="truncate">{item.label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="p-4 mt-auto">
        <div className="flex items-center justify-between px-3 bg-default-100/50 rounded-2xl py-2 border border-default-200/50">
          <div className="flex flex-col gap-0.5">
            <span className="text-[9px] text-default-400 font-black uppercase tracking-widest">Version</span>
            <span className="text-[10px] text-default-600 font-mono font-bold italic">v1.3.1</span>
          </div>
          <ThemeToggle />
        </div>
      </div>
    </div>
  )
}
