/**
 * TEMP: Delete MindPulse Realtime Database app data (sessions + consent only).
 * Does not touch other Firebase products (Auth, Firestore, Storage).
 *
 * Requires a service account JSON (same as initialize-rtdb-schema.mjs):
 *   set FIREBASE_SERVICE_ACCOUNT=c:\path\to\serviceAccount.json
 *   node scripts/temp-clean-rtdb.mjs --execute
 *
 * Or place scripts/.local-service-account.json
 * Or (same as gcloud) set: GOOGLE_APPLICATION_CREDENTIALS=C:\\path\\key.json
 * Remove this file when finished.
 */
import { readFileSync, existsSync, lstatSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import admin from 'firebase-admin'

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(__dirname, '..')

const DEFAULT_DB_URL = 'https://mindpulse-82eb0-default-rtdb.asia-southeast1.firebasedatabase.app'
const PATHS = ['mindpulse/v1/sessions', 'mindpulse/v1/consent']

const posArgs = process.argv.slice(2).filter((a) => !a.startsWith('--'))
const keyFromArg = posArgs.find((a) => a.endsWith('.json'))
const defaultLocal = resolve(projectRoot, 'scripts', '.local-service-account.json')

const candidateKeyPaths = [
  process.env.FIREBASE_SERVICE_ACCOUNT,
  process.env.GOOGLE_APPLICATION_CREDENTIALS,
  keyFromArg,
  defaultLocal,
].filter(Boolean)

const execute = process.argv.includes('--execute') || process.env.RTDB_CLEAN_EXECUTE === '1'

function isServiceAccountJsonFile(p) {
  if (!p || !existsSync(p)) return false
  try {
    const st = lstatSync(p)
    return st.isFile() && p.toLowerCase().endsWith('.json')
  } catch {
    return false
  }
}

if (!execute) {
  console.log('Dry run. The following RTDB nodes would be removed:')
  for (const p of PATHS) console.log('  /' + p)
  console.log('\nRe-run with: node scripts/temp-clean-rtdb.mjs --execute')
  process.exit(0)
}

const keyPath = candidateKeyPaths.find((p) => isServiceAccountJsonFile(p))
if (!keyPath) {
  console.error('No Firebase service account JSON file found. Checked (in order):')
  for (const p of candidateKeyPaths) {
    if (!p) continue
    let reason = 'missing or not a file'
    if (existsSync(p)) {
      try {
        const st = lstatSync(p)
        if (st.isDirectory()) {
          reason = 'is a folder — set env to the full path of the .json file, not a directory'
        } else if (!p.toLowerCase().endsWith('.json')) {
          reason = 'must be a .json key file (Firebase "Generate new private key")'
        } else {
          reason = 'exists but not accepted (check permissions)'
        }
      } catch {
        reason = 'cannot stat'
      }
    }
    console.error('  -', p)
    console.error('    ' + reason)
  }
  console.error(`\nIf you copied the path from Explorer, it must be the .json file itself, e.g. ...Downloads\\mindpulse-82eb0-xxxxx.json`)
  console.error(`Unset wrong vars (PowerShell): Remove-Item Env:FIREBASE_SERVICE_ACCOUNT; Remove-Item Env:GOOGLE_APPLICATION_CREDENTIALS`)
  console.error(`
Get a key: Firebase Console > Project (mindpulse-82eb0) > Service accounts > Generate new private key

  PowerShell:
    $env:FIREBASE_SERVICE_ACCOUNT="C:\\path\\to\\your-key.json"
    node scripts/temp-clean-rtdb.mjs --execute

  Or copy that file to:
    ${defaultLocal}
`)
  process.exit(1)
}

const serviceAccount = JSON.parse(readFileSync(keyPath, 'utf8'))
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: process.env.FIREBASE_DATABASE_URL || DEFAULT_DB_URL,
})
console.log('Using key:', keyPath)
const db = admin.database()

for (const p of PATHS) {
  await db.ref(p).remove()
  console.log('Removed /' + p)
}
console.log('Done (mindpulse/v1/_schema_info left in place, if any).')
process.exit(0)
