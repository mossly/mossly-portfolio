/** Aggregate all rows; refuse to label an incomplete benchmark as complete. */
import { promises as fs } from 'node:fs'
import path from 'node:path'
import type { Photo } from '../src/types/photo'
import { selectCandidate } from './lib/quality-selection'
const root = path.resolve(process.env.QUALITY_BENCHMARK_DIR || '.cache/quality-benchmark')
const live = JSON.parse(await fs.readFile(path.join(root, 'live.json'), 'utf8')) as Record<string, Photo[]>
const photos = [...new Map(Object.values(live).flat().map(p => [p.id, p])).values()]
const candidates = ['current', 'webp85', 'webp90', 'webp95', 'jpeg90']
const rows: any[] = [], sources: any[] = [], missing: string[] = []
let supplementalRows = 0
for (const photo of photos) {
  const dir = path.join(root, photo.id)
  try { sources.push(JSON.parse(await fs.readFile(path.join(dir, 'source.json'), 'utf8'))) } catch { missing.push(`${photo.id}/source`) }
  for (const variant of ['medium', 'large', 'full']) {
    for (const candidate of [...candidates, ...(variant === 'large' ? ['avif75', 'avif85'] : [])]) {
      try {
        const row = JSON.parse(await fs.readFile(path.join(dir, `${variant}-${candidate}.json`), 'utf8'))
        const dimensions = photo.variants[variant as 'medium' | 'large' | 'full']
        if (row.schema !== 1 || row.id !== photo.id || row.variant !== variant || row.candidate !== candidate ||
            !Number.isFinite(row.ssimulacra2) || !Number.isSafeInteger(row.bytes) || row.bytes <= 0 ||
            row.width !== dimensions?.width || row.height !== dimensions?.height) throw new Error('Invalid benchmark row')
        const { versions, ...compact } = row
        rows.push(compact)
      } catch { missing.push(`${photo.id}/${variant}/${candidate}`) }
    }
    for (const candidate of ['jpeg95', 'avif90']) {
      try {
        const { versions, ...row } = JSON.parse(await fs.readFile(path.join(dir, `${variant}-${candidate}.json`), 'utf8'))
        rows.push(row)
        supplementalRows++
      } catch { /* Additional settings only tested on difficult cases. */ }
    }
  }
}
const quantile = (a: number[], q: number) => {
  const sorted = [...a].sort((a,b) => a-b), x = (sorted.length - 1) * q
  return sorted[Math.floor(x)] + (sorted[Math.ceil(x)] - sorted[Math.floor(x)]) * (x % 1)
}
const stats = (group: any[]) => ({ count: group.length, bytes: group.reduce((a,r) => a + r.bytes, 0),
  mean: group.reduce((a,r) => a+r.ssimulacra2,0)/group.length, median: quantile(group.map(r=>r.ssimulacra2), .5),
  p10: quantile(group.map(r=>r.ssimulacra2), .1), min: Math.min(...group.map(r=>r.ssimulacra2)),
  below80: group.filter(r=>r.ssimulacra2 < 80).length, below85: group.filter(r=>r.ssimulacra2 < 85).length,
  medianEncodeMs: quantile(group.map(r=>r.encodeMs).filter(v=>v !== null), .5),
})
const groups = Object.fromEntries([...new Set(rows.map(r=>`${r.variant}/${r.candidate}`))].sort()
  .map(key=>[key, stats(rows.filter(r=>`${r.variant}/${r.candidate}` === key))]))
const strategies = []
for (const variant of ['medium','large','full']) for (const target of [80,85,90]) {
  const chosen = [], failures = []
  for (const p of photos) {
    const dimensions = p.variants[variant as 'medium' | 'large' | 'full']
    // Small originals can have identical large/full (or all three) rasters.
    // A measured file at that exact size is eligible regardless of its label.
    const options = rows.filter(r=>r.id === p.id && r.width === dimensions?.width && r.height === dimensions?.height)
      .map(r=>({ ...r, alphaMaxError: r.metrics.alphaMaxError }))
    const source = sources.find(s=>s.id === p.id)
    if (source && source.width === p.variants[variant as 'medium' | 'large' | 'full']?.width &&
      source.height === p.variants[variant as 'medium' | 'large' | 'full']?.height) {
      options.push({ id: p.id, variant, candidate: 'original', bytes: source.bytes, ssimulacra2: 100 })
    }
    const best = selectCandidate(options, target)
    if (best) chosen.push(best); else failures.push(p.id)
  }
  strategies.push({ variant, target, bytes: chosen.reduce((a,r)=>a+r.bytes,0),
    choices: Object.fromEntries([...new Set(chosen.map(r=>r.candidate))].map(c=>[c,chosen.filter(r=>r.candidate===c).length])),
    failures, chosen: chosen.map(r=>({ id:r.id,candidate:r.candidate,measuredVariant:r.variant,bytes:r.bytes,score:r.ssimulacra2 })) })
}
const summary = { schema: 1, createdAt: new Date().toISOString(), complete: missing.length === 0,
  expectedImages: photos.length, expectedRows: photos.length * 17, completedRows: rows.length - supplementalRows, supplementalRows,
  missing, sources, groups, strategies,
  worstCurrent: rows.filter(r=>r.candidate==='current').sort((a,b)=>a.ssimulacra2-b.ssimulacra2), rows }
await fs.writeFile(path.join(root, 'summary.json'), JSON.stringify(summary, null, 2))
console.log(JSON.stringify({complete:summary.complete, completedRows:rows.length, missing:missing.length, groups},null,2))
if (missing.length && !process.argv.includes('--partial')) process.exitCode = 1
