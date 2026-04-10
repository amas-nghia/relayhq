import assert from 'node:assert/strict'
import test from 'node:test'

import {
  emptyTaskDraft,
  extractBoard,
  extractTasks,
  fetchBoard,
  fetchTasks,
  getErrorMessage,
  readJson,
  taskStatuses,
  updateTaskStatus,
  createTask,
} from '../dist-test/taskBoard.js'

test('task board helpers parse and normalize payloads', async () => {
  const arrayPayload = [{ title: 'Task A', status: 'todo' }]
  const objectPayload = { tasks: [{ title: 'Task B', status: 'in_progress' }] }
  const boardPayload = {
    project_id: 'proj_1',
    columns: [{ key: 'todo', title: 'Todo', count: 1, tasks: [{ title: 'Task A', status: 'todo' }] }],
  }

  const arrayTasks = extractTasks(arrayPayload)
  const nestedTasks = extractTasks(objectPayload)
  const board = extractBoard(boardPayload)
  const parsed = await readJson({ text: async () => '{"title":"Task C"}' })

  assert.equal(arrayTasks.length, 1)
  assert.equal(arrayTasks[0].title, 'Task A')
  assert.equal(nestedTasks[0].status, 'in_progress')
  assert.equal(board.project_id, 'proj_1')
  assert.equal(board.columns.length, 1)
  assert.deepEqual(parsed, { title: 'Task C' })
  assert.deepEqual(emptyTaskDraft, { project_id: '', title: '', details: '', status: 'todo' })
  assert.ok(taskStatuses.includes('review'))
  assert.equal(getErrorMessage(new Error('Boom')), 'Boom')
})

test('task board helpers handle empty and invalid payloads', async () => {
  const unknownPayload = { tasks: 'not-an-array' }
  const invalidBoard = { columns: 'not-an-array' }

  const tasks = extractTasks(unknownPayload)
  const board = extractBoard(invalidBoard)
  const empty = await readJson({ text: async () => '' })
  const message = getErrorMessage({})

  assert.deepEqual(tasks, [])
  assert.deepEqual(board, { project_id: '', columns: [] })
  assert.equal(empty, null)
  assert.equal(message, 'Something went wrong.')
})

test('task board fetch and mutation helpers use the API shape', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async (input, init) => {
    const url = String(input)

    if (url.includes('/api/v1/boards?project_id=')) {
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ project_id: 'proj_1', columns: [] }),
      }
    }

    if (url.includes('/api/v1/tasks?project_id=')) {
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify([{ title: 'Task D', status: 'todo' }]),
      }
    }

    if (init?.method === 'POST') {
      return {
        ok: true,
        status: 201,
        text: async () => JSON.stringify({ id: 'task_1', title: 'Task E', status: 'todo' }),
      }
    }

    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ id: 'task_1', status: 'done' }),
    }
  }

  try {
    const board = await fetchBoard('proj_1')
    const tasks = await fetchTasks('proj_1')
    const created = await createTask({ project_id: 'proj_1', title: 'Task E', details: '', status: 'todo' })
    const updated = await updateTaskStatus('task_1', 'done')

    assert.equal(board.project_id, 'proj_1')
    assert.equal(tasks.length, 1)
    assert.equal(tasks[0].title, 'Task D')
    assert.equal(created.id, 'task_1')
    assert.equal(updated.status, 'done')
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('task board fetch helper rejects when the API fails', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => ({
    ok: false,
    status: 500,
    text: async () => 'nope',
  })

  try {
    await assert.rejects(() => fetchTasks('proj_1'), /GET \/api\/v1\/tasks failed \(500\)/)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('board fetch helper rejects when the API fails', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => ({
    ok: false,
    status: 500,
    text: async () => 'nope',
  })

  try {
    await assert.rejects(() => fetchBoard('proj_1'), /GET \/api\/v1\/boards failed \(500\)/)
  } finally {
    globalThis.fetch = originalFetch
  }
})
