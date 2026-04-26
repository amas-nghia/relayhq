import { useState } from 'react'
import { X } from 'lucide-react'

import { relayhqApi } from '../../api/client'
import { Button } from '../ui/button'
import { Dialog, DialogBody, DialogContent, DialogHeader, DialogOverlay, DialogPanel, DialogTitle } from '../ui/dialog'
import { Input } from '../ui/input'

export function NewProjectDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean
  onClose: () => void
  onCreated: (projectId: string) => Promise<void>
}) {
  const [name, setName] = useState('')
  const [codebaseRoot, setCodebaseRoot] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  async function createProject() {
    if (name.trim().length === 0) return
    setIsSaving(true)
    try {
      const result = await relayhqApi.createProject({
        name,
        codebaseRoot: codebaseRoot.trim().length > 0 ? codebaseRoot.trim() : null,
      })
      await onCreated(result.project.id)
      setName('')
      setCodebaseRoot('')
      onClose()
    } finally {
      setIsSaving(false)
    }
  }

  if (!open) return null

  return (
    <Dialog open>
      <DialogOverlay onClick={onClose} />
      <DialogContent>
        <DialogPanel className="max-w-lg">
          <DialogHeader>
            <DialogTitle>New project</DialogTitle>
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </DialogHeader>
          <DialogBody>
            <div className="flex flex-col gap-4">
              <label className="flex flex-col gap-1.5 text-sm text-text-secondary">
                Project name
                <Input value={name} onChange={event => setName(event.target.value)} placeholder="RelayHQ" />
              </label>
              <label className="flex flex-col gap-1.5 text-sm text-text-secondary">
                Codebase path
                <Input value={codebaseRoot} onChange={event => setCodebaseRoot(event.target.value)} placeholder="/path/to/repo" />
              </label>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
                <Button type="button" onClick={() => void createProject()} disabled={isSaving || name.trim().length === 0}>{isSaving ? 'Creating…' : 'Create'}</Button>
              </div>
            </div>
          </DialogBody>
        </DialogPanel>
      </DialogContent>
    </Dialog>
  )
}
