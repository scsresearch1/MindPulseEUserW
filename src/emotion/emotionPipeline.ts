import type { FacialEmotionProbabilities } from './emotionTypes'

export const EMOTION_LABELS = [
  'neutral',
  'happy',
  'fear',
  'surprise',
  'anger',
  'sadness',
  'disgust',
] as const

type EmotionLabel = (typeof EMOTION_LABELS)[number]

type MutableProbs = Record<EmotionLabel, number>

export type QualityContext = {
  detectionScore: number
  widthPx: number
  heightPx: number
  faceAreaRatio: number
}

export const QUALITY_MIN_SCORE = 0.45
export const MIN_FACE_AREA_RATIO = 0.02
export const MAX_FACE_AREA_RATIO = 0.7
export const EMA_ALPHA = 0.35
export const BASELINE_CALIBRATION_MS = 8000

export function normalizeProbabilities(p: FacialEmotionProbabilities): FacialEmotionProbabilities {
  const floor = 1e-6
  const total = EMOTION_LABELS.reduce((acc, k) => acc + Math.max(0, p[k]), 0)
  if (total <= floor) {
    return {
      neutral: 1,
      happy: 0,
      fear: 0,
      surprise: 0,
      anger: 0,
      sadness: 0,
      disgust: 0,
    }
  }
  const out = {} as MutableProbs
  for (const key of EMOTION_LABELS) {
    out[key] = Math.max(0, p[key]) / total
  }
  return out
}

export function qualityGate(q: QualityContext): boolean {
  if (!Number.isFinite(q.widthPx) || !Number.isFinite(q.heightPx) || q.widthPx <= 0 || q.heightPx <= 0) {
    return false
  }
  if (q.detectionScore < QUALITY_MIN_SCORE) return false
  if (q.faceAreaRatio < MIN_FACE_AREA_RATIO || q.faceAreaRatio > MAX_FACE_AREA_RATIO) return false
  return true
}

export function applyEma(
  current: FacialEmotionProbabilities,
  previous: FacialEmotionProbabilities | null,
): FacialEmotionProbabilities {
  if (!previous) return normalizeProbabilities(current)
  const out = {} as MutableProbs
  for (const key of EMOTION_LABELS) {
    out[key] = previous[key] * (1 - EMA_ALPHA) + current[key] * EMA_ALPHA
  }
  return normalizeProbabilities(out)
}

export function updateBaseline(
  baseline: FacialEmotionProbabilities | null,
  current: FacialEmotionProbabilities,
): FacialEmotionProbabilities {
  if (!baseline) return current
  const out = {} as MutableProbs
  const baselineAlpha = 0.12
  for (const key of EMOTION_LABELS) {
    out[key] = baseline[key] * (1 - baselineAlpha) + current[key] * baselineAlpha
  }
  return normalizeProbabilities(out)
}

export function applyNeutralBaseline(
  probs: FacialEmotionProbabilities,
  baseline: FacialEmotionProbabilities | null,
): FacialEmotionProbabilities {
  if (!baseline) return normalizeProbabilities(probs)
  const out = {} as MutableProbs
  for (const key of EMOTION_LABELS) {
    const adjusted = key === 'neutral' ? probs[key] - baseline[key] * 0.35 : probs[key] - baseline[key]
    out[key] = Math.max(0, adjusted)
  }
  return normalizeProbabilities(out)
}
