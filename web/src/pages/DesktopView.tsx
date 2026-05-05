import { useState, useCallback, useEffect, useLayoutEffect, useRef, Fragment, Suspense, lazy, useMemo, type CSSProperties, type ComponentType, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Rnd } from 'react-rnd';
import { KanbanSquare, List, Bot, ClipboardCheck, FileText, Activity, Settings, FolderOpen, FolderKanban, Check, AlertCircle, Copy, Eye, EyeOff, Play, CalendarClock, AlertTriangle, MessageSquare } from 'lucide-react';
import { OnboardingWizard } from '../components/layout/OnboardingWizard';
import { relayhqApi, type AgentActivityEvent, type AgentRuntimeReadinessResponse, type AgentSessionEventRecord, type AgentSessionRecord, type AnalyticsDashboardResponse, type RelayHQApiKeyEntry } from '../api/client';
import type { ActiveAgentSession } from '../api/contract';
import { useAppStore } from '../store/appStore';
import { readStoredTheme, setTheme, THEME_CHANGE_EVENT, type AppTheme } from '../lib/theme';
import { Button } from '../components/ui/button';
import { DetailPanel } from '../components/task/DetailPanel';
import { Input } from '../components/ui/input';
import { Textarea } from '../components/ui/textarea';
import { AgentSpriteFrame } from '../components/agent/AgentSpriteFrame';
import { AgentPixelAvatar } from '../components/agent/AgentPixelAvatar';
import { Select } from '../components/ui/select';
import { AgentSetupWizard } from '../components/layout/AgentSetupWizard';
import { RuntimeTruthBadges, RuntimeTruthMessage } from '../components/agent/RuntimeTruth';
import { DesktopAgentScene, type DesktopAgentSceneEntity } from '../components/live-world/DesktopAgentScene';
import type { Agent, Project, Task } from '../types';
import { resolveDesktopProjectSelection, withDesktopProject, withoutDesktopProject } from './desktopProjectUrl';

const BoardView      = lazy(async () => ({ default: (await import('./BoardView')).BoardView }));
const TasksView      = lazy(async () => ({ default: (await import('./TasksView')).TasksView }));
const AgentsView     = lazy(async () => ({ default: (await import('./AgentsView')).AgentsView }));
const ApprovalsView  = lazy(async () => ({ default: (await import('./ApprovalsView')).ApprovalsView }));
const AuditView      = lazy(async () => ({ default: (await import('./AuditView')).AuditView }));
const DocsView       = lazy(async () => ({ default: (await import('./DocsView')).DocsView }));
const SchedulerView  = lazy(async () => ({ default: (await import('./SchedulerView')).SchedulerView }));

// ─── Types ────────────────────────────────────────────────────────────────────

interface WindowState {
  id: string;
  title: string;
  x: number;
  y: number;
  w: number;
  h: number;
  minimized: boolean;
  maximized: boolean;
  restore?: { x: number; y: number; w: number; h: number };
  zIndex: number;
  content: WindowContentId;
  taskId?: string;
}

interface ProjectDesktopState {
  windows: ReadonlyArray<WindowState>;
  agentWindow: AgentWindowState | null;
  coordinatorWindow: AgentWindowState | null;
}

type WindowContentId = 'projects' | 'board' | 'tasks' | 'agents' | 'approvals' | 'docs' | 'audit' | 'settings' | 'schedule' | 'task-detail';
type DesktopIconId = WindowContentId | 'coordinator-action';

