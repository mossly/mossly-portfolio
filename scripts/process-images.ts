import sharp from 'sharp'
import { promises as fs } from 'fs'
import path from 'path'
import crypto from 'crypto'
import exifr from 'exifr'

function sanitizeFilename(filename: string): string {
  return filename
    .replace(/ā/g, 'a')
    .replace(/ē/g, 'e') 
    .replace(/ī/g, 'i')
    .replace(/ō/g, 'o')
    .replace(/ū/g, 'u')
    .replace(/Ā/g, 'A')
    .replace(/Ē/g, 'E')
    .replace(/Ī/g, 'I') 
    .replace(/Ō/g, 'O')
    .replace(/Ū/g, 'U')
}

function restoreProperTitle(sanitizedName: string): string {
  // Restore proper Māori names with macrons
  const titleMap: Record<string, string> = {
    'Kaka': 'Kākā',
    'Kaka Duo': 'Kākā Duo', 
    'Kaka in Flight': 'Kākā in Flight',
    'Kakariki': 'Kākāriki',
    'Kereru': 'Kererū',
    'Kokako': 'Kōkako',
    'Kotaku': 'Kōtaku',
    'Piwakawaka': 'Pīwakawaka',
    'Tui and Kowhai': 'Tui and Kōwhai',
  }
  
  return titleMap[sanitizedName] || sanitizedName
}
import { 
  IMAGE_SIZES, 
  IMAGE_FORMATS, 
  SOURCE_IMAGE_DIR,
  PROCESSED_IMAGE_DIR,
  PHOTO_DATA_FILE 
} from '../src/config/images'
import type { Photo, PhotoCategory, ImageVariant } from '../src/types/photo'

interface ProcessedImage {
  photo: Photo
  category: PhotoCategory
}

async function ensureDirectoryExists(dir: string) {
  try {
    await fs.mkdir(dir, { recursive: true })
  } catch (error) {
    console.error(`Error creating directory ${dir}:`, error)
  }
}

async function getImageMetadata(imagePath: string) {
  try {
    const metadata = await sharp(imagePath).metadata()
    const stats = await fs.stat(imagePath)
    
    // Extract EXIF data
    let exifData: any = null
    try {
      exifData = await exifr.parse(imagePath, {
        pick: ['DateTimeOriginal', 'Make', 'Model', 'LensModel', 'ISO', 
               'FNumber', 'ExposureTime', 'FocalLength']
      })
    } catch (exifError) {
      console.log(`No EXIF data found for ${imagePath}`)
    }
    
    // Use EXIF date if available, otherwise fall back to file creation date
    let dateTaken = stats.birthtime.toISOString()
    if (exifData?.DateTimeOriginal) {
      dateTaken = new Date(exifData.DateTimeOriginal).toISOString()
    }
    
    return {
      width: metadata.width || 0,
      height: metadata.height || 0,
      aspectRatio: (metadata.width || 1) / (metadata.height || 1),
      dateTaken,
      // Extract camera info from EXIF
      camera: exifData?.Make && exifData?.Model 
        ? `${exifData.Make} ${exifData.Model}`.replace(/\s+/g, ' ').trim()
        : undefined,
      lens: exifData?.LensModel,
      iso: exifData?.ISO,
      aperture: exifData?.FNumber ? `f/${exifData.FNumber}` : undefined,
      shutterSpeed: exifData?.ExposureTime 
        ? exifData.ExposureTime < 1 
          ? `1/${Math.round(1/exifData.ExposureTime)}s`
          : `${exifData.ExposureTime}s`
        : undefined,
      focalLength: exifData?.FocalLength ? `${exifData.FocalLength}mm` : undefined,
    }
  } catch (error) {
    console.error(`Error getting metadata for ${imagePath}:`, error)
    return null
  }
}

async function generateBlurDataUrl(imagePath: string): Promise<string> {
  try {
    const buffer = await sharp(imagePath)
      .resize(10, 10, { fit: 'inside' })
      .blur()
      .toBuffer()
    
    return `data:image/jpeg;base64,${buffer.toString('base64')}`
  } catch (error) {
    console.error(`Error generating blur data URL for ${imagePath}:`, error)
    return ''
  }
}

