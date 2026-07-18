import PhotoSwipeLightbox from 'photoswipe/lightbox'
import PhotoSwipe from 'photoswipe'
import 'photoswipe/style.css'
import { Aperture, Calendar, Camera, ChevronDown, ChevronUp, MapPin } from 'lucide-static'
import { galleryManager } from '../utils/gallery-manager'
import type { Photo } from '../types/photo'

export class LightboxComponent {
  private lightbox: PhotoSwipeLightbox | null = null
  private currentGalleryPhotos: Photo[] = []
  /** Collapsed state of the info panel -- sticky across photo changes within a session. */
  private infoCollapsed = false

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

          el.addEventListener('click', (e) => {
            if ((e.target as HTMLElement).closest('.pswp__info-toggle')) {
              this.infoCollapsed = !this.infoCollapsed
              this.updatePhotoInfo(el, pswp)
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

    // Date taken -- include the time of day when the EXIF value carries one
    // (legacy rows may be date-only strings).
    let dateStr = ''
    if (photo.metadata.dateTaken) {
      const date = new Date(photo.metadata.dateTaken)
      dateStr = date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
      if (/\d{1,2}:\d{2}/.test(photo.metadata.dateTaken)) {
        dateStr += `, ${date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`
      }
    }

    let cameraStr = ''
    if (photo.metadata.camera) {
      cameraStr = photo.metadata.camera
      if (photo.metadata.lens) cameraStr += ` · ${photo.metadata.lens}`
    }

    const settings = []
    if (photo.metadata.focalLength) settings.push(photo.metadata.focalLength)
    if (photo.metadata.aperture) settings.push(photo.metadata.aperture)
    if (photo.metadata.shutterSpeed) settings.push(photo.metadata.shutterSpeed)
    if (photo.metadata.iso) settings.push(`ISO ${photo.metadata.iso}`)

    const metaRow = (icon: string, text: string) =>
      `<p class="pswp__photo-meta"><span class="pswp__meta-icon">${icon}</span><span>${text}</span></p>`

    const rows = [
      dateStr ? metaRow(Calendar, dateStr) : '',
      photo.metadata.location ? metaRow(MapPin, photo.metadata.location) : '',
      cameraStr ? metaRow(Camera, cameraStr) : '',
      settings.length > 0 ? metaRow(Aperture, settings.join(' • ')) : '',
    ].join('')

    const hasRows = rows.length > 0
    el.innerHTML = `
      <div class="pswp__overlay-content">
        <div class="pswp__info-block">
          <div class="pswp__info-header">
            <h3 class="pswp__photo-title">${photo.title || photo.filename}</h3>
            ${hasRows
              ? `<button type="button" class="pswp__info-toggle"
                         aria-expanded="${!this.infoCollapsed}"
                         aria-label="${this.infoCollapsed ? 'Show photo info' : 'Hide photo info'}">
                   ${this.infoCollapsed ? ChevronUp : ChevronDown}
                 </button>`
              : ''}
          </div>
          ${this.infoCollapsed ? '' : rows}
        </div>
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
    
    // Prepare data source - prefer the native-res `full` webp (crisp, small
    // download); fall back to `large`, then `original` for photos that
    // haven't been backfilled with a `full` variant yet (full_key IS NULL).
    // `msrc` stays the already-cached grid `medium` image so PhotoSwipe shows
    // it instantly while the high-res source streams in.
    const dataSource = gallery.photos.map(photo => {
      const source = photo.variants.full || photo.variants.large || photo.variants.original
      return {
        src: source.url,
        width: source.width,
        height: source.height,
        msrc: photo.variants.medium.url,
        alt: photo.title || photo.filename,
        id: photo.id,
      }
    })
    
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