export const IMAGE_SIZES = {
  medium: { width: 1200, height: 1200 },
} as const

export const IMAGE_FORMATS = ['webp', 'avif'] as const

export const GALLERY_CONFIG = {
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
} as const

export const SOURCE_IMAGE_DIR = './public/images'
export const PROCESSED_IMAGE_DIR = './public/processed'
export const PHOTO_DATA_FILE = './src/data/photos.json'