async function processImage(
  sourcePath: string, 
  filename: string, 
  category: PhotoCategory
): Promise<Photo | null> {
  try {
    const metadata = await getImageMetadata(sourcePath)
    if (!metadata) return null
    
    const id = crypto.createHash('md5').update(`${category}-${filename}`).digest('hex')
    const baseFilename = path.parse(filename).name
    const sanitizedFilename = sanitizeFilename(baseFilename)
    const categoryDir = path.join(PROCESSED_IMAGE_DIR, category)
    
    
    await ensureDirectoryExists(categoryDir)
    
    // Rename original file if it contains macrons
    let actualFilename = filename
    if (baseFilename !== sanitizedFilename) {
      const sanitizedOriginalFilename = `${sanitizedFilename}${path.extname(filename)}`
      const sanitizedOriginalPath = path.join(path.dirname(sourcePath), sanitizedOriginalFilename)
      await fs.rename(sourcePath, sanitizedOriginalPath)
      sourcePath = sanitizedOriginalPath
      actualFilename = sanitizedOriginalFilename
    }
    
    const variants: Photo['variants'] = {
      medium: {} as ImageVariant,
      original: {} as ImageVariant,
    }
    
    // Process each size variant
    for (const [sizeName, dimensions] of Object.entries(IMAGE_SIZES)) {
      const sizeDir = path.join(categoryDir, sizeName)
      await ensureDirectoryExists(sizeDir)
      
      // Process WebP version (primary format)
      const webpFilename = `${sanitizedFilename}.webp`
      const webpPath = path.join(sizeDir, webpFilename)
      
      await sharp(sourcePath)
        .resize(dimensions.width, dimensions.height, { 
          fit: 'inside',
          withoutEnlargement: true 
        })
        .webp({ quality: 85 })
        .toFile(webpPath)
      
      const processedMetadata = await sharp(webpPath).metadata()
      
      variants[sizeName as keyof typeof variants] = {
        url: `/processed/${category}/${sizeName}/${webpFilename}`,
        width: processedMetadata.width || dimensions.width,
        height: processedMetadata.height || dimensions.height,
        format: 'webp'
      }
    }
    
    // Reference original with actual filename (now sanitized)
    variants.original = {
      url: `/images/${category}/${actualFilename}`,
      width: metadata.width,
      height: metadata.height,
      format: path.extname(actualFilename).slice(1).toLowerCase() as 'jpg' | 'png'
    }
    
    // Generate blur placeholder
    const blurDataUrl = await generateBlurDataUrl(sourcePath)
    
    const photo: Photo = {
      id,
      filename: actualFilename,
      category,
      title: restoreProperTitle(baseFilename.replace(/_/g, ' ').replace(/-/g, ' ')), // Restore proper Māori names
      metadata: {
        dateTaken: metadata.dateTaken,
        camera: metadata.camera,
        lens: metadata.lens,
        iso: metadata.iso,
        aperture: metadata.aperture,
        shutterSpeed: metadata.shutterSpeed,
        focalLength: metadata.focalLength,
      },
      variants,
      blurDataUrl,
      aspectRatio: metadata.aspectRatio,
    }
    
    return photo
  } catch (error) {
    console.error(`Error processing ${sourcePath}:`, error)
    return null
  }
}

async function processAllImages() {
  console.log('🖼️  Starting image processing...')
  
  // Clear existing processed folder
  try {
    await fs.rm(PROCESSED_IMAGE_DIR, { recursive: true, force: true })
    console.log('🗑️  Cleared existing processed images')
  } catch (error) {
    console.log('📁 No existing processed folder to clear')
  }
  
  // Ensure processed directory exists
  await ensureDirectoryExists(PROCESSED_IMAGE_DIR)
  
  const processedImages: ProcessedImage[] = []
  const categories = await fs.readdir(SOURCE_IMAGE_DIR)
  
  for (const category of categories) {
    const categoryPath = path.join(SOURCE_IMAGE_DIR, category)
    const stats = await fs.stat(categoryPath)
    
    if (!stats.isDirectory()) continue
    
    console.log(`📁 Processing ${category} gallery...`)
    
    const files = await fs.readdir(categoryPath)
    const imageFiles = files.filter(file => 
      /\.(jpg|jpeg|png)$/i.test(file) && !file.includes('.webp')
    )
    
    for (const file of imageFiles) {
      const sourcePath = path.join(categoryPath, file)
      console.log(`  📸 Processing ${file}...`)
      
      const photo = await processImage(sourcePath, file, category as PhotoCategory)
      if (photo) {
        processedImages.push({ photo, category: category as PhotoCategory })
      }
    }
  }
  
  // Group photos by category and sort by capture date
  const photosByCategory: Record<string, Photo[]> = {}
  for (const { photo, category } of processedImages) {
    if (!photosByCategory[category]) {
      photosByCategory[category] = []
    }
    photosByCategory[category].push(photo)
  }
  
  // Sort each category by capture date (newest first)
  for (const category in photosByCategory) {
    photosByCategory[category].sort((a, b) => {
      const dateA = new Date(a.metadata.dateTaken || 0)
      const dateB = new Date(b.metadata.dateTaken || 0)
      return dateB.getTime() - dateA.getTime() // Newest first
    })
  }
  
  // Save photo data
  await ensureDirectoryExists(path.dirname(PHOTO_DATA_FILE))
  await fs.writeFile(
    PHOTO_DATA_FILE, 
    JSON.stringify(photosByCategory, null, 2)
  )
  
  console.log(`\n✅ Processed ${processedImages.length} images!`)
  console.log(`📄 Photo data saved to ${PHOTO_DATA_FILE}`)
}

// Run the script
processAllImages().catch(console.error)