import { useState, useEffect, useRef } from 'react'
import { Check, ChevronLeft, Eye, EyeOff, ExternalLink, AlertTriangle, Globe } from 'lucide-react'
import { relayhqApi } from '../../api/client'
import { useAppStore } from '../../store/appStore'

// ─── Types ────────────────────────────────────────────────────────────────────

type WizardStep = 1 | 2 | 3 | 4

interface AgentSetupWizardProps {
  open: boolean
  onClose: () => void
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
    authMethods: ['apikey'] as const,
  },
  {
    id: 'openai',
    label: 'OpenAI',
    color: '#22c55e',
    description: 'GPT-4o — versatile, fast',
    consoleUrl: 'https://platform.openai.com/api-keys',
    envVar: 'OPENAI_API_KEY',
    authMethods: ['apikey'] as const,
  },
  {
    id: 'google',
    label: 'Google',
    color: '#3b82f6',
    description: 'Gemini — multimodal, long context',
    consoleUrl: 'https://aistudio.google.com/apikey',
    envVar: 'GOOGLE_API_KEY',
    authMethods: ['apikey'] as const,
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    color: '#a855f7',
    description: '200+ models, single API',
    consoleUrl: 'https://openrouter.ai/keys',
    envVar: 'OPENROUTER_API_KEY',
    authMethods: ['apikey'] as const,
  },
]

const MODELS_BY_PROVIDER: Record<string, ReadonlyArray<string>> = {
  anthropic:  ['claude-sonnet-4-6', 'claude-opus-4-7', 'claude-haiku-4-5'],
  openai:     ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo'],
  google:     ['gemini-2.0-flash', 'gemini-1.5-pro', 'gemini-1.5-flash'],
  openrouter: ['meta-llama/llama-3.1-70b-instruct', 'mistralai/mistral-large', 'qwen/qwen-2.5-72b-instruct'],
}

