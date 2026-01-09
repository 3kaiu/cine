import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Layout, ConfigProvider } from 'antd'
import { lazy, Suspense } from 'react'
import Sidebar from './components/Sidebar'
import { ErrorBoundary } from './components/ErrorBoundary'
import ThemeToggle from './components/ThemeToggle'
import LoadingWrapper from './components/LoadingWrapper'
import { useTheme } from './hooks/useTheme'

// 代码分割：懒加载页面组件
const Scanner = lazy(() => import('./pages/Scanner'))
const Scraper = lazy(() => import('./pages/Scraper'))
const Dedupe = lazy(() => import('./pages/Dedupe'))
const Renamer = lazy(() => import('./pages/Renamer'))
const EmptyDirs = lazy(() => import('./pages/EmptyDirs'))
const FileManager = lazy(() => import('./pages/FileManager'))
const Trash = lazy(() => import('./pages/Trash'))
const OperationLogs = lazy(() => import('./pages/OperationLogs'))
const Settings = lazy(() => import('./pages/Settings'))

const { Content, Header } = Layout

function App() {
  const { algorithm } = useTheme()

  return (
    <ErrorBoundary>
      <ConfigProvider
        theme={{
          algorithm,
        }}
      >
        <BrowserRouter>
          <Layout style={{ minHeight: '100vh' }}>
            <Sidebar />
            <Layout>
              <Header
                style={{
                  background: 'var(--ant-color-bg-container)',
                  padding: '0 24px',
                  display: 'flex',
                  justifyContent: 'flex-end',
                  alignItems: 'center',
                }}
              >
                <ThemeToggle />
              </Header>
              <Content style={{ padding: '24px' }}>
                <Suspense fallback={<LoadingWrapper loading={true} />}>
                  <Routes>
                    <Route path="/" element={<Scanner />} />
                    <Route path="/scraper" element={<Scraper />} />
                    <Route path="/dedupe" element={<Dedupe />} />
                    <Route path="/renamer" element={<Renamer />} />
                    <Route path="/empty-dirs" element={<EmptyDirs />} />
                    <Route path="/file-manager" element={<FileManager />} />
                    <Route path="/trash" element={<Trash />} />
                    <Route path="/logs" element={<OperationLogs />} />
                    <Route path="/settings" element={<Settings />} />
                  </Routes>
                </Suspense>
              </Content>
            </Layout>
          </Layout>
        </BrowserRouter>
      </ConfigProvider>
    </ErrorBoundary>
  )
}

export default App
