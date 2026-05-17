import type { Photo, PhotoCategory, Gallery } from '../types/photo'
import { GALLERY_CONFIG } from '../config/images'
import photosData from '../data/photos.json'
import photoOrderData from '../data/photo-order.json'

type PhotoOrder = Partial<Record<PhotoCategory, string[]>>

export class GalleryManager {
  private photos: Record<PhotoCategory, Photo[]>
  private order: PhotoOrder
  private galleries: Map<PhotoCategory, Gallery>
  private currentCategory: PhotoCategory = 'bird'
  private listeners: Set<(category: PhotoCategory) => void> = new Set()

  constructor() {
    this.photos = photosData as Record<PhotoCategory, Photo[]>
    this.order = photoOrderData as PhotoOrder
    this.galleries = new Map()
    this.initializeGalleries()
  }

  private initializeGalleries() {
    for (const [category, photos] of Object.entries(this.photos)) {
      const config = GALLERY_CONFIG[category as PhotoCategory]
      const ordered = this.applyOrder(category as PhotoCategory, photos as Photo[])
      this.galleries.set(category as PhotoCategory, {
        category: category as PhotoCategory,
        displayName: config.displayName,
        photos: ordered,
        coverPhoto: ordered[0] as Photo,
      })
    }
  }

  /**
   * Sort photos by the saved order list (by id). Photos not in the list keep
   * their source-file order at the end, so newly processed photos show up
   * automatically without needing to edit the order file.
   */
  private applyOrder(category: PhotoCategory, photos: Photo[]): Photo[] {
    const idOrder = this.order[category]
    if (!idOrder || idOrder.length === 0) return [...photos]
    const rank = new Map(idOrder.map((id, i) => [id, i]))
    return [...photos].sort((a, b) => {
      const ra = rank.has(a.id) ? rank.get(a.id)! : Number.POSITIVE_INFINITY
      const rb = rank.has(b.id) ? rank.get(b.id)! : Number.POSITIVE_INFINITY
      return ra - rb
    })
  }

  /**
   * Replace the order for a category (dev-only). Persists via the Vite
   * /__order endpoint and updates the in-memory gallery.
   */
  async saveOrder(category: PhotoCategory, ids: string[]): Promise<void> {
    this.order = { ...this.order, [category]: ids }
    const gallery = this.galleries.get(category)
    if (gallery) {
      gallery.photos = this.applyOrder(category, this.photos[category] || [])
      gallery.coverPhoto = gallery.photos[0]
    }
    const res = await fetch('/__order', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ [category]: ids }),
    })
    if (!res.ok) throw new Error(`save failed: ${res.status} ${await res.text()}`)
  }

  getCategories(): PhotoCategory[] {
    // Return categories in the original website order
    const orderedCategories: PhotoCategory[] = [
      'bird', 'landscape', 'portrait', 'concert', 
      'architecture', 'nature', 'product', 'astro', 'sports', 'cat', 'street', 'wildlife'
    ]
    return orderedCategories.filter(category => this.galleries.has(category))
  }

  getGallery(category: PhotoCategory): Gallery | undefined {
    return this.galleries.get(category)
  }

  getCurrentGallery(): Gallery | undefined {
    return this.galleries.get(this.currentCategory)
  }

  getCurrentCategory(): PhotoCategory {
    return this.currentCategory
  }

  setCategory(category: PhotoCategory) {
    if (this.galleries.has(category)) {
      this.currentCategory = category
      this.notifyListeners()
    }
  }

  onCategoryChange(listener: (category: PhotoCategory) => void) {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private notifyListeners() {
    this.listeners.forEach(listener => listener(this.currentCategory))
  }

  getPhotoById(id: string): Photo | undefined {
    for (const gallery of this.galleries.values()) {
      const photo = gallery.photos.find(p => p.id === id)
      if (photo) return photo
    }
    return undefined
  }

  getTotalPhotoCount(): number {
    let count = 0
    for (const gallery of this.galleries.values()) {
      count += gallery.photos.length
    }
    return count
  }
}

// Singleton instance
export const galleryManager = new GalleryManager()