import { useEffect, useState } from 'react'
import { X } from 'lucide-react'

import { relayhqApi, type RelayHQBrowseDirectoriesResponse, type RelayHQWebhookEvent } from '../../api/client'
import type { Project } from '../../types'
import { Button } from '../ui/button'
import { Dialog, DialogBody, DialogContent, DialogHeader, DialogOverlay, DialogPanel, DialogTitle } from '../ui/dialog'
import { Input } from '../ui/input'

const WEBHOOK_EVENTS: ReadonlyArray<{ value: RelayHQWebhookEvent; label: string }> = [
  { value: 'task.claimed', label: 'Claimed' },
  { value: 'task.done', label: 'Done' },
  { value: 'task.blocked', label: 'Blocked' },
  { value: 'task.waiting-approval', label: 'Waiting approval' },
]

export function ProjectSettingsDialog({
  open,
  project,
  vaultPath,
  onClose,
  onSaved,
}: {
  open: boolean
  project: Project | null
  vaultPath: string
  onClose: () => void
  onSaved: () => Promise<void>
}) {
  const [projectName, setProjectName] = useState('')
  const [codebaseRoot, setCodebaseRoot] = useState('')
  const [confirmDelete, setConfirmDelete] = useState('')
  const [directoryBrowser, setDirectoryBrowser] = useState<RelayHQBrowseDirectoriesResponse | null>(null)
  const [isBrowsingDirectories, setIsBrowsingDirectories] = useState(false)
  const [webhooks, setWebhooks] = useState<Array<{ id?: string; url: string; events: RelayHQWebhookEvent[] }>>([])
  const [isLoadingWebhooks, setIsLoadingWebhooks] = useState(false)
  const [isSavingWebhooks, setIsSavingWebhooks] = useState(false)
  const [testingWebhookIndex, setTestingWebhookIndex] = useState<number | null>(null)

  useEffect(() => {
    if (!project) return
    setProjectName(project.name)
    setCodebaseRoot(project.codebaseRoot ?? '')
    setConfirmDelete('')
  }, [project])

  useEffect(() => {
    if (!open) return
    setIsLoadingWebhooks(true)
    void relayhqApi.getWebhookSettings()
      .then(response => setWebhooks(response.webhooks.map(webhook => ({ id: webhook.id, url: webhook.url, events: [...webhook.events] }))))
      .finally(() => setIsLoadingWebhooks(false))
  }, [open])

  async function openDirectoryPicker(path?: string) {
    setIsBrowsingDirectories(true)
    try {
      const browser = await relayhqApi.browseDirectories(path ?? codebaseRoot ?? vaultPath)
      setDirectoryBrowser(browser)
    } finally {
      setIsBrowsingDirectories(false)
    }
  }

  async function saveProjectSettings() {
    if (!project) return
    setIsSavingWebhooks(true)
    try {
      await relayhqApi.patchProject(project.id, {
        patch: {
          name: projectName,
          codebase_root: codebaseRoot || null,
        },
      })
      await relayhqApi.saveWebhookSettings({ webhooks })
      await onSaved()
      onClose()
    } finally {
      setIsSavingWebhooks(false)
    }
  }

  async function removeProject() {
    if (!project || confirmDelete !== project.name) return
    await relayhqApi.deleteProject(project.id)
    await onSaved()
    onClose()
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
    const events = webhook.events.includes(event) ? webhook.events.filter(entry => entry !== event) : [...webhook.events, event]
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

  if (!open || !project) return null

  return (
    <>
      <Dialog open>
        <DialogOverlay />
        <DialogContent>
          <DialogPanel className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Project settings</DialogTitle>
              <Button variant="ghost" size="icon" onClick={onClose}>
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
                  <Input value={vaultPath} readOnly />
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
                    Type {project.name} to confirm deletion
                    <Input value={confirmDelete} onChange={event => setConfirmDelete(event.target.value)} />
                  </label>
                  <Button type="button" className="mt-3 bg-status-blocked text-white hover:bg-status-blocked/90" onClick={() => void removeProject()} disabled={confirmDelete !== project.name}>
                    Delete project
                  </Button>
                </div>
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
                  <Button type="button" onClick={() => void saveProjectSettings()} disabled={isSavingWebhooks}>{isSavingWebhooks ? 'Saving…' : 'Save'}</Button>
                </div>
              </div>
            </DialogBody>
          </DialogPanel>
        </DialogContent>
      </Dialog>

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
    </>
  )
}
