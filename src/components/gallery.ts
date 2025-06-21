import { galleryManager } from '../utils/gallery-manager'
import { GALLERY_CONFIG } from '../config/images'
import type { Photo, PhotoCategory } from '../types/photo'
import { LightboxComponent } from './lightbox'

export class GalleryComponent {
  private container: HTMLElement
  private gridContainer: HTMLElement | null = null
  private categoryButtons: Map<PhotoCategory, HTMLButtonElement> = new Map()
  private loadedImages: Set<string> = new Set()
  private intersectionObserver!: IntersectionObserver
  private lightbox: LightboxComponent

  constructor(containerId: string) {
    const container = document.getElementById(containerId)
    if (!container) throw new Error(`Container ${containerId} not found`)
    
    this.container = container
    this.lightbox = new LightboxComponent()
    this.setupIntersectionObserver()
    this.render()
    this.attachEventListeners()
    
  }

  private setupIntersectionObserver() {
    this.intersectionObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            const img = entry.target as HTMLImageElement
            const src = (img as HTMLImageElement).dataset.src
            if (src && !this.loadedImages.has(src)) {
              img.src = src
              img.classList.add('animate-fade-in')
              this.loadedImages.add(src)
              this.intersectionObserver.unobserve(img)
            }
          }
        })
      },
      { rootMargin: '50px' }
    )
  }

  private render() {
    this.container.innerHTML = `
      <section class="text-center mb-8">
        <h1 class="text-3xl font-medium mb-2">PHOTOGRAPHY <span class="font-light">PORTFOLIO</span></h1>
        <p class="text-gray-600 italic">2015–2025</p>
      </section>

      <div id="category-tabs" class="flex flex-wrap justify-center gap-1 mb-8"></div>
      
      <div id="gallery-header" class="mb-6"></div>
      
      <div id="gallery-grid" class="gallery-grid"></div>
    `

    this.renderCategoryTabs()
    this.gridContainer = document.getElementById('gallery-grid')
    this.renderGallery()
  }

  private renderCategoryTabs() {
    const tabsContainer = document.getElementById('category-tabs')
    if (!tabsContainer) return

    const categories = galleryManager.getCategories()
    const currentCategory = galleryManager.getCurrentCategory()

    categories.forEach(category => {
      const config = GALLERY_CONFIG[category]
      
      const button = document.createElement('button')
      button.className = category === currentCategory ? 'category-btn category-btn-active' : 'category-btn'
      button.textContent = config.displayName
      button.dataset.category = category
      
      tabsContainer.appendChild(button)
      this.categoryButtons.set(category, button)
    })
  }

  private renderGallery() {
    if (!this.gridContainer) return

    const gallery = galleryManager.getCurrentGallery()
    if (!gallery) {
      this.gridContainer.innerHTML = '<p class="text-center">No photos found</p>'
      return
    }

    const photos = gallery.photos

    // Update gallery header
    const headerContainer = document.getElementById('gallery-header')
    if (headerContainer) {
      headerContainer.innerHTML = `
        <h2 class="text-lg font-semibold uppercase tracking-wider text-center">
          ${gallery.displayName} <span class="font-normal">PHOTOGRAPHY</span>
        </h2>
      `
    }

    this.gridContainer.innerHTML = photos.map(photo => this.createPhotoCard(photo)).join('')
    
    // Observe all images for lazy loading
    const images = this.gridContainer.querySelectorAll('img[data-src]')
    images.forEach(img => this.intersectionObserver.observe(img))
  }


  private createPhotoCard(photo: Photo): string {
    return `
      <div class="image-card cursor-pointer" data-photo-id="${photo.id}">
        <img
          data-src="${photo.variants.medium.url}"
          alt="${photo.title || photo.filename}"
          class="transition-opacity duration-300 hover:opacity-90"
          style="background-color: #f3f4f6;"
        />
      </div>
    `
  }

  private attachEventListeners() {
    // Category tab clicks
    this.container.addEventListener('click', (e) => {
      const button = (e.target as HTMLElement).closest('button[data-category]')
      if (button) {
        const category = (button as HTMLElement).dataset.category as PhotoCategory
        galleryManager.setCategory(category)
      }

      // Photo card clicks (for lightbox)
      const card = (e.target as HTMLElement).closest('[data-photo-id]')
      if (card) {
        const photoId = card.getAttribute('data-photo-id')
        if (photoId) {
          this.openLightbox(photoId)
        }
      }
    })

    // Listen for category changes
    galleryManager.onCategoryChange((category) => {
      this.updateCategoryButtons(category)
      this.renderGallery()
    })
  }

  private updateCategoryButtons(activeCategory: PhotoCategory) {
    this.categoryButtons.forEach((button, category) => {
      if (category === activeCategory) {
        button.classList.remove('category-btn')
        button.classList.add('category-btn', 'category-btn-active')
      } else {
        button.classList.remove('category-btn-active')
        button.classList.add('category-btn')
      }
    })
  }

  private openLightbox(photoId: string) {
    this.lightbox.openGallery(photoId)
  }


  destroy() {
    this.intersectionObserver.disconnect()
    this.lightbox.destroy()
  }
}