import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import { applyTheme, normalizeTheme, readStoredTheme, setTheme, THEME_STORAGE_KEY } from './theme'

describe('theme helpers', () => {
  test('normalizes unknown values back to pipboy', () => {
    assert.equal(normalizeTheme('papernote'), 'papernote')
    assert.equal(normalizeTheme('papernote-dark'), 'papernote-dark')
    assert.equal(normalizeTheme('pipboy'), 'pipboy')
    assert.equal(normalizeTheme('unknown'), 'pipboy')
    assert.equal(normalizeTheme(null), 'pipboy')
  })

  test('reads stored theme safely', () => {
    assert.equal(readStoredTheme({ getItem: () => 'papernote' }), 'papernote')
    assert.equal(readStoredTheme({ getItem: () => 'papernote-dark' }), 'papernote-dark')
    assert.equal(readStoredTheme({ getItem: () => 'invalid' }), 'pipboy')
    assert.equal(readStoredTheme(null), 'pipboy')
  })

  test('applies and persists theme together', () => {
    const dataset: Record<string, string> = {}
    let stored: string | null = null

    setTheme('papernote', {
      storage: { setItem: (key, value) => { if (key === THEME_STORAGE_KEY) stored = value } },
      target: { dataset },
    })

    assert.equal(stored, 'papernote')
    assert.equal(dataset.theme, 'papernote')

    applyTheme('pipboy', { dataset })
    assert.equal(dataset.theme, 'pipboy')
  })

  test('persists dark papernote theme', () => {
    const dataset: Record<string, string> = {}
    let stored: string | null = null

    setTheme('papernote-dark', {
      storage: { setItem: (key, value) => { if (key === THEME_STORAGE_KEY) stored = value } },
      target: { dataset },
    })

    assert.equal(stored, 'papernote-dark')
    assert.equal(dataset.theme, 'papernote-dark')
  })
})
