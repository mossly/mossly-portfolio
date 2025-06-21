import { GalleryComponent } from './components/gallery'
// import { ThemeToggle } from './components/theme-toggle'

let gallery: GalleryComponent | null = null

export function initializeApp() {
  console.log('Mossly Portfolio v2.0 initializing...')
  
  // Initialize theme toggle (disabled for now)
  // new ThemeToggle()
  
  // Initialize gallery
  const appContainer = document.getElementById('app')
  if (appContainer) {
    // Clear the initial HTML and let the gallery component render
    appContainer.innerHTML = `
      <header class="bg-gray-800 text-white">
        <nav class="container mx-auto px-4 py-3 flex justify-between items-center">
          <div class="flex items-center space-x-8">
            <a href="/" class="text-sm font-semibold uppercase tracking-wider">Aaron Moss</a>
            <a href="#photography" class="text-xs uppercase tracking-wider text-gray-300 hover:text-white transition-colors">Photography</a>
          </div>
          <div class="flex items-center space-x-6">
            <a href="/aaron-moss-cv.pdf" target="_blank" class="text-xs uppercase tracking-wider text-gray-300 hover:text-white transition-colors">CV</a>
            <a href="https://www.linkedin.com/in/aaron-f-moss/" target="_blank" class="text-xs uppercase tracking-wider text-gray-300 hover:text-white transition-colors">LinkedIn</a>
            <a href="https://github.com/mossly" target="_blank" class="text-xs uppercase tracking-wider text-gray-300 hover:text-white transition-colors">GitHub</a>
          </div>
        </nav>
      </header>

      <main id="gallery-container" class="container mx-auto py-8"></main>

      <hr class="border-gray-300 my-8">

      <div class="container mx-auto px-4 pt-2">
        <figure>
          <blockquote class="pl-5 border-l-4 border-gray-300 text-lg mb-2">
            <p class="mb-0">"It's marvelous, marvelous. Nothing will ever be as much fun. I'm going to photograph everything, <em>everything!</em>"</p>
          </blockquote>
          <figcaption class="pl-5 text-gray-600">
            — Jacques-Henri Lartigue <cite class="not-italic">(1902)</cite>
          </figcaption>
        </figure>
      </div>

      <footer class="text-gray-600 pt-4 pb-8">
        <div class="container mx-auto px-4">
          <p class="text-right">
            <a href="#" class="text-gray-600 hover:text-gray-800">Back to top</a>
          </p>
        </div>
      </footer>
    `
    
    gallery = new GalleryComponent('gallery-container')
    
    // Add smooth scroll for "Back to top" link
    document.addEventListener('click', (e) => {
      const link = (e.target as HTMLElement).closest('a[href="#"]')
      if (link) {
        e.preventDefault()
        window.scrollTo({ top: 0, behavior: 'smooth' })
      }
    })
  }
}

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
  if (gallery) {
    gallery.destroy()
  }
})