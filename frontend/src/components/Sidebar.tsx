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
import ThemeToggle from './ThemeToggle'

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
    <div className="h-full flex flex-col border-r border-divider/50 bg-[hsl(var(--sidebar-background))]">
      <div className="h-14 flex items-center justify-center px-4 border-b border-transparent">
        <div className="flex items-center gap-2 font-semibold text-base tracking-tight text-foreground/90">
          <img src="/icon.svg" alt="Cine Logo" className="w-7 h-7" />
          <span>Cine</span>
        </div>
      </div>

      <nav className="flex-1 px-3 py-2 space-y-0.5">
        {menuItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) =>
              clsx(
                "flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-[13px] font-medium transition-all duration-200",
                isActive
                  ? "bg-default-200/50 text-foreground shadow-sm"
                  : "text-foreground/60 hover:bg-default-100/50 hover:text-foreground/80"
              )
            }
          >
            <item.icon size={15} strokeWidth={2} className="opacity-70" />
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="p-3 border-t border-divider/50">
        <div className="flex items-center justify-between px-2">
          <div className="text-[11px] text-foreground/30 font-mono">
            v1.3.1
          </div>
          <ThemeToggle />
        </div>
      </div>
    </div>
  )
}
