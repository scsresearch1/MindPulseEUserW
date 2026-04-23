/**
 * One-time (or idempotent) Realtime Database structure for MindPulse.
 *
 * Run with a service account JSON (same project as the RTDB URL):
 *   set FIREBASE_SERVICE_ACCOUNT=c:\path\to\serviceAccount.json
 *   node scripts/initialize-rtdb-schema.mjs
 * Or:
 *   node scripts/initialize-rtdb-schema.mjs c:\path\to\serviceAccount.json
 *
 * Do NOT commit the service account file. Protect RTDB with security rules in Firebase Console.
 */
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import admin from 'firebase-admin'

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(__dirname, '..')

const DEFAULT_DB_URL = 'https://mindpulse-82eb0-default-rtdb.asia-southeast1.firebasedatabase.app'
const liveSessionsPath = 'mindpulse/v1/sessions'
const examplePath = `${liveSessionsPath}/_example`

const keyPath =
  process.env.FIREBASE_SERVICE_ACCOUNT ||
  process.argv[2] ||
  resolve(projectRoot, 'scripts', '.local-service-account.json')

function usage() {
  console.error(`Usage:
  set FIREBASE_SERVICE_ACCOUNT=c:\\\\path\\\\to\\\\serviceAccount.json
  node scripts/initialize-rtdb-schema.mjs
  or:
  node scripts/initialize-rtdb-schema.mjs c:\\\\path\\\\to\\\\serviceAccount.json
`)
}

if (!existsSync(keyPath)) {
  console.error('Missing service account file:', keyPath)
  usage()
  process.exit(1)
}

const serviceAccount = JSON.parse(readFileSync(keyPath, 'utf8'))

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: process.env.FIREBASE_DATABASE_URL || DEFAULT_DB_URL,
})
const db = admin.database()

const schemaInfo = {
  projectId: 'mindpulse-82eb0',
  databaseUrl: process.env.FIREBASE_DATABASE_URL || DEFAULT_DB_URL,
  schemaVersion: 1,
  liveSessionsPath: `/${liveSessionsPath}`,
  consentPath: '/mindpulse/v1/consent',
  description:
    'Consent: mindpulse/v1/consent/{consent_{ms}_{clientId}} — all question/answer lines when the user taps Agree. ' +
    'Sessions: mindpulse/v1/sessions/{sessionEndMs}_{clientId} — full run including embedded consent, emotion time series, and sessionMeta. ' +
    'RTDB key is timestamp-first for ordering; client disambiguates collisions. ' +
    'The _example child is a template; the web app removes it after the first real consent or session write.',
  topLevelFieldDescriptions: {
    schemaVersion: 'Number; increment when the stored shape changes.',
    submittedAt: 'Server timestamp (ms) when the record was received.',
    sessionEndedAt: 'ISO-8601 string when the 60s activity ended in the browser.',
    clientSessionId: 'UUID for this run in the client.',
    participantName: 'String',
    age: 'Number (years)',
    gender: "String: 'male' | 'female' | 'other' | 'prefer_not'",
    consent: 'Full ConsentRtdbSnapshot: responses[] with { question, answer yes|no }.',
    sessionMeta: 'Object: hadCamera, modelsLoaded, usedFaceInference (booleans).',
    emotionTimeSeries:
      'Array of points for visualization: sessionTimeMs + seven expression probabilities 0..1, aligned to the stimulus timeline.',
  },
  emotionTimeSeriesItemShape: {
    sessionTimeMs: 'number — ms from start of 60s activity',
    neutral: 'number',
    happy: 'number',
    fear: 'number',
    surprise: 'number',
    anger: 'number',
    sadness: 'number',
    disgust: 'number',
  },
  updatedByScript: 'initialize-rtdb-schema.mjs',
  updatedAt: new Date().toISOString(),
}

const exampleSession = {
  schemaVersion: 1,
  submittedAt: null,
  sessionEndedAt: '2026-01-15T12:00:00.000Z',
  clientSessionId: '00000000-0000-4000-8000-000000000000',
  participantName: 'Sample participant',
  age: 30,
  gender: 'other',
  consent: {
    schemaVersion: 1,
    consentSubmittedAt: '2026-01-15T11:55:00.000Z',
    clientSessionId: '00000000-0000-4000-8000-000000000000',
    participantName: 'Sample participant',
    age: 30,
    gender: 'other',
    responses: [{ question: 'Do you understand that this session involves …?', answer: 'yes' }],
  },
  sessionMeta: {
    hadCamera: true,
    modelsLoaded: true,
    usedFaceInference: true,
  },
  emotionTimeSeries: [
    {
      sessionTimeMs: 0,
      neutral: 0.45,
      happy: 0.2,
      fear: 0.02,
      surprise: 0.08,
      anger: 0.05,
      sadness: 0.12,
      disgust: 0.08,
    },
    {
      sessionTimeMs: 250,
      neutral: 0.4,
      happy: 0.25,
      fear: 0.02,
      surprise: 0.1,
      anger: 0.05,
      sadness: 0.1,
      disgust: 0.08,
    },
  ],
  note: 'Reference row for dashboards; delete on real deployments if you prefer an empty store.',
}

await db.ref('mindpulse/v1/_schema_info').set(schemaInfo)
await db.ref(examplePath).set(exampleSession)

console.log('Realtime Database: wrote schema metadata and example session.')
console.log('  _schema_info   -> /mindpulse/v1/_schema_info')
console.log('  _example      -> /' + examplePath)
console.log('  Consent        -> /mindpulse/v1/consent/* (timestamp-based keys, see _schema_info)')
console.log('  Live sessions  -> /' + liveSessionsPath + '/* (set with session-end ms in key)')
console.log('Configure security rules in Firebase Console before opening writes to the public web.')

process.exit(0)
