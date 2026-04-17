import { NavLink } from 'react-router-dom'
import clsx from 'clsx'
import ThemeToggle from './ThemeToggle'

function MenuIcon({ path }: { path: string }) {
  const common = "w-[18px] h-[18px]"
  switch (path) {
    case '/dashboard':
      return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={common}><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="4" rx="1.5" /><rect x="14" y="10" width="7" height="11" rx="1.5" /><rect x="3" y="13" width="7" height="8" rx="1.5" /></svg>
    case '/':
      return <svg viewBox="0 0 24 24" fill="currentColor" className={common}><path d="M8 6.82v10.36c0 .8.89 1.27 1.54.82l8.14-5.18a1 1 0 0 0 0-1.64L9.54 6c-.65-.45-1.54.02-1.54.82Z"/></svg>
    case '/scanner':
      return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={common}><path d="M4 7V5h2M18 5h2v2M20 17v2h-2M6 19H4v-2M7 12h10M15 8l4 4-4 4" /></svg>
    case '/scraper':
      return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={common}><path d="M7 18a4 4 0 1 1 .2-8 5 5 0 1 1 9.56 1.5A3.5 3.5 0 1 1 17.5 18H7Z" /></svg>
    case '/dedupe':
      return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={common}><path d="m7 12 3 3 7-7" /><circle cx="12" cy="12" r="9" /></svg>
    case '/renamer':
      return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={common}><path d="M4 7h16M9 7v10M15 7v10M6 17h12" /></svg>
    case '/file-manager':
      return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={common}><path d="M3 7.5h18v11A1.5 1.5 0 0 1 19.5 20h-15A1.5 1.5 0 0 1 3 18.5v-11Z" /><path d="M3 7.5 6 4h4l2 2h9" /></svg>
    case '/trash':
      return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={common}><path d="M4 7h16M9 7V4h6v3M7 7l1 12h8l1-12M10 11v5M14 11v5" /></svg>
    case '/tasks':
      return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={common}><path d="M9 6h11M9 12h11M9 18h11" /><path d="m4 6 1.5 1.5L7.5 5M4 12l1.5 1.5L7.5 11M4 18l1.5 1.5L7.5 17" /></svg>
    case '/logs':
      return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={common}><path d="M6 4h9l3 3v13H6z" /><path d="M15 4v4h4M9 12h6M9 16h6" /></svg>
    case '/settings':
      return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={common}><path d="M12 8.5A3.5 3.5 0 1 0 12 15.5A3.5 3.5 0 1 0 12 8.5z" /><path d="M19.4 15a1 1 0 0 0 .2 1.1l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1 1 0 0 0-1.1-.2 1 1 0 0 0-.6.9V20a2 2 0 1 1-4 0v-.2a1 1 0 0 0-.6-.9 1 1 0 0 0-1.1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1 1 0 0 0 .2-1.1 1 1 0 0 0-.9-.6H4a2 2 0 1 1 0-4h.2a1 1 0 0 0 .9-.6 1 1 0 0 0-.2-1.1l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1 1 0 0 0 1.1.2 1 1 0 0 0 .6-.9V4a2 2 0 1 1 4 0v.2a1 1 0 0 0 .6.9 1 1 0 0 0 1.1-.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1 1 0 0 0-.2 1.1 1 1 0 0 0 .9.6h.2a2 2 0 1 1 0 4h-.2a1 1 0 0 0-.9.6Z" /></svg>
    default:
      return <span className={common} />
  }
}

const menuItems = [
  {
    path: '/dashboard',
    label: '性能仪表盘',
  },
  {
    path: '/',
    label: '自动化工作流',
  },
  {
    path: '/scanner',
    label: '媒体扫描',
  },
  {
    path: '/scraper',
    label: '元数据处理',
  },
  {
    path: '/dedupe',
    label: '去重管理',
  },
  {
    path: '/renamer',
    label: '批量重命名',
  },
  {
    path: '/file-manager',
    label: '文件管理',
  },
  {
    path: '/trash',
    label: '回收站',
  },
  {
    path: '/tasks',
    label: '任务队列',
  },
  {
    path: '/logs',
    label: '系统日志',
  },
  {
    path: '/settings',
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
              <MenuIcon path={item.path} />
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
