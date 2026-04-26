import { Outlet, useLocation } from 'react-router-dom';
import { TopBar } from './TopBar';
import { Sidebar } from './Sidebar';
import { AlertStrip } from '../ui/AlertStrip';
import { NewTaskModal } from '../task/NewTaskModal';
import { OnboardingWizard } from './OnboardingWizard';
import { useAppStore } from '../../store/appStore';
import clsx from 'clsx';
import { useEffect } from 'react';
import { LcdOverlay } from './LcdOverlay';
import { toast } from 'sonner'

export function Shell() {
  const startRealtime = useAppStore(state => state.startRealtime);
  const stopRealtime = useAppStore(state => state.stopRealtime);
  const mutationError = useAppStore(state => state.mutationError)
  const location = useLocation();
  const isBoardRoute = location.pathname.startsWith('/boards/');
  const isWorkspaceRoute = location.pathname === '/' || isBoardRoute;

  useEffect(() => {
    startRealtime();
    return () => stopRealtime();
  }, [startRealtime, stopRealtime]);

  useEffect(() => {
    if (!mutationError) return
    toast.error(mutationError)
  }, [mutationError])

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-surface-secondary">
      <LcdOverlay />
      <TopBar />
      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        <Sidebar />
        <main className="flex min-h-0 flex-1 flex-col overflow-hidden md:ml-14">
          <AlertStrip />
          <div className={clsx(
            'flex min-h-0 flex-1',
            isWorkspaceRoute ? 'px-3 py-4 md:px-4 md:py-4' : 'px-4 py-4 md:px-6 md:py-6',
            isWorkspaceRoute ? 'overflow-hidden' : 'overflow-y-auto',
          )}>
            <Outlet />
          </div>
        </main>
      </div>
      
      <OnboardingWizard />
      <NewTaskModal />
    </div>
  );
}
