import { useState, useEffect, useMemo, useRef } from 'react'
import { Check, ChevronLeft, Copy, Eye, EyeOff, ExternalLink, AlertTriangle } from 'lucide-react'
import { relayhqApi, type AgentActivityEvent, type AgentSessionEventRecord, type AgentSessionRecord, type RelayHQSkillRecord } from '../../api/client'
import type { ReadModelAuditNote } from '../../api/contract'
import { useAppStore } from '../../store/appStore'
import type { Agent } from '../../types'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs'
import { Select } from '../ui/select'
import { AgentSpriteFrame } from '../agent/AgentSpriteFrame'
import { AgentPixelAvatar } from '../agent/AgentPixelAvatar'

// ─── Types ────────────────────────────────────────────────────────────────────

type WizardStep = 1 | 2 | 3 | 4 | 5
type EditTab = 'settings' | 'connection' | 'history'
type AgentRole = 'implementation' | 'coordinator' | 'review' | 'planning' | 'qa' | 'ops'

interface AgentSetupWizardProps {
  open: boolean
  onClose: () => void
  mode?: 'create' | 'edit'
  initialAgent?: Agent | null
  createPreset?: {
    name?: string
    role?: AgentRole
    provider?: string | null
    model?: string | null
    capabilities?: ReadonlyArray<string>
    taskTypesAccepted?: ReadonlyArray<string>
    runMode?: 'subprocess' | 'webhook'
    runCommand?: string
    webhookUrl?: string
    aliases?: ReadonlyArray<string>
    lockRole?: boolean
  }
  title?: string
  submitLabel?: string
  onCreated?: (agent: { id: string; name: string }) => Promise<void> | void
}

// ─── Static data ─────────────────────────────────────────────────────────────

const PROVIDERS = [
  {
    id: 'anthropic',
    label: 'Anthropic',
    color: '#f59e0b',
    description: 'Claude — best for coding & reasoning',
    consoleUrl: 'https://console.anthropic.com/settings/keys',
    envVar: 'ANTHROPIC_API_KEY',
  },
  {
    id: 'openai',
    label: 'OpenAI',
    color: '#22c55e',
    description: 'GPT-5.4/5.5 — versatile, fast',
    consoleUrl: 'https://platform.openai.com/api-keys',
    envVar: 'OPENAI_API_KEY',
  },
  {
    id: 'google',
    label: 'Google',
    color: '#3b82f6',
    description: 'Gemini — multimodal, long context',
    consoleUrl: 'https://aistudio.google.com/apikey',
    envVar: 'GOOGLE_API_KEY',
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    color: '#a855f7',
    description: '200+ models, single API',
    consoleUrl: 'https://openrouter.ai/keys',
    envVar: 'OPENROUTER_API_KEY',
  },
]

const MODELS_BY_PROVIDER: Record<string, ReadonlyArray<string>> = {
  anthropic:  ['claude-sonnet-4-6', 'claude-opus-4-7', 'claude-haiku-4-5'],
  openai:     ['gpt-5.5-pro', 'gpt-5.5', 'gpt-5.4', 'gpt-5.4-mini', 'gpt-4-turbo'],
  google:     ['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-2.0-flash-lite', 'gemini-1.5-pro', 'gemini-1.5-flash'],
  openrouter: ['meta-llama/llama-3.1-70b-instruct', 'mistralai/mistral-large', 'qwen/qwen-2.5-72b-instruct'],
}

const RUNTIME_OPTIONS = [
  { id: 'opencode', label: 'OpenCode' },
  { id: 'claude-code', label: 'Claude Code' },
  { id: 'codex', label: 'Codex' },
] as const

const MODEL_META: Record<string, { tier: 'fast' | 'balanced' | 'powerful'; context: string; description: string }> = {
  'claude-sonnet-4-6':                      { tier: 'balanced',  context: '200k', description: 'Best for most tasks' },
  'claude-opus-4-7':                        { tier: 'powerful',  context: '200k', description: 'Maximum capability' },
  'claude-haiku-4-5':                       { tier: 'fast',      context: '200k', description: 'Lightweight & cheap' },
  'gpt-5.5-pro':                            { tier: 'powerful',  context: '1M',   description: 'Latest flagship, max capability' },
  'gpt-5.5':                                { tier: 'balanced',  context: '1M',   description: 'Latest frontier model' },
  'gpt-5.4':                                { tier: 'balanced',  context: '128k', description: 'Stable general-purpose OpenAI model' },
  'gpt-5.4-mini':                           { tier: 'fast',      context: '128k', description: 'Faster lower-cost OpenAI model' },
  'gpt-4-turbo':                            { tier: 'powerful',  context: '128k', description: 'High performance' },
  'gemini-2.5-pro':                          { tier: 'powerful',  context: '1M',   description: 'Latest flagship model' },
  'gemini-2.5-flash':                       { tier: 'balanced',  context: '1M',   description: 'Latest fast model' },
  'gemini-2.0-flash':                       { tier: 'fast',      context: '1M',   description: 'Ultra-long context' },
  'gemini-2.0-flash-lite':                  { tier: 'fast',      context: '1M',   description: 'Lightweight & cheap' },
  'gemini-1.5-pro':                         { tier: 'balanced',  context: '2M',   description: 'Largest context' },
  'gemini-1.5-flash':                       { tier: 'fast',      context: '1M',   description: 'Fast & efficient' },
  'meta-llama/llama-3.1-70b-instruct':      { tier: 'balanced',  context: '128k', description: 'Open model, strong' },
  'mistralai/mistral-large':                { tier: 'powerful',  context: '128k', description: 'Mistral flagship' },
  'qwen/qwen-2.5-72b-instruct':             { tier: 'balanced',  context: '128k', description: 'Strong multilingual' },
}

const TIER_COLOR: Record<'fast' | 'balanced' | 'powerful', string> = {
  fast:     'text-status-done border-status-done/40 bg-status-done/5',
  balanced: 'text-status-review border-status-review/40 bg-status-review/5',
  powerful: 'text-status-blocked border-status-blocked/40 bg-status-blocked/5',
}

const ROLES: ReadonlyArray<AgentRole> = ['implementation', 'review', 'planning', 'qa', 'ops']

const CAPABILITIES_ALL = ['write-code', 'run-tests', 'deploy', 'review-code', 'search-web', 'manage-infra'] as const
const TASK_TYPES_ALL = ['feature-implementation', 'bug-fix', 'refactoring', 'api-design', 'code-review', 'test-writing', 'documentation', 'research', 'coordination', 'ops'] as const

function formatSessionEventBody(event: AgentSessionEventRecord) {
  if (event.text?.trim()) return event.text.trim()
  if (event.type === 'session.usage' && event.usage) {
    const parts = [
      event.usage.model ? `model ${event.usage.model}` : null,
      event.usage.totalTokens != null ? `${event.usage.totalTokens.toLocaleString()} tokens` : null,
      event.usage.costUsd != null ? `$${event.usage.costUsd.toFixed(4)}` : null,
      event.usage.usageSource ? `source ${event.usage.usageSource}` : null,
    ].filter(Boolean)
    return parts.length > 0 ? parts.join(' · ') : 'Usage updated'
  }
  if (event.code != null) return `Exit code ${event.code}`
  return 'No details'
}

