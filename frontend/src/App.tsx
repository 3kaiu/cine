import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { lazy, Suspense } from 'react'
import Sidebar from './components/Sidebar'
import { ErrorBoundary } from './components/ErrorBoundary'
import LoadingWrapper from './components/LoadingWrapper'
import { Toaster } from 'sonner'

// Lazy load page components
const Workflow = lazy(() => import('./pages/Workflow'))
const Scanner = lazy(() => import('./pages/Scanner'))
const Scraper = lazy(() => import('./pages/Scraper'))
const Dedupe = lazy(() => import('./pages/Dedupe'))
const Renamer = lazy(() => import('./pages/Renamer'))
const FileManager = lazy(() => import('./pages/FileManager'))
const Trash = lazy(() => import('./pages/Trash'))
const OperationLogs = lazy(() => import('./pages/OperationLogs'))
const Tasks = lazy(() => import('./pages/Tasks'))
const Settings = lazy(() => import('./pages/Settings'))

function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <div className="flex h-screen w-full bg-background text-foreground antialiased selection:bg-primary/20 overflow-hidden">
          <Sidebar />

          <div className="flex-1 flex flex-col min-w-0 h-full relative overflow-hidden">
            <main className="flex-1 overflow-y-auto overflow-x-hidden p-3 scrollbar-hide">
              <div className="w-full space-y-4">
                <Suspense fallback={<LoadingWrapper loading={true} />}>
                  <Routes>
                    <Route path="/" element={<Workflow />} />
                    <Route path="/scanner" element={<Scanner />} />
                    <Route path="/scraper" element={<Scraper />} />
                    <Route path="/dedupe" element={<Dedupe />} />
                    <Route path="/renamer" element={<Renamer />} />
                    <Route path="/file-manager" element={<FileManager />} />
                    <Route path="/trash" element={<Trash />} />
                    <Route path="/logs" element={<OperationLogs />} />
                    <Route path="/tasks" element={<Tasks />} />
                    <Route path="/settings" element={<Settings />} />
                  </Routes>
                </Suspense>
              </div>
            </main>

          </div>
        </div>
      </BrowserRouter>
      <Toaster
        richColors
        position="top-right"
        toastOptions={{
          classNames: {
            error: 'border-danger/10 bg-danger/5',
            success: 'border-success/10 bg-success/5',
            warning: 'border-warning/10 bg-warning/5',
          }
        }}
      />
    </ErrorBoundary>
  )
}

export default App
