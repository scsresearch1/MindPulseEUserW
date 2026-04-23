import type { EmotionFrameSample, EmotionSessionMeta } from '../emotion/emotionTypes'
import type { ConsentRtdbSnapshot, EmotionTimeSeriesPoint, Participant } from '../types'

/** Client input after the 60s run (browser-only inference). */
export interface MindPulseSessionInput {
  participant: Participant
  consent: ConsentRtdbSnapshot
  emotionSamples: EmotionFrameSample[]
  sessionMeta: EmotionSessionMeta
  sessionEndedAt: string
  clientSessionId: string
  schemaVersion: 1
}

/**
 * Stored in Realtime Database. RTDB child key = timestamp-based (see firebaseSync).
 * `submittedAt` is the server time when the record was written.
 */
export interface MindPulseRtdbSessionRecord {
  schemaVersion: 1
  submittedAt?: number
  sessionEndedAt: string
  clientSessionId: string
  participantName: string
  age: number
  gender: Gender
  consent: ConsentRtdbSnapshot
  sessionMeta: EmotionSessionMeta
  emotionTimeSeries: EmotionTimeSeriesPoint[]
}

function sampleToTimeSeriesPoint(s: EmotionFrameSample): EmotionTimeSeriesPoint {
  const p = s.facialEmotionProbabilities
  return {
    sessionTimeMs: s.sessionTimeMs,
    neutral: p.neutral,
    happy: p.happy,
    fear: p.fear,
    surprise: p.surprise,
    anger: p.anger,
    sadness: p.sadness,
    disgust: p.disgust,
  }
}

export function buildRtdbSessionRecord(input: MindPulseSessionInput): MindPulseRtdbSessionRecord {
  const {
    participant,
    consent,
    emotionSamples,
    sessionMeta,
    sessionEndedAt,
    clientSessionId,
    schemaVersion,
  } = input
  return {
    schemaVersion,
    sessionEndedAt,
    clientSessionId,
    participantName: participant.name,
    age: participant.age,
    gender: participant.gender,
    consent,
    sessionMeta,
    emotionTimeSeries: emotionSamples.map(sampleToTimeSeriesPoint),
  }
}
