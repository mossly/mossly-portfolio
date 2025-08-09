import './styles/main.css'
import { Navigation } from './components/navigation'
import { Footer } from './components/footer'
import { preventFOUC } from './utils/prevent-fouc'

// Start FOUC prevention immediately
preventFOUC()

// Fallback to ensure page becomes visible
setTimeout(() => {
  document.documentElement.classList.add('ready')
}, 500)

document.addEventListener('DOMContentLoaded', () => {
  console.log('Projects page loaded')
  
  try {
    // Initialize navigation
    new Navigation()
    
    // Initialize footer with a different quote
    new Footer('footer', {
      quote: 'The way to get started is to quit talking and begin doing.',
      author: 'Walt Disney'
    })
  } catch (error) {
    console.error('Error initializing projects page:', error)
    // Ensure page becomes visible even if there's an error
    document.documentElement.classList.add('ready')
  }
})