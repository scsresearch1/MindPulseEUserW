export type FlowStep = 'details' | 'consent' | 'stimulus' | 'complete'

export type Gender = 'male' | 'female' | 'other' | 'prefer_not'

export interface Participant {
  name: string
  age: number
  gender: Gender
}

export type ConsentAnswer = 'yes' | 'no' | null

/** One line on the stored consent form (all answers stored, including if policy changes to allow no). */
export interface ConsentResponseLine {
  question: string
  answer: 'yes' | 'no'
}

/**
 * Snapshot of the consent step for Firebase (pushed as its own node and embedded in the session row).
 * `clientSessionId` matches the run that follows on Agree.
 */
export interface ConsentRtdbSnapshot {
  schemaVersion: 1
  consentSubmittedAt: string
  clientSessionId: string
  participantName: string
  age: number
  gender: Gender
  responses: ConsentResponseLine[]
}

/** One row in the 60s emotion time series (for RTDB and charts). */
export interface EmotionTimeSeriesPoint {
  sessionTimeMs: number
  neutral: number
  happy: number
  fear: number
  surprise: number
  anger: number
  sadness: number
  disgust: number
}
