/**
 * Readiness check for Realtime DB uploads; uses in-code `firebaseWebConfig` only.
 */
import { firebaseSyncDisabled, firebaseWebConfig, firebaseWebConfigPath } from './firebaseWebConfig'

export function describeFirebaseSyncBlocker(): string | null {
  if (firebaseSyncDisabled) {
    return 'Upload is off: set firebaseSyncDisabled to false in ' + firebaseWebConfigPath
  }
  const missing: string[] = []
  if (!String(firebaseWebConfig.apiKey ?? '').trim()) missing.push('apiKey')
  if (!String(firebaseWebConfig.projectId ?? '').trim()) missing.push('projectId')
  if (!String(firebaseWebConfig.messagingSenderId ?? '').trim()) missing.push('messagingSenderId')
  if (!String(firebaseWebConfig.appId ?? '').trim()) missing.push('appId')
  if (!String(firebaseWebConfig.databaseURL ?? '').trim()) missing.push('databaseURL')
  if (missing.length) {
    return `Set ${missing.join(', ')} in ${firebaseWebConfigPath} (from Firebase Console → Project settings → Web app).`
  }
  return null
}

export function isFirebaseSessionSyncEnabled(): boolean {
  return describeFirebaseSyncBlocker() === null
}
