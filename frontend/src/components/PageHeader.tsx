import { ReactNode } from 'react'

interface PageHeaderProps {
  title: string
  description: string
  actions?: ReactNode
  className?: string
}

export default function PageHeader({ title, description, actions, className = '' }: PageHeaderProps) {
  return (
    <div className={`flex justify-between items-center pt-1 pb-2 ${className}`}>
      <div className="flex flex-col">
        <h2 className="text-[16px] font-bold tracking-tight text-foreground/90">{title}</h2>
        <p className="text-[11px] text-default-400 font-medium">{description}</p>
      </div>
      {actions && (
        <div className="flex gap-2">
          {actions}
        </div>
      )}
    </div>
  )
}
