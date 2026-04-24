import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, Check, ChevronLeft, Folder, FolderOpen, Sparkles, X } from 'lucide-react'

import { relayhqApi, type RelayHQBrowseDirectoriesResponse } from '../../api/client'
import { useAppStore } from '../../store/appStore'
import type { TaskPriority } from '../../types'

type WizardMode = 'create' | 'existing'
type WizardStep = 1 | 2 | 3

const WIZARD_STEPS: ReadonlyArray<{ id: WizardStep; label: string }> = [
  { id: 1, label: 'Workspace' },
  { id: 2, label: 'Project' },
  { id: 3, label: 'Task' },
]

function stepFromState(hasValidVault: boolean, workspaceCount: number, projectCount: number, taskCount: number): WizardStep {
  if (!hasValidVault || workspaceCount === 0) return 1
  if (projectCount === 0) return 2
  return 3
}

export function OnboardingWizard() {
  const settings = useAppStore(state => state.settings)
  const projects = useAppStore(state => state.projects)
  const tasks = useAppStore(state => state.tasks)
  const showOnboarding = useAppStore(state => state.showOnboarding)
  const loadData = useAppStore(state => state.loadData)
  const addTask = useAppStore(state => state.addTask)
  const isMutating = useAppStore(state => state.isMutating)
  const mutationError = useAppStore(state => state.mutationError)

  const [mode, setMode] = useState<WizardMode>('create')
  const [workspaceName, setWorkspaceName] = useState('My Workspace')
  const [vaultRoot, setVaultRoot] = useState('')
  const [existingVaultRoot, setExistingVaultRoot] = useState('')
  const [projectName, setProjectName] = useState('')
  const [codebaseRoot, setCodebaseRoot] = useState('')
  const [taskTitle, setTaskTitle] = useState('')
  const [taskObjective, setTaskObjective] = useState('')
  const [taskAcceptanceCriteria, setTaskAcceptanceCriteria] = useState('')
  const [taskContextFiles, setTaskContextFiles] = useState('')
  const [taskConstraints, setTaskConstraints] = useState('')
  const [taskPriority, setTaskPriority] = useState<TaskPriority>('medium')
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
    () => stepFromState(Boolean(settings?.isValid), settings?.availableWorkspaces.length ?? 0, projects.length, tasks.length),
    [settings, projects.length, tasks.length],
  )

  const currentStep = stepOverride ?? detectedStep
  const canSubmitStep1 = !isMutating && (mode === 'create' ? workspaceName.trim().length > 0 && vaultRoot.trim().length > 0 : existingVaultRoot.trim().length > 0)
  const canSubmitStep2 = projectName.trim().length > 0
  const acceptanceCriteriaCount = taskAcceptanceCriteria.split(/\r?\n/).map(item => item.trim()).filter(Boolean).length
  const contextFilesCount = taskContextFiles.split(/\r?\n/).map(item => item.trim()).filter(Boolean).length
  const canSubmitStep3 = taskTitle.trim().length > 0 && taskObjective.trim().length >= 50 && acceptanceCriteriaCount >= 2 && contextFilesCount >= 1 && !isMutating

  useEffect(() => {
    setStepOverride(current => {
      if (current === null) return null
      return current < detectedStep ? detectedStep : current
    })
  }, [detectedStep])

  if (!showOnboarding || settings === null) {
    return null
  }

  const selectedProject = projects[0]

  async function handleCreateWorkspace() {
    setWizardError(null)
    try {
      await relayhqApi.initVault({
        vaultRoot,
        workspaceName,
      })
      await loadData()
      setStepOverride(2)
    } catch (error) {
      setWizardError(error instanceof Error ? error.message : 'Unable to initialize RelayHQ.')
    }
  }

  async function handleUseExistingVault() {
    setWizardError(null)
    try {
      await relayhqApi.saveSettings({
        vaultRoot: existingVaultRoot,
        workspaceId: null,
      })
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

  async function handleCreateTask() {
    if (!selectedProject) {
      setWizardError('Create a project before adding the first task.')
      return
    }

    setWizardError(null)
    try {
      const acceptanceCriteria = taskAcceptanceCriteria
        .split(/\r?\n/)
        .map(item => item.trim())
        .filter(Boolean)

      const contextFiles = taskContextFiles
        .split(/\r?\n/)
        .map(item => item.trim())
        .filter(Boolean)

      const constraints = taskConstraints
        .split(/\r?\n/)
        .map(item => item.trim())
        .filter(Boolean)

      await addTask({
        title: taskTitle,
        description: taskObjective,
        projectId: selectedProject.id,
        boardId: selectedProject.boardId,
        priority: taskPriority,
        objective: taskObjective,
        acceptanceCriteria,
        contextFiles,
        constraints,
      })
      await loadData()
      setStepOverride(null)
    } catch (error) {
      setWizardError(error instanceof Error ? error.message : 'Unable to create the first task.')
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

  function handleSkipTask() {
    setWizardError(null)
    setStepOverride(null)
    void loadData()
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
    if (pickerTarget === 'create') {
      setVaultRoot(path)
    }
    if (pickerTarget === 'existing') {
      setExistingVaultRoot(path)
    }
    setPickerTarget(null)
    setDirectoryBrowser(null)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
      <div className="flex h-[min(760px,calc(100vh-2rem))] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-modal">
        <div className="flex-1 overflow-y-auto p-6 md:p-8">
          <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <div className="inline-flex w-fit items-center gap-2 rounded-full border border-border bg-surface-secondary px-3 py-1 text-xs font-medium uppercase tracking-[0.2em] text-text-secondary">
              <Sparkles className="w-3.5 h-3.5" />
              Step {currentStep} of 3
            </div>
            <h2 className="text-3xl font-bold text-text-primary">Set up your first RelayHQ workspace</h2>
            <p className="max-w-2xl text-sm text-text-secondary">
              Start in the UI now. RelayHQ will write the vault files for you, and you can inspect or edit them directly later.
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
                    <input value={workspaceName} onChange={event => setWorkspaceName(event.target.value)} className="rounded-md border border-border bg-surface px-3 py-2 text-text-primary" placeholder="My Workspace" />
                  </label>
                  <div className="flex flex-col gap-1.5 text-sm text-text-secondary">
                    <label>Vault path</label>
                    <div className="flex gap-2">
                      <input value={vaultRoot} onChange={event => setVaultRoot(event.target.value)} className="min-w-0 flex-1 rounded-md border border-border bg-surface px-3 py-2 text-text-primary" placeholder={settings.resolvedRoot} />
                      <button type="button" onClick={() => void openDirectoryPicker('create')} className="inline-flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-2 text-sm font-medium text-text-secondary transition-colors hover:bg-surface-secondary hover:text-text-primary">
                        <FolderOpen className="h-4 w-4" /> Browse
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-1.5 text-sm text-text-secondary">
                  <label>Existing vault path</label>
                  <div className="flex gap-2">
                    <input value={existingVaultRoot} onChange={event => setExistingVaultRoot(event.target.value)} className="min-w-0 flex-1 rounded-md border border-border bg-surface px-3 py-2 text-text-primary" placeholder={settings.resolvedRoot} />
                    <button type="button" onClick={() => void openDirectoryPicker('existing')} className="inline-flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-2 text-sm font-medium text-text-secondary transition-colors hover:bg-surface-secondary hover:text-text-primary">
                      <FolderOpen className="h-4 w-4" /> Browse
                    </button>
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
                  <input value={projectName} onChange={event => setProjectName(event.target.value)} className="rounded-md border border-border bg-surface px-3 py-2 text-text-primary" placeholder="Launch Website" />
                </label>
                <label className="flex flex-col gap-1.5 text-sm text-text-secondary">
                  Codebase path (optional)
                  <input value={codebaseRoot} onChange={event => setCodebaseRoot(event.target.value)} className="rounded-md border border-border bg-surface px-3 py-2 text-text-primary" placeholder="../my-repo" />
                </label>
              </div>
            </div>
          )}

          {currentStep === 3 && (
            <div className="flex flex-col gap-5">
              <div className="grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
                <div className="space-y-4">
                  <label className="flex flex-col gap-1.5 text-sm text-text-secondary">
                    First task title
                    <input value={taskTitle} onChange={event => setTaskTitle(event.target.value)} className="rounded-md border border-border bg-surface px-3 py-2 text-text-primary" placeholder="Ship the landing page" />
                  </label>

                  <label className="flex flex-col gap-1.5 text-sm text-text-secondary">
                    Objective
                    <textarea value={taskObjective} onChange={event => setTaskObjective(event.target.value)} rows={5} className="rounded-md border border-border bg-surface px-3 py-2 text-text-primary" placeholder="Describe what this task should achieve in enough detail for an agent or teammate to start immediately." />
                  </label>

                  <label className="flex flex-col gap-1.5 text-sm text-text-secondary">
                    Acceptance criteria
                    <textarea value={taskAcceptanceCriteria} onChange={event => setTaskAcceptanceCriteria(event.target.value)} rows={5} className="rounded-md border border-border bg-surface px-3 py-2 text-text-primary" placeholder={"One outcome per line\nTask appears on the board\nReviewer can verify the result"} />
                  </label>
                </div>

                <div className="space-y-4">
                  <label className="flex flex-col gap-1.5 text-sm text-text-secondary">
                    Context files
                    <textarea value={taskContextFiles} onChange={event => setTaskContextFiles(event.target.value)} rows={4} className="rounded-md border border-border bg-surface px-3 py-2 text-text-primary" placeholder={"One path per line\nweb/src/api/client.ts\ndocs/onboarding.md"} />
                  </label>

                  <label className="flex flex-col gap-1.5 text-sm text-text-secondary">
                    Constraints (optional)
                    <textarea value={taskConstraints} onChange={event => setTaskConstraints(event.target.value)} rows={4} className="rounded-md border border-border bg-surface px-3 py-2 text-text-primary" placeholder={"One constraint per line\nDo not break existing approval flow"} />
                  </label>

                  <label className="flex max-w-xs flex-col gap-1.5 text-sm text-text-secondary">
                    Priority
                    <select value={taskPriority} onChange={event => setTaskPriority(event.target.value as TaskPriority)} className="rounded-md border border-border bg-surface px-3 py-2 text-text-primary">
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                      <option value="critical">Critical</option>
                    </select>
                  </label>

                  <div className="rounded-lg border border-border bg-surface-secondary px-3 py-3 text-xs text-text-tertiary">
                    Objective should be detailed enough to start work. Add at least two acceptance criteria and one context file.
                  </div>
                </div>
              </div>
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
                <button
                  type="button"
                  onClick={handlePreviousStep}
                  className="inline-flex items-center gap-2 rounded-md border border-border bg-surface px-4 py-2 text-sm font-medium text-text-secondary transition-colors hover:bg-surface-secondary hover:text-text-primary"
                >
                  Back
                </button>
              )}

              {currentStep === 3 && (
                <button
                  type="button"
                  onClick={handleSkipTask}
                  className="inline-flex items-center gap-2 rounded-md border border-border bg-surface px-4 py-2 text-sm font-medium text-text-secondary transition-colors hover:bg-surface-secondary hover:text-text-primary"
                >
                  Skip for now
                </button>
              )}

              {currentStep === 1 && (
                <button
                  type="button"
                  disabled={!canSubmitStep1}
                  onClick={() => void (mode === 'create' ? handleCreateWorkspace() : handleUseExistingVault())}
                  className="inline-flex items-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {mode === 'create' ? 'Create workspace' : 'Connect vault'} <ArrowRight className="w-4 h-4" />
                </button>
              )}

              {currentStep === 2 && (
                <button
                  type="button"
                  disabled={!canSubmitStep2}
                  onClick={() => void handleCreateProject()}
                  className="inline-flex items-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Create first project <ArrowRight className="w-4 h-4" />
                </button>
              )}

              {currentStep === 3 && (
                <button
                  type="button"
                  disabled={!canSubmitStep3}
                  onClick={() => void handleCreateTask()}
                  className="inline-flex items-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Open my board <ArrowRight className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        </div>

      </div>

      {pickerTarget !== null && directoryBrowser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
          <div className="flex max-h-[calc(100vh-2rem)] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-modal">
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <div>
                <h3 className="text-lg font-semibold text-text-primary">Choose folder</h3>
                <p className="mt-1 text-sm text-text-secondary">Pick the directory to use as your RelayHQ vault root.</p>
              </div>
              <button
                type="button"
                onClick={() => { setPickerTarget(null); setDirectoryBrowser(null) }}
                className="rounded-md p-2 text-text-secondary transition-colors hover:bg-surface-secondary hover:text-text-primary"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="border-b border-border bg-surface-secondary px-5 py-3">
              <div className="mb-2 flex items-center gap-2">
                <button
                  type="button"
                  disabled={!directoryBrowser.parentPath || isBrowsingDirectories}
                  onClick={() => void openDirectoryPicker(pickerTarget, directoryBrowser.parentPath ?? undefined)}
                  className="inline-flex items-center gap-1 rounded-md border border-border bg-surface px-3 py-1.5 text-sm font-medium text-text-secondary transition-colors hover:bg-surface-secondary hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <ChevronLeft className="h-4 w-4" />
                  Up
                </button>
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
                      <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-emerald-700">
                        vault
                      </span>
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
                <button
                  type="button"
                  onClick={() => { setPickerTarget(null); setDirectoryBrowser(null) }}
                  className="rounded-md border border-border bg-surface px-4 py-2 text-sm font-medium text-text-secondary transition-colors hover:bg-surface-secondary hover:text-text-primary"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => selectDirectory(directoryBrowser.currentPath)}
                  className="inline-flex items-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent/90"
                >
                  Use this folder <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
