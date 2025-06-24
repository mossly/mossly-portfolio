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
  console.log('About page loaded')
  
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
      quote: 'Photography is a way of feeling, of touching, of loving. What you have caught on film is captured forever... It remembers little things, long after you have forgotten everything.',
      author: 'Aaron Siskind'
    })
  } catch (error) {
    console.error('Error initializing about page:', error)
    // Ensure page becomes visible even if there's an error
    document.documentElement.classList.add('ready')
  }
})