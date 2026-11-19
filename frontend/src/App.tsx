import { lazy, Suspense, type ReactNode } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from './components/AppShell'
import { Spinner } from './components/ui'
import { AiOverviewPage } from './pages/AiOverviewPage'
import { CreatePage } from './pages/CreatePage'
import { DonePage } from './pages/DonePage'
import { GeneratingPage } from './pages/GeneratingPage'
import { HelpPage } from './pages/HelpPage'
import { HomePage } from './pages/HomePage'
import { LoginPage, SignupPage } from './pages/AuthPages'
import { PostsPage } from './pages/PostsPage'
import { ReelEditPage } from './pages/ReelEditPage'
import { ReelGeneratingPage } from './pages/ReelGeneratingPage'
import { ReelLibraryPage } from './pages/ReelLibraryPage'
import { ReelPreviewPage } from './pages/ReelPreviewPage'
import { ReelPublishPage } from './pages/ReelPublishPage'
import { ReelSetupPage } from './pages/ReelSetupPage'
import { RecommendationsPage } from './pages/RecommendationsPage'
import { PreviewPage } from './pages/PreviewPage'
import { ProductsPage } from './pages/ProductsPage'
import { PublishPage } from './pages/PublishPage'
import { SettingsPage } from './pages/SettingsPage'
import { SetupPage } from './pages/SetupPage'
import { WelcomePage } from './pages/WelcomePage'
import { AuthProvider, useAuth } from './state/AuthContext'
import { PostFlowProvider } from './state/PostFlowContext'

// Development-only helpers (sessions and sample drafts for screenshots). Not bundled in production.
const DevRoutes = import.meta.env.DEV ? lazy(() => import('./dev/DevRoutes').then((m) => ({ default: m.DevSeed }))) : null
const DevSession = import.meta.env.DEV ? lazy(() => import('./dev/DevRoutes').then((m) => ({ default: m.DevSession }))) : null

function RequireAuth({ children }: { children: ReactNode }) {
  const { status } = useAuth()
  if (status === 'loading') {
    return (
      <div className="public">
        <Spinner />
      </div>
    )
  }
  return status === 'signedIn' ? <>{children}</> : <Navigate to="/welcome" replace />
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <PostFlowProvider>
          <Routes>
            <Route path="/welcome" element={<WelcomePage />} />
            <Route path="/signup" element={<SignupPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/setup" element={<SetupPage />} />
            {import.meta.env.DEV && DevSession ? <Route path="/dev/session" element={<Suspense><DevSession /></Suspense>} /> : null}
            <Route
              element={
                <RequireAuth>
                  <AppShell />
                </RequireAuth>
              }
            >
              {import.meta.env.DEV && DevRoutes ? <Route path="/dev/seed" element={<Suspense><DevRoutes /></Suspense>} /> : null}
              <Route index element={<HomePage />} />
              <Route path="/create" element={<CreatePage />} />
              <Route path="/create/generating" element={<GeneratingPage />} />
              <Route path="/create/preview" element={<PreviewPage />} />
              <Route path="/create/publish" element={<PublishPage />} />
              <Route path="/create/done" element={<DonePage />} />
              <Route path="/reels" element={<ReelSetupPage />} />
              <Route path="/reels/new" element={<Navigate to="/reels" replace />} />
              <Route path="/reels/library" element={<ReelLibraryPage />} />
              <Route path="/reels/:id" element={<ReelPreviewPage />} />
              <Route path="/reels/:id/generating" element={<ReelGeneratingPage />} />
              <Route path="/reels/:id/edit" element={<ReelEditPage />} />
              <Route path="/reels/:id/publish" element={<ReelPublishPage />} />
              <Route path="/reels/:id/published" element={<ReelPublishPage />} />
              <Route path="/posts" element={<PostsPage />} />
              <Route path="/products" element={<ProductsPage />} />
              <Route path="/recommendations" element={<RecommendationsPage />} />
              <Route path="/ai-insights" element={<AiOverviewPage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="/help" element={<HelpPage />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </PostFlowProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
