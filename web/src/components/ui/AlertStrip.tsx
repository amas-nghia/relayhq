import { AlertTriangle, ArrowRight } from 'lucide-react';
import { useAppStore } from '../../store/appStore';
import { useNavigate } from 'react-router-dom';

export function AlertStrip() {
  const tasks = useAppStore(state => state.tasks);
  const pendingApprovals = tasks.filter(t => t.status === 'waiting-approval');
  const openTaskDetail = useAppStore(state => state.openTaskDetail);
  const navigate = useNavigate();

  if (pendingApprovals.length === 0) return null;

  const handleReview = () => {
    if (pendingApprovals.length === 1) {
      openTaskDetail(pendingApprovals[0].id);
    } else {
      navigate('/approvals');
    }
  };

  return (
    <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 flex items-center justify-between z-20">
      <div className="flex items-center gap-3">
        <AlertTriangle className="w-5 h-5 text-status-waiting" />
        <span className="text-sm font-medium text-amber-900">
          {pendingApprovals.length === 1 
            ? `${pendingApprovals[0].id} đang chờ bạn approve · "${pendingApprovals[0].title}"` 
            : `${pendingApprovals.length} tasks đang chờ approve`}
        </span>
      </div>
      <button 
        onClick={handleReview}
        className="flex items-center gap-1 text-sm font-semibold text-status-waiting hover:text-amber-800 transition-colors"
      >
        Review <ArrowRight className="w-4 h-4" />
      </button>
    </div>
  );
}
