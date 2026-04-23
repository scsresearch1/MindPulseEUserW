/**
 * Activity phase: visuomotor game + optional in-tab webcam inference (face-api.js). Video frames
 * are not uploaded for inference; only derived emotion scores may be sent elsewhere (e.g. Firebase) as JSON after the run.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import * as faceapi from 'face-api.js'
import {
  buildDrawPoints,
  dist2,
  modeFromElapsedSec,
  persistenceMs,
  type Sample,
  type StimulusMode,
} from './ribbonMath'
import type { EmotionFrameSample, EmotionSessionMeta } from '../emotion/emotionTypes'
import { defaultNeutralProbabilities } from '../emotion/emotionTypes'
import { loadFaceApiModels } from '../emotion/loadFaceModels'
import { mapFaceExpressionsToProbabilities } from '../emotion/mapFaceExpressions'
import './StimulusEngine.css'

const TOTAL_SEC = 60
const RIBBON_BASE = 2.2
const RIBBON_SPEED_K = 0.085
const SPLINE_SUBDIV = 10
const EMOTION_SAMPLE_MS = 250

function ribbonPalette(
  mode: StimulusMode,
  elapsed: number,
  lambda: number,
): { outer: string; mid: string; inner: string; core: string; acc: string } {
  const drift = Math.sin(elapsed * 0.85) * 0.5 + 0.5
  switch (mode) {
    case 'calm':
      return {
        outer: 'hsla(172, 82%, 44%, ',
        mid: 'hsla(168, 90%, 54%, ',
        inner: 'hsla(182, 72%, 62%, ',
        core: 'rgba(236, 255, 252, ',
        acc: 'rgba(180, 255, 236, ',
      }
    case 'reward':
      return {
        outer: 'hsla(158, 88%, 42%, ',
        mid: `hsla(${36 + drift * 14}, 86%, 58%, `,
        inner: 'hsla(162, 82%, 60%, ',
        core: 'rgba(255, 252, 232, ',
        acc: 'rgba(255, 214, 150, ',
      }
    case 'responsive':
      return {
        outer: 'hsla(202, 90%, 48%, ',
        mid: 'hsla(278, 52%, 62%, ',
        inner: 'hsla(196, 88%, 58%, ',
        core: 'rgba(232, 244, 255, ',
        acc: 'rgba(220, 200, 255, ',
      }
    case 'tension': {
      const s = lambda * 36
      return {
        outer: `hsla(${22 + s * 0.35}, 78%, 50%, `,
        mid: `hsla(${165 - s * 0.25}, 42%, 44%, `,
        inner: `hsla(${38 + s * 0.6}, 68%, 50%, `,
        core: 'rgba(255, 226, 208, ',
        acc: 'rgba(255, 190, 175, ',
      }
    }
    case 'breathing':
      return {
        outer: `hsla(${166 + Math.sin(elapsed * 1.02) * 16}, 72%, 50%, `,
        mid: 'hsla(256, 38%, 58%, ',
        inner: 'hsla(174, 62%, 58%, ',
        core: 'rgba(244, 252, 255, ',
        acc: 'rgba(210, 230, 255, ',
      }
    default:
      return {
        outer: 'hsla(168, 85%, 48%, ',
        mid: 'hsla(168, 80%, 55%, ',
        inner: 'hsla(172, 70%, 60%, ',
        core: 'rgba(220, 255, 248, ',
        acc: 'rgba(200, 255, 240, ',
      }
  }
}

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  born: number
  life: number
}

interface Ripple {
  x: number
  y: number
  t0: number
}

interface Flare {
  x: number
  y: number
  t0: number
}

interface SessionEndPayload {
  samples: EmotionFrameSample[]
  meta: EmotionSessionMeta
}

interface Props {
  /** Assigned when consent is accepted; shown in the UI and stored with session data. */
  caseId: string
  /** Called when the user taps “Continue” on the end screen; always receives the 60s capture payload. */
  onSessionEnd: (data: SessionEndPayload) => void
}

type PrepState = 'loading' | 'need_start' | 'cursor_brief' | 'running'

const EMPTY_SESSION_END: SessionEndPayload = {
  samples: [],
  meta: { hadCamera: false, modelsLoaded: false, usedFaceInference: false },
}

