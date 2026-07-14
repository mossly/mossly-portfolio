// Phase 3E-2 / 3E-3: admin page shell + management UI + browser upload pipeline.
// Phase 3F: drag-to-reorder (SortableJS -> PUT /api/admin/photos/order -> D1).
// See docs/phase-3e-plan.md ("3E-2", "3E-3") and docs/phase-3-plan.md ("3F") for
// the authoritative behavior.
import '../src/styles/main.css'
import Sortable from 'sortablejs'
import type { AdminPhoto, PhotoCategory, PhotoInsert, PhotoOrderUpdate, PhotoStatus } from '../src/types/photo'
import { CATEGORY_ORDER, GALLERY_CONFIG } from '../src/config/images'
import type { MainToWorkerMessage, ProcessedPhoto, WorkerToMainMessage } from './upload-types'

// Real Cloudflare custom domain in front of the R2 bucket (see wrangler.jsonc
// `IMAGES_BASE`). NOT emulated by `wrangler dev` locally (Miniflare's R2 has
// no public HTTP surface) -- thumbnails for photos uploaded during local
// testing will 404/broken-image there; that's expected, not a bug. See the
// PR body for how local verification confirms the R2 objects instead.
const IMAGES_BASE = 'https://images.mossly.org'

// Categories a photo may be filed under via this UI. Mirrors the backend's
// `isValidCategory` (validated against the same CATEGORY_ORDER list) -- 'about'
// and 'projects' are page-content rows, not gallery photos, and intentionally
// excluded from the upload/edit category choices (though existing rows in
// those categories still display in the grid).
const EDITABLE_CATEGORIES: PhotoCategory[] = CATEGORY_ORDER
const DISPLAY_CATEGORY_ORDER: PhotoCategory[] = [...CATEGORY_ORDER, 'about', 'projects']

type QueueState = 'processing' | 'uploading' | 'done' | 'duplicate' | 'error'

interface QueueItem {
  jobId: string
  name: string
  category: PhotoCategory
  title: string
  state: QueueState
  message?: string
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let photos: AdminPhoto[] = []
/** ids known to exist (live grid + already-completed uploads this session) --
 * the client dedup pre-check. Server `content_hash` UNIQUE is the authority. */
const knownIds = new Set<string>()
const queue = new Map<string, QueueItem>()
const queueOrder: string[] = []
let editingId: string | null = null
/** Live Sortable instances, one per rendered category's live-photo grid --
 * always destroyed before `render()` rebuilds the DOM, so a re-render never
 * leaves a Sortable instance bound to a detached node. */
let sortables: Sortable[] = []

// ---------------------------------------------------------------------------
// DOM refs
// ---------------------------------------------------------------------------

const galleryRoot = document.getElementById('gallery-root') as HTMLElement
const loadingState = document.getElementById('loading-state') as HTMLElement
const errorState = document.getElementById('error-state') as HTMLElement
const statsEl = document.getElementById('admin-stats') as HTMLElement
const dropzone = document.getElementById('dropzone') as HTMLElement
const fileInput = document.getElementById('file-input') as HTMLInputElement
const categorySelect = document.getElementById('upload-category') as unknown as HTMLSelectElement
const uploadQueueEl = document.getElementById('upload-queue') as HTMLElement
const confirmRoot = document.getElementById('confirm-root') as HTMLElement

// ---------------------------------------------------------------------------
// Small utilities
// ---------------------------------------------------------------------------

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function showToast(message: string, error = false) {
  const toast = document.createElement('div')
  toast.textContent = message
  toast.className = `gallery-toast${error ? ' gallery-toast-error' : ''}`
  document.body.appendChild(toast)
  requestAnimationFrame(() => toast.classList.add('visible'))
  setTimeout(() => {
    toast.classList.remove('visible')
    setTimeout(() => toast.remove(), 200)
  }, 2000)
}

function categoryLabel(category: PhotoCategory): string {
  return GALLERY_CONFIG[category]?.displayName ?? category.toUpperCase()
}

/** In-page confirm modal (never `window.confirm` -- native dialogs block/annoy). */
function confirmDialog(message: string, confirmLabel = 'Delete'): Promise<boolean> {
  return new Promise(resolve => {
    confirmRoot.innerHTML = `
      <div class="modal modal-open" role="dialog">
        <div class="modal-box max-w-sm">
          <p class="py-2">${escapeHtml(message)}</p>
          <div class="modal-action">
            <button type="button" class="btn btn-sm" data-confirm="cancel">Cancel</button>
            <button type="button" class="btn btn-sm btn-error" data-confirm="ok">${escapeHtml(confirmLabel)}</button>
          </div>
        </div>
        <div class="modal-backdrop" data-confirm="cancel"></div>
      </div>
    `
    const cleanup = (result: boolean) => {
      confirmRoot.innerHTML = ''
      resolve(result)
    }
    confirmRoot.querySelectorAll<HTMLElement>('[data-confirm]').forEach(el => {
      el.addEventListener(
        'click',
        () => cleanup(el.getAttribute('data-confirm') === 'ok'),
        { once: true },
      )
    })
  })
}

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init)
  if (!res.ok) {
    let detail = ''
    try {
      const body = (await res.json()) as { error?: string } | null
      detail = body?.error ? `: ${body.error}` : ''
    } catch {
      // ignore -- non-JSON error body
    }
    throw new Error(`${init?.method ?? 'GET'} ${path} failed (${res.status})${detail}`)
  }
  return res.json() as Promise<T>
}

