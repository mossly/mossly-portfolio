# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview
This is Aaron Moss's photography portfolio website - a static site showcasing photography work across multiple categories. The site is hosted on GitHub Pages at mossly.github.io.

## Architecture
- **Static HTML/CSS/JS** - No build process or modern framework
- **Bootstrap 3.x** - UI framework (outdated version)
- **jQuery 3.3.1** - DOM manipulation and dynamic content loading
- **Lightbox.js** - Image gallery modal functionality
- **No package manager** - All dependencies are vendored in the repository

## Key Files
- `index.html` - Single-page application containing all galleries
- `nav.html` - Navigation component loaded dynamically via jQuery
- `css/custom.css` - Custom styles on top of Bootstrap
- `images/` - Photography organized by category subdirectories

## Image Management
- Images are stored in `/images/[category]/` folders
- Each image has two versions:
  - `.jpg` - Full resolution for lightbox display
  - `.webp` - Optimized thumbnails for gallery view
- Categories: wildlife, landscape, portrait, concert, architecture, nature, product, astro, sports, cat
- Manual optimization required (no automated build process)

## Common Tasks

### Adding New Photos
1. Place images in appropriate category folder under `/images/`
2. Create both `.jpg` and `.webp` versions
3. Add image HTML to the corresponding gallery section in `index.html`:
```html
<div class="col-xs-6 col-sm-4 col-md-3">
  <a href="images/[category]/[filename].jpg" data-lightbox="[category]" data-title="">
    <img data-src="images/[category]/[filename].webp" class="lazyload">
  </a>
</div>
```

### Creating WebP Versions
Since there's no build process, use command-line tools or image editors to create WebP versions manually.

### Testing Changes
Simply open `index.html` in a browser - no server required for basic functionality.

### Deployment
Push changes to the main branch - GitHub Pages will automatically deploy.

## Performance Considerations
- The first gallery (wildlife) loads eagerly, others use lazy loading
- WebP format is used for thumbnails to improve load times
- No minification or bundling - consider adding if performance becomes an issue

## Potential Improvements
- Upgrade Bootstrap from v3 to v5
- Add build process for automated image optimization
- Consider modern framework for better maintainability
- Implement proper image srcset for responsive images