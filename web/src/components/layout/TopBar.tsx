import { Bell, ChevronDown, Bot, CheckSquare, FileClock, Hexagon, Hourglass, KanbanSquare, Menu } from 'lucide-react';
import { useAppStore } from '../../store/appStore';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useState, useRef, useEffect } from 'react';
import clsx from 'clsx';

export function TopBar() {
  const pendingCount = useAppStore(state => state.tasks.filter(t => t.status === 'waiting-approval').length);
  const selectedProjectId = useAppStore(state => state.selectedProjectId);
  const setSelectedProjectId = useAppStore(state => state.setSelectedProjectId);
  const projects = useAppStore(state => state.projects);
  const activeAgentsCount = useAppStore(state => state.agents.filter(a => a.state === 'active').length);
  const navigate = useNavigate();
  const location = useLocation();
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const navItems = [
    { name: 'Board', path: '/boards/main', icon: KanbanSquare },
    { name: 'Tasks', path: '/tasks', icon: CheckSquare },
    { name: 'Approvals', path: '/approvals', icon: Hourglass, badge: pendingCount },
    { name: 'Agents', path: '/agents', icon: Bot, badge: activeAgentsCount },
    { name: 'Audit', path: '/audit', icon: FileClock },
  ];

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    setIsMobileNavOpen(false);
  }, [location.pathname]);

  const selectedProject = projects.find(p => p.id === selectedProjectId);

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-surface/90 backdrop-blur-md">
      <div className="flex h-14 items-center justify-between gap-3 px-3 sm:px-4">
        <div className="flex min-w-0 items-center gap-2 sm:gap-4">
          <button
            type="button"
            className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border text-text-secondary transition-colors hover:bg-surface-secondary md:hidden"
            onClick={() => setIsMobileNavOpen(open => !open)}
            aria-label="Toggle navigation"
          >
            <Menu className="w-4 h-4" />
          </button>

          <button className="flex min-w-0 items-center gap-2 text-left" onClick={() => navigate('/boards/main')}>
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent-light text-accent ring-1 ring-accent/15">
              <Hexagon className="w-5 h-5 fill-current" />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold text-text-primary sm:text-base">RelayHQ</span>
              <span className="hidden text-xs text-text-tertiary sm:block">Vault-first control plane</span>
            </span>
          </button>

          <div className="relative hidden sm:block" ref={dropdownRef}>
            <button 
              className="flex max-w-[240px] items-center gap-2 rounded-md border border-border bg-surface px-3 py-2 text-sm font-medium text-text-secondary transition-colors hover:bg-surface-secondary hover:text-text-primary"
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
            >
              <span className="truncate">{selectedProject ? selectedProject.name : 'All Projects'}</span>
              <ChevronDown className="w-4 h-4 opacity-70" />
            </button>

            {isDropdownOpen && (
              <div className="absolute top-full left-0 mt-1 w-56 rounded-md border border-border bg-surface py-1 shadow-lg z-50">
                <button 
                  className={`w-full text-left px-3 py-1.5 text-sm hover:bg-surface-secondary transition-colors ${selectedProjectId === null ? 'text-accent font-medium' : 'text-text-secondary'}`}
                  onClick={() => { setSelectedProjectId(null); setIsDropdownOpen(false); }}
                >
                  All Projects
                </button>
                {projects.map(proj => (
                  <button 
                    key={proj.id}
                    className={`w-full text-left px-3 py-1.5 text-sm hover:bg-surface-secondary transition-colors ${selectedProjectId === proj.id ? 'text-accent font-medium' : 'text-text-secondary'}`}
                    onClick={() => { setSelectedProjectId(proj.id); setIsDropdownOpen(false); }}
                  >
                    {proj.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <button 
            className="relative flex h-9 w-9 items-center justify-center rounded-md border border-border text-text-secondary transition-colors hover:bg-surface-secondary"
            onClick={() => navigate('/approvals')}
            aria-label="Open approvals"
          >
            <Bell className={`w-4 h-4 ${pendingCount > 0 ? 'text-status-waiting' : 'text-text-secondary'}`} />
            {pendingCount > 0 && (
              <span className="absolute -top-1 -right-1 flex min-w-4 items-center justify-center rounded-full bg-status-blocked px-1 text-[10px] font-bold text-white ring-2 ring-surface">
                {pendingCount}
              </span>
            )}
          </button>
          <button className="flex items-center gap-2 rounded-md border border-border bg-surface px-2 py-1.5 text-sm font-medium text-text-secondary transition-colors hover:bg-surface-secondary hover:text-text-primary sm:px-3">
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-accent-light text-xs font-bold text-accent sm:h-8 sm:w-8">
              A
            </div>
            <span className="hidden md:inline-block">amas</span>
            <ChevronDown className="hidden w-4 h-4 opacity-70 sm:block" />
          </button>
        </div>
      </div>

      <div className="border-t border-border/70 px-3 py-2 sm:hidden">
        <div className="relative mb-2">
          <button
            className="flex w-full items-center justify-between rounded-md border border-border bg-surface px-3 py-2 text-sm font-medium text-text-secondary"
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
          >
            <span className="truncate">{selectedProject ? selectedProject.name : 'All Projects'}</span>
            <ChevronDown className="w-4 h-4 opacity-70" />
          </button>
          {isDropdownOpen && (
            <div className="absolute top-full left-0 right-0 mt-1 rounded-md border border-border bg-surface py-1 shadow-lg z-50">
              <button
                className={`w-full text-left px-3 py-2 text-sm hover:bg-surface-secondary transition-colors ${selectedProjectId === null ? 'text-accent font-medium' : 'text-text-secondary'}`}
                onClick={() => { setSelectedProjectId(null); setIsDropdownOpen(false); }}
              >
                All Projects
              </button>
              {projects.map(proj => (
                <button
                  key={proj.id}
                  className={`w-full text-left px-3 py-2 text-sm hover:bg-surface-secondary transition-colors ${selectedProjectId === proj.id ? 'text-accent font-medium' : 'text-text-secondary'}`}
                  onClick={() => { setSelectedProjectId(proj.id); setIsDropdownOpen(false); }}
                >
                  {proj.name}
                </button>
              ))}
            </div>
          )}
        </div>

        <nav className={clsx('grid gap-2', isMobileNavOpen ? 'grid-cols-2' : 'hidden')}>
          {navItems.map(item => (
            <NavLink
              key={item.name}
              to={item.path}
              className={({ isActive }) => clsx(
                'flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'border-accent bg-accent-light text-accent'
                  : 'border-border bg-surface text-text-secondary hover:bg-surface-secondary hover:text-text-primary'
              )}
            >
              <item.icon className="w-4 h-4 shrink-0" />
              <span className="truncate">{item.name}</span>
              {!!item.badge && (
                <span className="ml-auto rounded-full bg-status-blocked px-1.5 py-0.5 text-[10px] font-bold text-white">
                  {item.badge}
                </span>
              )}
            </NavLink>
          ))}
        </nav>
      </div>
    </header>
  );
}