// ---------------------------------------------------------------------------
// Load + render
// ---------------------------------------------------------------------------

async function loadPhotos() {
  loadingState.classList.remove('hidden')
  errorState.classList.add('hidden')
  galleryRoot.innerHTML = ''
  try {
    const data = await apiFetch<{ photos: AdminPhoto[] }>('/api/admin/photos')
    photos = data.photos
    knownIds.clear()
    for (const photo of photos) knownIds.add(photo.id)
    loadingState.classList.add('hidden')
    render()
  } catch (err) {
    loadingState.classList.add('hidden')
    errorState.classList.remove('hidden')
    errorState.textContent = err instanceof Error ? err.message : String(err)
  }
}

function render() {
  const liveCount = photos.filter(p => !p.deleted_at).length
  statsEl.textContent = `${liveCount} live / ${photos.length} total`

  const byCategory = new Map<string, AdminPhoto[]>()
  for (const photo of photos) {
    const list = byCategory.get(photo.category)
    if (list) list.push(photo)
    else byCategory.set(photo.category, [photo])
  }

  const orderedCategories = [
    ...DISPLAY_CATEGORY_ORDER.filter(c => byCategory.has(c)),
    ...Array.from(byCategory.keys())
      .filter(c => !DISPLAY_CATEGORY_ORDER.includes(c as PhotoCategory))
      .sort(),
  ]

  galleryRoot.innerHTML = orderedCategories
    .map(category => {
      const items = byCategory.get(category) ?? []
      // Live photos are draggable (rendered in their own grid, ordered by
      // sort_order); soft-deleted photos are pinned in a second, non-sortable
      // grid at the end -- they're never part of the reorder.
      const live = items.filter(p => !p.deleted_at).sort((a, b) => a.sort_order - b.sort_order)
      const deleted = items.filter(p => p.deleted_at).sort((a, b) => a.sort_order - b.sort_order)
      return `
        <section data-category="${escapeHtml(category)}">
          <h2 class="text-lg font-bold uppercase tracking-wide mb-4">
            ${escapeHtml(categoryLabel(category as PhotoCategory))}
            <span class="text-sm font-normal text-base-content/50">(${items.length})</span>
          </h2>
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"
               data-sortable-category="${escapeHtml(category)}">
            ${live.map(renderCard).join('')}
          </div>
          ${deleted.length > 0
            ? `<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mt-4">
                 ${deleted.map(renderCard).join('')}
               </div>`
            : ''}
        </section>
      `
    })
    .join('')

  attachSortables()
}

