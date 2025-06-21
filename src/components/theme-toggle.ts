export class ThemeToggle {
  private toggle: HTMLInputElement | null
  private currentTheme: 'light' | 'dark'

  constructor() {
    this.currentTheme = this.getSavedTheme()
    this.toggle = document.querySelector('.theme-controller')
    this.init()
  }

  private init() {
    // Apply saved theme
    this.applyTheme(this.currentTheme)
    
    // Set toggle state
    if (this.toggle) {
      this.toggle.checked = this.currentTheme === 'dark'
      this.toggle.addEventListener('change', this.handleToggle.bind(this))
    }

    // Listen for system theme changes
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
      if (!localStorage.getItem('theme')) {
        this.applyTheme(e.matches ? 'dark' : 'light')
      }
    })
  }

  private handleToggle(e: Event) {
    const target = e.target as HTMLInputElement
    const theme = target.checked ? 'dark' : 'light'
    this.currentTheme = theme
    this.applyTheme(theme)
    this.saveTheme(theme)
  }

  private applyTheme(theme: 'light' | 'dark') {
    document.documentElement.setAttribute('data-theme', theme)
    
    // Update meta theme-color for mobile browsers
    const metaThemeColor = document.querySelector('meta[name="theme-color"]')
    if (metaThemeColor) {
      metaThemeColor.setAttribute('content', theme === 'dark' ? '#2a303c' : '#ffffff')
    }
  }

  private getSavedTheme(): 'light' | 'dark' {
    const saved = localStorage.getItem('theme')
    if (saved === 'light' || saved === 'dark') return saved
    
    // Use system preference
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }

  private saveTheme(theme: 'light' | 'dark') {
    localStorage.setItem('theme', theme)
  }
}