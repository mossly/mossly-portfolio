import type { Photo, PhotoCategory, Gallery } from '../types/photo'
import { GALLERY_CONFIG } from '../config/images'
import photosData from '../data/photos.json'

export class GalleryManager {
  private photos: Record<PhotoCategory, Photo[]>
  private galleries: Map<PhotoCategory, Gallery>
  private currentCategory: PhotoCategory = 'wildlife'
  private listeners: Set<(category: PhotoCategory) => void> = new Set()

  constructor() {
    this.photos = photosData as Record<PhotoCategory, Photo[]>
    this.galleries = new Map()
    this.initializeGalleries()
  }

  private initializeGalleries() {
    for (const [category, photos] of Object.entries(this.photos)) {
      const config = GALLERY_CONFIG[category as PhotoCategory]
      this.galleries.set(category as PhotoCategory, {
        category: category as PhotoCategory,
        displayName: config.displayName,
        photos: photos as Photo[],
        coverPhoto: photos[0] as Photo,
      })
    }
  }

  getCategories(): PhotoCategory[] {
    return Array.from(this.galleries.keys())
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