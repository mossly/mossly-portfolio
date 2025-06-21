import PhotoSwipeLightbox from 'photoswipe/lightbox'
import PhotoSwipe from 'photoswipe'
import 'photoswipe/style.css'
import { galleryManager } from '../utils/gallery-manager'
import type { Photo } from '../types/photo'

export class LightboxComponent {
  private lightbox: PhotoSwipeLightbox | null = null
  private currentGalleryPhotos: Photo[] = []

  constructor() {
    this.initializeLightbox()
  }

  private initializeLightbox() {
    this.lightbox = new PhotoSwipeLightbox({
      pswpModule: PhotoSwipe,
      
      // Core options
      bgOpacity: 0.95,
      showHideAnimationType: 'fade',
      
      // UI options
      arrowPrev: true,
      arrowNext: true,
      close: true,
      zoom: true,
      
      // Padding from screen edges
      paddingFn: () => {
        return {
          top: 40,
          bottom: 40,
          left: 20,
          right: 20
        }
      },
      
      // Photo data
      dataSource: [],
    })

    // Add custom UI elements
    this.lightbox.on('uiRegister', () => {
      this.lightbox?.pswp?.ui?.registerElement({
        name: 'photo-info',
        order: 9,
        isButton: false,
        appendTo: 'root',
        html: '',
        onInit: (el, pswp) => {
          this.updatePhotoInfo(el, pswp)
          
          pswp.on('change', () => {
            this.updatePhotoInfo(el, pswp)
          })
          
          // Add event delegation for toggle buttons
          el.addEventListener('click', (e) => {
            const button = (e.target as HTMLElement).closest('.pswp__details-toggle')
            if (button) {
              const photoIndex = button.getAttribute('data-photo-index')
              if (photoIndex) {
                const details = document.getElementById(photoIndex)
                if (details) {
                  if (details.style.display === 'none') {
                    details.style.display = 'block'
                    button.textContent = 'Hide info'
                  } else {
                    details.style.display = 'none'
                    button.textContent = 'Show info'
                  }
                }
              }
            }
          })
        }
      })
    })

    this.lightbox.init()
  }

  private updatePhotoInfo(el: HTMLElement, pswp: PhotoSwipe) {
    const currentIndex = pswp.currIndex
    const photo = this.currentGalleryPhotos[currentIndex]
    
    if (!photo) return
    
    // Date taken
    let dateStr = ''
    if (photo.metadata.dateTaken) {
      dateStr = new Date(photo.metadata.dateTaken).toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      })
    }
    
    // Technical details
    const technicalItems = []
    
    // Camera and lens
    if (photo.metadata.camera) {
      let cameraInfo = photo.metadata.camera
      if (photo.metadata.lens) {
        cameraInfo += ` with ${photo.metadata.lens}`
      }
      technicalItems.push(cameraInfo)
    }
    
    // Shooting settings
    const settings = []
    if (photo.metadata.focalLength) settings.push(photo.metadata.focalLength)
    if (photo.metadata.aperture) settings.push(photo.metadata.aperture)
    if (photo.metadata.shutterSpeed) settings.push(photo.metadata.shutterSpeed)
    if (photo.metadata.iso) settings.push(`ISO ${photo.metadata.iso}`)
    
    if (settings.length > 0) {
      technicalItems.push(settings.join(' • '))
    }
    
    const photoIndex = `photo-info-${currentIndex}`
    
    el.innerHTML = `
      <div class="pswp__overlay-content">
        <div class="pswp__info-block">
          <h3 class="pswp__photo-title">${photo.title || photo.filename}</h3>
          ${dateStr ? `<p class="pswp__photo-meta">${dateStr}</p>` : ''}
          ${technicalItems.length > 0 ? `
            <button class="pswp__details-toggle" data-photo-index="${photoIndex}">Show info</button>
          ` : ''}
        </div>
        ${technicalItems.length > 0 ? `
          <div id="${photoIndex}" class="pswp__info-block pswp__technical-details" style="display: none;">
            ${technicalItems.map(item => `<p class="pswp__photo-meta">${item}</p>`).join('')}
          </div>
        ` : ''}
      </div>
    `
  }

  openGallery(photoId: string) {
    const gallery = galleryManager.getCurrentGallery()
    if (!gallery) return
    
    this.currentGalleryPhotos = gallery.photos
    
    // Find the index of the clicked photo
    const clickedIndex = gallery.photos.findIndex(p => p.id === photoId)
    if (clickedIndex === -1) return
    
    // Prepare data source - use original JPGs for lightbox
    const dataSource = gallery.photos.map(photo => ({
      src: photo.variants.original.url,
      width: photo.variants.original.width,
      height: photo.variants.original.height,
      alt: photo.title || photo.filename,
      id: photo.id,
    }))
    
    if (this.lightbox) {
      this.lightbox.options.dataSource = dataSource
      this.lightbox.loadAndOpen(clickedIndex)
    }
  }

  destroy() {
    if (this.lightbox) {
      this.lightbox.destroy()
      this.lightbox = null
    }
  }
}