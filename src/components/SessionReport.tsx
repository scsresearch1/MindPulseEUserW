import { useMemo } from 'react'
import type { EmotionFrameSample } from '../emotion/emotionTypes'
import type { Participant } from '../types'
import { buildBehavioralReport, formatEmotionLabel } from '../report/behavioralReport'
import './SessionReport.css'

interface Props {
  participant: Participant
  caseId: string
  emotionSamples: EmotionFrameSample[]
}

export default function SessionReport({ participant, caseId, emotionSamples }: Props) {
  const report = useMemo(() => buildBehavioralReport(emotionSamples), [emotionSamples])
  const hasData = report.frameCount > 0

  const genderLabel =
    participant.gender === 'male'
      ? 'Male'
      : participant.gender === 'female'
        ? 'Female'
        : participant.gender === 'other'
          ? 'Other'
          : 'Prefer not to say'

  const dominantLabel = !hasData
    ? '—'
    : report.dominantEmotion
      ? formatEmotionLabel(report.dominantEmotion)
      : '—'

  const stabilityDisplay = !hasData ? '—' : `${(report.emotionalStability * 100).toFixed(0)}%`

  return (
    <div className="sr-wrap">
      <div className="sr-glow" aria-hidden />
      <div className="sr-card">
        <p className="sr-eyebrow">Session report</p>
        <h1 className="sr-title">Session summary</h1>
        <p className="sr-intro">
          Thank you for completing the activity. The overview below is a high-level summary only.
          This is not a medical or psychological assessment.
        </p>

        <section className="sr-section sr-participant">
          <h2 className="sr-h2">Participant</h2>
          <dl className="sr-dl">
            <div>
              <dt>Name</dt>
              <dd>{participant.name}</dd>
            </div>
            <div>
              <dt>Age</dt>
              <dd>{participant.age}</dd>
            </div>
            <div>
              <dt>Gender</dt>
              <dd>{genderLabel}</dd>
            </div>
            {caseId && (
              <div>
                <dt>Case ID</dt>
                <dd>
                  <code className="sr-case-id">{caseId}</code>
                </dd>
              </div>
            )}
          </dl>
        </section>

        <section className="sr-section">
          <h2 className="sr-h2">At a glance</h2>
          <div className="sr-metrics">
            <div className="sr-metric">
              <span className="sr-metric-label">Dominant expression (session)</span>
              <span className="sr-metric-value" data-empty={!hasData || !report.dominantEmotion}>
                {dominantLabel}
              </span>
              <span className="sr-metric-hint">
                {hasData
                  ? 'Aggregated from all recorded samples in this run.'
                  : 'Not available without expression samples in this run.'}
              </span>
            </div>
            <div className="sr-metric">
              <span className="sr-metric-label">Emotional stability</span>
              <span className="sr-metric-value" data-empty={!hasData}>
                {stabilityDisplay}
              </span>
              <span className="sr-metric-hint">
                {hasData
                  ? 'How often the dominant label stayed the same between samples (higher = fewer shifts).'
                  : 'Not available without expression samples in this run.'}
              </span>
              {hasData && (
                <div
                  className="sr-stability-bar"
                  role="img"
                  aria-label={`Stability ${(report.emotionalStability * 100).toFixed(0)} percent`}
                >
                  <div
                    className="sr-stability-fill"
                    style={{ width: `${report.emotionalStability * 100}%` }}
                  />
                </div>
              )}
            </div>
          </div>
        </section>

        <div className="sr-admin">
          <p className="sr-admin-title">Full report</p>
          <p className="sr-admin-text">
            To receive your <strong>full report</strong> and any detailed or interpretive
            information, contact the <strong>Process Administrator</strong>.
          </p>
          <p className="sr-admin-future">
            A dedicated team portal to review and manage all session data will be introduced in a
            future update.
          </p>
        </div>
      </div>
    </div>
  )
}
