const SELECTED_PROJECT_STORAGE_KEY = 'relayhq-selected-project-id'

export function loadSelectedProjectId(): string | null {
  if (typeof window === 'undefined') return null

  try {
    const value = window.localStorage.getItem(SELECTED_PROJECT_STORAGE_KEY)
    return value && value.trim().length > 0 ? value : null
  } catch {
    return null
  }
}

export function persistSelectedProjectId(projectId: string | null) {
  if (typeof window === 'undefined') return

  try {
    if (projectId) {
      window.localStorage.setItem(SELECTED_PROJECT_STORAGE_KEY, projectId)
      return
    }

    window.localStorage.removeItem(SELECTED_PROJECT_STORAGE_KEY)
  } catch {
    /* ignore */
  }
}

export function resolvePersistedSelectedProjectId(
  selectedProjectId: string | null,
  availableProjectIds: ReadonlyArray<string>,
): string | null {
  if (selectedProjectId && availableProjectIds.includes(selectedProjectId)) {
    return selectedProjectId
  }

  return null
}
