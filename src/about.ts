import './styles/main.css'
import { Navigation } from './components/navigation'
import { Footer } from './components/footer'
import { preventFOUC } from './utils/prevent-fouc'
import LazyLoad from 'vanilla-lazyload'

// Start FOUC prevention immediately
preventFOUC()

// Fallback to ensure page becomes visible
setTimeout(() => {
  document.documentElement.classList.add('ready')
}, 500)

document.addEventListener('DOMContentLoaded', () => {
  try {
    // Initialize navigation
    new Navigation()
    
    // Initialize LazyLoad for images
    new LazyLoad({
      elements_selector: '.lazy',
      use_native: true
    })
    
    // Initialize footer with a different quote
    new Footer('footer', {
      quote: 'Life is like riding a bicycle. To keep your balance you must keep moving.',
      author: 'Albert Einstein'
    })
  } catch (error) {
    console.error('Error initializing about page:', error)
    // Ensure page becomes visible even if there's an error
    document.documentElement.classList.add('ready')
  }
})
