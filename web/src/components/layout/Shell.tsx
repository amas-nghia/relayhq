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
    <div className="flex flex-col h-screen overflow-hidden bg-surface-secondary">
      <TopBar />
      <div className="flex flex-1 mt-14 overflow-hidden relative">
        <Sidebar />
        <main className={clsx(
            "flex-1 flex flex-col h-full overflow-hidden transition-all duration-300 md:ml-14",
            isDetailPanelOpen && "md:mr-80"
          )}
        >
          <AlertStrip />
          <div className="flex-1 overflow-y-auto p-4 md:p-6">
            <Outlet />
          </div>
        </main>
        
        {/* Right side panel */}
        <div 
          className={clsx(
            "fixed top-14 bottom-0 right-0 w-full md:w-80 bg-surface border-l border-border shadow-panel transition-transform duration-300 z-40 transform",
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
