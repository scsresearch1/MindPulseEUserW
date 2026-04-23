import type { FaceExpressions } from 'face-api.js'
import type { FacialEmotionProbabilities } from './emotionTypes'

/**
 * FaceExpressionNet labels → canonical keys (same mapping as EXPRESSION_MAP in the reference pipeline).
 */
export function mapFaceExpressionsToProbabilities(
  expressions: FaceExpressions,
): FacialEmotionProbabilities {
  return {
    neutral: expressions.neutral,
    happy: expressions.happy,
    fear: expressions.fearful,
    surprise: expressions.surprised,
    anger: expressions.angry,
    sadness: expressions.sad,
    disgust: expressions.disgusted,
  }
}
