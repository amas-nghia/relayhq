import { NavLink, useNavigate } from 'react-router-dom';
import { Bell, Bot, ChevronRight, FolderKanban, KanbanSquare, Hourglass, User2 } from 'lucide-react';
import { useAppStore } from '../../store/appStore';
import clsx from 'clsx';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Card } from '../ui/card';
import { Separator } from '../ui/separator';

export function Sidebar() {
  const navigate = useNavigate();
  const pendingCount = useAppStore(state => state.tasks.filter(t => t.status === 'waiting-approval').length);
  const selectedProjectId = useAppStore(state => state.selectedProjectId);
  const setSelectedProjectId = useAppStore(state => state.setSelectedProjectId);
  const projects = useAppStore(state => state.projects);
  const activeAgentsCount = useAppStore(state => state.agents.filter(a => a.state === 'active').length);
  const agents = useAppStore(state => state.agents);
  const [openMenu, setOpenMenu] = useState<'notifications' | 'user' | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpenMenu(null);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const waitingTasks = useMemo(
    () => useAppStore.getState().tasks.filter(task => task.status === 'waiting-approval').slice(0, 5),
    [pendingCount],
  );

  const navItems = [
    { name: 'Board', path: '/', icon: KanbanSquare },
    { name: 'Approvals', path: '/approvals', icon: Hourglass, badge: pendingCount > 0 ? pendingCount : 0, badgeColor: 'bg-status-waiting text-surface' },
    { name: 'Agents', path: '/agents', icon: Bot, badge: activeAgentsCount, badgeColor: 'bg-status-active text-surface' },
  ];

  return (
    <aside className="fixed left-0 top-14 bottom-0 z-20 w-14 bg-surface-sidebar border-r border-border overflow-y-auto hidden md:flex flex-col items-center py-4">
      <nav className="flex flex-col gap-2 w-full px-2">
        {navItems.map((item) => (
          <NavLink
            key={item.name}
            to={item.path}
            title={item.name}
              className={({ isActive }) => clsx(
                'relative flex items-center justify-center p-2.5 rounded-md transition-all text-sm font-medium w-full',
                isActive
                  ? 'bg-brand-light text-brand'
                  : 'text-text-secondary hover:bg-surface hover:text-text-primary'
              )}
            >
            <item.icon className="w-5 h-5 opacity-80" />
            {!!item.badge && (
              <span className={clsx('absolute top-1 right-1 w-2.5 h-2.5 rounded-full border border-surface', item.badgeColor)}>
              </span>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="mt-6 flex flex-col gap-2 w-full px-2 flex-1 items-center">
        <Separator className="mb-2 w-6" />
        {projects.map(proj => {
          const initials = proj.name.slice(0, 2).toUpperCase();
          const isSelected = selectedProjectId === proj.id;
          return (
            <button 
              key={proj.id} 
              title={proj.name}
              onClick={() => setSelectedProjectId(isSelected ? null : proj.id)}
              className={clsx(
                "relative w-10 h-10 rounded-md border flex items-center justify-center text-xs font-bold transition-colors",
                isSelected 
                  ? "bg-brand text-surface border-brand" 
                  : "bg-surface-secondary border-border text-text-secondary hover:bg-surface hover:text-text-primary hover:border-text-tertiary"
              )}
            >
              {initials}
              <span className={clsx("absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 border-[1.5px] border-surface-sidebar rounded-full", proj.lastActive ? "bg-status-done" : "bg-text-tertiary")} />
            </button>
          )
        })}
        <Button 
          title="New Project"
          variant="outline"
          size="icon"
          className="mt-1 border-dashed"
        >
          <FolderKanban className="w-4 h-4" />
        </Button>

      </div>

      <div ref={menuRef} className="relative w-full border-t border-border px-2 pt-3">
        <div className="flex flex-col items-center gap-2">
              <Button
                type="button"
                title="Notifications"
                onClick={() => setOpenMenu(current => current === 'notifications' ? null : 'notifications')}
                variant="outline"
            size="icon"
            className="relative"
          >
            <Bell className="h-4 w-4" />
            {pendingCount > 0 && <span className="absolute -top-1 -right-1 flex min-w-4 items-center justify-center rounded-full bg-status-blocked px-1 text-[10px] font-bold text-white">{pendingCount}</span>}
          </Button>

          <Button
            type="button"
            title="User and status"
            onClick={() => setOpenMenu(current => current === 'user' ? null : 'user')}
            variant="outline"
            size="icon"
          >
            <User2 className="h-4 w-4" />
          </Button>
        </div>

        {openMenu === 'notifications' && (
            <Card className="absolute bottom-0 left-14 z-50 w-80 p-3 shadow-panel">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold text-text-primary">Notifications</div>
                  <div className="text-xs text-text-tertiary">Approval queue and review requests</div>
                </div>
              <button type="button" onClick={() => { navigate('/approvals'); setOpenMenu(null); }} className="text-xs font-medium text-brand hover:text-brand-dark">
                Open approvals
              </button>
            </div>

            {waitingTasks.length > 0 ? (
              <div className="space-y-2">
                {waitingTasks.map(task => (
                  <button
                    key={task.id}
                    type="button"
                    onClick={() => { navigate('/approvals'); setOpenMenu(null); }}
                    className="flex w-full items-start justify-between gap-3 rounded-lg border border-border bg-surface-secondary px-3 py-2 text-left transition-colors hover:bg-surface"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-text-primary">{task.title}</div>
                      <div className="truncate text-xs text-text-tertiary">{task.id}</div>
                    </div>
                    <Badge variant="secondary" className="border-status-waiting/20 bg-status-waiting/10 text-status-waiting">review</Badge>
                  </button>
                ))}
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-sm text-text-tertiary">
                No pending notifications.
              </div>
            )}
          </Card>
        )}

        {openMenu === 'user' && (
            <Card className="absolute bottom-0 left-14 z-50 w-80 p-3 shadow-panel">
              <div className="mb-3 flex items-center gap-3 rounded-lg bg-surface-secondary px-3 py-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-light text-sm font-bold text-brand">A</div>
                <div>
                  <div className="text-sm font-semibold text-text-primary">amas</div>
                  <div className="text-xs text-text-tertiary">Workspace operator</div>
                </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between rounded-lg border border-border bg-surface-secondary px-3 py-2 text-sm">
                <span className="text-text-secondary">Active agents</span>
                <span className="font-semibold text-text-primary">{activeAgentsCount}</span>
              </div>
              <div className="flex items-center justify-between rounded-lg border border-border bg-surface-secondary px-3 py-2 text-sm">
                <span className="text-text-secondary">Registered agents</span>
                <span className="font-semibold text-text-primary">{agents.length}</span>
              </div>
              <button
                type="button"
                onClick={() => { navigate('/agents'); setOpenMenu(null); }}
                className="flex w-full items-center justify-between rounded-lg border border-border bg-surface-secondary px-3 py-2 text-sm text-text-primary transition-colors hover:bg-surface"
              >
                View agent status
                <ChevronRight className="h-4 w-4 text-text-tertiary" />
              </button>
            </div>
          </Card>
        )}
      </div>
    </aside>
  );
}
