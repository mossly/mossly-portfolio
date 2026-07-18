import { GalleryComponent } from './components/gallery'
import { Footer } from './components/footer'
import { galleryManager } from './utils/gallery-manager'

export async function initializeApp() {
  // Initialize gallery - use the existing gallery-grid container.
  // galleryManager.init() fetches /api/photos (Phase 3G) and must resolve
  // before GalleryComponent's (synchronous) constructor reads any gallery
  // data.
  const galleryGrid = document.querySelector('.gallery-grid')
  if (galleryGrid) {
    await galleryManager.init()
    new GalleryComponent('app')
  }

  // Initialize footer with photography quote
  new Footer('footer', {
    quote: "It's marvelous, marvelous. Nothing will ever be as much fun. I'm going to photograph everything, <em>everything!</em>",
    author: 'Jacques-Henri Lartigue (1902)'
  })
}