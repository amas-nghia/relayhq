import { NavLink } from 'react-router-dom';
import { KanbanSquare, CheckSquare, Hourglass, Bot, FileClock } from 'lucide-react';
import { useAppStore } from '../../store/appStore';
import clsx from 'clsx';
import { motion } from 'motion/react';

export function Sidebar() {
  const pendingCount = useAppStore(state => state.tasks.filter(t => t.status === 'waiting-approval').length);
  const selectedProjectId = useAppStore(state => state.selectedProjectId);
  const setSelectedProjectId = useAppStore(state => state.setSelectedProjectId);
  const projects = useAppStore(state => state.projects);
  const activeAgentsCount = useAppStore(state => state.agents.filter(a => a.state === 'active').length);
  const auditLogs = useAppStore(state => state.auditLogs.slice(0, 5));
  const openTaskDetail = useAppStore(state => state.openTaskDetail);

  const navItems = [
    { name: 'Board', path: '/', icon: KanbanSquare },
    { name: 'Tasks', path: '/tasks', icon: CheckSquare },
    { name: 'Approvals', path: '/approvals', icon: Hourglass, badge: pendingCount > 0 ? pendingCount : 0, badgeColor: 'bg-status-waiting text-white' },
    { name: 'Agents', path: '/agents', icon: Bot, badge: activeAgentsCount, badgeColor: 'bg-status-active text-white' },
    { name: 'Audit', path: '/audit', icon: FileClock },
  ];

  return (
    <aside className="fixed left-0 top-14 bottom-0 w-14 bg-surface-sidebar border-r border-border overflow-y-auto hidden md:flex flex-col items-center py-4">
      <nav className="flex flex-col gap-2 w-full px-2">
        {navItems.map((item) => (
          <NavLink
            key={item.name}
            to={item.path}
            title={item.name}
            className={({ isActive }) => clsx(
              'relative flex items-center justify-center p-2.5 rounded-md transition-all text-sm font-medium w-full',
              isActive
                ? 'bg-accent-light text-accent'
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
        <div className="w-6 border-t border-border mb-2"></div>
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
                  ? "bg-accent text-surface border-accent" 
                  : "bg-surface-secondary border-border text-text-secondary hover:bg-surface hover:text-text-primary hover:border-text-tertiary"
              )}
            >
              {initials}
              <span className={clsx("absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 border-[1.5px] border-surface-sidebar rounded-full", proj.lastActive ? "bg-status-done" : "bg-text-tertiary")} />
            </button>
          )
        })}
        <button 
          title="New Project"
          className="w-10 h-10 rounded-md border text-xl border-dashed border-border flex items-center justify-center text-text-tertiary hover:text-text-primary hover:border-text-tertiary transition-colors mt-1"
        >
          +
        </button>
      </div>

      <div className="w-full border-t border-border px-3 py-3">
        <h3 className="text-[10px] font-bold uppercase tracking-wider text-text-tertiary mb-2">Activity</h3>
        <div className="flex flex-col gap-2">
          {auditLogs.map((log, index) => (
            <motion.button
              key={log.id}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.2, delay: index * 0.04 }}
              onClick={() => log.taskId && openTaskDetail(log.taskId)}
              className="w-full rounded-md border border-border bg-surface-secondary px-2 py-2 text-left text-[11px] text-text-secondary hover:bg-surface"
            >
              <div className="font-medium text-text-primary truncate">{log.action}</div>
              <div className="truncate">{log.description}</div>
            </motion.button>
          ))}
        </div>
      </div>

    </aside>
  );
}
