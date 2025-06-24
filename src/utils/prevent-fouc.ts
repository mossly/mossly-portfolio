export function preventFOUC() {
  // Mark HTML as ready when CSS is loaded
  const markReady = () => {
    document.documentElement.classList.add('ready')
  }

  // Check if all stylesheets are loaded
  const checkStylesheets = () => {
    const styleSheets = Array.from(document.styleSheets)
    const allLoaded = styleSheets.length > 0 && styleSheets.every(sheet => {
      try {
        return sheet.cssRules !== null
      } catch (e) {
        // External stylesheets might throw security errors
        return true
      }
    })

    if (allLoaded) {
      markReady()
    } else {
      // Retry in a moment
      requestAnimationFrame(checkStylesheets)
    }
  }

  // Start checking once DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', checkStylesheets)
  } else {
    checkStylesheets()
  }

  // Much faster fallback: 100ms should be enough for local styles
  setTimeout(markReady, 100)
}