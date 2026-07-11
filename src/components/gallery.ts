import { galleryManager } from '../utils/gallery-manager'
import { GALLERY_CONFIG } from '../config/images'
import type { Photo, PhotoCategory } from '../types/photo'
import { LightboxComponent } from './lightbox'
import LazyLoad from 'vanilla-lazyload'
import type Sortable from 'sortablejs'

export class GalleryComponent {
  private container: HTMLElement
  private categoryButtons: Map<PhotoCategory, HTMLButtonElement> = new Map()
  private lightbox: LightboxComponent
  private resizeObserver!: ResizeObserver
  private lastRenderedWidth = 0
  private lazyLoader: any | null = null
  private sortables: Sortable[] = []
  private loadedPhotos = new Set<string>()

  // Bound so the exact same reference can be added and removed as a listener.
  private onDocumentClick = (e: MouseEvent) => {
    const target = e.target as HTMLElement

    // Check if click is outside any dropdown
    if (!target.closest('.dropdown') && !target.closest('.dropdown-hover')) {
      // Close all open dropdowns
      const openDropdowns = document.querySelectorAll('.dropdown:focus-within, .dropdown-hover:focus-within')
      openDropdowns.forEach(dropdown => {
        this.closeDropdown(dropdown as HTMLElement)
      })
    }
  }

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

  /**
   * Properly close DaisyUI dropdowns by moving focus outside the dropdown container
   */
  private closeDropdown(dropdownElement: HTMLElement | null) {
    if (!dropdownElement) return
    
    // Find the trigger element (button with tabindex)
    const trigger = dropdownElement.querySelector('[tabindex="0"]') as HTMLElement
    if (trigger) {
      // Remove focus from trigger
      trigger.blur()
    }
    
    // Create a temporary focusable element outside all dropdowns
    const tempFocusTarget = document.createElement('button')
    tempFocusTarget.style.position = 'fixed'
    tempFocusTarget.style.top = '-9999px'
    tempFocusTarget.style.left = '-9999px'
    tempFocusTarget.setAttribute('aria-hidden', 'true')
    document.body.appendChild(tempFocusTarget)
    
    // Move focus to temporary element
    tempFocusTarget.focus()
    
    // Remove temporary element after a brief delay
    setTimeout(() => {
      tempFocusTarget.remove()
    }, 100)
  }

  private lazyLoadOptions() {
    return {
      elements_selector: '.lazy',
      threshold: 0,
      class_loading: 'image-is-loading',
      callback_loaded: (element: HTMLElement) => {
        element.classList.remove('image-loading')
        const placeholder = element.closest('.image-placeholder')
        if (placeholder) placeholder.classList.remove('skeleton')
        const item = element.closest('[data-photo-id]') as HTMLElement | null
        const id = item?.getAttribute('data-photo-id')
        if (id) this.loadedPhotos.add(id)
      },
      callback_error: (element: HTMLElement) => {
        element.classList.remove('image-loading')
        const placeholder = element.closest('.image-placeholder')
        if (placeholder) placeholder.classList.remove('skeleton')
        console.error('Failed to load image:', element)
      },
    }
  }

  private setupLazyLoader() {
    this.lazyLoader = new LazyLoad(this.lazyLoadOptions())
  }

  private setupResizeObserver() {
    let resizeTimeout: NodeJS.Timeout
    this.resizeObserver = new ResizeObserver(() => {
      clearTimeout(resizeTimeout)
      resizeTimeout = setTimeout(() => {
        const width = this.getContainerWidth()
        // Only re-layout if width changed by more than a couple pixels
        if (Math.abs(width - this.lastRenderedWidth) > 2) {
          this.renderAllGalleries()
          this.showGallery(galleryManager.getCurrentCategory())
        }
      }, 100)
    })
    this.resizeObserver.observe(document.body)
  }

  private getContainerWidth(): number {
    const container = document.querySelector('.gallery-grid') as HTMLElement | null
    if (!container) return window.innerWidth
    const styles = getComputedStyle(container)
    const padX = parseFloat(styles.paddingLeft) + parseFloat(styles.paddingRight)
    // Account for the .image-gallery's own px-4 padding (1rem each side = 32px)
    const galleryPad = 32
    const w = container.clientWidth - padX - galleryPad
    return w > 0 ? w : window.innerWidth - galleryPad
  }

  private getTargetRowHeight(): number {
    const w = window.innerWidth
    if (w < 640) return 180
    if (w < 1024) return 240
    return 320
  }

