import { Bot, CheckSquare, FileClock, Hexagon, Hourglass, KanbanSquare, Menu, Monitor, Moon, Sun } from 'lucide-react';
import { useAppStore } from '../../store/appStore';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useState, useEffect, useRef } from 'react';
import clsx from 'clsx';
import { Button } from '../ui/button';
import type { Theme } from '../../types';

const THEME_OPTIONS: ReadonlyArray<{ value: Theme; label: string; icon: typeof Sun }> = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
]

export function TopBar() {
  const activeAgentsCount = useAppStore(state => state.agents.filter(a => a.state === 'active').length);
  const themePreference = useAppStore(state => state.themePreference);
  const setTheme = useAppStore(state => state.setTheme);
  const navigate = useNavigate();
  const location = useLocation();
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const [isThemeMenuOpen, setIsThemeMenuOpen] = useState(false);
  const themeMenuRef = useRef<HTMLDivElement | null>(null);

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

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (themeMenuRef.current && !themeMenuRef.current.contains(event.target as Node)) {
        setIsThemeMenuOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const activeThemeOption = THEME_OPTIONS.find(option => option.value === themePreference) ?? THEME_OPTIONS[2]
  const ActiveThemeIcon = activeThemeOption.icon

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-surface/90 backdrop-blur-md">
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

        <div className="relative flex items-center gap-2" ref={themeMenuRef}>
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="Toggle theme"
            onClick={() => setIsThemeMenuOpen(open => !open)}
          >
            <ActiveThemeIcon className="h-4 w-4" />
          </Button>

          {isThemeMenuOpen && (
            <div className="absolute right-0 top-11 z-40 min-w-40 rounded-xl border border-border bg-surface p-2 shadow-panel">
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
                        'flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors',
                        option.value === themePreference
                          ? 'bg-accent-light text-accent'
                          : 'text-text-secondary hover:bg-surface-secondary hover:text-text-primary'
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
