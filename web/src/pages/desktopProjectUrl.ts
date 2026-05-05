export type DesktopProjectParamResolution =
  | { state: 'missing'; projectId: null }
  | { state: 'valid'; projectId: string }
  | { state: 'unresolved'; projectId: string }

export interface DesktopProjectSelectionResolution {
  routeProject: DesktopProjectParamResolution
  activeProjectId: string | null
}

export function resolveDesktopProjectFromSearchParams(
  searchParams: URLSearchParams,
  availableProjectIds: ReadonlyArray<string>,
): DesktopProjectParamResolution {
  const projectId = searchParams.get('project')
  if (!projectId) {
    return { state: 'missing', projectId: null }
  }

  if (availableProjectIds.includes(projectId)) {
    return { state: 'valid', projectId }
  }

  return { state: 'unresolved', projectId }
}

export function getDesktopProjectIdFromSearchParams(
  searchParams: URLSearchParams,
  availableProjectIds: ReadonlyArray<string>,
): string | null {
  const resolved = resolveDesktopProjectFromSearchParams(searchParams, availableProjectIds)
  return resolved.state === 'valid' ? resolved.projectId : null
}

export function resolveDesktopProjectSelection(
  searchParams: URLSearchParams,
  availableProjectIds: ReadonlyArray<string>,
  selectedProjectId: string | null,
): DesktopProjectSelectionResolution {
  const routeProject = resolveDesktopProjectFromSearchParams(searchParams, availableProjectIds)
  const fallbackProjectId = selectedProjectId && availableProjectIds.includes(selectedProjectId)
    ? selectedProjectId
    : (availableProjectIds[0] ?? null)

  return {
    routeProject,
    activeProjectId: routeProject.state === 'valid' ? routeProject.projectId : fallbackProjectId,
  }
}

export function withDesktopProject(searchParams: URLSearchParams, projectId: string): URLSearchParams {
  const next = new URLSearchParams(searchParams)
  next.set('project', projectId)
  return next
}

export function withoutDesktopProject(searchParams: URLSearchParams): URLSearchParams {
  const next = new URLSearchParams(searchParams)
  next.delete('project')
  return next
}