const MODEL_META: Record<string, { tier: 'fast' | 'balanced' | 'powerful'; context: string; description: string }> = {
  'claude-sonnet-4-6':                      { tier: 'balanced',  context: '200k', description: 'Best for most tasks' },
  'claude-opus-4-7':                        { tier: 'powerful',  context: '200k', description: 'Maximum capability' },
  'claude-haiku-4-5':                       { tier: 'fast',      context: '200k', description: 'Lightweight & cheap' },
  'gpt-4o':                                 { tier: 'balanced',  context: '128k', description: 'Versatile, multimodal' },
  'gpt-4o-mini':                            { tier: 'fast',      context: '128k', description: 'Cost-efficient' },
  'gpt-4-turbo':                            { tier: 'powerful',  context: '128k', description: 'High performance' },
  'gemini-2.0-flash':                       { tier: 'fast',      context: '1M',   description: 'Ultra-long context' },
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

const SPRITE_OPTIONS = [
  '/assets/sprites/girl_cyber_demon_dual_scythe_1.png',
  '/assets/sprites/girl_cyber_demon_scythe_1.png',
  '/assets/sprites/girl_cyber_demon_scythe_2.png',
  '/assets/sprites/girl_cyber_demon_scythe_3.png',
  '/assets/sprites/girl_cyber_demon_scythe_4.png',
  '/assets/sprites/girl_cyber_demon_scythe_5.png',
  '/assets/sprites/girl_cyber_demon_scythe_6.png',
  '/assets/sprites/girl_cyber_demon_scythe_7.png',
  '/assets/sprites/girl_cyber_demon_scythe_8.png',
  '/assets/sprites/girl_cyber_demon_scythe_9.png',
] as const

const PORTRAIT_OPTIONS = [
  '/assets/portraits/adventurer_silver_girl_1.png',
  '/assets/portraits/angel_blonde_girl_1.png',
  '/assets/portraits/bunny_blue_girl_1.png',
  '/assets/portraits/bunny_blue_girl_2.png',
  '/assets/portraits/bunny_white_girl_1.png',
  '/assets/portraits/bunny_white_girl_2.png',
  '/assets/portraits/bunny_white_girl_3.png',
  '/assets/portraits/bunny_white_girl_4.png',
  '/assets/portraits/bunny_white_girl_5.png',
  '/assets/portraits/bunny_white_girl_6.png',
] as const

const ROLES = ['implementation', 'review', 'planning', 'qa', 'ops'] as const

const CAPABILITIES_ALL = ['write-code', 'run-tests', 'deploy', 'review-code', 'search-web', 'manage-infra'] as const

// ─── Avatar ───────────────────────────────────────────────────────────────────

function AgentPixelAvatar({ color, size = 32 }: { color: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 8 8" style={{ imageRendering: 'pixelated' }}>
      <rect x="1" y="0" width="6" height="2" fill={color} opacity={0.9} />
      <rect x="1" y="2" width="6" height="4" fill="#fde68a" />
      <rect x="2" y="3" width="1" height="1" fill="#1c1917" />
      <rect x="5" y="3" width="1" height="1" fill="#1c1917" />
      <rect x="3" y="5" width="2" height="1" fill="#1c1917" />
      <rect x="2" y="6" width="4" height="2" fill={color} opacity={0.7} />
    </svg>
  )
}

// ─── Progress bar ─────────────────────────────────────────────────────────────

function ProgressBar({ step }: { step: WizardStep }) {
  const LABELS = ['Provider', 'Connect', 'Model', 'Identity']
  return (
    <div className="flex items-center gap-0 mb-8">
      {LABELS.map((label, i) => {
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
            {i < LABELS.length - 1 && (
              <div className={`flex-1 h-px mb-5 transition-colors ${done ? 'bg-brand' : 'bg-border'}`} />
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── Wizard ───────────────────────────────────────────────────────────────────

export function AgentSetupWizard({ open, onClose }: AgentSetupWizardProps) {
  const loadData = useAppStore(state => state.loadData)
  const browserPollRef = useRef<number | null>(null)

  const [step, setStep] = useState<WizardStep>(1)
  const [provider, setProvider] = useState<string | null>(null)
  const [connectMode, setConnectMode] = useState<'apikey' | 'browser'>('apikey')
  const [apiKey, setApiKey] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [verifyStatus, setVerifyStatus] = useState<'idle' | 'verifying' | 'valid' | 'invalid'>('idle')
  const [verifyError, setVerifyError] = useState<string | null>(null)
  const [browserStatus, setBrowserStatus] = useState<'idle' | 'starting' | 'waiting' | 'complete' | 'error'>('idle')
  const [browserError, setBrowserError] = useState<string | null>(null)
  const [browserState, setBrowserState] = useState<string | null>(null)
  const [skipWarning, setSkipWarning] = useState(false)
  const [model, setModel] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [role, setRole] = useState<typeof ROLES[number]>('implementation')
  const [spriteAsset, setSpriteAsset] = useState<typeof SPRITE_OPTIONS[number]>(SPRITE_OPTIONS[0])
  const [portraitAsset, setPortraitAsset] = useState<typeof PORTRAIT_OPTIONS[number]>(PORTRAIT_OPTIONS[0])
  const [runMode, setRunMode] = useState<'manual' | 'subprocess' | 'webhook'>('manual')
  const [runCommand, setRunCommand] = useState('')
  const [webhookUrl, setWebhookUrl] = useState('')
  const [aliases, setAliases] = useState('')
  const [capabilities, setCapabilities] = useState<string[]>(['write-code', 'run-tests'])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const selectedProvider = PROVIDERS.find(p => p.id === provider)
  const providerModels = provider ? (MODELS_BY_PROVIDER[provider] ?? []) : []
  const browserSupported = provider === 'openrouter' || provider === 'openai'

  const canNext: Record<WizardStep, boolean> = {
    1: provider !== null,
    2: verifyStatus === 'valid' || browserStatus === 'complete' || skipWarning,
    3: model !== null,
    4: name.trim().length > 0,
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

  const handleProviderSelect = (id: string) => {
    setProvider(id)
    setConnectMode('apikey')
    setApiKey('')
    setVerifyStatus('idle')
    setVerifyError(null)
    setBrowserStatus('idle')
    setBrowserError(null)
    setBrowserState(null)
    setSkipWarning(false)
    setModel(MODELS_BY_PROVIDER[id]?.[0] ?? null)
    setSpriteAsset(SPRITE_OPTIONS[0])
    setPortraitAsset(PORTRAIT_OPTIONS[0])
  }

  const startBrowserLogin = async () => {
    if (!provider || !browserSupported) return

    setBrowserStatus('starting')
    setBrowserError(null)
    setVerifyStatus('idle')
    setVerifyError(null)

    const popup = window.open('', '_blank')
    if (!popup) {
      setBrowserStatus('error')
      setBrowserError('Popup blocked. Allow popups and try again.')
      return
    }

    popup.document.write('<!doctype html><html><body style="font-family:monospace;padding:2rem">Connecting...</body></html>')

    try {
      const result = await relayhqApi.startOAuth(provider as 'openrouter' | 'openai')
      setBrowserState(result.state)
      setBrowserStatus('waiting')

      popup.location.href = result.authUrl
    } catch (error) {
      popup.close()
      setBrowserStatus('error')
      setBrowserError(error instanceof Error ? error.message : 'Failed to start browser login')
    }
  }

  useEffect(() => {
    if (!open) return

    if (browserPollRef.current !== null) {
      window.clearInterval(browserPollRef.current)
      browserPollRef.current = null
    }

    if (connectMode !== 'browser' || browserStatus !== 'waiting' || !provider || !browserState) return

    browserPollRef.current = window.setInterval(async () => {
      try {
        const result = await relayhqApi.pollOAuth(provider as 'openrouter' | 'openai', browserState)

        if (result.status === 'complete') {
          if (browserPollRef.current !== null) {
            window.clearInterval(browserPollRef.current)
            browserPollRef.current = null
          }
          setBrowserStatus('complete')
          setBrowserError(null)
          if (result.apiKey) {
            setApiKey(result.apiKey)
          }
          return
        }

        if (result.status === 'error') {
          if (browserPollRef.current !== null) {
            window.clearInterval(browserPollRef.current)
            browserPollRef.current = null
          }
          setBrowserStatus('error')
          setBrowserError(result.error ?? 'Browser login failed')
          return
        }

        if (result.status === 'expired') {
          if (browserPollRef.current !== null) {
            window.clearInterval(browserPollRef.current)
            browserPollRef.current = null
          }
          setBrowserStatus('error')
          setBrowserError('Browser login expired. Start again.')
        }
      } catch (error) {
        if (browserPollRef.current !== null) {
          window.clearInterval(browserPollRef.current)
          browserPollRef.current = null
        }
        setBrowserStatus('error')
        setBrowserError(error instanceof Error ? error.message : 'Failed to check login status')
      }
    }, 1500)

    return () => {
      if (browserPollRef.current !== null) {
        window.clearInterval(browserPollRef.current)
        browserPollRef.current = null
      }
    }
  }, [open, connectMode, browserStatus, provider, browserState])

  useEffect(() => () => {
    if (browserPollRef.current !== null) {
      window.clearInterval(browserPollRef.current)
      browserPollRef.current = null
    }
  }, [])

  const handleSubmit = async () => {
    if (!provider || !model || !name.trim()) return
    setIsSubmitting(true)
    setSubmitError(null)
    try {
      const apiKeyRef = `env:${selectedProvider?.envVar ?? 'API_KEY'}`
      await relayhqApi.createAgent({
        name: name.trim(),
        role,
        provider,
        model,
        apiKeyRef,
        portraitAsset,
        spriteAsset,
        runMode,
        runCommand: runMode === 'subprocess' ? runCommand : undefined,
        webhookUrl: runMode === 'webhook' ? webhookUrl : undefined,
        aliases: aliases.split(',').map(s => s.trim()).filter(Boolean),
        capabilities,
      })
      if (apiKey.trim() && verifyStatus === 'valid') {
        await relayhqApi.writeShellProfile('zshrc').catch(() => {})
      }
      await loadData()
      onClose()
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to create agent')
    } finally {
      setIsSubmitting(false)
    }
  }

  const toggleCapability = (cap: string) => {
    setCapabilities(prev =>
      prev.includes(cap) ? prev.filter(c => c !== cap) : [...prev, cap]
    )
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80">
      <div
        className="lcd-card flex flex-col border border-accent bg-surface-secondary shadow-modal overflow-hidden rounded-none"
        style={{ width: 640, maxHeight: '90vh' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-accent flex-shrink-0 bg-surface-sidebar">
          <span className="text-[10px] font-display text-brand uppercase tracking-widest">Agent Setup</span>
          <button
            onClick={onClose}
            className="lcd-button px-2 py-1 text-[8px] font-display text-text-tertiary hover:text-status-blocked border border-accent bg-surface rounded-none"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto lane-scroll px-8 py-6">
          <ProgressBar step={step} />

          {/* ── Step 1: Provider ── */}
          {step === 1 && (
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
          )}

          {/* ── Step 2: Connect ── */}
          {step === 2 && selectedProvider && (
            <div className="flex flex-col gap-5">
              <div>
                <div className="text-[9px] font-display text-text-tertiary uppercase tracking-widest mb-1">
                  Connect {selectedProvider.label}
                </div>
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

              {browserSupported && (
                <div className="flex gap-2 border border-border bg-surface-secondary p-1 rounded-none">
                  <button
                    type="button"
                    onClick={() => setConnectMode('apikey')}
                    className={`flex-1 px-3 py-2 text-[10px] font-display uppercase tracking-wider transition-colors ${connectMode === 'apikey' ? 'bg-brand-muted text-brand' : 'text-text-tertiary hover:text-text-primary'}`}
                  >
                    API Key
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setConnectMode('browser')
                      setApiKey('')
                      setVerifyStatus('idle')
                      setVerifyError(null)
                      setSkipWarning(false)
                    }}
                    className={`flex-1 px-3 py-2 text-[10px] font-display uppercase tracking-wider transition-colors ${connectMode === 'browser' ? 'bg-brand-muted text-brand' : 'text-text-tertiary hover:text-text-primary'}`}
                  >
                    Browser Login
                  </button>
                </div>
              )}

              {connectMode === 'apikey' && (
                <>
                  <div>
                    <div className="text-[9px] font-display text-text-tertiary uppercase tracking-widest mb-2">
                      Paste your API key
                    </div>
                    <div className="relative">
                      <input
                        type={showKey ? 'text' : 'password'}
                        value={apiKey}
                        onChange={e => {
                          setApiKey(e.target.value)
                          setVerifyStatus('idle')
                          setVerifyError(null)
                          setBrowserStatus('idle')
                          setBrowserError(null)
                          setBrowserState(null)
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
              )}

              {connectMode === 'browser' && browserSupported && (
                <div className="flex flex-col gap-3">
                  <div className="text-[10px] text-text-secondary font-body leading-5">
                    Open {selectedProvider.label} in a browser, complete login, and RelayHQ will watch for the callback.
                  </div>

                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => void startBrowserLogin()}
                      disabled={browserStatus === 'starting' || browserStatus === 'waiting'}
                      className="lcd-button flex items-center gap-2 px-4 py-2 border border-brand bg-brand-muted text-brand text-[10px] font-display uppercase tracking-wider disabled:opacity-40 disabled:cursor-not-allowed rounded-none"
                    >
                      {browserStatus === 'starting' && <span className="animate-pulse">···</span>}
                      {browserStatus !== 'starting' && 'Connect in browser →'}
                    </button>

                    {browserStatus === 'waiting' && (
                      <span className="flex items-center gap-1.5 text-[10px] font-display text-status-review">
                        <Globe className="h-3.5 w-3.5" />
                        Waiting for callback
                      </span>
                    )}
                    {browserStatus === 'complete' && (
                      <span className="flex items-center gap-1.5 text-[10px] font-display text-status-done">
                        <Check className="h-3.5 w-3.5" />
                        Browser login complete
                      </span>
                    )}
                  </div>

                  {apiKey && (
                    <div className="flex flex-col gap-1.5 border border-border bg-surface-secondary px-3 py-2">
                      <div className="text-[9px] font-display uppercase tracking-widest text-text-tertiary">Captured credential</div>
                      <div className="break-all font-mono text-[10px] text-text-primary">{apiKey}</div>
                    </div>
                  )}

                  {browserError && (
                    <div className="border border-status-blocked/40 bg-status-blocked/5 px-3 py-2 text-[10px] text-status-blocked font-display">
                      {browserError}
                    </div>
                  )}

                  {browserStatus === 'complete' && !apiKey && (
                    <div className="border border-status-done/40 bg-status-done/5 px-3 py-2 text-[10px] text-status-done font-display">
                      Connected, but no credential was returned.
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── Step 3: Model ── */}
          {step === 3 && (
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
          )}

          {/* ── Step 4: Identity ── */}
          {step === 4 && (
            <div className="flex flex-col gap-5">
              <div className="grid grid-cols-2 gap-4">
                {/* Name */}
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

                {/* Role */}
                <div className="flex flex-col gap-1.5">
                  <div className="text-[9px] font-display text-text-tertiary uppercase tracking-widest">Role</div>
                  <select
                    value={role}
                    onChange={e => setRole(e.target.value as typeof ROLES[number])}
                    className="bg-surface-secondary border border-border px-3 py-2 text-[11px] text-text-primary outline-none focus:border-brand font-body"
                  >
                    {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
              </div>

                {/* Sprite */}
                <div>
                  <div className="text-[9px] font-display text-text-tertiary uppercase tracking-widest mb-2">Sprite</div>
                  <div className="flex items-start gap-4">
                    <div className="flex flex-col items-center gap-1.5 border border-border bg-surface-secondary p-2 lcd-card">
                      <img src={spriteAsset} alt="Selected sprite" className="h-32 w-32 object-contain" style={{ imageRendering: 'pixelated' }} />
                      <span className="text-[8px] font-display uppercase tracking-widest text-text-tertiary">128 x 128</span>
                    </div>
                    <div className="grid flex-1 grid-cols-5 gap-2">
                    {SPRITE_OPTIONS.map(option => (
                      <button
                        key={option}
                        type="button"
                        onClick={() => setSpriteAsset(option)}
                        className={`border p-1 transition-transform lcd-card ${spriteAsset === option ? 'border-brand bg-brand-muted scale-[1.03]' : 'border-border bg-surface hover:border-brand/40'}`}
                      >
                        <img src={option} alt="Sprite option" className="h-14 w-full object-contain" style={{ imageRendering: 'pixelated' }} />
                      </button>
                    ))}
                    </div>
                  </div>
                </div>

                {/* Portrait */}
                <div>
                  <div className="text-[9px] font-display text-text-tertiary uppercase tracking-widest mb-2">Portrait</div>
                  <div className="flex items-start gap-4">
                    <div className="flex flex-col items-center gap-1.5 border border-border bg-surface-secondary p-2 lcd-card">
                      <img src={portraitAsset} alt="Selected portrait" className="h-16 w-16 object-cover" style={{ imageRendering: 'pixelated' }} />
                      <span className="text-[8px] font-display uppercase tracking-widest text-text-tertiary">64 x 64</span>
                    </div>
                    <div className="grid flex-1 grid-cols-5 gap-2">
                    {PORTRAIT_OPTIONS.map(option => (
                      <button
                        key={option}
                        type="button"
                        onClick={() => setPortraitAsset(option)}
                        className={`border p-1 transition-transform lcd-card ${portraitAsset === option ? 'border-brand bg-brand-muted scale-[1.03]' : 'border-border bg-surface hover:border-brand/40'}`}
                      >
                        <img src={option} alt="Portrait option" className="h-14 w-full object-cover" style={{ imageRendering: 'pixelated' }} />
                      </button>
                    ))}
                    </div>
                  </div>
                </div>

              {/* Run mode */}
                <div>
                  <div className="text-[9px] font-display text-text-tertiary uppercase tracking-widest mb-2">Run mode</div>
                  <div className="mb-2 text-[10px] leading-5 text-text-secondary font-body">
                    Manual = đăng ký agent thôi. Subprocess = chạy qua command local. Webhook = gọi endpoint bên ngoài khi có việc.
                  </div>
                  <div className="flex gap-0 border border-border">
                  {(['manual', 'subprocess', 'webhook'] as const).map(m => (
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

              {/* Aliases */}
              <div className="flex flex-col gap-1.5">
                <div className="text-[9px] font-display text-text-tertiary uppercase tracking-widest">Aliases (optional, comma-separated)</div>
                <div className="text-[10px] leading-5 text-text-secondary font-body">
                  Tên gọi khác để nhận diện hoặc route agent. Ví dụ: `claude-code`, `support-bot`, `oncall`.
                </div>
                <input
                  type="text"
                  value={aliases}
                  onChange={e => setAliases(e.target.value)}
                  placeholder="operator, coder"
                  className="bg-surface-secondary border border-border px-3 py-2 text-[10px] text-text-primary placeholder:text-text-tertiary outline-none focus:border-brand font-body"
                />
              </div>

              {/* Capabilities */}
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

              {submitError && (
                <div className="border border-status-blocked/40 bg-status-blocked/5 px-3 py-2 text-[10px] text-status-blocked font-display">
                  {submitError}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-border flex-shrink-0 bg-surface-sidebar">
          <button
            onClick={() => { if (step > 1) setStep(s => (s - 1) as WizardStep) }}
            disabled={step === 1}
            className="lcd-button flex items-center gap-1.5 px-3 py-2 border border-border bg-surface text-text-secondary hover:text-text-primary text-[10px] font-display uppercase tracking-wider disabled:opacity-0 disabled:pointer-events-none"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            Back
          </button>

          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="text-[10px] font-display text-text-tertiary hover:text-text-secondary uppercase tracking-wider"
            >
              Cancel
            </button>

            {step < 4 ? (
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
                {isSubmitting ? <span className="animate-pulse">Creating···</span> : 'Create Agent →'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
