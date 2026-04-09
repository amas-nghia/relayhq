import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react'
import {
  emptyDraft,
  fetchProjects,
  getErrorMessage,
  projectsEndpoint,
  type Project,
  type ProjectDraft,
} from './projectRegistry'

export default function App() {
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState<ProjectDraft>(emptyDraft)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  async function loadProjects() {
    setLoading(true)
    setError(null)

    try {
      const nextProjects = await fetchProjects()
      setProjects(nextProjects)
    } catch (error_) {
      setError(getErrorMessage(error_))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    let ignore = false

    async function start() {
      setLoading(true)
      setError(null)

      try {
        const nextProjects = await fetchProjects()

        if (!ignore) {
          setProjects(nextProjects)
        }
      } catch (error_) {
        if (!ignore) {
          setError(getErrorMessage(error_))
        }
      } finally {
        if (!ignore) {
          setLoading(false)
        }
      }
    }

    void start()

    return () => {
      ignore = true
    }
  }, [])

  function updateField(field: keyof ProjectDraft) {
    return (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setDraft((current: ProjectDraft) => ({
        ...current,
        [field]: event.currentTarget.value,
      }))
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitting(true)
    setSubmitError(null)

    try {
      const response = await fetch(projectsEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(draft),
      })

      if (!response.ok) {
        throw new Error(`POST ${projectsEndpoint} failed (${response.status})`)
      }

      setDraft(emptyDraft)
      await loadProjects()
    } catch (error_) {
      setSubmitError(getErrorMessage(error_))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="page">
      <section className="hero">
        <p className="eyebrow">RelayHQ</p>
        <h1>Project Registry</h1>
        <p className="lede">Create projects and keep the current list in sync with the backend.</p>
      </section>

      <section className="layout" aria-label="Project registry">
        <form className="card form-card" onSubmit={handleSubmit}>
          <div className="panel-header">
            <div>
              <p className="section-kicker">Create project</p>
              <h2>New project</h2>
            </div>
          </div>

          {submitError ? (
            <p className="status status-error" role="alert">
              {submitError}
            </p>
          ) : null}

          <label className="field">
            <span>Name</span>
            <input
              name="name"
              value={draft.name}
              onChange={updateField('name')}
              required
              autoComplete="off"
            />
          </label>

          <label className="field">
            <span>Summary</span>
            <textarea
              name="summary"
              value={draft.summary}
              onChange={updateField('summary')}
              rows={4}
            />
          </label>

          <label className="field">
            <span>Owner</span>
            <input
              name="owner"
              value={draft.owner}
              onChange={updateField('owner')}
              required
              autoComplete="off"
            />
          </label>

          <button className="primary-button" type="submit" disabled={submitting}>
            {submitting ? 'Creating…' : 'Create project'}
          </button>
        </form>

        <section className="card panel" aria-live="polite" aria-busy={loading}>
          <div className="panel-header">
            <div>
              <p className="section-kicker">Registry</p>
              <h2>Projects</h2>
            </div>
            <button className="secondary-button" type="button" onClick={() => void loadProjects()} disabled={loading}>
              Refresh
            </button>
          </div>

          {loading ? (
            <div className="status">Loading projects…</div>
          ) : error ? (
            <div className="status status-error" role="alert">
              <p>{error}</p>
              <button className="secondary-button" type="button" onClick={() => void loadProjects()}>
                Try again
              </button>
            </div>
          ) : projects.length === 0 ? (
            <div className="status">
              <p>No projects yet.</p>
              <p>Add the first one using the form.</p>
            </div>
          ) : (
            <ul className="project-list">
              {projects.map((project, index) => (
                <li className="project-item" key={project.id ?? `${project.name}-${index}`}>
                  <div className="project-topline">
                    <h3>{project.name}</h3>
                    <span className="project-owner">{project.owner}</span>
                  </div>
                  <p>{project.summary?.trim() ? project.summary : 'No summary provided.'}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </section>
    </main>
  )
}
