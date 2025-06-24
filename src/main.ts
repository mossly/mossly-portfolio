import './styles/main.css'
import { Navigation } from './components/navigation'
import { initializeApp } from './app'
import { preventFOUC } from './utils/prevent-fouc'

// Start FOUC prevention immediately
preventFOUC()

document.addEventListener('DOMContentLoaded', () => {
  // Initialize navigation first
  new Navigation()
  
  // Then initialize app
  initializeApp()
})