import './styles/main.css'
import { Navigation } from './components/navigation'
import { initializeApp } from './app'
import { preventFOUC } from './utils/prevent-fouc'

// Start FOUC prevention immediately
preventFOUC()

document.addEventListener('DOMContentLoaded', () => {
  // Initialize navigation first
  new Navigation()

  // Then initialize app (async: awaits the live /api/photos fetch).
  // .catch so a post-await throw (e.g. GalleryComponent's missing-container
  // error) surfaces instead of becoming a silent unhandled rejection.
  initializeApp().catch(console.error)
})