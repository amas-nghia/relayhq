import { Bot, CheckSquare, FileClock, Hexagon, Hourglass, KanbanSquare, Menu, Monitor, Moon, Settings, Sun, X } from 'lucide-react';
import { relayhqApi, type RelayHQBrowseDirectoriesResponse, type RelayHQWebhookEvent } from '../../api/client';
import { useAppStore } from '../../store/appStore';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useState, useEffect, useRef } from 'react';
import clsx from 'clsx';
import { Button } from '../ui/button';
import { Dialog, DialogBody, DialogContent, DialogHeader, DialogOverlay, DialogPanel, DialogTitle } from '../ui/dialog';
import { Input } from '../ui/input';
import type { Theme } from '../../types';

const THEME_OPTIONS: ReadonlyArray<{ value: Theme; label: string; icon: typeof Sun }> = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
]

const WEBHOOK_EVENTS: ReadonlyArray<{ value: RelayHQWebhookEvent; label: string }> = [
  { value: 'task.claimed', label: 'Claimed' },
  { value: 'task.done', label: 'Done' },
  { value: 'task.blocked', label: 'Blocked' },
  { value: 'task.waiting-approval', label: 'Waiting approval' },
]

export function TopBar() {
  const activeAgentsCount = useAppStore(state => state.agents.filter(a => a.state === 'active').length);
  const projects = useAppStore(state => state.projects);
  const selectedProjectId = useAppStore(state => state.selectedProjectId);
  const settings = useAppStore(state => state.settings);
  const loadData = useAppStore(state => state.loadData);
  const themePreference = useAppStore(state => state.themePreference);
  const setTheme = useAppStore(state => state.setTheme);
  const navigate = useNavigate();
  const location = useLocation();
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const [isThemeMenuOpen, setIsThemeMenuOpen] = useState(false);
  const [isProjectSettingsOpen, setIsProjectSettingsOpen] = useState(false);
  const [projectName, setProjectName] = useState('');
  const [codebaseRoot, setCodebaseRoot] = useState('');
  const [confirmDelete, setConfirmDelete] = useState('');
  const [directoryBrowser, setDirectoryBrowser] = useState<RelayHQBrowseDirectoriesResponse | null>(null);
  const [isBrowsingDirectories, setIsBrowsingDirectories] = useState(false);
  const [webhooks, setWebhooks] = useState<Array<{ id?: string; url: string; events: RelayHQWebhookEvent[] }>>([])
  const [isLoadingWebhooks, setIsLoadingWebhooks] = useState(false)
  const [isSavingWebhooks, setIsSavingWebhooks] = useState(false)
  const [testingWebhookIndex, setTestingWebhookIndex] = useState<number | null>(null)
  const themeMenuRef = useRef<HTMLDivElement | null>(null);
  const selectedProject = projects.find(project => project.id === selectedProjectId) ?? projects[0] ?? null

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

  useEffect(() => {
    if (!selectedProject) return
    setProjectName(selectedProject.name)
    setCodebaseRoot(selectedProject.codebaseRoot ?? '')
  }, [selectedProject])

  useEffect(() => {
    if (!isProjectSettingsOpen) return
    setIsLoadingWebhooks(true)
    void relayhqApi.getWebhookSettings()
      .then(response => setWebhooks(response.webhooks.map(webhook => ({ id: webhook.id, url: webhook.url, events: [...webhook.events] }))))
      .finally(() => setIsLoadingWebhooks(false))
  }, [isProjectSettingsOpen])

  async function openDirectoryPicker(path?: string) {
    setIsBrowsingDirectories(true)
    try {
      const browser = await relayhqApi.browseDirectories(path ?? codebaseRoot ?? settings?.resolvedRoot)
      setDirectoryBrowser(browser)
    } finally {
      setIsBrowsingDirectories(false)
    }
  }

  async function saveProjectSettings() {
    if (!selectedProject) return
    await relayhqApi.patchProject(selectedProject.id, {
      patch: {
        name: projectName,
        codebase_root: codebaseRoot || null,
      },
    })
    setIsSavingWebhooks(true)
    try {
      await relayhqApi.saveWebhookSettings({ webhooks })
      await loadData()
      setIsProjectSettingsOpen(false)
    } finally {
      setIsSavingWebhooks(false)
    }
  }

  function addWebhook() {
    setWebhooks(current => [...current, { url: '', events: ['task.done'] }])
  }

  function updateWebhook(index: number, patch: Partial<{ url: string; events: RelayHQWebhookEvent[] }>) {
    setWebhooks(current => current.map((webhook, currentIndex) => currentIndex === index ? { ...webhook, ...patch } : webhook))
  }

  function toggleWebhookEvent(index: number, event: RelayHQWebhookEvent) {
    const webhook = webhooks[index]
    if (!webhook) return
    const events = webhook.events.includes(event)
      ? webhook.events.filter(entry => entry !== event)
      : [...webhook.events, event]
    updateWebhook(index, { events })
  }

  async function testWebhook(index: number) {
    const webhook = webhooks[index]
    if (!webhook || webhook.url.trim().length === 0) return
    setTestingWebhookIndex(index)
    try {
      await relayhqApi.testWebhook({ url: webhook.url, event: webhook.events[0] })
    } finally {
      setTestingWebhookIndex(null)
    }
  }

  async function removeProject() {
    if (!selectedProject || confirmDelete !== selectedProject.name) return
    await relayhqApi.deleteProject(selectedProject.id)
    await loadData()
    setIsProjectSettingsOpen(false)
    navigate('/')
  }

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
          {selectedProject && (
            <Button type="button" variant="outline" size="icon" aria-label="Project settings" onClick={() => setIsProjectSettingsOpen(true)}>
              <Settings className="h-4 w-4" />
            </Button>
          )}
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

      {selectedProject && isProjectSettingsOpen && (
        <Dialog open>
          <DialogOverlay />
          <DialogContent>
            <DialogPanel className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Project settings</DialogTitle>
                <Button variant="ghost" size="icon" onClick={() => setIsProjectSettingsOpen(false)}>
                  <X className="h-4 w-4" />
                </Button>
              </DialogHeader>
              <DialogBody>
                <div className="flex flex-col gap-4">
                  <label className="flex flex-col gap-1.5 text-sm text-text-secondary">
                    Project name
                    <Input value={projectName} onChange={event => setProjectName(event.target.value)} />
                  </label>
                  <label className="flex flex-col gap-1.5 text-sm text-text-secondary">
                    Codebase path
                    <div className="flex gap-2">
                      <Input value={codebaseRoot} onChange={event => setCodebaseRoot(event.target.value)} />
                      <Button type="button" variant="outline" onClick={() => void openDirectoryPicker()} disabled={isBrowsingDirectories}>Browse</Button>
                    </div>
                  </label>
                  <label className="flex flex-col gap-1.5 text-sm text-text-secondary">
                    Vault path
                    <Input value={settings?.vaultRoot || settings?.resolvedRoot || ''} readOnly />
                  </label>
                  <div className="rounded-xl border border-border p-4">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-text-primary">Webhooks</div>
                        <div className="text-xs text-text-tertiary">Notify external tools when tasks change status.</div>
                      </div>
                      <Button type="button" variant="outline" onClick={addWebhook}>Add webhook</Button>
                    </div>
                    <div className="space-y-3">
                      {isLoadingWebhooks && <div className="text-sm text-text-tertiary">Loading webhooks…</div>}
                      {!isLoadingWebhooks && webhooks.length === 0 && <div className="text-sm text-text-tertiary">No webhooks configured.</div>}
                      {webhooks.map((webhook, index) => (
                        <div key={webhook.id ?? `new-${index}`} className="rounded-lg border border-border bg-surface-secondary p-3">
                          <div className="mb-2 flex flex-wrap gap-2">
                            <Input value={webhook.url} onChange={event => updateWebhook(index, { url: event.target.value })} placeholder="https://hooks.slack.com/..." />
                            <Button type="button" variant="outline" onClick={() => setWebhooks(current => current.filter((_, currentIndex) => currentIndex !== index))}>Remove</Button>
                            <Button type="button" variant="outline" onClick={() => void testWebhook(index)} disabled={testingWebhookIndex === index || webhook.url.trim().length === 0}>
                              {testingWebhookIndex === index ? 'Testing…' : 'Test'}
                            </Button>
                          </div>
                          <div className="grid gap-2 md:grid-cols-2">
                            {WEBHOOK_EVENTS.map(event => (
                              <label key={event.value} className="flex items-center gap-2 text-sm text-text-secondary">
                                <input type="checkbox" checked={webhook.events.includes(event.value)} onChange={() => toggleWebhookEvent(index, event.value)} />
                                <span>{event.label}</span>
                              </label>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="rounded-xl border border-status-blocked/20 bg-status-blocked/5 p-4">
                    <div className="mb-2 text-sm font-semibold text-status-blocked">Danger zone</div>
                    <label className="flex flex-col gap-1.5 text-sm text-text-secondary">
                      Type {selectedProject.name} to confirm deletion
                      <Input value={confirmDelete} onChange={event => setConfirmDelete(event.target.value)} />
                    </label>
                    <Button type="button" className="mt-3 bg-status-blocked text-white hover:bg-status-blocked/90" onClick={() => void removeProject()} disabled={confirmDelete !== selectedProject.name}>
                      Delete project
                    </Button>
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button type="button" variant="outline" onClick={() => setIsProjectSettingsOpen(false)}>Cancel</Button>
                    <Button type="button" onClick={() => void saveProjectSettings()} disabled={isSavingWebhooks}>{isSavingWebhooks ? 'Saving…' : 'Save'}</Button>
                  </div>
                </div>
              </DialogBody>
            </DialogPanel>
          </DialogContent>
        </Dialog>
      )}

      {directoryBrowser && (
        <Dialog open>
          <DialogOverlay />
          <DialogContent>
            <DialogPanel className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Choose codebase folder</DialogTitle>
                <Button variant="ghost" size="icon" onClick={() => setDirectoryBrowser(null)}>
                  <X className="h-4 w-4" />
                </Button>
              </DialogHeader>
              <DialogBody>
                <div className="flex flex-col gap-2">
                  {directoryBrowser.entries.map(entry => (
                    <button key={entry.path} type="button" className="rounded-lg border border-border px-3 py-2 text-left text-sm hover:bg-surface-secondary" onClick={() => setCodebaseRoot(entry.path)}>
                      {entry.name}
                    </button>
                  ))}
                </div>
              </DialogBody>
            </DialogPanel>
          </DialogContent>
        </Dialog>
      )}
    </header>
  );
}
