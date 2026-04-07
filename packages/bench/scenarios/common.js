// Seeded PRNG (mulberry32) for reproducible "random" error distribution
export function createRng(seed) {
  return function () {
    let t = (seed += 0x6d2b79f5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Creates a pool of test payloads with specified valid/invalid distribution.
 * Returns only strings - byte encoding is done in each scenario file for Node.js compatibility.
 *
 * @param {object} options
 * @param {number} options.itemCount - Number of items per payload (e.g., 1000)
 * @param {number} options.validPercent - Percentage of payloads that are fully valid (e.g., 90)
 * @param {number} options.poolSize - Total number of payloads in pool (e.g., 100)
 * @param {(index: number) => object} options.createValidItem - Function to create a valid item
 * @param {(index: number, errorType: number) => object} options.createInvalidItem - Function to create an invalid item
 * @param {number} options.errorTypeCount - Number of different error types available
 * @param {(items: object[]) => object} options.wrapItems - Function to wrap items array into final object structure
 * @param {number} [options.seed=12345] - RNG seed for reproducibility
 * @returns {string[]} Array of JSON payload strings
 */
export function createPayloadPool(options) {
  const {
    itemCount,
    validPercent,
    poolSize,
    createValidItem,
    createInvalidItem,
    errorTypeCount,
    wrapItems,
    seed = 12345,
  } = options

  const rng = createRng(seed)

  const validCount = Math.round((poolSize * validPercent) / 100)
  const invalidCount = poolSize - validCount

  const payloadStrs = []

  // Generate fully valid payloads
  for (let p = 0; p < validCount; p++) {
    const items = []
    for (let i = 0; i < itemCount; i++) {
      items.push(createValidItem(i))
    }
    payloadStrs.push(JSON.stringify(wrapItems(items)))
  }

  // Generate invalid payloads with errors at distributed positions
  for (let p = 0; p < invalidCount; p++) {
    // Distribute error positions: early (0-10%), mid (45-55%), late (90-100%)
    const positionBucket = p % 3
    let errorIndex
    if (positionBucket === 0) {
      // Early: 0-10%
      errorIndex = Math.floor(rng() * itemCount * 0.1)
    } else if (positionBucket === 1) {
      // Mid: 45-55%
      errorIndex = Math.floor(itemCount * 0.45 + rng() * itemCount * 0.1)
    } else {
      // Late: 90-100%
      errorIndex = Math.floor(itemCount * 0.9 + rng() * itemCount * 0.1)
    }

    const errorType = Math.floor(rng() * errorTypeCount)

    const items = []
    for (let i = 0; i < itemCount; i++) {
      if (i === errorIndex) {
        items.push(createInvalidItem(i, errorType))
      } else {
        items.push(createValidItem(i))
      }
    }
    payloadStrs.push(JSON.stringify(wrapItems(items)))
  }

  // Shuffle the pool so valid/invalid are interleaved
  for (let i = payloadStrs.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[payloadStrs[i], payloadStrs[j]] = [payloadStrs[j], payloadStrs[i]]
  }

  return payloadStrs
}

/**
 * Creates a cycling iterator for benchmark iterations.
 * Each call returns the next payload in the pool, cycling back to start.
 */
export function createPayloadIterator(payloads) {
  let index = 0
  return function () {
    const payload = payloads[index]
    index = (index + 1) % payloads.length
    return payload
  }
}
