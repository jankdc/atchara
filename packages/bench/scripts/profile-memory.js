#!/usr/bin/env node

/**
 * Memory Timeline Profiler for parseLarge
 *
 * Instruments parseLarge with periodic sampling of JS heap, Rust buffer state,
 * and redb file size. Outputs a JSON timeline for visualization.
 *
 * Usage: node profile-memory.js --input <path> [--output <path>] [--interval <ms>]
 *   --input     Path to large JSON file (from generate-large-json.js)
 *   --output    Output JSON timeline path. Default: memory-profile.json
 *   --interval  Sampling interval in ms. Default: 100
 */

import { createReadStream, writeFileSync, statSync, readdirSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { Buffer } from 'buffer'

const args = process.argv.slice(2)

function getArg(name, fallback) {
  const idx = args.indexOf(`--${name}`)
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : fallback
}

const inputPath = getArg('input', null)
const outputPath = getArg('output', 'memory-profile.json')
const sampleIntervalMs = parseInt(getArg('interval', '100'), 10)

if (!inputPath) {
  console.error('Usage: node profile-memory.js --input <path> [--output <path>] [--interval <ms>]')
  process.exit(1)
}

const inputStat = statSync(inputPath)
console.log(`Input: ${inputPath} (${(inputStat.size / 1024 / 1024).toFixed(1)} MB)`)

async function profileParseLarge() {
  const { initialize, string, number, boolean, object, array } = await import('atchara')
  const { Atchara } = await import('@atchara/native')

  await initialize()

  // Schema matching generate-large-json.js output
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

  // Access internal schema to build a native instance for low-level profiling.
  // We need direct access to the StreamingSession to call getMemoryStats() between feeds.
  const serialized = parser.schema.serializeSchema({ value: 0 })
  const native = new Atchara(serialized)
  const session = native.createStreamingSession()

  const timeline = []
  let totalBytesFed = 0
  let chunkIndex = 0
  const startTime = performance.now()
  let lastSampleTime = startTime

  const tempDir = tmpdir()
  let redbPath = null

  function getRedbFileSize() {
    if (!redbPath) {
      try {
        const files = readdirSync(tempDir)
          .filter((f) => f.startsWith('atchara-stream-') && f.endsWith('.redb'))
          .map((f) => {
            const fullPath = join(tempDir, f)
            return { path: fullPath, mtime: statSync(fullPath).mtimeMs }
          })
          .sort((a, b) => b.mtime - a.mtime)
        if (files.length > 0) {
          redbPath = files[0].path
        }
      } catch {
        // Ignore scan errors
      }
    }
    if (redbPath) {
      try {
        return statSync(redbPath).size
      } catch {
        return 0
      }
    }
    return 0
  }

  function sample() {
    const now = performance.now()
    const mem = process.memoryUsage()

    let rustStats = null
    try {
      rustStats = session.getMemoryStats()
    } catch {
      // Session may be finished or aborted
    }

    const redbSize = getRedbFileSize()

    timeline.push({
      time_ms: Math.round(now - startTime),
      chunk_index: chunkIndex,
      bytes_fed: totalBytesFed,
      heap_used: mem.heapUsed,
      heap_total: mem.heapTotal,
      rss: mem.rss,
      external: mem.external,
      array_buffers: mem.arrayBuffers,
      rust_buffer_size: rustStats?.inputBufferSize ?? null,
      rust_buffer_capacity: rustStats?.inputBufferCapacity ?? null,
      rust_parse_position: rustStats?.parsePosition ?? null,
      rust_committed_position: rustStats?.committedPosition ?? null,
      rust_compactions: rustStats?.compactionCount ?? null,
      rust_pending_writes_count: rustStats?.pendingWritesCount ?? null,
      rust_pending_writes_bytes: rustStats?.pendingWritesBytes ?? null,
      redb_file_size: redbSize,
    })
  }

  // Initial sample
  sample()

  const stream = createReadStream(inputPath, { highWaterMark: 64 * 1024 })

  for await (const chunk of stream) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    const [status, errorBytes] = session.feed(buf)

    totalBytesFed += buf.length
    chunkIndex++

    if (status === -1) {
      console.error('Parse error during feed')
      break
    }

    const now = performance.now()
    if (now - lastSampleTime >= sampleIntervalMs) {
      sample()
      lastSampleTime = now

      const pct = ((totalBytesFed / inputStat.size) * 100).toFixed(1)
      process.stdout.write(`\r  ${pct}% fed (${chunkIndex} chunks, ${timeline.length} samples)`)
    }

    if (status === 0) break
  }

  // Final sample before finish
  sample()

  const [isError, , redbClient] = session.finish()

  // Post-finish sample
  sample()

  if (isError) {
    console.error('\nParse error during finish')
  } else {
    if (redbClient) redbClient.close()
  }

  const elapsed = performance.now() - startTime

  console.log(
    `\nDone: ${chunkIndex} chunks, ${timeline.length} samples, ${(elapsed / 1000).toFixed(2)}s`
  )

  const peakRss = Math.max(...timeline.map((t) => t.rss))
  const peakHeap = Math.max(...timeline.map((t) => t.heap_used))
  const maxRedb = Math.max(...timeline.map((t) => t.redb_file_size))
  const rustSamples = timeline.filter((t) => t.rust_buffer_size !== null)
  const maxRustBuf =
    rustSamples.length > 0 ? Math.max(...rustSamples.map((t) => t.rust_buffer_size)) : 0

  const result = {
    meta: {
      input_path: inputPath,
      input_size: inputStat.size,
      total_chunks: chunkIndex,
      total_samples: timeline.length,
      elapsed_ms: Math.round(elapsed),
      sample_interval_ms: sampleIntervalMs,
    },
    summary: {
      peak_rss: peakRss,
      peak_heap_used: peakHeap,
      peak_rust_buffer: maxRustBuf,
      peak_redb_file: maxRedb,
    },
    timeline,
  }

  writeFileSync(outputPath, JSON.stringify(result, null, 2))
  console.log(`\nProfile written to ${outputPath}`)
  console.log(`  Peak RSS:         ${(peakRss / 1024 / 1024).toFixed(1)} MB`)
  console.log(`  Peak heap used:   ${(peakHeap / 1024 / 1024).toFixed(1)} MB`)
  console.log(`  Peak Rust buffer: ${(maxRustBuf / 1024).toFixed(1)} KB`)
  console.log(`  Peak redb file:   ${(maxRedb / 1024 / 1024).toFixed(1)} MB`)
}

profileParseLarge().catch((err) => {
  console.error('Profile failed:', err)
  process.exit(1)
})
