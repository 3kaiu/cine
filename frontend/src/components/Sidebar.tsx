import { NavLink } from 'react-router-dom'
import {
  Activity,
  Cloud,
  Trash2,
  Edit,
  Folder,
  Framer,
  Settings,

  List,
  Crosshair
} from 'react-feather'
import clsx from 'clsx'

const menuItems = [
  {
    path: '/',
    icon: Crosshair,
    label: 'Media Scanner',
  },
  {
    path: '/scraper',
    icon: Cloud,
    label: 'Metadata Processing',
  },
  {
    path: '/dedupe',
    icon: Activity,
    label: 'Deduplication',
  },
  {
    path: '/renamer',
    icon: Edit,
    label: 'Batch Renamer',
  },
  {
    path: '/empty-dirs',
    icon: Folder,
    label: 'Empty Cleaner',
  },
  {
    path: '/file-manager',
    icon: Framer,
    label: 'Filesystem',
  },
  {
    path: '/trash',
    icon: Trash2,
    label: 'Recycle Bin',
  },
  {
    path: '/logs',
    icon: List,
    label: 'System Logs',
  },
  {
    path: '/settings',
    icon: Settings,
    label: 'Preferences',
  },
]

export default function Sidebar() {
  return (
    <div className="w-64 h-full flex flex-col border-r border-divider bg-background/50 backdrop-blur-md">
      <div className="h-16 flex items-center px-6">
        <div className="flex items-center gap-2 font-bold text-xl tracking-tight">
          <span className="text-primary">Cine</span>
          <span className="opacity-50 font-normal">Manager</span>
        </div>
      </div>

      <nav className="flex-1 px-4 py-4 space-y-1">
        {menuItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) =>
              clsx(
                "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                isActive
                  ? "bg-primary/10 text-primary"
                  : "text-foreground/70 hover:bg-default-100 hover:text-foreground"
              )
            }
          >
            <item.icon size={18} />
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="p-4 border-t border-divider">
        <div className="text-xs text-foreground/40 px-2">
          v1.3.1-beta
        </div>
      </div>
    </div>
  )
}
