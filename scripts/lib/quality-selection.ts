export interface Candidate {
  candidate: string
  bytes: number
  ssimulacra2: number
  alphaMaxError?: number
}

/** All inputs must describe the same pixels/dimensions. Never invent a fallback.
 * The target nominates candidates for visual review; it is not visual approval.
 */
export function selectCandidate<T extends Candidate>(candidates: T[], target: number, minOriginalSaving = 0): T | null {
  if (!Number.isFinite(target) || target > 100 || target < 0 ||
      !Number.isFinite(minOriginalSaving) || minOriginalSaving < 0 || minOriginalSaving >= 1) throw new Error('Invalid quality selection policy')
  const eligible = candidates.filter(c => Number.isFinite(c.ssimulacra2) && c.ssimulacra2 >= target &&
    Number.isSafeInteger(c.bytes) && c.bytes > 0 && (c.alphaMaxError ?? 0) === 0)
    .sort((a,b) => a.bytes - b.bytes || b.ssimulacra2 - a.ssimulacra2)
  const best = eligible[0]
  if (!best) return null
  const original = eligible.find(c => c.candidate === 'original')
  if (original && best.bytes > original.bytes * (1 - minOriginalSaving)) return original
  return best
}
