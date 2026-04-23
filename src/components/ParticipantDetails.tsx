import { useState } from 'react'
import type { Gender, Participant } from '../types'
import './ParticipantDetails.css'

const GENDERS: { value: Gender; label: string }[] = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: 'other', label: 'Other' },
  { value: 'prefer_not', label: 'Prefer not to say' },
]

interface Props {
  initial?: Participant
  onSubmit: (p: Participant) => void
}

export default function ParticipantDetails({ initial, onSubmit }: Props) {
  const [name, setName] = useState(initial?.name ?? '')
  const [age, setAge] = useState(initial?.age != null ? String(initial.age) : '')
  const [gender, setGender] = useState<Gender | ''>(initial?.gender ?? '')
  const [touched, setTouched] = useState(false)

  const ageNum = Number.parseInt(age, 10)
  const ageOk = Number.isFinite(ageNum) && ageNum >= 1 && ageNum <= 120
  const valid = name.trim().length > 0 && ageOk && gender !== ''

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setTouched(true)
    if (!valid) return
    onSubmit({
      name: name.trim(),
      age: ageNum,
      gender: gender as Gender,
    })
  }

  return (
    <div className="pd-wrap">
      <div className="pd-glow" aria-hidden />
      <div className="pd-card">
        <p className="pd-eyebrow">MindPulse Survey</p>
        <h1 className="pd-title">Before we begin</h1>
        <p className="pd-sub">
          Enter a few details. This information is used only to contextualize your session.
        </p>
        <form className="pd-form" onSubmit={handleSubmit} noValidate>
          <label className="pd-field">
            <span className="pd-label">Full name</span>
            <input
              className="pd-input"
              type="text"
              name="name"
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              aria-invalid={touched && !name.trim()}
            />
          </label>
          <label className="pd-field">
            <span className="pd-label">Age</span>
            <input
              className="pd-input"
              type="number"
              name="age"
              min={1}
              max={120}
              inputMode="numeric"
              value={age}
              onChange={(e) => setAge(e.target.value)}
              placeholder="e.g. 28"
              aria-invalid={touched && !ageOk}
            />
          </label>
          <fieldset className="pd-fieldset">
            <legend className="pd-label">Gender</legend>
            <div className="pd-gender-grid">
              {GENDERS.map(({ value, label }) => (
                <label key={value} className="pd-chip">
                  <input
                    type="radio"
                    name="gender"
                    value={value}
                    checked={gender === value}
                    onChange={() => setGender(value)}
                  />
                  <span>{label}</span>
                </label>
              ))}
            </div>
          </fieldset>
          {touched && !valid && (
            <p className="pd-error" role="alert">
              Please complete all fields with a valid age (1–120).
            </p>
          )}
          <button type="submit" className="pd-submit">
            Continue
          </button>
        </form>
      </div>
    </div>
  )
}