// ---------------------------------------------------------------------------
// Drag-to-reorder (3F)
// ---------------------------------------------------------------------------

function destroySortables() {
  sortables.forEach(s => s.destroy())
  sortables = []
}

/**
 * Creates one Sortable instance per category's live-photo grid. Called at the
 * end of every `render()`, after old instances are torn down -- `render()`
 * always replaces `galleryRoot.innerHTML` wholesale, so any previous Sortable
 * instance would otherwise be left bound to now-detached DOM nodes.
 */
function attachSortables() {
  destroySortables()
  const containers = galleryRoot.querySelectorAll<HTMLElement>('[data-sortable-category]')
  containers.forEach(container => {
    const category = container.getAttribute('data-sortable-category') as PhotoCategory
    const sortable = Sortable.create(container, {
      animation: 150,
      ghostClass: 'sortable-ghost',
      chosenClass: 'sortable-chosen',
      dragClass: 'sortable-drag',
      forceFallback: true,
      onEnd: () => void handleReorder(category, container),
    })
    sortables.push(sortable)
  })
}

/**
 * Reads the post-drop DOM order for one category's live grid, applies it
 * optimistically to in-memory state, and persists it. On failure, reverts
 * the in-memory `sort_order`s and re-renders (which also rebuilds the DOM
 * back to the pre-drag order, since Sortable's own DOM mutation is discarded
 * along with the rest of `galleryRoot.innerHTML`).
 */
async function handleReorder(category: PhotoCategory, container: HTMLElement) {
  const newIds = Array.from(container.querySelectorAll<HTMLElement>('[data-photo-card]'))
    .map(el => el.getAttribute('data-photo-card'))
    .filter((id): id is string => !!id)

  const previousOrder = new Map<string, number>()
  for (const photo of photos) {
    if (photo.category === category && !photo.deleted_at) previousOrder.set(photo.id, photo.sort_order)
  }

  // No-op drop (dragged and released without changing order): skip the request.
  const previousIds = Array.from(previousOrder.keys()).sort(
    (a, b) => (previousOrder.get(a) ?? 0) - (previousOrder.get(b) ?? 0),
  )
  if (newIds.length === previousIds.length && newIds.every((id, i) => id === previousIds[i])) {
    return
  }

  // Optimistic UI: Sortable has already moved the DOM nodes for us; just
  // bring in-memory state in line with the new order (no re-render needed).
  newIds.forEach((id, index) => {
    const photo = photos.find(p => p.id === id)
    if (photo) photo.sort_order = index
  })

  try {
    const res = await fetch('/api/admin/photos/order', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ category, ids: newIds } satisfies PhotoOrderUpdate),
    })
    if (!res.ok) {
      let detail = ''
      try {
        const body = (await res.json()) as { error?: string } | null
        detail = body?.error ? `: ${body.error}` : ''
      } catch {
        // ignore -- non-JSON error body
      }
      throw new Error(`reorder failed (${res.status})${detail}`)
    }
  } catch (err) {
    for (const [id, sortOrder] of previousOrder) {
      const photo = photos.find(p => p.id === id)
      if (photo) photo.sort_order = sortOrder
    }
    render()
    showToast(err instanceof Error ? err.message : 'Reorder failed', true)
  }
}

function renderCard(photo: AdminPhoto): string {
  const isEditing = editingId === photo.id
  const isDeleted = !!photo.deleted_at
  const thumbUrl = `${IMAGES_BASE}/${photo.medium_key}`

  const badges = `
    ${isDeleted ? '<span class="badge badge-error badge-sm">DELETED</span>' : ''}
    ${!isDeleted && photo.status === 'draft' ? '<span class="badge badge-warning badge-sm">DRAFT</span>' : ''}
  `

  return `
    <div class="card bg-base-200 shadow-sm ${isDeleted ? 'opacity-50' : ''}" data-photo-card="${photo.id}">
      <figure class="aspect-[4/3] bg-base-300">
        <img src="${escapeHtml(thumbUrl)}" alt="${escapeHtml(photo.title)}" loading="lazy" class="w-full h-full object-cover">
      </figure>
      <div class="card-body p-3 gap-2">
        <div class="flex items-center gap-1 flex-wrap">${badges}</div>
        ${isEditing ? renderEditForm(photo) : renderView(photo)}
      </div>
    </div>
  `
}

