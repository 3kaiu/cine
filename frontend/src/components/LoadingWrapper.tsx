import { Spin } from 'antd'
import { ReactNode } from 'react'

interface LoadingWrapperProps {
  loading: boolean
  children?: ReactNode
  tip?: string
}

export default function LoadingWrapper({ loading, children, tip = '加载中...' }: LoadingWrapperProps) {
  return (
    <Spin spinning={loading} tip={tip} size="large">
      {children}
    </Spin>
  )
}
