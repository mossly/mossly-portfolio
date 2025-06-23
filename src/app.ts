import { GalleryComponent } from './components/gallery'
// import { ThemeToggle } from './components/theme-toggle'

let gallery: GalleryComponent | null = null

export function initializeApp() {
  console.log('Mossly Portfolio v2.0 initializing...')
  
  // Initialize gallery - use the existing gallery-grid container
  const galleryGrid = document.querySelector('.gallery-grid')
  if (galleryGrid) {
    gallery = new GalleryComponent('app')
    
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