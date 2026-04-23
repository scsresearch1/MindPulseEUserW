import * as faceapi from 'face-api.js'

/** All face-api / TF.js model execution happens in the browser tab; nothing is inferred on a server. */

/**
 * Public-folder bundle (see scripts/fetch-face-weights.mjs). Same-origin, works offline
 * and avoids blocked third-party CDNs.
 */
const LOCAL_WEIGHTS = `${import.meta.env.BASE_URL}face-api-weights`

/** Fallback if local files are missing (e.g. before first npm run / CI without assets). */
const REMOTE_FALLBACK =
  'https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights'

let loadPromise: Promise<void> | null = null

export function loadFaceApiModels(): Promise<void> {
  if (loadPromise) return loadPromise
  loadPromise = (async () => {
    const tryLoad = (uri: string) =>
      (async () => {
        await faceapi.nets.tinyFaceDetector.loadFromUri(uri)
        await faceapi.nets.faceLandmark68Net.loadFromUri(uri)
        await faceapi.nets.faceExpressionNet.loadFromUri(uri)
      })()

    try {
      await tryLoad(LOCAL_WEIGHTS)
    } catch (e) {
      console.warn('MindPulse Survey: local face models failed, trying GitHub raw fallback', e)
      try {
        await tryLoad(REMOTE_FALLBACK)
      } catch (e2) {
        throw new Error('Face-API models could not be loaded (local or remote)', {
          cause: e2,
        })
      }
    }
  })()
  return loadPromise
}
