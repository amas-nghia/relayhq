import { useState, useCallback, useEffect, useRef, Fragment, Suspense, lazy, useMemo, type ComponentType, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Rnd } from 'react-rnd';
import { KanbanSquare, List, Bot, ClipboardCheck, FileText, Activity, Settings, FolderOpen, Check, AlertCircle, Copy, Eye, EyeOff, Play } from 'lucide-react';
import { OnboardingWizard } from '../components/layout/OnboardingWizard';
import { relayhqApi, type AgentActivityEvent, type AgentRuntimeReadinessResponse, type AgentSessionEventRecord, type AgentSessionRecord, type AnalyticsDashboardResponse, type RelayHQApiKeyEntry } from '../api/client';
import { useAppStore } from '../store/appStore';
import { Button } from '../components/ui/button';
import { DetailPanel } from '../components/task/DetailPanel';
import { Input } from '../components/ui/input';
import { Select } from '../components/ui/select';
import { AgentSetupWizard } from '../components/layout/AgentSetupWizard';
import { RuntimeTruthBadges, RuntimeTruthMessage } from '../components/agent/RuntimeTruth';

const BoardView      = lazy(async () => ({ default: (await import('./BoardView')).BoardView }));
const TasksView      = lazy(async () => ({ default: (await import('./TasksView')).TasksView }));
const AgentsView     = lazy(async () => ({ default: (await import('./AgentsView')).AgentsView }));
const ApprovalsView  = lazy(async () => ({ default: (await import('./ApprovalsView')).ApprovalsView }));
const AuditView      = lazy(async () => ({ default: (await import('./AuditView')).AuditView }));
const DocsView       = lazy(async () => ({ default: (await import('./DocsView')).DocsView }));

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

type WindowContentId = 'board' | 'tasks' | 'agents' | 'approvals' | 'docs' | 'audit' | 'settings' | 'task-detail';

interface AgentSprite {
  id: string;
  name: string;
  x: number;
  y: number;
  status: 'idle' | 'working' | 'blocked';
  color: string;
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
  portraitAsset?: string | null;
  flip?: boolean;
}

