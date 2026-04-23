import type { EmotionFrameSample, FacialEmotionProbabilities } from '../emotion/emotionTypes'

export const EMOTION_KEYS = [
  'neutral',
  'happy',
  'fear',
  'surprise',
  'anger',
  'sadness',
  'disgust',
] as const

export type EmotionKey = (typeof EMOTION_KEYS)[number]

export interface EmotionDistribution {
  key: EmotionKey
  mean: number
}

export interface SpikeEvent {
  emotion: EmotionKey
  startSessionMs: number
  peak: number
}

export interface BehavioralReport {
  frameCount: number
  durationSessionMs: number
  distribution: EmotionDistribution[]
  dominantEmotion: EmotionKey | null
  dominantEmotionTotalMass: number
  emotionalStability: number
  spikes: SpikeEvent[]
  seriesByEmotion: Record<EmotionKey, { t: number; p: number }[]>
}

function zerosRecord(): Record<EmotionKey, number> {
  return {
    neutral: 0,
    happy: 0,
    fear: 0,
    surprise: 0,
    anger: 0,
    sadness: 0,
    disgust: 0,
  }
}

export function argmaxEmotion(p: FacialEmotionProbabilities): EmotionKey {
  let best: EmotionKey = 'neutral'
  let v = -1
  for (const k of EMOTION_KEYS) {
    if (p[k] > v) {
      v = p[k]
      best = k
    }
  }
  return best
}

function smooth3(values: number[]): number[] {
  if (values.length === 0) return []
  const out: number[] = []
  for (let i = 0; i < values.length; i++) {
    const a = values[i - 1] ?? values[i]
    const b = values[i]
    const c = values[i + 1] ?? values[i]
    out.push((a + b + c) / 3)
  }
  return out
}

function collectSpikesForEmotion(
  emotion: EmotionKey,
  times: number[],
  probs: number[],
): SpikeEvent[] {
  if (emotion === 'neutral') return []
  const sm = smooth3(probs)
  const events: SpikeEvent[] = []
  let runStart = -1
  const flush = (endIdx: number) => {
    if (runStart < 0) return
    const len = endIdx - runStart
    if (len >= 2) {
      let peak = 0
      for (let j = runStart; j < endIdx; j++) peak = Math.max(peak, probs[j]!)
      events.push({
        emotion,
        startSessionMs: times[runStart]!,
        peak,
      })
    }
    runStart = -1
  }
  for (let i = 0; i < sm.length; i++) {
    if (sm[i]! >= 0.5) {
      if (runStart < 0) runStart = i
    } else {
      flush(i)
    }
  }
  flush(sm.length)
  return events
}

export function buildBehavioralReport(samples: EmotionFrameSample[]): BehavioralReport {
  const n = samples.length
  if (n === 0) {
    return {
      frameCount: 0,
      durationSessionMs: 0,
      distribution: EMOTION_KEYS.map((key) => ({ key, mean: 0 })),
      dominantEmotion: null,
      dominantEmotionTotalMass: 0,
      emotionalStability: 1,
      spikes: [],
      seriesByEmotion: EMOTION_KEYS.reduce(
        (acc, k) => {
          acc[k] = []
          return acc
        },
        {} as Record<EmotionKey, { t: number; p: number }[]>,
      ),
    }
  }

  const sums = zerosRecord()
  const totals = zerosRecord()
  const seriesByEmotion = EMOTION_KEYS.reduce(
    (acc, k) => {
      acc[k] = [] as { t: number; p: number }[]
      return acc
    },
    {} as Record<EmotionKey, { t: number; p: number }[]>,
  )

  for (const s of samples) {
    const p = s.facialEmotionProbabilities
    for (const k of EMOTION_KEYS) {
      sums[k] += p[k]
      totals[k] += p[k]
      seriesByEmotion[k].push({ t: s.sessionTimeMs, p: p[k] })
    }
  }

  const distribution: EmotionDistribution[] = EMOTION_KEYS.map((key) => ({
    key,
    mean: sums[key] / n,
  }))

  let dominantEmotion: EmotionKey | null = null
  let dominantEmotionTotalMass = 0
  for (const k of EMOTION_KEYS) {
    if (totals[k] > dominantEmotionTotalMass) {
      dominantEmotionTotalMass = totals[k]
      dominantEmotion = k
    }
  }

  let transitions = 0
  for (let i = 1; i < n; i++) {
    const a = argmaxEmotion(samples[i - 1]!.facialEmotionProbabilities)
    const b = argmaxEmotion(samples[i]!.facialEmotionProbabilities)
    if (a !== b) transitions++
  }
  const emotionalStability = n < 2 ? 1 : 1 - transitions / (n - 1)

  const times = samples.map((s) => s.sessionTimeMs)
  const allSpikes: SpikeEvent[] = []
  for (const k of EMOTION_KEYS) {
    const probs = samples.map((s) => s.facialEmotionProbabilities[k])
    allSpikes.push(...collectSpikesForEmotion(k, times, probs))
  }
  allSpikes.sort((x, y) => x.startSessionMs - y.startSessionMs)
  const spikes = allSpikes.slice(0, 6)

  const lastT = samples[n - 1]!.sessionTimeMs

  return {
    frameCount: n,
    durationSessionMs: lastT,
    distribution,
    dominantEmotion,
    dominantEmotionTotalMass,
    emotionalStability,
    spikes,
    seriesByEmotion,
  }
}

export function formatEmotionLabel(key: EmotionKey): string {
  const labels: Record<EmotionKey, string> = {
    neutral: 'Neutral',
    happy: 'Happy',
    fear: 'Fear',
    surprise: 'Surprise',
    anger: 'Anger',
    sadness: 'Sadness',
    disgust: 'Disgust',
  }
  return labels[key]
}
