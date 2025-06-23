export type PhotoCategory = 
  | 'wildlife'
  | 'bird'
  | 'landscape'
  | 'portrait'
  | 'concert'
  | 'architecture'
  | 'nature'
  | 'product'
  | 'astro'
  | 'sports'
  | 'cat'

export interface PhotoMetadata {
  camera?: string
  lens?: string
  iso?: number
  aperture?: string
  shutterSpeed?: string
  focalLength?: string
  dateTaken?: string
  location?: string
}

export interface ImageVariant {
  url: string
  width: number
  height: number
  format: 'webp' | 'avif' | 'jpg'
}

export interface Photo {
  id: string
  filename: string
  category: PhotoCategory
  title?: string
  description?: string
  metadata: PhotoMetadata
  variants: {
    thumbnail: ImageVariant
    small: ImageVariant
    medium: ImageVariant
    large: ImageVariant
    original: ImageVariant
  }
  blurDataUrl?: string
  dominantColor?: string
  aspectRatio: number
}

export interface Gallery {
  category: PhotoCategory
  displayName: string
  description?: string
  photos: Photo[]
  coverPhoto?: Photo
}