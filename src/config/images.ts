export const IMAGE_SIZES = {
  thumbnail: { width: 400, height: 400 },
  small: { width: 800, height: 800 },
  medium: { width: 1200, height: 1200 },
  large: { width: 1920, height: 1920 },
} as const

export const IMAGE_FORMATS = ['webp', 'avif'] as const

export const GALLERY_CONFIG = {
  wildlife: { displayName: 'BIRD' },
  landscape: { displayName: 'LANDSCAPE' },
  portrait: { displayName: 'PORTRAIT' },
  concert: { displayName: 'CONCERT' },
  architecture: { displayName: 'ARCHITECTURE' },
  nature: { displayName: 'NATURE' },
  product: { displayName: 'PRODUCT' },
  astro: { displayName: 'ASTRO' },
  sports: { displayName: 'SPORTS' },
  cat: { displayName: 'CAT' },
} as const

export const SOURCE_IMAGE_DIR = './public/images'
export const PROCESSED_IMAGE_DIR = './public/processed'
export const PHOTO_DATA_FILE = './src/data/photos.json'