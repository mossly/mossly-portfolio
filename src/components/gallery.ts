import { galleryManager } from '../utils/gallery-manager'
import { GALLERY_CONFIG } from '../config/images'
import type { Photo, PhotoCategory } from '../types/photo'
import { LightboxComponent } from './lightbox'
import LazyLoad from 'vanilla-lazyload'

export class GalleryComponent {
  private container: HTMLElement
  private categoryButtons: Map<PhotoCategory, HTMLButtonElement> = new Map()
  private lightbox: LightboxComponent
  private resizeObserver!: ResizeObserver
  private currentLayoutMode: 'masonry' | 'column' = 'masonry'
  private lazyLoader: any | null = null

  constructor(containerId: string) {
    const container = document.getElementById(containerId)
    if (!container) throw new Error(`Container ${containerId} not found`)
    
    this.container = container
    this.lightbox = new LightboxComponent()
    this.setupLazyLoader()
    this.setupResizeObserver()
    this.render()
    this.attachEventListeners()
    
  }

  private setupLazyLoader() {
    this.lazyLoader = new LazyLoad({
      elements_selector: '.lazy',
      threshold: 0,
      class_loading: 'image-is-loading', // Avoid conflict with DaisyUI's .loading spinner
      callback_enter: () => {
        // Image is about to be loaded
      },
      callback_loaded: (element) => {
        // Remove image-loading class and add fade-in animation
        element.classList.remove('image-loading')
        element.classList.add('animate-fade-in')
        // Remove loading class from parent placeholder
        const placeholder = element.closest('.image-placeholder')
        if (placeholder) {
          placeholder.classList.remove('skeleton')
        }
      },
      callback_error: (element) => {
        // Handle load error - remove image-loading but show error state
        element.classList.remove('image-loading')
        // Remove loading class from parent placeholder
        const placeholder = element.closest('.image-placeholder')
        if (placeholder) {
          placeholder.classList.remove('skeleton')
        }
        console.error('Failed to load image:', element)
      }
    })
  }

  private setupResizeObserver() {
    let resizeTimeout: NodeJS.Timeout
    this.resizeObserver = new ResizeObserver(() => {
      clearTimeout(resizeTimeout)
      resizeTimeout = setTimeout(() => {
        this.updateLayoutMode()
      }, 100) // Debounce resize events
    })
    this.resizeObserver.observe(document.body)
  }

  private getLayoutMode(): 'masonry' | 'column' {
    // Use column mode on large screens (1024px+), masonry on smaller screens
    return window.innerWidth >= 1024 ? 'column' : 'masonry'
  }

  private updateLayoutMode() {
    const newMode = this.getLayoutMode()
    if (newMode !== this.currentLayoutMode) {
      this.currentLayoutMode = newMode
      // Re-render all galleries with new layout
      this.renderAllGalleries()
      this.showGallery(galleryManager.getCurrentCategory())
    }
  }

  private render() {
    this.currentLayoutMode = this.getLayoutMode()
    
    // Find the gallery grid container - it should already exist in the HTML
    const galleriesContainer = document.querySelector('.gallery-grid')
    if (galleriesContainer) {
      galleriesContainer.id = 'galleries-container'
    }

    this.setupCategoryButtons()
    this.renderAllGalleries()
    this.showGallery(galleryManager.getCurrentCategory())
  }

  private setupCategoryButtons() {
    // Setup desktop buttons
    const desktopButtons = document.querySelectorAll('button[data-category]')
    desktopButtons.forEach(button => {
      const category = button.getAttribute('data-category') as PhotoCategory
      if (category && button instanceof HTMLButtonElement) {
        this.categoryButtons.set(category, button)
        // Add click handler for desktop buttons
        button.addEventListener('click', () => {
          this.handleCategoryChange(category)
        })
      }
    })

    // Setup mobile dropdown items
    const dropdownItems = document.querySelectorAll('.category-dropdown-item')
    dropdownItems.forEach(item => {
      const category = item.getAttribute('data-category') as PhotoCategory
      if (category) {
        item.addEventListener('click', (e) => {
          e.preventDefault()
          this.handleCategoryChange(category)
        })
      }
    })
  }


  private renderAllGalleries() {
    const container = document.getElementById('galleries-container')
    if (!container) return

    const categories = galleryManager.getCategories()
    
    // Build all galleries HTML
    let galleriesHTML = ''
    
    categories.forEach(category => {
      const gallery = galleryManager.getGallery(category)
      if (!gallery) return
      
      const galleryClass = this.currentLayoutMode === 'column' ? 'image-gallery column-mode' : 'image-gallery masonry-mode'
      
      galleriesHTML += `
        <div id="gallery-${category}" class="gallery-section" style="display: none;">
          <!-- Gallery title commented out for future use
          <div class="mb-6">
            <h2 class="text-lg font-semibold uppercase tracking-wider text-center">
              ${gallery.displayName} <span class="font-normal">PHOTOGRAPHY</span>
            </h2>
          </div>
          -->
          <div class="${galleryClass}">
            ${this.renderGalleryContent(gallery.photos)}
          </div>
        </div>
      `
    })
    
    container.innerHTML = galleriesHTML
    
    // Initialize lazy loader for all galleries
    this.lazyLoader = new LazyLoad({
      elements_selector: '.lazy',
      threshold: 0,
      class_loading: 'image-is-loading', // Avoid conflict with DaisyUI's .loading spinner
      callback_enter: () => {
        // Image is about to be loaded
      },
      callback_loaded: (element) => {
        // Remove image-loading class and add fade-in animation
        element.classList.remove('image-loading')
        element.classList.add('animate-fade-in')
        // Remove loading class from parent placeholder
        const placeholder = element.closest('.image-placeholder')
        if (placeholder) {
          placeholder.classList.remove('skeleton')
        }
      },
      callback_error: (element) => {
        // Handle load error - remove image-loading but show error state
        element.classList.remove('image-loading')
        // Remove loading class from parent placeholder
        const placeholder = element.closest('.image-placeholder')
        if (placeholder) {
          placeholder.classList.remove('skeleton')
        }
        console.error('Failed to load image:', element)
      }
    })
  }

