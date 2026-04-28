import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision'

/** Browser-only model execution; raw video frames never leave the tab for inference. */
const VISION_BUNDLE_URL =
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
const MODEL_ASSET_URL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task'

let loadPromise: Promise<FaceLandmarker> | null = null

export function loadFaceApiModels(): Promise<FaceLandmarker> {
  if (loadPromise) return loadPromise
  loadPromise = (async () => {
    const vision = await FilesetResolver.forVisionTasks(VISION_BUNDLE_URL)
    return FaceLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: MODEL_ASSET_URL,
      },
      outputFaceBlendshapes: true,
      outputFacialTransformationMatrixes: true,
      runningMode: 'VIDEO',
      numFaces: 1,
    })
  })()
  return loadPromise
}
