import assert from 'node:assert/strict'
import test from 'node:test'

import { emptyDraft, extractProjects, fetchProjects, getErrorMessage, readJson } from '../dist-test/projectRegistry.js'

test('project registry helpers parse project payloads', async () => {
  // Arrange
  const arrayPayload = [{ name: 'Alpha', owner: 'team-a' }]
  const objectPayload = { projects: [{ name: 'Beta', owner: 'team-b' }] }

  // Act
  const arrayProjects = extractProjects(arrayPayload)
  const nestedProjects = extractProjects(objectPayload)
  const parsed = await readJson({ text: async () => '{"name":"Gamma"}' })
  const message = getErrorMessage(new Error('Boom'))

  // Assert
  assert.equal(arrayProjects.length, 1)
  assert.equal(arrayProjects[0].name, 'Alpha')
  assert.equal(nestedProjects[0].owner, 'team-b')
  assert.deepEqual(parsed, { name: 'Gamma' })
  assert.equal(message, 'Boom')
  assert.deepEqual(emptyDraft, { name: '', summary: '', owner: '' })
})

test('project registry helpers handle empty and invalid payloads', async () => {
  // Arrange
  const unknownPayload = { projects: 'not-an-array' }

  // Act
  const projects = extractProjects(unknownPayload)
  const empty = await readJson({ text: async () => '' })
  const message = getErrorMessage({})

  // Assert
  assert.deepEqual(projects, [])
  assert.equal(empty, null)
  assert.equal(message, 'Something went wrong.')
})

test('fetchProjects uses the API response and surfaces failures', async () => {
  // Arrange
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    text: async () => JSON.stringify([{ name: 'Delta', owner: 'team-d' }]),
  })

  try {
    // Act
    const projects = await fetchProjects()

    // Assert
    assert.equal(projects.length, 1)
    assert.equal(projects[0].name, 'Delta')
  } finally {
    // Cleanup
    globalThis.fetch = originalFetch
  }
})

test('fetchProjects rejects when the API fails', async () => {
  // Arrange
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => ({
    ok: false,
    status: 500,
    text: async () => 'nope',
  })

  try {
    // Act / Assert
    await assert.rejects(fetchProjects, /GET \/api\/v1\/projects failed \(500\)/)
  } finally {
    // Cleanup
    globalThis.fetch = originalFetch
  }
})
