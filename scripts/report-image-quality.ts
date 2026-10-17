/** Publish local benchmark evidence into versionable docs, only after coverage is complete. */
import { promises as fs } from 'node:fs'
import path from 'node:path'
const root = path.resolve(process.env.QUALITY_BENCHMARK_DIR || '.cache/quality-benchmark')
const s = JSON.parse(await fs.readFile(path.join(root, 'summary.json'), 'utf8'))
if (!s.complete) throw new Error('Cannot report an incomplete corpus as complete')
const out = path.resolve('docs/quality-analysis')
await fs.mkdir(out, { recursive: true })
const mb = (n: number) => (n / 1e6).toFixed(2)
const num = (n: number) => n.toFixed(2)
const lines = [
  '# Collection benchmark results', '',
  `Measured ${s.expectedImages} unique published assets; ${s.completedRows}/${s.expectedRows} required comparisons and ${s.supplementalRows} targeted extra comparisons.`,
  'Highlights were deduplicated by ID. Every source, derivative and setting has a row in [results.json](results.json).', '',
  'Sizes use decimal MB. Scores are SSIMULACRA2; higher is better. Median and p10 are unweighted across images. Transfer sizes are the sum of visiting every image once, not the initial page payload.', '',
]
for (const variant of ['medium','large','full']) {
  lines.push(`## ${variant}`, '', '| Candidate | Images | Total MB | Median | p10 | Minimum | Below 80 | Below 85 |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |')
  for (const [key,g] of Object.entries(s.groups) as [string,any][]) if (key.startsWith(variant+'/')) {
    lines.push(`| ${key.split('/')[1]} | ${g.count} | ${mb(g.bytes)} | ${num(g.median)} | ${num(g.p10)} | ${num(g.min)} | ${g.below80} | ${g.below85} |`)
  }
  lines.push('', 'Candidates with fewer images are targeted exception tests and must not be compared as whole-corpus totals.', '')
}
lines.push('## Per-image selection sensitivity', '',
  'For each score target, choose the smallest measured candidate meeting that target. Measurements may be reused across variant names when pixel dimensions match. The current image is eligible if it meets the target. The original is eligible only at exactly matching dimensions. No lossless WebP candidate or automatic conversion fallback is used.', '',
  '| Variant | Target | Total MB for selected files | Unresolved | Choices |', '| --- | ---: | ---: | ---: | --- |')
for (const t of s.strategies) lines.push(`| ${t.variant} | ${t.target} | ${mb(t.bytes)} | ${t.failures.length} | ${Object.entries(t.choices).map(([k,v])=>`${k}: ${v}`).join(', ')} |`)
lines.push('', 'Unresolved images are excluded from that row’s byte total. Selection is a review nomination, not automatic visual approval. The original baseline measures fidelity to the supplied export, not to a camera RAW.', '',
  '## Lowest-scoring current full-resolution images', '', '| Photo | Score | RGB PSNR (dB) |', '| --- | ---: | ---: |')
for (const r of s.worstCurrent.filter((r:any)=>r.variant==='full').slice(0,12)) lines.push(`| ${r.title} | ${num(r.ssimulacra2)} | ${num(r.metrics.psnrDb)} |`)
const pairs = s.sources.flatMap((p:any)=> {
  const w = s.rows.find((r:any)=>r.id===p.id&&r.variant==='full'&&r.candidate==='webp95')
  const j = s.rows.find((r:any)=>r.id===p.id&&r.variant==='full'&&r.candidate==='jpeg90')
  return w && j && j.metrics.alphaMaxError===0 ? [{w,j}] : []
})
lines.push('', `JPEG q90 is no larger and scores no worse than WebP q95 in ${pairs.filter(({w,j}:any)=>j.bytes<=w.bytes&&j.ssimulacra2>=w.ssimulacra2).length}/${pairs.length} full-resolution comparisons.`, '',
  '## Provenance and limits', '',
  'See [measurement protocol](../image-quality.md) for colour handling, resizing, targets, tool installation and reproduction commands.',
  'AVIF was tested across the complete collection at the large viewing size, not at every native resolution. Encoder timings were collected during concurrent execution. Review crops in the local benchmark directory; production was not changed.', '')
await fs.writeFile(path.join(out, 'benchmark-results.md'), lines.join('\n'))
await fs.writeFile(path.join(out, 'results.json'), JSON.stringify({ ...s, missing: undefined, worstCurrent: undefined }, null, 2))
await fs.copyFile(path.join(root, 'provenance.json'), path.join(out, 'provenance.json'))
await fs.copyFile(path.join(root, 'live.json'), path.join(out, 'inventory.json'))
console.log(out)
