import { Spinner } from "@heroui/react";
import { ReactNode } from 'react'

interface LoadingWrapperProps {
  loading: boolean
  children?: ReactNode
  tip?: string
}

export default function LoadingWrapper({ loading, children, tip = "加载中..." }: LoadingWrapperProps) {
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[40vh] w-full gap-4">
        <Spinner size="lg" color="accent" />
        {tip && <p className="text-[12px] font-black text-default-400 uppercase tracking-[0.2em] animate-pulse">{tip}</p>}
      </div>
    )
  }

  return <>{children}</>
}
