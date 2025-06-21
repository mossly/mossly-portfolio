# Photography Portfolio Modernization Roadmap

## Overview
This roadmap outlines the complete overhaul of the photography portfolio from a static Bootstrap 3 site to a modern, dynamic Vite + TypeScript + Tailwind CSS application deployed on Cloudflare Pages.

## Current Pain Points
1. **Manual photo management** - Adding photos requires manual HTML editing
2. **Manual WebP conversion** - Preview images must be created by hand
3. **Poor mobile experience** - Navigation doesn't work well on mobile devices
4. **Outdated technology** - Bootstrap 3, jQuery, no build process
5. **No content management** - Everything is hardcoded in HTML

## Target Architecture
- **Frontend**: TypeScript + Vite + React/Vue (TBD)
- **Styling**: Tailwind CSS + DaisyUI
- **Image Processing**: Sharp (build-time optimization)
- **Deployment**: Cloudflare Pages (from GitHub)
- **Domain**: mossly.org

## Phase 1: Setup Modern Development Environment
**Timeline**: 1-2 days

### Tasks:
1. Initialize npm project with TypeScript configuration
2. Set up Vite with TypeScript support
3. Install and configure Tailwind CSS and DaisyUI
4. Set up Sharp for image optimization pipeline
5. Configure ESLint and Prettier
6. Create proper `.gitignore` file
7. Set up development scripts in `package.json`

### Deliverables:
- Working Vite dev server
- TypeScript compilation
- Tailwind CSS with DaisyUI components available
- Basic project structure

## Phase 2: Create Dynamic Gallery System
**Timeline**: 3-4 days

### Tasks:
1. Design photo metadata schema (JSON/YAML):
   ```json
   {
     "filename": "DSC_1234.jpg",
     "category": "wildlife",
     "title": "Blue Jay in Flight",
     "date": "2024-01-15",
     "camera": "Nikon Z8",
     "lens": "500mm f/5.6",
     "settings": "1/2000s, f/5.6, ISO 800",
     "location": "Wellington, NZ"
   }
   ```

2. Build image processing pipeline:
   - Auto-generate WebP previews (multiple sizes)
   - Create AVIF variants for modern browsers
   - Generate blur placeholders
   - Extract EXIF data automatically
   - Create srcset for responsive images

3. Create TypeScript interfaces:
   ```typescript
   interface Photo {
     id: string;
     filename: string;
     category: Category;
     title?: string;
     metadata: PhotoMetadata;
     variants: ImageVariants;
   }
   ```

4. Build gallery component system
5. Create CLI tool for adding photos:
   ```bash
   npm run add-photo -- --file="DSC_1234.jpg" --category="wildlife"
   ```

### Deliverables:
- Automated image processing pipeline
- Dynamic gallery rendering from data
- Easy photo addition workflow

## Phase 3: UI/UX Redesign
**Timeline**: 2-3 days

### Tasks:
1. Design mobile-first navigation:
   - DaisyUI drawer for mobile
   - Horizontal navbar for desktop
   - Smooth transitions

2. Implement responsive masonry layout:
   - Use CSS Grid or Flexbox
   - Maintain aspect ratios
   - Smooth loading animations

3. Modern lightbox implementation:
   - Touch gestures for mobile
   - Keyboard navigation
   - Metadata display
   - Zoom functionality

4. Dark/light mode:
   - System preference detection
   - Manual toggle
   - Persist preference

5. Improve category selection:
   - Tag/chip UI instead of buttons
   - Show photo count per category
   - Active state indicators

### Deliverables:
- Fully responsive design
- Modern, accessible UI
- Smooth interactions

## Phase 4: Core Features Implementation
**Timeline**: 2-3 days

### Tasks:
1. Advanced filtering:
   - Multiple category selection
   - Date range filtering
   - Camera/lens filtering

2. Search functionality:
   - Search by title
   - Search by metadata
   - Instant results

3. Performance optimizations:
   - Intersection Observer for lazy loading
   - Virtual scrolling for large galleries
   - Preload adjacent images in lightbox

4. URL routing:
   - Deep linking to categories
   - Shareable photo URLs
   - Browser history support

5. Keyboard shortcuts:
   - Arrow keys for navigation
   - ESC to close lightbox
   - Number keys for categories

### Deliverables:
- Rich filtering and search
- Excellent performance
- Better accessibility

## Phase 5: Cloudflare Pages Deployment
**Timeline**: 1 day

### Tasks:
1. Configure build settings:
   ```yaml
   build_command: npm run build
   publish_directory: dist
   ```

2. Environment variables:
   - `NODE_ENV=production`
   - Image optimization settings

3. Cloudflare optimizations:
   - Polish for automatic image optimization
   - Caching rules
   - Page rules for assets

4. Analytics setup:
   - Cloudflare Web Analytics
   - Core Web Vitals monitoring

5. Domain configuration:
   - Ensure mossly.org is properly configured
   - Set up redirects if needed

### Deliverables:
- Automated deployment pipeline
- Optimized asset delivery
- Analytics dashboard

## Phase 6: Content Management (Optional)
**Timeline**: 2-3 days

### Tasks:
1. Protected admin route:
   - Cloudflare Access for authentication
   - Upload interface

2. Drag-and-drop uploads:
   - Multiple file selection
   - Progress indicators
   - Automatic categorization

3. Gallery management:
   - Reorder photos
   - Edit metadata
   - Bulk operations

4. Backup system:
   - Export photo metadata
   - GitHub backups

### Deliverables:
- Self-service photo management
- No code editing required

## Migration Strategy

### Step 1: Parallel Development
- Keep existing site running
- Develop new version in `/v2` directory
- Test thoroughly

### Step 2: Content Migration
- Script to parse existing HTML
- Extract image references
- Generate metadata files

### Step 3: Gradual Rollout
- Deploy to staging URL
- Test on various devices
- Get feedback

### Step 4: Final Switch
- Update Cloudflare Pages settings
- Monitor for issues
- Keep old version archived

## Success Metrics
- **Page Load Speed**: < 2s on 3G
- **Lighthouse Score**: > 95 all categories
- **Time to Add Photo**: < 30 seconds
- **Mobile Usability**: Pass all tests
- **Build Time**: < 60 seconds

## Future Enhancements
- Blog integration
- Client galleries with passwords
- Print ordering integration
- AI-powered tagging
- Social media sharing optimization
- RSS feed for new photos

## Technical Decisions to Make
1. **Framework**: Pure Vite vs React vs Vue vs Svelte
2. **Image CDN**: Cloudflare Images vs self-hosted
3. **State Management**: If using framework
4. **Testing Strategy**: Unit tests, E2E tests
5. **CI/CD Pipeline**: GitHub Actions configuration

## Estimated Timeline
- **Total Duration**: 2-3 weeks for core features
- **Phase 1-5**: 10-13 days
- **Phase 6**: Optional, additional 2-3 days
- **Buffer**: 1 week for testing and refinements

This modernization will transform the portfolio from a static site requiring manual updates to a dynamic, performant application that makes adding new photos as simple as dropping files in a folder.