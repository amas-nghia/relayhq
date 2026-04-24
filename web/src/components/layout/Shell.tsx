import { Outlet, useLocation } from 'react-router-dom';
import { TopBar } from './TopBar';
import { Sidebar } from './Sidebar';
import { AlertStrip } from '../ui/AlertStrip';
import { DetailPanel } from '../task/DetailPanel';
import { NewTaskModal } from '../task/NewTaskModal';
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

  useEffect(() => {
    closeDetail();
  }, [location.pathname, closeDetail]);

  useEffect(() => {
    startPolling();
    return () => stopPolling();
  }, [startPolling, stopPolling]);

  return (
    <div className="flex min-h-screen flex-col bg-surface-secondary">
      <TopBar />
      <div className="relative flex flex-1 overflow-hidden">
        <Sidebar />
        <main className={clsx(
            "flex flex-1 flex-col overflow-hidden transition-all duration-300 md:ml-14",
            isDetailPanelOpen && "md:mr-80"
          )}
        >
          <AlertStrip />
          <div className="flex-1 overflow-y-auto px-4 py-4 md:px-6 md:py-6">
            <Outlet />
          </div>
        </main>
        
        {/* Right side panel */}
        <div 
          className={clsx(
            "fixed top-14 bottom-0 right-0 z-40 w-full transform border-l border-border bg-surface shadow-panel transition-transform duration-300 md:w-80",
            isDetailPanelOpen ? "translate-x-0" : "translate-x-full"
          )}
        >
          {selectedTaskId && <DetailPanel taskId={selectedTaskId} />}
        </div>

        {/* Mobile backdrop for panel */}
        {isDetailPanelOpen && (
          <div 
            className="fixed inset-0 bg-slate-900/20 backdrop-blur-sm z-30 md:hidden"
            onClick={closeDetail}
          />
        )}
      </div>
      
      <NewTaskModal />
    </div>
  );
}
