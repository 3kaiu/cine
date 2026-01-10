import { Card } from "@heroui/react"
import { ReactNode } from 'react'

interface AnimatedCardProps {
  children: ReactNode
  className?: string
  delay?: number
}

export default function AnimatedCard({ children, className, delay = 0 }: AnimatedCardProps) {
  return (
    <Card
      className={`
        transition-all duration-300 ease-out
        hover:scale-[1.02] hover:shadow-lg hover:border-accent/30
        animate-in fade-in slide-in-from-bottom-4
        ${className}
      `}
      style={{
        animationDelay: `${delay}ms`,
      }}
    >
      {children}
    </Card>
  )
}

export function AnimatedButton({ children, className, ...props }: any) {
  return (
    <button
      className={`
        transition-all duration-200 ease-out
        active:scale-95
        hover:shadow-md
        ${className}
      `}
      {...props}
    >
      {children}
    </button>
  )
}