  private renderGalleryContent(photos: Photo[]): string {
    if (this.currentLayoutMode === 'column') {
      const columns = this.distributePhotosIntoColumns(photos, 3)
      return columns.map(columnPhotos => 
        `<div class="column">
          ${columnPhotos.map(photo => this.createPhotoCard(photo)).join('')}
        </div>`
      ).join('')
    } else {
      return photos.map(photo => this.createPhotoCard(photo)).join('')
    }
  }

  private showGallery(category: PhotoCategory) {
    // Hide all galleries
    const allGalleries = document.querySelectorAll('.gallery-section')
    allGalleries.forEach(gallery => {
      (gallery as HTMLElement).style.display = 'none'
    })
    
    // Show selected gallery
    const selectedGallery = document.getElementById(`gallery-${category}`)
    if (selectedGallery) {
      selectedGallery.style.display = 'block'
      
      // Update lazy loader to check newly visible images
      if (this.lazyLoader) {
        this.lazyLoader.update()
      }
    }
  }



  private createPhotoCard(photo: Photo): string {
    const mediumUrl = photo.variants.medium.url
    const aspectRatio = photo.aspectRatio || 1.5
    const paddingBottom = (1 / aspectRatio) * 100
    
    return `
      <div class="image-item" data-photo-id="${photo.id}">
        <div class="image-placeholder skeleton" style="padding-bottom: ${paddingBottom}%;">
          <img
            data-src="${mediumUrl}"
            alt="${photo.title || photo.filename}"
            class="lazy image-loading"
            width="${photo.variants.medium.width}"
            height="${photo.variants.medium.height}"
          />
        </div>
      </div>
    `
  }

  private distributePhotosIntoColumns(photos: Photo[], columnCount: number): Photo[][] {
    const columns: Photo[][] = Array.from({ length: columnCount }, () => [])
    
    // Distribute photos sequentially into columns (like the archive)
    photos.forEach((photo, index) => {
      columns[index % columnCount].push(photo)
    })
    
    return columns
  }

  private attachEventListeners() {
    // Photo card clicks (for lightbox)
    this.container.addEventListener('click', (e) => {
      const card = (e.target as HTMLElement).closest('[data-photo-id]')
      if (card) {
        const photoId = card.getAttribute('data-photo-id')
        if (photoId) {
          this.openLightbox(photoId)
        }
      }
    })

    // Navigation dropdown clicks
    document.addEventListener('click', (e) => {
      const navLink = (e.target as HTMLElement).closest('[data-nav-category]')
      if (navLink) {
        e.preventDefault()
        const category = navLink.getAttribute('data-nav-category') as PhotoCategory
        if (category) {
          this.handleCategoryChange(category)
          // Scroll to gallery section
          const gallerySection = document.querySelector('#photography')
          if (gallerySection) {
            gallerySection.scrollIntoView({ behavior: 'smooth' })
          }
        }
      }
    })

    // Listen for category changes
    galleryManager.onCategoryChange((category) => {
      this.updateCategoryButtons(category)
      this.showGallery(category)
    })
  }

  private handleCategoryChange(category: PhotoCategory) {
    galleryManager.setCategory(category)
  }

  private updateCategoryButtons(activeCategory: PhotoCategory) {
    // Update desktop buttons
    this.categoryButtons.forEach((button, category) => {
      if (category === activeCategory) {
        button.classList.remove('btn-ghost')
        button.classList.add('btn-primary')
      } else {
        button.classList.remove('btn-primary')
        button.classList.add('btn-ghost')
      }
    })
    
    // Update dropdown items
    const dropdownItems = document.querySelectorAll('.category-dropdown-item')
    dropdownItems.forEach(item => {
      const category = item.getAttribute('data-category')
      if (category === activeCategory) {
        item.classList.add('active')
      } else {
        item.classList.remove('active')
      }
    })
    
    // Update dropdown button text
    const selectedCategorySpan = document.getElementById('selected-category')
    if (selectedCategorySpan) {
      selectedCategorySpan.textContent = GALLERY_CONFIG[activeCategory].displayName
    }
  }

  private openLightbox(photoId: string) {
    this.lightbox.openGallery(photoId)
  }


  destroy() {
    if (this.lazyLoader) {
      this.lazyLoader.destroy()
    }
    this.resizeObserver.disconnect()
    this.lightbox.destroy()
  }
}