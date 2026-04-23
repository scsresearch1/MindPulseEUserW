/**
 * Download face-api.js model shards into public/face-api-weights/ (same-origin, no external CDN at runtime).
 * Source: https://github.com/justadudewhohacks/face-api.js/tree/master/weights
 */
import { mkdir, writeFile, access, constants } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import https from 'node:https'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const outDir = join(root, 'public', 'face-api-weights')
const base =
  'https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights'

const files = [
  'tiny_face_detector_model-weights_manifest.json',
  'tiny_face_detector_model-shard1',
  'face_landmark_68_model-weights_manifest.json',
  'face_landmark_68_model-shard1',
  'face_expression_model-weights_manifest.json',
  'face_expression_model-shard1',
]

function fetchBytes(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          const loc = res.headers.location
          if (loc) {
            return fetchBytes(loc).then(resolve).catch(reject)
          }
        }
        if (res.statusCode !== 200) {
          reject(new Error(`GET ${url} -> ${res.statusCode}`))
          return
        }
        const chunks = []
        res.on('data', (c) => chunks.push(c))
        res.on('end', () => resolve(Buffer.concat(chunks)))
        res.on('error', reject)
      })
      .on('error', reject)
  })
}

async function exists(p) {
  try {
    await access(p, constants.F_OK)
    return true
  } catch {
    return false
  }
}

async function main() {
  await mkdir(outDir, { recursive: true })
  let got = 0
  for (const name of files) {
    const dest = join(outDir, name)
    if (await exists(dest)) {
      got++
      continue
    }
    const url = `${base}/${name}`
    process.stdout.write(`Fetching ${name}... `)
    const buf = await fetchBytes(url)
    await writeFile(dest, buf)
    console.log(`${buf.length} bytes`)
  }
  if (got === files.length) {
    console.log('face-api-weights: all files already present, skipped.')
  } else {
    console.log('face-api-weights: done.')
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
