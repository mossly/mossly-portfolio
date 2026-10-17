/** Versioned, decoder-independent measurements over aligned 8-bit sRGB RGBA.
 * These measure additional encoding loss, not photographic/source quality.
 */
export interface Raster {
  data: Uint8Array | Uint8ClampedArray
  width: number
  height: number
}
export interface QualityMetrics {
  width: number
  height: number
  mse: number
  psnrDb: number | null // null means identical (infinite PSNR), JSON-safe
  maxError: number
  alphaMaxError: number
  worstTile: { x: number; y: number; width: number; height: number; mse: number; psnrDb: number | null }
}
const psnr = (mse: number) => mse === 0 ? null : 10 * Math.log10(255 ** 2 / mse)

export function measureQuality(reference: Raster, decoded: Raster): QualityMetrics {
  const { width, height } = reference
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 ||
      decoded.width !== width || decoded.height !== height ||
      reference.data.length !== width * height * 4 || decoded.data.length !== width * height * 4) {
    throw new Error('Quality measurement requires matching, nonempty RGBA rasters')
  }
  let squaredError = 0, maxError = 0, alphaMaxError = 0
  let worstTile = { x: 0, y: 0, width: Math.min(64, width), height: Math.min(64, height), mse: 0, psnrDb: null as number | null }
  for (let y = 0; y < height; y += 64) {
    for (let x = 0; x < width; x += 64) {
      const tw = Math.min(64, width - x), th = Math.min(64, height - y)
      let error = 0
      for (let dy = 0; dy < th; dy++) {
        for (let dx = 0; dx < tw; dx++) {
          const i = ((y + dy) * width + x + dx) * 4
          for (let c = 0; c < 3; c++) {
            const delta = Math.abs(reference.data[i + c] - decoded.data[i + c])
            error += delta * delta
            maxError = Math.max(maxError, delta)
          }
          alphaMaxError = Math.max(alphaMaxError, Math.abs(reference.data[i + 3] - decoded.data[i + 3]))
        }
      }
      squaredError += error
      const mse = error / (tw * th * 3)
      if (mse > worstTile.mse) worstTile = { x, y, width: tw, height: th, mse, psnrDb: psnr(mse) }
    }
  }
  const mse = squaredError / (width * height * 3)
  return { width, height, mse, psnrDb: psnr(mse), maxError, alphaMaxError, worstTile }
}