function formatSessionEventLabel(event: AgentSessionEventRecord) {
  if (event.type === 'user.message') return 'Prompt'
  if (event.type === 'reasoning.summary') return 'Agent response'
  if (event.type === 'terminal.stdout') return 'Terminal output'
  if (event.type === 'terminal.stderr') return 'Terminal error'
  if (event.type === 'session.started') return 'Session started'
  if (event.type === 'session.ended') return 'Session ended'
  if (event.type === 'session.failed') return 'Session failed'
  if (event.type === 'session.stopped') return 'Session stopped'
  if (event.type === 'session.usage') return 'Usage'
  return String(event.type).replace(/\./g, ' ')
}

function buildMcpSetupSnippets(agentId: string) {
  const npmInstall = 'npm install -g @relayhq/relayhq-mcp'
  const claudeDesktopConfig = JSON.stringify({
    mcpServers: {
      relayhq: {
        command: 'relayhq-mcp',
        env: {
          RELAYHQ_BASE_URL: 'http://127.0.0.1:44210',
          RELAYHQ_AGENT_ID: agentId,
        },
      },
    },
  }, null, 2)
  const claudeMd = `# RelayHQ Agent Protocol

- Use RelayHQ MCP tools for task coordination.
- Start each session with relayhq_inbox(agentId="${agentId}").
- Claim work with relayhq_start(taskId, agentId="${agentId}").
- Send progress with relayhq_progress(taskId, agentId="${agentId}", progress, notes).
- Request human review gates with relayhq_request_approval(taskId, agentId="${agentId}", reason).
- Finish with relayhq_done(taskId, agentId="${agentId}", result).`

  return { npmInstall, claudeDesktopConfig, claudeMd }
}

// ─── Progress bar ─────────────────────────────────────────────────────────────