export default function StimulusEngine({ caseId, onSessionEnd }: Props) {
  const endSessionDataRef = useRef<SessionEndPayload | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const dprRef = useRef(1)
  const streamRef = useRef<MediaStream | null>(null)
  const sessionHadCameraRef = useRef(false)
  const modelsReadyRef = useRef(false)
  const faceApiRanRef = useRef(false)
  const [prep, setPrep] = useState<PrepState>('loading')
  const [modelsReady, setModelsReady] = useState(false)
  const [prepError, setPrepError] = useState<string | null>(null)

  const [hud, setHud] = useState({ sec: 0, done: false })
  const hudSecRef = useRef(-1)

  const startRef = useRef<number | null>(null)
  const cursorRef = useRef({
    x: 0,
    y: 0,
    rx: 0,
    ry: 0,
    prx: 0,
    pry: 0,
    lastT: 0,
    speed: 0,
    inited: false,
  })
  const samplesRef = useRef<Sample[]>([])
  const lagRef = useRef({ x: 0, y: 0 })
  const modeRef = useRef<StimulusMode>('calm')
  const speedRingRef = useRef<number[]>([])
  const smoothSinceRef = useRef<number | null>(null)
  const bloomUntilRef = useRef(0)
  const lastLoopAtRef = useRef(0)
  const particlesRef = useRef<Particle[]>([])
  const ripplesRef = useRef<Ripple[]>([])
  const flaresRef = useRef<Flare[]>([])
  const rafRef = useRef(0)

  const emotionSamplesRef = useRef<EmotionFrameSample[]>([])
  const emotionEmittedRef = useRef(false)
  const emotionIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const sessionT0Ref = useRef(0)
  const detectBusyRef = useRef(false)
  const modeFlashRef = useRef(0)

  useEffect(() => {
    modelsReadyRef.current = modelsReady
  }, [modelsReady])

  const stopMediaStream = useCallback(() => {
    const v = videoRef.current
    if (v?.srcObject) {
      const ms = v.srcObject as MediaStream
      ms.getTracks().forEach((t) => t.stop())
      v.srcObject = null
    }
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
  }, [])

  useEffect(() => {
    let cancelled = false

    ;(async () => {
      try {
        await loadFaceApiModels()
        if (!cancelled) setModelsReady(true)
      } catch {
        if (!cancelled) {
          setModelsReady(false)
          setPrepError('Vision models could not be loaded. Facial expression capture is disabled.')
        }
      }

      if (cancelled) return

      let stream: MediaStream | null = null
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'user',
            width: { ideal: 640 },
            height: { ideal: 480 },
          },
          audio: false,
        })
      } catch {
        stream = null
      }

      if (cancelled) {
        stream?.getTracks().forEach((t) => t.stop())
        return
      }

      if (stream) {
        streamRef.current = stream
        sessionHadCameraRef.current = true
        const v = videoRef.current
        if (v) {
          v.srcObject = stream
          try {
            await v.play()
            setPrepError(null)
            setPrep('cursor_brief')
            return
          } catch {
            stream.getTracks().forEach((t) => t.stop())
            streamRef.current = null
            sessionHadCameraRef.current = false
            setPrepError('Camera stream could not be started.')
          }
        }
      }

      setPrep('need_start')
      if (!stream) {
        setPrepError(
          'Camera access was denied or no camera is available. You can still run the activity without facial capture.',
        )
      }
    })()

    return () => {
      cancelled = true
      stopMediaStream()
    }
  }, [stopMediaStream])

  const startWithoutCamera = useCallback(() => {
    sessionHadCameraRef.current = false
    stopMediaStream()
    setPrep('cursor_brief')
  }, [stopMediaStream])

  const resize = useCallback(() => {
    const c = canvasRef.current
    if (!c) return
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    dprRef.current = dpr
    const w = window.innerWidth
    const h = window.innerHeight
    c.width = Math.floor(w * dpr)
    c.height = Math.floor(h * dpr)
    c.style.width = `${w}px`
    c.style.height = `${h}px`
    const ctx = c.getContext('2d')
    if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  }, [])

  useEffect(() => {
    resize()
    window.addEventListener('resize', resize)
    return () => window.removeEventListener('resize', resize)
  }, [resize])

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const c = canvasRef.current
      if (!c) return
      const r = c.getBoundingClientRect()
      cursorRef.current.rx = e.clientX - r.left
      cursorRef.current.ry = e.clientY - r.top
    }
    window.addEventListener('pointermove', onMove)
    return () => window.removeEventListener('pointermove', onMove)
  }, [])

  useEffect(() => {
    if (prep !== 'running') return

    const c = canvasRef.current
    if (!c) return
    const ctx = c.getContext('2d')
    if (!ctx) return

    const t0 = performance.now()
    sessionT0Ref.current = t0
    startRef.current = t0
    emotionSamplesRef.current = []
    emotionEmittedRef.current = false
    faceApiRanRef.current = false
    endSessionDataRef.current = null

    const cr = cursorRef.current
    cr.prx = cr.rx
    cr.pry = cr.ry
    cr.x = cr.rx
    cr.y = cr.ry
    cr.inited = true
    lagRef.current = { x: cr.rx, y: cr.ry }

    const emitEmotionIfNeeded = () => {
      if (emotionEmittedRef.current) return
      emotionEmittedRef.current = true
      if (emotionIntervalRef.current != null) {
        window.clearInterval(emotionIntervalRef.current)
        emotionIntervalRef.current = null
      }
      const meta: EmotionSessionMeta = {
        hadCamera: sessionHadCameraRef.current,
        modelsLoaded: modelsReadyRef.current,
        usedFaceInference: faceApiRanRef.current,
      }
      const samples = [...emotionSamplesRef.current]
      endSessionDataRef.current = { samples, meta }
      stopMediaStream()
    }

    const tick = (now: number) => {
      const start = startRef.current!
      const elapsed = (now - start) / 1000
      const mode = modeFromElapsedSec(elapsed)
      const prevMode = modeRef.current
      modeRef.current = mode

      if (mode !== prevMode) {
        modeFlashRef.current = 1
        if (mode === 'tension') {
          lagRef.current.x = cursorRef.current.rx
          lagRef.current.y = cursorRef.current.ry
        }
        particlesRef.current = []
      }

      if (mode === 'complete') {
        rootRef.current?.style.setProperty('--se-progress', '1')
        const sec = Math.floor(TOTAL_SEC)
        if (hudSecRef.current !== sec) {
          hudSecRef.current = sec
          setHud({ sec, done: true })
        }
        emitEmotionIfNeeded()
        return
      }

      const secFloored = Math.min(TOTAL_SEC, Math.floor(elapsed))
      if (secFloored !== hudSecRef.current) {
        hudSecRef.current = secFloored
        setHud({ sec: secFloored, done: false })
      }

      const dpr = dprRef.current
      const cw = c.width / dpr
      const ch = c.height / dpr
      const maxDim = Math.max(cw, ch)

      const cur = cursorRef.current
      const dt = cur.lastT > 0 ? Math.min(0.05, (now - cur.lastT) / 1000) : 0.016
      cur.lastT = now

      if (!cur.inited) {
        cur.prx = cur.rx
        cur.pry = cur.ry
        cur.inited = true
      }

      const rdx = cur.rx - cur.prx
      const rdy = cur.ry - cur.pry
      const rdist = Math.hypot(rdx, rdy)
      let speed = dt > 0 ? rdist / dt : 0
      if (rdist < 0.5) speed *= 0.25
      cur.speed = cur.speed * 0.62 + speed * 0.38
      cur.prx = cur.rx
      cur.pry = cur.ry

      const tensionProgress = Math.max(0, Math.min(1, (elapsed - 35) / 15))
      const lambda = 0.11 + tensionProgress * 0.17

      let tx = cur.rx
      let ty = cur.ry
      if (mode === 'tension') {
        lagRef.current.x += lambda * (cur.rx - lagRef.current.x)
        lagRef.current.y += lambda * (cur.ry - lagRef.current.y)
        tx = lagRef.current.x
        ty = lagRef.current.y
      }

      cur.x = tx
      cur.y = ty

      const persist = persistenceMs(mode)
      const lastS = samplesRef.current.at(-1)
      if (!lastS || dist2(lastS.x, lastS.y, tx, ty) > 2.25) {
        samplesRef.current.push({ x: tx, y: ty, t: now, speed: cur.speed })
      }

      samplesRef.current = samplesRef.current.filter((s) => now - s.t < persist)

      const ring = speedRingRef.current
      ring.push(cur.speed)
      if (ring.length > 28) ring.shift()
      let varSpeed = 0
      if (ring.length >= 12) {
        const mean = ring.reduce((a, b) => a + b, 0) / ring.length
        varSpeed = ring.reduce((a, b) => a + (b - mean) ** 2, 0) / ring.length
      }
      const smooth = varSpeed < 520 && cur.speed > 18

      if (mode === 'reward') {
        if (smooth) {
          if (smoothSinceRef.current === null) smoothSinceRef.current = now
        } else {
          smoothSinceRef.current = null
        }
        const smoothMs =
          smoothSinceRef.current !== null ? now - smoothSinceRef.current : 0
        if (smoothMs > 900 && Math.random() < 0.065) {
          for (let i = 0; i < 3; i++) {
            particlesRef.current.push({
              x: tx,
              y: ty,
              vx: (Math.random() - 0.5) * 80,
              vy: (Math.random() - 0.5) * 80,
              born: now,
              life: 420 + Math.random() * 200,
            })
          }
        }
        const samps = samplesRef.current
        if (samps.length >= 36 && now - lastLoopAtRef.current > 900) {
          const a = samps[samps.length - 32]
          const b = samps[samps.length - 1]
          let pathLen = 0
          for (let i = samps.length - 31; i < samps.length; i++) {
            pathLen += Math.hypot(samps[i].x - samps[i - 1].x, samps[i].y - samps[i - 1].y)
          }
          if (pathLen > 140 && Math.hypot(b.x - a.x, b.y - a.y) < 32) {
            bloomUntilRef.current = Math.max(bloomUntilRef.current, now + 380)
            lastLoopAtRef.current = now
          }
        }
      } else {
        smoothSinceRef.current = null
      }

      if (mode === 'responsive' && lastS && samplesRef.current.length >= 3) {
        const prev = samplesRef.current[samplesRef.current.length - 2]
        const v1x = lastS.x - prev.x
        const v1y = lastS.y - prev.y
        const v2x = tx - lastS.x
        const v2y = ty - lastS.y
        const m1 = Math.hypot(v1x, v1y)
        const m2 = Math.hypot(v2x, v2y)
        if (m1 > 4 && m2 > 4) {
          const a1 = Math.atan2(v1y, v1x)
          const a2 = Math.atan2(v2y, v2x)
          let da = a2 - a1
          while (da > Math.PI) da -= 2 * Math.PI
          while (da < -Math.PI) da += 2 * Math.PI
          if (Math.abs(da) > 0.65) {
            flaresRef.current.push({ x: lastS.x, y: lastS.y, t0: now })
          }
        }
        const prevSpeed = lastS.speed
        if (prevSpeed > 220 && cur.speed < 55 && rdist > 0.5) {
          ripplesRef.current.push({ x: tx, y: ty, t0: now })
        }
      }

      rootRef.current?.style.setProperty(
        '--se-progress',
        String(Math.min(1, Math.max(0, elapsed / TOTAL_SEC))),
      )

      modeFlashRef.current *= 0.86

      ctx.fillStyle = '#02040a'
      ctx.fillRect(0, 0, cw, ch)

      const driftX = Math.sin(elapsed * 0.31) * 0.04
      const driftY = Math.cos(elapsed * 0.27) * 0.03
      const g0 = ctx.createRadialGradient(
        cw * (0.48 + driftX),
        ch * (0.38 + driftY),
        0,
        cw * 0.5,
        ch * 0.48,
        maxDim * 0.72,
      )
      if (mode === 'tension') {
        g0.addColorStop(0, 'rgba(28, 18, 32, 1)')
        g0.addColorStop(0.45, 'rgba(12, 10, 22, 1)')
        g0.addColorStop(1, '#030308')
      } else if (mode === 'reward') {
        g0.addColorStop(0, 'rgba(14, 28, 32, 1)')
        g0.addColorStop(0.5, 'rgba(10, 14, 28, 1)')
        g0.addColorStop(1, '#03050c')
      } else if (mode === 'responsive') {
        g0.addColorStop(0, 'rgba(14, 20, 38, 1)')
        g0.addColorStop(0.45, 'rgba(12, 12, 30, 1)')
        g0.addColorStop(1, '#03040e')
      } else if (mode === 'breathing') {
        g0.addColorStop(0, 'rgba(16, 22, 40, 1)')
        g0.addColorStop(0.55, 'rgba(10, 14, 28, 1)')
        g0.addColorStop(1, '#03050e')
      } else {
        g0.addColorStop(0, 'rgba(12, 22, 38, 1)')
        g0.addColorStop(0.5, 'rgba(8, 12, 26, 1)')
        g0.addColorStop(1, '#03050c')
      }
      ctx.fillStyle = g0
      ctx.fillRect(0, 0, cw, ch)

      const g1 = ctx.createRadialGradient(
        cw * (0.62 + Math.sin(elapsed * 0.19) * 0.05),
        ch * (0.72 + Math.cos(elapsed * 0.23) * 0.04),
        0,
        cw * 0.5,
        ch * 0.55,
        maxDim * 0.45,
      )
      g1.addColorStop(0, 'rgba(0, 229, 196, 0.04)')
      g1.addColorStop(0.55, 'rgba(76, 201, 240, 0.02)')
      g1.addColorStop(1, 'transparent')
      ctx.fillStyle = g1
      ctx.fillRect(0, 0, cw, ch)

      const subdiv =
        mode === 'calm' || mode === 'breathing'
          ? 12
          : mode === 'reward'
            ? 11
            : SPLINE_SUBDIV
      const drawPts = buildDrawPoints(samplesRef.current, mode, subdiv)
      const pal = ribbonPalette(mode, elapsed, lambda)
      const breathOmega = Math.PI * 2 * 0.75
      const breathPhase = elapsed * breathOmega + cur.speed * 0.0012

      let rewardGlowBoost = 1
      if (mode === 'reward') {
        const smoothMs =
          smoothSinceRef.current !== null ? now - smoothSinceRef.current : 0
        if (smoothMs > 1000) rewardGlowBoost = 1.28 + Math.min(0.35, smoothMs / 8000)
      }

      const bloomAmt = now < bloomUntilRef.current ? (bloomUntilRef.current - now) / 380 : 0
      const nSeg = Math.max(1, drawPts.length - 1)

      for (let pass = 0; pass < drawPts.length - 1; pass++) {
        const p = drawPts[pass]
        const q = drawPts[pass + 1]
        const headBias = (pass + 1) / nSeg
        const fade = Math.max(0.1, 0.25 + 0.75 * headBias)
        const midSpeed = (p.speed + q.speed) / 2
        let w = RIBBON_BASE + midSpeed * RIBBON_SPEED_K
        if (mode === 'breathing') {
          const amp = 0.45 + Math.min(0.9, cur.speed * 0.002)
          w *= 1 + amp * Math.sin(breathPhase + p.u * 0.08)
        }
        let alpha = fade * 0.92

        let x1 = p.x
        let y1 = p.y
        let x2 = q.x
        let y2 = q.y
        if (mode === 'responsive') {
          const nx = q.y - p.y
          const ny = -(q.x - p.x)
          const nm = Math.hypot(nx, ny) || 1
          const wave =
            Math.sin(p.u * 0.22 + elapsed * 3.15) * 1.65 +
            Math.sin(p.u * 0.11 + elapsed * 1.4) * 0.45
          x1 += (nx / nm) * wave
          x2 += (nx / nm) * wave
          y1 += (ny / nm) * wave
          y2 += (ny / nm) * wave
        }

        let glow = rewardGlowBoost + bloomAmt * 0.85
        if (mode === 'breathing') {
          glow *= 1 + 0.22 * Math.sin(breathPhase * 1.05 + p.u * 0.05)
        }

        ctx.save()
        ctx.lineCap = 'round'
        ctx.lineJoin = 'round'
        ctx.beginPath()
        ctx.moveTo(x1, y1)
        ctx.lineTo(x2, y2)
        ctx.strokeStyle = `${pal.outer}${alpha * 0.1 * glow})`
        ctx.lineWidth = w * 6.2
        ctx.stroke()
        ctx.strokeStyle = `${pal.mid}${alpha * 0.2 * glow})`
        ctx.lineWidth = w * 3.2
        ctx.stroke()
        ctx.strokeStyle = `${pal.inner}${alpha * 0.32 * glow})`
        ctx.lineWidth = w * 1.65
        ctx.stroke()
        ctx.beginPath()
        ctx.moveTo(x1, y1)
        ctx.lineTo(x2, y2)
        ctx.strokeStyle = `${pal.core}${alpha * 0.58})`
        ctx.lineWidth = w * 1.05
        ctx.stroke()
        ctx.strokeStyle = `${pal.acc}${alpha * 0.22 * glow})`
        ctx.lineWidth = Math.max(0.9, w * 0.42)
        ctx.stroke()
        ctx.beginPath()
        ctx.moveTo(x1, y1)
        ctx.lineTo(x2, y2)
        ctx.strokeStyle = `rgba(255, 255, 255, ${alpha * 0.28})`
        ctx.lineWidth = Math.max(0.55, w * 0.2)
        ctx.stroke()
        ctx.restore()
      }

      ripplesRef.current = ripplesRef.current.filter((r) => now - r.t0 < 900)
      for (const r of ripplesRef.current) {
        const u = (now - r.t0) / 900
        const rad = u * 128
        const a = (1 - u) * 0.42
        ctx.save()
        ctx.globalAlpha = a * 0.45
        ctx.strokeStyle = 'rgba(76, 201, 240, 0.5)'
        ctx.lineWidth = 5 * (1 - u)
        ctx.beginPath()
        ctx.arc(r.x, r.y, rad, 0, Math.PI * 2)
        ctx.stroke()
        ctx.globalAlpha = a * 0.85
        ctx.strokeStyle = 'rgba(0, 229, 196, 0.75)'
        ctx.lineWidth = 2.2 * (1 - u)
        ctx.beginPath()
        ctx.arc(r.x, r.y, rad * 0.92, 0, Math.PI * 2)
        ctx.stroke()
        ctx.restore()
      }

      flaresRef.current = flaresRef.current.filter((f) => now - f.t0 < 500)
      for (const f of flaresRef.current) {
        const u = (now - f.t0) / 500
        const a = (1 - u) * 0.62
        ctx.save()
        ctx.globalAlpha = a * 0.4
        const grd2 = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, 64 * (1 - u * 0.25))
        grd2.addColorStop(0, 'rgba(76, 201, 240, 0.35)')
        grd2.addColorStop(0.5, 'rgba(0, 229, 196, 0.12)')
        grd2.addColorStop(1, 'transparent')
        ctx.fillStyle = grd2
        ctx.beginPath()
        ctx.arc(f.x, f.y, 58, 0, Math.PI * 2)
        ctx.fill()
        ctx.globalAlpha = a * 0.85
        const grd = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, 44 * (1 - u * 0.28))
        grd.addColorStop(0, 'rgba(255, 255, 255, 0.65)')
        grd.addColorStop(0.3, 'rgba(0, 229, 196, 0.45)')
        grd.addColorStop(1, 'transparent')
        ctx.fillStyle = grd
        ctx.beginPath()
        ctx.arc(f.x, f.y, 48, 0, Math.PI * 2)
        ctx.fill()
        ctx.restore()
      }

      if (bloomAmt > 0) {
        ctx.save()
        ctx.globalAlpha = bloomAmt * 0.26
        const bg = ctx.createRadialGradient(
          cw * 0.5,
          ch * 0.48,
          0,
          cw * 0.5,
          ch * 0.52,
          maxDim * 0.65,
        )
        bg.addColorStop(0, 'rgba(200, 160, 255, 0.55)')
        bg.addColorStop(0.35, 'rgba(157, 78, 221, 0.4)')
        bg.addColorStop(0.6, 'rgba(0, 229, 196, 0.18)')
        bg.addColorStop(1, 'transparent')
        ctx.fillStyle = bg
        ctx.fillRect(0, 0, cw, ch)
        ctx.restore()
      }

      const mf = modeFlashRef.current
      if (mf > 0.025) {
        ctx.save()
        ctx.globalAlpha = mf * 0.16
        const flashG = ctx.createRadialGradient(
          cw * 0.5,
          ch * 0.44,
          0,
          cw * 0.5,
          ch * 0.5,
          maxDim * 0.55,
        )
        flashG.addColorStop(0, 'rgba(255, 255, 255, 0.85)')
        flashG.addColorStop(0.35, 'rgba(0, 229, 196, 0.4)')
        flashG.addColorStop(1, 'transparent')
        ctx.fillStyle = flashG
        ctx.fillRect(0, 0, cw, ch)
        ctx.restore()
      }

      particlesRef.current = particlesRef.current.filter((p) => now - p.born < p.life)
      for (const pr of particlesRef.current) {
        const u = (now - pr.born) / pr.life
        pr.x += pr.vx * dt
        pr.y += pr.vy * dt
        pr.vy += 22 * dt
        const prad = 3.2 * (1 - u * 0.48)
        ctx.save()
        ctx.globalAlpha = (1 - u) * 0.88
        const pg = ctx.createRadialGradient(pr.x, pr.y, 0, pr.x, pr.y, prad)
        pg.addColorStop(0, 'rgba(255, 255, 255, 0.95)')
        pg.addColorStop(0.4, 'rgba(180, 255, 236, 0.65)')
        pg.addColorStop(1, 'transparent')
        ctx.fillStyle = pg
        ctx.beginPath()
        ctx.arc(pr.x, pr.y, prad, 0, Math.PI * 2)
        ctx.fill()
        ctx.restore()
      }

      const vig = ctx.createRadialGradient(
        cw * 0.5,
        ch * 0.5,
        maxDim * 0.26,
        cw * 0.5,
        ch * 0.5,
        maxDim * 0.95,
      )
      vig.addColorStop(0, 'transparent')
      vig.addColorStop(0.65, 'rgba(0, 0, 0, 0.18)')
      vig.addColorStop(1, 'rgba(0, 0, 0, 0.58)')
      ctx.fillStyle = vig
      ctx.fillRect(0, 0, cw, ch)

      const crx = cur.rx
      const cry = cur.ry
      const pulse = 0.65 + Math.sin(elapsed * 4.2) * 0.35
      ctx.save()
      ctx.strokeStyle = `rgba(0, 229, 196, ${0.12 * pulse})`
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.arc(crx, cry, 9 + Math.sin(elapsed * 5) * 0.6, 0, Math.PI * 2)
      ctx.stroke()
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)'
      ctx.beginPath()
      ctx.arc(crx, cry, 26, 0, Math.PI * 2)
      ctx.stroke()
      ctx.fillStyle = 'rgba(255, 255, 255, 0.65)'
      ctx.beginPath()
      ctx.arc(crx, cry, 1.35, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()

      ctx.save()
      ctx.font = '600 12px "Plus Jakarta Sans", system-ui, sans-serif'
      ctx.fillStyle = 'rgba(240, 244, 250, 0.08)'
      ctx.fillText(`${elapsed.toFixed(1)}s / ${TOTAL_SEC}s`, 25, 29)
      ctx.fillStyle = 'rgba(240, 244, 250, 0.62)'
      ctx.fillText(`${elapsed.toFixed(1)}s / ${TOTAL_SEC}s`, 24, 28)
      ctx.restore()

      rafRef.current = requestAnimationFrame(tick)
    }

    rafRef.current = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(rafRef.current)
    }
  }, [prep, stopMediaStream])

  useEffect(() => {
    if (prep !== 'running') return

    const iv = window.setInterval(() => {
      void (async () => {
        const t0 = sessionT0Ref.current
        const elapsed = performance.now() - t0
        if (elapsed >= TOTAL_SEC * 1000) return

        if (!streamRef.current) {
          return
        }

        const v = videoRef.current
        if (detectBusyRef.current) {
          return
        }

        if (!modelsReadyRef.current) {
          emotionSamplesRef.current.push({
            sessionTimeMs: elapsed,
            facialEmotionProbabilities: defaultNeutralProbabilities(),
          })
          return
        }

        if (!v || v.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
          emotionSamplesRef.current.push({
            sessionTimeMs: elapsed,
            facialEmotionProbabilities: defaultNeutralProbabilities(),
          })
          return
        }

        detectBusyRef.current = true
        try {
          const det = await faceapi
            .detectSingleFace(
              v,
              new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.5 }),
            )
            .withFaceLandmarks()
            .withFaceExpressions()

          faceApiRanRef.current = true
          const probs = det
            ? mapFaceExpressionsToProbabilities(det.expressions)
            : defaultNeutralProbabilities()
          emotionSamplesRef.current.push({
            sessionTimeMs: elapsed,
            facialEmotionProbabilities: probs,
          })
        } catch {
          faceApiRanRef.current = true
          emotionSamplesRef.current.push({
            sessionTimeMs: elapsed,
            facialEmotionProbabilities: defaultNeutralProbabilities(),
          })
        } finally {
          detectBusyRef.current = false
        }
      })()
    }, EMOTION_SAMPLE_MS)

    emotionIntervalRef.current = iv
    return () => {
      window.clearInterval(iv)
      emotionIntervalRef.current = null
    }
  }, [prep, modelsReady])

  return (
    <div ref={rootRef} className="se-root">
      {caseId && (
        <div className="se-case-id-bar" role="status" aria-label="Case ID">
          <span className="se-case-id-label">Case ID</span>
          <code className="se-case-id-value">{caseId}</code>
        </div>
      )}
      <video
        ref={videoRef}
        className="se-hidden-video"
        muted
        playsInline
        autoPlay
        aria-hidden
        tabIndex={-1}
      />
      {prep === 'loading' && (
        <div className="se-prep">
          <div className="se-prep-card">
            <div className="se-prep-spinner" aria-hidden />
            <p className="se-prep-title">Preparing session</p>
            <p className="se-prep-text">
              Loading vision models and camera. The video feed is not shown on screen.
            </p>
          </div>
        </div>
      )}
      {prep === 'need_start' && (
        <div className="se-prep">
          <div className="se-prep-card">
            <p className="se-prep-title">Camera unavailable</p>
            <p className="se-prep-text">
              {prepError ??
                'Allow camera access to record facial expression probabilities during the activity, or continue without capture.'}
            </p>
            <button type="button" className="se-prep-btn" onClick={startWithoutCamera}>
              Start without camera
            </button>
          </div>
        </div>
      )}
      {prep === 'cursor_brief' && (
        <div
          className="se-prep se-cursor-brief"
          role="dialog"
          aria-modal="true"
          aria-labelledby="se-cursor-brief-title"
          aria-describedby="se-cursor-brief-desc"
        >
          <div className="se-prep-card se-cursor-brief-card">
            <p className="se-cursor-brief-eyebrow">Upcoming task</p>
            <h2 className="se-cursor-brief-title" id="se-cursor-brief-title">
              Visuomotor guidance
            </h2>
            <div className="se-cursor-brief-body" id="se-cursor-brief-desc">
              <p>
                For the next segment, please <strong>move the cursor</strong> across the viewing area
                in a smooth, continuous manner. The animated display is coupled to the path and
                velocity of your pointer; a relaxed, even motion yields the most coherent results.
              </p>
              <p>
                When the sequence begins, a timer will appear at the top of the screen. You may
                position your hand comfortably before you start&mdash;the timed interval commences
                only after you confirm below.
              </p>
            </div>
            <button
              type="button"
              className="se-prep-btn se-cursor-brief-btn"
              onClick={() => setPrep('running')}
            >
              Begin timed sequence
            </button>
          </div>
        </div>
      )}
      <canvas
        ref={canvasRef}
        className={`se-canvas${prep === 'running' && !hud.done ? ' se-canvas-live' : ''}`}
      />
      {prep === 'running' && (
        <div className="se-hud">
          <div className="se-hud-glass">
            <div className="se-hud-row">
              <span className="se-hud-title">Move the cursor</span>
              <span className="se-hud-phase" aria-live="polite">
                {hud.sec}s / {TOTAL_SEC}s
              </span>
            </div>
            <div className="se-hud-track" aria-hidden>
              <div className="se-hud-fill" />
            </div>
          </div>
        </div>
      )}
      {hud.done && (
        <div className="se-done">
          <div className="se-done-card">
            <h2 className="se-done-title">Session complete</h2>
            <p className="se-done-text">
              The 60-second stimulus sequence has finished. Thank you for participating.
            </p>
            <button
              type="button"
              className="se-done-btn"
              onClick={() => onSessionEnd(endSessionDataRef.current ?? EMPTY_SESSION_END)}
            >
              Continue
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
