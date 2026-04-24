import { Bot, CheckSquare, FileClock, Hexagon, Hourglass, KanbanSquare, Menu } from 'lucide-react';
import { useAppStore } from '../../store/appStore';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import clsx from 'clsx';

export function TopBar() {
  const activeAgentsCount = useAppStore(state => state.agents.filter(a => a.state === 'active').length);
  const navigate = useNavigate();
  const location = useLocation();
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);

  const navItems = [
    { name: 'Board', path: '/boards/main', icon: KanbanSquare },
    { name: 'Tasks', path: '/tasks', icon: CheckSquare },
    { name: 'Approvals', path: '/approvals', icon: Hourglass },
    { name: 'Agents', path: '/agents', icon: Bot, badge: activeAgentsCount },
    { name: 'Audit', path: '/audit', icon: FileClock },
  ];

  useEffect(() => {
    setIsMobileNavOpen(false);
  }, [location.pathname]);

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
        </div>
      </div>

      <div className="border-t border-border/70 px-3 py-2 sm:hidden">
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
