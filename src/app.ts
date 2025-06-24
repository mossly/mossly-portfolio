import { GalleryComponent } from './components/gallery'
import { Footer } from './components/footer'
// import { ThemeToggle } from './components/theme-toggle'

let gallery: GalleryComponent | null = null
let footer: Footer | null = null

export function initializeApp() {
  console.log('Mossly Portfolio v2.0 initializing...')
  
  // Initialize gallery - use the existing gallery-grid container
  const galleryGrid = document.querySelector('.gallery-grid')
  if (galleryGrid) {
    gallery = new GalleryComponent('app')
  }
  
  // Initialize footer with photography quote
  footer = new Footer('footer', {
    quote: "It's marvelous, marvelous. Nothing will ever be as much fun. I'm going to photograph everything, <em>everything!</em>",
    author: 'Jacques-Henri Lartigue (1902)'
  })
}

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
  if (gallery) {
    gallery.destroy()
  }
  if (footer) {
    footer.destroy()
  }
})