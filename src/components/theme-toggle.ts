export type Theme = 'lofi' | 'dark'

const STORAGE_KEY = 'theme'
const THEME_COLORS: Record<Theme, string> = {
  lofi: '#ffffff',
  dark: '#1d232a',
}

export function getTheme(): Theme {
  return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'lofi'
}

function applyTheme(theme: Theme) {
  document.documentElement.setAttribute('data-theme', theme)

  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', THEME_COLORS[theme])

  document.querySelectorAll('[data-theme-toggle]').forEach(btn => {
    btn.setAttribute('aria-pressed', String(theme === 'dark'))
  })
}

export function toggleTheme() {
  const next: Theme = getTheme() === 'dark' ? 'lofi' : 'dark'
  applyTheme(next)
  try {
    localStorage.setItem(STORAGE_KEY, next)
  } catch {
    /* storage unavailable (private mode) — theme still applies for this session */
  }
}

let wired = false

/**
 * Sync toggle buttons to the current theme (already set on <html> by the inline
 * head script) and wire click handling via delegation so buttons rendered later
 * by the navigation still work. Idempotent across pages.
 */
export function initThemeToggle() {
  applyTheme(getTheme())
  if (wired) return
  wired = true
  document.addEventListener('click', e => {
    const btn = (e.target as HTMLElement).closest('[data-theme-toggle]')
    if (btn) {
      e.preventDefault()
      toggleTheme()
    }
  })
}
