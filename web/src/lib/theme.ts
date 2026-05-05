export type AppTheme = 'pipboy' | 'papernote' | 'papernote-dark'

export const THEME_STORAGE_KEY = 'relayhq-theme'
export const THEME_CHANGE_EVENT = 'relayhq:theme-change'

export function normalizeTheme(value: string | null | undefined): AppTheme {
  return value === 'papernote' || value === 'papernote-dark' ? value : 'pipboy'
}

export function readStoredTheme(storage: Pick<Storage, 'getItem'> | null | undefined = typeof window !== 'undefined' ? window.localStorage : null): AppTheme {
  return normalizeTheme(storage?.getItem(THEME_STORAGE_KEY) ?? null)
}

export function writeStoredTheme(theme: AppTheme, storage: Pick<Storage, 'setItem'> | null | undefined = typeof window !== 'undefined' ? window.localStorage : null) {
  storage?.setItem(THEME_STORAGE_KEY, theme)
}

export function applyTheme(theme: AppTheme, target: Pick<HTMLElement, 'dataset'> | null | undefined = typeof document !== 'undefined' ? document.documentElement : null) {
  if (!target) return
  target.dataset.theme = theme
}

export function setTheme(theme: AppTheme, options: {
  readonly storage?: Pick<Storage, 'setItem'> | null
  readonly target?: Pick<HTMLElement, 'dataset'> | null
} = {}) {
  writeStoredTheme(theme, options.storage)
  applyTheme(theme, options.target)
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent<AppTheme>(THEME_CHANGE_EVENT, { detail: theme }))
  }
}
