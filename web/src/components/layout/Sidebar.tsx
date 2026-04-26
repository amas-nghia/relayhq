import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { Bell, Bot, ChevronLeft, ChevronRight, FolderKanban, KanbanSquare, Hourglass, LayoutDashboard, User2 } from 'lucide-react';
import { useAppStore } from '../../store/appStore';
import { NewProjectDialog } from '../project/NewProjectDialog';
import clsx from 'clsx';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Card } from '../ui/card';
import { Separator } from '../ui/separator';
import { Sidebar as SidebarRoot, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupLabel, SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem } from '../ui/sidebar';

const SIDEBAR_COLLAPSED_KEY = 'relayhq-sidebar-collapsed';

export function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const pendingCount = useAppStore(state => state.tasks.filter(t => t.status === 'waiting-approval').length);
  const projects = useAppStore(state => state.projects);
  const activeAgentsCount = useAppStore(state => state.agents.filter(a => a.state === 'active').length);
  const agents = useAppStore(state => state.agents);
  const loadData = useAppStore(state => state.loadData);
  const [openMenu, setOpenMenu] = useState<'notifications' | 'user' | null>(null);
  const [isNewProjectOpen, setIsNewProjectOpen] = useState(false)
  const [isCollapsed, setIsCollapsed] = useState(() => typeof window !== 'undefined' && window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === 'true');
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

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(isCollapsed));
  }, [isCollapsed]);

  const waitingTasks = useMemo(
    () => useAppStore.getState().tasks.filter(task => task.status === 'waiting-approval').slice(0, 5),
    [pendingCount],
  );

  const navItems = [
    { name: 'Board', path: '/', icon: KanbanSquare },
    { name: 'Approvals', path: '/approvals', icon: Hourglass, badge: pendingCount > 0 ? pendingCount : 0, badgeColor: 'bg-status-waiting text-surface' },
    { name: 'Agents', path: '/agents', icon: Bot, badge: activeAgentsCount, badgeColor: 'bg-status-active text-surface' },
    { name: 'Audit', path: '/audit', icon: LayoutDashboard },
  ];

  return (
    <SidebarRoot className={clsx('fixed left-0 top-14 bottom-0 z-20 hidden border-r border-border bg-surface-sidebar md:flex', isCollapsed ? 'w-16' : 'w-64')}>
      <SidebarHeader className={clsx('gap-3', isCollapsed ? 'items-center px-2' : 'px-3')}>
        <div className={clsx('flex items-center gap-2', isCollapsed ? 'justify-center' : '')}>
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-light text-brand">
            <KanbanSquare className="h-4 w-4" />
          </div>
          {!isCollapsed && (
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-text-primary">RelayHQ</div>
              <div className="truncate text-xs text-text-tertiary">Vault-first control plane</div>
            </div>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent className={clsx('gap-5', isCollapsed ? 'px-2' : 'px-3')}>
        <SidebarGroup>
          {!isCollapsed && <SidebarGroupLabel>Workspace</SidebarGroupLabel>}
          <SidebarMenu>
            {navItems.map((item) => (
              <SidebarMenuItem key={item.name}>
                <NavLink
                  to={item.path}
                  title={item.name}
                  className={({ isActive }) => clsx(
                    'flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors',
                    isCollapsed ? 'justify-center' : 'justify-start',
                    isActive ? 'bg-brand-light text-brand' : 'text-text-secondary hover:bg-surface hover:text-text-primary',
                  )}
                >
                  <item.icon className="h-4.5 w-4.5 shrink-0 opacity-90" />
                  {!isCollapsed && <span className="flex-1 truncate">{item.name}</span>}
                  {!!item.badge && (
                    <span className={clsx('ml-auto h-2.5 w-2.5 rounded-full border border-surface', item.badgeColor)} />
                  )}
                </NavLink>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroup>

        <SidebarGroup>
          {!isCollapsed && <SidebarGroupLabel>Projects</SidebarGroupLabel>}
          <SidebarMenu>
            {projects.map(proj => {
              const initials = proj.name.slice(0, 2).toUpperCase();
              const isSelected = location.pathname === `/projects/${proj.id}`;
              return (
                <SidebarMenuItem key={proj.id}>
                  <button
                    type="button"
                    title={proj.name}
                    onClick={() => navigate(`/projects/${proj.id}`)}
                    className={clsx(
                      'flex w-full items-center rounded-md border text-sm transition-colors',
                      isCollapsed ? 'justify-center gap-0 px-2 py-2' : 'justify-start gap-2 px-3 py-2',
                      isSelected
                        ? 'border-brand bg-brand text-surface'
                        : 'border-border bg-surface-secondary text-text-secondary hover:border-text-tertiary hover:bg-surface hover:text-text-primary',
                    )}
                  >
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-transparent text-xs font-bold">
                      {initials}
                    </span>
                    {!isCollapsed && <span className="truncate text-left">{proj.name}</span>}
                    <span className={clsx('ml-auto h-2.5 w-2.5 shrink-0 rounded-full border border-surface-sidebar', proj.lastActive ? 'bg-status-done' : 'bg-text-tertiary')} />
                  </button>
                </SidebarMenuItem>
              )
            })}
          </SidebarMenu>
          <Button
            title="New Project"
            variant="outline"
            size={isCollapsed ? 'icon' : 'default'}
            className={clsx('mt-1 border-dashed', isCollapsed ? 'mx-auto' : 'w-full justify-start')}
            onClick={() => setIsNewProjectOpen(true)}
          >
            <FolderKanban className="h-4 w-4" />
            {!isCollapsed && <span>New Project</span>}
          </Button>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className={clsx('space-y-3', isCollapsed ? 'px-2' : 'px-3')}>
        <Separator />

        <div ref={menuRef} className="space-y-2">
          <div className={clsx('flex gap-2', isCollapsed ? 'flex-col items-center' : 'items-center')}>
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

          <Button
            type="button"
            title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            variant="outline"
            size="icon"
            className="w-full"
            onClick={() => setIsCollapsed(current => !current)}
          >
            {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </Button>

          {openMenu === 'notifications' && (
            <Card className={clsx('absolute bottom-20 z-50 w-80 p-3 shadow-panel', isCollapsed ? 'left-16' : 'left-64')}>
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
            <Card className={clsx('absolute bottom-20 z-50 w-80 p-3 shadow-panel', isCollapsed ? 'left-16' : 'left-64')}>
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
      </SidebarFooter>

      <NewProjectDialog
        open={isNewProjectOpen}
        onClose={() => setIsNewProjectOpen(false)}
        onCreated={async (projectId) => {
          await loadData()
          navigate(`/projects/${projectId}`)
        }}
      />
    </SidebarRoot>
  );
}
