import { Bot, CheckSquare, Hourglass, KanbanSquare, Menu, Monitor } from 'lucide-react';
import { useAppStore } from '../../store/appStore';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import clsx from 'clsx';
import { Button } from '../ui/button';

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
  ];

  useEffect(() => {
    setIsMobileNavOpen(false);
  }, [location.pathname]);

  return (
    <header className="sticky top-0 z-30 border-b border-accent bg-surface-secondary/95 md:hidden">
      <div className="flex h-14 items-center justify-between gap-3 px-3 sm:px-4">
        <div className="flex min-w-0 items-center gap-2 sm:gap-4">
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="md:hidden"
            onClick={() => setIsMobileNavOpen(open => !open)}
            aria-label="Toggle navigation"
          >
            <Menu className="w-4 h-4" />
          </Button>

          <button className="flex min-w-0 items-center gap-2 text-left" onClick={() => navigate('/')}>
            <img src="/favicon.svg" className="h-9 w-9 shrink-0" alt="RelayHQ" />
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold text-text-primary sm:text-base">RelayHQ</span>
              <span className="hidden text-xs text-text-secondary sm:block">Vault-first control plane</span>
            </span>
          </button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 px-3 text-[9px] tracking-[0.18em]"
            onClick={() => navigate('/desktop')}
          >
            <Monitor className="h-4 w-4" />
            DESKTOP
          </Button>
        </div>

      </div>

      <div className="border-t border-accent/70 px-3 py-2 sm:hidden">
        <nav className={clsx('grid gap-2', isMobileNavOpen ? 'grid-cols-2' : 'hidden')}>
          {navItems.map(item => (
            <NavLink
              key={item.name}
              to={item.path}
              className={({ isActive }) => clsx(
                'flex items-center gap-2 rounded-none border px-3 py-2 text-sm font-medium uppercase tracking-[0.08em] transition-colors',
                isActive
                  ? 'border-accent bg-brand-muted text-accent'
                  : 'border-border bg-surface-secondary text-text-secondary hover:bg-brand-muted hover:text-accent'
              )}
            >
              <item.icon className="w-4 h-4 shrink-0" />
              <span className="truncate">{item.name}</span>
              {!!item.badge && (
                <span className="ml-auto rounded-none bg-status-blocked px-1.5 py-0.5 text-[10px] font-bold text-surface">
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
