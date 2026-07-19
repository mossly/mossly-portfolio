import type { PhotoCategory } from '../types/photo'

export const IMAGE_SIZES = {
  medium: { width: 1200, height: 1200 },
} as const

export const IMAGE_FORMATS = ['webp'] as const

// Single source of truth for the ordered category list (runtime).
// The PhotoCategory union in types/photo.ts is the compile-time source.
// Excludes 'highlights': it is a synthetic gallery (photos flagged
// is_highlight keep their real category), so it must never be an assignable
// photos.category value -- admin validation uses this list.
export const CATEGORY_ORDER: PhotoCategory[] = [
  'bird', 'landscape', 'portrait', 'concert',
  'architecture', 'nature', 'product', 'astro', 'sports', 'cat', 'street', 'wildlife',
]

// Tab order on the public site: the synthetic highlights gallery first, then
// the real categories.
export const PUBLIC_CATEGORY_ORDER: PhotoCategory[] = ['highlights', ...CATEGORY_ORDER]

export const GALLERY_CONFIG = {
  highlights: { displayName: 'HIGHLIGHTS' },
  bird: { displayName: 'BIRD' },
  landscape: { displayName: 'LANDSCAPE' },
  portrait: { displayName: 'PORTRAIT' },
  concert: { displayName: 'CONCERT' },
  architecture: { displayName: 'ARCHITECTURE' },
  nature: { displayName: 'NATURE' },
  product: { displayName: 'PRODUCT' },
  astro: { displayName: 'ASTRO' },
  sports: { displayName: 'SPORTS' },
  cat: { displayName: 'CAT' },
  street: { displayName: 'STREET' },
  wildlife: { displayName: 'WILDLIFE' },
  about: { displayName: 'ABOUT' },
  projects: { displayName: 'PROJECTS' },
} as const

export const SOURCE_IMAGE_DIR = './public/images'
export const PROCESSED_IMAGE_DIR = './public/processed'
export const PHOTO_DATA_FILE = './src/data/photos.json'