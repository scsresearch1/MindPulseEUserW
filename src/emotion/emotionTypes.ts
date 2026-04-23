export interface FacialEmotionProbabilities {
  neutral: number
  happy: number
  fear: number
  surprise: number
  anger: number
  sadness: number
  disgust: number
}

/** One sample aligned to ~250 ms intervals during the stimulus session. */
export interface EmotionFrameSample {
  sessionTimeMs: number
  facialEmotionProbabilities: FacialEmotionProbabilities
}

export function defaultNeutralProbabilities(): FacialEmotionProbabilities {
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

/** Shipped with the emotion sample list so the report can explain capture quality. */
export interface EmotionSessionMeta {
  hadCamera: boolean
  /** Face-api model weights were loaded (TinyFaceDetector + landmarks + expressions). */
  modelsLoaded: boolean
  /** At least one face-api inference ran during the session (not neutral-fill only). */
  usedFaceInference: boolean
}
