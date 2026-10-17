import { test } from 'node:test'
import assert from 'node:assert/strict'
import sharp from 'sharp'
import { measureQuality } from '../src/lib/image-quality'
import { selectCandidate } from './lib/quality-selection'

function raster(width: number, height: number, value = 128) {
  const data = new Uint8Array(width * height * 4).fill(value)
  for (let i = 3; i < data.length; i += 4) data[i] = 255
  return { data, width, height }
}

test('identity is JSON-safe; mismatched geometry fails closed', () => {
  const a = raster(65, 67)
  const metrics = measureQuality(a, a)
  assert.equal(metrics.mse, 0)
  assert.equal(metrics.psnrDb, null)
  assert.throws(() => measureQuality(a, raster(67, 65)))
  assert.throws(() => measureQuality(raster(0, 0), raster(0, 0)))
})

test('known uniform RGB error yields analytic PSNR; alpha loss is measured', () => {
  const a = raster(65, 67), b = raster(65, 67, 138)
  const result = measureQuality(a, b)
  assert.equal(result.mse, 100)
  assert.equal(result.psnrDb, 10 * Math.log10(650.25))
  assert.equal(result.maxError, 10)
  const alpha = raster(65, 67)
  alpha.data[3] = 254
  assert.equal(measureQuality(a, alpha).alphaMaxError, 1)
})

test('selection uses measured quality and bytes, without requiring a format or losslessness', () => {
  const candidates = [
    { candidate: 'webp95', bytes: 462000, ssimulacra2: 82.7 },
    { candidate: 'jpeg90', bytes: 439000, ssimulacra2: 92 },
    { candidate: 'original', bytes: 477000, ssimulacra2: 100 },
  ]
  assert.equal(selectCandidate(candidates, 85)?.candidate, 'jpeg90')
  assert.equal(selectCandidate(candidates, 85, .15)?.candidate, 'original')
  assert.equal(selectCandidate(candidates.slice(0, 1), 85), null)
  assert.equal(selectCandidate([{ candidate: 'broken', bytes: 12, ssimulacra2: 95, alphaMaxError: 1 }], 85), null)
  assert.throws(() => selectCandidate(candidates, NaN))
})

test('localized damage cannot hide in a high whole-image PSNR, including edge tiles', () => {
  const a = raster(1025, 1025), b = raster(1025, 1025)
  // Partial bottom-right tile (1x1), otherwise identical.
  const i = (1025 * 1025 - 1) * 4
  b.data[i] += 50
  const result = measureQuality(a, b)
  assert.ok(result.psnrDb! > 40)
  assert.equal(result.worstTile.x, 1024)
  assert.equal(result.worstTile.y, 1024)
  assert.ok(result.worstTile.psnrDb! < 34)
})

test('metrics compare decoded files with an explicitly matched reference', async () => {
  const a = raster(137, 91)
  for (let i = 0; i < a.data.length; i += 4) a.data[i] = (i * 17) % 251
  const raw = { width: a.width, height: a.height, channels: 4 as const }
  const encoded = await sharp(a.data, { raw }).webp({ quality: 85 }).toBuffer()
  const decoded = await sharp(encoded).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const metrics = measureQuality(a, { data: decoded.data, width: decoded.info.width, height: decoded.info.height })
  assert.ok(metrics.mse > 0)
  assert.ok(Number.isFinite(metrics.psnrDb))
})
