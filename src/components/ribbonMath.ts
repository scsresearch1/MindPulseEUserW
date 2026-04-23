export type StimulusMode = 'calm' | 'reward' | 'responsive' | 'tension' | 'breathing' | 'complete'

export function modeFromElapsedSec(t: number): StimulusMode {
  if (t < 5) return 'calm'
  if (t < 20) return 'reward'
  if (t < 35) return 'responsive'
  if (t < 50) return 'tension'
  if (t < 60) return 'breathing'
  return 'complete'
}

export function persistenceMs(mode: StimulusMode): number {
  switch (mode) {
    case 'calm':
      return 2800
    case 'reward':
      return 2200
    case 'responsive':
      return 1600
    case 'tension':
      return 2000
    case 'breathing':
      return 2600
    default:
      return 1800
  }
}

export function catmull(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const t2 = t * t
  const t3 = t2 * t
  return (
    0.5 *
    (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3)
  )
}

export interface Sample {
  x: number
  y: number
  t: number
  speed: number
}

export function dist2(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx
  const dy = ay - by
  return dx * dx + dy * dy
}

export function buildDrawPoints(
  samples: Sample[],
  mode: StimulusMode,
  subdivisions: number,
): { x: number; y: number; speed: number; u: number }[] {
  if (samples.length < 2) {
    return samples.map((s, i) => ({ x: s.x, y: s.y, speed: s.speed, u: i }))
  }
  const useSpline = mode === 'calm' || mode === 'reward' || mode === 'tension' || mode === 'breathing'
  const out: { x: number; y: number; speed: number; u: number }[] = []
  let u = 0
  if (!useSpline) {
    for (let i = 0; i < samples.length; i++) {
      const s = samples[i]
      out.push({ x: s.x, y: s.y, speed: s.speed, u: u++ })
    }
    return out
  }
  const pts = samples
  const n = pts.length
  for (let i = 0; i < n - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)]
    const p1 = pts[i]
    const p2 = pts[i + 1]
    const p3 = pts[Math.min(n - 1, i + 2)]
    for (let j = 0; j <= subdivisions; j++) {
      if (j === 0 && i > 0) continue
      const tt = j / subdivisions
      const x = catmull(p0.x, p1.x, p2.x, p3.x, tt)
      const y = catmull(p0.y, p1.y, p2.y, p3.y, tt)
      const speed = p1.speed * (1 - tt) + p2.speed * tt
      out.push({ x, y, speed, u: u++ })
    }
  }
  return out
}
