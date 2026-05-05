import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'

import { FilePlus2, Save } from 'lucide-react'

import { relayhqApi, type RelayHQSkillRecord } from '../api/client'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Textarea } from '../components/ui/textarea'
import { useAppStore } from '../store/appStore'

function emptyForm() {
  return {
    name: '',
    version: '1.0.0',
    description: '',
    requiresText: '',
    taskTypesText: '',
    appliesToTagsText: '',
    content: '## Purpose\n\n## Guidance\n',
  }
}

function listToText(values: ReadonlyArray<string>) {
  return values.join('\n')
}

function textToList(value: string) {
  return [...new Set(value.split(/\r?\n|,/).map((entry) => entry.trim()).filter(Boolean))]
}

function fileNameFromPath(path: string) {
  const normalized = path.replace(/\\/g, '/')
  const segments = normalized.split('/')
  return segments[segments.length - 1] ?? path
}

function toLookupKey(value: string) {
  return value.trim().toLowerCase().replace(/\\/g, '/')
}

function skillUsageCount(skill: RelayHQSkillRecord, agents: ReturnType<typeof useAppStore.getState>['agents']) {
  const keys = new Set([
    toLookupKey(skill.sourcePath),
    toLookupKey(fileNameFromPath(skill.sourcePath)),
    toLookupKey(skill.name),
  ])

  return agents.filter((agent) => {
    const assigned = [agent.skillFile ?? '', ...(agent.skillFiles ?? [])].map(toLookupKey)
    return assigned.some((entry) => keys.has(entry))
  }).length
}

