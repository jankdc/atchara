#!/usr/bin/env node

/**
 * Large JSON Generator
 * Generates synthetic JSON files of configurable size for memory profiling.
 * Streams output to disk to avoid memory issues during generation.
 *
 * Usage: node generate-large-json.js [--size <size>] [--output <path>]
 *   --size    Target file size (e.g. 100mb, 500mb, 1gb). Default: 100mb
 *   --output  Output file path. Default: /tmp/atchara-large-<size>.json
 */

import { createWriteStream } from 'fs'
import { createRng } from '../scenarios/common.js'

const args = process.argv.slice(2)

function getArg(name, fallback) {
  const idx = args.indexOf(`--${name}`)
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : fallback
}

function parseSize(str) {
  const match = str.toLowerCase().match(/^(\d+(?:\.\d+)?)\s*(kb|mb|gb)$/)
  if (!match) {
    console.error(`Invalid size: ${str}. Use format like 100mb, 1gb`)
    process.exit(1)
  }
  const num = parseFloat(match[1])
  const unit = match[2]
  const multipliers = { kb: 1024, mb: 1024 ** 2, gb: 1024 ** 3 }
  return Math.round(num * multipliers[unit])
}

const sizeStr = getArg('size', '100mb')
const targetBytes = parseSize(sizeStr)
const outputPath = getArg('output', `/tmp/atchara-large-${sizeStr.toLowerCase()}.json`)

const rng = createRng(42)

// Generates a single record matching a realistic schema:
// { id, name, email, age, active, score, tags, address: { street, city, zip } }
function generateRecord(index) {
  const firstNames = ['Alice', 'Bob', 'Charlie', 'Diana', 'Eve', 'Frank', 'Grace', 'Hank']
  const lastNames = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis']
  const cities = ['New York', 'London', 'Tokyo', 'Paris', 'Berlin', 'Sydney', 'Toronto', 'Seoul']
  const streets = ['Main St', 'Oak Ave', 'Pine Rd', 'Elm Dr', 'Cedar Ln', 'Birch Way', 'Maple Ct']
  const tags = ['admin', 'user', 'editor', 'viewer', 'moderator', 'contributor', 'tester']

  const pick = (arr) => arr[Math.floor(rng() * arr.length)]
  const firstName = pick(firstNames)
  const lastName = pick(lastNames)

  const numTags = 1 + Math.floor(rng() * 4)
  const itemTags = []
  for (let t = 0; t < numTags; t++) {
    itemTags.push(pick(tags))
  }

  return {
    id: index,
    name: `${firstName} ${lastName}`,
    email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}@example.com`,
    age: 18 + Math.floor(rng() * 62),
    active: rng() > 0.3,
    score: Math.round(rng() * 10000) / 100,
    tags: itemTags,
    address: {
      street: `${100 + Math.floor(rng() * 9900)} ${pick(streets)}`,
      city: pick(cities),
      zip: String(10000 + Math.floor(rng() * 90000)),
    },
  }
}

async function generate() {
  console.log(`Generating ~${sizeStr} JSON file → ${outputPath}`)

  const ws = createWriteStream(outputPath)
  let bytesWritten = 0
  let recordCount = 0

  const write = (str) =>
    new Promise((resolve, reject) => {
      bytesWritten += Buffer.byteLength(str)
      if (!ws.write(str)) {
        ws.once('drain', resolve)
      } else {
        resolve()
      }
    })

  await write('{"records":[')

  while (bytesWritten < targetBytes) {
    if (recordCount > 0) await write(',')
    const record = generateRecord(recordCount)
    await write(JSON.stringify(record))
    recordCount++

    if (recordCount % 10000 === 0) {
      const pct = Math.min(100, (bytesWritten / targetBytes) * 100).toFixed(1)
      process.stdout.write(
        `\r  ${pct}% (${recordCount} records, ${(bytesWritten / 1024 / 1024).toFixed(1)} MB)`
      )
    }
  }

  await write(']}')

  await new Promise((resolve) => ws.end(resolve))

  console.log(
    `\nDone: ${recordCount} records, ${(bytesWritten / 1024 / 1024).toFixed(1)} MB → ${outputPath}`
  )
}

generate().catch((err) => {
  console.error('Generation failed:', err)
  process.exit(1)
})
