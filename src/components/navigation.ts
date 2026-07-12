import { initThemeToggle } from './theme-toggle'

const THEME_TOGGLE_BUTTON = `
  <button data-theme-toggle type="button" class="btn btn-ghost btn-circle" aria-label="Toggle light/dark theme" aria-pressed="false">
    <svg class="theme-icon-light h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
    </svg>
    <svg class="theme-icon-dark h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
    </svg>
  </button>
`

export class Navigation {
  constructor() {
    this.render()
    initThemeToggle()
  }

  private render() {
    const navElement = document.getElementById('navigation')
    if (!navElement) return

    const isAboutPage = window.location.pathname.includes('about')
    const isProjectsPage = window.location.pathname.includes('projects')

    navElement.innerHTML = `
      <header class="navbar bg-base-100 shadow-lg sticky top-0 z-50">
        <div class="navbar-start">
          <div class="dropdown">
            <div tabindex="0" role="button" class="btn btn-ghost lg:hidden">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h8m-8 6h16" />
              </svg>
            </div>
            <ul tabindex="0" class="menu menu-sm dropdown-content mt-3 z-[1] p-2 shadow bg-base-100 rounded-box w-52">
              <li><a href="/">Photography</a></li>
              <li><a href="/projects.html" class="${isProjectsPage ? 'active' : ''}">Projects</a></li>
              <li><a href="/about.html" class="${isAboutPage ? 'active' : ''}">About</a></li>
              <li class="menu-title">
                <span>Social</span>
              </li>
              <li><a href="/aaron-moss-cv.pdf" target="_blank" class="hover:bg-primary hover:text-white">CV</a></li>
              <li><a href="https://www.linkedin.com/in/aaron-f-moss/" target="_blank" class="hover:bg-primary hover:text-white">LinkedIn</a></li>
              <li><a href="https://github.com/mossly" target="_blank" class="hover:bg-primary hover:text-white">GitHub</a></li>
            </ul>
          </div>
          <a href="/" class="btn btn-ghost text-xl flex items-center gap-2">
            <img src="/Kea_Transparent.png" alt="Kea logo" class="w-8 h-8 rounded-full">
            Mossly
          </a>
          
          <!-- Desktop Photography dropdown -->
          <div class="hidden lg:block ml-4">
            <a href="/" class="btn btn-ghost ${!isAboutPage && !isProjectsPage ? 'btn-active' : ''}">Photography</a>
            <a href="/projects.html" class="btn btn-ghost ${isProjectsPage ? 'btn-active' : ''}">Projects</a>
            <a href="/about.html" class="btn btn-ghost ${isAboutPage ? 'btn-active' : ''}">About</a>
          </div>
        </div>
        <div class="navbar-center hidden lg:flex">
          <!-- Center section now empty -->
        </div>
        <div class="navbar-end gap-1">
          <div class="hidden lg:flex gap-1">
            <a href="/aaron-moss-cv.pdf" target="_blank" class="btn btn-ghost">CV</a>
            <a href="https://www.linkedin.com/in/aaron-f-moss/" target="_blank" class="btn btn-ghost">LinkedIn</a>
            <a href="https://github.com/mossly" target="_blank" class="btn btn-ghost">GitHub</a>
          </div>
          ${THEME_TOGGLE_BUTTON}
        </div>
      </header>
    `
  }
}