function renderView(photo: AdminPhoto): string {
  return `
    <h3 class="font-semibold text-sm truncate" title="${escapeHtml(photo.title)}">${escapeHtml(photo.title || '(untitled)')}</h3>
    ${photo.description ? `<p class="text-xs text-base-content/60 line-clamp-2">${escapeHtml(photo.description)}</p>` : ''}
    <p class="text-xs text-base-content/40 truncate">${escapeHtml(photo.filename)}</p>
    <div class="card-actions justify-end mt-1 gap-1">
      <button type="button" class="btn btn-xs" data-action="edit" data-id="${photo.id}">Edit</button>
      ${!photo.deleted_at
        ? `<button type="button" class="btn btn-xs" data-action="toggle-status" data-id="${photo.id}">
             ${photo.status === 'published' ? 'Unpublish' : 'Publish'}
           </button>
           <button type="button" class="btn btn-xs btn-error btn-outline" data-action="delete" data-id="${photo.id}">Delete</button>`
        : ''}
    </div>
  `
}

function renderEditForm(photo: AdminPhoto): string {
  const categoryOptions = Array.from(new Set<PhotoCategory>([...EDITABLE_CATEGORIES, photo.category]))
    .map(c => `<option value="${c}" ${c === photo.category ? 'selected' : ''}>${escapeHtml(categoryLabel(c))}</option>`)
    .join('')
  return `
    <form data-action="save" data-id="${photo.id}" class="space-y-2">
      <input type="text" name="title" value="${escapeHtml(photo.title)}" placeholder="Title"
             class="input input-xs w-full" required>
      <textarea name="description" placeholder="Description"
                class="textarea textarea-xs w-full" rows="2">${escapeHtml(photo.description ?? '')}</textarea>
      <select name="category" class="select select-xs w-full">${categoryOptions}</select>
      <div class="card-actions justify-end gap-1">
        <button type="button" class="btn btn-xs" data-action="cancel-edit">Cancel</button>
        <button type="submit" class="btn btn-xs btn-primary">Save</button>
      </div>
    </form>
  `
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

function replacePhoto(updated: AdminPhoto) {
  const idx = photos.findIndex(p => p.id === updated.id)
  if (idx >= 0) photos[idx] = updated
  else photos.unshift(updated)
  knownIds.add(updated.id)
}

async function saveEdit(id: string, form: HTMLFormElement) {
  const data = new FormData(form)
  const title = String(data.get('title') ?? '').trim()
  const description = String(data.get('description') ?? '').trim()
  const category = String(data.get('category') ?? '') as PhotoCategory
  if (!title) {
    showToast('Title cannot be empty', true)
    return
  }
  try {
    const { photo } = await apiFetch<{ photo: AdminPhoto }>(`/api/admin/photos/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title, description: description || null, category }),
    })
    replacePhoto(photo)
    editingId = null
    showToast('Saved')
    render()
  } catch (err) {
    showToast(err instanceof Error ? err.message : 'Save failed', true)
  }
}

async function toggleStatus(photo: AdminPhoto) {
  const nextStatus: PhotoStatus = photo.status === 'published' ? 'draft' : 'published'
  try {
    const { photo: updated } = await apiFetch<{ photo: AdminPhoto }>(`/api/admin/photos/${photo.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: nextStatus }),
    })
    replacePhoto(updated)
    render()
  } catch (err) {
    showToast(err instanceof Error ? err.message : 'Update failed', true)
  }
}