  private render() {
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
          // Close the dropdown properly
          const dropdown = document.querySelector('.dropdown-bottom') as HTMLElement | null
          this.closeDropdown(dropdown)
        })
      }
    })
  }


  private renderAllGalleries() {
    const container = document.querySelector('.gallery-grid')
    if (!container) return

    const categories = galleryManager.getCategories()
    const containerWidth = this.getContainerWidth()
    this.lastRenderedWidth = containerWidth
    const targetHeight = this.getTargetRowHeight()

    // Build all galleries HTML
    let galleriesHTML = ''

    categories.forEach(category => {
      const gallery = galleryManager.getGallery(category)
      if (!gallery) return

      galleriesHTML += `
        <div id="gallery-${category}" class="gallery-section" style="display: none;">
          <div class="image-gallery justified-mode">
            ${this.renderJustified(gallery.photos, containerWidth, targetHeight)}
          </div>
        </div>
      `
    })

    container.innerHTML = galleriesHTML

    if (import.meta.env.DEV) {
      this.attachSortable()
    }

    // Exactly one live LazyLoad at a time: tear down the previous instance
    // (including the one from setupLazyLoader) before creating a new one.
    if (this.lazyLoader) this.lazyLoader.destroy()
    this.lazyLoader = new LazyLoad(this.lazyLoadOptions())
  }

  private renderJustified(photos: Photo[], containerWidth: number, targetHeight: number): string {
    const GAP = 8
    type Row = { photos: Photo[]; height: number }
    const rows: Row[] = []
    let current: Photo[] = []
    let sumAR = 0

    for (const photo of photos) {
      const ar = photo.aspectRatio || 1.5
      current.push(photo)
      sumAR += ar
      const gapsTotal = (current.length - 1) * GAP
      const projectedHeight = (containerWidth - gapsTotal) / sumAR
      if (projectedHeight <= targetHeight) {
        rows.push({ photos: current, height: projectedHeight })
        current = []
        sumAR = 0
      }
    }
    // Last partial row: keep at target height (don't stretch a single image full width)
    if (current.length > 0) {
      rows.push({ photos: current, height: targetHeight })
    }

    return rows
      .map(row => {
        const items = row.photos
          .map(photo => {
            const ar = photo.aspectRatio || 1.5
            const w = Math.round(ar * row.height)
            return this.createPhotoCard(photo, w, Math.round(row.height))
          })
          .join('')
        return `<div class="justified-row" style="gap:${GAP}px;">${items}</div>`
      })
      .join('')
  }

  private async attachSortable() {
    // Tear down any existing instances first
    this.sortables.forEach(s => s.destroy())
    this.sortables = []

    const { default: Sortable } = await import('sortablejs')
    const sections = document.querySelectorAll<HTMLElement>('.gallery-section')
    sections.forEach(section => {
      const category = section.id.replace(/^gallery-/, '') as PhotoCategory
      const rows = section.querySelectorAll<HTMLElement>('.justified-row')
      rows.forEach(row => {
        const s = Sortable.create(row, {
          group: `gallery-${category}`,
          animation: 150,
          ghostClass: 'sortable-ghost',
          chosenClass: 'sortable-chosen',
          dragClass: 'sortable-drag',
          forceFallback: true,
          onEnd: () => this.handleReorder(category, section),
        })
        this.sortables.push(s)
      })
    })
  }

  private async handleReorder(category: PhotoCategory, section: HTMLElement) {
    const ids = Array.from(section.querySelectorAll<HTMLElement>('.image-item'))
      .map(el => el.getAttribute('data-photo-id'))
      .filter((id): id is string => !!id)

    try {
      await galleryManager.saveOrder(category, ids)
      this.showToast('Saved')
      this.rerenderGalleryInPlace(category)
    } catch (err) {
      console.error('Failed to save order:', err)
      this.showToast('Save failed', true)
    }
  }

  /**
   * Re-compute the justified layout for a single gallery section without
   * touching the fade transition on .gallery-grid (which would flash white).
   */
  private rerenderGalleryInPlace(category: PhotoCategory) {
    const section = document.getElementById(`gallery-${category}`)
    if (!section) return
    const inner = section.querySelector<HTMLElement>('.image-gallery.justified-mode')
    if (!inner) return

    const gallery = galleryManager.getGallery(category)
    if (!gallery) return

    const containerWidth = this.getContainerWidth()
    this.lastRenderedWidth = containerWidth
    const targetHeight = this.getTargetRowHeight()

    inner.innerHTML = this.renderJustified(gallery.photos, containerWidth, targetHeight)

    if (import.meta.env.DEV) {
      this.attachSortable()
    }
    if (this.lazyLoader) {
      this.lazyLoader.update()
    }
  }

  private showToast(message: string, error = false) {
    const toast = document.createElement('div')
    toast.textContent = message
    toast.className = `gallery-toast${error ? ' gallery-toast-error' : ''}`
    document.body.appendChild(toast)
    requestAnimationFrame(() => toast.classList.add('visible'))
    setTimeout(() => {
      toast.classList.remove('visible')
      setTimeout(() => toast.remove(), 200)
    }, 1500)
  }

  private showGallery(category: PhotoCategory) {
    const allGalleries = document.querySelectorAll('.gallery-section')
    const selectedGallery = document.getElementById(`gallery-${category}`)
    const container = document.querySelector('.gallery-grid') as HTMLElement
    
    if (selectedGallery && container) {
      // Check if this is a switch between galleries
      const isSwitch = Array.from(allGalleries).some(
        gallery => (gallery as HTMLElement).style.display === 'block'
      )
      
      if (isSwitch) {
        // Add fade-out class and trigger fade
        container.classList.add('fade-out')
        container.style.opacity = '0'
        
        setTimeout(() => {
          // Hide all galleries
          allGalleries.forEach(gallery => {
            (gallery as HTMLElement).style.display = 'none'
          })
          
          // Show selected gallery
          selectedGallery.style.display = 'block'
          
          // Update lazy loader
          if (this.lazyLoader) {
            this.lazyLoader.update()
          }
          
          // Switch to fade-in easing
          container.classList.remove('fade-out')
          container.classList.add('fade-in')
          
          // Force reflow
          void container.offsetHeight
          
          // Fade back in
          container.style.opacity = '1'
          
          // Clean up classes after transition
          setTimeout(() => {
            container.classList.remove('fade-in')
          }, 150) // Match faster fade-in duration
        }, 250) // Wait for fade out
      } else {
        // First load - add fade-in animation
        allGalleries.forEach(gallery => {
          (gallery as HTMLElement).style.display = 'none'
        })
        
        selectedGallery.style.display = 'block'
        
        if (this.lazyLoader) {
          this.lazyLoader.update()
        }
        
        // Add fade-in class and trigger fade
        container.classList.add('fade-in')
        
        // Small delay to ensure everything is ready
        setTimeout(() => {
          container.style.opacity = '1'
          
          // Clean up class after transition
          setTimeout(() => {
            container.classList.remove('fade-in')
          }, 150)
        }, 50)
      }
    }
  }



  private createPhotoCard(photo: Photo, width: number, height: number): string {
    const mediumUrl = photo.variants.medium.url
    const alreadyLoaded = this.loadedPhotos.has(photo.id)
    // For images already in the browser cache, render with src directly so the
    // re-render after a drag doesn't flash an empty skeleton for a frame.
    const imgAttrs = alreadyLoaded
      ? `src="${mediumUrl}" class="image-loading"`
      : `data-src="${mediumUrl}" class="lazy image-loading"`
    const placeholderClass = alreadyLoaded ? 'image-placeholder' : 'image-placeholder skeleton'

    return `
      <div class="image-item" data-photo-id="${photo.id}" tabindex="0" role="button" aria-label="${photo.title || photo.filename}" style="width:${width}px;height:${height}px;flex:0 0 ${width}px;">
        <div class="${placeholderClass}" style="height:100%;">
          <img
            ${imgAttrs}
            alt="${photo.title || photo.filename}"
            width="${photo.variants.medium.width}"
            height="${photo.variants.medium.height}"
          />
        </div>
      </div>
    `
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

    // Keyboard activation for photo cards (Enter/Space opens the lightbox)
    this.container.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ' && e.key !== 'Spacebar') return
      const card = (e.target as HTMLElement).closest('[data-photo-id]')
      if (card) {
        const photoId = card.getAttribute('data-photo-id')
        if (photoId) {
          if (e.key === ' ' || e.key === 'Spacebar') e.preventDefault()
          this.openLightbox(photoId)
        }
      }
    })

    // Listen for category changes
    galleryManager.onCategoryChange((category) => {
      this.updateCategoryButtons(category)
      this.showGallery(category)
    })

    // Click outside to close dropdowns
    document.addEventListener('click', this.onDocumentClick)
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
    this.sortables.forEach(s => s.destroy())
    this.sortables = []
    this.resizeObserver.disconnect()
    document.removeEventListener('click', this.onDocumentClick)
    this.lightbox.destroy()
  }
}