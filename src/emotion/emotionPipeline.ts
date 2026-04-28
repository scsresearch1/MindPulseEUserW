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
  signalConfidence: number
  widthPx: number
  heightPx: number
  faceAreaRatio: number
}

export const QUALITY_MIN_SCORE = 0.12
export const MIN_FACE_AREA_RATIO = 0.008
export const MAX_FACE_AREA_RATIO = 0.7
export const QUALITY_MIN_SIGNAL_CONFIDENCE = 0.1
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
  if (!Number.isFinite(q.detectionScore) || q.detectionScore < QUALITY_MIN_SCORE) return false
  if (!Number.isFinite(q.signalConfidence) || q.signalConfidence < QUALITY_MIN_SIGNAL_CONFIDENCE) return false
  if (q.faceAreaRatio < MIN_FACE_AREA_RATIO || q.faceAreaRatio > MAX_FACE_AREA_RATIO) return false
  return true
}

export function applyAdaptiveEma(
  current: FacialEmotionProbabilities,
  previous: FacialEmotionProbabilities | null,
  confidence: number,
): FacialEmotionProbabilities {
  if (!previous) return normalizeProbabilities(current)
  const alpha = Math.max(0.2, Math.min(0.58, 0.22 + confidence * 0.36))
  const out = {} as MutableProbs
  for (const key of EMOTION_LABELS) {
    out[key] = previous[key] * (1 - alpha) + current[key] * alpha
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
    const attenuation = key === 'neutral' ? 0.1 : 0.2
    const adjusted = Math.max(0, probs[key] - baseline[key] * attenuation)
    out[key] = adjusted * 0.45 + probs[key] * 0.55
  }
  return normalizeProbabilities(out)
}
