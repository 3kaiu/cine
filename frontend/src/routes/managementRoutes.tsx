import { RouteObject } from 'react-router-dom'
import { lazy } from 'react'

const Settings = lazy(() => import('@/pages/Settings'))
const Dashboard = lazy(() => import('@/pages/Dashboard'))

export const managementRoutes: RouteObject[] = [
  { path: '/settings', element: <Settings /> },
  { path: '/dashboard', element: <Dashboard /> },
]

