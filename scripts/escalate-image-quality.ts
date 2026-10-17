/** Test higher lossy settings only where the completed base sweep misses a target. */
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
const root = path.resolve(process.env.QUALITY_BENCHMARK_DIR || '.cache/quality-benchmark')
const summary = JSON.parse(await fs.readFile(path.join(root, 'summary.json'), 'utf8'))
for (const [variant, target, expected] of [['medium', 80, 5], ['large', 85, 7]] as const) {
  const strategy = summary.strategies.find((s: any) => s.variant === variant && s.target === target)
  for (const id of strategy.failures as string[]) {
    const baseRows = summary.rows.filter((r: any) => r.id === id && r.variant === variant &&
      ['current', 'webp85', 'webp90', 'webp95', 'jpeg90', 'avif75', 'avif85'].includes(r.candidate))
    if (baseRows.length !== expected) continue // missing measurements are not low-quality results
    const result = await promisify(execFile)(process.execPath, [
      path.resolve('node_modules/tsx/dist/cli.mjs'), 'scripts/benchmark-image-quality.ts',
      '--id', id, '--variants', variant, '--candidates', 'jpeg95,avif90',
    ], { timeout: 600000, windowsHide: true, maxBuffer: 1024 * 1024 })
    process.stdout.write(result.stdout)
    process.stderr.write(result.stderr)
  }
}
