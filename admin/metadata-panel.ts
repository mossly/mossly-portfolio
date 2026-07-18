// Metadata cleanup panel: bulk find -> replace mapping rules over the EXIF-ish
// photo fields. The underlying D1 metadata is messy (vendor cruft in camera
// strings, lenses that reported junk like "70.0 mm", bogus "f/1" apertures),
// so this lets the admin map a raw value on one field to clean value(s) and
// apply it across every matching row in one shot -- e.g. "wherever lens =
// '70.0 mm', set aperture = 'f/1.4'" or "rename camera 'NIKON CORPORATION
// NIKON Z 8' -> 'Nikon Z8'".
//
// Data source is the caller's already-loaded `AdminPhoto[]` (facets are
// computed client-side); writes go through POST /api/admin/photos/metadata/bulk
// and then trigger a reload so both this panel and the grid reflect the change.
import type { AdminPhoto } from '../src/types/photo'

// Editable metadata fields, in the order shown in the field selects. Keys match
// the D1 column names the backend's META_FIELDS allowlist accepts.
const META_FIELDS = [
  { key: 'camera', label: 'Camera' },
  { key: 'lens', label: 'Lens' },
  { key: 'aperture', label: 'Aperture' },
  { key: 'shutter_speed', label: 'Shutter speed' },
  { key: 'focal_length', label: 'Focal length' },
  { key: 'iso', label: 'ISO' },
  { key: 'date_taken', label: 'Date taken' },
  { key: 'location', label: 'Location' },
] as const

type MetaFieldKey = (typeof META_FIELDS)[number]['key']

interface PanelOptions {
  getPhotos: () => AdminPhoto[]
  reload: () => Promise<void>
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** Distinct values (as strings) of one field with counts, most-common first.
 *  `null`/empty are folded into a single bucket keyed by the empty string. */
function facetsFor(photos: AdminPhoto[], field: MetaFieldKey): { value: string; count: number }[] {
  const counts = new Map<string, number>()
  for (const p of photos) {
    const raw = (p as unknown as Record<string, unknown>)[field]
    const key = raw === null || raw === undefined || raw === '' ? '' : String(raw)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return Array.from(counts.entries())
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value))
}

const EMPTY_LABEL = '(empty / not set)'