export function SkillsView() {
  const agents = useAppStore(state => state.agents)
  const contentTextareaRef = useRef<HTMLTextAreaElement | null>(null)
  const [skills, setSkills] = useState<ReadonlyArray<RelayHQSkillRecord>>([])
  const [skillDir, setSkillDir] = useState('')
  const [selectedSourcePath, setSelectedSourcePath] = useState<string | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [form, setForm] = useState(emptyForm())
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)

  const selectedSkill = useMemo(
    () => skills.find((skill) => skill.sourcePath === selectedSourcePath) ?? null,
    [selectedSourcePath, skills],
  )

  async function loadSkills(preferredSourcePath?: string | null) {
    const response = await relayhqApi.listSkills()
    setSkills(response.skills)
    setSkillDir(response.skillDir)

    const nextSelection = preferredSourcePath
      ?? selectedSourcePath
      ?? response.skills[0]?.sourcePath
      ?? null

    setSelectedSourcePath(nextSelection)
    if (!isCreating && nextSelection) {
      const nextSkill = response.skills.find((skill) => skill.sourcePath === nextSelection) ?? null
      if (nextSkill) {
        setForm({
          name: nextSkill.name,
          version: nextSkill.version,
          description: nextSkill.description,
          requiresText: listToText(nextSkill.requires),
          taskTypesText: listToText(nextSkill.taskTypes),
          appliesToTagsText: listToText(nextSkill.appliesToTags),
          content: nextSkill.content,
        })
      }
    }
  }

  useEffect(() => {
    void loadSkills().catch((loadError) => {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load skills.')
    })
  }, [])

  useEffect(() => {
    if (isCreating || !selectedSkill) return

    setForm({
      name: selectedSkill.name,
      version: selectedSkill.version,
      description: selectedSkill.description,
      requiresText: listToText(selectedSkill.requires),
      taskTypesText: listToText(selectedSkill.taskTypes),
      appliesToTagsText: listToText(selectedSkill.appliesToTags),
      content: selectedSkill.content,
    })
  }, [isCreating, selectedSkill])

  useLayoutEffect(() => {
    const textarea = contentTextareaRef.current
    if (!textarea) return

    textarea.style.height = 'auto'
    textarea.style.height = `${textarea.scrollHeight}px`
  }, [form.content])

  async function handleSave() {
    setStatus('saving')
    setError(null)

    try {
      const response = await relayhqApi.saveSkill({
        name: form.name,
        version: form.version,
        description: form.description,
        requires: textToList(form.requiresText),
        taskTypes: textToList(form.taskTypesText),
        appliesToTags: textToList(form.appliesToTagsText),
        content: form.content,
        sourcePath: isCreating ? null : selectedSourcePath,
      })

      setIsCreating(false)
      setStatus('saved')
      await loadSkills(response.skill.sourcePath)
      window.setTimeout(() => setStatus('idle'), 1800)
    } catch (saveError) {
      setStatus('error')
      setError(saveError instanceof Error ? saveError.message : 'Unable to save skill.')
    }
  }

  function handleNewSkill() {
    setIsCreating(true)
    setSelectedSourcePath(null)
    setStatus('idle')
    setError(null)
    setForm(emptyForm())
  }

  function handleSelectSkill(skill: RelayHQSkillRecord) {
    setIsCreating(false)
    setSelectedSourcePath(skill.sourcePath)
    setStatus('idle')
    setError(null)
  }

  return (
    <div className="flex h-full min-h-0 gap-6 overflow-hidden">
      <div className="flex min-h-0 min-w-[320px] max-w-[380px] flex-1 flex-col gap-4 overflow-hidden rounded-xl border border-border bg-surface p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-text-primary">Skills</h1>
            <p className="text-sm text-text-secondary">Manage the skill files agents can load into their runtime context.</p>
            {skillDir ? <p className="mt-2 text-xs text-text-tertiary break-all">{skillDir}</p> : null}
          </div>
          <Button type="button" onClick={handleNewSkill}><FilePlus2 className="h-4 w-4" /> New Skill</Button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          <div className="grid gap-3">
            {skills.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border bg-surface-secondary p-4 text-sm text-text-tertiary">
                No skills installed yet. Create the first one here and it will become selectable for agent setup.
              </div>
            ) : skills.map((skill) => {
              const usage = skillUsageCount(skill, agents)
              const isActive = !isCreating && selectedSourcePath === skill.sourcePath
              return (
                <button
                  key={skill.sourcePath}
                  type="button"
                  onClick={() => handleSelectSkill(skill)}
                  className={`rounded-xl border p-4 text-left transition-colors ${isActive ? 'border-brand bg-brand-muted' : 'border-border bg-surface-secondary hover:bg-surface'}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm font-semibold text-text-primary">{skill.name}</div>
                    <Badge variant="secondary">v{skill.version}</Badge>
                  </div>
                  <p className="mt-2 text-xs text-text-secondary">{skill.description}</p>
                  <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-text-tertiary">
                    <span>{usage} agent{usage === 1 ? '' : 's'} using it</span>
                    <span>{skill.taskTypes.length} task type{skill.taskTypes.length === 1 ? '' : 's'}</span>
                    <span>{skill.appliesToTags.length} tag match{skill.appliesToTags.length === 1 ? '' : 'es'}</span>
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      </div>

      <div className="flex min-h-0 min-w-0 flex-[1.6] flex-col overflow-hidden rounded-xl border border-border bg-surface p-4">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-text-primary">{isCreating ? 'New Skill' : selectedSkill?.name ?? 'Skill editor'}</h2>
            <p className="text-sm text-text-secondary">Edit the metadata and instructions that agents can attach to their context.</p>
          </div>
          <Button type="button" onClick={() => void handleSave()} disabled={status === 'saving'}>
            <Save className="h-4 w-4" /> {status === 'saving' ? 'Saving…' : 'Save Skill'}
          </Button>
        </div>

        {error ? (
          <div className="mb-4 rounded-lg border border-status-blocked/40 bg-status-blocked/5 px-3 py-2 text-sm text-status-blocked">
            {error}
          </div>
        ) : null}

        {status === 'saved' ? (
          <div className="mb-4 rounded-lg border border-status-done/40 bg-status-done/5 px-3 py-2 text-sm text-status-done">
            Skill saved.
          </div>
        ) : null}

        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          <div className="grid gap-4">
            <div className="grid gap-4 md:grid-cols-2">
              <label className="flex flex-col gap-1.5 text-sm text-text-secondary">
                Name
                <Input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} placeholder="backend-testing" />
              </label>
              <label className="flex flex-col gap-1.5 text-sm text-text-secondary">
                Version
                <Input value={form.version} onChange={(event) => setForm((current) => ({ ...current, version: event.target.value }))} placeholder="1.0.0" />
              </label>
            </div>

            <label className="flex flex-col gap-1.5 text-sm text-text-secondary">
              Description
              <Input value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} placeholder="Production-safe backend testing guidance" />
            </label>

            <div className="grid gap-4 md:grid-cols-3">
              <label className="flex flex-col gap-1.5 text-sm text-text-secondary">
                Requires
                <Textarea value={form.requiresText} onChange={(event) => setForm((current) => ({ ...current, requiresText: event.target.value }))} rows={5} placeholder="verification-loop" />
              </label>
              <label className="flex flex-col gap-1.5 text-sm text-text-secondary">
                Task Types
                <Textarea value={form.taskTypesText} onChange={(event) => setForm((current) => ({ ...current, taskTypesText: event.target.value }))} rows={5} placeholder="bug-fix\nfeature-implementation" />
              </label>
              <label className="flex flex-col gap-1.5 text-sm text-text-secondary">
                Applies To Tags
                <Textarea value={form.appliesToTagsText} onChange={(event) => setForm((current) => ({ ...current, appliesToTagsText: event.target.value }))} rows={5} placeholder="backend\napi" />
              </label>
            </div>

            <label className="flex min-h-[320px] flex-col gap-1.5 text-sm text-text-secondary">
              Skill Content
              <Textarea
                ref={contentTextareaRef}
                value={form.content}
                onChange={(event) => {
                  setForm((current) => ({ ...current, content: event.target.value }))
                }}
                rows={18}
                className="min-h-[320px] resize-none overflow-hidden font-mono text-xs"
                placeholder="## Purpose\n\nExplain how the agent should use this skill."
              />
            </label>
          </div>
        </div>
      </div>
    </div>
  )
}
