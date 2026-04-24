import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, Check, ChevronLeft, ClipboardCheck, ClipboardCopy, Folder, FolderOpen, Sparkles, Terminal, X } from 'lucide-react'

import { relayhqApi, type RelayHQBrowseDirectoriesResponse } from '../../api/client'
import { useAppStore } from '../../store/appStore'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogOverlay, DialogPanel, DialogTitle } from '../ui/dialog'
import { Input } from '../ui/input'

type WizardMode = 'create' | 'existing'
type WizardStep = 1 | 2 | 3
type ConnectTab = 'claude-code' | 'cli'
type ShellWriteStatus = 'idle' | 'writing' | 'done' | 'error'

const WIZARD_STEPS: ReadonlyArray<{ id: WizardStep; label: string }> = [
  { id: 1, label: 'Workspace' },
  { id: 2, label: 'Project' },
  { id: 3, label: 'Connect' },
]

function stepFromState(hasValidVault: boolean, workspaceCount: number, projectCount: number): WizardStep {
  if (!hasValidVault || workspaceCount === 0) return 1
  if (projectCount === 0) return 2
  return 3
}

export function OnboardingWizard() {
  const settings = useAppStore(state => state.settings)
  const projects = useAppStore(state => state.projects)
  const showOnboarding = useAppStore(state => state.showOnboarding)
  const loadData = useAppStore(state => state.loadData)
  const isMutating = useAppStore(state => state.isMutating)
  const mutationError = useAppStore(state => state.mutationError)

  const [mode, setMode] = useState<WizardMode>('create')
  const [workspaceName, setWorkspaceName] = useState('My Workspace')
  const [vaultRoot, setVaultRoot] = useState('')
  const [existingVaultRoot, setExistingVaultRoot] = useState('')
  const [projectName, setProjectName] = useState('')
  const [codebaseRoot, setCodebaseRoot] = useState('')
  const [connectTab, setConnectTab] = useState<ConnectTab>('claude-code')
  const [shellWriteStatus, setShellWriteStatus] = useState<ShellWriteStatus>('idle')
  const [shellWritePath, setShellWritePath] = useState<string | null>(null)
  const [snippetCopied, setSnippetCopied] = useState(false)
  const [wizardError, setWizardError] = useState<string | null>(null)
  const [stepOverride, setStepOverride] = useState<WizardStep | null>(null)
  const [pickerTarget, setPickerTarget] = useState<'create' | 'existing' | null>(null)
  const [directoryBrowser, setDirectoryBrowser] = useState<RelayHQBrowseDirectoriesResponse | null>(null)
  const [isBrowsingDirectories, setIsBrowsingDirectories] = useState(false)

  useEffect(() => {
    const resolvedRoot = settings?.vaultRoot || settings?.resolvedRoot || ''
    if (resolvedRoot.length > 0) {
      setVaultRoot(current => current || resolvedRoot)
      setExistingVaultRoot(current => current || resolvedRoot)
    }
  }, [settings])

  useEffect(() => {
    if (projects.length > 0) {
      setProjectName(current => current || projects[0].name)
    }
  }, [projects])

  const detectedStep = useMemo(
    () => stepFromState(Boolean(settings?.isValid), settings?.availableWorkspaces.length ?? 0, projects.length),
    [settings, projects.length],
  )

  const currentStep = stepOverride ?? detectedStep
  const canSubmitStep1 = !isMutating && (mode === 'create' ? workspaceName.trim().length > 0 && vaultRoot.trim().length > 0 : existingVaultRoot.trim().length > 0)
  const canSubmitStep2 = projectName.trim().length > 0

  const activeVaultRoot = settings?.vaultRoot || settings?.resolvedRoot || ''

  const mcpSnippet = JSON.stringify({
    mcpServers: {
      relayhq: {
        command: 'npx',
        args: ['relayhq-mcp'],
        env: {
          RELAYHQ_BASE_URL: 'http://127.0.0.1:44210',
          RELAYHQ_VAULT_ROOT: activeVaultRoot,
        },
      },
    },
  }, null, 2)

  const cliSnippet = `export RELAYHQ_BASE_URL="http://127.0.0.1:44210"\nexport RELAYHQ_VAULT_ROOT="${activeVaultRoot}"`

  useEffect(() => {
    setStepOverride(current => {
      if (current === null) return null
      return current < detectedStep ? detectedStep : current
    })
  }, [detectedStep])

  if (!showOnboarding || settings === null) {
    return null
  }

  async function handleCreateWorkspace() {
    setWizardError(null)
    try {
      await relayhqApi.initVault({ vaultRoot, workspaceName })
      await loadData()
      setStepOverride(2)
    } catch (error) {
      setWizardError(error instanceof Error ? error.message : 'Unable to initialize RelayHQ.')
    }
  }

  async function handleUseExistingVault() {
    setWizardError(null)
    try {
      await relayhqApi.saveSettings({ vaultRoot: existingVaultRoot, workspaceId: null })
      await loadData()
      setStepOverride(2)
    } catch (error) {
      setWizardError(error instanceof Error ? error.message : 'Unable to connect the existing vault.')
    }
  }

  async function handleCreateProject() {
    setWizardError(null)
    try {
      await relayhqApi.createProject({
        name: projectName,
        codebaseRoot: codebaseRoot.trim().length > 0 ? codebaseRoot.trim() : null,
      })
      await loadData()
      setStepOverride(3)
    } catch (error) {
      setWizardError(error instanceof Error ? error.message : 'Unable to create the first project.')
    }
  }

  async function handleCopySnippet() {
    const text = connectTab === 'claude-code' ? mcpSnippet : cliSnippet
    await navigator.clipboard.writeText(text)
    setSnippetCopied(true)
    setTimeout(() => setSnippetCopied(false), 2000)
  }

  async function handleWriteShellProfile(target: 'zshrc' | 'bashrc') {
    setShellWriteStatus('writing')
    setShellWritePath(null)
    setWizardError(null)
    try {
      const result = await relayhqApi.writeShellProfile(target)
      setShellWriteStatus('done')
      setShellWritePath(result.path)
    } catch (error) {
      setShellWriteStatus('error')
      setWizardError(error instanceof Error ? error.message : 'Unable to write shell profile.')
    }
  }

  function handlePreviousStep() {
    setWizardError(null)
    setStepOverride(current => {
      const active = current ?? detectedStep
      if (active <= 1) return 1
      return (active - 1) as WizardStep
    })
  }

  async function openDirectoryPicker(target: 'create' | 'existing', path?: string) {
    setWizardError(null)
    setPickerTarget(target)
    setIsBrowsingDirectories(true)
    try {
      const requestedPath = path ?? ((target === 'create' ? vaultRoot : existingVaultRoot) || settings.resolvedRoot)
      const nextBrowser = await relayhqApi.browseDirectories(requestedPath)
      setDirectoryBrowser(nextBrowser)
    } catch (error) {
      setWizardError(error instanceof Error ? error.message : 'Unable to browse directories.')
      setPickerTarget(null)
    } finally {
      setIsBrowsingDirectories(false)
    }
  }

  function selectDirectory(path: string) {
    if (pickerTarget === 'create') setVaultRoot(path)
    if (pickerTarget === 'existing') setExistingVaultRoot(path)
    setPickerTarget(null)
    setDirectoryBrowser(null)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
      <div className="flex h-[min(760px,calc(100vh-2rem))] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-modal">
        <div className="flex-1 overflow-y-auto p-6 md:p-8">
          <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-2">
              <Badge variant="secondary" className="w-fit gap-2 rounded-full px-3 py-1 text-xs font-medium uppercase tracking-[0.2em] normal-case">
                <Sparkles className="w-3.5 h-3.5" />
                Step {currentStep} of 3
              </Badge>
              <h2 className="text-3xl font-bold text-text-primary">Set up your first RelayHQ workspace</h2>
              <p className="max-w-2xl text-sm text-text-secondary">
                RelayHQ writes Markdown files to your vault on your behalf. You can stay in the UI, open the files in your editor, or let an AI agent read and write them directly — all three work on the same files.
              </p>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto_minmax(0,1fr)] md:items-center">
                {WIZARD_STEPS.map((step, index) => {
                  const isComplete = detectedStep > step.id
                  const isCurrent = currentStep === step.id
                  const isUnlocked = detectedStep >= step.id

                  return (
                    <div key={step.id} className="contents md:contents">
                      <button
                        type="button"
                        onClick={() => setStepOverride(step.id)}
                        disabled={!isUnlocked}
                        className="group inline-flex w-full items-center gap-3 rounded-xl border border-border bg-surface-secondary px-4 py-3 text-left disabled:cursor-not-allowed disabled:opacity-50 md:min-h-[72px]"
                      >
                        <span className={[
                          'flex h-8 w-8 items-center justify-center rounded-full border text-sm font-semibold transition-colors',
                          isComplete ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : '',
                          isCurrent ? 'border-accent bg-accent-light text-accent' : '',
                          !isComplete && !isCurrent ? 'border-border bg-surface-secondary text-text-tertiary group-hover:text-text-primary' : '',
                        ].join(' ')}>
                          {isComplete ? <Check className="h-4 w-4" /> : step.id}
                        </span>
                        <span className="flex flex-col items-start">
                          <span className={[
                            'text-sm font-medium transition-colors',
                            isCurrent ? 'text-text-primary' : '',
                            isComplete ? 'text-emerald-700' : '',
                            !isComplete && !isCurrent ? 'text-text-tertiary group-hover:text-text-primary' : '',
                          ].join(' ')}>
                            {step.label}
                          </span>
                          <span className="text-[11px] uppercase tracking-[0.18em] text-text-tertiary">
                            {isComplete ? 'done' : isCurrent ? 'current' : isUnlocked ? 'ready' : 'locked'}
                          </span>
                        </span>
                      </button>

                      {index < WIZARD_STEPS.length - 1 && (
                        <div className={[
                          'hidden h-px w-full md:block',
                          detectedStep > step.id ? 'bg-emerald-300' : 'bg-border',
                        ].join(' ')} />
                      )}
                    </div>
                  )
                })}
              </div>
            </div>

            {currentStep === 1 && (
              <div className="flex flex-col gap-5">
                <div className="flex gap-2 rounded-xl border border-border bg-surface-secondary p-1">
                  <button
                    type="button"
                    onClick={() => setMode('create')}
                    className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${mode === 'create' ? 'bg-surface text-accent shadow-sm' : 'text-text-secondary hover:text-text-primary'}`}
                  >
                    Create new vault
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode('existing')}
                    className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${mode === 'existing' ? 'bg-surface text-accent shadow-sm' : 'text-text-secondary hover:text-text-primary'}`}
                  >
                    Use existing vault
                  </button>
                </div>

                {mode === 'create' ? (
                  <div className="grid gap-4 md:grid-cols-2">
                    <label className="flex flex-col gap-1.5 text-sm text-text-secondary">
                      Workspace name
                      <Input value={workspaceName} onChange={event => setWorkspaceName(event.target.value)} placeholder="My Workspace" />
                    </label>
                    <div className="flex flex-col gap-1.5 text-sm text-text-secondary">
                      <label>Vault path</label>
                      <div className="flex gap-2">
                        <Input value={vaultRoot} onChange={event => setVaultRoot(event.target.value)} className="min-w-0 flex-1" placeholder={settings.resolvedRoot} />
                        <Button variant="outline" onClick={() => void openDirectoryPicker('create')}>
                          <FolderOpen className="h-4 w-4" /> Browse
                        </Button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col gap-1.5 text-sm text-text-secondary">
                    <label>Existing vault path</label>
                    <div className="flex gap-2">
                      <Input value={existingVaultRoot} onChange={event => setExistingVaultRoot(event.target.value)} className="min-w-0 flex-1" placeholder={settings.resolvedRoot} />
                      <Button variant="outline" onClick={() => void openDirectoryPicker('existing')}>
                        <FolderOpen className="h-4 w-4" /> Browse
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {currentStep === 2 && (
              <div className="flex flex-col gap-5">
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="flex flex-col gap-1.5 text-sm text-text-secondary">
                    Project name
                    <Input value={projectName} onChange={event => setProjectName(event.target.value)} placeholder="Launch Website" />
                  </label>
                  <label className="flex flex-col gap-1.5 text-sm text-text-secondary">
                    Codebase path (optional)
                    <Input value={codebaseRoot} onChange={event => setCodebaseRoot(event.target.value)} placeholder="../my-repo" />
                  </label>
                </div>
              </div>
            )}

            {currentStep === 3 && (
              <div className="flex flex-col gap-5">
                <div className="flex gap-2 rounded-xl border border-border bg-surface-secondary p-1">
                  <button
                    type="button"
                    onClick={() => setConnectTab('claude-code')}
                    className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${connectTab === 'claude-code' ? 'bg-surface text-accent shadow-sm' : 'text-text-secondary hover:text-text-primary'}`}
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    Claude Code
                  </button>
                  <button
                    type="button"
                    onClick={() => setConnectTab('cli')}
                    className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${connectTab === 'cli' ? 'bg-surface text-accent shadow-sm' : 'text-text-secondary hover:text-text-primary'}`}
                  >
                    <Terminal className="h-3.5 w-3.5" />
                    CLI / Shell
                  </button>
                </div>

                {connectTab === 'claude-code' && (
                  <div className="flex flex-col gap-4">
                    <p className="text-sm text-text-secondary">
                      Add RelayHQ to <code className="rounded bg-surface-secondary px-1.5 py-0.5 text-xs font-mono text-text-primary">~/.claude/settings.json</code>.
                      Once added, every Claude Code session will have <code className="rounded bg-surface-secondary px-1.5 py-0.5 text-xs font-mono text-text-primary">relayhq_*</code> tools available automatically — no per-project setup needed.
                    </p>
                    <div className="relative rounded-xl border border-border bg-slate-950 p-4">
                      <pre className="overflow-x-auto text-xs leading-relaxed text-slate-300">{mcpSnippet}</pre>
                      <button
                        type="button"
                        onClick={() => void handleCopySnippet()}
                        className="absolute right-3 top-3 flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-xs font-medium text-slate-300 transition-colors hover:bg-slate-700"
                      >
                        {snippetCopied ? (
                          <><ClipboardCheck className="h-3.5 w-3.5 text-emerald-400" /> Copied</>
                        ) : (
                          <><ClipboardCopy className="h-3.5 w-3.5" /> Copy</>
                        )}
                      </button>
                    </div>
                    <ol className="flex flex-col gap-1.5 text-sm text-text-secondary">
                      <li className="flex items-baseline gap-2"><span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent-light text-xs font-semibold text-accent">1</span> Copy the snippet above</li>
                      <li className="flex items-baseline gap-2"><span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent-light text-xs font-semibold text-accent">2</span> Paste it into <code className="rounded bg-surface-secondary px-1.5 py-0.5 text-xs font-mono text-text-primary">~/.claude/settings.json</code> (merging with any existing <code className="rounded bg-surface-secondary px-1 py-0.5 text-xs font-mono text-text-primary">mcpServers</code> key)</li>
                      <li className="flex items-baseline gap-2"><span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent-light text-xs font-semibold text-accent">3</span> Restart Claude Code — done</li>
                    </ol>
                  </div>
                )}

                {connectTab === 'cli' && (
                  <div className="flex flex-col gap-4">
                    <p className="text-sm text-text-secondary">
                      Export these variables into your shell profile. Any terminal session opened after that will have the RelayHQ CLI ready without additional setup.
                    </p>
                    <div className="relative rounded-xl border border-border bg-slate-950 p-4">
                      <pre className="overflow-x-auto text-xs leading-relaxed text-slate-300">{cliSnippet}</pre>
                      <button
                        type="button"
                        onClick={() => void handleCopySnippet()}
                        className="absolute right-3 top-3 flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-xs font-medium text-slate-300 transition-colors hover:bg-slate-700"
                      >
                        {snippetCopied ? (
                          <><ClipboardCheck className="h-3.5 w-3.5 text-emerald-400" /> Copied</>
                        ) : (
                          <><ClipboardCopy className="h-3.5 w-3.5" /> Copy</>
                        )}
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        disabled={shellWriteStatus === 'writing'}
                        onClick={() => void handleWriteShellProfile('zshrc')}
                      >
                        Write to ~/.zshrc
                      </Button>
                      <Button
                        variant="outline"
                        disabled={shellWriteStatus === 'writing'}
                        onClick={() => void handleWriteShellProfile('bashrc')}
                      >
                        Write to ~/.bashrc
                      </Button>
                    </div>
                    {shellWriteStatus === 'done' && shellWritePath && (
                      <p className="flex items-center gap-2 text-sm text-emerald-600">
                        <Check className="h-4 w-4" />
                        Added to <code className="rounded bg-surface-secondary px-1.5 py-0.5 text-xs font-mono">{shellWritePath}</code> — run <code className="rounded bg-surface-secondary px-1.5 py-0.5 text-xs font-mono">source {shellWritePath}</code>
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}

            {(wizardError || mutationError) && <p className="text-sm text-status-blocked">{wizardError || mutationError}</p>}
          </div>
        </div>

        <div className="border-t border-border bg-surface px-6 py-4 md:px-8">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-h-[20px] text-sm text-status-blocked">
              {(wizardError || mutationError || settings.invalidReason) ?? ''}
            </div>

            <div className="flex flex-wrap gap-3 sm:justify-end">
              {currentStep > 1 && (
                <Button type="button" onClick={handlePreviousStep} variant="outline">
                  Back
                </Button>
              )}

              {currentStep === 1 && (
                <Button
                  type="button"
                  disabled={!canSubmitStep1}
                  onClick={() => void (mode === 'create' ? handleCreateWorkspace() : handleUseExistingVault())}
                >
                  {mode === 'create' ? 'Create workspace' : 'Connect vault'} <ArrowRight className="w-4 h-4" />
                </Button>
              )}

              {currentStep === 2 && (
                <Button
                  type="button"
                  disabled={!canSubmitStep2}
                  onClick={() => void handleCreateProject()}
                >
                  Create first project <ArrowRight className="w-4 h-4" />
                </Button>
              )}

              {currentStep === 3 && (
                <Button
                  type="button"
                  onClick={() => setStepOverride(null)}
                >
                  Open my board <ArrowRight className="w-4 h-4" />
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      {pickerTarget !== null && directoryBrowser && (
        <Dialog open>
          <DialogOverlay />
          <DialogContent>
            <DialogPanel className="flex max-h-[calc(100vh-2rem)] max-w-3xl flex-col">
              <DialogHeader>
                <div>
                  <DialogTitle>Choose folder</DialogTitle>
                  <DialogDescription>Pick the directory to use as your RelayHQ vault root.</DialogDescription>
                </div>
                <Button variant="ghost" size="icon" onClick={() => { setPickerTarget(null); setDirectoryBrowser(null) }}>
                  <X className="h-4 w-4" />
                </Button>
              </DialogHeader>

              <div className="border-b border-border bg-surface-secondary px-5 py-3">
                <div className="mb-2 flex items-center gap-2">
                  <Button
                    disabled={!directoryBrowser.parentPath || isBrowsingDirectories}
                    onClick={() => void openDirectoryPicker(pickerTarget, directoryBrowser.parentPath ?? undefined)}
                    variant="outline"
                    size="sm"
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Up
                  </Button>
                  {isBrowsingDirectories && <span className="text-sm text-text-secondary">Loading folders…</span>}
                </div>
                <div className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-secondary">
                  <span className="block truncate">{directoryBrowser.currentPath}</span>
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto p-3">
                <div className="space-y-1">
                  {directoryBrowser.entries.map(entry => (
                    <button
                      key={entry.path}
                      type="button"
                      onClick={() => void openDirectoryPicker(pickerTarget, entry.path)}
                      className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-3 text-left transition-colors hover:bg-surface-secondary"
                    >
                      <span className="inline-flex min-w-0 items-center gap-3">
                        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-light text-accent">
                          <Folder className="h-4 w-4" />
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium text-text-primary">{entry.name}</span>
                          <span className="block truncate text-xs text-text-tertiary">{entry.path}</span>
                        </span>
                      </span>
                      {entry.isVaultRoot && (
                        <Badge variant="success">vault</Badge>
                      )}
                    </button>
                  ))}
                  {directoryBrowser.entries.length === 0 && (
                    <div className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-text-tertiary">
                      No subfolders found here.
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between gap-3 border-t border-border px-5 py-4">
                <div className="text-sm text-text-secondary">
                  Select the current folder if you want RelayHQ to create or use a vault here.
                </div>
                <div className="flex items-center gap-3">
                  <Button variant="outline" onClick={() => { setPickerTarget(null); setDirectoryBrowser(null) }}>
                    Cancel
                  </Button>
                  <Button onClick={() => selectDirectory(directoryBrowser.currentPath)}>
                    Use this folder <ArrowRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </DialogPanel>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}
