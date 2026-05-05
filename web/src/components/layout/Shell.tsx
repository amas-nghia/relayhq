import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { AlertStrip } from '../ui/AlertStrip';
import { OnboardingWizard } from './OnboardingWizard';
import { useAppStore } from '../../store/appStore';
import clsx from 'clsx';
import { useEffect } from 'react';
import { toast } from 'sonner'
import { SidebarInset, SidebarProvider } from '../ui/sidebar';

export function Shell() {
  const mainContentId = 'main-content';
  const startRealtime = useAppStore(state => state.startRealtime);
  const stopRealtime = useAppStore(state => state.stopRealtime);
  const mutationError = useAppStore(state => state.mutationError)
  const location = useLocation();
  const isDocsRoute = location.pathname === '/docs';

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
      <div className="relative flex h-screen overflow-hidden bg-surface-secondary">
        <a
          href={`#${mainContentId}`}
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:border focus:border-accent focus:bg-surface focus:px-3 focus:py-2 focus:text-sm focus:uppercase focus:tracking-[0.08em] focus:text-text-primary"
        >
          Skip to main content
        </a>
        <div className="relative z-10 flex h-full w-full">
          <Sidebar />
          <SidebarInset id={mainContentId} tabIndex={-1}>
            <AlertStrip />
            <div className={clsx(
              'flex min-h-0 flex-1',
              'px-4 py-4 md:px-6 md:py-6',
              isDocsRoute ? 'overflow-hidden' : 'overflow-y-auto',
            )}>
              <Outlet />
            </div>
          </SidebarInset>
        </div>

        <OnboardingWizard />
      </div>
    </SidebarProvider>
  );
}
