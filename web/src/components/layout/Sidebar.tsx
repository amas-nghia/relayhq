import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { Bell, Bot, ChevronRight, FolderKanban, KanbanSquare, Hourglass, LayoutDashboard, Monitor, Moon, Sun, User2 } from 'lucide-react'
import clsx from 'clsx'
import { useEffect, useMemo, useRef, useState } from 'react'

import { useAppStore } from '../../store/appStore'
import type { Theme } from '../../types'
import { NewProjectDialog } from '../project/NewProjectDialog'
import { ProjectMark } from '../project/ProjectMark'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'
import { Card } from '../ui/card'
import { Separator } from '../ui/separator'
import { Sidebar as SidebarRoot, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupLabel, SidebarHeader, SidebarMenu, SidebarMenuItem, useSidebar } from '../ui/sidebar'

const THEME_OPTIONS: ReadonlyArray<{ value: Theme; label: string; icon: typeof Sun }> = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
]

export function Sidebar() {
  const navigate = useNavigate()
  const location = useLocation()
  const { open, mobileOpen, setMobileOpen } = useSidebar()
  const themePreference = useAppStore(state => state.themePreference)
  const setTheme = useAppStore(state => state.setTheme)
  const pendingCount = useAppStore(state => state.tasks.filter(t => t.status === 'waiting-approval').length)
  const projects = useAppStore(state => state.projects)
  const activeAgentsCount = useAppStore(state => state.agents.filter(a => a.state === 'active').length)
  const agents = useAppStore(state => state.agents)
  const loadData = useAppStore(state => state.loadData)

  const [isNewProjectOpen, setIsNewProjectOpen] = useState(false)
  const [openMenu, setOpenMenu] = useState<'notifications' | 'user' | null>(null)
  const [isThemeMenuOpen, setIsThemeMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const themeMenuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpenMenu(null)
      }

      if (themeMenuRef.current && !themeMenuRef.current.contains(event.target as Node)) {
        setIsThemeMenuOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const waitingTasks = useMemo(
    () => useAppStore.getState().tasks.filter(task => task.status === 'waiting-approval').slice(0, 5),
    [pendingCount],
  )

  const navItems = [
    { name: 'Board', path: '/', icon: KanbanSquare },
    { name: 'Approvals', path: '/approvals', icon: Hourglass, badge: pendingCount > 0 ? pendingCount : 0, badgeColor: 'bg-status-waiting text-surface' },
    { name: 'Agents', path: '/agents', icon: Bot, badge: activeAgentsCount, badgeColor: 'bg-status-active text-surface' },
    { name: 'Audit', path: '/audit', icon: LayoutDashboard },
  ]
  const footerIconButtonClass = 'relative h-9 w-9 shrink-0 text-brand hover:text-brand-bright'
  const sidebarRowClass = 'flex items-center rounded-none px-3 py-2 text-sm uppercase tracking-[0.08em] transition-colors'

  return (
    <SidebarRoot className={clsx('relative md:static', mobileOpen && 'translate-x-0')}>
      <SidebarHeader className={clsx(open ? 'px-3' : 'items-center px-2')}>
        <div className={clsx('flex items-center gap-2', open ? 'justify-start' : 'justify-center')}>
          <img src="/favicon.svg" className="h-9 w-9 shrink-0" alt="RelayHQ" />
          {open && (
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold text-text-primary">RelayHQ</div>
              <div className="truncate text-xs text-text-secondary">Vault-first control plane</div>
            </div>
          )}
          {open && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              title="Switch to Desktop OS"
              className="h-7 shrink-0 px-2 text-[9px] tracking-[0.18em]"
              onClick={() => navigate('/desktop')}
            >
              <Monitor className="h-3.5 w-3.5" />
              OS
            </Button>
          )}
        </div>

      </SidebarHeader>

      <SidebarContent className={open ? 'px-3' : 'px-2'}>
        <SidebarGroup>
          {open && <SidebarGroupLabel>Workspace</SidebarGroupLabel>}
          <SidebarMenu>
            {navItems.map(item => (
              <li key={item.name}>
                <NavLink
                  to={item.path}
                  title={item.name}
                  onClick={() => setMobileOpen(false)}
                  className={({ isActive }) => clsx(
                    sidebarRowClass,
                    open ? 'gap-2 justify-start' : 'justify-center',
                    isActive ? 'bg-brand-muted text-brand' : 'text-text-secondary hover:bg-brand-muted hover:text-brand',
                  )}
                >
                  <item.icon className="h-4.5 w-4.5 shrink-0 opacity-90" />
                  {open && <span className="flex-1 truncate">{item.name}</span>}
                  {!!item.badge && (
                    <span className={clsx('ml-auto h-2.5 w-2.5 rounded-full border border-surface', item.badgeColor)} />
                  )}
                </NavLink>
              </li>
            ))}
          </SidebarMenu>
        </SidebarGroup>

        <SidebarGroup>
          {open && <SidebarGroupLabel>Projects</SidebarGroupLabel>}
          <SidebarMenu>
            {projects.map(project => {
              const selected = location.pathname === `/projects/${project.id}`
              return (
                <li key={project.id}>
                  <button
                    type="button"
                    title={project.name}
                    onClick={() => {
                      navigate(`/projects/${project.id}`)
                      setMobileOpen(false)
                    }}
                    className={clsx(
                      sidebarRowClass,
                      'w-full',
                      open ? 'gap-2 justify-start' : 'justify-center',
                      selected
                        ? 'bg-brand-muted text-brand'
                        : 'text-text-secondary hover:bg-brand-muted hover:text-brand',
                    )}
                  >
                    <ProjectMark className="h-7 w-7 shrink-0" />
                    {open && <span className="truncate text-left">{project.name}</span>}
                    <span className={clsx('ml-auto h-2.5 w-2.5 shrink-0 rounded-none border border-surface-sidebar', project.lastActive ? 'bg-status-done' : 'bg-text-tertiary')} />
                  </button>
                </li>
              )
            })}
            <li>
              <button
                type="button"
                title="New Project"
                onClick={() => setIsNewProjectOpen(true)}
                className={clsx(
                  sidebarRowClass,
                  'w-full',
                  open ? 'gap-2 justify-start' : 'justify-center',
                  'text-text-secondary hover:bg-brand-muted hover:text-brand',
                )}
              >
                <FolderKanban className="h-4.5 w-4.5 shrink-0 opacity-90" />
                {open && <span className="truncate text-left">New Project</span>}
              </button>
            </li>
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className={clsx('relative overflow-visible space-y-3', open ? 'px-3' : 'px-2')}>
        <Separator />

        <div ref={menuRef} className="relative space-y-2">
          <div className={clsx('flex gap-2', open ? 'items-center' : 'flex-col items-center')}>
            <div ref={themeMenuRef} className="relative">
              <Button
                type="button"
                title="Theme"
                variant="outline"
                size="icon"
                className={footerIconButtonClass}
                onClick={() => setIsThemeMenuOpen(current => !current)}
              >
                <Sun className="h-4 w-4" />
              </Button>

              {isThemeMenuOpen && (
                <div className={clsx('absolute bottom-11 z-40 min-w-40 rounded-none border border-accent bg-surface-secondary p-2 shadow-panel', open ? 'left-0' : 'left-12')}>
                  <div className="space-y-1">
                    {THEME_OPTIONS.map(option => {
                      const OptionIcon = option.icon
                      return (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => {
                            setTheme(option.value)
                            setIsThemeMenuOpen(false)
                          }}
                          className={clsx(
                            'flex w-full items-center gap-2 rounded-none px-3 py-2 text-sm uppercase tracking-[0.08em] transition-colors',
                            option.value === themePreference
                              ? 'bg-brand-muted text-accent'
                              : 'text-text-secondary hover:bg-brand-muted hover:text-accent',
                          )}
                        >
                          <OptionIcon className="h-4 w-4" />
                          <span>{option.label}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>

            <Button
              type="button"
              title="Notifications"
              onClick={() => setOpenMenu(current => current === 'notifications' ? null : 'notifications')}
              variant="outline"
              size="icon"
              className={footerIconButtonClass}
            >
              <Bell className="h-4 w-4" />
              {pendingCount > 0 && <span className="absolute -top-1 -right-1 flex min-w-4 items-center justify-center rounded-none bg-status-blocked px-1 text-[10px] font-bold text-surface">{pendingCount}</span>}
            </Button>

            <Button
              type="button"
              title="User and status"
              onClick={() => setOpenMenu(current => current === 'user' ? null : 'user')}
              variant="outline"
              size="icon"
              className={footerIconButtonClass}
            >
              <User2 className="h-4 w-4" />
            </Button>
          </div>

          <div className="pointer-events-none absolute bottom-full left-0 z-50 mb-3 w-80">
          {openMenu === 'notifications' && (
            <Card className={clsx('pointer-events-auto p-3 shadow-panel', open ? 'ml-0' : 'ml-14')}>
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
                      className="flex w-full items-start justify-between gap-3 rounded-none border border-border bg-surface-secondary px-3 py-2 text-left transition-colors hover:bg-brand-muted hover:text-brand"
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
                <div className="rounded-none border border-dashed border-border px-3 py-6 text-center text-sm text-text-tertiary">
                  No pending notifications.
                </div>
              )}
            </Card>
          )}

          {openMenu === 'user' && (
            <Card className={clsx('pointer-events-auto p-3 shadow-panel', open ? 'ml-0' : 'ml-14')}>
              <div className="mb-3 flex items-center gap-3 rounded-none border border-border bg-surface-secondary px-3 py-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-none border border-accent bg-brand-muted text-sm font-bold text-brand">A</div>
                <div>
                  <div className="text-sm font-semibold text-text-primary">amas</div>
                  <div className="text-xs text-text-tertiary">Workspace operator</div>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between rounded-none border border-border bg-surface-secondary px-3 py-2 text-sm">
                  <span className="text-text-secondary">Active agents</span>
                  <span className="font-semibold text-text-primary">{activeAgentsCount}</span>
                </div>
                <div className="flex items-center justify-between rounded-none border border-border bg-surface-secondary px-3 py-2 text-sm">
                  <span className="text-text-secondary">Registered agents</span>
                  <span className="font-semibold text-text-primary">{agents.length}</span>
                </div>
                <button
                  type="button"
                  onClick={() => { navigate('/agents'); setOpenMenu(null); }}
                  className="flex w-full items-center justify-between rounded-none border border-border bg-surface-secondary px-3 py-2 text-sm text-text-primary transition-colors hover:bg-brand-muted hover:text-brand"
                >
                  View agent status
                  <ChevronRight className="h-4 w-4 text-text-tertiary" />
                </button>
              </div>
            </Card>
          )}
          </div>
        </div>
      </SidebarFooter>

      <NewProjectDialog
        open={isNewProjectOpen}
        onClose={() => setIsNewProjectOpen(false)}
        onCreated={async (projectId) => {
          await useAppStore.getState().loadData()
          navigate(`/projects/${projectId}`)
        }}
      />
    </SidebarRoot>
  )
}
