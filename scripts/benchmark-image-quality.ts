/** Reproducible, resumable read-only benchmark of the live inventory snapshot.
 * SSIMULACRA2_EXE must identify the official libjxl 0.12.0 metric executable.
 * --shard 0/2 distributes independent images; --id limits to a single photo.
 * --avif adds AVIF q65/q75 effort4 at all three resolutions.
 */
import sharp from 'sharp'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { performance } from 'node:perf_hooks'
import type { Photo } from '../src/types/photo'
import seed from '../src/data/photos.seed.json'
import { measureQuality } from '../src/lib/image-quality'

const exec = promisify(execFile)
sharp.concurrency(2)
sharp.cache({ memory: 64, files: 10, items: 20 })
const root = path.resolve(process.env.QUALITY_BENCHMARK_DIR || '.cache/quality-benchmark')
const exe = process.env.SSIMULACRA2_EXE || path.join(root, 'libjxl/x64-windows-static/bin/ssimulacra2.exe')
const args = process.argv.slice(2)
const arg = (name: string) => args.includes(name) ? args[args.indexOf(name) + 1] : undefined
const mode = args.includes('--avif') ? 'avif' : 'core'
const [shard, shards] = (arg('--shard') || '0/1').split('/').map(Number)
const hash = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex')
const inventory = JSON.parse(await fs.readFile(path.join(root, 'live.json'), 'utf8')) as Record<string, Photo[]>
const all = [...new Map(Object.values(inventory).flat().map(p => [p.id, p])).values()].sort((a,b) => a.id.localeCompare(b.id))
const selected = all.filter((p,i) => arg('--id') ? p.id === arg('--id') : i % shards === shard)
const sourceHashes = new Map(seed.map(p => [p.id, p.content_hash]))
if (!selected.length) throw new Error('Empty benchmark selection')
await fs.access(exe)
async function cachedDownload(url: string, filename: string) {
  try { return await fs.readFile(filename) } catch { /* fetch on first run */ }
  if (new URL(url).origin !== 'https://images.mossly.org') throw new Error('Unexpected source origin')
  const response = await fetch(url, { signal: AbortSignal.timeout(60000) })
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${url}`)
  const bytes = Buffer.from(await response.arrayBuffer())
  await fs.writeFile(filename, bytes)
  return bytes
}
async function perceptual(reference: string, candidate: string) {
  const { stdout } = await exec(exe, [reference, candidate], { timeout: 180000, windowsHide: true })
  const score = Number(stdout.trim())
  if (!stdout.trim() || !Number.isFinite(score)) throw new Error(`Invalid SSIMULACRA2 result: ${stdout}`)
  return score
}
for (const photo of selected) {
  if (!/^[a-f0-9]{8,64}$/.test(photo.id)) throw new Error('Unexpected photo ID')
  const dir = path.join(root, photo.id)
  await fs.mkdir(dir, { recursive: true })
  try {
    const original = await cachedDownload(photo.variants.original.url, path.join(dir, 'original'))
    const originalHash = hash(original)
    const expectedHash = sourceHashes.get(photo.id)
    if (expectedHash && originalHash !== expectedHash) throw new Error('Original hash mismatch')
    const meta = await sharp(original).metadata()
    await fs.writeFile(path.join(dir, 'source.json'), JSON.stringify({ id: photo.id, title: photo.title,
      category: photo.category, bytes: original.length, sha256: originalHash, seedVerified: !!expectedHash,
      width: meta.autoOrient.width, height: meta.autoOrient.height, format: meta.format,
      icc: !!meta.icc, chromaSubsampling: meta.chromaSubsampling, originalUrl: photo.variants.original.url }))
    for (const variant of ['medium', 'large', 'full'] as const) {
      if (arg('--variants') && !arg('--variants')!.split(',').includes(variant)) continue
      const live = photo.variants[variant]
      if (!live) throw new Error(`Missing ${variant}`)
      const candidates = arg('--candidates')?.split(',') || (args.includes('--avif') ? ['avif75', 'avif85'] : ['current', 'webp85', 'webp90', 'webp95', 'jpeg90'])
      if (candidates.some(c => !/^(current|webp(85|90|95|100)|jpeg(90|95)|avif(65|75|85|90))$/.test(c))) throw new Error('Invalid candidate set')
      const pending: string[] = []
      for (const name of candidates) {
        try {
          const previous = JSON.parse(await fs.readFile(path.join(dir, `${variant}-${name}.json`), 'utf8'))
          if (previous.sourceSha256 === originalHash && previous.schema === 1 &&
              previous.width === live.width && previous.height === live.height &&
              previous.versions?.sharp === sharp.versions.sharp &&
              (name !== 'current' || previous.settings?.url === live.url)) continue
        } catch { /* unfinished row */ }
        pending.push(name)
      }
      if (!pending.length) continue
      // Match deployed pixel dimensions, not assumptions about legacy resizers.
      const { data, info } = await sharp(original).rotate().toColourspace('srgb')
        .resize(live.width, live.height, { fit: 'fill', kernel: 'lanczos3' }).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
      const reference = { data, width: info.width, height: info.height }
      const raw = { width: info.width, height: info.height, channels: 4 as const }
      const refPath = path.join(dir, `${variant}-${mode}-reference.png`)
      // PNG level 1 to avoid measuring PNG encoder CPU in our benchmark.
      await sharp(data, { raw }).png({ compressionLevel: 1 }).toFile(refPath)
      for (const name of pending) {
        const reportPath = path.join(dir, `${variant}-${name}.json`)
        const started = performance.now()
        let bytes: Buffer
        if (name === 'current') bytes = await cachedDownload(live.url, path.join(dir, `${variant}-current.webp`))
        else if (name.startsWith('webp')) bytes = await sharp(data, { raw }).webp({ quality: Number(name.slice(4)), effort: 4, smartSubsample: true }).toBuffer()
        else if (name.startsWith('avif')) bytes = await sharp(data, { raw }).avif({ quality: Number(name.slice(4)), effort: 4, chromaSubsampling: '4:4:4' }).toBuffer()
        else bytes = await sharp(data, { raw }).jpeg({ quality: Number(name.slice(4)), chromaSubsampling: '4:4:4', mozjpeg: true }).toBuffer()
        const encodeMs = performance.now() - started
        const extension = name.startsWith('jpeg') ? 'jpg' : name.startsWith('avif') ? 'avif' : 'webp'
        if (name !== 'current') await fs.writeFile(path.join(dir, `${variant}-${name}.${extension}`), bytes)
        const decoded = await sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
        const metrics = measureQuality(reference, { data: decoded.data, width: decoded.info.width, height: decoded.info.height })
        const candidatePath = path.join(dir, `${variant}-${mode}-decoded.png`)
        await sharp(decoded.data, { raw }).png({ compressionLevel: 1 }).toFile(candidatePath)
        const score = await perceptual(refPath, candidatePath)
        const result = { schema: 1, measuredAt: new Date().toISOString(), id: photo.id, title: photo.title, category: photo.category,
          sourceSha256: originalHash, variant, candidate: name, width: info.width, height: info.height,
          bytes: bytes.length, sha256: hash(bytes), encodeMs: name === 'current' ? null : encodeMs,
          ssimulacra2: score, metrics, versions: sharp.versions, metric: 'libjxl 0.12.0 SSIMULACRA2',
          settings: name.startsWith('webp') ? { quality: Number(name.slice(4)), effort: 4, smartSubsample: true } :
            name.startsWith('avif') ? { quality: Number(name.slice(4)), effort: 4, chromaSubsampling: '4:4:4' } :
            name.startsWith('jpeg') ? { quality: Number(name.slice(4)), chromaSubsampling: '4:4:4', mozjpeg: true } : { url: live.url } }
        await fs.writeFile(reportPath, JSON.stringify(result))
        console.log(`${photo.id} ${variant} ${name}: ${score.toFixed(2)} / ${bytes.length} bytes`)
        await fs.unlink(candidatePath)
      }
      // References can be reproduced from pinned originals; don't accumulate GBs.
      await fs.unlink(refPath)
    }
    console.log(`DONE ${photo.id} ${photo.title}`)
  } catch (error) {
    console.error(`FAILED ${photo.id}`, error)
    await fs.writeFile(path.join(dir, 'error.txt'), String(error))
    process.exitCode = 1
  }
}
