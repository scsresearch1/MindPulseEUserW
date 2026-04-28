import type { FacialEmotionProbabilities } from './emotionTypes'

type BlendshapeCategory = {
  categoryName?: string
  score?: number
}

/** Converts MediaPipe blendshape outputs to the existing emotion probability schema. */
export function mapFaceExpressionsToProbabilities(
  categories: BlendshapeCategory[] | undefined,
): FacialEmotionProbabilities {
  const byName = new Map<string, number>()
  for (const c of categories ?? []) {
    const key = c.categoryName
    if (!key) continue
    byName.set(key, Math.max(0, Math.min(1, c.score ?? 0)))
  }
  const get = (name: string) => byName.get(name) ?? 0

  const happy = 0.75 * get('mouthSmileLeft') + 0.75 * get('mouthSmileRight') + 0.25 * get('cheekSquintLeft') + 0.25 * get('cheekSquintRight')
  const surprise = 0.45 * get('jawOpen') + 0.35 * get('eyeWideLeft') + 0.35 * get('eyeWideRight') + 0.2 * get('browInnerUp')
  const anger = 0.45 * get('browDownLeft') + 0.45 * get('browDownRight') + 0.3 * get('noseSneerLeft') + 0.3 * get('noseSneerRight') + 0.18 * get('jawForward')
  const sadness = 0.42 * get('browInnerUp') + 0.24 * get('mouthFrownLeft') + 0.24 * get('mouthFrownRight') + 0.2 * get('mouthShrugLower')
  const fear = 0.35 * get('browInnerUp') + 0.3 * get('eyeWideLeft') + 0.3 * get('eyeWideRight') + 0.2 * get('mouthStretchLeft') + 0.2 * get('mouthStretchRight') + 0.15 * get('jawOpen')
  const disgust = 0.48 * get('noseSneerLeft') + 0.48 * get('noseSneerRight') + 0.2 * get('mouthUpperUpLeft') + 0.2 * get('mouthUpperUpRight')

  const nonNeutral = happy + surprise + anger + sadness + fear + disgust
  const neutral = Math.max(0, 1 - Math.min(1, nonNeutral))

  return {
    neutral,
    happy,
    fear,
    surprise,
    anger,
    sadness,
    disgust,
  }
}
