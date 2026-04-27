import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, Check, ChevronLeft, ClipboardCheck, ClipboardCopy, Folder, FolderOpen, Sparkles } from 'lucide-react'

import { relayhqApi, type RelayHQBrowseDirectoriesResponse } from '../../api/client'
import { useAppStore } from '../../store/appStore'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogOverlay, DialogPanel, DialogTitle } from '../ui/dialog'
import { Input } from '../ui/input'

type WizardMode = 'create' | 'existing'
type WizardStep = 1 | 2 | 3
type RuntimeId = 'claude-code' | 'cursor' | 'antigravity' | 'opencode' | 'codex'

const WIZARD_STEPS: ReadonlyArray<{ id: WizardStep; label: string }> = [
  { id: 1, label: 'Workspace' },
  { id: 2, label: 'Project' },
  { id: 3, label: 'Connect' },
]

const RUNTIMES: ReadonlyArray<{ id: RuntimeId; label: string }> = [
  { id: 'claude-code', label: 'Claude Code' },
  { id: 'cursor', label: 'Cursor' },
  { id: 'antigravity', label: 'Antigravity' },
  { id: 'opencode', label: 'OpenCode' },
  { id: 'codex', label: 'Codex' },
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

  const [mode, setMode] = useState<WizardMode>('create')
  const [workspaceName, setWorkspaceName] = useState('My Workspace')
  const [vaultRoot, setVaultRoot] = useState('')
  const [existingVaultRoot, setExistingVaultRoot] = useState('')
  const [projectName, setProjectName] = useState('')
  const [codebaseRoot, setCodebaseRoot] = useState('')
  const [selectedRuntime, setSelectedRuntime] = useState<RuntimeId>('claude-code')
  const [stepOverride, setStepOverride] = useState<WizardStep | null>(null)
  const [wizardError, setWizardError] = useState<string | null>(null)
  const [copyState, setCopyState] = useState<'idle' | 'copied'>('idle')
  const [installPayload, setInstallPayload] = useState<{ runtime: string; filename: string; content: string } | null>(null)
  const [snippetPayload, setSnippetPayload] = useState<{ snippet: string; configFilePath: string; instruction: string } | null>(null)
  const [isLoadingAssets, setIsLoadingAssets] = useState(false)
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
  const setupCommand = `npx relayhq setup ${selectedRuntime}`

  useEffect(() => {
    setStepOverride(current => {
      if (current === null) return null
      return current < detectedStep ? detectedStep : current
    })
  }, [detectedStep])

  useEffect(() => {
    if (currentStep !== 3) return

    let cancelled = false
    setIsLoadingAssets(true)
    setWizardError(null)

    void Promise.all([
      relayhqApi.getAgentInstall(selectedRuntime),
      relayhqApi.getMcpSnippet(selectedRuntime),
    ])
      .then(([install, snippet]) => {
        if (cancelled) return
        setInstallPayload(install)
        setSnippetPayload(snippet)
      })
      .catch((error: unknown) => {
        if (cancelled) return
        setWizardError(error instanceof Error ? error.message : 'Unable to load setup instructions.')
      })
      .finally(() => {
        if (!cancelled) setIsLoadingAssets(false)
      })

    return () => {
      cancelled = true
    }
  }, [currentStep, selectedRuntime])

  if (!showOnboarding || settings === null) {
    return null
  }

  async function copyText(text: string) {
    await navigator.clipboard.writeText(text)
    setCopyState('copied')
    window.setTimeout(() => setCopyState('idle'), 1600)
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

  async function openDirectoryPicker(target: 'create' | 'existing', path?: string) {
    setWizardError(null)
    setPickerTarget(target)
    setIsBrowsingDirectories(true)
    try {
      const requestedPath = path ?? ((target === 'create' ? vaultRoot : existingVaultRoot) || settings.resolvedRoot)
      const response = await relayhqApi.browseDirectories(requestedPath)
      setDirectoryBrowser(response)
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
      <div className="flex h-[min(820px,calc(100vh-2rem))] w-full max-w-5xl flex-col overflow-hidden rounded-none border border-accent bg-surface-secondary shadow-modal">
        <div className="flex-1 overflow-y-auto p-6 md:p-8">
          <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-2">
              <Badge variant="secondary" className="w-fit gap-2 rounded-none px-3 py-1 text-xs font-medium uppercase tracking-[0.2em] normal-case">
                <Sparkles className="h-3.5 w-3.5" />
                Step {currentStep} of 3
              </Badge>
              <h2 className="text-3xl font-bold text-text-primary">Set up your first RelayHQ workspace</h2>
              <p className="max-w-2xl text-sm text-text-secondary">
                RelayHQ writes Markdown files to your vault. You can stay in the UI, open the files in your editor, or let an AI runtime connect directly.
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
                        className="group inline-flex w-full items-center gap-3 rounded-none border border-border bg-surface-secondary px-4 py-3 text-left disabled:cursor-not-allowed disabled:opacity-50 md:min-h-[72px]"
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
                        <div className={['hidden h-px w-full md:block', detectedStep > step.id ? 'bg-emerald-300' : 'bg-border'].join(' ')} />
                      )}
                    </div>
                  )
                })}
              </div>
            </div>

            {currentStep === 1 && (
              <div className="flex flex-col gap-5">
                <div className="flex gap-2 rounded-none border border-border bg-surface-secondary p-1">
                  <button type="button" onClick={() => setMode('create')} className={`rounded-none px-4 py-2 text-sm font-medium transition-colors ${mode === 'create' ? 'bg-brand-muted text-accent' : 'text-text-secondary hover:bg-brand-muted hover:text-accent'}`}>
                    Create new vault
                  </button>
                  <button type="button" onClick={() => setMode('existing')} className={`rounded-none px-4 py-2 text-sm font-medium transition-colors ${mode === 'existing' ? 'bg-brand-muted text-accent' : 'text-text-secondary hover:bg-brand-muted hover:text-accent'}`}>
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
              <div className="flex flex-col gap-6">
                <div className="flex flex-wrap gap-2">
                  {RUNTIMES.map(runtime => (
                    <button
                      key={runtime.id}
                      type="button"
                      onClick={() => setSelectedRuntime(runtime.id)}
                      className={[
                        'rounded-full border px-4 py-2 text-sm font-medium transition-colors',
                        selectedRuntime === runtime.id
                          ? 'border-accent bg-accent-light text-accent'
                          : 'border-border bg-surface-secondary text-text-secondary hover:text-text-primary',
                      ].join(' ')}
                    >
                      {runtime.label}
                    </button>
                  ))}
                </div>

                <div className="grid gap-4 xl:grid-cols-2">
                  <section className="rounded-none border border-border bg-surface-secondary p-4">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-text-primary">Install protocol pack</div>
                        <div className="text-xs text-text-secondary">Run the setup command in your project.</div>
                      </div>
                      <Button variant="outline" size="sm" onClick={() => void copyText(setupCommand)}>
                        {copyState === 'copied' ? <ClipboardCheck className="h-3.5 w-3.5" /> : <ClipboardCopy className="h-3.5 w-3.5" />} Copy
                      </Button>
                    </div>
                    <div className="rounded-none border border-border bg-surface p-4 text-xs text-text-secondary">
                      <pre className="overflow-x-auto">{setupCommand}</pre>
                    </div>
                    <div className="mt-4 space-y-2 text-sm text-text-secondary">
                      <div>Target file: <code className="rounded bg-surface px-1.5 py-0.5 text-xs text-text-primary">{installPayload?.filename ?? 'loading…'}</code></div>
                      <div className="rounded-none border border-border bg-surface px-4 py-3">
                        <div className="mb-2 text-xs uppercase tracking-[0.18em] text-text-tertiary">Preview</div>
                        <pre className="max-h-48 overflow-auto whitespace-pre-wrap text-xs leading-relaxed text-text-primary">{installPayload?.content ?? (isLoadingAssets ? 'Loading…' : 'No install content yet.')}</pre>
                      </div>
                    </div>
                  </section>

                  <section className="rounded-none border border-border bg-surface-secondary p-4">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-text-primary">Connect MCP</div>
                        <div className="text-xs text-text-secondary">Paste this JSON into your runtime settings.</div>
                      </div>
                      <Button variant="outline" size="sm" onClick={() => void copyText(snippetPayload?.snippet ?? '')}>
                        {copyState === 'copied' ? <ClipboardCheck className="h-3.5 w-3.5" /> : <ClipboardCopy className="h-3.5 w-3.5" />} Copy
                      </Button>
                    </div>
                    <div className="rounded-none border border-border bg-surface p-4 text-xs text-text-secondary">
                      <pre className="max-h-80 overflow-auto whitespace-pre-wrap leading-relaxed">{snippetPayload?.snippet ?? (isLoadingAssets ? 'Loading…' : 'No snippet yet.')}</pre>
                    </div>
                    {snippetPayload && (
                      <p className="mt-3 text-xs text-text-secondary">
                        {snippetPayload.instruction} <span className="text-text-tertiary">{snippetPayload.configFilePath}</span>
                      </p>
                    )}
                  </section>
                </div>
              </div>
            )}

            {wizardError && <p className="text-sm text-status-blocked">{wizardError}</p>}
          </div>
        </div>

        <div className="border-t border-border bg-surface px-6 py-4 md:px-8">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-h-[20px] text-sm text-status-blocked">{wizardError ?? settings.invalidReason ?? ''}</div>

            <div className="flex flex-wrap gap-3 sm:justify-end">
              {currentStep > 1 && (
                <Button type="button" onClick={() => setStepOverride(currentStep === 1 ? 1 : (currentStep - 1) as WizardStep)} variant="outline">
                  Back
                </Button>
              )}

              {currentStep === 1 && (
                <Button type="button" disabled={isMutating || (mode === 'create' ? workspaceName.trim().length === 0 || vaultRoot.trim().length === 0 : existingVaultRoot.trim().length === 0)} onClick={() => void (mode === 'create' ? handleCreateWorkspace() : handleUseExistingVault())}>
                  {mode === 'create' ? 'Create workspace' : 'Connect vault'} <ArrowRight className="h-4 w-4" />
                </Button>
              )}

              {currentStep === 2 && (
                <Button type="button" disabled={projectName.trim().length === 0} onClick={() => void handleCreateProject()}>
                  Create first project <ArrowRight className="h-4 w-4" />
                </Button>
              )}

              {currentStep === 3 && (
                <Button
                  type="button"
                  onClick={() => {
                    useAppStore.setState({ showOnboarding: false })
                    setStepOverride(null)
                  }}
                >
                  Open my board <ArrowRight className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      {pickerTarget !== null && directoryBrowser && (
        <Dialog open>
          <DialogOverlay onClick={() => { /* keep wizard modal open until explicit close */ }} />
          <DialogContent>
            <DialogPanel className="flex max-h-[calc(100vh-2rem)] max-w-3xl flex-col">
              <DialogHeader>
                <div>
                  <DialogTitle>Choose folder</DialogTitle>
                  <DialogDescription>Pick the directory to use as your RelayHQ vault root.</DialogDescription>
                </div>
                <Button variant="ghost" size="icon" onClick={() => { setPickerTarget(null); setDirectoryBrowser(null) }}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
              </DialogHeader>

              <div className="border-b border-border bg-surface-secondary px-5 py-3">
                <div className="mb-2 flex items-center gap-2">
                  <Button disabled={!directoryBrowser.parentPath || isBrowsingDirectories} onClick={() => void openDirectoryPicker(pickerTarget, directoryBrowser.parentPath ?? undefined)} variant="outline" size="sm">
                    <ChevronLeft className="h-4 w-4" />
                    Up
                  </Button>
                  {isBrowsingDirectories && <span className="text-sm text-text-secondary">Loading folders…</span>}
                </div>
                <div className="rounded-none border border-border bg-surface px-3 py-2 text-sm text-text-secondary">
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
                      className="flex w-full items-center justify-between gap-3 rounded-none px-3 py-3 text-left transition-colors hover:bg-brand-muted hover:text-brand"
                    >
                      <span className="inline-flex min-w-0 items-center gap-3">
                        <span className="flex h-8 w-8 items-center justify-center rounded-none border border-accent bg-brand-muted text-accent">
                          <Folder className="h-4 w-4" />
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium text-text-primary">{entry.name}</span>
                          <span className="block truncate text-xs text-text-tertiary">{entry.path}</span>
                        </span>
                      </span>
                      {entry.isVaultRoot && <Badge variant="success">vault</Badge>}
                    </button>
                  ))}
                  {directoryBrowser.entries.length === 0 && (
                    <div className="rounded-none border border-dashed border-border px-4 py-8 text-center text-sm text-text-tertiary">
                      No subfolders found here.
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between gap-3 border-t border-border px-5 py-4">
                <div className="text-sm text-text-secondary">Select the current folder if you want RelayHQ to create or use a vault here.</div>
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
