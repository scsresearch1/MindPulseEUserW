import { useState } from 'react'
import type { ConsentAnswer, ConsentResponseLine } from '../types'
import './ConsentForm.css'

export const CONSENT_QUESTIONS: string[] = [
  'Do you understand that this session involves wearing a sensor device and interacting with a screen-based activity?',
  'Do you understand that your physiological data (e.g., heart rate, activity signals) will be collected during this session?',
  'Do you consent to the collection of your physiological data via the wearable device?',
  'Do you understand that your facial expressions may be captured and analyzed using the device camera?',
  'Do you consent to the capture and analysis of your facial expressions during the session?',
  'Do you consent to the recording of your interaction data (such as mouse movements and screen interactions)?',
  'Do you understand that your data will be used for research and product development purposes?',
  'Do you consent to your data being anonymized and used for training machine learning models?',
  'Do you understand that your participation in this session is voluntary?',
  'Do you understand that you can withdraw from the session at any time without any consequences?',
  'Do you confirm that you are participating willingly and feel comfortable continuing with this session?',
  'Do you acknowledge that this system does not provide any medical or psychological diagnosis?',
]

interface Props {
  /** Fires only when all questions are answered and every answer is Yes. */
  onSubmit: (payload: { responses: ConsentResponseLine[]; submittedAt: string }) => void | Promise<void>
  onBack: () => void
}

export default function ConsentForm({ onSubmit, onBack }: Props) {
  const [answers, setAnswers] = useState<ConsentAnswer[]>(
    () => Array.from({ length: CONSENT_QUESTIONS.length }, (): ConsentAnswer => 'yes'),
  )
  const [touched, setTouched] = useState(false)

  const setAnswer = (index: number, value: ConsentAnswer) => {
    setAnswers((prev) => {
      const next = [...prev]
      next[index] = value
      return next
    })
  }

  const allAnswered = answers.every((a) => a !== null)
  const allYes = answers.every((a) => a === 'yes')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setTouched(true)
    if (!allAnswered) return
    if (!allYes) return
    const responses: ConsentResponseLine[] = CONSENT_QUESTIONS.map((q, i) => ({
      question: q,
      answer: answers[i] === 'no' ? 'no' : 'yes',
    }))
    onSubmit({ responses, submittedAt: new Date().toISOString() })
  }

  return (
    <div className="cf-wrap">
      <div className="cf-glow" aria-hidden />
      <div className="cf-card">
        <p className="cf-eyebrow">Informed consent</p>
        <h1 className="cf-title">Consent form</h1>
        <p className="cf-intro">
          Please read each statement and indicate whether you agree. You must answer every
          question to continue. To proceed to the activity, all responses must be{' '}
          <strong>Yes</strong>.
        </p>
        <form className="cf-form" onSubmit={handleSubmit}>
          <ol className="cf-list">
            {CONSENT_QUESTIONS.map((q, i) => (
              <li key={i} className="cf-item">
                <p className="cf-q">{q}</p>
                <div
                  className="cf-yesno"
                  role="group"
                  aria-label={`Question ${i + 1}`}
                >
                  <label className="cf-option">
                    <input
                      type="radio"
                      name={`consent-${i}`}
                      checked={answers[i] === 'yes'}
                      onChange={() => setAnswer(i, 'yes')}
                    />
                    <span>Yes</span>
                  </label>
                  <label className="cf-option">
                    <input
                      type="radio"
                      name={`consent-${i}`}
                      checked={answers[i] === 'no'}
                      onChange={() => setAnswer(i, 'no')}
                    />
                    <span>No</span>
                  </label>
                </div>
              </li>
            ))}
          </ol>
          {touched && !allAnswered && (
            <p className="cf-error" role="alert">
              Please answer every question.
            </p>
          )}
          {touched && allAnswered && !allYes && (
            <p className="cf-error" role="alert">
              All answers must be Yes to participate in this session. You can go back to
              revise your details or exit.
            </p>
          )}
          <div className="cf-actions">
            <button type="button" className="cf-back" onClick={onBack}>
              Back
            </button>
            <button type="submit" className="cf-submit" disabled={!allAnswered}>
              I agree — continue
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
