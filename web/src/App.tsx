import { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Shell } from './components/layout/Shell';

const WorkspaceView = lazy(async () => ({ default: (await import('./pages/WorkspaceView')).default }));
const ApprovalsView = lazy(async () => ({ default: (await import('./pages/ApprovalsView')).ApprovalsView }));
const AgentsView = lazy(async () => ({ default: (await import('./pages/AgentsView')).AgentsView }));
const DocsView = lazy(async () => ({ default: (await import('./pages/DocsView')).DocsView }));
const ProjectView = lazy(async () => ({ default: (await import('./pages/ProjectView')).ProjectView }));
const TaskDetailPage = lazy(async () => ({ default: (await import('./pages/TaskDetailPage')).TaskDetailPage }));

function RouteFallback() {
  return (
    <div className="flex h-full min-h-[320px] items-center justify-center rounded-xl border border-border bg-surface px-6 py-10 text-sm text-text-secondary">
      Loading view…
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Shell />}>
          <Route path="/boards/:id" element={<Suspense fallback={<RouteFallback />}><WorkspaceView /></Suspense>} />
          <Route path="/projects/:id" element={<Suspense fallback={<RouteFallback />}><ProjectView /></Suspense>} />
          <Route path="/tasks/:id" element={<Suspense fallback={<RouteFallback />}><TaskDetailPage /></Suspense>} />
          <Route path="/tasks" element={<Navigate to="/" replace />} />
          <Route path="/approvals" element={<Suspense fallback={<RouteFallback />}><ApprovalsView /></Suspense>} />
          <Route path="/agents" element={<Suspense fallback={<RouteFallback />}><AgentsView /></Suspense>} />
          <Route path="/docs" element={<Suspense fallback={<RouteFallback />}><DocsView /></Suspense>} />
          <Route path="/audit" element={<Navigate to="/" replace />} />
          
          <Route path="/" element={<Suspense fallback={<RouteFallback />}><WorkspaceView /></Suspense>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