async function deletePhotoHandler(photo: AdminPhoto) {
  const ok = await confirmDialog(`Delete "${photo.title || photo.filename}"? This soft-deletes the row (R2 objects are kept).`)
  if (!ok) return
  try {
    await apiFetch<{ ok: true }>(`/api/admin/photos/${photo.id}`, { method: 'DELETE' })
    photo.deleted_at = new Date().toISOString()
    render()
    showToast('Deleted')
  } catch (err) {
    showToast(err instanceof Error ? err.message : 'Delete failed', true)
  }
}

// ---------------------------------------------------------------------------
// Gallery event delegation
// ---------------------------------------------------------------------------

galleryRoot.addEventListener('click', event => {
  const target = event.target as HTMLElement
  const actionEl = target.closest<HTMLElement>('[data-action]')
  if (!actionEl) return
  const action = actionEl.getAttribute('data-action')
  const id = actionEl.getAttribute('data-id')

  if (action === 'edit' && id) {
    editingId = id
    render()
    return
  }
  if (action === 'cancel-edit') {
    editingId = null
    render()
    return
  }
  if (action === 'toggle-status' && id) {
    const photo = photos.find(p => p.id === id)
    if (photo) void toggleStatus(photo)
    return
  }
  if (action === 'delete' && id) {
    const photo = photos.find(p => p.id === id)
    if (photo) void deletePhotoHandler(photo)
    return
  }
})

galleryRoot.addEventListener('submit', event => {
  const form = event.target as HTMLFormElement
  if (form.getAttribute('data-action') !== 'save') return
  event.preventDefault()
  const id = form.getAttribute('data-id')
  if (id) void saveEdit(id, form)
})

// ---------------------------------------------------------------------------
// Upload pipeline (3E-3)
// ---------------------------------------------------------------------------

EDITABLE_CATEGORIES.forEach(category => {
  const opt = document.createElement('option')
  opt.value = category
  opt.textContent = categoryLabel(category)
  categorySelect.appendChild(opt)
})

const uploadWorker = new Worker(new URL('./upload-worker.ts', import.meta.url), { type: 'module' })

function renderQueue() {
  uploadQueueEl.innerHTML = queueOrder
    .map(jobId => queue.get(jobId))
    .filter((item): item is QueueItem => !!item)
    .map(item => {
      const badgeClass =
        item.state === 'done'
          ? 'badge-success'
          : item.state === 'error'
            ? 'badge-error'
            : item.state === 'duplicate'
              ? 'badge-warning'
              : 'badge-ghost'
      return `
        <li class="flex items-center gap-2 text-sm">
          <span class="badge badge-sm ${badgeClass}">${item.state}</span>
          <span class="truncate flex-1">${escapeHtml(item.name)}</span>
          ${item.message ? `<span class="text-xs text-error truncate max-w-xs">${escapeHtml(item.message)}</span>` : ''}
        </li>
      `
    })
    .join('')
}

function setQueueState(jobId: string, state: QueueState, message?: string) {
  const item = queue.get(jobId)
  if (!item) return
  item.state = state
  item.message = message
  renderQueue()
}

function defaultTitleFromFilename(name: string): string {
  return name.replace(/\.[^/.]+$/, '').replace(/[_-]+/g, ' ').trim() || name
}

function enqueueFiles(files: FileList | File[]) {
  const category = categorySelect.value as PhotoCategory
  for (const file of Array.from(files)) {
    if (file.type !== 'image/jpeg' && file.type !== 'image/png') {
      showToast(`Skipped "${file.name}": only JPEG/PNG accepted`, true)
      continue
    }
    const jobId = crypto.randomUUID()
    queue.set(jobId, {
      jobId,
      name: file.name,
      category,
      title: defaultTitleFromFilename(file.name),
      state: 'processing',
    })
    queueOrder.push(jobId)
    const message: MainToWorkerMessage = {
      type: 'process',
      jobId,
      file,
      existingIds: Array.from(knownIds),
    }
    uploadWorker.postMessage(message)
  }
  renderQueue()
}

async function uploadBlob(id: string, variant: 'medium' | 'large' | 'original', bytes: ArrayBuffer, contentType: string) {
  const res = await fetch(`/api/admin/photos/${id}/blob/${variant}`, {
    method: 'POST',
    headers: { 'content-type': contentType },
    body: bytes,
  })
  if (!res.ok) throw new Error(`blob upload (${variant}) failed: ${res.status}`)
}

