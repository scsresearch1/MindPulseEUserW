import { useRef, useState } from 'react'
import ParticipantDetails from './components/ParticipantDetails'
import ConsentForm from './components/ConsentForm'
import StimulusEngine from './components/StimulusEngine'
import SessionReport from './components/SessionReport'
import { describeFirebaseSyncBlocker } from './config/firebaseEnv'
import type { EmotionFrameSample } from './emotion/emotionTypes'
import { createCaseId } from './lib/createCaseId'
import type { ConsentRtdbSnapshot, FlowStep, Participant } from './types'
import './App.css'

export default function App() {
  const participantRef = useRef<Participant | null>(null)
  const consentRef = useRef<ConsentRtdbSnapshot | null>(null)
  const [step, setStep] = useState<FlowStep>('details')
  const [participant, setParticipant] = useState<Participant | null>(null)
  const [consentRecord, setConsentRecord] = useState<ConsentRtdbSnapshot | null>(null)
  const [emotionSamples, setEmotionSamples] = useState<EmotionFrameSample[]>([])
  const [serverSave, setServerSave] = useState<{
    status: 'idle' | 'pending' | 'saved' | 'failed'
    message: string
  }>({ status: 'idle', message: '' })

  participantRef.current = participant
  consentRef.current = consentRecord

  return (
    <div className="survey-app">
      <header className="survey-header">
        <div className="survey-header-inner">
          <span className="survey-logo">MindPulse</span>
          <span className="survey-badge">Survey</span>
          {step !== 'stimulus' && (
            <nav className="survey-steps" aria-label="Progress">
              <span className={step === 'details' ? 'active' : 'done'}>1. Details</span>
              <span
                className={
                  step === 'consent' ? 'active' : step === 'complete' ? 'done' : ''
                }
              >
                2. Consent
              </span>
              <span className={step === 'complete' ? 'done' : ''}>3. Activity</span>
            </nav>
          )}
        </div>
      </header>
      <main className="survey-main">
        {step === 'details' && (
          <ParticipantDetails
            initial={participant ?? undefined}
            onSubmit={(p) => {
              setParticipant(p)
              setStep('consent')
            }}
          />
        )}
        {step === 'consent' && (
          <ConsentForm
            onBack={() => {
              setConsentRecord(null)
              setStep('details')
            }}
            onSubmit={async ({ responses, submittedAt }) => {
              const p = participantRef.current
              if (!p) return
              const caseId = createCaseId()
              const consent: ConsentRtdbSnapshot = {
                schemaVersion: 1,
                consentSubmittedAt: submittedAt,
                caseId,
                participantName: p.name,
                age: p.age,
                gender: p.gender,
                responses,
              }
              setConsentRecord(consent)
              setEmotionSamples([])
              const { pushConsentToFirebase } = await import('./services/firebaseSync')
              const consentR = await pushConsentToFirebase(consent)
              if (!consentR.ok) {
                console.error('[MindPulse] Consent was not stored on the server:', consentR.message)
              }
              setStep('stimulus')
            }}
          />
        )}
        {step === 'stimulus' && consentRecord && (
          <StimulusEngine
            caseId={consentRecord.caseId}
            onSessionEnd={({ samples, meta }) => {
              setEmotionSamples(samples)
              setStep('complete')
              setServerSave({ status: 'pending', message: 'Saving to database…' })
              const p = participantRef.current
              const c = consentRef.current
              if (!p || !c) {
                if (!c) {
                  console.warn('MindPulse: no consent snapshot; session not uploaded to Firebase.')
                }
                setServerSave({
                  status: 'failed',
                  message: 'Session could not be saved (internal state). Return to the start and try again.',
                })
                return
              }
              const envBlocker = describeFirebaseSyncBlocker()
              if (envBlocker) {
                setServerSave({ status: 'failed', message: envBlocker })
                console.error('[MindPulse]', envBlocker)
                return
              }
              void (async () => {
                const { pushMindPulseSessionToFirebase } = await import('./services/firebaseSync')
                const r = await pushMindPulseSessionToFirebase({
                  participant: p,
                  consent: c,
                  emotionSamples: samples,
                  sessionMeta: meta,
                  sessionEndedAt: new Date().toISOString(),
                  caseId: c.caseId,
                  schemaVersion: 1,
                })
                if (r.ok) {
                  setServerSave({
                    status: 'saved',
                    message: 'Your session and consent are stored in the project database.',
                  })
                } else {
                  setServerSave({ status: 'failed', message: r.message })
                }
              })()
            }}
          />
        )}
        {step === 'complete' && participant && consentRecord && (
          <div className="survey-complete-flow">
            <SessionReport
              participant={participant}
              caseId={consentRecord.caseId}
              emotionSamples={emotionSamples}
            />
            <div className="survey-panel survey-complete survey-complete-footer">
              <p className="survey-complete-eyebrow">Thank you</p>
              <p className="survey-lead">
                Thanks for completing the session, {participant.name}. You may close this window
                or start again below.
              </p>
              {serverSave.status !== 'idle' && serverSave.message && (
                <p
                  className={
                    serverSave.status === 'saved'
                      ? 'survey-sync-msg survey-sync-msg--ok'
                      : serverSave.status === 'pending'
                        ? 'survey-sync-msg survey-sync-msg--pending'
                        : 'survey-sync-msg survey-sync-msg--alert'
                  }
                  role="status"
                >
                  {serverSave.message}
                </p>
              )}
              <button
                type="button"
                className="survey-restart"
                onClick={() => {
                  setParticipant(null)
                  setConsentRecord(null)
                  setEmotionSamples([])
                  setServerSave({ status: 'idle', message: '' })
                  setStep('details')
                }}
              >
                New session
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
