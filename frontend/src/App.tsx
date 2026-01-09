import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { lazy, Suspense } from 'react'
import Sidebar from './components/Sidebar'
import { ErrorBoundary } from './components/ErrorBoundary'
import ThemeToggle from './components/ThemeToggle'
import LoadingWrapper from './components/LoadingWrapper'
import { Toaster } from 'sonner'

// Lazy load page components
const Scanner = lazy(() => import('./pages/Scanner'))
const Scraper = lazy(() => import('./pages/Scraper'))
const Dedupe = lazy(() => import('./pages/Dedupe'))
const Renamer = lazy(() => import('./pages/Renamer'))
const EmptyDirs = lazy(() => import('./pages/EmptyDirs'))
const FileManager = lazy(() => import('./pages/FileManager'))
const Trash = lazy(() => import('./pages/Trash'))
const OperationLogs = lazy(() => import('./pages/OperationLogs'))
const Settings = lazy(() => import('./pages/Settings'))

function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <div className="flex h-screen w-full overflow-hidden bg-background">
          <Sidebar />
          <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

            <header className="h-16 px-6 flex items-center justify-end border-b border-divider bg-background/50 backdrop-blur-md">
              <ThemeToggle />
            </header>

            <main className="flex-1 overflow-auto p-6 scrollbar-hide">
              <div className="max-w-7xl mx-auto w-full">
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
              </div>
            </main>

          </div>
        </div>
      </BrowserRouter>
      <Toaster richColors position="top-right" />
    </ErrorBoundary>
  )
}

export default App
