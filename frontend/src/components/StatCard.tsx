import { ReactNode } from 'react'

interface StatCardProps {
  label: string
  value: string | number
  icon: ReactNode
  color?: 'primary' | 'secondary' | 'accent' | 'warning' | 'danger' | 'success'
  trend?: {
    value: number
    isPositive: boolean
  }
  description?: string
  className?: string
}

const colorClasses = {
  primary: {
    bg: 'bg-gradient-to-t from-primary/5 to-card',
    border: 'border-primary/10',
    iconBg: 'bg-primary/10',
    iconText: 'text-primary',
    trendBg: 'bg-primary/5',
    trendText: 'text-primary'
  },
  secondary: {
    bg: 'bg-gradient-to-t from-secondary/5 to-card',
    border: 'border-secondary/10',
    iconBg: 'bg-secondary/10',
    iconText: 'text-secondary',
    trendBg: 'bg-secondary/5',
    trendText: 'text-secondary'
  },
  accent: {
    bg: 'bg-gradient-to-t from-accent/5 to-card',
    border: 'border-accent/10',
    iconBg: 'bg-accent/10',
    iconText: 'text-accent',
    trendBg: 'bg-accent/5',
    trendText: 'text-accent'
  },
  warning: {
    bg: 'bg-gradient-to-t from-warning/5 to-card',
    border: 'border-warning/10',
    iconBg: 'bg-warning/10',
    iconText: 'text-warning',
    trendBg: 'bg-warning/5',
    trendText: 'text-warning'
  },
  danger: {
    bg: 'bg-gradient-to-t from-danger/5 to-card',
    border: 'border-danger/10',
    iconBg: 'bg-danger/10',
    iconText: 'text-danger',
    trendBg: 'bg-danger/5',
    trendText: 'text-danger'
  },
  success: {
    bg: 'bg-gradient-to-t from-success/5 to-card',
    border: 'border-success/10',
    iconBg: 'bg-success/10',
    iconText: 'text-success',
    trendBg: 'bg-success/5',
    trendText: 'text-success'
  }
}

export default function StatCard({ label, value, icon, color = 'primary', trend, description, className = '' }: StatCardProps) {
  const colors = colorClasses[color]

  return (
    <div className={`relative overflow-hidden rounded-xl border ${colors.border} ${colors.bg} shadow-xs transition-all duration-200 hover:shadow-sm ${className}`}>
      <div className="p-5 space-y-3">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 space-y-1.5">
            <p className="text-[11px] font-medium text-default-500 uppercase tracking-wider">{label}</p>
            <p className="text-[22px] font-semibold text-foreground tabular-nums tracking-tight leading-none">{value}</p>
          </div>
          <div className={`${colors.iconText} shrink-0`}>
            {icon}
          </div>
        </div>
        
        {trend && (
          <div className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md ${colors.trendBg} ${colors.trendText} text-[11px] font-medium`}>
            <span className="text-[10px]">{trend.isPositive ? '↑' : '↓'}</span>
            <span>{Math.abs(trend.value)}%</span>
          </div>
        )}
        
        {description && (
          <p className="text-[11px] text-default-400 leading-relaxed">
            {description}
          </p>
        )}
      </div>
    </div>
  )
}
