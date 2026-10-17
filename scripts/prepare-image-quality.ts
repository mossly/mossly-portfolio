/** Pin the published inventory and official reference metric. No site writes. */
import { promises as fs } from 'node:fs'
import { createHash } from 'node:crypto'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import sharp from 'sharp'
const root = path.resolve(process.env.QUALITY_BENCHMARK_DIR || '.cache/quality-benchmark')
await fs.mkdir(root, { recursive: true })
const hash = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex')
const snapshot = path.join(root, 'live.json')
try { await fs.access(snapshot) } catch {
  const response = await fetch('https://mossly.org/api/photos')
  if (!response.ok) throw new Error(`Inventory HTTP ${response.status}`)
  await fs.writeFile(snapshot, JSON.stringify(await response.json(), null, 2))
}
const toolUrl = 'https://github.com/libjxl/libjxl/releases/download/v0.12.0/jxl-x64-windows-static.zip'
const zipSha256 = '3025d7e308390796d20492322e606bc92decaee7b6bc99d3f7547870ae5db7de'
const exe = process.env.SSIMULACRA2_EXE || path.join(root, 'libjxl/x64-windows-static/bin/ssimulacra2.exe')
try { await fs.access(exe) } catch {
  if (process.env.SSIMULACRA2_EXE || process.platform !== 'win32') {
    throw new Error('Set SSIMULACRA2_EXE to the libjxl 0.12.0 reference metric executable')
  }
  const response = await fetch(toolUrl)
  if (!response.ok) throw new Error(`Metric download HTTP ${response.status}`)
  const bytes = Buffer.from(await response.arrayBuffer())
  if (hash(bytes) !== zipSha256) throw new Error('Metric archive checksum mismatch')
  const zip = path.join(root, 'libjxl.zip')
  await fs.writeFile(zip, bytes)
  // Args are passed through environment variables, never interpolated into shell code.
  await promisify(execFile)('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
    'Expand-Archive -LiteralPath $env:QUALITY_TOOL_ZIP -DestinationPath $env:QUALITY_TOOL_DEST -Force'], {
    env: { ...process.env, QUALITY_TOOL_ZIP: zip, QUALITY_TOOL_DEST: path.join(root, 'libjxl') }, windowsHide: true,
  })
}
await fs.writeFile(path.join(root, 'provenance.json'), JSON.stringify({
  preparedAt: new Date().toISOString(), snapshotSha256: hash(await fs.readFile(snapshot)),
  metric: 'libjxl 0.12.0 SSIMULACRA2', toolUrl, zipSha256,
  executableSha256: hash(await fs.readFile(exe)),
  node: process.version, platform: process.platform, arch: process.arch, encoders: sharp.versions,
}, null, 2))
console.log(`Prepared ${root}. Existing snapshots are reused; use QUALITY_BENCHMARK_DIR for a fresh audit.`)
