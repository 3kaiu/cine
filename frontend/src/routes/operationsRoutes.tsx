import { RouteObject } from 'react-router-dom'
import { lazy } from 'react'

const Workflow = lazy(() => import('@/pages/Workflow'))
const Scanner = lazy(() => import('@/pages/Scanner'))
const Scraper = lazy(() => import('@/pages/Scraper'))
const Dedupe = lazy(() => import('@/pages/Dedupe'))
const Renamer = lazy(() => import('@/pages/Renamer'))
const FileManager = lazy(() => import('@/pages/FileManager'))
const Trash = lazy(() => import('@/pages/Trash'))
const OperationLogs = lazy(() => import('@/pages/OperationLogs'))
const Tasks = lazy(() => import('@/pages/Tasks'))

export const operationsRoutes: RouteObject[] = [
  { path: '/', element: <Workflow /> },
  { path: '/scanner', element: <Scanner /> },
  { path: '/scraper', element: <Scraper /> },
  { path: '/dedupe', element: <Dedupe /> },
  { path: '/renamer', element: <Renamer /> },
  { path: '/file-manager', element: <FileManager /> },
  { path: '/trash', element: <Trash /> },
  { path: '/logs', element: <OperationLogs /> },
  { path: '/tasks', element: <Tasks /> },
]

