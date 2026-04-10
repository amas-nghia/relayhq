import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from 'react'
import {
  emptyDraft,
  fetchProjects,
  getErrorMessage as getProjectErrorMessage,
  projectsEndpoint,
  type Project,
  type ProjectDraft,
} from './projectRegistry'
import {
  createTask,
  emptyTaskDraft,
  fetchTasks,
  getErrorMessage as getTaskErrorMessage,
  taskStatuses,
  type Task,
  type TaskDraft,
  updateTaskStatus,
} from './taskBoard'

export default function App() {
  const [projects, setProjects] = useState<Project[]>([])
  const [projectsLoading, setProjectsLoading] = useState(true)
  const [projectsError, setProjectsError] = useState<string | null>(null)
  const [projectDraft, setProjectDraft] = useState<ProjectDraft>(emptyDraft)
  const [projectSubmitting, setProjectSubmitting] = useState(false)
  const [projectSubmitError, setProjectSubmitError] = useState<string | null>(null)

  const [selectedProjectId, setSelectedProjectId] = useState('')
  const [tasks, setTasks] = useState<Task[]>([])
  const [tasksLoading, setTasksLoading] = useState(false)
  const [tasksError, setTasksError] = useState<string | null>(null)
  const [taskDraft, setTaskDraft] = useState<TaskDraft>(emptyTaskDraft)
  const [taskSubmitting, setTaskSubmitting] = useState(false)
  const [taskSubmitError, setTaskSubmitError] = useState<string | null>(null)

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === selectedProjectId) ?? null,
    [projects, selectedProjectId],
  )

  async function loadProjects() {
    setProjectsLoading(true)
    setProjectsError(null)

      try {
        const nextProjects = await fetchProjects()
        setProjects(nextProjects)

        if (!selectedProjectId && nextProjects[0]?.id) {
          const nextProjectId = String(nextProjects[0].id)
          setSelectedProjectId(nextProjectId)
          setTaskDraft((current) => ({ ...current, project_id: nextProjectId }))
        }
      } catch (error_) {
        setProjectsError(getProjectErrorMessage(error_))
      } finally {
      setProjectsLoading(false)
    }
  }

  async function loadTasks(projectId: string) {
    if (!projectId) {
      setTasks([])
      return
    }

    setTasksLoading(true)
    setTasksError(null)

    try {
      const nextTasks = await fetchTasks(projectId)
      setTasks(nextTasks)
    } catch (error_) {
      setTasksError(getTaskErrorMessage(error_))
    } finally {
      setTasksLoading(false)
    }
  }

  useEffect(() => {
    let ignore = false

    async function start() {
      setProjectsLoading(true)
      setProjectsError(null)

      try {
        const nextProjects = await fetchProjects()

        if (ignore) {
          return
        }

        setProjects(nextProjects)

        const initialProjectId = nextProjects[0]?.id ? String(nextProjects[0].id) : ''
        setSelectedProjectId(initialProjectId)
        setTaskDraft((current) => ({ ...current, project_id: initialProjectId }))

      } catch (error_) {
        if (!ignore) {
          setProjectsError(getProjectErrorMessage(error_))
        }
      } finally {
        if (!ignore) {
          setProjectsLoading(false)
          setTasksLoading(false)
        }
      }
    }

    void start()

    return () => {
      ignore = true
    }
  }, [])

  useEffect(() => {
    if (selectedProjectId) {
      void loadTasks(selectedProjectId)
    }
  }, [selectedProjectId])

  function updateProjectField(field: keyof ProjectDraft) {
    return (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setProjectDraft((current) => ({
        ...current,
        [field]: event.currentTarget.value,
      }))
    }
  }

  function updateTaskField(field: keyof TaskDraft) {
    return (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
      setTaskDraft((current) => ({
        ...current,
        [field]: event.currentTarget.value,
      }))
    }
  }

  async function handleProjectSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setProjectSubmitting(true)
    setProjectSubmitError(null)

    try {
      const response = await fetch(projectsEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(projectDraft),
      })

      if (!response.ok) {
        throw new Error(`POST ${projectsEndpoint} failed (${response.status})`)
      }

      setProjectDraft(emptyDraft)
      await loadProjects()
    } catch (error_) {
      setProjectSubmitError(getProjectErrorMessage(error_))
    } finally {
      setProjectSubmitting(false)
    }
  }

  async function handleTaskSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const projectId = taskDraft.project_id || selectedProjectId

    if (!projectId) {
      setTaskSubmitError('Choose a project first.')
      return
    }

    setTaskSubmitting(true)
    setTaskSubmitError(null)

    try {
      await createTask({ ...taskDraft, project_id: projectId })
      setTaskDraft((current) => ({
        ...emptyTaskDraft,
        project_id: projectId,
      }))
      await loadTasks(projectId)
    } catch (error_) {
      setTaskSubmitError(getTaskErrorMessage(error_))
    } finally {
      setTaskSubmitting(false)
    }
  }

  async function handleTaskStatusChange(taskId: string, status: Task['status']) {
    try {
      await updateTaskStatus(taskId, status)
      await loadTasks(selectedProjectId)
    } catch (error_) {
      setTasksError(getTaskErrorMessage(error_))
    }
  }

  function handleProjectSelection(event: ChangeEvent<HTMLSelectElement>) {
    const nextProjectId = event.currentTarget.value
    setSelectedProjectId(nextProjectId)
    setTaskDraft((current) => ({
      ...current,
      project_id: nextProjectId,
    }))
  }

  return (
    <main className="page">
      <section className="hero">
        <p className="eyebrow">RelayHQ</p>
        <h1>Project Registry + Task Board</h1>
        <p className="lede">
          Track projects, create tasks, and move work through basic status updates in one control plane.
        </p>
      </section>

      <section className="layout" aria-label="RelayHQ workspace">
        <form className="card form-card" onSubmit={handleProjectSubmit}>
          <div className="panel-header">
            <div>
              <p className="section-kicker">Project registry</p>
              <h2>Create project</h2>
            </div>
          </div>

          {projectSubmitError ? (
            <p className="status status-error" role="alert">
              {projectSubmitError}
            </p>
          ) : null}

          <label className="field">
            <span>Name</span>
            <input name="name" value={projectDraft.name} onChange={updateProjectField('name')} required autoComplete="off" />
          </label>

          <label className="field">
            <span>Summary</span>
            <textarea name="summary" value={projectDraft.summary} onChange={updateProjectField('summary')} rows={4} />
          </label>

          <label className="field">
            <span>Owner</span>
            <input name="owner" value={projectDraft.owner} onChange={updateProjectField('owner')} required autoComplete="off" />
          </label>

          <button className="primary-button" type="submit" disabled={projectSubmitting}>
            {projectSubmitting ? 'Creating…' : 'Create project'}
          </button>

          <div className="spacer" />

          <div className="panel-header">
            <div>
              <p className="section-kicker">Registry</p>
              <h2>Projects</h2>
            </div>
            <button className="secondary-button" type="button" onClick={() => void loadProjects()} disabled={projectsLoading}>
              Refresh
            </button>
          </div>

          {projectsLoading ? (
            <div className="status">Loading projects…</div>
          ) : projectsError ? (
            <div className="status status-error" role="alert">
              <p>{projectsError}</p>
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
        </form>

        <section className="card panel" aria-live="polite">
          <div className="panel-header">
            <div>
              <p className="section-kicker">Task board</p>
              <h2>Tasks</h2>
            </div>
          </div>

          {projects.length === 0 ? (
            <div className="status">
              <p>Create a project first to unlock the task board.</p>
            </div>
          ) : (
            <>
              <label className="field">
                <span>Project</span>
                <select value={selectedProjectId} onChange={handleProjectSelection}>
                  <option value="">Choose a project</option>
                  {projects.map((project) => (
                    <option key={String(project.id)} value={String(project.id)}>
                      {project.name}
                    </option>
                  ))}
                </select>
              </label>

              <form className="task-form" onSubmit={handleTaskSubmit}>
                {taskSubmitError ? (
                  <p className="status status-error" role="alert">
                    {taskSubmitError}
                  </p>
                ) : null}

                <label className="field">
                  <span>Title</span>
                  <input name="title" value={taskDraft.title} onChange={updateTaskField('title')} required autoComplete="off" />
                </label>

                <label className="field">
                  <span>Details</span>
                  <textarea name="details" value={taskDraft.details} onChange={updateTaskField('details')} rows={4} />
                </label>

                <label className="field">
                  <span>Status</span>
                  <select name="status" value={taskDraft.status} onChange={updateTaskField('status')}>
                    {taskStatuses.map((status) => (
                      <option key={status} value={status}>
                        {status}
                      </option>
                    ))}
                  </select>
                </label>

                <button
                  className="primary-button"
                  type="submit"
                  disabled={taskSubmitting || !selectedProjectId}
                >
                  {taskSubmitting ? 'Creating…' : 'Create task'}
                </button>
              </form>

              <div className="panel-header tasks-header">
                <div>
                  <p className="section-kicker">List</p>
                  <h2>{selectedProject ? `${selectedProject.name} tasks` : 'Project tasks'}</h2>
                </div>
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => void loadTasks(selectedProjectId)}
                  disabled={tasksLoading || !selectedProjectId}
                >
                  Refresh
                </button>
              </div>

              {tasksLoading ? (
                <div className="status">Loading tasks…</div>
              ) : tasksError ? (
                <div className="status status-error" role="alert">
                  <p>{tasksError}</p>
                  <button className="secondary-button" type="button" onClick={() => void loadTasks(selectedProjectId)}>
                    Try again
                  </button>
                </div>
              ) : tasks.length === 0 ? (
                <div className="status">
                  <p>No tasks yet for this project.</p>
                  <p>Create the first task above.</p>
                </div>
              ) : (
                <ul className="task-list">
                  {tasks.map((task, index) => (
                    <li className="task-item" key={task.id ?? `${task.title}-${index}`}>
                      <div className="task-topline">
                        <div>
                          <h3>{task.title}</h3>
                          <p>{task.details?.trim() ? task.details : 'No details provided.'}</p>
                        </div>
                        <span className="task-status">{task.status}</span>
                      </div>

                      <div className="task-actions">
                        <label className="field field-inline">
                          <span>Status</span>
                          <select
                            value={task.status}
                            onChange={(event) => {
                              void handleTaskStatusChange(String(task.id), event.currentTarget.value as Task['status'])
                            }}
                          >
                            {taskStatuses.map((status) => (
                              <option key={status} value={status}>
                                {status}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </section>
      </section>
    </main>
  )
}
