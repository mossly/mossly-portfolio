import { promises as fs } from 'fs'
import path from 'path'
import { JSDOM } from 'jsdom'

// Map old category names to new ones
const CATEGORY_MAP: Record<string, string> = {
  'wildlifeGallery': 'wildlife',
  'landscapeGallery': 'landscape',
  'portraitGallery': 'portrait',
  'concertGallery': 'concert',
  'architectureGallery': 'architecture',
  'natureGallery': 'nature',
  'productGallery': 'product',
  'astroGallery': 'astro',
  'sportsGallery': 'sports',
  'catGallery': 'cat',
}

async function extractPhotosFromArchive() {
  console.log('📋 Extracting photos from archived HTML...')
  
  const htmlContent = await fs.readFile('./archive/index.html', 'utf-8')
  const dom = new JSDOM(htmlContent)
  const document = dom.window.document
  
  const photosByCategory: Record<string, string[]> = {}
  
  // Find all gallery divs
  for (const [oldId, newCategory] of Object.entries(CATEGORY_MAP)) {
    const galleryDiv = document.getElementById(oldId)
    if (!galleryDiv) continue
    
    const images = galleryDiv.querySelectorAll('a[data-lightbox] img')
    const filenames: string[] = []
    
    images.forEach((img) => {
      const src = img.getAttribute('src')
      if (src) {
        // Extract filename from path like "images/wildlife/filename.webp"
        const match = src.match(/images\/\w+\/(.+)\.webp$/)
        if (match) {
          const originalFilename = match[1] + '.jpg'
          filenames.push(originalFilename)
        }
      }
    })
    
    if (filenames.length > 0) {
      photosByCategory[newCategory] = filenames
      console.log(`  Found ${filenames.length} photos in ${newCategory}`)
    }
  }
  
  // Save the mapping
  await fs.writeFile(
    './scripts/existing-photos.json',
    JSON.stringify(photosByCategory, null, 2)
  )
  
  console.log('✅ Photo extraction complete!')
  return photosByCategory
}

extractPhotosFromArchive().catch(console.error)