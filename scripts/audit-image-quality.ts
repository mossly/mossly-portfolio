/** Audit published files against completed benchmark measurements. Targets trigger review. */
import { promises as fs } from 'node:fs'
import path from 'node:path'
const root = path.resolve(process.env.QUALITY_BENCHMARK_DIR || '.cache/quality-benchmark')
const summary = JSON.parse(await fs.readFile(path.join(root, 'summary.json'), 'utf8'))
if (!summary.complete) throw new Error('Benchmark incomplete; run quality:benchmark and quality:summary first')
const flagged = summary.rows.filter((r: { candidate: string; variant: string; ssimulacra2: number }) =>
  r.candidate === 'current' && r.ssimulacra2 < (r.variant === 'medium' ? 80 : 85))
await fs.writeFile(path.join(root, 'review-queue.json'), JSON.stringify(flagged, null, 2))
console.log(`${flagged.length} current variants need review; see ${path.join(root, 'review-queue.json')}`)
if (flagged.length) process.exitCode = 1