interface AgentSprite {
  id: string;
  agentId: string;
  sessionId: string;
  name: string;
  x: number;
  y: number;
  projectId?: string | null;
  status: 'idle' | 'working' | 'reading' | 'waiting' | 'blocked';
  sessionActive?: boolean;
  sessionVisible?: boolean;
  color: string;
  bubbleText?: string | null;
  role?: string | null;
  provider?: string | null;
  model?: string | null;
  runtimeKind?: string | null;
  runMode?: string | null;
  verificationStatus?: string | null;
  aliases?: ReadonlyArray<string>;
  capabilities?: ReadonlyArray<string>;
  skillFile?: string | null;
  skillFiles?: ReadonlyArray<string>;
  body?: string | null;
  sourcePath?: string | null;
  spriteAsset?: string | null;
  launchSurface?: ActiveAgentSession['launchSurface'];
  sessionStatus?: ActiveAgentSession['status'];
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DESKTOP_ICONS: { id: WindowContentId; label: string; Icon: ComponentType<{ className?: string }> }[] = [
  { id: 'projects',  label: 'Projects',  Icon: FolderKanban   },
  { id: 'board',     label: 'Board',     Icon: KanbanSquare   },
  { id: 'tasks',     label: 'Tasks',     Icon: List           },
  { id: 'agents',    label: 'Agents',    Icon: Bot            },
  { id: 'schedule',  label: 'Schedule',  Icon: CalendarClock  },
  { id: 'approvals', label: 'Approvals', Icon: ClipboardCheck },
  { id: 'docs',      label: 'Docs',      Icon: FileText       },
  { id: 'audit',     label: 'Audit',     Icon: Activity       },
  { id: 'settings',  label: 'Settings',  Icon: Settings       },
];

const COORDINATOR_DESKTOP_ICON = 'coordinator-action' as const satisfies DesktopIconId;

const DESKTOP_ICON_GRID = 24;
const DESKTOP_ICON_SIZE = { w: 72, h: 88 };
const DESKTOP_ICON_STATE_KEY = 'relayhq-desktop-icon-positions';
const DESKTOP_SCENE_STATE_KEY = 'relayhq-desktop-scene-state';
const DESKTOP_TOPBAR_HEIGHT = 56;
const DESKTOP_FULLSCREEN_TOP = DESKTOP_TOPBAR_HEIGHT;
const DESKTOP_ICON_LANE_WIDTH = 192;
const DESKTOP_AGENT_SPAWN_PADDING = 56;
const DEFAULT_DESKTOP_SCENE_KEY = '__desktop-default__';
const DESKTOP_RECENT_TRACE_MS = 90_000;
const DESKTOP_RUNNING_SESSION_STALE_MS = 10 * 60 * 1000;
const WORLD_AGENT_FRAME = { width: 128, height: 152, spriteWidth: 104, spriteHeight: 104 };
const STATUS_COLOR: Record<AgentSprite['status'], string> = {
  idle: '#8f8466',
  working: '#f59e0b',
  reading: '#60a5fa',
  waiting: '#c084fc',
  blocked: '#fb7185',
};
const RUNTIME_OPTIONS = [
  { id: 'opencode', label: 'OpenCode' },
  { id: 'claude-code', label: 'Claude Code' },
  { id: 'codex', label: 'Codex' },
] as const;

function eventIcon(eventType: string) {
  if (eventType === 'session_start') return <Play className="h-3.5 w-3.5 text-brand" />;
  if (eventType === 'heartbeat') return <Activity className="h-3.5 w-3.5 text-status-active" />;
  if (eventType === 'approval_requested') return <AlertCircle className="h-3.5 w-3.5 text-status-waiting" />;
  if (eventType === 'task_completed') return <Check className="h-3.5 w-3.5 text-status-done" />;
  return <Activity className="h-3.5 w-3.5 text-text-tertiary" />;
}

function eventLabel(eventType: string) {
  if (eventType === 'session_start') return 'Session started';
  if (eventType === 'heartbeat') return 'Heartbeat';
  if (eventType === 'approval_requested') return 'Approval requested';
  if (eventType === 'task_completed') return 'Task completed';
  if (eventType === 'task_claimed') return 'Task claimed';
  return eventType.replace(/_/g, ' ');
}

function formatCurrency(value: number) {
  return `$${value.toFixed(2)}`;
}

function formatPercent(value: number | null) {
  return value == null ? '—' : `${value.toFixed(1)}%`;
}

function formatDays(value: number | null) {
  return value == null ? '—' : `${value.toFixed(value >= 10 ? 0 : 1)}d`;
}

function normalizePreviewText(value: string | null | undefined) {
  if (!value) return null;

  const candidate = value
    .replace(/\[(tool_use|raw)\]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (candidate.length < 6) return null;
  if (/^(true|false|null|undefined)$/i.test(candidate)) return null;
  return candidate;
}

function truncatePreviewText(value: string | null | undefined, limit = 96) {
  const candidate = normalizePreviewText(value);
  if (!candidate) return null;
  if (candidate.length <= limit) return candidate;
  return `${candidate.slice(0, limit - 1).trimEnd()}…`;
}

function eventPreviewText(events: ReadonlyArray<AgentSessionEventRecord>) {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (event.type !== 'reasoning.summary' && event.type !== 'terminal.stdout' && event.type !== 'user.message') {
      continue;
    }

    const preview = truncatePreviewText(event.text);
    if (preview) return preview;
  }

  return null;
}

function dedupeAgentSessionsBySessionId(sessions: ReadonlyArray<AgentSessionRecord>) {
  const seen = new Set<string>();
  const deduped: AgentSessionRecord[] = [];

  for (const session of sessions) {
    if (seen.has(session.sessionId)) continue;
    seen.add(session.sessionId);
    deduped.push(session);
  }

  return deduped;
}

function pickPreferredCoordinatorSession(
  sessions: ReadonlyArray<AgentSessionRecord>,
  preferredSessionId: string | null,
) {
  const exactMatch = preferredSessionId
    ? sessions.find((session) => session.sessionId === preferredSessionId) ?? null
    : null;

  if (exactMatch) return exactMatch;

  const latestRunningSession = sessions.find((session) => session.launchSurface === 'background' && session.status === 'running') ?? null;
  if (latestRunningSession) return latestRunningSession;

  return sessions[0] ?? null;
}

function isReadingLikePreview(value: string | null | undefined) {
  if (!value) return false;
  return /\b(search|grep|rg|read|reading|inspect|scan|list|open|trace|review|analy[sz]e|context|doc|docs|file|files)\b/i.test(value);
}

function isWorkingLikePreview(value: string | null | undefined) {
  if (!value) return false;
  return /\b(write|writing|edit|editing|implement|fix|patch|build|test|run|running|ship|create|update|refactor|compile|validate)\b/i.test(value);
}

function taskPreviewText(task: Task | null | undefined) {
  if (!task) return null;
  return truncatePreviewText(
    task.approvalReason
      ?? task.blockedReason
      ?? task.result
      ?? task.executionNotes
      ?? task.description
      ?? task.title,
  );
}

function inferAgentDesktopStatus(options: {
  agentState: Agent['state'];
  activeTask: Task | null;
  waitingTask: Task | null;
  blockedTask: Task | null;
  latestSession: Pick<DesktopRuntimeSession, 'status'> | null;
  previewText: string | null;
}): AgentSprite['status'] {
  const { agentState, activeTask, waitingTask, blockedTask, latestSession, previewText } = options;

  if (blockedTask || agentState === 'stale') {
    return 'blocked';
  }

  if (waitingTask || activeTask?.status === 'review' || activeTask?.status === 'scheduled') {
    return 'waiting';
  }

  if (isReadingLikePreview(previewText)) {
    return 'reading';
  }

  if (activeTask || ((latestSession?.status === 'running' || latestSession?.status === 'handed-off' || latestSession?.status === 'attached') && isWorkingLikePreview(previewText))) {
    return 'working';
  }

  if (latestSession?.status === 'running' || latestSession?.status === 'handed-off' || latestSession?.status === 'attached') {
    return 'reading';
  }

  return 'idle';
}

type DesktopRuntimeSession = {
  sessionId: string;
  agentId: string | null;
  agentName: string;
  lastSeenAt: string;
  idleSeconds: number;
  taskId?: string;
  provider?: string;
  runtimeKind?: string;
  launchSurface?: 'background' | 'visible-terminal' | 'attached';
  launchMode?: 'fresh' | 'resume' | 'attached';
  resumedFromSessionId?: string | null;
  status: 'starting' | 'running' | 'handed-off' | 'completed' | 'failed' | 'stopped' | 'attached';
  command?: string;
  cwd?: string | null;
  pid?: number;
  startTime: string;
  lastEventAt: string;
  source: 'runner' | 'attached' | 'recorded';
}

interface DesktopAgentRuntimeSnapshot {
  session: DesktopRuntimeSession;
  events: ReadonlyArray<AgentSessionEventRecord>;
}

function isDesktopSessionLive(session: Pick<DesktopRuntimeSession, 'status' | 'lastEventAt'>, nowMs: number) {
  if (session.status !== 'running' && session.status !== 'handed-off' && session.status !== 'attached') return false;
  const lastEventAtMs = Date.parse(session.lastEventAt);
  if (Number.isNaN(lastEventAtMs)) return false;
  return nowMs - lastEventAtMs <= DESKTOP_RUNNING_SESSION_STALE_MS;
}

function shouldKeepDesktopSessionTrace(session: Pick<DesktopRuntimeSession, 'status' | 'lastEventAt'>, nowMs: number) {
  if (session.status === 'stopped') return false;
  if (isDesktopSessionLive(session, nowMs)) return true;
  const lastEventAtMs = Date.parse(session.lastEventAt);
  if (Number.isNaN(lastEventAtMs)) return false;
  return nowMs - lastEventAtMs <= DESKTOP_RECENT_TRACE_MS;
}

function positionForIndex(index: number) {
  const column = index % 2;
  const row = Math.floor(index / 2);
  return {
    x: 24 + column * 96,
    y: 48 + row * 96,
  };
}

function positionForAgentIndex(index: number) {
  const viewportWidth = typeof window === 'undefined' ? 1440 : window.innerWidth;
  const viewportHeight = typeof window === 'undefined' ? 900 : window.innerHeight;
  const minX = DESKTOP_ICON_LANE_WIDTH + DESKTOP_AGENT_SPAWN_PADDING;
  const maxX = Math.max(minX, viewportWidth - WORLD_AGENT_FRAME.width - 72);
  const xGap = 160;
  const yGap = 156;
  const usableWidth = Math.max(xGap, maxX - minX);
  const columns = Math.max(2, Math.floor(usableWidth / xGap) + 1);
  const column = index % columns;
  const row = Math.floor(index / columns);
  const groundY = Math.max(DESKTOP_TOPBAR_HEIGHT + 24, viewportHeight - DESKTOP_TOPBAR_HEIGHT - WORLD_AGENT_FRAME.height - 16);
  const staggerOffset = row % 2 === 0 ? 0 : Math.min(28, xGap / 2);

  return {
    x: Math.min(maxX, minX + column * xGap + staggerOffset),
    y: Math.max(DESKTOP_TOPBAR_HEIGHT + 24, groundY - row * yGap),
  };
}

function clampDesktopWindowPosition(x: number, y: number) {
  return {
    x: Math.max(0, x),
    y: Math.max(DESKTOP_FULLSCREEN_TOP, y),
  };
}

// ─── Settings panel ────────────────────────────────────────────────────────────

const PROVIDERS = [
  { id: 'anthropic', label: 'Anthropic',  envVar: 'ANTHROPIC_API_KEY',  models: ['claude-sonnet-4-6', 'claude-opus-4-7', 'claude-haiku-4-5', 'claude-opus-4-5', 'claude-sonnet-4-5'] },
  { id: 'openai',    label: 'OpenAI',     envVar: 'OPENAI_API_KEY',     models: ['gpt-5.5-pro', 'gpt-5.5', 'gpt-5.4', 'gpt-5.4-mini', 'gpt-4-turbo'] },
  { id: 'google',    label: 'Google',     envVar: 'GOOGLE_API_KEY',     models: ['gemini-2.0-flash', 'gemini-1.5-pro', 'gemini-1.5-flash'] },
] as const;

function SettingsPanel() {
  const settings  = useAppStore(state => state.settings);
  const loadData  = useAppStore(state => state.loadData);

  const [tab, setTab] = useState<'vault' | 'agent' | 'routing'>('vault');

  // ── vault tab state ──
  const [vaultRoot,    setVaultRoot]    = useState(settings?.vaultRoot ?? settings?.resolvedRoot ?? '');
  const [maxConcurrentRuntimeInstances, setMaxConcurrentRuntimeInstances] = useState(String(settings?.maxConcurrentRuntimeInstances ?? 1));
  const [theme, setThemeState] = useState<AppTheme>(() => readStoredTheme());
  const [browsePath,   setBrowsePath]   = useState<string | null>(null);
  const [browseParent, setBrowseParent] = useState<string | null>(null);
  const [dirs,         setDirs]         = useState<string[]>([]);
  const [vaultStatus,  setVaultStatus]  = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [vaultError,   setVaultError]   = useState<string | null>(null);
  const [taskRoutingText, setTaskRoutingText] = useState('')

  // ── agent tab state ──
  const [providerId,   setProviderId]   = useState<string>('anthropic');
  const [model,        setModel]        = useState<string>('claude-sonnet-4-6');
  const [detectedKeys, setDetectedKeys] = useState<RelayHQApiKeyEntry[]>([]);
  const [selectedEnvVar, setSelectedEnvVar] = useState<string>('');
  const [manualKey,    setManualKey]    = useState('');
  const [showManual,   setShowManual]   = useState(false);
  const [keyCopied,    setKeyCopied]    = useState(false);

  const provider = PROVIDERS.find(p => p.id === providerId) ?? PROVIDERS[0];
  const providerKeys = detectedKeys.filter(k => k.provider === providerId);
  const activeKey = selectedEnvVar
    ? detectedKeys.find(k => k.envVar === selectedEnvVar)
    : null;
  const shellLine = `export ${activeKey?.envVar ?? provider.envVar}="${manualKey || 'YOUR_API_KEY'}"`;

  useEffect(() => {
    setVaultRoot(settings?.vaultRoot ?? settings?.resolvedRoot ?? '')
    setMaxConcurrentRuntimeInstances(String(settings?.maxConcurrentRuntimeInstances ?? 1))
    setTaskRoutingText(JSON.stringify(settings?.taskRouting ?? { tagAliases: {} }, null, 2))
  }, [settings?.maxConcurrentRuntimeInstances, settings?.resolvedRoot, settings?.taskRouting, settings?.vaultRoot])

  useEffect(() => {
    relayhqApi.getApiKeys().then(res => {
      setDetectedKeys(res.keys);
      const first = res.keys.find(k => k.provider === 'anthropic' && k.isSet);
      if (first) setSelectedEnvVar(first.envVar);
    }).catch(() => {});
  }, []);

  const browse = async (path?: string) => {
    try {
      const res = await relayhqApi.browseDirectories(path);
      setBrowsePath(res.currentPath);
      setBrowseParent(res.parentPath);
      setDirs(res.entries.map(e => e.path));
    } catch { /* ignore */ }
  };

  const saveVault = async () => {
    setVaultStatus('saving'); setVaultError(null);
    try {
      const parsedTaskRouting = JSON.parse(taskRoutingText) as { tagAliases?: Record<string, string[]> }
      await relayhqApi.saveSettings({
        vaultRoot,
        workspaceId: null,
        maxConcurrentRuntimeInstances: Number.parseInt(maxConcurrentRuntimeInstances, 10) || 1,
        taskRouting: {
          tagAliases: parsedTaskRouting?.tagAliases ?? {},
        },
      });
      await loadData();
      setVaultStatus('saved');
      setTimeout(() => setVaultStatus('idle'), 2000);
    } catch (e) {
      setVaultError(e instanceof Error ? e.message : 'Failed to save');
      setVaultStatus('error');
    }
  };

  const copyShellLine = async () => {
    await navigator.clipboard.writeText(shellLine);
    setKeyCopied(true);
    setTimeout(() => setKeyCopied(false), 1600);
  };

  const writeToShell = async (target: 'zshrc' | 'bashrc') => {
    try {
      await relayhqApi.writeShellProfile(target);
    } catch { /* ignore */ }
  };

  const applySelectedTheme = (nextTheme: AppTheme) => {
    setThemeState(nextTheme)
    setTheme(nextTheme)
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Tabs */}
      <div className="flex border-b border-border flex-shrink-0">
        {(['vault', 'agent', 'routing'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
                className={`px-5 py-2.5 text-[10px] font-display uppercase tracking-widest border-r border-border transition-colors
              ${tab === t ? 'text-brand bg-brand-muted' : 'text-text-tertiary hover:text-text-primary'}`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto lane-scroll p-5 flex flex-col gap-5">

        {/* ── VAULT TAB ── */}
        {tab === 'vault' && (
          <>
            <div>
              <div className="text-[9px] font-display text-text-tertiary uppercase tracking-widest mb-3">Vault location</div>
              {settings && (
                <div className={`flex items-center gap-2 px-3 py-2 mb-3 border text-[10px] font-display
                  ${settings.isValid ? 'border-status-done/40 bg-status-done/5 text-status-done' : 'border-status-blocked/40 bg-status-blocked/5 text-status-blocked'}`}>
                  {settings.isValid ? <Check className="h-3 w-3 flex-shrink-0" /> : <AlertCircle className="h-3 w-3 flex-shrink-0" />}
                  <span className="truncate">{settings.isValid ? settings.resolvedRoot : (settings.invalidReason ?? 'Not configured')}</span>
                </div>
              )}
              <div className="flex gap-2">
                <input
                  value={vaultRoot}
                  onChange={e => setVaultRoot(e.target.value)}
                  placeholder={settings?.resolvedRoot ?? '/path/to/vault'}
                  className="flex-1 bg-surface-secondary border border-border px-3 py-2 text-[11px] text-text-primary placeholder:text-text-tertiary outline-none focus:border-brand font-body"
                />
                <button onClick={() => void browse(vaultRoot || undefined)}
                  className="lcd-button flex items-center gap-1.5 px-3 py-2 border border-border bg-surface text-text-secondary hover:text-text-primary text-[10px] font-display">
                  <FolderOpen className="h-3.5 w-3.5" /> Browse
                </button>
              </div>

              {browsePath !== null && (
                <div className="mt-2 border border-border bg-surface-secondary max-h-36 overflow-y-auto lane-scroll">
                  <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border">
                    <span className="text-[9px] font-display text-text-tertiary truncate flex-1">{browsePath}</span>
                    {browseParent !== null && (
                      <button onClick={() => void browse(browseParent)} className="text-[9px] font-display text-brand hover:underline flex-shrink-0">↑ up</button>
                    )}
                  </div>
                  {dirs.map(d => (
                    <button key={d} onClick={() => { setVaultRoot(d); void browse(d); }}
                      className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[10px] text-text-secondary hover:bg-surface hover:text-text-primary border-b border-border/50 last:border-0">
                      <FolderOpen className="h-3 w-3 flex-shrink-0 text-brand opacity-60" />
                      <span className="truncate">{d.split('/').pop()}</span>
                    </button>
                  ))}
                  {dirs.length === 0 && <div className="px-3 py-3 text-[10px] text-text-tertiary">No subdirectories</div>}
                </div>
              )}

              <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,220px)_1fr]">
                <label className="flex flex-col gap-1 text-[10px] font-display uppercase tracking-widest text-text-tertiary">
                  Runtime slots
                  <input
                    type="number"
                    min={1}
                    step={1}
                    value={maxConcurrentRuntimeInstances}
                    onChange={e => setMaxConcurrentRuntimeInstances(e.target.value)}
                    className="bg-surface-secondary border border-border px-3 py-2 text-[11px] text-text-primary outline-none focus:border-brand font-body"
                  />
                </label>
                <div className="border border-border bg-surface-secondary px-3 py-2 text-[10px] text-text-secondary">
                  <div className="font-display uppercase tracking-widest text-text-tertiary">Capacity</div>
                  <div className="mt-2 text-text-primary">
                    {settings?.runtimeCapacity.activeRuntimeInstances ?? 0} active / {settings?.runtimeCapacity.maxConcurrentRuntimeInstances ?? settings?.maxConcurrentRuntimeInstances ?? 1} configured
                  </div>
                  <div className="mt-1">
                    {settings?.runtimeCapacity.availableRuntimeSlots ?? (settings?.maxConcurrentRuntimeInstances ?? 1)} slots free
                    {(settings?.runtimeCapacity.capacityBlockedTaskCount ?? 0) > 0 ? ` · ${settings?.runtimeCapacity.capacityBlockedTaskCount} tasks waiting on capacity` : ''}
                  </div>
                </div>
              </div>

              <div className="mt-5">
                <div className="text-[9px] font-display text-text-tertiary uppercase tracking-widest mb-3">Theme</div>
                <div className="grid gap-2 md:grid-cols-2">
                  {([
                    {
                      id: 'pipboy',
                      label: 'Pipboy',
                      note: 'Current amber CRT theme',
                      swatches: ['#1a0f05', '#221409', '#f59e0b', '#ffcf86'],
                    },
                    {
                      id: 'papernote',
                      label: 'Papernote',
                      note: 'Warm paper and dark ink notes',
                      swatches: ['#f4efe4', '#e8dfcf', '#6f4e37', '#2f241d'],
                    },
                    {
                      id: 'papernote-dark',
                      label: 'Papernote Dark',
                      note: 'Muted paper notes in dark mode',
                      swatches: ['#191512', '#241e19', '#d9b38c', '#f2ddc8'],
                    },
                  ] as const).map(option => (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => applySelectedTheme(option.id)}
                      className={`rounded-lg border px-3 py-3 text-left transition-colors ${theme === option.id ? 'border-brand bg-brand-muted text-text-primary' : 'border-border bg-surface text-text-secondary hover:text-text-primary'}`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="text-[10px] font-display uppercase tracking-widest">{option.label}</div>
                          <div className="mt-1 text-[11px] font-body">{option.note}</div>
                        </div>
                        <div className="flex gap-1">
                          {option.swatches.map(color => (
                            <span key={color} className="h-4 w-4 border border-border" style={{ backgroundColor: color }} />
                          ))}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
                <p className="mt-2 text-[10px] text-text-tertiary">Applied instantly and stored locally in this browser.</p>
              </div>
            </div>

            {vaultError && (
              <div className="border border-status-blocked/40 bg-status-blocked/5 px-3 py-2 text-[10px] text-status-blocked font-display">{vaultError}</div>
            )}

            <button onClick={() => void saveVault()} disabled={vaultStatus === 'saving' || !vaultRoot.trim()}
              className="lcd-button self-start flex items-center gap-2 px-4 py-2 border border-brand bg-brand-muted text-brand text-[10px] font-display uppercase tracking-wider disabled:opacity-50 disabled:cursor-not-allowed">
              {vaultStatus === 'saving' && <span className="animate-pulse">···</span>}
              {vaultStatus === 'saved' && <Check className="h-3.5 w-3.5" />}
              {vaultStatus === 'saved' ? 'Saved' : vaultStatus === 'saving' ? 'Saving' : 'Save'}
            </button>
          </>
        )}

        {/* ── AGENT TAB ── */}
        {tab === 'agent' && (
          <>
            {/* Provider */}
            <div>
              <div className="text-[9px] font-display text-text-tertiary uppercase tracking-widest mb-3">Provider</div>
              <div className="flex gap-2">
                {PROVIDERS.map(p => (
                  <button key={p.id} onClick={() => { setProviderId(p.id); setModel(p.models[0]); }}
                    className={`lcd-button flex-1 py-2 text-[9px] font-display uppercase tracking-wide border transition-colors
                      ${providerId === p.id ? 'border-brand bg-brand-muted text-brand' : 'border-border bg-surface text-text-tertiary hover:text-text-primary'}`}>
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Model */}
            <div>
              <div className="text-[9px] font-display text-text-tertiary uppercase tracking-widest mb-3">Default model</div>
              <div className="flex flex-col gap-1.5">
                {provider.models.map(m => (
                  <button key={m} onClick={() => setModel(m)}
                    className={`flex items-center gap-2 px-3 py-2 text-left border text-[10px] transition-colors
                      ${model === m ? 'border-brand bg-brand-muted text-brand' : 'border-border bg-surface text-text-secondary hover:text-text-primary'}`}>
                    {model === m && <Check className="h-3 w-3 flex-shrink-0" />}
                    {model !== m && <span className="h-3 w-3 flex-shrink-0" />}
                    <span className="font-body">{m}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* API Key */}
            <div>
              <div className="text-[9px] font-display text-text-tertiary uppercase tracking-widest mb-1">API Key</div>
              <div className="text-[10px] text-text-tertiary mb-3">
                Key không lưu trong vault. Chọn từ env var đã detect hoặc nhập mới để ghi vào shell profile.
              </div>

              {/* Detected keys for this provider */}
              {providerKeys.length > 0 && (
                <div className="flex flex-col gap-1.5 mb-3">
                  {providerKeys.map(k => (
                    <button key={k.envVar} onClick={() => { setSelectedEnvVar(k.envVar); setShowManual(false); }}
                      className={`flex items-center gap-3 px-3 py-2 border text-left transition-colors
                        ${selectedEnvVar === k.envVar && !showManual
                          ? 'border-brand bg-brand-muted text-brand'
                          : 'border-border bg-surface text-text-secondary hover:text-text-primary'}`}>
                      <div className={`h-2 w-2 rounded-full flex-shrink-0 ${k.isSet ? 'bg-status-done' : 'bg-border'}`} />
                      <span className="flex-1 text-[10px] font-body">{k.envVar}</span>
                      {k.isSet && k.preview && (
                        <span className="text-[9px] font-display text-text-tertiary">{k.preview}</span>
                      )}
                      {!k.isSet && <span className="text-[9px] font-display text-text-tertiary">not set</span>}
                    </button>
                  ))}
                  <button onClick={() => { setShowManual(s => !s); setSelectedEnvVar(''); }}
                    className={`flex items-center gap-3 px-3 py-2 border text-left transition-colors
                      ${showManual ? 'border-brand bg-brand-muted text-brand' : 'border-border bg-surface text-text-secondary hover:text-text-primary'}`}>
                    <div className="h-2 w-2 rounded-full flex-shrink-0 border border-current" />
                    <span className="text-[10px] font-display">+ Enter new key</span>
                  </button>
                </div>
              )}

              {/* Manual entry — shown when no detected keys OR user clicks "+ Enter new key" */}
              {(providerKeys.length === 0 || showManual) && (
                <div className="relative mb-3">
                  <input
                    type={showManual ? 'text' : 'password'}
                    value={manualKey}
                    onChange={e => setManualKey(e.target.value)}
                    placeholder={`${provider.envVar}=sk-...`}
                    className="w-full bg-surface-secondary border border-border px-3 py-2 pr-8 text-[11px] text-text-primary placeholder:text-text-tertiary outline-none focus:border-brand font-body"
                  />
                  <button onClick={() => setShowManual(s => !s)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-text-primary">
                    {showManual ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </button>
                </div>
              )}

              {/* Shell export preview */}
              {(showManual || providerKeys.length === 0) && manualKey && (
                <div className="border border-border bg-surface-secondary mb-3">
                  <div className="flex items-center justify-between px-3 py-1.5 border-b border-border">
                    <span className="text-[9px] font-display text-text-tertiary uppercase tracking-wide">Shell export</span>
                    <button onClick={() => void copyShellLine()}
                      className="lcd-button flex items-center gap-1 px-2 py-0.5 border border-border bg-surface text-[9px] font-display text-text-secondary hover:text-text-primary">
                      {keyCopied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                      {keyCopied ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                  <pre className="px-3 py-2 text-[10px] text-brand overflow-x-auto">{shellLine}</pre>
                </div>
              )}

              {(showManual || providerKeys.length === 0) && (
                <>
                  <div className="flex gap-2">
                    <button onClick={() => void writeToShell('zshrc')}
                      className="lcd-button flex-1 py-2 text-[9px] font-display uppercase tracking-wide border border-border bg-surface text-text-secondary hover:text-brand hover:border-brand">
                      Write to ~/.zshrc
                    </button>
                    <button onClick={() => void writeToShell('bashrc')}
                      className="lcd-button flex-1 py-2 text-[9px] font-display uppercase tracking-wide border border-border bg-surface text-text-secondary hover:text-brand hover:border-brand">
                      Write to ~/.bashrc
                    </button>
                  </div>
                  <p className="mt-2 text-[10px] text-text-tertiary">Sau khi ghi, chạy <code className="text-brand">source ~/.zshrc</code> để apply.</p>
                </>
              )}
            </div>
          </>
        )}

        {tab === 'routing' && (
          <>
            <div>
              <div className="text-[9px] font-display text-text-tertiary uppercase tracking-widest mb-3">Task routing aliases</div>
              <p className="mb-3 text-[11px] text-text-tertiary">Configure deterministic tag expansion for backend auto assignment. Example: <code>tests -&gt; run-tests, test-writing</code>.</p>
              <Textarea
                value={taskRoutingText}
                onChange={(event) => setTaskRoutingText(event.target.value)}
                rows={18}
                className="min-h-[24rem] font-mono text-[12px]"
                placeholder={JSON.stringify({ tagAliases: { backend: ['feature-implementation', 'bug-fix', 'write-code'] } }, null, 2)}
              />
            </div>
            <div className="rounded-lg border border-border bg-surface px-3 py-3 text-[11px] text-text-tertiary">
              Save from this tab uses the same Settings save action and persists to the workspace routing config file.
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Window content ────────────────────────────────────────────────────────────

type StaticWindowContentId = Exclude<WindowContentId, 'task-detail'>;

interface ProjectSceneRow {
  id: string;
  name: string;
  status: string | null;
  openTaskCount: number;
  liveRuntimeCount: number;
  docCount: number;
  deadline: string | null;
}

const PAGE_MAP: Record<Exclude<StaticWindowContentId, 'projects'>, ComponentType<{ onTaskSelect?: (taskId: string) => void }>> = {
  board:     BoardView,
  tasks:     TasksView,
  agents:    AgentsView,
  schedule:  SchedulerView,
  approvals: ApprovalsView,
  docs:      DocsView,
  audit:     AuditView,
  settings:  SettingsPanel,
};

function ProjectSceneTable({
  projects,
  selectedProjectId,
  onProjectSelect,
}: {
  projects: ReadonlyArray<ProjectSceneRow>;
  selectedProjectId: string | null;
  onProjectSelect: (projectId: string) => void;
}) {
  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex items-start justify-between gap-3 border border-border bg-surface-secondary px-4 py-3">
        <div>
          <div className="text-[10px] font-display uppercase tracking-[0.2em] text-brand-bright text-glow">Project Scenes</div>
          <div className="mt-1 text-sm text-text-secondary">Choose the active desktop scene. Runtime sprites follow the selected project.</div>
        </div>
        <div className="shrink-0 text-[10px] font-display uppercase tracking-[0.18em] text-text-tertiary">{projects.length} projects</div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto border border-border bg-surface">
        <table className="min-w-full border-collapse text-left text-sm">
          <thead className="sticky top-0 z-10 bg-surface-sidebar text-[10px] font-display uppercase tracking-[0.16em] text-text-tertiary">
            <tr>
              <th className="border-b border-border px-4 py-3">Project</th>
              <th className="border-b border-border px-4 py-3">Status</th>
              <th className="border-b border-border px-4 py-3">Open Tasks</th>
              <th className="border-b border-border px-4 py-3">Live Runtimes</th>
              <th className="border-b border-border px-4 py-3">Docs</th>
              <th className="border-b border-border px-4 py-3">Deadline</th>
            </tr>
          </thead>
          <tbody>
            {projects.map((project) => {
              const selected = project.id === selectedProjectId;
              return (
                <tr
                  key={project.id}
                  className={selected ? 'bg-brand-muted/40' : 'hover:bg-surface-secondary'}
                >
                  <td className="border-b border-border px-4 py-3">
                    <button
                      type="button"
                      onClick={() => onProjectSelect(project.id)}
                      className="flex w-full items-center justify-between gap-3 text-left"
                    >
                      <div className="min-w-0">
                        <div className="truncate font-medium text-text-primary">{project.name}</div>
                        <div className="mt-1 text-[11px] text-text-tertiary">{project.id}</div>
                      </div>
                      {selected ? <span className="text-[10px] font-display uppercase tracking-[0.18em] text-brand">Active</span> : null}
                    </button>
                  </td>
                  <td className="border-b border-border px-4 py-3 text-text-secondary">{project.status ?? 'active'}</td>
                  <td className="border-b border-border px-4 py-3 text-text-secondary">{project.openTaskCount}</td>
                  <td className="border-b border-border px-4 py-3 text-text-secondary">{project.liveRuntimeCount}</td>
                  <td className="border-b border-border px-4 py-3 text-text-secondary">{project.docCount}</td>
                  <td className="border-b border-border px-4 py-3 text-text-secondary">{project.deadline ?? '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function WindowContent({
  win,
  onTaskSelect,
  projectRows,
  selectedProjectId,
  onProjectSelect,
}: {
  win: WindowState;
  onTaskSelect: (taskId: string) => void;
  projectRows: ReadonlyArray<ProjectSceneRow>;
  selectedProjectId: string | null;
  onProjectSelect: (projectId: string) => void;
}) {
  const tasks = useAppStore(state => state.tasks);
  if (win.content === 'task-detail') {
    const task = tasks.find(entry => entry.id === win.taskId);
    return (
      <div className="h-full w-full overflow-hidden">
        {task ? (
          <DetailPanel taskId={task.id} mode="page" onTaskSelect={onTaskSelect} />
        ) : (
          <div className="flex h-full items-center justify-center text-[10px] font-display text-text-tertiary">
            Loading task detail…
          </div>
        )}
      </div>
    );
  }

  if (win.content === 'projects') {
    return <ProjectSceneTable projects={projectRows} selectedProjectId={selectedProjectId} onProjectSelect={onProjectSelect} />;
  }

  if (win.content === 'board') {
    return (
      <Suspense fallback={
        <div className="flex h-full items-center justify-center text-[10px] font-display text-text-tertiary">
          Loading…
        </div>
      }>
        <div className="h-full w-full overflow-auto p-3">
          <BoardView onTaskSelect={onTaskSelect} onProjectSelect={onProjectSelect} />
        </div>
      </Suspense>
    );
  }

  const Page = PAGE_MAP[win.content as Exclude<StaticWindowContentId, 'projects'>] as ComponentType<{ onTaskSelect?: (taskId: string) => void }>;
  return (
    <Suspense fallback={
      <div className="flex h-full items-center justify-center text-[10px] font-display text-text-tertiary">
        Loading…
      </div>
    }>
      <div className="h-full w-full overflow-auto p-3">
        <Page onTaskSelect={onTaskSelect} />
      </div>
    </Suspense>
  );
}

function StatusDot({ status }: { status: AgentSprite['status'] }) {
  const isWorking = status === 'working';
  return (
    <span className="relative flex h-1.5 w-1.5">
      {isWorking && (
        <span
          className="absolute inset-0 animate-pulse-agent rounded-full opacity-60"
          style={{ background: STATUS_COLOR[status] }}
        />
      )}
      <span
        className="relative h-1.5 w-1.5 rounded-full"
        style={{ background: STATUS_COLOR[status], boxShadow: `0 0 4px ${STATUS_COLOR[status]}` }}
      />
    </span>
  );
}

// ─── OS Window ────────────────────────────────────────────────────────────────

function WindowChromeControls({
  maximized,
  onMinimize,
  onToggleMaximize,
  onClose,
}: {
  maximized: boolean;
  onMinimize: () => void;
  onToggleMaximize: () => void;
  onClose: () => void;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        className="flex h-7 w-7 items-center justify-center rounded-none bg-[#7d705a] text-[11px] leading-none text-[#1c1917] opacity-95 transition-colors hover:bg-[#9b8d73]"
        onClick={onMinimize}
        title="Minimize"
        aria-label="Minimize window"
      >
        <span className="block text-[14px] leading-none font-bold -translate-y-[1px]">−</span>
      </button>
      <button
        type="button"
        className="flex h-7 w-7 items-center justify-center rounded-none bg-[#a18f69] text-[11px] leading-none text-[#1c1917] opacity-95 transition-colors hover:bg-[#b89d66]"
        onClick={onToggleMaximize}
        title={maximized ? 'Restore' : 'Maximize'}
        aria-label={maximized ? 'Restore window' : 'Maximize window'}
      >
        <span className="block text-[14px] leading-none font-bold -translate-y-px">{maximized ? '◱' : '□'}</span>
      </button>
      <button
        type="button"
        className="flex h-7 w-7 items-center justify-center rounded-none bg-[#b45d4a] text-[11px] leading-none text-[#1c1917] opacity-95 transition-colors hover:bg-[#d26d58]"
        onClick={onClose}
        title="Close"
        aria-label="Close window"
      >
        <span className="block text-[15px] leading-none font-bold -translate-y-px">×</span>
      </button>
    </div>
  )
}

function OsWindow({ win, onClose, onFocus, onMinimize, onToggleMaximize, onOpenTask, onMove, onResize, projectRows, selectedProjectId, onProjectSelect }: {
  win: WindowState;
  onClose: (id: string) => void;
  onFocus: (id: string) => void;
  onMinimize: (id: string) => void;
  onToggleMaximize: (id: string) => void;
  onOpenTask: (taskId: string) => void;
  onMove: (id: string, next: { x: number; y: number }) => void;
  onResize: (id: string, next: { x: number; y: number; w: number; h: number }) => void;
  projectRows: ReadonlyArray<ProjectSceneRow>;
  selectedProjectId: string | null;
  onProjectSelect: (projectId: string) => void;
}) {
  const tasks = useAppStore(state => state.tasks);
  if (win.minimized) return null;

  const task = win.content === 'task-detail' ? tasks.find(entry => entry.id === win.taskId) : null;
  const title = win.content === 'task-detail' ? task?.title ?? win.title : win.title;
  const WindowIcon = win.content === 'task-detail'
    ? FileText
    : DESKTOP_ICONS.find(d => d.id === win.content)?.Icon;

  return (
    <Rnd
      position={{ x: win.x, y: win.y }}
      size={{ width: win.w, height: win.h }}
      minWidth={280}
      minHeight={180}
      bounds="parent"
      enableResizing={!win.maximized}
      disableDragging={win.maximized}
      style={{ zIndex: win.zIndex, position: 'absolute' }}
      dragHandleClassName="window-titlebar"
      onMouseDown={() => onFocus(win.id)}
      onDragStop={(_, data) => {
        if (win.maximized) return;
        onMove(win.id, clampDesktopWindowPosition(data.x, data.y));
      }}
      onResizeStop={(_, __, ref, ___, position) => {
        if (win.maximized) return;
        const nextPosition = clampDesktopWindowPosition(position.x, position.y)
        onResize(win.id, {
          x: nextPosition.x,
          y: nextPosition.y,
          w: ref.offsetWidth,
          h: ref.offsetHeight,
        });
      }}
    >
      {/* CRT-styled window frame */}
      <div className="lcd-card flex flex-col h-full overflow-hidden border border-border bg-surface shadow-modal">
        {/* Title bar */}
        <div className="window-titlebar flex items-center gap-3 px-3 py-2 select-none cursor-move flex-shrink-0 bg-surface-sidebar border-b border-border">
          {WindowIcon ? <WindowIcon className="h-4 w-4 text-brand opacity-70" /> : null}
          <span className="flex-1 text-sm font-display text-text-secondary uppercase tracking-wider truncate text-glow">
            {title}
          </span>
          <WindowChromeControls
            maximized={win.maximized}
            onMinimize={() => onMinimize(win.id)}
            onToggleMaximize={() => onToggleMaximize(win.id)}
            onClose={() => onClose(win.id)}
          />
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden">
          <WindowContent
            win={win}
            onTaskSelect={onOpenTask}
            projectRows={projectRows}
            selectedProjectId={selectedProjectId}
            onProjectSelect={onProjectSelect}
          />
        </div>
      </div>
    </Rnd>
  );
}

function AgentWindowChrome({
  title,
  maximized,
  onMinimize,
  onToggleMaximize,
  onClose,
}: {
  title: string;
  maximized: boolean;
  onMinimize: () => void;
  onToggleMaximize: () => void;
  onClose: () => void;
}) {
  return (
    <div className="window-titlebar flex items-center gap-3 border-b border-border bg-surface-sidebar px-3 py-2 select-none cursor-move">
      <Bot className="h-4 w-4 text-brand opacity-70" />
      <span className="flex-1 truncate text-sm font-display uppercase tracking-wider text-text-secondary text-glow">{title}</span>
      <WindowChromeControls
        maximized={maximized}
        onMinimize={onMinimize}
        onToggleMaximize={onToggleMaximize}
        onClose={onClose}
      />
    </div>
  )
}

interface AgentWindowState {
  agentId: string;
  preferredSessionId?: string | null;
  x: number;
  y: number;
  w: number;
  h: number;
  zIndex: number;
  minimized?: boolean;
  maximized?: boolean;
  restore?: { x: number; y: number; w: number; h: number };
}

function getDesktopSceneKey(projectId: string | null) {
  return projectId ?? DEFAULT_DESKTOP_SCENE_KEY;
}

function getProjectDesktopState(state?: ProjectDesktopState): ProjectDesktopState {
  return state ?? { windows: [], agentWindow: null, coordinatorWindow: null };
}

function loadDesktopSceneState(): Record<string, ProjectDesktopState> {
  if (typeof window === 'undefined') return {};
  try {
    const parsed = JSON.parse(window.localStorage.getItem(DESKTOP_SCENE_STATE_KEY) ?? '{}') as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed as Record<string, ProjectDesktopState>)
        .filter(([, value]) => value && typeof value === 'object' && Array.isArray(value.windows))
        .map(([sceneKey, value]) => [sceneKey, getProjectDesktopState(value)]),
    ) as Record<string, ProjectDesktopState>;
  } catch {
    return {};
  }
}

function agentSceneBubbleText(agent: AgentSprite) {
  return agent.bubbleText ?? null;
}

function desktopStatusFromAgentState(state: Agent['state']): AgentSprite['status'] {
  if (state === 'active') return 'working'
  if (state === 'waiting') return 'waiting'
  if (state === 'stale') return 'blocked'
  return 'idle'
}

function toDesktopAgentSceneEntity(agent: AgentSprite): DesktopAgentSceneEntity {
  return {
    id: agent.id,
    name: agent.name,
    x: agent.x,
    y: agent.y,
    width: WORLD_AGENT_FRAME.width,
    height: WORLD_AGENT_FRAME.height,
    spriteWidth: WORLD_AGENT_FRAME.spriteWidth,
    spriteHeight: WORLD_AGENT_FRAME.spriteHeight,
    status: agent.status,
    color: agent.color,
    imageSrc: agent.spriteAsset ?? null,
    bubbleText: agentSceneBubbleText(agent),
  };
}

function buildDesktopSceneStyle(project: Project | null): CSSProperties {
  const background = project?.scene?.background;
  if (!background) {
    return {};
  }

  if (background.mode === 'color') {
    return {
      backgroundColor: background.color ?? '#0f141c',
    };
  }

  if (background.mode === 'image' && background.imageUrl) {
    return {
      backgroundColor: '#0b1120',
      backgroundImage: `linear-gradient(180deg, rgba(8,10,16,0.48) 0%, rgba(8,10,16,0.78) 100%), url(${JSON.stringify(background.imageUrl)})`,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
      backgroundRepeat: 'no-repeat',
    };
  }

  return {
    backgroundColor: background.gradientFrom ?? '#0f141c',
    backgroundImage: `linear-gradient(135deg, ${background.gradientFrom ?? '#1f2937'} 0%, ${background.gradientTo ?? '#0f172a'} 100%)`,
  };
}

function findChatTaskForAgent(options: {
  agentId: string;
  tasks: ReadonlyArray<Task>;
}) {
  const { agentId, tasks } = options;
  return tasks.find((task) => task.assigneeId === agentId && task.status === 'in-progress')
    ?? tasks.find((task) => task.assigneeId === agentId && task.status === 'todo')
    ?? null;
}

function desktopChatEventTitle(event: AgentSessionEventRecord) {
  if (event.type === 'user.message') return 'Prompt';
  if (event.type === 'reasoning.summary') return 'Agent';
  if (event.type === 'terminal.stdout') return 'Output';
  if (event.type === 'terminal.stderr') return 'Error';
  if (event.type === 'session.started') return 'Session started';
  if (event.type === 'session.ended') return 'Session ended';
  if (event.type === 'session.failed') return 'Session failed';
  if (event.type === 'session.stopped') return 'Session stopped';
  if (event.type === 'session.usage') return 'Usage';
  return String(event.type).replace(/\./g, ' ');
}

function desktopChatEventBody(event: AgentSessionEventRecord) {
  if (event.text?.trim()) return event.text.trim();
  if (event.type === 'session.usage' && event.usage) {
    const parts = [
      event.usage.model ? `model ${event.usage.model}` : null,
      event.usage.totalTokens != null ? `${event.usage.totalTokens.toLocaleString()} tokens` : null,
      event.usage.costUsd != null ? `$${event.usage.costUsd.toFixed(4)}` : null,
      event.usage.usageSource ? `source ${event.usage.usageSource}` : null,
    ].filter(Boolean);
    return parts.length > 0 ? parts.join(' · ') : 'Usage updated';
  }
  if (event.code != null) return `Exit code ${event.code}`;
  return 'No details';
}

function isDesktopOutgoingEvent(event: AgentSessionEventRecord) {
  return event.type === 'user.message';
}

// Session observer emits these infra-level messages into reasoning.summary — they are not real coordinator responses.
const OBSERVER_MESSAGE_PATTERNS = [
  /^Background opencode session/,
  /^opencode session (emitted|exited|is running)/,
  /^Background claude-code session/,
  /^claude-code session (emitted|exited|is running)/,
  /^codex session (emitted|exited|is running)/,
]

function isObserverMessage(text: string): boolean {
  return OBSERVER_MESSAGE_PATTERNS.some(p => p.test(text));
}

function CoordinatorChatWindow({ agent, windowState, onClose, onMinimize, onToggleMaximize, onDragEnd, loading, error, selectedSession, sessionEvents, onLaunchFresh, onStopLatest, messageDraft, onMessageDraftChange, onSendMessage, actionBusy }: {
  agent: AgentSprite | null;
  windowState: AgentWindowState | null;
  onClose: () => void;
  onMinimize: () => void;
  onToggleMaximize: () => void;
  onDragEnd: (x: number, y: number) => void;
  loading: boolean;
  error: string | null;
  selectedSession: Pick<ActiveAgentSession, 'sessionId' | 'launchSurface' | 'status' | 'startTime' | 'provider' | 'runtimeKind' | 'launchMode' | 'resumedFromSessionId' | 'command' | 'cwd'> | null;
  sessionEvents: ReadonlyArray<AgentSessionEventRecord>;
  onLaunchFresh: () => void;
  onStopLatest: () => void;
  messageDraft: string;
  onMessageDraftChange: (value: string) => void;
  onSendMessage: () => void;
  actionBusy: boolean;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const atBottomRef = useRef(true);

  useLayoutEffect(() => {
    if (atBottomRef.current && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [sessionEvents]);

  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 120) + 'px';
  }, [messageDraft]);

  if (!agent || !windowState) return null;
  if (windowState.minimized) return null;

  const imageSrc = agent.spriteAsset ?? null;
  const isLive = selectedSession?.launchSurface === 'background' && selectedSession?.status === 'running';
  const chatMessages = sessionEvents.filter(e => {
    if (e.type === 'user.message') return true;
    if (e.type === 'reasoning.summary') return !e.text || !isObserverMessage(e.text);
    if (e.type === 'session.failed') return true;
    if (e.type === 'terminal.stderr') return typeof e.text === 'string' && e.text.trim().length > 0;
    return false;
  });

  const lastMsg = chatMessages.length > 0 ? chatMessages[chatMessages.length - 1] : null;
  const isThinking = isLive && !actionBusy && (
    lastMsg === null || lastMsg.type === 'user.message'
  );

  const avatarEl = (size: number, pixelSize = size - 6) => (
    <AgentSpriteFrame
      imageSrc={imageSrc}
      name={agent.name}
      color={agent.color}
      size={size}
      pixelSize={pixelSize}
      className="border-0 bg-transparent"
      imageClassName="p-0"
    />
  );

  return (
    <Rnd
      position={{ x: windowState.x, y: windowState.y }}
      size={{ width: windowState.w, height: windowState.h }}
      enableResizing={!windowState.maximized}
      disableDragging={windowState.maximized}
      bounds="parent"
      onDragStop={(_, d) => {
        const nextPosition = clampDesktopWindowPosition(d.x, d.y)
        onDragEnd(nextPosition.x, nextPosition.y)
      }}
      style={{ position: 'absolute', zIndex: windowState.zIndex }}
      dragHandleClassName="window-titlebar"
      cancel=".window-interactive"
    >
      <div className="lcd-card flex h-full flex-col overflow-hidden border border-border bg-surface shadow-modal">
        <AgentWindowChrome
          title={agent.name}
          maximized={windowState.maximized ?? false}
          onMinimize={onMinimize}
          onToggleMaximize={onToggleMaximize}
          onClose={onClose}
        />

        {/* Header */}
        <div className="flex shrink-0 items-center gap-2.5 border-b border-border bg-surface-secondary px-4 py-2">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden">
            {avatarEl(22, 18)}
          </div>
          <div className="min-w-0 flex-1 flex items-center gap-2">
            <span className="text-sm text-text-primary">{agent.name}</span>
            <StatusDot status={isLive ? 'working' : agent.status} />
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {isLive ? (
              <button type="button" onClick={onStopLatest} disabled={actionBusy}
                className="px-2 py-0.5 text-[11px] text-text-tertiary hover:text-text-primary disabled:opacity-40">
                Stop
              </button>
            ) : null}
            <button type="button" onClick={onLaunchFresh} disabled={actionBusy}
              className="px-2 py-0.5 text-[11px] text-text-tertiary hover:text-text-primary disabled:opacity-40">
              New
            </button>
          </div>
        </div>

        {/* Messages */}
        <div
          ref={scrollRef}
          className="window-interactive min-h-0 flex-1 overflow-y-auto px-4 py-4 select-text"
          onScroll={() => {
            const el = scrollRef.current;
            if (!el) return;
            atBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
          }}
        >
          {loading && chatMessages.length === 0 && !error ? (
            <div className="flex h-full items-center justify-center">
              <span className="text-xs text-text-tertiary">Loading…</span>
            </div>
          ) : chatMessages.length === 0 && !error ? (
            <div className="flex h-full flex-col items-center justify-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center overflow-hidden opacity-60">
                {avatarEl(36, 28)}
              </div>
              <span className="text-xs text-text-tertiary">
                Message {agent.name} to get started
              </span>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {chatMessages.map((event) => {
                const text = event.text?.trim() ?? '';

                if (event.type === 'user.message') {
                  return (
                    <div key={event.id} className="flex justify-end">
                      <div className="max-w-[78%] border border-brand bg-brand-muted px-3 py-2 text-sm text-text-primary whitespace-pre-wrap break-words leading-relaxed">
                        {text}
                      </div>
                    </div>
                  );
                }

                if (event.type === 'session.failed' || event.type === 'terminal.stderr') {
                  const label = event.type === 'session.failed'
                    ? (event.code != null ? `Session ended (exit ${event.code})` : 'Session failed')
                    : null;
                  const display = label ? (text ? `${label}: ${text}` : label) : text;
                  return (
                    <div key={event.id} className="flex items-start gap-2">
                        <div className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center overflow-hidden opacity-50">
                          {avatarEl(16, 12)}
                      </div>
                      <div className="max-w-[85%] text-sm text-status-blocked whitespace-pre-wrap break-words leading-relaxed">
                        {display}
                      </div>
                    </div>
                  );
                }

                return (
                  <div key={event.id} className="flex items-start gap-2">
                    <div className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center overflow-hidden opacity-80">
                      {avatarEl(16, 12)}
                    </div>
                    <div className="max-w-[85%] text-sm text-text-primary whitespace-pre-wrap break-words leading-relaxed">
                      {text}
                    </div>
                  </div>
                );
              })}

              {error && (
                <div className="flex items-start gap-2">
                  <div className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center overflow-hidden opacity-50">
                    {avatarEl(16, 12)}
                  </div>
                  <div className="max-w-[85%] text-sm text-status-blocked whitespace-pre-wrap break-words leading-relaxed">
                    {error}
                  </div>
                </div>
              )}

              {isThinking && (
                <div className="flex items-center gap-2 pl-7">
                  <span className="animate-[blink_1.2s_step-start_infinite] text-brand text-sm">▌</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Input */}
        <div className="shrink-0 border-t border-border bg-surface px-3 py-2.5">
          <div className="window-interactive flex items-end gap-2">
            <Textarea
              ref={textareaRef}
              value={messageDraft}
              onChange={(e) => onMessageDraftChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !actionBusy && messageDraft.trim().length > 0) {
                  e.preventDefault();
                  onSendMessage();
                }
              }}
              placeholder={`Message ${agent.name}…`}
              disabled={actionBusy}
              rows={1}
              className="min-h-[2.25rem] max-h-[8rem] resize-none overflow-y-auto"
            />
            <Button
              type="button"
              size="sm"
              onClick={onSendMessage}
              disabled={actionBusy || messageDraft.trim().length === 0}
              className="shrink-0"
            >
              {actionBusy ? '…' : 'Send'}
            </Button>
          </div>
        </div>
      </div>
    </Rnd>
  );
}

function AgentDetailWindow({ agent, windowState, onClose, onMinimize, onToggleMaximize, onDragEnd, activity, analytics, loading, error, runtimeReadiness, sessions, selectedSession, sessionEvents, runtimeSelection, onRuntimeSelectionChange, onBindOpenCode, onVerifyRuntime, onLaunchFresh, onResumeLatest, onResetLatest, onStopLatest, messageDraft, onMessageDraftChange, onSendMessage, actionBusy, allowMessageToStartSession = false }: {
  agent: AgentSprite | null;
  windowState: AgentWindowState | null;
  onClose: () => void;
  onMinimize: () => void;
  onToggleMaximize: () => void;
  onDragEnd: (x: number, y: number) => void;
  activity: ReadonlyArray<AgentActivityEvent>;
  analytics: AnalyticsDashboardResponse | null;
  loading: boolean;
  error: string | null;
  runtimeReadiness: AgentRuntimeReadinessResponse | null;
  sessions: ReadonlyArray<AgentSessionRecord>;
  selectedSession: Pick<ActiveAgentSession, 'sessionId' | 'launchSurface' | 'status' | 'startTime' | 'provider' | 'runtimeKind' | 'launchMode' | 'resumedFromSessionId' | 'command' | 'cwd'> | null;
  sessionEvents: ReadonlyArray<AgentSessionEventRecord>;
  runtimeSelection: string;
  onRuntimeSelectionChange: (value: string) => void;
  onBindOpenCode: () => void;
  onVerifyRuntime: () => void;
  onLaunchFresh: () => void;
  onResumeLatest: () => void;
  onResetLatest?: () => void;
  onStopLatest: () => void;
  messageDraft: string;
  onMessageDraftChange: (value: string) => void;
  onSendMessage: () => void;
  actionBusy: boolean;
  allowMessageToStartSession?: boolean;
}) {
  if (!agent || !windowState) return null;
  if (windowState.minimized) return null;

  const imageSrc = agent.spriteAsset ?? null;
  const canChatInApp = selectedSession?.launchSurface === 'background' && selectedSession?.status === 'running'
  const canSubmitMessage = canChatInApp || allowMessageToStartSession
  const sessionLifeLabel = selectedSession
    ? (selectedSession.status === 'running' ? 'live' : 'ended')
    : 'no session'
  const latestSessionEvent = sessionEvents.length > 0 ? sessionEvents[sessionEvents.length - 1] ?? null : null
  const sessionSummary = selectedSession
    ? [selectedSession.sessionId, selectedSession.launchMode, selectedSession.launchSurface, selectedSession.runtimeKind, selectedSession.provider, selectedSession.cwd].filter(Boolean).join(' · ')
    : null
  const chatPlaceholder = !selectedSession
    ? (allowMessageToStartSession ? 'Send a message to start the coordinator chat.' : 'No active session yet. Assign a task and launch chat to start one.')
    : selectedSession.launchSurface !== 'background'
      ? 'This session is detached from the in-app chat surface.'
      : selectedSession.status !== 'running'
        ? 'Last session ended. Start fresh to continue this thread.'
        : 'Send a message to the running session'
  const startsChatOnSend = allowMessageToStartSession && !canChatInApp
  const waitingForResponse = canChatInApp && !actionBusy && (
    latestSessionEvent === null
    || latestSessionEvent.type === 'user.message'
    || latestSessionEvent.type === 'session.started'
  )
  const thinkingLabel = agent.role === 'coordinator' ? 'Coordinator is thinking...' : 'Agent is thinking...'
  const statusMessage = actionBusy && startsChatOnSend
    ? 'Starting coordinator chat...'
    : waitingForResponse
      ? thinkingLabel
      : error ?? (canChatInApp ? 'Background chat is live.' : chatPlaceholder)
  const sendButtonLabel = actionBusy
    ? (startsChatOnSend ? 'Starting…' : 'Sending…')
    : (startsChatOnSend ? 'Start chat' : 'Send')

  return (
    <Rnd
      position={{ x: windowState.x, y: windowState.y }}
      size={{ width: windowState.w, height: windowState.h }}
      enableResizing={!windowState.maximized}
      disableDragging={windowState.maximized}
      bounds="parent"
      onDragStop={(_, d) => {
        const nextPosition = clampDesktopWindowPosition(d.x, d.y)
        onDragEnd(nextPosition.x, nextPosition.y)
      }}
      style={{ position: 'absolute', zIndex: windowState.zIndex }}
      dragHandleClassName="window-titlebar"
      cancel=".window-interactive"
    >
      <div className="lcd-card flex h-full flex-col overflow-hidden border border-border bg-surface shadow-modal rounded-none">
        <AgentWindowChrome
          title={agent.name}
          maximized={windowState.maximized ?? false}
          onMinimize={onMinimize}
          onToggleMaximize={onToggleMaximize}
          onClose={onClose}
        />

        <div className="flex h-full min-h-0 flex-col bg-surface-secondary">
          <div className="border-b border-border px-4 py-3">
            <div className="flex items-center gap-3">
              <AgentSpriteFrame imageSrc={imageSrc} name={agent.name} color={agent.color} size={64} pixelSize={56} />
              <div className="min-w-0 flex-1">
                <div className="text-base text-text-primary">{agent.name}</div>
                <div className="mt-1 flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-text-tertiary">
                  <StatusDot status={agent.status} />
                  <span>{agent.status}</span>
                  {selectedSession ? <span>{selectedSession.status}</span> : null}
                  <span className={selectedSession?.status === 'running' ? 'text-status-active' : 'text-status-blocked'}>{sessionLifeLabel}</span>
                </div>
                <div className="mt-2 text-xs text-text-secondary">
                  {statusMessage}
                </div>
                {sessionSummary ? <div className="mt-2 text-[10px] uppercase tracking-[0.14em] text-text-tertiary">{sessionSummary}</div> : null}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {allowMessageToStartSession || selectedSession ? (
                  <Button type="button" variant="outline" size="sm" onClick={onLaunchFresh} disabled={actionBusy}>
                    Start fresh
                  </Button>
                ) : null}
                {selectedSession ? (
                  <Button type="button" variant="outline" size="sm" onClick={onResumeLatest} disabled={actionBusy}>
                    Resume latest
                  </Button>
                ) : null}
                {onResetLatest ? (
                  <Button type="button" variant="outline" size="sm" onClick={onResetLatest} disabled={actionBusy}>
                    Reset
                  </Button>
                ) : null}
                {selectedSession && selectedSession.launchSurface !== 'attached' && selectedSession.status === 'running' ? (
                  <Button type="button" variant="outline" size="sm" onClick={onStopLatest} disabled={actionBusy}>
                    Stop
                  </Button>
                ) : null}
              </div>
            </div>
          </div>

          <div className="window-interactive min-h-0 flex-1 overflow-y-auto p-4 select-text">
            <div className="flex flex-col gap-3">
              {sessionEvents.length === 0 ? (
                <div className="self-center border border-border bg-surface px-3 py-2 text-xs text-text-secondary">
                  {loading ? 'Loading transcript…' : waitingForResponse ? thinkingLabel : 'No transcript events yet.'}
                </div>
              ) : sessionEvents.map((event) => {
                const outgoing = isDesktopOutgoingEvent(event);
                return (
                  <div key={event.id} className={`flex ${outgoing ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[85%] border px-3 py-2 ${outgoing ? 'border-brand bg-brand-muted text-text-primary' : 'border-border bg-surface text-text-primary'}`}>
                      <div className="text-[10px] uppercase tracking-[0.18em] text-text-tertiary">
                        {desktopChatEventTitle(event)} · {new Date(event.timestamp).toLocaleTimeString()}
                      </div>
                      <div className={`mt-2 whitespace-pre-wrap break-words text-sm ${event.type === 'terminal.stdout' || event.type === 'terminal.stderr' ? 'font-mono text-[12px]' : ''}`}>
                        {desktopChatEventBody(event)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="border-t border-border bg-surface px-4 py-3">
            <div className="window-interactive flex gap-2">
              <Input
                value={messageDraft}
                onChange={(event) => onMessageDraftChange(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key !== 'Enter' || event.shiftKey || !canSubmitMessage || actionBusy || messageDraft.trim().length === 0) return;
                  event.preventDefault();
                  onSendMessage();
                }}
                placeholder={chatPlaceholder}
                disabled={!canSubmitMessage}
              />
              <Button type="button" size="sm" onClick={onSendMessage} disabled={!canSubmitMessage || actionBusy || messageDraft.trim().length === 0}>{sendButtonLabel}</Button>
            </div>
            <div className="mt-2 text-[11px] uppercase tracking-[0.14em] text-text-tertiary">
              {!canSubmitMessage
                ? 'Chat is unavailable for this session surface.'
                : startsChatOnSend
                  ? 'Your first message will start a coordinator session using the current model and provider.'
                  : 'Message will be sent to the running background chat session.'}
            </div>
          </div>
        </div>
      </div>
    </Rnd>
  )
}

function DesktopIconButton({ item, active, onOpen }: {
  item: { id: DesktopIconId; label: string; Icon: ComponentType<{ className?: string }>; title?: string };
  active: boolean;
  onOpen: (id: DesktopIconId) => void;
}) {
  const pointerRef = useRef<{ x: number; y: number; dragged: boolean } | null>(null);

  return (
    <button
      type="button"
      onClick={() => {
        if (pointerRef.current?.dragged) return;
        onOpen(item.id);
      }}
      onPointerDown={(event) => {
        pointerRef.current = { x: event.clientX, y: event.clientY, dragged: false };
      }}
      onPointerMove={(event) => {
        if (!pointerRef.current) return;
        const dx = Math.abs(event.clientX - pointerRef.current.x);
        const dy = Math.abs(event.clientY - pointerRef.current.y);
        if (dx > 6 || dy > 6) pointerRef.current.dragged = true;
      }}
      onPointerUp={(event) => {
        const state = pointerRef.current;
        pointerRef.current = null;
        if (!state || state.dragged) return;
        const dx = Math.abs(event.clientX - state.x);
        const dy = Math.abs(event.clientY - state.y);
        if (dx > 6 || dy > 6) return;
      }}
      title={item.title ?? item.label}
      className="group flex h-full w-full flex-col items-center gap-1 transition-transform hover:-translate-y-0.5"
    >
      <div
        className={`
          lcd-button flex h-12 w-12 items-center justify-center border transition-all
          ${active
            ? 'border-accent bg-brand text-surface'
            : 'border-accent bg-brand-muted text-brand group-hover:bg-brand group-hover:text-surface'}
        `}
      >
        <item.Icon className="h-5 w-5" />
      </div>
      <span
        className={`w-full rounded-none px-1.5 py-0.5 text-center text-[10px] font-display uppercase leading-tight tracking-wider text-brand-bright text-glow truncate
          ${active ? 'bg-surface-sidebar' : 'bg-surface-sidebar/80'}`}
      >
        {item.label}
      </span>
    </button>
  )
}

// ─── Desktop Icons ─────────────────────────────────────────────────────────────

function DesktopIcons({
  openIds,
  onOpen,
  positions,
  onMove,
  coordinatorAction,
}: {
  openIds: Set<string>;
  onOpen: (id: DesktopIconId) => void;
  positions: Partial<Record<DesktopIconId, { x: number; y: number }>>;
  onMove: (id: DesktopIconId, x: number, y: number) => void;
  coordinatorAction: { label: string; Icon: ComponentType<{ className?: string }>; title: string; active: boolean } | null;
}) {
  const iconItems = coordinatorAction
    ? [{ id: COORDINATOR_DESKTOP_ICON, label: coordinatorAction.label, Icon: coordinatorAction.Icon, title: coordinatorAction.title } satisfies { id: DesktopIconId; label: string; Icon: ComponentType<{ className?: string }>; title?: string }, ...DESKTOP_ICONS]
    : DESKTOP_ICONS;

  return (
    <div className="pointer-events-none absolute inset-0 z-10">
      {iconItems.map((item, index) => {
        const active = item.id === COORDINATOR_DESKTOP_ICON ? (coordinatorAction?.active ?? false) : openIds.has(item.id);
        const position = positions[item.id] ?? positionForIndex(index);
        return (
          <Rnd
            key={item.id}
            position={position}
            size={{ width: DESKTOP_ICON_SIZE.w, height: DESKTOP_ICON_SIZE.h }}
            enableResizing={false}
            dragGrid={[DESKTOP_ICON_GRID, DESKTOP_ICON_GRID]}
            bounds="parent"
            onDragStop={(_, data) => {
                onMove(item.id, data.x, data.y)
              }}
            style={{ position: 'absolute', zIndex: active ? 15 : 12, cursor: 'grab', pointerEvents: 'auto' }}
          >
            <DesktopIconButton item={item} active={active} onOpen={onOpen} />
          </Rnd>
        );
      })}
    </div>
  );
}

// ─── Main desktop ─────────────────────────────────────────────────────────────

let zTop = 10;

export function DesktopView() {
  const startRealtime = useAppStore(state => state.startRealtime);
  const stopRealtime  = useAppStore(state => state.stopRealtime);
  const loadData = useAppStore(state => state.loadData);
  const storeAgents = useAppStore(state => state.agents);
  const visibleStoreAgents = useMemo(
    () => storeAgents.filter((agent) => agent.role !== 'coordinator' && !(agent.roles ?? []).includes('coordinator')),
    [storeAgents],
  );
  const storeTasks = useAppStore(state => state.tasks);
  const projects = useAppStore(state => state.projects);
  const coordinatorThreads = useAppStore(state => state.coordinatorThreads);
  const selectedProjectId = useAppStore(state => state.selectedProjectId);
  const setSelectedProjectId = useAppStore(state => state.setSelectedProjectId);
  const [searchParams, setSearchParams] = useSearchParams();

  const updateDesktopProject = useCallback((projectId: string | null) => {
    setSelectedProjectId(projectId);
    setSearchParams((current) => (projectId ? withDesktopProject(current, projectId) : withoutDesktopProject(current)), { replace: true });
  }, [setSearchParams, setSelectedProjectId]);

  useEffect(() => {
    startRealtime();
    return () => stopRealtime();
  }, [startRealtime, stopRealtime]);

  const [desktopSceneState, setDesktopSceneState] = useState<Record<string, ProjectDesktopState>>(() => loadDesktopSceneState());
  const [agentPositions, setAgentPositions] = useState<Record<string, { x: number; y: number }>>({});
  const [desktopIconPositions, setDesktopIconPositions] = useState<Partial<Record<DesktopIconId, { x: number; y: number }>>>(() => {
    if (typeof window === 'undefined') return {}
    try {
      return JSON.parse(window.localStorage.getItem(DESKTOP_ICON_STATE_KEY) ?? '{}') as Partial<Record<DesktopIconId, { x: number; y: number }>>
    } catch {
      return {}
    }
  });
  const [isAgentSetupWizardOpen, setIsAgentSetupWizardOpen] = useState(false);
  const [isCoordinatorWizardOpen, setIsCoordinatorWizardOpen] = useState(false);
  const [isCoordinatorSetupOpen, setIsCoordinatorSetupOpen] = useState(false);
  const [pendingCoordinatorAgentId, setPendingCoordinatorAgentId] = useState('');
  const [isCoordinatorSaving, setIsCoordinatorSaving] = useState(false);
  const [coordinatorError, setCoordinatorError] = useState<string | null>(null);
  const [desktopAgentRuntime, setDesktopAgentRuntime] = useState<Record<string, DesktopAgentRuntimeSnapshot>>({});

  useEffect(() => {
    let cancelled = false;

    const loadDesktopAgentRuntime = async () => {
      const nowMs = Date.now();
      const activeSessions = (await relayhqApi.getActiveAgents().catch(() => [] as ReadonlyArray<ActiveAgentSession>))
        .filter((session) => visibleStoreAgents.some((agent) => agent.id === (session.agentId ?? session.agentName.replace(/#\d+$/, ''))));
      const recentSessionsByAgent = await Promise.all(visibleStoreAgents.map(async (agent) => {
        try {
          const sessions = await relayhqApi.listAgentSessions(agent.id);
          return sessions
            .filter((session) => shouldKeepDesktopSessionTrace({ status: session.status, lastEventAt: session.lastEventAt }, nowMs))
            .slice(0, 2)
            .map((session) => ({
              ...session,
              agentId: agent.id,
              lastSeenAt: session.lastEventAt,
              idleSeconds: Math.max(0, Math.floor((nowMs - Date.parse(session.lastEventAt)) / 1000)),
              source: 'recorded' as const,
            } satisfies DesktopRuntimeSession));
        } catch {
          return [] as DesktopRuntimeSession[];
        }
      }));

      const sessions = [
        ...activeSessions.map((session) => ({
          ...session,
          agentId: session.agentId ?? session.agentName.replace(/#\d+$/, ''),
          status: session.status ?? (session.launchSurface === 'attached' ? 'attached' : 'running'),
          startTime: session.startTime ?? session.lastSeenAt,
          lastEventAt: session.lastSeenAt,
          source: session.source,
        } satisfies DesktopRuntimeSession)),
        ...recentSessionsByAgent.flat(),
      ].filter((session, index, all) => all.findIndex((candidate) => candidate.sessionId === session.sessionId) === index);

      const entries = await Promise.all(sessions.map(async (session) => {
        try {
          const events = session.source === 'attached' ? [] : await relayhqApi.getAgentSessionEvents(session.sessionId);
          return [session.sessionId, { session, events }] as const;
        } catch {
          return [session.sessionId, { session, events: [] }] as const;
        }
      }));

      if (cancelled) return;
      setDesktopAgentRuntime(Object.fromEntries(entries) as Record<string, DesktopAgentRuntimeSnapshot>);
    };

    void loadDesktopAgentRuntime();
    const intervalId = window.setInterval(() => {
      void loadDesktopAgentRuntime();
    }, 4000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [visibleStoreAgents]);

  const agents = useMemo<AgentSprite[]>(() => {
    const runtimes = Object.values(desktopAgentRuntime) as DesktopAgentRuntimeSnapshot[];
    return runtimes.map((runtime, index) => {
      const latestSession = runtime.session;
      const agentId = latestSession.agentId ?? latestSession.agentName.replace(/#\d+$/, '');
      const agent = visibleStoreAgents.find((entry) => entry.id === agentId) ?? null;
      const position = agentPositions[latestSession.sessionId] ?? positionForAgentIndex(index);
      const sessionTask = latestSession.taskId ? storeTasks.find((task) => task.id === latestSession.taskId) ?? null : null;
      const events = runtime?.events ?? [];
      const activeTask = storeTasks.find((task) => task.assigneeId === agentId && task.status === 'in-progress') ?? null;
      const waitingTask = storeTasks.find((task) => task.assigneeId === agentId && (task.status === 'waiting-approval' || task.status === 'review' || task.status === 'scheduled')) ?? null;
      const blockedTask = storeTasks.find((task) => task.assigneeId === agentId && task.status === 'blocked') ?? null;
      const relatedTask = sessionTask ?? activeTask ?? waitingTask ?? blockedTask;
      const previewText = eventPreviewText(events) ?? taskPreviewText(waitingTask ?? activeTask ?? blockedTask);
      const nowMs = Date.now();
      const sessionActive = isDesktopSessionLive(latestSession, nowMs);
      const sessionVisible = shouldKeepDesktopSessionTrace(latestSession, nowMs);
      const status = inferAgentDesktopStatus({
        agentState: agent?.state ?? 'active',
        activeTask,
        waitingTask,
        blockedTask,
        latestSession,
        previewText,
      });

      return {
        id: latestSession.sessionId,
        agentId,
        sessionId: latestSession.sessionId,
        name: agent?.name ?? agentId,
        x: position.x,
        y: position.y,
        projectId: relatedTask?.projectId ?? null,
        status,
        sessionActive,
        sessionVisible,
        color: '#8f8466',
        role: agent?.role,
        provider: agent?.provider ?? latestSession.provider,
        model: agent?.model,
        runtimeKind: agent?.runtimeKind ?? latestSession.runtimeKind ?? null,
        runMode: agent?.runMode ?? latestSession.launchMode ?? null,
        verificationStatus: agent?.verificationStatus,
        aliases: agent?.aliases,
        capabilities: agent?.capabilities,
        skillFile: agent?.skillFile,
        skillFiles: agent?.skillFiles,
        body: agent?.body,
        sourcePath: agent?.sourcePath,
        spriteAsset: agent?.spriteAsset,
        launchSurface: latestSession.launchSurface,
        sessionStatus: latestSession.status,
        bubbleText: previewText,
      };
    });
  }, [agentPositions, desktopAgentRuntime, visibleStoreAgents, storeTasks]);

  const projectFromUrl = searchParams.get('project');
  const { routeProject, activeProjectId: resolvedProjectId } = resolveDesktopProjectSelection(
    searchParams,
    projects.map((project) => project.id),
    selectedProjectId,
  );

  const activeDesktopProject = useMemo(() => {
    if (resolvedProjectId) {
      return projects.find((project) => project.id === resolvedProjectId) ?? null;
    }
    return null;
  }, [projects, resolvedProjectId]);

  useEffect(() => {
    setPendingCoordinatorAgentId(activeDesktopProject?.coordinatorAgentId ?? '');
    setCoordinatorError(null);
    setIsCoordinatorSetupOpen(false);
  }, [activeDesktopProject]);

  useLayoutEffect(() => {
    if (projects.length === 0) {
      if (selectedProjectId !== null) {
        setSelectedProjectId(null);
      }
      return;
    }

    if (!resolvedProjectId) return;

    if (selectedProjectId !== resolvedProjectId) {
      setSelectedProjectId(resolvedProjectId);
    }

    // Replace stale or missing query params with a valid scene so refreshes and deleted-project
    // deep links do not leave the desktop chrome and store pointing at different projects.
    if (projectFromUrl !== resolvedProjectId) {
      setSearchParams((current) => withDesktopProject(current, resolvedProjectId), { replace: true });
    }
  }, [projectFromUrl, projects.length, resolvedProjectId, routeProject.state, selectedProjectId, setSearchParams, setSelectedProjectId]);

  useEffect(() => {
    const validSceneKeys = new Set([DEFAULT_DESKTOP_SCENE_KEY, ...projects.map((project) => getDesktopSceneKey(project.id))]);
    setDesktopSceneState((previous) => {
      const nextEntries = Object.entries(previous).filter(([sceneKey]) => validSceneKeys.has(sceneKey));
      if (nextEntries.length === Object.keys(previous).length) {
        return previous;
      }
      return Object.fromEntries(nextEntries) as Record<string, ProjectDesktopState>;
    });
  }, [projects]);

  const desktopSceneStyle = useMemo(() => buildDesktopSceneStyle(activeDesktopProject), [activeDesktopProject]);
  const [desktopTheme, setDesktopTheme] = useState<AppTheme>(() => readStoredTheme());

  useEffect(() => {
    const syncTheme = () => setDesktopTheme(readStoredTheme())
    const handleThemeChange = (event: Event) => {
      const nextTheme = (event as CustomEvent<AppTheme>).detail
      setDesktopTheme(nextTheme ?? readStoredTheme())
    }

    window.addEventListener(THEME_CHANGE_EVENT, handleThemeChange)
    window.addEventListener('storage', syncTheme)
    return () => {
      window.removeEventListener(THEME_CHANGE_EVENT, handleThemeChange)
      window.removeEventListener('storage', syncTheme)
    }
  }, [])

  const sceneProjectId = activeDesktopProject?.id ?? null;
  const sceneStateKey = getDesktopSceneKey(sceneProjectId);
  const hasInitializedSceneState = Object.prototype.hasOwnProperty.call(desktopSceneState, sceneStateKey);
  const activeSceneState = desktopSceneState[sceneStateKey] ?? getProjectDesktopState();
  const windows = activeSceneState.windows;
  const agentWindow = activeSceneState.agentWindow;
  const coordinatorWindow = activeSceneState.coordinatorWindow;

  const updateCurrentSceneState = useCallback((updater: (current: ProjectDesktopState) => ProjectDesktopState) => {
    setDesktopSceneState((previous) => {
      const current = getProjectDesktopState(previous[sceneStateKey]);
      const next = updater(current);
      if (next.windows === current.windows && next.agentWindow === current.agentWindow && next.coordinatorWindow === current.coordinatorWindow) {
        return previous;
      }
      return {
        ...previous,
        [sceneStateKey]: next,
      };
    });
  }, [sceneStateKey]);

  const setCurrentSceneWindows = useCallback((updater: (current: ReadonlyArray<WindowState>) => ReadonlyArray<WindowState>) => {
    updateCurrentSceneState((current) => ({
      ...current,
      windows: updater(current.windows),
    }));
  }, [updateCurrentSceneState]);

  const setCurrentSceneAgentWindow = useCallback((updater: (current: AgentWindowState | null) => AgentWindowState | null) => {
    updateCurrentSceneState((current) => ({
      ...current,
      agentWindow: updater(current.agentWindow),
    }));
  }, [updateCurrentSceneState]);

  const setCurrentSceneCoordinatorWindow = useCallback((updater: (current: AgentWindowState | null) => AgentWindowState | null) => {
    updateCurrentSceneState((current) => ({
      ...current,
      coordinatorWindow: updater(current.coordinatorWindow),
    }));
  }, [updateCurrentSceneState]);

  const visibleAgents = useMemo(() => {
    return agents
      .filter((agent) => agent.sessionVisible)
      .filter((agent) => !sceneProjectId || agent.projectId === sceneProjectId);
  }, [agents, sceneProjectId]);

  const sceneAgents = useMemo(() => {
    return visibleAgents.map(toDesktopAgentSceneEntity);
  }, [visibleAgents]);

  const coordinatorAgents = useMemo(() => [], []);

  const hasCoordinator = false;

  const projectRows = useMemo<ReadonlyArray<ProjectSceneRow>>(() => {
    return projects.map((project) => ({
      id: project.id,
      name: project.name,
      status: project.status ?? null,
      openTaskCount: storeTasks.filter((task) => task.projectId === project.id && task.status !== 'done' && task.status !== 'cancelled').length,
      liveRuntimeCount: agents.filter((agent) => agent.sessionActive && agent.projectId === project.id).length,
      docCount: project.docs.length,
      deadline: project.deadline ?? null,
    }));
  }, [agents, projects, storeTasks]);

  const totalAgents = visibleAgents.length;
  const currentTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  const resolveChatTaskForAgent = useCallback((agentId: string) => {
    return findChatTaskForAgent({
      agentId,
      tasks: storeTasks,
    });
  }, [storeTasks]);

  const assignCoordinator = useCallback(async (agentId: string | null) => {
    if (!activeDesktopProject) return;
    setIsCoordinatorSaving(true);
    setCoordinatorError(null);
    try {
      await relayhqApi.patchProject(activeDesktopProject.id, {
        patch: {
          coordinator_agent_id: agentId,
        },
      });
      await loadData();
      setPendingCoordinatorAgentId(agentId ?? '');
      setIsCoordinatorSetupOpen(false);
    } catch (error) {
      setCoordinatorError(error instanceof Error ? error.message : 'Failed to update the coordinator.');
    } finally {
      setIsCoordinatorSaving(false);
    }
  }, [activeDesktopProject, loadData]);

  useEffect(() => {
    if (hasCoordinator) {
      setIsCoordinatorSetupOpen(false);
    }
  }, [hasCoordinator]);

  useEffect(() => {
    setAgentPositions(prev => {
      const next = { ...prev };
      let seeded = Object.keys(next).length;
      let changed = false;
      const liveAgentIds = new Set(agents.map(agent => agent.id));

      for (const agentId of Object.keys(next)) {
        if (!liveAgentIds.has(agentId)) {
          delete next[agentId];
          changed = true;
        }
      }

      for (const agent of agents) {
        if (next[agent.id] !== undefined) continue;
        next[agent.id] = positionForAgentIndex(seeded);
        seeded += 1;
        changed = true;
      }

      return changed ? next : prev;
    });
  }, [agents]);

  useEffect(() => {
    try {
      window.localStorage.setItem(DESKTOP_SCENE_STATE_KEY, JSON.stringify(desktopSceneState));
    } catch {
      /* ignore */
    }
  }, [desktopSceneState]);

  useEffect(() => {
    try {
      window.localStorage.setItem(DESKTOP_ICON_STATE_KEY, JSON.stringify(desktopIconPositions))
    } catch {
      /* ignore */
    }
  }, [desktopIconPositions])

  const openWindow = useCallback((id: WindowContentId) => {
    setCurrentSceneWindows(prev => {
      const existing = prev.find(w => w.content === id);
      if (existing) {
        zTop += 1;
        return prev.map(w => w.id === existing.id ? { ...w, minimized: false, zIndex: zTop } : w);
      }
      const item = DESKTOP_ICONS.find(d => d.id === id)!;
      zTop += 1;
      const cascade = prev.length * 28;
      const vw = window.innerWidth;
      const vh = window.innerHeight - DESKTOP_TOPBAR_HEIGHT;
      const w = Math.round(vw * 0.72);
      const h = Math.round(vh * 0.78);
      const x = Math.round((vw - w) / 2) + cascade;
      const y = Math.round((vh - h) / 2) + cascade;
      return [...prev, {
        id: `${id}-${Date.now()}`,
        title: item.label,
        content: id,
        x, y, w, h,
        minimized: false,
        maximized: false,
        zIndex: zTop,
      }];
    });
  }, [setCurrentSceneWindows]);

  const closeWindow = useCallback<(id: string) => void>((id) => {
    setCurrentSceneWindows(prev => prev.filter(w => w.id !== id));
  }, [setCurrentSceneWindows]);

  const focusWindow = useCallback<(id: string) => void>((id) => {
    zTop += 1;
    setCurrentSceneWindows(prev => prev.map(w => w.id === id ? { ...w, zIndex: zTop } : w));
  }, [setCurrentSceneWindows]);

  const moveWindow = useCallback((id: string, next: { x: number; y: number }) => {
    setCurrentSceneWindows(prev => prev.map(windowState => (
      windowState.id === id
        ? { ...windowState, x: next.x, y: next.y, maximized: false }
        : windowState
    )));
  }, [setCurrentSceneWindows]);

  const resizeWindow = useCallback((id: string, next: { x: number; y: number; w: number; h: number }) => {
    setCurrentSceneWindows(prev => prev.map(windowState => (
      windowState.id === id
        ? { ...windowState, x: next.x, y: next.y, w: next.w, h: next.h, maximized: false }
        : windowState
    )));
  }, [setCurrentSceneWindows]);

  const minimizeWindow = useCallback((id: string) => {
    setCurrentSceneWindows(prev => prev.map(windowState => (
      windowState.id === id
        ? { ...windowState, minimized: true }
        : windowState
    )));
  }, [setCurrentSceneWindows]);

  const toggleMaximizeWindow = useCallback((id: string) => {
    zTop += 1;
    setCurrentSceneWindows(prev => prev.map(windowState => {
      if (windowState.id !== id) return windowState;

      if (windowState.maximized) {
        const restore = windowState.restore ?? { x: windowState.x, y: windowState.y, w: windowState.w, h: windowState.h };
        return {
          ...windowState,
          ...restore,
          restore: undefined,
          maximized: false,
          minimized: false,
          zIndex: zTop,
        };
      }

      return {
        ...windowState,
        restore: { x: windowState.x, y: windowState.y, w: windowState.w, h: windowState.h },
        x: 0,
        y: DESKTOP_FULLSCREEN_TOP,
        w: window.innerWidth,
        h: window.innerHeight - (DESKTOP_TOPBAR_HEIGHT * 2),
        maximized: true,
        minimized: false,
        zIndex: zTop,
      };
    }));
  }, [setCurrentSceneWindows]);

  const openTaskWindow = useCallback((taskId: string) => {
    const task = storeTasks.find(entry => entry.id === taskId);
    if (!task) return;

    setCurrentSceneWindows(prev => {
      const existing = prev.find(windowState => windowState.content === 'task-detail' && windowState.taskId === taskId);
      if (existing) {
        zTop += 1;
        return prev.map(windowState => {
          if (windowState.id !== existing.id) return windowState;
          return {
            ...windowState,
            title: task.title,
            minimized: false,
            zIndex: zTop,
          };
        });
      }

      zTop += 1;
      const cascade = prev.length * 28;
      const vw = window.innerWidth;
      const vh = window.innerHeight - DESKTOP_TOPBAR_HEIGHT;
      const w = Math.round(vw * 0.72);
      const h = Math.round(vh * 0.78);
      const x = Math.round((vw - w) / 2) + cascade;
      const y = Math.round((vh - h) / 2) + cascade;

      return [...prev, {
        id: `task-${taskId}-${Date.now()}`,
        title: task.title,
        content: 'task-detail',
        taskId,
        x,
        y,
        w,
        h,
        minimized: false,
        maximized: false,
        zIndex: zTop,
      }];
    });
  }, [setCurrentSceneWindows, storeTasks]);

  const selectedAgent = useMemo(() => {
    if (!agentWindow) return null

    const liveAgent = agents.find((agent) => agent.agentId === agentWindow.agentId && (agentWindow.preferredSessionId ? agent.sessionId === agentWindow.preferredSessionId : true))
      ?? agents.find((agent) => agent.agentId === agentWindow.agentId)
      ?? null
    if (liveAgent) return liveAgent

    const storedAgent = storeAgents.find((agent) => agent.id === agentWindow.agentId)
    if (!storedAgent) return null

    return {
      id: agentWindow.preferredSessionId ?? storedAgent.id,
      agentId: storedAgent.id,
      sessionId: agentWindow.preferredSessionId ?? '',
      name: storedAgent.name,
      x: 0,
      y: 0,
      projectId: sceneProjectId,
      status: desktopStatusFromAgentState(storedAgent.state),
      sessionActive: false,
      color: '#8f8466',
      role: storedAgent.role ?? null,
      provider: storedAgent.provider ?? null,
      model: storedAgent.model ?? null,
      runtimeKind: storedAgent.runtimeKind ?? null,
      runMode: storedAgent.runMode ?? null,
      verificationStatus: storedAgent.verificationStatus ?? null,
      aliases: storedAgent.aliases,
      capabilities: storedAgent.capabilities,
      skillFile: storedAgent.skillFile ?? null,
      skillFiles: storedAgent.skillFiles,
      body: storedAgent.body ?? null,
      sourcePath: storedAgent.sourcePath ?? null,
      spriteAsset: storedAgent.spriteAsset ?? null,
      launchSurface: undefined,
      sessionStatus: undefined,
      bubbleText: null,
    } satisfies AgentSprite
  }, [agentWindow, agents, sceneProjectId, storeAgents])
  const selectedCoordinator = useMemo(() => {
    if (!coordinatorWindow) return null

    const liveAgent = agents.find((agent) => agent.agentId === coordinatorWindow.agentId && (coordinatorWindow.preferredSessionId ? agent.sessionId === coordinatorWindow.preferredSessionId : true))
      ?? agents.find((agent) => agent.agentId === coordinatorWindow.agentId)
      ?? null
    if (liveAgent) return liveAgent

    const storedAgent = storeAgents.find((agent) => agent.id === coordinatorWindow.agentId)
    if (!storedAgent) return null

    return {
      id: coordinatorWindow.preferredSessionId ?? storedAgent.id,
      agentId: storedAgent.id,
      sessionId: coordinatorWindow.preferredSessionId ?? '',
      name: storedAgent.name,
      x: 0,
      y: 0,
      projectId: sceneProjectId,
      status: desktopStatusFromAgentState(storedAgent.state),
      sessionActive: false,
      color: '#8f8466',
      role: storedAgent.role ?? null,
      provider: storedAgent.provider ?? null,
      model: storedAgent.model ?? null,
      runtimeKind: storedAgent.runtimeKind ?? null,
      runMode: storedAgent.runMode ?? null,
      verificationStatus: storedAgent.verificationStatus ?? null,
      aliases: storedAgent.aliases,
      capabilities: storedAgent.capabilities,
      skillFile: storedAgent.skillFile ?? null,
      skillFiles: storedAgent.skillFiles,
      body: storedAgent.body ?? null,
      sourcePath: storedAgent.sourcePath ?? null,
      spriteAsset: storedAgent.spriteAsset ?? null,
      launchSurface: undefined,
      sessionStatus: undefined,
      bubbleText: null,
    } satisfies AgentSprite
  }, [agents, coordinatorWindow, sceneProjectId, storeAgents])
  const [selectedAgentActivity, setSelectedAgentActivity] = useState<ReadonlyArray<AgentActivityEvent>>([]);
  const [selectedAgentAnalytics, setSelectedAgentAnalytics] = useState<AnalyticsDashboardResponse | null>(null);
  const [selectedAgentRuntimeReadiness, setSelectedAgentRuntimeReadiness] = useState<AgentRuntimeReadinessResponse | null>(null);
  const [selectedAgentSessions, setSelectedAgentSessions] = useState<ReadonlyArray<AgentSessionRecord>>([]);
  const [selectedAgentSessionEvents, setSelectedAgentSessionEvents] = useState<ReadonlyArray<AgentSessionEventRecord>>([]);
  const [selectedAgentRuntimeId, setSelectedAgentRuntimeId] = useState('opencode');
  const [selectedAgentMessageDraft, setSelectedAgentMessageDraft] = useState('');
  const [selectedAgentActionBusy, setSelectedAgentActionBusy] = useState(false);
  const [selectedAgentLoading, setSelectedAgentLoading] = useState(false);
  const [selectedAgentError, setSelectedAgentError] = useState<string | null>(null);
  const [selectedCoordinatorActivity, setSelectedCoordinatorActivity] = useState<ReadonlyArray<AgentActivityEvent>>([]);
  const [selectedCoordinatorAnalytics, setSelectedCoordinatorAnalytics] = useState<AnalyticsDashboardResponse | null>(null);
  const [selectedCoordinatorRuntimeReadiness, setSelectedCoordinatorRuntimeReadiness] = useState<AgentRuntimeReadinessResponse | null>(null);
  const [selectedCoordinatorSessions, setSelectedCoordinatorSessions] = useState<ReadonlyArray<AgentSessionRecord>>([]);
  const [selectedCoordinatorSessionEvents, setSelectedCoordinatorSessionEvents] = useState<ReadonlyArray<AgentSessionEventRecord>>([]);
  const [selectedCoordinatorRuntimeId, setSelectedCoordinatorRuntimeId] = useState('opencode');
  const [selectedCoordinatorMessageDraft, setSelectedCoordinatorMessageDraft] = useState('');
  const [selectedCoordinatorActionBusy, setSelectedCoordinatorActionBusy] = useState(false);
  const [selectedCoordinatorLoading, setSelectedCoordinatorLoading] = useState(false);
  const [selectedCoordinatorError, setSelectedCoordinatorError] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedAgent) {
      setSelectedAgentActivity([]);
      setSelectedAgentAnalytics(null);
      setSelectedAgentRuntimeReadiness(null);
      setSelectedAgentSessions([]);
      setSelectedAgentSessionEvents([]);
      setSelectedAgentRuntimeId('opencode');
      setSelectedAgentMessageDraft('');
      setSelectedAgentLoading(false);
      setSelectedAgentError(null);
      return;
    }

    let cancelled = false;
    setSelectedAgentLoading(true);
    setSelectedAgentError(null);

    void Promise.all([
      relayhqApi.getAgentActivity(selectedAgent.agentId),
      relayhqApi.getAnalyticsSummary(),
      relayhqApi.getAgentRuntimeReadiness(selectedAgent.agentId),
      relayhqApi.listAgentSessions(selectedAgent.agentId),
    ])
      .then(async ([activity, analytics, runtimeReadiness, sessions]) => {
        if (cancelled) return;
        setSelectedAgentActivity(activity);
        setSelectedAgentAnalytics(analytics);
        setSelectedAgentRuntimeReadiness(runtimeReadiness);
        setSelectedAgentRuntimeId(runtimeReadiness.runtimeKind ?? (selectedAgent?.provider === 'claude' ? 'claude-code' : selectedAgent?.provider === 'codex' ? 'codex' : 'opencode'));
        setSelectedAgentSessions(sessions);
        const activeSessionId = selectedAgent.launchSurface === 'attached' ? null : (selectedAgent.sessionId || sessions[0]?.sessionId)
        if (activeSessionId) {
          const events = await relayhqApi.getAgentSessionEvents(activeSessionId)
          if (cancelled) return;
          setSelectedAgentSessionEvents(events)
        } else {
          setSelectedAgentSessionEvents([])
        }
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setSelectedAgentError(error instanceof Error ? error.message : 'Failed to load agent details.');
      })
      .finally(() => {
        if (cancelled) return;
        setSelectedAgentLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedAgent?.agentId, selectedAgent?.sessionId]);

  useEffect(() => {
    if (!selectedCoordinator) {
      setSelectedCoordinatorActivity([]);
      setSelectedCoordinatorAnalytics(null);
      setSelectedCoordinatorRuntimeReadiness(null);
      setSelectedCoordinatorSessions([]);
      setSelectedCoordinatorSessionEvents([]);
      setSelectedCoordinatorRuntimeId('opencode');
      setSelectedCoordinatorMessageDraft('');
      setSelectedCoordinatorLoading(false);
      setSelectedCoordinatorError(null);
      return;
    }

    let cancelled = false;
    setSelectedCoordinatorLoading(true);
    setSelectedCoordinatorError(null);

    void Promise.all([
      relayhqApi.getAgentActivity(selectedCoordinator.agentId),
      relayhqApi.getAnalyticsSummary(),
      relayhqApi.getAgentRuntimeReadiness(selectedCoordinator.agentId),
      relayhqApi.listAgentSessions(selectedCoordinator.agentId),
    ])
      .then(async ([activity, analytics, runtimeReadiness, sessions]) => {
        if (cancelled) return;
        setSelectedCoordinatorActivity(activity);
        setSelectedCoordinatorAnalytics(analytics);
        setSelectedCoordinatorRuntimeReadiness(runtimeReadiness);
        setSelectedCoordinatorRuntimeId(runtimeReadiness.runtimeKind ?? (selectedCoordinator?.provider === 'claude' ? 'claude-code' : selectedCoordinator?.provider === 'codex' ? 'codex' : 'opencode'));
        const dedupedSessions = dedupeAgentSessionsBySessionId(sessions)
        setSelectedCoordinatorSessions(dedupedSessions);
        const activeSession = pickPreferredCoordinatorSession(dedupedSessions, selectedCoordinator.sessionId ?? null)
        const activeSessionId = selectedCoordinator.launchSurface === 'attached' ? null : activeSession?.sessionId ?? null
        if (activeSessionId) {
          const events = await relayhqApi.getAgentSessionEvents(activeSessionId)
          if (cancelled) return;
          setSelectedCoordinatorSessionEvents(events)
        } else {
          setSelectedCoordinatorSessionEvents([])
        }
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setSelectedCoordinatorError(error instanceof Error ? error.message : 'Failed to load coordinator details.');
      })
      .finally(() => {
        if (cancelled) return;
        setSelectedCoordinatorLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedCoordinator?.agentId, selectedCoordinator?.sessionId]);

  const moveAgent = useCallback<(id: string, x: number, y: number) => void>((id, x, y) => {
    setAgentPositions(prev => ({
      ...prev,
      [id]: { x, y },
    }));
  }, []);

  const moveDesktopIcon = useCallback<(id: DesktopIconId, x: number, y: number) => void>((id, x, y) => {
    setDesktopIconPositions(prev => ({
      ...prev,
      [id]: { x, y },
    }))
  }, [])

  const coordinatorDesktopAction = null;

  const openAgentWindow = useCallback((agentId: string, preferredSessionId?: string | null) => {
    setCurrentSceneAgentWindow(current => {
      if (current?.agentId === agentId && current?.preferredSessionId === (preferredSessionId ?? null)) {
        zTop += 1;
        return { ...current, minimized: false, zIndex: zTop };
      }

      const width = 760;
      const height = 720;
      const x = Math.round((window.innerWidth - width) / 2);
      const y = Math.round((window.innerHeight - height) / 2);

      zTop += 1;
      return { agentId, preferredSessionId: preferredSessionId ?? null, x, y, w: width, h: height, zIndex: zTop, minimized: false, maximized: false };
    });
  }, [setCurrentSceneAgentWindow]);

  const openCoordinatorWindow = useCallback((agentId: string, preferredSessionId?: string | null) => {
    console.info('[RelayHQ][coordinator] openCoordinatorWindow', { agentId, preferredSessionId: preferredSessionId ?? null })
    setCurrentSceneCoordinatorWindow(current => {
      if (current?.agentId === agentId && current?.preferredSessionId === (preferredSessionId ?? null)) {
        zTop += 1;
        return { ...current, minimized: false, zIndex: zTop };
      }

      const width = 860;
      const height = Math.min(window.innerHeight - 80, 780);
      const x = Math.round((window.innerWidth - width) / 2);
      const y = Math.round((window.innerHeight - height) / 2);

      zTop += 1;
      return { agentId, preferredSessionId: preferredSessionId ?? null, x, y, w: width, h: height, zIndex: zTop, minimized: false, maximized: false };
    });
  }, [setCurrentSceneCoordinatorWindow]);

  const refreshSelectedAgentSessions = useCallback(async (agentId: string) => {
    const [readiness, sessions] = await Promise.all([
      relayhqApi.getAgentRuntimeReadiness(agentId),
      relayhqApi.listAgentSessions(agentId),
    ])
    setSelectedAgentRuntimeReadiness(readiness)
    setSelectedAgentSessions(sessions)
    const activeSessionId = selectedAgent?.launchSurface === 'attached' ? null : (selectedAgent?.sessionId || sessions[0]?.sessionId)
    if (activeSessionId) {
      const events = await relayhqApi.getAgentSessionEvents(activeSessionId)
      setSelectedAgentSessionEvents(events)
    } else {
      setSelectedAgentSessionEvents([])
    }
  }, [selectedAgent?.sessionId])

  const refreshSelectedCoordinatorSessions = useCallback(async (agentId: string, preferredSessionId?: string | null) => {
    const preferredId = preferredSessionId ?? selectedCoordinator?.sessionId ?? null
    console.info('[RelayHQ][coordinator] refreshSelectedCoordinatorSessions:start', { agentId, selectedSessionId: preferredId })
    const [readiness, sessions] = await Promise.all([
      relayhqApi.getAgentRuntimeReadiness(agentId),
      relayhqApi.listAgentSessions(agentId),
    ])
    console.info('[RelayHQ][coordinator] refreshSelectedCoordinatorSessions:result', {
      agentId,
      readiness: readiness.verificationStatus,
      sessionIds: sessions.map((session) => session.sessionId),
      launchModes: sessions.map((session) => session.launchMode),
      statuses: sessions.map((session) => session.status),
      selectedSessionId: preferredId,
    })
    setSelectedCoordinatorRuntimeReadiness(readiness)
    const dedupedSessions = dedupeAgentSessionsBySessionId(sessions)
    setSelectedCoordinatorSessions(dedupedSessions)
    const preferredSession = pickPreferredCoordinatorSession(dedupedSessions, preferredId)
    if (preferredSession && preferredSession.sessionId !== preferredId) {
      console.info('[RelayHQ][coordinator] refreshSelectedCoordinatorSessions:switchToPreferred', { agentId, fromSessionId: preferredId, toSessionId: preferredSession.sessionId, currentStatus: preferredSession.status ?? null })
      openCoordinatorWindow(agentId, preferredSession.sessionId)
    }
    // Load events from ALL sessions belonging to this coordinator thread (identified by taskId),
    // then merge chronologically so conversation history persists across session restarts.
    const threadId = coordinatorThreads.find((t) => t.coordinatorAgentId === agentId)?.id ?? preferredSession?.taskId ?? null
    const threadSessions = threadId
      ? dedupedSessions.filter((s) => s.taskId === threadId)
      : (preferredSession ? [preferredSession] : [])
    if (threadSessions.length === 0 && selectedCoordinator?.launchSurface !== 'attached') {
      setSelectedCoordinatorSessionEvents([])
      return
    }
    const sessionEventArrays = await Promise.all(
      threadSessions.map((s) => relayhqApi.getAgentSessionEvents(s.sessionId).catch((): AgentSessionEventRecord[] => []))
    )
    const mergedEvents = sessionEventArrays.flat().sort((a, b) => a.timestamp.localeCompare(b.timestamp))
    setSelectedCoordinatorSessionEvents(mergedEvents)
  }, [coordinatorThreads, openCoordinatorWindow, selectedCoordinator?.launchSurface, selectedCoordinator?.sessionId])

  const startProjectCoordinatorChat = useCallback(async (mode: 'fresh' | 'resume' | 'reset' = 'fresh') => {
    if (!activeDesktopProject?.id) {
      throw new Error('Open a project scene before starting coordinator chat.');
    }

    console.info('[RelayHQ][coordinator] startProjectCoordinatorChat', {
      projectId: activeDesktopProject.id,
      mode,
      currentWindowSessionId: coordinatorWindow?.preferredSessionId ?? null,
      selectedSessionId: selectedCoordinator?.sessionId ?? null,
    })
    const response = await relayhqApi.openProjectCoordinatorChat(activeDesktopProject.id, { mode });
    console.info('[RelayHQ][coordinator] startProjectCoordinatorChat:response', {
      projectId: response.projectId,
      coordinatorAgentId: response.coordinatorAgentId,
      coordinatorThreadId: response.coordinatorThreadId,
      sessionId: response.sessionId,
      launchMode: response.launchMode,
      launchSurface: response.launchSurface,
      runtimeKind: response.runtimeKind,
      command: response.command,
      args: response.args,
    })
    openCoordinatorWindow(response.coordinatorAgentId, response.sessionId);
    const now = new Date().toISOString();
    const coordinator = storeAgents.find((agent) => agent.id === response.coordinatorAgentId) ?? null;
    setSelectedCoordinatorSessions((current) => {
      if (current.some((session) => session.sessionId === response.sessionId)) return current;
      return [{
        id: response.sessionId,
        sessionId: response.sessionId,
        agentName: response.coordinatorAgentId,
        taskId: response.taskId,
        provider: coordinator?.provider ?? 'unknown',
        runtimeKind: response.runtimeKind,
        launchSurface: response.launchSurface,
        launchMode: response.launchMode,
        resumedFromSessionId: null,
        status: 'running',
        command: response.command,
        cwd: null,
        startTime: now,
        lastEventAt: now,
      }, ...current];
    });
    await loadData();
    await refreshSelectedCoordinatorSessions(response.coordinatorAgentId, response.sessionId);
    return response;
  }, [activeDesktopProject?.id, loadData, openCoordinatorWindow, refreshSelectedCoordinatorSessions, storeAgents])


  const openProjectCoordinatorThreadWindow = useCallback(async () => {
    if (!activeDesktopProject?.id) {
      throw new Error('Open a project scene before opening the coordinator thread.')
    }

    console.info('[RelayHQ][coordinator] openProjectCoordinatorThreadWindow', {
      projectId: activeDesktopProject.id,
      selectedSessionId: selectedCoordinator?.sessionId ?? null,
      preferredWindowSessionId: coordinatorWindow?.preferredSessionId ?? null,
    })
    const threadResponse = await relayhqApi.openProjectCoordinatorThread(activeDesktopProject.id)
    console.info('[RelayHQ][coordinator] openProjectCoordinatorThreadWindow:response', {
      threadId: threadResponse.thread.id,
      activeSessionId: threadResponse.thread.activeSessionId,
      created: threadResponse.created,
    })
    openCoordinatorWindow(threadResponse.thread.coordinatorAgentId, threadResponse.thread.activeSessionId)
    await refreshSelectedCoordinatorSessions(threadResponse.thread.coordinatorAgentId, threadResponse.thread.activeSessionId)
    await loadData()
    return threadResponse
  }, [activeDesktopProject?.id, coordinatorWindow?.preferredSessionId, loadData, openCoordinatorWindow, refreshSelectedCoordinatorSessions, selectedCoordinator?.sessionId])

  const ensureAgentChatSession = useCallback(async (agentId: string) => {
    if (sceneProjectId && agentId === activeDesktopProject?.coordinatorAgentId) {
      await startProjectCoordinatorChat('fresh');
      return;
    }

    setSelectedAgentError(null)

    const [readiness, existingSessions] = await Promise.all([
      relayhqApi.getAgentRuntimeReadiness(agentId),
      relayhqApi.listAgentSessions(agentId),
    ])

    setSelectedAgentRuntimeReadiness(readiness)
    setSelectedAgentSessions(existingSessions)

    if (existingSessions[0]) {
      const events = await relayhqApi.getAgentSessionEvents(existingSessions[0].sessionId)
      setSelectedAgentSessionEvents(events)
    } else {
      setSelectedAgentSessionEvents([])
    }

    if (existingSessions[0]?.launchSurface === 'background' && existingSessions[0]?.status === 'running') {
      return
    }

    if (readiness.verificationStatus !== 'ready') {
      return
    }

    const latestState = useAppStore.getState()
    const nextTask = findChatTaskForAgent({
      agentId,
      tasks: latestState.tasks,
    })

    if (!nextTask) {
      setSelectedAgentError('No active task is assigned to this agent yet, so in-app chat cannot start a background session.')
      return
    }

    setSelectedAgentActionBusy(true)
    try {
      if (existingSessions[0]) {
        await relayhqApi.resumeAgent(agentId, {
          taskId: nextTask.id,
          previousSessionId: existingSessions[0].sessionId,
          surface: 'background',
        })
      } else {
        await relayhqApi.runAgent(agentId, {
          taskId: nextTask.id,
          mode: 'fresh',
          surface: 'background',
        })
      }

      await loadData()
      await refreshSelectedAgentSessions(agentId)
    } finally {
      setSelectedAgentActionBusy(false)
    }
  }, [loadData, refreshSelectedAgentSessions])

  const openAgentChat = useCallback((spriteId: string) => {
    const runtimeAgent = agents.find((agent) => agent.id === spriteId)
      ?? (() => {
        const runtime = desktopAgentRuntime[spriteId]?.session
        if (!runtime) return null
        const fallbackAgentId = runtime.agentId ?? runtime.agentName.replace(/#\d+$/, '')
        return agents.find((agent) => agent.agentId === fallbackAgentId)
          ?? {
            id: spriteId,
            agentId: fallbackAgentId,
            sessionId: runtime.sessionId,
          }
      })()
    if (!runtimeAgent) return
    openAgentWindow(runtimeAgent.agentId, runtimeAgent.sessionId)
  }, [agents, desktopAgentRuntime, openAgentWindow])

  useEffect(() => {
    if (!selectedAgent?.agentId) return;

    const intervalId = window.setInterval(() => {
      void refreshSelectedAgentSessions(selectedAgent.agentId);
    }, 2000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [refreshSelectedAgentSessions, selectedAgent?.agentId]);

  useEffect(() => {
    if (!selectedCoordinator?.agentId) return;

    const intervalId = window.setInterval(() => {
      void refreshSelectedCoordinatorSessions(selectedCoordinator.agentId);
    }, 2000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [refreshSelectedCoordinatorSessions, selectedCoordinator?.agentId]);

  const bindSelectedAgentOpenCode = useCallback(async () => {
    if (!selectedAgent) return
    setSelectedAgentActionBusy(true)
    try {
      await relayhqApi.bindAgentRuntime(selectedAgent.agentId, selectedAgentRuntimeId)
      await refreshSelectedAgentSessions(selectedAgent.agentId)
    } finally {
      setSelectedAgentActionBusy(false)
    }
  }, [refreshSelectedAgentSessions, selectedAgent])

  const bindSelectedCoordinatorOpenCode = useCallback(async () => {
    if (!selectedCoordinator) return
    setSelectedCoordinatorActionBusy(true)
    try {
      await relayhqApi.bindAgentRuntime(selectedCoordinator.agentId, selectedCoordinatorRuntimeId)
      await refreshSelectedCoordinatorSessions(selectedCoordinator.agentId, selectedCoordinator.sessionId ?? null)
    } finally {
      setSelectedCoordinatorActionBusy(false)
    }
  }, [refreshSelectedCoordinatorSessions, selectedCoordinator, selectedCoordinatorRuntimeId])

  const verifySelectedAgentRuntime = useCallback(async () => {
    if (!selectedAgent) return
    setSelectedAgentActionBusy(true)
    try {
      await refreshSelectedAgentSessions(selectedAgent.agentId)
    } finally {
      setSelectedAgentActionBusy(false)
    }
  }, [refreshSelectedAgentSessions, selectedAgent])

  const verifySelectedCoordinatorRuntime = useCallback(async () => {
    if (!selectedCoordinator) return
    setSelectedCoordinatorActionBusy(true)
    try {
      await refreshSelectedCoordinatorSessions(selectedCoordinator.agentId, selectedCoordinator.sessionId ?? null)
    } finally {
      setSelectedCoordinatorActionBusy(false)
    }
  }, [refreshSelectedCoordinatorSessions, selectedCoordinator])

  const launchSelectedAgentFresh = useCallback(async () => {
    if (!selectedAgent) return
    const task = resolveChatTaskForAgent(selectedAgent.agentId)
    if (!task) return
    setSelectedAgentActionBusy(true)
    try {
      await relayhqApi.runAgent(selectedAgent.agentId, { taskId: task.id, mode: 'fresh', surface: 'background' })
      await refreshSelectedAgentSessions(selectedAgent.agentId)
    } finally {
      setSelectedAgentActionBusy(false)
    }
  }, [refreshSelectedAgentSessions, resolveChatTaskForAgent, selectedAgent])

  const resumeSelectedAgent = useCallback(async () => {
    if (!selectedAgent) return
    const task = resolveChatTaskForAgent(selectedAgent.agentId)
    if (!task) return
    const previousSession = selectedAgentSessions[0] ?? null
    setSelectedAgentActionBusy(true)
    try {
      await relayhqApi.resumeAgent(selectedAgent.agentId, { taskId: task.id, previousSessionId: previousSession?.sessionId ?? null, surface: 'background' })
      await refreshSelectedAgentSessions(selectedAgent.agentId)
    } finally {
      setSelectedAgentActionBusy(false)
    }
  }, [refreshSelectedAgentSessions, resolveChatTaskForAgent, selectedAgent, selectedAgentSessions])

  const activeSelectedSession = useMemo(() => {
    const exactMatch = selectedAgent?.sessionId
      ? selectedAgentSessions.find((session) => session.sessionId === selectedAgent.sessionId) ?? null
      : null;

    if (exactMatch) return exactMatch;

    if (selectedAgent?.sessionId) {
      const runtimeSession = desktopAgentRuntime[selectedAgent.sessionId]?.session ?? null;
      if (runtimeSession) return runtimeSession;
    }

    return selectedAgentSessions[0] ?? null;
  }, [desktopAgentRuntime, selectedAgent?.sessionId, selectedAgentSessions])

  const activeSelectedCoordinatorSession = useMemo(() => {
    const dedupedSessions = dedupeAgentSessionsBySessionId(selectedCoordinatorSessions)
    const exactMatch = selectedCoordinator?.sessionId
      ? dedupedSessions.find((session) => session.sessionId === selectedCoordinator.sessionId) ?? null
      : null;

    if (exactMatch) return exactMatch;

    if (selectedCoordinator?.sessionId) {
      const runtimeSession = desktopAgentRuntime[selectedCoordinator.sessionId]?.session ?? null;
      if (runtimeSession?.status === 'running') return runtimeSession;
    }

      return dedupedSessions.find((session) => session.launchSurface === 'background' && session.status === 'running') ?? null;
    }, [desktopAgentRuntime, selectedCoordinator?.sessionId, selectedCoordinatorSessions])

  const stopSelectedAgent = useCallback(async () => {
    if (!activeSelectedSession?.sessionId || activeSelectedSession.launchSurface === 'attached') return
    setSelectedAgentActionBusy(true)
    try {
      await relayhqApi.stopAgentSession(activeSelectedSession.sessionId)
      setDesktopAgentRuntime((current) => {
        const { [activeSelectedSession.sessionId]: _removed, ...rest } = current;
        return rest;
      })
      if (selectedAgent) {
        await refreshSelectedAgentSessions(selectedAgent.agentId)
      }
    } finally {
      setSelectedAgentActionBusy(false)
    }
  }, [activeSelectedSession?.launchSurface, activeSelectedSession?.sessionId, refreshSelectedAgentSessions, selectedAgent])

  const launchSelectedCoordinatorFresh = useCallback(async () => {
    setSelectedCoordinatorActionBusy(true)
    setSelectedCoordinatorError(null)
    try {
      await startProjectCoordinatorChat('fresh')
    } catch (error) {
      setSelectedCoordinatorError(error instanceof Error ? error.message : 'Failed to launch coordinator session.')
    } finally {
      setSelectedCoordinatorActionBusy(false)
    }
  }, [startProjectCoordinatorChat])

  const stopSelectedCoordinator = useCallback(async () => {
    if (!activeSelectedCoordinatorSession?.sessionId || activeSelectedCoordinatorSession.launchSurface === 'attached') return
    setSelectedCoordinatorActionBusy(true)
    setSelectedCoordinatorError(null)
    try {
      await relayhqApi.stopAgentSession(activeSelectedCoordinatorSession.sessionId)
      setDesktopAgentRuntime((current) => {
        const { [activeSelectedCoordinatorSession.sessionId]: _removed, ...rest } = current;
        return rest;
      })
      if (selectedCoordinator) {
        await refreshSelectedCoordinatorSessions(selectedCoordinator.agentId, activeSelectedCoordinatorSession.sessionId)
      }
    } catch (error) {
      setSelectedCoordinatorError(error instanceof Error ? error.message : 'Failed to stop coordinator session.')
    } finally {
      setSelectedCoordinatorActionBusy(false)
    }
  }, [activeSelectedCoordinatorSession?.launchSurface, activeSelectedCoordinatorSession?.sessionId, refreshSelectedCoordinatorSessions, selectedCoordinator])

  const sendSelectedAgentMessage = useCallback(async () => {
    if (!activeSelectedSession?.sessionId || activeSelectedSession.launchSurface === 'attached') return
    const message = selectedAgentMessageDraft.trim()
    if (message.length === 0) return
    setSelectedAgentActionBusy(true)
    try {
      await relayhqApi.sendAgentSessionMessage(activeSelectedSession.sessionId, message)
      setSelectedAgentMessageDraft('')
      if (selectedAgent) {
        await refreshSelectedAgentSessions(selectedAgent.agentId)
      }
    } finally {
      setSelectedAgentActionBusy(false)
    }
  }, [activeSelectedSession?.launchSurface, activeSelectedSession?.sessionId, refreshSelectedAgentSessions, selectedAgent, selectedAgentMessageDraft])

  const sendSelectedCoordinatorMessage = useCallback(async () => {
    if (!activeDesktopProject?.id) {
      setSelectedCoordinatorError('Open a project scene before messaging the coordinator.')
      return
    }
    const message = selectedCoordinatorMessageDraft.trim()
    if (message.length === 0) return
    setSelectedCoordinatorActionBusy(true)
    setSelectedCoordinatorError(null)
    try {
      if (activeSelectedCoordinatorSession?.sessionId && activeSelectedCoordinatorSession.launchSurface === 'background' && activeSelectedCoordinatorSession.status === 'running') {
        await relayhqApi.sendAgentSessionMessage(activeSelectedCoordinatorSession.sessionId, message)
        await refreshSelectedCoordinatorSessions(selectedCoordinator?.agentId ?? '', activeSelectedCoordinatorSession.sessionId)
      } else {
        // Use 'resume' so the server embeds recent history into the new session prompt.
        const response = await relayhqApi.openProjectCoordinatorChat(activeDesktopProject.id, { message, mode: 'resume' })
        await refreshSelectedCoordinatorSessions(response.coordinatorAgentId, response.sessionId)
      }
      setSelectedCoordinatorMessageDraft('')
    } catch (error) {
      setSelectedCoordinatorError(error instanceof Error ? error.message : 'Failed to send coordinator message.')
    } finally {
      setSelectedCoordinatorActionBusy(false)
    }
  }, [activeDesktopProject?.id, activeSelectedCoordinatorSession?.launchSurface, activeSelectedCoordinatorSession?.sessionId, activeSelectedCoordinatorSession?.status, refreshSelectedCoordinatorSessions, selectedCoordinator?.agentId, selectedCoordinatorMessageDraft])

  const openProjectCoordinatorChat = useCallback(async () => {
    const coordinatorAgentId = activeDesktopProject?.coordinatorAgentId ?? null;
    if (!coordinatorAgentId) {
      setCoordinatorError('Assign a coordinator before opening project chat.');
      setSelectedCoordinatorError('Assign a coordinator before opening project chat.');
      return;
    }

    if (!storeAgents.some((agent) => agent.id === coordinatorAgentId)) {
      setCoordinatorError('The assigned coordinator is not available in this workspace.');
      setSelectedCoordinatorError('The assigned coordinator is not available in this workspace.');
      return;
    }

    setCoordinatorError(null);
    setSelectedCoordinatorError(null);
    setSelectedCoordinatorActionBusy(true)
    try {
      // Open the coordinator thread window to show existing conversation history.
      // Don't start a fresh one-shot session here — only launch when the user sends a message.
      await openProjectCoordinatorThreadWindow();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to open coordinator chat.';
      setCoordinatorError(message);
      setSelectedCoordinatorError(message);
    } finally {
      setSelectedCoordinatorActionBusy(false)
    }
  }, [activeDesktopProject?.coordinatorAgentId, openProjectCoordinatorThreadWindow, storeAgents])

  const openDesktopIcon = useCallback((id: DesktopIconId) => {
    if (id === COORDINATOR_DESKTOP_ICON) {
      if (hasCoordinator) {
        void openProjectCoordinatorChat();
      } else {
        setCoordinatorError(null);
        setIsCoordinatorSetupOpen(true);
      }
      return;
    }

    openWindow(id);
  }, [hasCoordinator, openProjectCoordinatorChat, openWindow]);

  const minimizeAgentWindow = useCallback(() => {
    setCurrentSceneAgentWindow(current => (current ? { ...current, minimized: true } : current));
  }, [setCurrentSceneAgentWindow]);

  const toggleAgentWindowMaximize = useCallback(() => {
    setCurrentSceneAgentWindow(current => {
      if (!current) return current;

      if (current.maximized) {
        const restore = current.restore ?? { x: current.x, y: current.y, w: current.w, h: current.h };
        return {
          ...current,
          ...restore,
          restore: undefined,
          maximized: false,
          minimized: false,
        };
      }

      return {
        ...current,
        restore: { x: current.x, y: current.y, w: current.w, h: current.h },
        x: 0,
        y: DESKTOP_FULLSCREEN_TOP,
        w: window.innerWidth,
        h: window.innerHeight - (DESKTOP_TOPBAR_HEIGHT * 2),
        maximized: true,
        minimized: false,
      };
    });
  }, [setCurrentSceneAgentWindow]);

  const openIds = new Set<string>(windows.filter(w => !w.minimized).map(w => w.content));


  return (
    <div className="desktop-surface lcd-card relative h-screen w-screen overflow-hidden bg-surface-sidebar" style={desktopSceneStyle}>
      <div className="desktop-corner-glow pointer-events-none absolute inset-0 z-0">
        <div
          className="absolute top-0 left-0 h-64 w-64 opacity-20"
          style={{ background: 'radial-gradient(circle at 0% 0%, var(--brand), transparent 60%)' }}
        />
      </div>

      {/* Topbar */}
      <div className="absolute top-0 left-0 right-0 z-[60] flex h-14 items-center justify-between overflow-hidden border-b border-border bg-surface-sidebar px-6 text-[10px] uppercase tracking-[0.2em]">
        <div className="flex shrink-0 items-center gap-3 text-brand-bright text-glow">
          <span className="font-display">ARIA OS</span>
          <span className="text-brand-bright">CRT-AMBER</span>
        </div>

        <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-brand-bright text-glow">
          <span>{currentTime}</span>
        </div>

        <div className="flex shrink-0 items-center gap-4 text-brand-bright text-glow">
          <Select
            value={activeDesktopProject?.id ?? ''}
            onChange={(event) => {
              if (event.target.value) updateDesktopProject(event.target.value);
            }}
            className="h-8 min-w-56 bg-surface text-[10px] tracking-[0.14em] text-brand-bright"
          >
            {projects.map(project => (
              <option key={project.id} value={project.id}>{project.name}</option>
            ))}
          </Select>
        </div>
      </div>

      {/* Desktop canvas */}
      <div className="absolute inset-0 pt-14">
        <Fragment key={sceneProjectId ?? 'desktop-default-scene'}>
          <DesktopAgentScene
            sceneId={sceneProjectId}
            agents={sceneAgents}
            theme={desktopTheme}
            className="absolute inset-0 z-[5]"
            onAgentClick={openAgentChat}
            onAgentDragEnd={moveAgent}
          />
        </Fragment>

        <DesktopIcons
          openIds={openIds}
          onOpen={openDesktopIcon}
          positions={desktopIconPositions}
          onMove={moveDesktopIcon}
          coordinatorAction={coordinatorDesktopAction}
        />

        {windows.map((win: WindowState) => (
          <Fragment key={win.id}>
            <OsWindow
              win={win}
              onClose={closeWindow as (id: string) => void}
              onFocus={focusWindow as (id: string) => void}
              onMinimize={minimizeWindow}
              onToggleMaximize={toggleMaximizeWindow}
              onOpenTask={openTaskWindow}
              onMove={moveWindow}
              onResize={resizeWindow}
              projectRows={projectRows}
              selectedProjectId={sceneProjectId}
              onProjectSelect={updateDesktopProject}
            />
          </Fragment>
        ))}
      </div>

      <AgentDetailWindow
        agent={selectedAgent}
        windowState={agentWindow}
        onClose={() => setCurrentSceneAgentWindow(() => null)}
        onMinimize={minimizeAgentWindow}
        onToggleMaximize={toggleAgentWindowMaximize}
        onDragEnd={(x, y) => setCurrentSceneAgentWindow(current => current ? { ...current, x, y } : current)}
        activity={selectedAgentActivity}
        analytics={selectedAgentAnalytics}
        loading={selectedAgentLoading}
        error={selectedAgentError}
        runtimeReadiness={selectedAgentRuntimeReadiness}
        sessions={selectedAgentSessions}
        selectedSession={activeSelectedSession}
        sessionEvents={selectedAgentSessionEvents}
        runtimeSelection={selectedAgentRuntimeId}
        onRuntimeSelectionChange={setSelectedAgentRuntimeId}
        onBindOpenCode={() => void bindSelectedAgentOpenCode()}
        onVerifyRuntime={() => void verifySelectedAgentRuntime()}
        onLaunchFresh={() => void launchSelectedAgentFresh()}
        onResumeLatest={() => void resumeSelectedAgent()}
        onStopLatest={() => void stopSelectedAgent()}
        messageDraft={selectedAgentMessageDraft}
        onMessageDraftChange={setSelectedAgentMessageDraft}
        onSendMessage={() => void sendSelectedAgentMessage()}
        actionBusy={selectedAgentActionBusy}
      />

      {/* Vault setup — shows automatically when vault not configured */}
      <OnboardingWizard />
      <AgentSetupWizard open={isAgentSetupWizardOpen} onClose={() => setIsAgentSetupWizardOpen(false)} />
    </div>
  );
}

export default DesktopView;
