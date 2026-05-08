#!/usr/bin/env node

/**
 * Read-side benchmark for parseLarge + random-access reads.
 *
 * Streams a large JSON into a `.kahon` temp file, then exercises the kahon
 * reader along three patterns:
 *   1. Random per-record reads (point access at scattered indices)
 *   2. Sequential per-record reads (cursor through the array)
 *   3. Full document materialization (`result.data.toValue()`)
 *
 * Usage: node profile-reads.js --input <path> [--output <path>]
 *
 * Output JSON is suitable for diffing two runs (e.g., default kahon options
 * vs. tuned kahon options).
 */

import { createReadStream, statSync, writeFileSync } from 'fs'
import { Buffer } from 'buffer'

const args = process.argv.slice(2)
const getArg = (name, fallback) => {
  const i = args.indexOf(`--${name}`)
  return i !== -1 && args[i + 1] ? args[i + 1] : fallback
}

const inputPath = getArg('input', null)
const outputPath = getArg('output', null)
const label = getArg('label', 'kahon-default')

if (!inputPath) {
  console.error('Usage: node profile-reads.js --input <path> [--output <path>] [--label <label>]')
  process.exit(1)
}

const inputStat = statSync(inputPath)
console.log(`Input: ${inputPath} (${(inputStat.size / 1024 / 1024).toFixed(1)} MB)`)
console.log(`Label: ${label}\n`)

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

// --- write path: parseLarge ---------------------------------------------
const writeStart = performance.now()
const stream = createReadStream(inputPath, { highWaterMark: 64 * 1024 })
const result = await parser.parseLarge(stream)
const writeMs = performance.now() - writeStart
console.log(`parseLarge:        ${writeMs.toFixed(0)} ms`)

// --- discover record count via the deferred API -------------------------
const records = result.data.get('records')
const recordCount = await records.length()
console.log(`records:           ${recordCount.toLocaleString()}`)

// --- random reads (1000 samples, evenly distributed indices) ------------
const sampleCount = 1000
const indices = []
for (let i = 0; i < sampleCount; i++) {
  indices.push(Math.floor((i * recordCount) / sampleCount))
}
// Shuffle (mulberry32-ish) so reads look random, not sequential
let seed = 0x12345678
const rng = () => {
  seed = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), seed | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}
for (let i = indices.length - 1; i > 0; i--) {
  const j = Math.floor(rng() * (i + 1))
  ;[indices[i], indices[j]] = [indices[j], indices[i]]
}

const randStart = performance.now()
let randChecksum = 0
for (const i of indices) {
  const rec = await records.at(i)
  const v = await rec.toValue()
  randChecksum ^= v.id | 0
}
const randMs = performance.now() - randStart
console.log(
  `random reads:      ${randMs.toFixed(0)} ms ` +
    `(${sampleCount} samples → ${((randMs * 1000) / sampleCount).toFixed(1)} µs/read)`
)

// --- sequential reads (first 1000 records, in order) --------------------
const seqStart = performance.now()
const seqLimit = Math.min(1000, recordCount)
let seqChecksum = 0
for (let i = 0; i < seqLimit; i++) {
  const rec = await records.at(i)
  const v = await rec.toValue()
  seqChecksum ^= v.id | 0
}
const seqMs = performance.now() - seqStart
console.log(
  `sequential reads:  ${seqMs.toFixed(0)} ms ` +
    `(${seqLimit} records → ${((seqMs * 1000) / seqLimit).toFixed(1)} µs/read)`
)

// --- full materialization ----------------------------------------------
const fullStart = performance.now()
const allData = await result.data.toValue()
const fullMs = performance.now() - fullStart
const fullChecksum = (allData.records?.length ?? 0) | 0
console.log(`full toValue:      ${fullMs.toFixed(0)} ms`)
console.log(
  `                   (full doc materialize, ${(inputStat.size / 1024 / 1024 / (fullMs / 1000)).toFixed(1)} MB/s)`
)

const peakRss = process.memoryUsage().rss
console.log(`\npost-read peak RSS: ${(peakRss / 1024 / 1024).toFixed(1)} MB`)

result.close()

const summary = {
  label,
  input_size: inputStat.size,
  records: recordCount,
  parse_large_ms: Math.round(writeMs),
  random_reads_ms: Math.round(randMs),
  random_read_us_each: Math.round((randMs * 1000) / sampleCount),
  sequential_reads_ms: Math.round(seqMs),
  sequential_read_us_each: Math.round((seqMs * 1000) / seqLimit),
  full_to_value_ms: Math.round(fullMs),
  full_to_value_mbps: Number((inputStat.size / 1024 / 1024 / (fullMs / 1000)).toFixed(2)),
  post_read_rss: peakRss,
  random_checksum: randChecksum,
  sequential_checksum: seqChecksum,
  full_checksum: fullChecksum,
}

if (outputPath) {
  writeFileSync(outputPath, JSON.stringify(summary, null, 2))
  console.log(`\nResult written to ${outputPath}`)
}
