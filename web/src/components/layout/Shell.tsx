import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { AlertStrip } from '../ui/AlertStrip';
import { NewTaskModal } from '../task/NewTaskModal';
import { OnboardingWizard } from './OnboardingWizard';
import { useAppStore } from '../../store/appStore';
import clsx from 'clsx';
import { useEffect } from 'react';
import { LcdOverlay } from './LcdOverlay';
import { toast } from 'sonner'
import { SidebarInset, SidebarProvider, SidebarTrigger } from '../ui/sidebar';

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
    <SidebarProvider>
      <div className="flex h-screen overflow-hidden bg-surface-secondary">
        <LcdOverlay />
        <Sidebar />
        <SidebarInset>
          <SidebarTrigger />
          <AlertStrip />
          <div className={clsx(
            'flex min-h-0 flex-1',
            isWorkspaceRoute ? 'px-3 py-4 md:px-4 md:py-4' : 'px-4 py-4 md:px-6 md:py-6',
            isWorkspaceRoute ? 'overflow-hidden' : 'overflow-y-auto',
          )}>
            <Outlet />
          </div>
        </SidebarInset>

        <OnboardingWizard />
        <NewTaskModal />
      </div>
    </SidebarProvider>
  );
}
