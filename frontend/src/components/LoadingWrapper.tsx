import { Spinner } from "@heroui/react";
import { ReactNode } from 'react'

interface LoadingWrapperProps {
  loading: boolean
  children?: ReactNode
  tip?: string
}

export default function LoadingWrapper({ loading, children, tip }: LoadingWrapperProps) {
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] w-full">
        <Spinner size="lg" color="primary" label={tip} />
      </div>
    )
  }

  return <>{children}</>
}
