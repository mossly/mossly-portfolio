export class Navigation {
  constructor() {
    this.render()
  }

  private render() {
    const navElement = document.getElementById('navigation')
    if (!navElement) return

    const isAboutPage = window.location.pathname.includes('about')

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
            ${isAboutPage ? `
              <a href="/" class="btn btn-ghost">Photography</a>
            ` : `
              <a href="/" class="btn btn-ghost">Photography</a>
            `}
            <a href="/about.html" class="btn btn-ghost ${isAboutPage ? 'btn-active' : ''}">About</a>
          </div>
        </div>
        <div class="navbar-center hidden lg:flex">
          <!-- Center section now empty -->
        </div>
        <div class="navbar-end hidden lg:flex">
          <ul class="menu menu-horizontal px-1">
            <li><a href="/aaron-moss-cv.pdf" target="_blank">CV</a></li>
            <li><a href="https://www.linkedin.com/in/aaron-f-moss/" target="_blank">LinkedIn</a></li>
            <li><a href="https://github.com/mossly" target="_blank">GitHub</a></li>
          </ul>
        </div>
      </header>
    `
  }
}