/**
 * Six-digit case code (000000–999999), zero-padded. Shown in pre-activity UI and stored
 * with consent / session in Firebase. Generated when consent is accepted.
 */
export function createCaseId(): string {
  const u32 = new Uint32Array(1)
  crypto.getRandomValues(u32)
  const n = u32[0] % 1_000_000
  return n.toString().padStart(6, '0')
}
