interface FooterOptions {
  quote?: string
  author?: string
}

export class Footer {
  private container: HTMLElement | null = null
  private options: FooterOptions

  constructor(containerId: string = 'footer', options: FooterOptions = {}) {
    this.options = options
    
    const container = document.getElementById(containerId)
    if (!container) {
      console.error(`Footer container with id "${containerId}" not found`)
      return
    }

    this.container = container
    this.render()
  }

  private formatQuote(quote: string): string {
    // Add quotes and preserve any emphasis
    return `"${quote}"`
  }

  private formatAuthor(author: string): string {
    // Check if author includes a year in parentheses
    const match = author.match(/^(.+?)\s*\((\d{4})\)$/)
    if (match) {
      return `${match[1]} <cite class="not-italic">(${match[2]})</cite>`
    }
    return author
  }

  private render(): void {
    if (!this.container) return

    this.container.innerHTML = `
      <!-- Divider -->
      <hr class="border-[#4A5568] my-8">

      <!-- Quote Section -->
      <div class="container mx-auto px-4 pt-2">
        <figure>
          <blockquote class="pl-5 border-l-4 border-[#4A5568] text-lg mb-2">
            <p class="mb-0">${this.formatQuote(this.options.quote || "The world is but a canvas to our imagination.")}</p>
          </blockquote>
          <figcaption class="pl-5 text-base-content/60">
            — ${this.formatAuthor(this.options.author || 'Henry David Thoreau')}
          </figcaption>
        </figure>
      </div>

      <!-- Footer -->
      <footer class="text-base-content/60 pt-4 pb-8">
        <div class="container mx-auto px-4">
          <p class="text-right">
            <a href="#" class="text-base-content/60 hover:text-base-content">Back to top</a>
          </p>
        </div>
      </footer>
    `

    // Add smooth scroll for "Back to top" link
    const backToTop = this.container.querySelector('a[href="#"]')
    if (backToTop) {
      backToTop.addEventListener('click', (e) => {
        e.preventDefault()
        window.scrollTo({ top: 0, behavior: 'smooth' })
      })
    }
  }

  destroy(): void {
    if (this.container) {
      this.container.innerHTML = ''
    }
  }
}