interface AgentMotionState {
  restX: number;
  y: number;
  vy: number;
  phase: number;
  grounded: boolean;
  facingLeft: boolean;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DESKTOP_ICONS: { id: WindowContentId; label: string; Icon: ComponentType<{ className?: string }> }[] = [
  { id: 'board',     label: 'Board',     Icon: KanbanSquare   },
  { id: 'tasks',     label: 'Tasks',     Icon: List           },
  { id: 'agents',    label: 'Agents',    Icon: Bot            },
  { id: 'approvals', label: 'Approvals', Icon: ClipboardCheck },
  { id: 'docs',      label: 'Docs',      Icon: FileText       },
  { id: 'audit',     label: 'Audit',     Icon: Activity       },
  { id: 'settings',  label: 'Settings',  Icon: Settings       },
];

const STATUS_COLOR: Record<AgentSprite['status'], string> = {
  working: '#f59e0b',
  idle:    '#8f8466',
  blocked: '#fb7185',
};

const DESKTOP_ICON_GRID = 24;
const DESKTOP_ICON_SIZE = { w: 72, h: 88 };
const DESKTOP_ICON_STATE_KEY = 'relayhq-desktop-icon-positions';
const DESKTOP_TOPBAR_HEIGHT = 44;
const DESKTOP_FULLSCREEN_TOP = DESKTOP_TOPBAR_HEIGHT;
const DESKTOP_ANIMATION_FRAME_MS = 1000 / 20;
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

function positionForIndex(index: number) {
  const column = index % 2;
  const row = Math.floor(index / 2);
  return {
    x: 24 + column * 84,
    y: 48 + row * 96,
  };
}

// ─── Settings panel ────────────────────────────────────────────────────────────

const PROVIDERS = [
  { id: 'anthropic', label: 'Anthropic',  envVar: 'ANTHROPIC_API_KEY',  models: ['claude-sonnet-4-6', 'claude-opus-4-7', 'claude-haiku-4-5', 'claude-opus-4-5', 'claude-sonnet-4-5'] },
  { id: 'openai',    label: 'OpenAI',     envVar: 'OPENAI_API_KEY',     models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo'] },
  { id: 'google',    label: 'Google',     envVar: 'GOOGLE_API_KEY',     models: ['gemini-2.0-flash', 'gemini-1.5-pro', 'gemini-1.5-flash'] },
] as const;

function SettingsPanel() {
  const settings  = useAppStore(state => state.settings);
  const loadData  = useAppStore(state => state.loadData);

  const [tab, setTab] = useState<'vault' | 'agent'>('vault');

  // ── vault tab state ──
  const [vaultRoot,    setVaultRoot]    = useState(settings?.vaultRoot ?? settings?.resolvedRoot ?? '');
  const [browsePath,   setBrowsePath]   = useState<string | null>(null);
  const [browseParent, setBrowseParent] = useState<string | null>(null);
  const [dirs,         setDirs]         = useState<string[]>([]);
  const [vaultStatus,  setVaultStatus]  = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [vaultError,   setVaultError]   = useState<string | null>(null);

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
      await relayhqApi.saveSettings({ vaultRoot, workspaceId: null });
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

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Tabs */}
      <div className="flex border-b border-border flex-shrink-0">
        {(['vault', 'agent'] as const).map(t => (
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
      </div>
    </div>
  );
}

// ─── Window content ────────────────────────────────────────────────────────────

type StaticWindowContentId = Exclude<WindowContentId, 'task-detail'>;

const PAGE_MAP: Record<StaticWindowContentId, ComponentType<{ onTaskSelect?: (taskId: string) => void }>> = {
  board:     BoardView,
  tasks:     TasksView,
  agents:    AgentsView,
  approvals: ApprovalsView,
  docs:      DocsView,
  audit:     AuditView,
  settings:  SettingsPanel,
};

function WindowContent({ win, onTaskSelect }: { win: WindowState; onTaskSelect: (taskId: string) => void }) {
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

  const Page = PAGE_MAP[win.content as StaticWindowContentId] as ComponentType<{ onTaskSelect?: (taskId: string) => void }>;
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

// ─── Pixel art helpers ─────────────────────────────────────────────────────────

function AgentPixelAvatar({ color, size = 32, blinking = false }: { color: string; size?: number; blinking?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 8 8" style={{ imageRendering: 'pixelated' }}>
      <rect x="1" y="0" width="6" height="2" fill={color} opacity={0.9} />
      <rect x="1" y="2" width="6" height="4" fill="#fde68a" />
      <rect x="2" y="3" width="1" height={blinking ? 0 : 1} fill="#1c1917" />
      <rect x="5" y="3" width="1" height={blinking ? 0 : 1} fill="#1c1917" />
      <rect x="3" y="5" width="2" height="1" fill="#1c1917" />
      <rect x="2" y="6" width="4" height="2" fill={color} opacity={0.7} />
    </svg>
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

function OsWindow({ win, onClose, onFocus, onMinimize, onToggleMaximize, onOpenTask, onMove, onResize }: {
  win: WindowState;
  onClose: (id: string) => void;
  onFocus: (id: string) => void;
  onMinimize: (id: string) => void;
  onToggleMaximize: (id: string) => void;
  onOpenTask: (taskId: string) => void;
  onMove: (id: string, next: { x: number; y: number }) => void;
  onResize: (id: string, next: { x: number; y: number; w: number; h: number }) => void;
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
        onMove(win.id, { x: data.x, y: data.y });
      }}
      onResizeStop={(_, __, ref, ___, position) => {
        if (win.maximized) return;
        onResize(win.id, {
          x: position.x,
          y: position.y,
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
          <WindowContent win={win} onTaskSelect={onOpenTask} />
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
  x: number;
  y: number;
  w: number;
  h: number;
  zIndex: number;
  minimized?: boolean;
  maximized?: boolean;
  restore?: { x: number; y: number; w: number; h: number };
}

// ─── Desktop Agent Sprite ──────────────────────────────────────────────────────

function DesktopAgent({ agent, onDragStart, onDragEnd, onClick }: {
  agent: AgentSprite;
  onDragStart: (id: string) => void;
  onDragEnd: (id: string, x: number, y: number) => void;
  onClick: () => void;
}) {
  const imageSrc = agent.spriteAsset ?? agent.portraitAsset ?? null;
  const pointerRef = useRef<{ x: number; y: number; dragged: boolean } | null>(null);

  return (
    <Rnd
      position={{ x: agent.x, y: agent.y }}
      size={{ width: 128, height: 152 }}
      enableResizing={false}
      bounds="parent"
      onDragStart={() => onDragStart(agent.id)}
      onDragStop={(_, d) => onDragEnd(agent.id, d.x, d.y)}
      style={{ position: 'absolute', zIndex: 5, cursor: 'grab' }}
    >
      <button
        type="button"
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
          onClick();
        }}
        className="flex h-full w-full flex-col items-center justify-start gap-1 select-none bg-transparent px-0 py-1 text-left outline-none"
        title={`Open ${agent.name} chat`}
      >
        <span className="max-w-full rounded-none bg-surface-sidebar px-1.5 py-0.5 text-[10px] font-display uppercase tracking-wider text-brand-bright text-glow">
          {agent.name}
        </span>
        <div className="flex w-full flex-1 items-center justify-center">
          {imageSrc ? (
            <img
              src={imageSrc}
              alt={agent.name}
              className="max-h-full max-w-full object-contain"
              style={{ imageRendering: 'pixelated', transform: agent.flip ? 'scaleX(-1)' : 'none' }}
              draggable={false}
            />
          ) : (
            <div style={{ transform: agent.flip ? 'scaleX(-1)' : 'none' }}>
              <AgentPixelAvatar color={agent.color} size={104} />
            </div>
          )}
        </div>
      </button>
    </Rnd>
  );
}

function AgentDetailWindow({ agent, windowState, onClose, onMinimize, onToggleMaximize, onDragEnd, activity, analytics, loading, error, runtimeReadiness, sessions, sessionEvents, runtimeSelection, onRuntimeSelectionChange, onBindOpenCode, onVerifyRuntime, onLaunchFresh, onResumeLatest, onStopLatest, messageDraft, onMessageDraftChange, onSendMessage, actionBusy }: {
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
  sessionEvents: ReadonlyArray<AgentSessionEventRecord>;
  runtimeSelection: string;
  onRuntimeSelectionChange: (value: string) => void;
  onBindOpenCode: () => void;
  onVerifyRuntime: () => void;
  onLaunchFresh: () => void;
  onResumeLatest: () => void;
  onStopLatest: () => void;
  messageDraft: string;
  onMessageDraftChange: (value: string) => void;
  onSendMessage: () => void;
  actionBusy: boolean;
}) {
  if (!agent || !windowState) return null;
  if (windowState.minimized) return null;

  const imageSrc = agent.spriteAsset ?? agent.portraitAsset ?? null;
  const scorecard = analytics?.agents.scorecards.find(entry => entry.agentId === agent.id) ?? null;
  const canChatInApp = sessions[0]?.launchSurface === 'background' && sessions[0]?.status === 'running'
  const chatPlaceholder = !sessions[0]
    ? 'No active session yet. Assign a task and launch chat to start one.'
    : sessions[0].launchSurface !== 'background'
      ? 'This session is detached from the in-app chat surface.'
      : sessions[0].status !== 'running'
        ? 'Resume the latest background session to continue chatting.'
        : 'Send a message to the running session'

  return (
    <Rnd
      position={{ x: windowState.x, y: windowState.y }}
      size={{ width: windowState.w, height: windowState.h }}
      enableResizing={!windowState.maximized}
      disableDragging={windowState.maximized}
      bounds="parent"
      onDragStop={(_, d) => onDragEnd(d.x, d.y)}
      style={{ position: 'absolute', zIndex: windowState.zIndex }}
    >
      <div className="lcd-card flex h-full flex-col overflow-hidden border border-border bg-surface shadow-modal">
        <AgentWindowChrome
          title={agent.name}
          maximized={windowState.maximized ?? false}
          onMinimize={onMinimize}
          onToggleMaximize={onToggleMaximize}
          onClose={onClose}
        />

        <div className="flex-1 overflow-y-auto lane-scroll p-4">
          <div className="grid gap-5 md:grid-cols-[192px_1fr]">
            <div className="flex flex-col items-center gap-3">
              <div className="flex h-[192px] w-[192px] items-center justify-center">
                {imageSrc ? (
                  <img src={imageSrc} alt={agent.name} className="h-full w-full object-contain" style={{ imageRendering: 'pixelated' }} />
                ) : (
                  <AgentPixelAvatar color={agent.color} size={192} />
                )}
              </div>
              <div className="flex items-center gap-2">
                <StatusDot status={agent.status} />
                <span className="text-sm text-text-tertiary">{agent.status}</span>
              </div>
            </div>

            <div className="flex flex-col gap-4 text-sm text-text-secondary">
              <div className="grid grid-cols-2 gap-3">
                <div><div className="text-[11px] uppercase tracking-[0.18em] text-text-tertiary">Role</div><div className="text-base text-text-primary">{agent.role ?? '—'}</div></div>
                <div><div className="text-[11px] uppercase tracking-[0.18em] text-text-tertiary">Provider</div><div className="text-base text-text-primary">{agent.provider ?? '—'}</div></div>
                <div><div className="text-[11px] uppercase tracking-[0.18em] text-text-tertiary">Model</div><div className="text-base text-text-primary">{agent.model ?? '—'}</div></div>
                <div><div className="text-[11px] uppercase tracking-[0.18em] text-text-tertiary">Run mode</div><div className="text-base text-text-primary">{agent.runMode ?? '—'}</div></div>
              </div>

              <div>
                <div className="text-[11px] uppercase tracking-[0.18em] text-text-tertiary">System prompt</div>
                <pre className="mt-2 max-h-52 overflow-auto whitespace-pre-wrap rounded-none bg-surface-secondary p-3 text-base text-text-primary">{agent.body?.trim() || '—'}</pre>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <div className="text-[11px] uppercase tracking-[0.18em] text-text-tertiary">Skill file</div>
                  <div className="break-all text-text-primary">{agent.skillFile ?? '—'}</div>
                </div>
                <div>
                  <div className="text-[11px] uppercase tracking-[0.18em] text-text-tertiary">Source path</div>
                  <div className="break-all text-text-primary">{agent.sourcePath ?? '—'}</div>
                </div>
              </div>

              <div>
                <div className="text-[11px] uppercase tracking-[0.18em] text-text-tertiary">Skill files</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {(agent.skillFiles ?? []).length > 0 ? agent.skillFiles!.map((skill) => (
                    <span key={skill} className="rounded-full border border-border bg-surface-secondary px-2 py-1 text-sm text-text-primary">{skill}</span>
                  )) : <span className="text-text-primary">—</span>}
                </div>
              </div>

              <div>
                <div className="text-[11px] uppercase tracking-[0.18em] text-text-tertiary">Capabilities</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {(agent.capabilities ?? []).length > 0 ? agent.capabilities!.map((cap) => (
                    <span key={cap} className="rounded-full border border-border bg-surface-secondary px-2 py-1 text-sm text-text-primary">{cap}</span>
                  )) : <span className="text-text-primary">—</span>}
                </div>
              </div>

              <div className="rounded-none border border-border bg-surface-secondary p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-[11px] uppercase tracking-[0.18em] text-text-tertiary">Runtime control</div>
                  <div className="text-[11px] text-text-secondary">{runtimeReadiness?.verificationStatus ?? 'unknown'}</div>
                </div>
                <div className="mt-2 text-sm text-text-secondary">
                  {runtimeReadiness?.reason ?? `runtime=${runtimeReadiness?.runtimeKind ?? agent.runMode ?? 'unknown'}`}
                </div>
                <RuntimeTruthBadges agent={agent} readiness={runtimeReadiness} className="mt-3" />
                <RuntimeTruthMessage agent={agent} readiness={runtimeReadiness} className="mt-3" />
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={onStopLatest} disabled={actionBusy || !sessions[0]}>Stop</Button>
                </div>
                {sessions[0] && (
                  <div className="mt-3 border-t border-border pt-3 text-xs text-text-secondary">
                    <div>Latest session: <span className="text-text-primary">{sessions[0].launchMode} · {sessions[0].status}</span></div>
                    <div className="mt-2 max-h-64 overflow-y-auto rounded-none border border-border bg-surface px-2 py-2">
                      {sessionEvents.length > 0 ? sessionEvents.slice(-4).map((event) => (
                        <div key={event.id} className="mb-2 last:mb-0">
                          <div className="uppercase tracking-[0.14em] text-text-tertiary">{event.type}</div>
                          <div className="whitespace-pre-wrap break-words text-text-primary">{event.text ?? (event.code == null ? 'No details' : `Exit code ${event.code}`)}</div>
                        </div>
                        )) : 'No session events loaded.'}
                    </div>
                    <div className="mt-3 text-[11px] uppercase tracking-[0.18em] text-text-tertiary">In-app chat</div>
                    <div className="mt-2 text-xs text-text-secondary">
                      {canChatInApp ? 'Chat is live for this background session.' : 'Chat is available only while a background session is running.'}
                    </div>
                    <div className="mt-2 flex gap-2">
                      <Input value={messageDraft} onChange={(event) => onMessageDraftChange(event.target.value)} placeholder={chatPlaceholder} disabled={!canChatInApp} />
                      <Button type="button" size="sm" onClick={onSendMessage} disabled={!canChatInApp || actionBusy || messageDraft.trim().length === 0}>Send</Button>
                    </div>
                  </div>
                )}
              </div>

              <div className="rounded-none border border-border bg-surface-secondary p-3">
                <div className="text-[11px] uppercase tracking-[0.18em] text-text-tertiary">Agent analytics</div>
                {loading && !analytics ? (
                  <div className="mt-2 text-sm text-text-secondary">Loading snapshot…</div>
                ) : error && !analytics ? (
                  <div className="mt-2 text-sm text-status-blocked">{error}</div>
                ) : scorecard ? (
                  <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
                    <div className="rounded-none border border-border bg-surface px-3 py-2"><div className="text-text-tertiary">Completed</div><div className="mt-1 text-sm text-text-primary">{scorecard.completedTaskCount}/{scorecard.taskCount}</div></div>
                    <div className="rounded-none border border-border bg-surface px-3 py-2"><div className="text-text-tertiary">Cost</div><div className="mt-1 text-sm text-text-primary">{formatCurrency(scorecard.costUsd)}</div></div>
                    <div className="rounded-none border border-border bg-surface px-3 py-2"><div className="text-text-tertiary">Approval</div><div className="mt-1 text-sm text-text-primary">{formatPercent(scorecard.approvalRate)}</div></div>
                    <div className="rounded-none border border-border bg-surface px-3 py-2"><div className="text-text-tertiary">Avg complete</div><div className="mt-1 text-sm text-text-primary">{formatDays(scorecard.avgCompletionDays)}</div></div>
                  </div>
                ) : (
                  <div className="mt-2 text-sm text-text-secondary">No analytics snapshot yet.</div>
                )}
              </div>

              <div className="rounded-none border border-border bg-surface-secondary p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-[11px] uppercase tracking-[0.18em] text-text-tertiary">Activity feed</div>
                  {scorecard && <div className="text-[11px] text-text-secondary">{scorecard.stuckCount} stuck</div>}
                </div>
                <div className="mt-2 space-y-2">
                  {activity.length === 0 && !loading ? <div className="text-sm text-text-secondary">No recent activity.</div> : null}
                  {activity.slice(0, 6).map((event) => (
                    <div key={`${event.timestamp}-${event.event_type}`} className="flex items-center justify-between gap-3 text-xs text-text-secondary">
                      <span className="inline-flex items-center gap-2">
                        {eventIcon(event.event_type)}
                        {eventLabel(event.event_type)}
                      </span>
                      <span>{new Date(event.timestamp).toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Rnd>
  )
}

function DesktopIconButton({ item, active, onOpen }: {
  item: { id: WindowContentId; label: string; Icon: ComponentType<{ className?: string }> };
  active: boolean;
  onOpen: (id: WindowContentId) => void;
}) {
  const pointerRef = useRef<{ x: number; y: number; dragged: boolean } | null>(null);

  return (
    <button
      type="button"
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
        onOpen(item.id);
      }}
      title={item.label}
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
}: {
  openIds: Set<string>;
  onOpen: (id: WindowContentId) => void;
  positions: Record<WindowContentId, { x: number; y: number }>;
  onMove: (id: WindowContentId, x: number, y: number) => void;
}) {
  return (
    <div className="pointer-events-none absolute inset-0 z-10">
      {DESKTOP_ICONS.map(item => {
        const active = openIds.has(item.id);
        const position = positions[item.id] ?? positionForIndex(DESKTOP_ICONS.findIndex(icon => icon.id === item.id));
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
  const storeTasks = useAppStore(state => state.tasks);
  const navigate = useNavigate();

  useEffect(() => {
    startRealtime();
    return () => stopRealtime();
  }, [startRealtime, stopRealtime]);

  const [windows, setWindows] = useState<WindowState[]>([]);
  const [agentPositions, setAgentPositions] = useState<Record<string, { x: number; y: number }>>({});
  const agentPositionsRef = useRef<Record<string, { x: number; y: number }>>({});
  const motionRef = useRef<Record<string, AgentMotionState>>({});
  const draggingRef = useRef<Set<string>>(new Set());
  const [desktopIconPositions, setDesktopIconPositions] = useState<Record<WindowContentId, { x: number; y: number }>>(() => {
    if (typeof window === 'undefined') return {} as Record<WindowContentId, { x: number; y: number }>
    try {
      return JSON.parse(window.localStorage.getItem(DESKTOP_ICON_STATE_KEY) ?? '{}') as Record<WindowContentId, { x: number; y: number }>
    } catch {
      return {} as Record<WindowContentId, { x: number; y: number }>
    }
  });
  const [agentWindow, setAgentWindow] = useState<AgentWindowState | null>(null);
  const [isAgentSetupWizardOpen, setIsAgentSetupWizardOpen] = useState(false);

  const agents = useMemo<AgentSprite[]>(() => {
    return storeAgents.map((agent, index) => {
      const position = agentPositions[agent.id] ?? positionForIndex(index);
      const status = agent.state === 'active' ? 'working' : agent.state === 'stale' ? 'blocked' : 'idle';
      const motion = motionRef.current[agent.id];

      return {
        id: agent.id,
        name: agent.name,
        x: position.x,
        y: position.y,
        status,
        color: '#8f8466',
        role: agent.role,
        provider: agent.provider,
        model: agent.model,
        runtimeKind: agent.runtimeKind,
        runMode: agent.runMode,
        verificationStatus: agent.verificationStatus,
        aliases: agent.aliases,
        capabilities: agent.capabilities,
        skillFile: agent.skillFile,
        skillFiles: agent.skillFiles,
        body: agent.body,
        sourcePath: agent.sourcePath,
        spriteAsset: agent.spriteAsset,
        portraitAsset: agent.portraitAsset,
        flip: motion?.facingLeft ?? false,
      };
    });
  }, [agentPositions, storeAgents]);

  const totalAgents = agents.length;
  const activeAgents = agents.filter(agent => agent.status === 'working').length;
  const blockedAgents = agents.filter(agent => agent.status === 'blocked').length;
  const currentTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const tickerText = `SYSTEM ONLINE · ${totalAgents} AGENTS · ${activeAgents} ACTIVE · ${blockedAgents} BLOCKED · STATUS NOMINAL · CLOCK ${currentTime}`;

  useEffect(() => {
    agentPositionsRef.current = agentPositions;
  }, [agentPositions]);

  useEffect(() => {
    setAgentPositions(prev => {
      const next = { ...prev };
      let seeded = Object.keys(next).length;
      const liveAgentIds = new Set(storeAgents.map(agent => agent.id));

      for (const agentId of Object.keys(next)) {
        if (!liveAgentIds.has(agentId)) {
          delete next[agentId];
        }
      }

      for (const agentId of Object.keys(motionRef.current)) {
        if (!liveAgentIds.has(agentId)) {
          delete motionRef.current[agentId];
          draggingRef.current.delete(agentId);
        }
      }

      for (const agent of storeAgents) {
        if (next[agent.id] !== undefined) continue;
        next[agent.id] = positionForIndex(seeded);
        motionRef.current[agent.id] = {
          restX: next[agent.id].x,
          y: next[agent.id].y,
          vy: 0,
          phase: seeded * 0.75,
          grounded: false,
        };
        seeded += 1;
      }

      return next;
    });
  }, [storeAgents]);

  useEffect(() => {
    let rafId = 0;
    let last = performance.now();
    let elapsed = 0;
    const tileWidth = 128;
    const tileHeight = 152;
    const topBarHeight = DESKTOP_TOPBAR_HEIGHT;

    const tick = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      elapsed += now - last;
      last = now;

      if (document.visibilityState !== 'visible') {
        rafId = window.requestAnimationFrame(tick);
        return;
      }

      if (elapsed < DESKTOP_ANIMATION_FRAME_MS) {
        rafId = window.requestAnimationFrame(tick);
        return;
      }

      elapsed = 0;
      const groundY = Math.max(0, window.innerHeight - topBarHeight - tileHeight - 10);

      const currentPositions = agentPositionsRef.current;
      const next: Record<string, { x: number; y: number }> = { ...currentPositions };
      let changed = false;

      for (const agent of storeAgents) {
        const motion = motionRef.current[agent.id] ?? {
          restX: currentPositions[agent.id]?.x ?? 0,
          y: currentPositions[agent.id]?.y ?? 0,
          vy: 0,
          phase: Math.random() * Math.PI * 2,
          grounded: false,
          facingLeft: false,
        };

        if (draggingRef.current.has(agent.id)) {
          next[agent.id] = { x: motion.restX, y: motion.y };
          motionRef.current[agent.id] = motion;
          continue;
        }

        motion.vy += 2200 * dt;
        motion.y += motion.vy * dt;

        if (motion.y >= groundY) {
          motion.y = groundY;
          motion.grounded = true;
          motion.vy = 0;
        } else {
          motion.grounded = false;
        }

        const sway = Math.sin(now * 0.0018 + motion.phase) * (motion.grounded ? 4 : 2);
        if (motion.grounded) {
          motion.facingLeft = Math.sin(now * 0.0018 + motion.phase) < 0;
        }

        const target = {
          x: Math.max(0, Math.min(window.innerWidth - tileWidth, motion.restX + sway)),
          y: motion.y,
        };
        const previous = currentPositions[agent.id];
        if (!previous || Math.abs(previous.x - target.x) > 0.25 || Math.abs(previous.y - target.y) > 0.25) {
          next[agent.id] = target;
          changed = true;
        }
        motionRef.current[agent.id] = motion;
      }

      if (changed) {
        agentPositionsRef.current = next;
        setAgentPositions(next);
      }

      rafId = window.requestAnimationFrame(tick);
    };

    rafId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(rafId);
  }, [storeAgents]);

  useEffect(() => {
    try {
      window.localStorage.setItem(DESKTOP_ICON_STATE_KEY, JSON.stringify(desktopIconPositions))
    } catch {
      /* ignore */
    }
  }, [desktopIconPositions])

  const openWindow = useCallback((id: WindowContentId) => {
    setWindows(prev => {
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
  }, []);

  const closeWindow = useCallback<(id: string) => void>((id) => {
    setWindows(prev => prev.filter(w => w.id !== id));
  }, []);

  const focusWindow = useCallback<(id: string) => void>((id) => {
    zTop += 1;
    setWindows(prev => prev.map(w => w.id === id ? { ...w, zIndex: zTop } : w));
  }, []);

  const moveWindow = useCallback((id: string, next: { x: number; y: number }) => {
    setWindows(prev => prev.map(windowState => (
      windowState.id === id
        ? { ...windowState, x: next.x, y: next.y, maximized: false }
        : windowState
    )));
  }, []);

  const resizeWindow = useCallback((id: string, next: { x: number; y: number; w: number; h: number }) => {
    setWindows(prev => prev.map(windowState => (
      windowState.id === id
        ? { ...windowState, x: next.x, y: next.y, w: next.w, h: next.h, maximized: false }
        : windowState
    )));
  }, []);

  const minimizeWindow = useCallback((id: string) => {
    setWindows(prev => prev.map(windowState => (
      windowState.id === id
        ? { ...windowState, minimized: true }
        : windowState
    )));
  }, []);

  const toggleMaximizeWindow = useCallback((id: string) => {
    zTop += 1;
    setWindows(prev => prev.map(windowState => {
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
  }, []);

  const openTaskWindow = useCallback((taskId: string) => {
    const task = storeTasks.find(entry => entry.id === taskId);
    if (!task) return;

    setWindows(prev => {
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
  }, [storeTasks]);

  const selectedAgent = agentWindow ? agents.find(agent => agent.id === agentWindow.agentId) ?? null : null;
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
      relayhqApi.getAgentActivity(selectedAgent.id),
      relayhqApi.getAnalyticsSummary(),
      relayhqApi.getAgentRuntimeReadiness(selectedAgent.id),
      relayhqApi.listAgentSessions(selectedAgent.id),
    ])
      .then(async ([activity, analytics, runtimeReadiness, sessions]) => {
        if (cancelled) return;
        setSelectedAgentActivity(activity);
        setSelectedAgentAnalytics(analytics);
        setSelectedAgentRuntimeReadiness(runtimeReadiness);
        setSelectedAgentRuntimeId(runtimeReadiness.runtimeKind ?? (selectedAgent?.provider === 'claude' ? 'claude-code' : selectedAgent?.provider === 'codex' ? 'codex' : 'opencode'));
        setSelectedAgentSessions(sessions);
        if (sessions[0]) {
          const events = await relayhqApi.getAgentSessionEvents(sessions[0].sessionId)
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
  }, [selectedAgent?.id]);

  const startDraggingAgent = useCallback<(id: string) => void>((id) => {
    draggingRef.current.add(id);
  }, []);

  const moveAgent = useCallback<(id: string, x: number, y: number) => void>((id, x, y) => {
    draggingRef.current.delete(id);
    motionRef.current[id] = {
      restX: x,
      y,
      vy: 0,
      phase: motionRef.current[id]?.phase ?? Math.random() * Math.PI * 2,
      grounded: true,
      facingLeft: x < (motionRef.current[id]?.restX ?? x),
    };
    setAgentPositions(prev => ({
      ...prev,
      [id]: { x, y },
    }));
  }, []);

  const moveDesktopIcon = useCallback<(id: WindowContentId, x: number, y: number) => void>((id, x, y) => {
    setDesktopIconPositions(prev => ({
      ...prev,
      [id]: { x, y },
    }))
  }, [])

  const openAgentWindow = useCallback((agentId: string) => {
    setAgentWindow(current => {
      if (current?.agentId === agentId) {
        zTop += 1;
        return { ...current, minimized: false, zIndex: zTop };
      }

      const width = 760;
      const height = 640;
      const x = Math.round((window.innerWidth - width) / 2);
      const y = Math.round((window.innerHeight - height) / 2);

      zTop += 1;
      return { agentId, x, y, w: width, h: height, zIndex: zTop, minimized: false, maximized: false };
    });
  }, []);

  const refreshSelectedAgentSessions = useCallback(async (agentId: string) => {
    const [readiness, sessions] = await Promise.all([
      relayhqApi.getAgentRuntimeReadiness(agentId),
      relayhqApi.listAgentSessions(agentId),
    ])
    setSelectedAgentRuntimeReadiness(readiness)
    setSelectedAgentSessions(sessions)
    if (sessions[0]) {
      const events = await relayhqApi.getAgentSessionEvents(sessions[0].sessionId)
      setSelectedAgentSessionEvents(events)
    } else {
      setSelectedAgentSessionEvents([])
    }
  }, [])

  const ensureAgentChatSession = useCallback(async (agentId: string) => {
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

    const nextTask = storeTasks.find(entry => entry.assigneeId === agentId && entry.status === 'in-progress')
      ?? storeTasks.find(entry => entry.assigneeId === agentId && entry.status === 'todo')
      ?? null

    if (!nextTask) {
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
  }, [loadData, refreshSelectedAgentSessions, storeTasks])

  const openAgentChat = useCallback((agentId: string) => {
    openAgentWindow(agentId)
    void ensureAgentChatSession(agentId).catch((error: unknown) => {
      setSelectedAgentError(error instanceof Error ? error.message : 'Failed to open agent chat.')
    })
  }, [ensureAgentChatSession, openAgentWindow])

  useEffect(() => {
    if (!selectedAgent?.id) return;

    const intervalId = window.setInterval(() => {
      void refreshSelectedAgentSessions(selectedAgent.id);
    }, 2000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [refreshSelectedAgentSessions, selectedAgent?.id]);

  const bindSelectedAgentOpenCode = useCallback(async () => {
    if (!selectedAgent) return
    setSelectedAgentActionBusy(true)
    try {
      await relayhqApi.bindAgentRuntime(selectedAgent.id, selectedAgentRuntimeId)
      await refreshSelectedAgentSessions(selectedAgent.id)
    } finally {
      setSelectedAgentActionBusy(false)
    }
  }, [refreshSelectedAgentSessions, selectedAgent])

  const verifySelectedAgentRuntime = useCallback(async () => {
    if (!selectedAgent) return
    setSelectedAgentActionBusy(true)
    try {
      await refreshSelectedAgentSessions(selectedAgent.id)
    } finally {
      setSelectedAgentActionBusy(false)
    }
  }, [refreshSelectedAgentSessions, selectedAgent])

  const launchSelectedAgentFresh = useCallback(async () => {
    if (!selectedAgent) return
    const task = storeTasks.find(entry => entry.assigneeId === selectedAgent.id && entry.status === 'todo') ?? storeTasks.find(entry => entry.assigneeId === selectedAgent.id && entry.status === 'in-progress')
    if (!task) return
    setSelectedAgentActionBusy(true)
    try {
      await relayhqApi.runAgent(selectedAgent.id, { taskId: task.id, mode: 'fresh', surface: 'background' })
      await refreshSelectedAgentSessions(selectedAgent.id)
    } finally {
      setSelectedAgentActionBusy(false)
    }
  }, [refreshSelectedAgentSessions, selectedAgent, storeTasks])

  const resumeSelectedAgent = useCallback(async () => {
    if (!selectedAgent) return
    const task = storeTasks.find(entry => entry.assigneeId === selectedAgent.id && entry.status === 'in-progress') ?? storeTasks.find(entry => entry.assigneeId === selectedAgent.id && entry.status === 'todo')
    if (!task) return
    const previousSession = selectedAgentSessions[0] ?? null
    setSelectedAgentActionBusy(true)
    try {
      await relayhqApi.resumeAgent(selectedAgent.id, { taskId: task.id, previousSessionId: previousSession?.sessionId ?? null, surface: 'background' })
      await refreshSelectedAgentSessions(selectedAgent.id)
    } finally {
      setSelectedAgentActionBusy(false)
    }
  }, [refreshSelectedAgentSessions, selectedAgent, selectedAgentSessions, storeTasks])

  const stopSelectedAgent = useCallback(async () => {
    if (!selectedAgentSessions[0]) return
    setSelectedAgentActionBusy(true)
    try {
      await relayhqApi.stopAgentSession(selectedAgentSessions[0].sessionId)
      if (selectedAgent) {
        await refreshSelectedAgentSessions(selectedAgent.id)
      }
    } finally {
      setSelectedAgentActionBusy(false)
    }
  }, [refreshSelectedAgentSessions, selectedAgent, selectedAgentSessions])

  const sendSelectedAgentMessage = useCallback(async () => {
    if (!selectedAgentSessions[0]) return
    const message = selectedAgentMessageDraft.trim()
    if (message.length === 0) return
    setSelectedAgentActionBusy(true)
    try {
      await relayhqApi.sendAgentSessionMessage(selectedAgentSessions[0].sessionId, message)
      setSelectedAgentMessageDraft('')
      if (selectedAgent) {
        await refreshSelectedAgentSessions(selectedAgent.id)
      }
    } finally {
      setSelectedAgentActionBusy(false)
    }
  }, [refreshSelectedAgentSessions, selectedAgent, selectedAgentMessageDraft, selectedAgentSessions])

  const minimizeAgentWindow = useCallback(() => {
    setAgentWindow(current => (current ? { ...current, minimized: true } : current));
  }, []);

  const toggleAgentWindowMaximize = useCallback(() => {
    setAgentWindow(current => {
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
  }, []);

  const openIds = new Set<string>(windows.filter(w => !w.minimized).map(w => w.content));

  return (
    <div className="desktop-surface lcd-card relative h-screen w-screen overflow-hidden select-none bg-surface-sidebar">
      {/* Amber dot grid — matches app background texture */}
      <div
        className="pointer-events-none absolute inset-0 z-0 opacity-[0.06]"
        style={{
          backgroundImage: `radial-gradient(circle, var(--brand) 1px, transparent 1px)`,
          backgroundSize: '24px 24px',
        }}
      />

      {/* Corner ambient glows */}
      <div className="pointer-events-none absolute inset-0 z-0">
        <div
          className="absolute top-0 left-0 h-64 w-64 opacity-20"
          style={{ background: 'radial-gradient(circle at 0% 0%, var(--brand), transparent 60%)' }}
        />
        <div
          className="absolute bottom-0 right-0 h-64 w-64 opacity-10"
          style={{ background: 'radial-gradient(circle at 100% 100%, #818cf8, transparent 60%)' }}
        />
      </div>

      {/* Topbar */}
      <div className="absolute top-0 left-0 right-0 z-[60] flex h-11 items-center overflow-hidden border-b border-border bg-surface-sidebar px-4 text-[9px] uppercase tracking-[0.22em]">
        <div className="flex shrink-0 items-center gap-2 pr-4 text-brand-bright text-glow">
          <span className="font-display">ARIA OS</span>
          <span className="text-brand-bright">CRT-AMBER</span>
        </div>

        <div className="min-w-0 flex-1 overflow-hidden">
          <div className="ticker-track flex w-[200%] items-center gap-8 whitespace-nowrap text-brand-bright text-glow">
            <span>{tickerText}</span>
            <span>{tickerText}</span>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-3 pl-4 text-brand-bright text-glow">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 px-3 text-[9px] tracking-[0.18em]"
            onClick={() => setIsAgentSetupWizardOpen(true)}
          >
            NEW AGENT
          </Button>
          <span>STATUS NOMINAL</span>
          <span>{currentTime}</span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 px-3 text-[9px] tracking-[0.18em]"
            onClick={() => navigate('/')}
          >
            WEBPAGE
          </Button>
        </div>
      </div>

      {/* Desktop canvas */}
      <div className="absolute inset-0 pt-11">
        <DesktopIcons
          openIds={openIds}
          onOpen={openWindow}
          positions={desktopIconPositions}
          onMove={moveDesktopIcon}
        />

        {agents.map((agent: AgentSprite) => (
          <Fragment key={agent.id}>
            <DesktopAgent
              agent={agent}
              onDragStart={startDraggingAgent}
              onClick={() => openAgentChat(agent.id)}
              onDragEnd={moveAgent as (id: string, x: number, y: number) => void}
            />
          </Fragment>
        ))}

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
            />
          </Fragment>
        ))}
      </div>

      <AgentDetailWindow
        agent={selectedAgent}
        windowState={agentWindow}
        onClose={() => setAgentWindow(null)}
        onMinimize={minimizeAgentWindow}
        onToggleMaximize={toggleAgentWindowMaximize}
        onDragEnd={(x, y) => setAgentWindow(current => current ? { ...current, x, y } : current)}
        activity={selectedAgentActivity}
        analytics={selectedAgentAnalytics}
        loading={selectedAgentLoading}
        error={selectedAgentError}
        runtimeReadiness={selectedAgentRuntimeReadiness}
        sessions={selectedAgentSessions}
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
