import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  getDesktopProjectIdFromSearchParams,
  resolveDesktopProjectSelection,
  resolveDesktopProjectFromSearchParams,
  withoutDesktopProject,
  withDesktopProject,
} from './desktopProjectUrl'

describe('desktop project URL state', () => {
  it('reads a valid project id from the query string', () => {
    assert.equal(
      getDesktopProjectIdFromSearchParams(new URLSearchParams('project=alpha'), ['alpha', 'beta']),
      'alpha',
    )
  })

  it('ignores missing or invalid project ids', () => {
    assert.equal(getDesktopProjectIdFromSearchParams(new URLSearchParams(), ['alpha', 'beta']), null)
    assert.equal(getDesktopProjectIdFromSearchParams(new URLSearchParams('project=gamma'), ['alpha', 'beta']), null)
  })

  it('keeps an unresolved project param distinct from a missing one', () => {
    assert.deepEqual(
      resolveDesktopProjectFromSearchParams(new URLSearchParams(), ['alpha', 'beta']),
      { state: 'missing', projectId: null },
    )

    assert.deepEqual(
      resolveDesktopProjectFromSearchParams(new URLSearchParams('project=gamma'), ['alpha', 'beta']),
      { state: 'unresolved', projectId: 'gamma' },
    )

    assert.deepEqual(
      resolveDesktopProjectFromSearchParams(new URLSearchParams('project=alpha'), ['alpha', 'beta']),
      { state: 'valid', projectId: 'alpha' },
    )
  })

  it('writes the project param while preserving other query params', () => {
    const searchParams = withDesktopProject(new URLSearchParams('lane=review'), 'alpha')

    assert.equal(searchParams.get('project'), 'alpha')
    assert.equal(searchParams.get('lane'), 'review')
  })

  it('replaces a stale project param during project switching', () => {
    const searchParams = withDesktopProject(new URLSearchParams('project=alpha&lane=review'), 'beta')

    assert.equal(searchParams.get('project'), 'beta')
    assert.equal(searchParams.get('lane'), 'review')
  })

  it('removes the project param while preserving other query params', () => {
    const searchParams = withoutDesktopProject(new URLSearchParams('project=alpha&lane=review'))

    assert.equal(searchParams.get('project'), null)
    assert.equal(searchParams.get('lane'), 'review')
  })

  it('keeps the route project when the query matches an available desktop project', () => {
    assert.deepEqual(
      resolveDesktopProjectSelection(new URLSearchParams('project=beta'), ['alpha', 'beta'], 'alpha'),
      {
        routeProject: { state: 'valid', projectId: 'beta' },
        activeProjectId: 'beta',
      },
    )
  })

  it('falls back to the selected project when the query project is stale', () => {
    assert.deepEqual(
      resolveDesktopProjectSelection(new URLSearchParams('project=gamma'), ['alpha', 'beta'], 'beta'),
      {
        routeProject: { state: 'unresolved', projectId: 'gamma' },
        activeProjectId: 'beta',
      },
    )
  })

  it('falls back to the first available project when the query and selected project are stale', () => {
    assert.deepEqual(
      resolveDesktopProjectSelection(new URLSearchParams('project=gamma'), ['alpha', 'beta'], 'delta'),
      {
        routeProject: { state: 'unresolved', projectId: 'gamma' },
        activeProjectId: 'alpha',
      },
    )
  })
})
