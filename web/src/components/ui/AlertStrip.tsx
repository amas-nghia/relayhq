import { AlertTriangle, ArrowRight } from 'lucide-react';
import { useAppStore } from '../../store/appStore';
import { useNavigate } from 'react-router-dom';
import { Button } from './button';
import { Badge } from './badge';

export function AlertStrip() {
  const tasks = useAppStore(state => state.tasks);
  const pendingApprovals = tasks.filter(t => t.status === 'waiting-approval');
  const navigate = useNavigate();

  if (pendingApprovals.length === 0) return null;

  const handleReview = () => {
    if (pendingApprovals.length === 1) {
      navigate(`/tasks/${pendingApprovals[0].id}`);
    } else {
      navigate('/approvals');
    }
  };

  return (
    <div className="flex items-center justify-between border-b border-status-waiting/20 bg-brand-muted px-4 py-2 text-text-primary">
      <div className="flex items-center gap-3">
        <Badge variant="secondary" className="border-status-waiting/20 bg-surface text-status-waiting">
          <AlertTriangle className="h-4 w-4" />
        </Badge>
        <span className="text-sm font-medium text-text-primary">
          {pendingApprovals.length === 1 
            ? `${pendingApprovals[0].id} đang chờ bạn approve · "${pendingApprovals[0].title}"` 
            : `${pendingApprovals.length} tasks đang chờ approve`}
        </span>
      </div>
      <Button
        onClick={handleReview}
        variant="outline"
        size="sm"
        className="border-status-waiting/20 bg-surface text-status-waiting hover:bg-status-waiting/10 hover:text-status-waiting"
      >
        Review <ArrowRight className="h-4 w-4" />
      </Button>
    </div>
  );
}
