import { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Shell } from './components/layout/Shell';

const BoardView = lazy(async () => ({ default: (await import('./pages/BoardView')).BoardView }));
const TasksView = lazy(async () => ({ default: (await import('./pages/TasksView')).TasksView }));
const ApprovalsView = lazy(async () => ({ default: (await import('./pages/ApprovalsView')).ApprovalsView }));
const AgentsView = lazy(async () => ({ default: (await import('./pages/AgentsView')).AgentsView }));
const AuditView = lazy(async () => ({ default: (await import('./pages/AuditView')).AuditView }));

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
          <Route path="/boards/:id" element={<Suspense fallback={<RouteFallback />}><BoardView /></Suspense>} />
          <Route path="/tasks" element={<Suspense fallback={<RouteFallback />}><TasksView /></Suspense>} />
          <Route path="/approvals" element={<Suspense fallback={<RouteFallback />}><ApprovalsView /></Suspense>} />
          <Route path="/agents" element={<Suspense fallback={<RouteFallback />}><AgentsView /></Suspense>} />
          <Route path="/audit" element={<Suspense fallback={<RouteFallback />}><AuditView /></Suspense>} />
          
          <Route path="/" element={<Navigate to="/boards/main" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