function ProgressBar({ step, labels }: { step: WizardStep; labels: readonly string[] }) {
  return (
    <div className="flex items-center gap-0 mb-8">
      {labels.map((label, i) => {
        const n = (i + 1) as WizardStep
        const done = step > n
        const active = step === n
        return (
          <div key={n} className="flex items-center gap-0 flex-1">
            <div className="flex flex-col items-center gap-1.5">
              <div
                className={`h-6 w-6 flex items-center justify-center border text-[9px] font-display transition-colors
                  ${done    ? 'border-brand bg-brand text-black'
                  : active  ? 'border-brand bg-brand-muted text-brand'
                  : 'border-border bg-surface text-text-tertiary'}`}
              >
                {done ? <Check className="h-3 w-3" /> : n}
              </div>
              <span className={`text-[8px] font-display uppercase tracking-wider whitespace-nowrap
                ${active ? 'text-brand' : done ? 'text-text-secondary' : 'text-text-tertiary'}`}>
                {label}
              </span>
            </div>
            {i < labels.length - 1 && (
              <div className={`flex-1 h-px mb-5 transition-colors ${done ? 'bg-brand' : 'bg-border'}`} />
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── Wizard ───────────────────────────────────────────────────────────────────

export function AgentSetupWizard({
  open,
  onClose,
  mode = 'create',
  initialAgent = null,
  createPreset,
  title,
  submitLabel,
  onCreated,
}: AgentSetupWizardProps) {
  const loadData = useAppStore(state => state.loadData)
  const tasks = useAppStore(state => state.tasks)
  const auditNotes = useAppStore(state => state.auditNotes)
  const [step, setStep] = useState<WizardStep>(1)
  const [provider, setProvider] = useState<string | null>(null)
  const [apiKey, setApiKey] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [verifyStatus, setVerifyStatus] = useState<'idle' | 'verifying' | 'valid' | 'invalid'>('idle')
  const [verifyError, setVerifyError] = useState<string | null>(null)
  const [skipWarning, setSkipWarning] = useState(false)
  const [model, setModel] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [role, setRole] = useState<AgentRole>('implementation')
  const [spriteAsset, setSpriteAsset] = useState('')
  const [runMode, setRunMode] = useState<'subprocess' | 'webhook'>('subprocess')
  const [runCommand, setRunCommand] = useState('')
  const [webhookUrl, setWebhookUrl] = useState('')
  const [aliases, setAliases] = useState('')
  const [capabilities, setCapabilities] = useState<string[]>(['write-code', 'run-tests'])
  const [taskTypesAccepted, setTaskTypesAccepted] = useState<string[]>(['feature-implementation', 'bug-fix'])
  const [runtimeId, setRuntimeId] = useState<string>('opencode')
  const [availableSkills, setAvailableSkills] = useState<ReadonlyArray<RelayHQSkillRecord>>([])
  const [primarySkillFile, setPrimarySkillFile] = useState<string>('skills/implementation.md')
  const [selectedSkillFiles, setSelectedSkillFiles] = useState<string[]>([])
  const [oauthState, setOauthState] = useState<string | null>(null)
  const [oauthStatus, setOauthStatus] = useState<'idle' | 'waiting' | 'done' | 'error'>('idle')
  const [oauthError, setOauthError] = useState<string | null>(null)
  const oauthPollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [avatarError, setAvatarError] = useState<string | null>(null)
  const [editTab, setEditTab] = useState<EditTab>('settings')
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyError, setHistoryError] = useState<string | null>(null)
  const [activity, setActivity] = useState<ReadonlyArray<AgentActivityEvent>>([])
  const [sessions, setSessions] = useState<ReadonlyArray<AgentSessionRecord>>([])
  const [sessionEvents, setSessionEvents] = useState<ReadonlyArray<AgentSessionEventRecord>>([])
  const [createdAgent, setCreatedAgent] = useState<{ id: string; name: string } | null>(null)
  const [copiedSnippet, setCopiedSnippet] = useState<string | null>(null)
  const avatarUploadRef = useRef<HTMLInputElement | null>(null)

  const selectedProvider = PROVIDERS.find(p => p.id === provider)
  const providerModels = provider ? (MODELS_BY_PROVIDER[provider] ?? []) : []
  const selectedSkillSet = useMemo(() => new Set(selectedSkillFiles), [selectedSkillFiles])
  const unselectedSkills = useMemo(() => availableSkills.filter((skill) => !selectedSkillSet.has(skill.sourcePath) && skill.sourcePath !== primarySkillFile), [availableSkills, primarySkillFile, selectedSkillSet])
  const labels = mode === 'edit' ? ['Provider', 'Connection', 'Model', 'Identity'] : ['Provider', 'Connect', 'Model', 'Identity', 'Setup']
  const assignedTaskIds = useMemo(() => {
    if (!initialAgent?.id) return new Set<string>()
    return new Set(tasks.filter(task => task.assigneeId === initialAgent.id).map(task => task.id))
  }, [initialAgent?.id, tasks])
  const agentAuditNotes = useMemo<ReadonlyArray<ReadModelAuditNote>>(() => {
    if (assignedTaskIds.size === 0) return []
    return [...auditNotes]
      .filter(note => assignedTaskIds.has(note.taskId))
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
  }, [assignedTaskIds, auditNotes])

  const canNext: Record<WizardStep, boolean> = {
    1: provider !== null,
    2: mode === 'edit' || verifyStatus === 'valid' || skipWarning,
    3: model !== null,
    4: name.trim().length > 0,
    5: createdAgent !== null,
  }

  const agentSlug = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')

  const verifyKey = async () => {
    if (!provider || !apiKey.trim()) return
    setVerifyStatus('verifying')
    setVerifyError(null)
    try {
      const res = await relayhqApi.verifyApiKey(provider, apiKey.trim())
      if (res.valid) {
        setVerifyStatus('valid')
      } else {
        setVerifyStatus('invalid')
        setVerifyError(res.error ?? 'Key is invalid')
      }
    } catch {
      setVerifyStatus('invalid')
      setVerifyError('Could not reach provider')
    }
  }

  const startBrowserLogin = async () => {
    if (!provider || (provider !== 'openai' && provider !== 'openrouter')) return
    setOauthStatus('waiting')
    setOauthError(null)
    try {
      const { authUrl, state } = await relayhqApi.startOAuthLogin(provider)
      setOauthState(state)
      window.open(authUrl, '_blank', 'noopener,noreferrer')
      oauthPollRef.current = setInterval(async () => {
        try {
          const result = await relayhqApi.pollOAuthResult(provider, state)
          if (result.status === 'complete' && result.apiKey) {
            clearInterval(oauthPollRef.current!)
            oauthPollRef.current = null
            setOauthState(null)
            setOauthStatus('done')
            setApiKey(result.apiKey)
            setVerifyStatus('valid')
          } else if (result.status === 'error' || result.status === 'expired') {
            clearInterval(oauthPollRef.current!)
            oauthPollRef.current = null
            setOauthState(null)
            setOauthStatus('error')
            setOauthError(result.error ?? (result.status === 'expired' ? 'Login expired — try again' : 'Login failed'))
          }
        } catch {
          // transient network error — keep polling
        }
      }, 1500)
    } catch (err) {
      setOauthStatus('error')
      setOauthError(err instanceof Error ? err.message : 'Failed to start login')
    }
  }

  const handleProviderSelect = (id: string) => {
    if (oauthPollRef.current) { clearInterval(oauthPollRef.current); oauthPollRef.current = null }
    setOauthState(null)
    setOauthStatus('idle')
    setOauthError(null)
    setProvider(id)
    setApiKey('')
    setVerifyStatus('idle')
    setVerifyError(null)
      setSkipWarning(false)
      setModel(MODELS_BY_PROVIDER[id]?.[0] ?? null)
      setAvatarError(null)
  }

  useEffect(() => {
    void relayhqApi.listSkills().then((result) => {
      setAvailableSkills(result.skills)
    }).catch(() => {
      setAvailableSkills([])
    })
  }, [])

  useEffect(() => {
    if (!open) return

    if (mode === 'edit' && initialAgent) {
      setEditTab('settings')
      setStep(1)
      setProvider(initialAgent.provider ?? 'anthropic')
      setApiKey('')
      setVerifyStatus('valid')
      setVerifyError(null)
      setSkipWarning(false)
      setModel(initialAgent.model ?? MODELS_BY_PROVIDER[initialAgent.provider ?? 'anthropic']?.[0] ?? null)
      setName(initialAgent.name)
      setRole((initialAgent.role as AgentRole | undefined) ?? 'implementation')
      setSpriteAsset(initialAgent.spriteAsset ?? '')
      setRunMode((initialAgent.runMode as 'subprocess' | 'webhook' | undefined) ?? 'subprocess')
      setRunCommand(initialAgent.runCommand ?? '')
      setWebhookUrl(initialAgent.webhookUrl ?? '')
      setAliases((initialAgent.aliases ?? []).join(', '))
      setCapabilities([...(initialAgent.capabilities ?? ['write-code', 'run-tests'])])
      setTaskTypesAccepted([...(initialAgent.taskTypesAccepted ?? ['feature-implementation', 'bug-fix'])])
      setRuntimeId(initialAgent.runtimeKind ?? (initialAgent.provider === 'claude' ? 'claude-code' : initialAgent.provider === 'codex' ? 'codex' : 'opencode'))
      setPrimarySkillFile(initialAgent.skillFile ?? 'skills/implementation.md')
      setSelectedSkillFiles([...(initialAgent.skillFiles ?? [])])
      setSubmitError(null)
      setDeleteConfirmOpen(false)
      setDeleteError(null)
      setAvatarError(null)
      setCreatedAgent(null)
      return
    }

    if (mode === 'create') {
      setEditTab('settings')
      setStep(1)
      const presetProvider = createPreset?.provider ?? null
      const presetModel = createPreset?.model ?? (presetProvider ? (MODELS_BY_PROVIDER[presetProvider]?.[0] ?? null) : null)
      setProvider(presetProvider)
      setApiKey('')
      setShowKey(false)
      setVerifyStatus('idle')
      setVerifyError(null)
      setSkipWarning(false)
      setModel(presetModel)
      setName(createPreset?.name ?? '')
      setRole(createPreset?.role ?? 'implementation')
      setSpriteAsset('')
      setRunMode(createPreset?.runMode ?? 'subprocess')
      setRunCommand(createPreset?.runCommand ?? '')
      setWebhookUrl(createPreset?.webhookUrl ?? '')
      setAliases(createPreset?.aliases?.join(', ') ?? '')
      setCapabilities([...(createPreset?.capabilities ?? ['write-code', 'run-tests'])])
      setTaskTypesAccepted([...(createPreset?.taskTypesAccepted ?? ['feature-implementation', 'bug-fix'])])
      setRuntimeId(presetProvider === 'anthropic' ? 'claude-code' : presetProvider === 'codex' ? 'codex' : 'opencode')
      setPrimarySkillFile('skills/implementation.md')
      setSelectedSkillFiles([])
      setSubmitError(null)
      setDeleteConfirmOpen(false)
      setDeleteError(null)
      setAvatarError(null)
      setCreatedAgent(null)
    }
  }, [createPreset, open, mode, initialAgent])

  useEffect(() => {
    if (!open) {
      if (oauthPollRef.current) { clearInterval(oauthPollRef.current); oauthPollRef.current = null }
      setOauthState(null)
      setOauthStatus('idle')
      setOauthError(null)
    }
  }, [open])

  useEffect(() => {
    if (!open || mode !== 'edit' || !initialAgent) {
      setActivity([])
      setSessions([])
      setSessionEvents([])
      setHistoryLoading(false)
      setHistoryError(null)
      return
    }

    let cancelled = false
    setHistoryLoading(true)
    setHistoryError(null)

    void Promise.all([
      relayhqApi.getAgentActivity(initialAgent.id),
      relayhqApi.listAgentSessions(initialAgent.id),
    ])
      .then(async ([nextActivity, nextSessions]) => {
        if (cancelled) return
        setActivity(nextActivity)
        setSessions(nextSessions)
        if (!nextSessions[0]) {
          setSessionEvents([])
          return
        }
        const events = await relayhqApi.getAgentSessionEvents(nextSessions[0].sessionId)
        if (cancelled) return
        setSessionEvents(events)
      })
      .catch((error: unknown) => {
        if (cancelled) return
        setHistoryError(error instanceof Error ? error.message : 'Failed to load agent history.')
      })
      .finally(() => {
        if (cancelled) return
        setHistoryLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [initialAgent, mode, open])

  const handleSubmit = async () => {
    if (!provider || !model || !name.trim()) return
    setIsSubmitting(true)
    setSubmitError(null)
    try {
      const apiKeyRef = `env:${selectedProvider?.envVar ?? 'API_KEY'}`
      const normalizedSkillFiles = [...selectedSkillFiles]
      if (mode === 'edit' && initialAgent) {
        await relayhqApi.patchAgent(initialAgent.id, {
          patch: {
            name: name.trim(),
            provider,
            model,
            api_key_ref: apiKeyRef,
            portrait_asset: '',
            ...(spriteAsset ? { sprite_asset: spriteAsset } : {}),
            run_mode: runMode,
            ...(runMode === 'subprocess' && runCommand.trim().length > 0 ? { run_command: runCommand.trim() } : {}),
            ...(runMode === 'webhook' && webhookUrl.trim().length > 0 ? { webhook_url: webhookUrl.trim() } : {}),
            aliases: aliases.split(',').map(s => s.trim()).filter(Boolean),
            capabilities,
            task_types_accepted: taskTypesAccepted,
            skill_file: primarySkillFile.trim(),
            skill_files: normalizedSkillFiles,
          },
        })
        await relayhqApi.bindAgentRuntime(initialAgent.id, runtimeId)
      } else {
        const created = await relayhqApi.createAgent({
          name: name.trim(),
          role,
          provider,
          model,
          apiKeyRef,
          ...(spriteAsset ? { spriteAsset } : {}),
          runMode,
          runCommand: runMode === 'subprocess' ? runCommand : undefined,
          webhookUrl: runMode === 'webhook' ? webhookUrl : undefined,
          aliases: aliases.split(',').map(s => s.trim()).filter(Boolean),
          capabilities,
          taskTypesAccepted,
          skillFiles: normalizedSkillFiles,
          ...(primarySkillFile.trim().length > 0 ? { skillFile: primarySkillFile.trim() } : {}),
        })
        await relayhqApi.bindAgentRuntime(created.agent.id, runtimeId)
        const nextCreatedAgent = { id: created.agent.id, name: created.agent.name }
        await onCreated?.(nextCreatedAgent)
        setCreatedAgent(nextCreatedAgent)
      }
      if (mode === 'create' && apiKey.trim() && verifyStatus === 'valid') {
        await relayhqApi.writeShellProfile('zshrc', { [selectedProvider?.envVar ?? 'API_KEY']: apiKey.trim() }).catch(() => {})
      }
      await loadData({ force: true })
      if (mode === 'create') {
        setStep(5)
      } else {
        onClose()
      }
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to create agent')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDelete = async () => {
    if (mode !== 'edit' || !initialAgent) return
    setIsSubmitting(true)
    setDeleteError(null)
    setSubmitError(null)
    try {
      await relayhqApi.deleteAgent(initialAgent.id)
      await loadData()
      onClose()
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Failed to delete agent')
    } finally {
      setIsSubmitting(false)
    }
  }

  const toggleCapability = (cap: string) => {
    setCapabilities(prev =>
      prev.includes(cap) ? prev.filter(c => c !== cap) : [...prev, cap]
    )
  }

  const toggleTaskType = (type: string) => {
    setTaskTypesAccepted(prev =>
      prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type]
    )
  }

  const handleAvatarUpload = async (fileList: FileList | null) => {
    const file = fileList?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) return
    setAvatarError(null)
    try {
      const uploadFile = await compressAvatarFile(file)
      const uploaded = await relayhqApi.uploadAgentAvatar(uploadFile)
      setSpriteAsset(uploaded.path)
    } catch (error) {
      setAvatarError(error instanceof Error ? error.message : 'Unable to upload avatar.')
    }
  }

  const compressAvatarFile = async (file: File) => {
    const bitmap = await createImageBitmap(file)
    const spriteSize = 128
    const scale = Math.min(spriteSize / bitmap.width, spriteSize / bitmap.height)
    const width = Math.max(1, Math.round(bitmap.width * scale))
    const height = Math.max(1, Math.round(bitmap.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = spriteSize
    canvas.height = spriteSize
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Unable to prepare avatar image.')
    context.clearRect(0, 0, spriteSize, spriteSize)
    context.imageSmoothingEnabled = false
    context.drawImage(
      bitmap,
      Math.round((spriteSize - width) / 2),
      Math.round((spriteSize - height) / 2),
      width,
      height,
    )

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((value) => {
        if (!value) {
          reject(new Error('Unable to encode avatar image.'))
          return
        }
        resolve(value)
      }, 'image/webp', 0.86)
    })

    bitmap.close()
    return new File([blob], `${file.name.replace(/\.[^.]+$/, '') || 'avatar'}.webp`, { type: 'image/webp' })
  }

  const renderProviderStep = () => (
    <div>
      <div className="text-[9px] font-display text-text-tertiary uppercase tracking-widest mb-6">
        Choose a provider
      </div>
      <div className="grid grid-cols-2 gap-3">
        {PROVIDERS.map(p => (
          <button
            key={p.id}
            onClick={() => handleProviderSelect(p.id)}
            className={`flex flex-col gap-2 p-4 border text-left transition-colors
              ${provider === p.id
                ? 'border-brand bg-brand-muted'
                : 'border-border bg-surface hover:border-brand/40'}`}
          >
            <div className="flex items-center gap-2">
              <div className="h-2.5 w-2.5 flex-shrink-0" style={{ background: p.color }} />
              <span className={`text-[11px] font-display font-medium
                ${provider === p.id ? 'text-brand' : 'text-text-primary'}`}>
                {p.label}
              </span>
              {provider === p.id && <Check className="h-3 w-3 text-brand ml-auto" />}
            </div>
            <span className="text-[10px] text-text-tertiary font-body">{p.description}</span>
          </button>
        ))}
      </div>
    </div>
  )

  const renderConnectionStep = () => selectedProvider ? (
    <div className="flex flex-col gap-5">
      <div>
        <div className="text-[9px] font-display text-text-tertiary uppercase tracking-widest mb-1">
          {mode === 'edit' ? `Review ${selectedProvider.label} connection` : `Connect ${selectedProvider.label}`}
        </div>
        {mode === 'edit' && (
          <div className="mb-2 text-[10px] text-text-secondary font-body leading-5">
            You can keep the current provider binding as-is, or re-check it by pasting an API key.
          </div>
        )}
        <a
          href={selectedProvider.consoleUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-[10px] font-display text-brand hover:underline"
        >
          Open {selectedProvider.label} Console
          <ExternalLink className="h-3 w-3" />
        </a>
      </div>

      <>
          {(provider === 'openai' || provider === 'openrouter') && (
            <div className="flex flex-col gap-2">
              <div className="text-[9px] font-display text-text-tertiary uppercase tracking-widest">
                Login with browser
              </div>
              <button
                type="button"
                onClick={() => void startBrowserLogin()}
                disabled={oauthStatus === 'waiting'}
                className="lcd-button flex items-center gap-2 px-4 py-2 border border-accent bg-surface-secondary text-text-primary text-[10px] font-display uppercase tracking-wider disabled:opacity-40 disabled:cursor-not-allowed rounded-none hover:border-brand hover:text-brand transition-colors w-fit"
              >
                {oauthStatus === 'waiting' ? (
                  <>
                    <span className="animate-pulse">···</span>
                    Waiting for browser…
                  </>
                ) : (
                  <>
                    <ExternalLink className="h-3 w-3" />
                    Login with {selectedProvider?.label} →
                  </>
                )}
              </button>
              {oauthStatus === 'done' && (
                <span className="flex items-center gap-1.5 text-[10px] font-display text-status-done">
                  <Check className="h-3.5 w-3.5" />
                  Logged in — key received
                </span>
              )}
              {oauthStatus === 'error' && oauthError && (
                <span className="text-[10px] font-display text-status-blocked">
                  ✗ {oauthError}
                </span>
              )}
              <div className="flex items-center gap-3 my-1">
                <div className="h-px flex-1 bg-border" />
                <span className="text-[9px] font-display text-text-tertiary uppercase tracking-widest">or paste key manually</span>
                <div className="h-px flex-1 bg-border" />
              </div>
            </div>
          )}
          <div>
            <div className="text-[9px] font-display text-text-tertiary uppercase tracking-widest mb-2">
              {mode === 'edit' ? 'Paste an API key to re-check or replace the current connection' : 'Paste your API key'}
            </div>
            <div className="relative">
              <input
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={e => {
                  setApiKey(e.target.value)
                  setVerifyStatus('idle')
                  setVerifyError(null)
                  setSkipWarning(false)
                }}
                placeholder={`${selectedProvider.envVar}=sk-...`}
                className="w-full bg-surface-secondary border border-accent px-3 py-2.5 pr-10 text-[11px] text-text-primary placeholder:text-text-tertiary outline-none focus:border-brand font-body rounded-none"
              />
              <button
                type="button"
                onClick={() => setShowKey(s => !s)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-text-primary"
              >
                {showKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </button>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => void verifyKey()}
              disabled={!apiKey.trim() || verifyStatus === 'verifying'}
              className="lcd-button flex items-center gap-2 px-4 py-2 border border-brand bg-brand-muted text-brand text-[10px] font-display uppercase tracking-wider disabled:opacity-40 disabled:cursor-not-allowed rounded-none"
            >
              {verifyStatus === 'verifying' && <span className="animate-pulse">···</span>}
              {verifyStatus !== 'verifying' && 'Verify →'}
            </button>

            {verifyStatus === 'valid' && (
              <span className="flex items-center gap-1.5 text-[10px] font-display text-status-done">
                <Check className="h-3.5 w-3.5" />
                Valid — key accepted
              </span>
            )}
            {verifyStatus === 'invalid' && (
              <span className="text-[10px] font-display text-status-blocked">
                ✗ {verifyError ?? 'Invalid key'}
              </span>
            )}
          </div>

          {verifyStatus !== 'valid' && apiKey.trim() && (
            <button
              onClick={() => setSkipWarning(s => !s)}
              className="flex items-center gap-2 text-[10px] font-display text-text-tertiary hover:text-text-secondary transition-colors"
            >
              <div className={`h-3 w-3 border ${skipWarning ? 'border-status-review bg-status-review/20' : 'border-border'} flex items-center justify-center`}>
                {skipWarning && <Check className="h-2 w-2 text-status-review" />}
              </div>
              Skip verification (not recommended)
            </button>
          )}
          {skipWarning && (
            <div className="flex items-start gap-2 border border-status-review/40 bg-status-review/5 px-3 py-2 text-[10px] text-status-review font-display">
              <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
              Key not verified — agent may fail at runtime if the key is invalid.
            </div>
          )}
      </>

    </div>
  ) : null

  const renderModelStep = () => (
    <div>
      <div className="text-[9px] font-display text-text-tertiary uppercase tracking-widest mb-4">
        Choose a model
      </div>
      <div className="grid grid-cols-2 gap-2">
        {providerModels.map(m => {
          const meta = MODEL_META[m]
          const selected = model === m
          return (
            <button
              key={m}
              onClick={() => setModel(m)}
              className={`flex flex-col gap-1.5 p-3 border text-left transition-colors
                ${selected ? 'border-brand bg-brand-muted' : 'border-border bg-surface hover:border-brand/40'}`}
            >
              <div className="flex items-center gap-2">
                {selected && <Check className="h-3 w-3 text-brand flex-shrink-0" />}
                {!selected && <span className="h-3 w-3 flex-shrink-0" />}
                <span className={`text-[10px] font-display truncate ${selected ? 'text-brand' : 'text-text-primary'}`}>
                  {m.split('/').pop()}
                </span>
              </div>
              {meta && (
                <div className="flex items-center gap-2 ml-5">
                  <span className={`text-[7px] font-display uppercase px-1 py-0.5 border ${TIER_COLOR[meta.tier]}`}>
                    {meta.tier}
                  </span>
                  <span className="text-[9px] font-display text-text-tertiary">{meta.context}</span>
                  <span className="text-[9px] text-text-tertiary font-body truncate">{meta.description}</span>
                </div>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )

  const copySnippet = async (key: string, value: string) => {
    await navigator.clipboard.writeText(value)
    setCopiedSnippet(key)
    window.setTimeout(() => setCopiedSnippet(current => current === key ? null : current), 1200)
  }

  const renderSetupInstructionsStep = () => {
    if (!createdAgent) return null
    const snippets = buildMcpSetupSnippets(createdAgent.id)
    const blocks = [
      { key: 'npm', label: 'Install MCP server', value: snippets.npmInstall },
      { key: 'json', label: 'claude_desktop_config.json', value: snippets.claudeDesktopConfig },
      { key: 'claude', label: 'CLAUDE.md snippet', value: snippets.claudeMd },
    ]

    return (
      <div className="flex flex-col gap-5">
        <div>
          <div className="text-[9px] font-display text-status-done uppercase tracking-widest mb-2">Agent created</div>
          <div className="text-sm text-text-primary">{createdAgent.name}</div>
          <div className="mt-1 text-[10px] text-text-tertiary font-display">id: {createdAgent.id}</div>
          <div className="mt-3 text-[11px] text-text-secondary font-body leading-5">
            Add this MCP config to the agent runtime so it can pull tasks, send progress, request approval, and mark work ready for review.
          </div>
        </div>

        {blocks.map(block => (
          <div key={block.key} className="border border-border bg-surface-secondary">
            <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
              <div className="text-[9px] font-display uppercase tracking-[0.18em] text-text-tertiary">{block.label}</div>
              <button
                type="button"
                onClick={() => void copySnippet(block.key, block.value)}
                className="lcd-button inline-flex items-center gap-1.5 border border-accent bg-surface px-2 py-1 text-[8px] font-display uppercase tracking-wide text-text-secondary hover:text-text-primary"
              >
                <Copy className="h-3 w-3" />
                {copiedSnippet === block.key ? 'Copied' : 'Copy'}
              </button>
            </div>
            <pre className="max-h-52 overflow-auto whitespace-pre-wrap break-words p-4 text-[10px] text-text-primary"><code>{block.value}</code></pre>
          </div>
        ))}
      </div>
    )
  }

  const renderIdentityStep = () => (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <div className="text-[9px] font-display text-text-tertiary uppercase tracking-widest">Name *</div>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="My Agent"
            className="bg-surface-secondary border border-border px-3 py-2 text-[11px] text-text-primary placeholder:text-text-tertiary outline-none focus:border-brand font-body"
          />
          {name && (
            <span className="text-[9px] font-display text-text-tertiary">id: {agentSlug}</span>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <div className="text-[9px] font-display text-text-tertiary uppercase tracking-widest">Role</div>
          <select
            value={role}
            onChange={e => setRole(e.target.value as AgentRole)}
            disabled={createPreset?.lockRole}
            className="bg-surface-secondary border border-border px-3 py-2 text-[11px] text-text-primary outline-none focus:border-brand font-body"
          >
            {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
          {createPreset?.lockRole ? (
            <span className="text-[9px] font-display text-text-tertiary">Coordinator role is fixed for this setup flow.</span>
          ) : null}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="text-[9px] font-display text-text-tertiary uppercase tracking-widest">Runtime</div>
        <Select value={runtimeId} onChange={(event) => setRuntimeId(event.target.value)} className="bg-surface-secondary text-[11px] text-text-primary">
          {RUNTIME_OPTIONS.map((runtime) => (
            <option key={runtime.id} value={runtime.id}>{runtime.label}</option>
          ))}
        </Select>
        <span className="text-[9px] font-display text-text-tertiary">This runtime will be bound automatically when you save the agent.</span>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <div className="text-[9px] font-display text-text-tertiary uppercase tracking-widest">Primary Skill</div>
          <Select value={primarySkillFile} onChange={(event) => setPrimarySkillFile(event.target.value)} className="bg-surface-secondary text-[11px] text-text-primary">
            {availableSkills.map((skill) => (
              <option key={skill.sourcePath} value={skill.sourcePath}>{skill.name}</option>
            ))}
          </Select>
        </div>

        <div className="flex flex-col gap-1.5">
          <div className="text-[9px] font-display text-text-tertiary uppercase tracking-widest">Additional Skill Files</div>
          <div className="flex gap-2">
            <Select value="" onChange={(event) => {
              const value = event.target.value
              if (!value) return
              setSelectedSkillFiles((current) => current.includes(value) ? current : [...current, value])
              event.target.value = ''
            }} className="bg-surface-secondary text-[11px] text-text-primary">
              <option value="">Add skill...</option>
              {unselectedSkills.map((skill) => (
                <option key={skill.sourcePath} value={skill.sourcePath}>{skill.name}</option>
              ))}
            </Select>
          </div>
          <div className="flex flex-wrap gap-2">
            {selectedSkillFiles.length === 0 ? <span className="text-[9px] font-display text-text-tertiary">No additional skills selected.</span> : null}
            {selectedSkillFiles.map((skillPath) => {
              const skill = availableSkills.find((entry) => entry.sourcePath === skillPath)
              return (
                <button
                  key={skillPath}
                  type="button"
                  onClick={() => setSelectedSkillFiles((current) => current.filter((entry) => entry !== skillPath))}
                  className="border border-accent bg-surface px-2 py-1 text-[9px] font-display uppercase tracking-wide text-text-secondary hover:text-text-primary"
                  title="Remove skill"
                >
                  {skill?.name ?? skillPath} ×
                </button>
              )
            })}
          </div>
        </div>
      </div>

      <div>
        <div className="text-[9px] font-display text-text-tertiary uppercase tracking-widest mb-2">Avatar</div>
        <div className="flex items-start gap-4">
          <div className="flex flex-col items-center gap-1.5 border border-border bg-surface-secondary p-2 lcd-card">
            <AgentSpriteFrame
              imageSrc={spriteAsset}
              name="Selected avatar"
              color={selectedProvider?.color ?? '#8f8466'}
              size={128}
              pixelSize={96}
            />
            <span className="text-[8px] font-display uppercase tracking-widest text-text-tertiary">128 x 128</span>
          </div>
          <div className="flex flex-col gap-2">
            <input
              ref={avatarUploadRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(event) => {
                void handleAvatarUpload(event.target.files)
                event.currentTarget.value = ''
              }}
            />
            <button
              type="button"
              onClick={() => avatarUploadRef.current?.click()}
              className="lcd-button px-3 py-2 text-[9px] font-display uppercase tracking-wide border border-accent bg-surface rounded-none text-text-secondary hover:text-text-primary"
            >
              Upload avatar
            </button>
            {spriteAsset ? (
              <button
                type="button"
                onClick={() => setSpriteAsset('')}
                className="lcd-button px-3 py-2 text-[9px] font-display uppercase tracking-wide border border-accent bg-surface rounded-none text-text-secondary hover:text-text-primary"
              >
                Clear
              </button>
            ) : null}
          </div>
        </div>
        {avatarError ? <div className="mt-2 text-[10px] text-status-blocked font-body">{avatarError}</div> : null}
      </div>

      <div>
        <div className="text-[9px] font-display text-text-tertiary uppercase tracking-widest mb-2">Capabilities</div>
        <div className="grid grid-cols-3 gap-1.5">
          {CAPABILITIES_ALL.map(cap => {
            const on = capabilities.includes(cap)
            return (
              <button
                key={cap}
                onClick={() => toggleCapability(cap)}
                className={`flex items-center gap-2 px-2.5 py-1.5 border text-[9px] font-display transition-colors
                  ${on ? 'border-brand bg-brand-muted text-brand' : 'border-border bg-surface text-text-tertiary hover:text-text-secondary'}`}
              >
                <div className={`h-2.5 w-2.5 border flex-shrink-0 flex items-center justify-center ${on ? 'border-brand bg-brand' : 'border-border'}`}>
                  {on && <Check className="h-1.5 w-1.5 text-black" />}
                </div>
                {cap}
              </button>
            )
          })}
        </div>
      </div>

      <div>
        <div className="text-[9px] font-display text-text-tertiary uppercase tracking-widest mb-1">Task Types Accepted</div>
        <div className="text-[9px] text-text-tertiary mb-2">Auto-dispatch sẽ dùng danh sách này để chọn agent phù hợp với task tags.</div>
        <div className="grid grid-cols-3 gap-1.5">
          {TASK_TYPES_ALL.map(type => {
            const on = taskTypesAccepted.includes(type)
            return (
              <button
                key={type}
                onClick={() => toggleTaskType(type)}
                className={`flex items-center gap-2 px-2.5 py-1.5 border text-[9px] font-display transition-colors
                  ${on ? 'border-accent bg-accent/10 text-accent' : 'border-border bg-surface text-text-tertiary hover:text-text-secondary'}`}
              >
                <div className={`h-2.5 w-2.5 border flex-shrink-0 flex items-center justify-center ${on ? 'border-accent bg-accent' : 'border-border'}`}>
                  {on && <Check className="h-1.5 w-1.5 text-black" />}
                </div>
                {type}
              </button>
            )
          })}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <div className="text-[9px] font-display text-text-tertiary uppercase tracking-widest mb-2">Loaded skill files</div>
          <div className="border border-border bg-surface-secondary p-3 text-[10px] text-text-secondary">
            {(initialAgent?.skillFiles ?? []).length > 0
              ? initialAgent?.skillFiles?.join('\n')
              : initialAgent?.skillFile ?? 'No skill files linked.'}
          </div>
        </div>
        <div>
          <div className="text-[9px] font-display text-text-tertiary uppercase tracking-widest mb-2">Selected skill files</div>
          <div className="border border-border bg-surface-secondary p-3 text-[10px] text-text-secondary">
            {primarySkillFile || selectedSkillFiles.length > 0
              ? [primarySkillFile, ...selectedSkillFiles].filter(Boolean).join('\n')
              : 'No skill files selected.'}
          </div>
        </div>
        <div>
          <div className="text-[9px] font-display text-text-tertiary uppercase tracking-widest mb-2">System prompt</div>
          <div className="max-h-48 overflow-y-auto border border-border bg-surface-secondary p-3 text-[10px] whitespace-pre-wrap text-text-secondary">
            {initialAgent?.body?.trim() || 'No system prompt stored.'}
          </div>
        </div>
      </div>

      {submitError && (
        <div className="border border-status-blocked/40 bg-status-blocked/5 px-3 py-2 text-[10px] text-status-blocked font-display">
          {submitError}
        </div>
      )}

      {mode === 'edit' && initialAgent ? (
        <div className="border border-status-blocked/30 bg-status-blocked/5 p-4">
          <div className="text-[10px] font-display uppercase tracking-[0.18em] text-status-blocked">Danger zone</div>
          <div className="mt-2 text-[11px] text-text-secondary">
            Delete this agent from RelayHQ. This removes it from the current workspace registry.
          </div>

          {deleteError ? (
            <div className="mt-3 border border-status-blocked/40 bg-status-blocked/5 px-3 py-2 text-[10px] text-status-blocked font-display">
              {deleteError}
            </div>
          ) : null}

          {!deleteConfirmOpen ? (
            <button
              type="button"
              onClick={() => {
                setDeleteError(null)
                setDeleteConfirmOpen(true)
              }}
              className="lcd-button mt-4 px-3 py-2 text-[9px] font-display uppercase tracking-wide border border-status-blocked bg-status-blocked/10 rounded-none text-status-blocked hover:bg-status-blocked hover:text-surface"
            >
              Delete agent
            </button>
          ) : (
            <div className="mt-4 border border-status-blocked/40 bg-surface px-3 py-3">
              <div className="text-[10px] font-display uppercase tracking-[0.18em] text-status-blocked">Confirm deletion</div>
              <div className="mt-2 text-[11px] text-text-secondary">
                Delete <span className="text-text-primary">{initialAgent.name}</span>? This action cannot be undone from this screen.
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setDeleteConfirmOpen(false)}
                  disabled={isSubmitting}
                  className="lcd-button px-3 py-2 text-[9px] font-display uppercase tracking-wide border border-border bg-surface rounded-none text-text-secondary hover:text-text-primary disabled:opacity-40"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void handleDelete()}
                  disabled={isSubmitting}
                  className="lcd-button px-3 py-2 text-[9px] font-display uppercase tracking-wide border border-status-blocked bg-status-blocked text-surface rounded-none hover:bg-red-600 disabled:opacity-40"
                >
                  {isSubmitting ? 'Deleting...' : 'Confirm delete'}
                </button>
              </div>
            </div>
          )}
        </div>
      ) : null}
    </div>
  )

  const renderEditHistoryTab = () => (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 md:grid-cols-3">
        <div className="border border-border bg-surface-secondary p-3">
          <div className="text-[9px] font-display uppercase tracking-widest text-text-tertiary">Sessions</div>
          <div className="mt-2 text-2xl text-text-primary">{sessions.length}</div>
        </div>
        <div className="border border-border bg-surface-secondary p-3">
          <div className="text-[9px] font-display uppercase tracking-widest text-text-tertiary">Activity events</div>
          <div className="mt-2 text-2xl text-text-primary">{activity.length}</div>
        </div>
        <div className="border border-border bg-surface-secondary p-3">
          <div className="text-[9px] font-display uppercase tracking-widest text-text-tertiary">Audit notes</div>
          <div className="mt-2 text-2xl text-text-primary">{agentAuditNotes.length}</div>
        </div>
      </div>

      {historyError ? (
        <div className="border border-status-blocked/40 bg-status-blocked/5 px-3 py-2 text-[10px] text-status-blocked font-display">
          {historyError}
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="border border-border bg-surface-secondary">
          <div className="border-b border-border px-4 py-3 text-[10px] font-display uppercase tracking-[0.18em] text-text-tertiary">Latest transcript</div>
          <div className="max-h-[420px] overflow-y-auto p-4 space-y-3">
            {historyLoading ? <div className="text-[10px] text-text-secondary">Loading transcript…</div> : null}
            {!historyLoading && sessionEvents.length === 0 ? <div className="text-[10px] text-text-secondary">No session transcript yet.</div> : null}
            {sessionEvents.map((event) => (
              <div key={event.id} className="border border-border bg-surface px-3 py-2">
                <div className="text-[9px] uppercase tracking-[0.18em] text-text-tertiary">{formatSessionEventLabel(event)} · {new Date(event.timestamp).toLocaleString()}</div>
                <div className="mt-2 whitespace-pre-wrap break-words text-[11px] text-text-primary">{formatSessionEventBody(event)}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <div className="border border-border bg-surface-secondary">
            <div className="border-b border-border px-4 py-3 text-[10px] font-display uppercase tracking-[0.18em] text-text-tertiary">Work activity</div>
            <div className="max-h-[200px] overflow-y-auto p-4 space-y-2">
              {historyLoading ? <div className="text-[10px] text-text-secondary">Loading activity…</div> : null}
              {!historyLoading && activity.length === 0 ? <div className="text-[10px] text-text-secondary">No activity yet.</div> : null}
              {activity.map((event) => (
                <div key={`${event.timestamp}-${event.event_type}`} className="border border-border bg-surface px-3 py-2">
                  <div className="text-[9px] uppercase tracking-[0.18em] text-text-tertiary">{event.event_type.replace(/_/g, ' ')}</div>
                  <div className="mt-1 text-[11px] text-text-primary">{new Date(event.timestamp).toLocaleString()}</div>
                  <div className="mt-1 text-[10px] text-text-secondary">task {event.taskId ?? '—'} · model {event.model ?? '—'} · tokens {event.tokens_used ?? '—'}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="border border-border bg-surface-secondary">
            <div className="border-b border-border px-4 py-3 text-[10px] font-display uppercase tracking-[0.18em] text-text-tertiary">Audit log</div>
            <div className="max-h-[200px] overflow-y-auto p-4 space-y-2">
              {agentAuditNotes.length === 0 ? <div className="text-[10px] text-text-secondary">No audit notes linked to this agent yet.</div> : null}
              {agentAuditNotes.map((note) => (
                <div key={note.id} className="border border-border bg-surface px-3 py-2">
                  <div className="text-[9px] uppercase tracking-[0.18em] text-text-tertiary">{note.source} · {new Date(note.createdAt).toLocaleString()}</div>
                  <div className="mt-2 whitespace-pre-wrap break-words text-[11px] text-text-primary">{note.message}</div>
                  <div className="mt-1 text-[10px] text-text-secondary">task {note.taskId} · model {note.model ?? '—'} · tokens {note.tokensUsed ?? '—'} · confidence {note.confidence}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )

  const renderEditTabs = () => (
    <Tabs value={editTab} onValueChange={(value) => setEditTab(value as EditTab)}>
      <TabsList className="w-full justify-start">
        <TabsTrigger value="settings">Settings</TabsTrigger>
        <TabsTrigger value="connection">Connection</TabsTrigger>
        <TabsTrigger value="history">History</TabsTrigger>
      </TabsList>
      <TabsContent value="settings" className="mt-5">{renderIdentityStep()}</TabsContent>
      <TabsContent value="connection" className="mt-5">
        <div className="flex flex-col gap-5">
          {renderProviderStep()}
          {renderConnectionStep()}
          {renderModelStep()}
          <div>
            <div className="text-[9px] font-display text-text-tertiary uppercase tracking-widest mb-2">Run mode</div>
            <div className="flex gap-0 border border-border">
              {(['subprocess', 'webhook'] as const).map(m => (
                <button
                  key={m}
                  onClick={() => setRunMode(m)}
                  className={`flex-1 py-2 text-[9px] font-display uppercase tracking-wide transition-colors border-r last:border-r-0 border-border
                    ${runMode === m ? 'bg-brand-muted text-brand' : 'bg-surface text-text-tertiary hover:text-text-primary'}`}
                >
                  {m}
                </button>
              ))}
            </div>
            {runMode === 'subprocess' && (
              <input
                type="text"
                value={runCommand}
                onChange={e => setRunCommand(e.target.value)}
                placeholder="bun run ./cli/relayhq.ts run --taskId={taskId}"
                className="mt-2 w-full bg-surface-secondary border border-border px-3 py-2 text-[10px] text-text-primary placeholder:text-text-tertiary outline-none focus:border-brand font-body"
              />
            )}
            {runMode === 'webhook' && (
              <input
                type="url"
                value={webhookUrl}
                onChange={e => setWebhookUrl(e.target.value)}
                placeholder="https://example.com/webhook"
                className="mt-2 w-full bg-surface-secondary border border-border px-3 py-2 text-[10px] text-text-primary placeholder:text-text-tertiary outline-none focus:border-brand font-body"
              />
            )}
          </div>
        </div>
      </TabsContent>
      <TabsContent value="history" className="mt-5">{renderEditHistoryTab()}</TabsContent>
    </Tabs>
  )

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80">
      <div
        className="lcd-card flex flex-col border border-accent bg-surface-secondary shadow-modal overflow-hidden rounded-none"
        style={{ width: 640, maxHeight: '90vh' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-accent flex-shrink-0 bg-surface-sidebar">
          <span className="text-[10px] font-display text-brand uppercase tracking-widest">{title ?? 'Agent Setup'}</span>
          <button
            onClick={() => {
              if (step === 5) setCreatedAgent(null)
              onClose()
            }}
            className="lcd-button px-2 py-1 text-[8px] font-display text-text-tertiary hover:text-status-blocked border border-accent bg-surface rounded-none"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto lane-scroll px-8 py-6">
          {mode === 'edit' ? renderEditTabs() : (
            <>
              <ProgressBar step={step} labels={labels} />
              {step === 1 ? renderProviderStep() : null}
              {step === 2 ? renderConnectionStep() : null}
              {step === 3 ? renderModelStep() : null}
              {step === 4 ? renderIdentityStep() : null}
              {step === 5 ? renderSetupInstructionsStep() : null}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-border flex-shrink-0 bg-surface-sidebar">
          {mode === 'edit' ? <div /> : (
            <button
              onClick={() => { if (step > 1) setStep(s => (s - 1) as WizardStep) }}
              disabled={step === 1 || step === 5}
              className="lcd-button flex items-center gap-1.5 px-3 py-2 border border-border bg-surface text-text-secondary hover:text-text-primary text-[10px] font-display uppercase tracking-wider disabled:opacity-0 disabled:pointer-events-none"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              Back
            </button>
          )}

          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                if (step === 5) setCreatedAgent(null)
                onClose()
              }}
              className="text-[10px] font-display text-text-tertiary hover:text-text-secondary uppercase tracking-wider"
            >
              Cancel
            </button>

            {mode === 'edit' ? (
              <button
                onClick={() => void handleSubmit()}
                disabled={isSubmitting || !canNext[4]}
                className="lcd-button flex items-center gap-2 px-5 py-2 border border-brand bg-brand-muted text-brand text-[10px] font-display uppercase tracking-wider disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {isSubmitting ? <span className="animate-pulse">Saving···</span> : 'Save Agent →'}
              </button>
            ) : step === 5 ? (
              <button
                onClick={() => {
                  setCreatedAgent(null)
                  onClose()
                }}
                className="lcd-button flex items-center gap-2 px-5 py-2 border border-brand bg-brand-muted text-brand text-[10px] font-display uppercase tracking-wider"
              >
                Done →
              </button>
            ) : step < 4 ? (
              <button
                onClick={() => setStep(s => (s + 1) as WizardStep)}
                disabled={!canNext[step]}
                className="lcd-button flex items-center gap-2 px-5 py-2 border border-brand bg-brand-muted text-brand text-[10px] font-display uppercase tracking-wider disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Continue →
              </button>
            ) : (
                <button
                  onClick={() => void handleSubmit()}
                  disabled={!canNext[4] || isSubmitting}
                  className="lcd-button flex items-center gap-2 px-5 py-2 border border-brand bg-brand-muted text-brand text-[10px] font-display uppercase tracking-wider disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? <span className="animate-pulse">Creating···</span> : `${submitLabel ?? 'Create Agent'} →`}
                </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
