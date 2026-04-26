import { useEffect, useState } from 'react'

import { FilePlus2, Shield } from 'lucide-react'

import { relayhqApi } from '../api/client'
import { useAppStore } from '../store/appStore'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Dialog, DialogBody, DialogContent, DialogHeader, DialogOverlay, DialogPanel, DialogTitle } from '../components/ui/dialog'
import { Input } from '../components/ui/input'
import { Select } from '../components/ui/select'
import { Textarea } from '../components/ui/textarea'

const DOC_TEMPLATES: Record<string, string> = {
  brief: '## Objective\n\n## Background\n\n## Success Metrics\n',
  plan: '## Phases\n\n## Timeline\n',
  'meeting-minutes': '## Attendees\n\n## Decisions\n\n## Action Items\n',
  budget: '## Line Items\n\n- Item | Cost | Owner\n',
  sop: '## Steps\n\n1.\n2.\n3.\n',
  policy: '## Scope\n\n## Rules\n',
}

export function DocsView() {
  const projects = useAppStore(state => state.projects)
  const [docs, setDocs] = useState<Array<any>>([])
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null)
  const [isNewDocOpen, setIsNewDocOpen] = useState(false)
  const [docType, setDocType] = useState('brief')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState(DOC_TEMPLATES.brief)
  const [visibility, setVisibility] = useState('project')
  const [accessRoles, setAccessRoles] = useState('all')
  const [sensitive, setSensitive] = useState(false)
  const [detail, setDetail] = useState<any | null>(null)

  async function loadDocs() {
    const response = await relayhqApi.listDocs()
    setDocs(response.data as Array<any>)
  }

  useEffect(() => {
    void loadDocs()
  }, [])

  useEffect(() => {
    if (!selectedDocId) return
    void relayhqApi.getDoc(selectedDocId).then(response => setDetail(response.data))
  }, [selectedDocId])

  async function createDoc() {
    await relayhqApi.createDoc({
      title,
      doc_type: docType,
      project_id: projects[0]?.id ?? null,
      visibility,
      access_roles: accessRoles.split(/\r?\n|,/).map(item => item.trim()).filter(Boolean),
      sensitive,
      body,
    })
    setIsNewDocOpen(false)
    await loadDocs()
  }

  async function saveAccess() {
    if (!detail) return
    const response = await relayhqApi.patchDoc(detail.id, { patch: { visibility, access_roles: accessRoles.split(/\r?\n|,/).map(item => item.trim()).filter(Boolean), sensitive } })
    setDetail({ ...detail, ...response.data })
    await loadDocs()
  }

  return (
    <div className="flex min-h-full gap-6">
      <div className="flex min-w-[320px] flex-1 flex-col gap-4 rounded-xl border border-border bg-surface p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-text-primary">Docs</h1>
            <p className="text-sm text-text-secondary">Project docs and knowledge records</p>
          </div>
          <Button type="button" onClick={() => setIsNewDocOpen(true)}><FilePlus2 className="h-4 w-4" /> New Document</Button>
        </div>
        <div className="grid gap-3">
          {docs.map(doc => (
            <button key={doc.id} type="button" onClick={() => setSelectedDocId(doc.id)} className="rounded-xl border border-border bg-surface-secondary p-4 text-left hover:bg-surface">
              <div className="mb-2 flex items-center gap-2">
                <Badge variant="secondary">{doc.doc_type}</Badge>
                {doc.sensitive && <Badge variant="danger">sensitive</Badge>}
              </div>
              <div className="text-sm font-semibold text-text-primary">{doc.title}</div>
              <div className="text-xs text-text-tertiary">{doc.visibility}</div>
            </button>
          ))}
        </div>
      </div>

      <div className="w-[420px] shrink-0 rounded-xl border border-border bg-surface p-4">
        {detail ? (
          <div className="flex flex-col gap-4">
            <div>
              <div className="mb-2 flex items-center gap-2"><Badge variant="secondary">{detail.doc_type}</Badge>{detail.sensitive && <Badge variant="danger">sensitive</Badge>}</div>
              <h2 className="text-xl font-semibold text-text-primary">{detail.title}</h2>
              <p className="mt-2 whitespace-pre-wrap text-sm text-text-secondary">{detail.body}</p>
            </div>

            <div className="rounded-xl border border-border bg-surface-secondary p-4">
              <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-text-primary"><Shield className="h-4 w-4" /> Access Settings</div>
              <div className="space-y-3">
                <label className="flex flex-col gap-1.5 text-sm text-text-secondary">Visibility<Select value={visibility} onChange={event => setVisibility(event.target.value)}><option value="project">Project</option><option value="workspace">Workspace</option><option value="private">Private</option></Select></label>
                <label className="flex flex-col gap-1.5 text-sm text-text-secondary">Roles<Textarea value={accessRoles} onChange={event => setAccessRoles(event.target.value)} rows={3} /></label>
                <label className="flex items-center gap-2 text-sm text-text-secondary"><input type="checkbox" checked={sensitive} onChange={event => setSensitive(event.target.checked)} /> Sensitive document</label>
                <Button type="button" onClick={() => void saveAccess()}>Save access</Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="text-sm text-text-tertiary">Select a document to inspect its content and access settings.</div>
        )}
      </div>

      {isNewDocOpen && (
        <Dialog open>
          <DialogOverlay onClick={() => setIsNewDocOpen(false)} />
          <DialogContent>
            <DialogPanel className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>New document</DialogTitle>
                <Button variant="ghost" size="icon" onClick={() => setIsNewDocOpen(false)}>x</Button>
              </DialogHeader>
              <DialogBody>
                <div className="flex flex-col gap-4">
                  <label className="flex flex-col gap-1.5 text-sm text-text-secondary">Type<Select value={docType} onChange={event => { const next = event.target.value; setDocType(next); setBody(DOC_TEMPLATES[next] ?? '') }}><option value="brief">Brief</option><option value="plan">Plan</option><option value="meeting-minutes">Meeting Minutes</option><option value="budget">Budget</option><option value="sop">SOP</option><option value="policy">Policy</option></Select></label>
                  <label className="flex flex-col gap-1.5 text-sm text-text-secondary">Title<Input value={title} onChange={event => setTitle(event.target.value)} /></label>
                  <label className="flex flex-col gap-1.5 text-sm text-text-secondary">Access<Select value={visibility} onChange={event => setVisibility(event.target.value)}><option value="project">Project</option><option value="workspace">Workspace</option><option value="private">Private</option></Select></label>
                  <label className="flex flex-col gap-1.5 text-sm text-text-secondary">Roles<Input value={accessRoles} onChange={event => setAccessRoles(event.target.value)} /></label>
                  <label className="flex items-center gap-2 text-sm text-text-secondary"><input type="checkbox" checked={sensitive} onChange={event => setSensitive(event.target.checked)} /> Sensitive document</label>
                  <label className="flex flex-col gap-1.5 text-sm text-text-secondary">Body<Textarea value={body} onChange={event => setBody(event.target.value)} rows={14} /></label>
                  <div className="flex justify-end gap-2">
                    <Button type="button" variant="outline" onClick={() => setIsNewDocOpen(false)}>Cancel</Button>
                    <Button type="button" onClick={() => void createDoc()}>Create</Button>
                  </div>
                </div>
              </DialogBody>
            </DialogPanel>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}
