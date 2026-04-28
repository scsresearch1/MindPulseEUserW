import type { FacialEmotionProbabilities } from './emotionTypes'

type BlendshapeCategory = {
  categoryName?: string
  score?: number
}

type EmotionInference = {
  probabilities: FacialEmotionProbabilities
  confidence: number
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v))
}

function softmax(scores: number[]): number[] {
  const max = Math.max(...scores)
  const exps = scores.map((s) => Math.exp(s - max))
  const total = exps.reduce((a, b) => a + b, 0)
  if (total <= 1e-9) return scores.map(() => 0)
  return exps.map((e) => e / total)
}

/** Converts MediaPipe blendshape outputs to canonical emotions with confidence. */
export function inferEmotionFromBlendshapes(
  categories: BlendshapeCategory[] | undefined,
): EmotionInference {
  const byName = new Map<string, number>()
  for (const c of categories ?? []) {
    const key = c.categoryName
    if (!key) continue
    byName.set(key, Math.max(0, Math.min(1, c.score ?? 0)))
  }
  const get = (name: string) => byName.get(name) ?? 0
  const bilateral = (left: string, right: string) => (get(left) + get(right)) * 0.5
  const asymmetryPenalty = (left: string, right: string) => 1 - Math.abs(get(left) - get(right))

  const smile = bilateral('mouthSmileLeft', 'mouthSmileRight')
  const frown = bilateral('mouthFrownLeft', 'mouthFrownRight')
  const cheekLift = bilateral('cheekSquintLeft', 'cheekSquintRight')
  const browDown = bilateral('browDownLeft', 'browDownRight')
  const eyeWide = bilateral('eyeWideLeft', 'eyeWideRight')
  const mouthStretch = bilateral('mouthStretchLeft', 'mouthStretchRight')
  const noseSneer = bilateral('noseSneerLeft', 'noseSneerRight')
  const mouthUpper = bilateral('mouthUpperUpLeft', 'mouthUpperUpRight')
  const symmetry =
    (asymmetryPenalty('mouthSmileLeft', 'mouthSmileRight') +
      asymmetryPenalty('browDownLeft', 'browDownRight') +
      asymmetryPenalty('eyeWideLeft', 'eyeWideRight')) /
    3

  const happyLogit = 2.3 * smile + 1.1 * cheekLift - 0.7 * browDown - 0.4 * frown
  const surpriseLogit = 1.6 * get('jawOpen') + 1.3 * eyeWide + 0.8 * get('browInnerUp') - 0.45 * browDown
  const angerLogit = 1.7 * browDown + 1.35 * noseSneer + 0.75 * get('jawForward') + 0.35 * get('mouthPressLeft') + 0.35 * get('mouthPressRight') - 0.65 * smile
  const sadnessLogit = 1.2 * get('browInnerUp') + 1.1 * frown + 0.6 * get('mouthShrugLower') - 0.5 * smile
  const fearLogit = 1.05 * get('browInnerUp') + 1.05 * eyeWide + 1.0 * mouthStretch + 0.5 * get('jawOpen') - 0.35 * smile
  const disgustLogit = 1.7 * noseSneer + 0.95 * mouthUpper + 0.45 * get('mouthDimpleLeft') + 0.45 * get('mouthDimpleRight') - 0.4 * eyeWide

  const nonNeutralEnergy = clamp01(
    0.22 * smile +
      0.2 * browDown +
      0.18 * eyeWide +
      0.16 * frown +
      0.14 * noseSneer +
      0.1 * get('jawOpen'),
  )
  const neutralLogit = 1.4 * (1 - nonNeutralEnergy) + 0.55 * symmetry - 0.2
  const temperature = 0.85
  const probs = softmax(
    [neutralLogit, happyLogit, fearLogit, surpriseLogit, angerLogit, sadnessLogit, disgustLogit].map(
      (v) => v / temperature,
    ),
  )

  const probabilities: FacialEmotionProbabilities = {
    neutral: probs[0] ?? 0,
    happy: probs[1] ?? 0,
    fear: probs[2] ?? 0,
    surprise: probs[3] ?? 0,
    anger: probs[4] ?? 0,
    sadness: probs[5] ?? 0,
    disgust: probs[6] ?? 0,
  }
  const confidence = clamp01(0.45 * nonNeutralEnergy + 0.35 * symmetry + 0.2 * (1 - probabilities.neutral))
  return { probabilities, confidence }
}

export function mapFaceExpressionsToProbabilities(
  categories: BlendshapeCategory[] | undefined,
): FacialEmotionProbabilities {
  return inferEmotionFromBlendshapes(categories).probabilities
}