async function uploadProcessedPhoto(item: QueueItem, photo: ProcessedPhoto) {
  setQueueState(item.jobId, 'uploading')
  try {
    await Promise.all([
      uploadBlob(photo.id, 'medium', photo.medium.bytes, 'image/webp'),
      uploadBlob(photo.id, 'large', photo.large.bytes, 'image/webp'),
      uploadBlob(photo.id, 'original', photo.original.bytes, photo.original.contentType),
    ])

    const insert: PhotoInsert = {
      id: photo.id,
      content_hash: photo.contentHash,
      category: item.category,
      title: item.title,
      filename: photo.filename,
      aspect_ratio: photo.aspectRatio,
      medium_key: `photos/${photo.id}/medium.webp`,
      medium_w: photo.medium.width,
      medium_h: photo.medium.height,
      large_key: `photos/${photo.id}/large.webp`,
      large_w: photo.large.width,
      large_h: photo.large.height,
      original_key: `photos/${photo.id}/original.${photo.original.ext}`,
      original_bytes: photo.original.bytes.byteLength,
      original_w: photo.original.width,
      original_h: photo.original.height,
      date_taken: photo.metadata.dateTaken,
      camera: photo.metadata.camera,
      lens: photo.metadata.lens,
      iso: photo.metadata.iso,
      aperture: photo.metadata.aperture,
      shutter_speed: photo.metadata.shutterSpeed,
      focal_length: photo.metadata.focalLength,
      exif_json: photo.exifJson ?? undefined,
    }

    const res = await fetch('/api/admin/photos', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(insert),
    })

    if (res.status === 409) {
      setQueueState(item.jobId, 'duplicate', 'server: duplicate content_hash')
      return
    }
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null
      throw new Error(`metadata POST failed: ${res.status}${body?.error ? ` (${body.error})` : ''}`)
    }

    const body = (await res.json()) as { photo: AdminPhoto }
    replacePhoto(body.photo)
    setQueueState(item.jobId, 'done')
    render()
  } catch (err) {
    setQueueState(item.jobId, 'error', err instanceof Error ? err.message : String(err))
  }
}

uploadWorker.addEventListener('message', (event: MessageEvent<WorkerToMainMessage>) => {
  const msg = event.data
  const item = queue.get(msg.jobId)
  if (!item) return

  if (msg.type === 'duplicate') {
    setQueueState(msg.jobId, 'duplicate', `matches existing photo ${msg.id}`)
    return
  }
  if (msg.type === 'error') {
    setQueueState(msg.jobId, 'error', msg.message)
    return
  }
  if (msg.type === 'result') {
    // Re-check right before upload: earlier jobs in this same batch may have
    // finished (and been added to knownIds) after this job was dispatched.
    if (knownIds.has(msg.photo.id)) {
      setQueueState(msg.jobId, 'duplicate', `matches existing photo ${msg.photo.id}`)
      return
    }
    knownIds.add(msg.photo.id)
    void uploadProcessedPhoto(item, msg.photo)
  }
})

dropzone.addEventListener('click', () => fileInput.click())
fileInput.addEventListener('change', () => {
  if (fileInput.files && fileInput.files.length > 0) enqueueFiles(fileInput.files)
  fileInput.value = ''
})
dropzone.addEventListener('dragover', event => {
  event.preventDefault()
  dropzone.classList.add('border-primary', 'bg-base-200/40')
})
dropzone.addEventListener('dragleave', () => {
  dropzone.classList.remove('border-primary', 'bg-base-200/40')
})
dropzone.addEventListener('drop', event => {
  event.preventDefault()
  dropzone.classList.remove('border-primary', 'bg-base-200/40')
  if (event.dataTransfer?.files && event.dataTransfer.files.length > 0) {
    enqueueFiles(event.dataTransfer.files)
  }
})

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

void loadPhotos()
