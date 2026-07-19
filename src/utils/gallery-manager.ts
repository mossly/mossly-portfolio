import type { Photo, PhotoCategory, Gallery } from '../types/photo'
import { GALLERY_CONFIG, PUBLIC_CATEGORY_ORDER } from '../config/images'

export class GalleryManager {
  private photos: Record<PhotoCategory, Photo[]> = {} as Record<PhotoCategory, Photo[]>
  private galleries: Map<PhotoCategory, Gallery> = new Map()
  private currentCategory: PhotoCategory = 'highlights'
  private listeners: Set<(category: PhotoCategory) => void> = new Set()

  /**
   * Loads the gallery data from the live `/api/photos` endpoint (Phase 3G).
   * Must be awaited before any other method is used. Order is now baked into
   * D1 `sort_order` and the API already returns rows pre-ordered per
   * category, so there is no client-side order merge step anymore
   * (`applyOrder()` / `photo-order.json` are gone).
   *
   * On fetch failure, logs and leaves the gallery in an empty state rather
   * than throwing -- callers get a working (if photo-less) page instead of a
   * hard crash.
   */
  async init(): Promise<void> {
    try {
      const res = await fetch('/api/photos')
      if (!res.ok) {
        throw new Error(`/api/photos responded ${res.status}`)
      }
      this.photos = (await res.json()) as Record<PhotoCategory, Photo[]>
    } catch (err) {
      console.error('Failed to load photos from /api/photos:', err)
      this.photos = {} as Record<PhotoCategory, Photo[]>
    }
    this.initializeGalleries()
  }

  private initializeGalleries() {
    this.galleries = new Map()
    for (const [category, photos] of Object.entries(this.photos)) {
      const config = GALLERY_CONFIG[category as PhotoCategory]
      if (!config) continue
      const list = photos as Photo[]
      this.galleries.set(category as PhotoCategory, {
        category: category as PhotoCategory,
        displayName: config.displayName,
        photos: list,
        coverPhoto: list[0] as Photo,
      })
    }
    // The default landing gallery ('highlights') is synthetic and only exists
    // once at least one photo is flagged -- fall back to the first available
    // gallery so the page never boots pointed at a gallery that isn't there.
    if (!this.galleries.has(this.currentCategory)) {
      const first = this.getCategories()[0]
      if (first) this.currentCategory = first
    }
  }

  /**
   * Dev-only, in-memory reorder used by gallery.ts's drag-and-drop grid
   * (`import.meta.env.DEV` only). Order is now the D1 `sort_order` column
   * (persisted via the admin `PUT /api/admin/photos/order`, Phase 3F) --
   * this no longer writes anywhere, it just re-sorts the current session's
   * in-memory list so the drag interaction still reflects visually. Slated
   * for removal alongside the rest of the dev-only public-gallery sortable
   * in Phase 3I.
   */
  reorderInMemory(category: PhotoCategory, ids: string[]) {
    const gallery = this.galleries.get(category)
    if (!gallery) return
    const rank = new Map(ids.map((id, i) => [id, i]))
    gallery.photos = [...gallery.photos].sort((a, b) => {
      const ra = rank.has(a.id) ? rank.get(a.id)! : Number.POSITIVE_INFINITY
      const rb = rank.has(b.id) ? rank.get(b.id)! : Number.POSITIVE_INFINITY
      return ra - rb
    })
    gallery.coverPhoto = gallery.photos[0]
  }

  getCategories(): PhotoCategory[] {
    // Return categories in the original website order (single source:
    // PUBLIC_CATEGORY_ORDER -- highlights first, then the real categories)
    return PUBLIC_CATEGORY_ORDER.filter(category => this.galleries.has(category))
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

// Singleton instance. Sync-constructed but data-empty until `init()`
// resolves -- callers (app.ts) must `await galleryManager.init()` before
// rendering.
export const galleryManager = new GalleryManager()
