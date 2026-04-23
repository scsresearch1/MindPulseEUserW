/**
 * Realtime Database upload from the browser. Inference stays in the tab; this layer only writes JSON.
 */
import { initializeApp, getApps, type FirebaseApp } from 'firebase/app'
import { getDatabase, ref, set, serverTimestamp, remove } from 'firebase/database'
import { describeFirebaseSyncBlocker, isFirebaseSessionSyncEnabled } from '../config/firebaseEnv'
import { firebaseWebConfig, firebaseWebConfigPath } from '../config/firebaseWebConfig'
import type { ConsentRtdbSnapshot } from '../types'
import type { MindPulseSessionInput } from '../types/sessionSync'
import { buildRtdbSessionRecord } from '../types/sessionSync'

const SESSIONS_PATH = 'mindpulse/v1/sessions'
const CONSENT_PATH = 'mindpulse/v1/consent'
const EXAMPLE_REL = 'mindpulse/v1/sessions/_example'

export type FirebaseSyncResult =
  | { ok: true }
  | { ok: false; code: 'not_configured' | 'write_failed'; message: string }

function readFirebaseConfig() {
  const c = firebaseWebConfig
  if (
    !c.apiKey?.trim() ||
    !c.projectId?.trim() ||
    !c.messagingSenderId?.trim() ||
    !c.appId?.trim() ||
    !c.databaseURL?.trim()
  ) {
    return null
  }
  return { ...c }
}

let app: FirebaseApp | null = null

function getFirebaseApp(): FirebaseApp {
  if (getApps().length) {
    return getApps()[0]!
  }
  const config = readFirebaseConfig()
  if (!config) {
    throw new Error('Firebase is not configured (see ' + firebaseWebConfigPath + ').')
  }
  app = initializeApp(config)
  return app
}

/**
 * RTDB keys must be unique. Primary key: session end (ms) + disambiguated client id (safe chars only).
 */
function buildSessionEntryKey(sessionEndedAtIso: string, caseId: string): string {
  const t = Date.parse(sessionEndedAtIso)
  const ms = Number.isFinite(t) ? t : Date.now()
  const idPart = caseId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 20) || 'id'
  return `${ms}_${idPart}`
}

function buildConsentEntryKey(consentSubmittedAtIso: string, caseId: string): string {
  const t = Date.parse(consentSubmittedAtIso)
  const ms = Number.isFinite(t) ? t : Date.now()
  const idPart = caseId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 20) || 'id'
  return `consent_${ms}_${idPart}`
}

async function removeTemplateExampleNode(db: ReturnType<typeof getDatabase>) {
  try {
    await remove(ref(db, EXAMPLE_REL))
  } catch {
    // ignore (already removed or no permission for delete)
  }
}

function uploadErrorHint(err: unknown) {
  const code = err && typeof err === 'object' && 'code' in err ? String((err as { code?: string }).code) : ''
  if (code === 'PERMISSION_DENIED') {
    return 'Permission denied. In Firebase console → Realtime Database → Rules, allow write under mindpulse/v1/sessions and mindpulse/v1/consent (see scripts/mindpulse-rtdb-dev.rules.json).'
  }
  return 'Check the database URL, project id, and network. Open DevTools (F12) → Console for details.'
}

function notConfiguredResult(): FirebaseSyncResult {
  const message = describeFirebaseSyncBlocker() ?? 'Set firebase config in ' + firebaseWebConfigPath
  console.error('[MindPulse] Firebase write skipped —', message)
  return { ok: false, code: 'not_configured', message }
}

function writeFailedResult(err: unknown, hint: string): FirebaseSyncResult {
  console.error('[MindPulse] Firebase write failed —', hint, err)
  return { ok: false, code: 'write_failed', message: hint }
}

/**
 * Pushes the consent step under mindpulse/v1/consent/{timestampKey}. Called when the participant
 * accepts the form (all Yes).
 */
export async function pushConsentToFirebase(consent: ConsentRtdbSnapshot): Promise<FirebaseSyncResult> {
  if (!isFirebaseSessionSyncEnabled()) {
    return notConfiguredResult()
  }

  const key = buildConsentEntryKey(consent.consentSubmittedAt, consent.caseId)
  const body = {
    ...consent,
    submittedAt: serverTimestamp(),
  }

  try {
    const db = getDatabase(getFirebaseApp())
    await set(ref(db, `${CONSENT_PATH}/${key}`), body)
    await removeTemplateExampleNode(db)
    return { ok: true }
  } catch (err) {
    return writeFailedResult(err, uploadErrorHint(err))
  }
}

/**
 * Full session (participant + consent + time series) under mindpulse/v1/sessions/{timestampKey}.
 */
export async function pushMindPulseSessionToFirebase(
  input: MindPulseSessionInput,
): Promise<FirebaseSyncResult> {
  if (!isFirebaseSessionSyncEnabled()) {
    return notConfiguredResult()
  }

  let body: ReturnType<typeof buildRtdbSessionRecord> & { submittedAt: ReturnType<typeof serverTimestamp> }
  try {
    body = {
      ...buildRtdbSessionRecord(input),
      submittedAt: serverTimestamp(),
    }
  } catch (e) {
    return writeFailedResult(
      e,
      `Could not build session document: ${e instanceof Error ? e.message : String(e)}`,
    )
  }

  const entryKey = buildSessionEntryKey(input.sessionEndedAt, input.caseId)

  try {
    const db = getDatabase(getFirebaseApp())
    await set(ref(db, `${SESSIONS_PATH}/${entryKey}`), body)
    await removeTemplateExampleNode(db)
    return { ok: true }
  } catch (err) {
    return writeFailedResult(err, uploadErrorHint(err))
  }
}
