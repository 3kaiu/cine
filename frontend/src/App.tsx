import { BrowserRouter, Routes, Route, useRoutes } from 'react-router-dom'
import { Suspense } from 'react'
import Sidebar from './components/Sidebar'
import { ErrorBoundary } from './components/ErrorBoundary'
import LoadingWrapper from './components/LoadingWrapper'
import { Toaster } from 'sonner'
import { operationsRoutes } from './routes/operationsRoutes'
import { managementRoutes } from './routes/managementRoutes'

const allRoutes = [...operationsRoutes, ...managementRoutes]

function AppRoutes() {
  const element = useRoutes(allRoutes)
  return element
}

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
                    <Route path="/*" element={<AppRoutes />} />
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
