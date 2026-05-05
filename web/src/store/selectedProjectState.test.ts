import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { resolvePersistedSelectedProjectId } from './selectedProjectState'

describe('selected project persistence', () => {
  it('keeps the current project when it still exists', () => {
    assert.equal(resolvePersistedSelectedProjectId('beta', ['alpha', 'beta']), 'beta')
  })

  it('clears the current project when it becomes stale', () => {
    assert.equal(resolvePersistedSelectedProjectId('gamma', ['alpha', 'beta']), null)
  })

  it('returns null when no projects exist', () => {
    assert.equal(resolvePersistedSelectedProjectId('alpha', []), null)
  })
})
