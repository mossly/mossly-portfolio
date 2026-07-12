import { GalleryComponent } from './components/gallery'
import { Footer } from './components/footer'

export function initializeApp() {
  // Initialize gallery - use the existing gallery-grid container
  const galleryGrid = document.querySelector('.gallery-grid')
  if (galleryGrid) {
    new GalleryComponent('app')
  }

  // Initialize footer with photography quote
  new Footer('footer', {
    quote: "It's marvelous, marvelous. Nothing will ever be as much fun. I'm going to photograph everything, <em>everything!</em>",
    author: 'Jacques-Henri Lartigue (1902)'
  })
}