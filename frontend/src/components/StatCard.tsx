import { ReactNode } from 'react'
import { Surface } from "@heroui/react"

interface StatCardProps {
  label: string
  value: string | number
  icon: ReactNode
  color?: 'primary' | 'secondary' | 'accent' | 'warning' | 'danger' | 'success' | 'default'
  trend?: {
    value: number
    isPositive: boolean
  }
  description?: string
  className?: string
}

const colorClasses = {
  primary: {
    iconBg: 'bg-primary/5 text-primary',
    trendBg: 'bg-primary/5 text-primary',
    dot: 'bg-primary'
  },
  secondary: {
    iconBg: 'bg-secondary/5 text-secondary',
    trendBg: 'bg-secondary/5 text-secondary',
    dot: 'bg-secondary'
  },
  accent: {
    iconBg: 'bg-accent/5 text-accent',
    trendBg: 'bg-accent/5 text-accent',
    dot: 'bg-accent'
  },
  warning: {
    iconBg: 'bg-warning/5 text-warning',
    trendBg: 'bg-warning/5 text-warning',
    dot: 'bg-warning'
  },
  danger: {
    iconBg: 'bg-danger/5 text-danger',
    trendBg: 'bg-danger/5 text-danger',
    dot: 'bg-danger'
  },
  success: {
    iconBg: 'bg-success/5 text-success',
    trendBg: 'bg-success/5 text-success',
    dot: 'bg-success'
  },
  default: {
    iconBg: 'bg-default-100 text-default-600',
    trendBg: 'bg-default-100 text-default-600',
    dot: 'bg-default-400'
  }
}

export default function StatCard({ label, value, icon, color = 'primary', trend, description, className = '' }: StatCardProps) {
  const colors = colorClasses[color] || colorClasses.default

  return (
    <Surface
      variant="default"
      className={`relative overflow-hidden rounded-xl border border-divider/50 bg-background/50 transition-all duration-200 hover:border-divider ${className}`}
    >
      <div className="p-5 flex flex-col gap-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 mb-1">
              <div className={`w-1.5 h-1.5 rounded-full ${colors.dot}`} />
              <p className="text-[10px] font-black text-default-400 uppercase tracking-widest">{label}</p>
            </div>
            <p className="text-2xl font-bold text-foreground tabular-nums tracking-tight">
              {value}
            </p>
          </div>
          <div className={`p-2 rounded-lg ${colors.iconBg} shrink-0`}>
            <div className="w-5 h-5 flex items-center justify-center">
              {icon}
            </div>
          </div>
        </div>

        {(trend || description) && (
          <div className="flex items-center gap-3 pt-3 border-t border-divider/10">
            {trend && (
              <div className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-black uppercase tracking-tighter ${colors.trendBg}`}>
                <span>{trend.isPositive ? '↑' : '↓'}</span>
                <span>{Math.abs(trend.value)}%</span>
              </div>
            )}

            {description && (
              <p className="text-[10px] font-bold text-default-400 uppercase tracking-wider truncate">
                {description}
              </p>
            )}
          </div>
        )}
      </div>
    </Surface>
  )
}
