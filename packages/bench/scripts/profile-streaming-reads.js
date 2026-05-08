#!/usr/bin/env node

/**
 * Stream a JSON file through parseLarge, then perform many random-access
 * reads on the deferred result *without* materialising the whole document.
 *
 * The point is to verify the streaming-with-bounded-heap promise: even a
 * 100 MB doc should be processable in a few MB of JS heap if the consumer
 * sticks to the deferred API (no `result.data.toValue()`).
 */

import { createReadStream, statSync } from 'fs'
import { Buffer } from 'buffer'

const args = process.argv.slice(2)
const getArg = (n, d) => {
  const i = args.indexOf(`--${n}`)
  return i !== -1 && args[i + 1] ? args[i + 1] : d
}

const inputPath = getArg('input', null)
if (!inputPath) {
  console.error('Usage: node profile-streaming-reads.js --input <path>')
  process.exit(1)
}
const sampleCount = parseInt(getArg('samples', '5000'), 10)

const inputStat = statSync(inputPath)
console.log(`Input:           ${inputPath} (${(inputStat.size / 1024 / 1024).toFixed(1)} MB)`)

const { initialize, string, number, boolean, object, array } = await import('atchara')
await initialize()

const parser = object({
  records: array(
    object({
      id: number(),
      name: string(),
      email: string(),
      age: number(),
      active: boolean(),
      score: number(),
      tags: array(string()),
      address: object({
        street: string(),
        city: string(),
        zip: string(),
      }),
    })
  ),
})

// --- write phase --------------------------------------------------------
const wStart = performance.now()
const stream = createReadStream(inputPath, { highWaterMark: 64 * 1024 })
const result = await parser.parseLarge(stream)
const wMs = performance.now() - wStart
const m = process.memoryUsage()
console.log(
  `parseLarge:      ${wMs.toFixed(0)} ms      ` +
    `heap=${(m.heapUsed / 1024 / 1024).toFixed(1)} MB rss=${(m.rss / 1024 / 1024).toFixed(1)} MB`
)

const records = result.data.get('records')
const recordCount = await records.length()
console.log(`records:         ${recordCount.toLocaleString()}`)

// --- random read phase --------------------------------------------------
let seed = 0x12345678
const rng = () => {
  seed = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), seed | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

let peakHeap = m.heapUsed
let peakRss = m.rss

const rStart = performance.now()
let checksum = 0
for (let i = 0; i < sampleCount; i++) {
  const idx = Math.floor(rng() * recordCount)
  const rec = await records.at(idx)
  // Touch one field via the deferred API. Materialise just that field's
  // value, not the whole record. This is the "memory-bounded" pattern.
  const id = await rec.get('id').toValue()
  checksum ^= id | 0

  if ((i & 0xff) === 0xff) {
    const u = process.memoryUsage()
    if (u.heapUsed > peakHeap) peakHeap = u.heapUsed
    if (u.rss > peakRss) peakRss = u.rss
  }
}
const rMs = performance.now() - rStart
console.log(
  `random reads:    ${rMs.toFixed(0)} ms      ` +
    `${sampleCount} samples → ${((rMs * 1000) / sampleCount).toFixed(1)} µs/read`
)

// One more sample after reads
const post = process.memoryUsage()
if (post.heapUsed > peakHeap) peakHeap = post.heapUsed
if (post.rss > peakRss) peakRss = post.rss

console.log(
  `peak during reads: heap=${(peakHeap / 1024 / 1024).toFixed(1)} MB ` +
    `rss=${(peakRss / 1024 / 1024).toFixed(1)} MB`
)
console.log(`checksum:        0x${(checksum >>> 0).toString(16)} (sanity check)`)

result.close()
