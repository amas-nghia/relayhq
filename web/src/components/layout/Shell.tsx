import { Outlet, useLocation } from 'react-router-dom';
import { TopBar } from './TopBar';
import { Sidebar } from './Sidebar';
import { AlertStrip } from '../ui/AlertStrip';
import { DetailPanel } from '../task/DetailPanel';
import { NewTaskModal } from '../task/NewTaskModal';
import { OnboardingWizard } from './OnboardingWizard';
import { Sheet, SheetContent, SheetOverlay } from '../ui/sheet';
import { useAppStore } from '../../store/appStore';
import clsx from 'clsx';
import { useEffect } from 'react';

export function Shell() {
  const isDetailPanelOpen = useAppStore(state => state.isDetailPanelOpen);
  const selectedTaskId = useAppStore(state => state.selectedTaskId);
  const startPolling = useAppStore(state => state.startPolling);
  const stopPolling = useAppStore(state => state.stopPolling);
  const location = useLocation();
  const closeDetail = useAppStore(state => state.closeTaskDetail);
  const isBoardRoute = location.pathname.startsWith('/boards/');

  useEffect(() => {
    closeDetail();
  }, [location.pathname, closeDetail]);

  useEffect(() => {
    startPolling();
    return () => stopPolling();
  }, [startPolling, stopPolling]);

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-surface-secondary">
      <TopBar />
      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        <Sidebar />
        <main className="flex min-h-0 flex-1 flex-col overflow-hidden md:ml-14">
          <AlertStrip />
          <div className={clsx(
            'flex min-h-0 flex-1 px-4 py-4 md:px-6 md:py-6',
            isBoardRoute ? 'overflow-hidden' : 'overflow-y-auto',
          )}>
            <Outlet />
          </div>
        </main>
        
        <Sheet open={isDetailPanelOpen}>
          <SheetOverlay className="z-30" onClick={closeDetail} />
          <SheetContent className="z-40">
            {selectedTaskId && <DetailPanel taskId={selectedTaskId} />}
          </SheetContent>
        </Sheet>
      </div>
      
      <OnboardingWizard />
      <NewTaskModal />
    </div>
  );
}