export function initMetadataPanel(root: HTMLElement, opts: PanelOptions): void {
  // Local UI state: which field we're matching on, and the list of set rows.
  let matchField: MetaFieldKey = 'lens'
  let setRows: { field: MetaFieldKey; value: string }[] = [{ field: 'aperture', value: '' }]
  let lastPreview: string | null = null

  function fieldOptions(selected: MetaFieldKey, name: string): string {
    return `<select name="${name}" class="select select-sm">
      ${META_FIELDS.map(f => `<option value="${f.key}" ${f.key === selected ? 'selected' : ''}>${f.label}</option>`).join('')}
    </select>`
  }

  function render(): void {
    const photos = opts.getPhotos()
    const facets = facetsFor(photos, matchField)
    const datalists = META_FIELDS.map(
      f => `<datalist id="values-${f.key}">
        ${facetsFor(photos, f.key)
          .filter(v => v.value !== '')
          .map(v => `<option value="${escapeHtml(v.value)}"></option>`)
          .join('')}
      </datalist>`,
    ).join('')

    root.innerHTML = `
      <div class="card bg-base-100 border border-base-300 p-4 space-y-4 max-w-3xl">
        <p class="text-sm text-base-content/60">
          Map a raw value on one field to clean value(s), applied to every matching photo.
          Leave a "set" value empty to clear that field.
        </p>

        <div class="space-y-2">
          <div class="flex flex-wrap items-center gap-2">
            <span class="text-sm font-medium w-16">Where</span>
            ${fieldOptions(matchField, 'match-field')}
            <span class="text-sm">=</span>
            <select name="match-value" class="select select-sm min-w-0 flex-1">
              ${facets
                .map(
                  v =>
                    `<option value="${escapeHtml(v.value)}">${v.value === '' ? EMPTY_LABEL : escapeHtml(v.value)} — ${v.count}</option>`,
                )
                .join('')}
            </select>
          </div>

          ${setRows
            .map(
              (r, i) => `
            <div class="flex flex-wrap items-center gap-2" data-set-row="${i}">
              <span class="text-sm font-medium w-16">${i === 0 ? 'Set' : 'and'}</span>
              ${fieldOptions(r.field, `set-field-${i}`)}
              <span class="text-sm">→</span>
              <input type="text" name="set-value-${i}" value="${escapeHtml(r.value)}" list="values-${r.field}"
                     placeholder="clean value (blank = clear)" class="input input-sm min-w-0 flex-1">
              ${setRows.length > 1 ? `<button type="button" class="btn btn-sm btn-ghost" data-set-remove="${i}">✕</button>` : ''}
            </div>`,
            )
            .join('')}

          <button type="button" class="btn btn-xs btn-ghost" data-set-add>+ set another field</button>
        </div>

        <div class="flex items-center gap-2">
          <button type="button" class="btn btn-sm" data-mp-preview>Preview</button>
          <button type="button" class="btn btn-sm btn-primary" data-mp-apply>Apply</button>
          ${lastPreview ? `<span class="text-sm text-base-content/70">${escapeHtml(lastPreview)}</span>` : ''}
        </div>
        ${datalists}
      </div>
    `
  }

  function readForm(): void {
    const mf = root.querySelector('[name="match-field"]') as HTMLSelectElement | null
    if (mf) matchField = mf.value as MetaFieldKey
    setRows = setRows.map((r, i) => {
      const f = root.querySelector(`[name="set-field-${i}"]`) as HTMLSelectElement | null
      const v = root.querySelector<HTMLInputElement>(`[name="set-value-${i}"]`)
      return { field: (f?.value as MetaFieldKey) ?? r.field, value: v?.value ?? r.value }
    })
  }

  function buildBody(dryRun: boolean): {
    match: { field: MetaFieldKey; value: string | null }
    set: Record<string, string | null>
    dryRun?: boolean
  } {
    const matchValueEl = root.querySelector('[name="match-value"]') as HTMLSelectElement | null
    const rawMatch = matchValueEl?.value ?? ''
    const set: Record<string, string | null> = {}
    for (const r of setRows) {
      // Empty input clears the field (null). Later rows on the same field win.
      set[r.field] = r.value.trim() === '' ? null : r.value.trim()
    }
    return {
      match: { field: matchField, value: rawMatch === '' ? null : rawMatch },
      set,
      ...(dryRun ? { dryRun: true } : {}),
    }
  }

  async function preview(): Promise<void> {
    readForm()
    try {
      const res = await fetch('/api/admin/photos/metadata/bulk', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(buildBody(true)),
      })
      const body = (await res.json()) as { matched?: number; error?: string; details?: string[] }
      if (!res.ok) throw new Error(body.details?.join('; ') || body.error || `HTTP ${res.status}`)
      lastPreview = `${body.matched ?? 0} photo(s) match`
    } catch (err) {
      lastPreview = err instanceof Error ? err.message : 'Preview failed'
    }
    render()
  }

  async function apply(): Promise<void> {
    readForm()
    try {
      const res = await fetch('/api/admin/photos/metadata/bulk', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(buildBody(false)),
      })
      const body = (await res.json()) as { updated?: number; error?: string; details?: string[] }
      if (!res.ok) throw new Error(body.details?.join('; ') || body.error || `HTTP ${res.status}`)
      lastPreview = `Updated ${body.updated ?? 0} photo(s)`
      await opts.reload() // refresh grid + our facets from D1
    } catch (err) {
      lastPreview = err instanceof Error ? err.message : 'Apply failed'
    }
    render()
  }

  root.addEventListener('change', event => {
    const target = event.target as HTMLElement
    // Re-render when the matched field changes (its value list changes) or a
    // set field changes (its datalist changes). Preserve current inputs first.
    if (target.getAttribute('name') === 'match-field' || target.getAttribute('name')?.startsWith('set-field-')) {
      readForm()
      lastPreview = null
      render()
    }
  })

  root.addEventListener('click', event => {
    const target = event.target as HTMLElement
    if (target.closest('[data-mp-preview]')) return void preview()
    if (target.closest('[data-mp-apply]')) return void apply()
    if (target.closest('[data-set-add]')) {
      readForm()
      setRows.push({ field: 'camera', value: '' })
      render()
      return
    }
    const removeBtn = target.closest<HTMLElement>('[data-set-remove]')
    if (removeBtn) {
      readForm()
      const idx = Number(removeBtn.getAttribute('data-set-remove'))
      setRows.splice(idx, 1)
      render()
      return
    }
  })

  render()
}
