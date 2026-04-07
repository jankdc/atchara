#!/usr/bin/env node

/**
 * k6 Load Testing Script - Combined Benchmark
 *
 * Compares all validators including both Atchara modes:
 * - Atchara (Deferred): parse only, no .toValue()
 * - Atchara (Full Decode): parse + .toValue() for fair comparison with competitors
 * - Zod, Valibot, Yup, Joi
 *
 * Usage: k6 run scripts/run-load-test.js
 * Environment variables:
 *   - BASE_URL: Server URL (default: http://localhost:3000)
 *   - DURATION: Test duration per scenario (default: 30s)
 */

import http from 'k6/http'
import { check } from 'k6'
import { Trend, Counter, Rate } from 'k6/metrics'

// Import test data directly from scenario files - THROUGHPUT TESTS
import { testDataObj as throughputBaselineSimple } from '../scenarios/throughput-baseline-simple.js'
import { testDataObj as throughputBaselineNested } from '../scenarios/throughput-baseline-nested.js'
import { testDataObj as throughput1kNumbers } from '../scenarios/throughput-1k-numbers.js'
import { testDataObj as throughput10kNumbers } from '../scenarios/throughput-10k-numbers.js'

// Import test data directly from scenario files - VALIDATION TESTS
import { testDataObj as validationEarlyField } from '../scenarios/validation-fail-early-field.js'
import { testDataObj as validationMidArray } from '../scenarios/validation-fail-mid-array.js'

// Import payload pools for mixed validity tests (cycles through valid/invalid payloads)
import { payloadStrs as mixed1kSimple70pctPayloads } from '../scenarios/mixed-1k-simple-70pct.js'
import { payloadStrs as mixed1kSimple90pctPayloads } from '../scenarios/mixed-1k-simple-90pct.js'
import { payloadStrs as mixed1kNested70pctPayloads } from '../scenarios/mixed-1k-nested-70pct.js'
import { payloadStrs as mixed1kNested90pctPayloads } from '../scenarios/mixed-1k-nested-90pct.js'

// Import test data for additional throughput tests
import { testDataObj as throughputDeepNesting } from '../scenarios/throughput-deep-nesting.js'
import { testDataObj as throughputLargeSingleObject } from '../scenarios/throughput-large-single-object.js'
import { testDataObj as throughputMixedTypes } from '../scenarios/throughput-mixed-types.js'
import { testDataObj as throughputNullableOptional } from '../scenarios/throughput-nullable-optional.js'
import { testDataObj as throughputStringHeavy } from '../scenarios/throughput-string-heavy.js'
import { testDataObj as throughputWideObject } from '../scenarios/throughput-wide-object.js'

// Import test data for additional validation tests
import { testDataObj as validationFailDeepNested } from '../scenarios/validation-fail-deep-nested.js'
import { testDataObj as validationFailLate } from '../scenarios/validation-fail-late.js'

// Map scenario names to test data (single payload scenarios)
const testData = {
  'throughput-baseline-simple': throughputBaselineSimple,
  'throughput-baseline-nested': throughputBaselineNested,
  'throughput-1k-numbers': throughput1kNumbers,
  'throughput-10k-numbers': throughput10kNumbers,
  'throughput-deep-nesting': throughputDeepNesting,
  'throughput-large-single-object': throughputLargeSingleObject,
  'throughput-mixed-types': throughputMixedTypes,
  'throughput-nullable-optional': throughputNullableOptional,
  'throughput-string-heavy': throughputStringHeavy,
  'throughput-wide-object': throughputWideObject,
  'validation-fail-early-field': validationEarlyField,
  'validation-fail-mid-array': validationMidArray,
  'validation-fail-deep-nested': validationFailDeepNested,
  'validation-fail-late': validationFailLate,
}

// Map mixed validity scenarios to payload pools (already JSON strings)
const payloadPools = {
  'mixed-1k-simple-70pct': mixed1kSimple70pctPayloads,
  'mixed-1k-simple-90pct': mixed1kSimple90pctPayloads,
  'mixed-1k-nested-70pct': mixed1kNested70pctPayloads,
  'mixed-1k-nested-90pct': mixed1kNested90pctPayloads,
}

// Track payload pool indices per scenario (for cycling through payloads)
const payloadIndices = {
  'mixed-1k-simple-70pct': 0,
  'mixed-1k-simple-90pct': 0,
  'mixed-1k-nested-70pct': 0,
  'mixed-1k-nested-90pct': 0,
}

// Configuration
const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000'
const DURATION = __ENV.DURATION || '30s'

// Scenario and validator definitions
const scenarios = [
  'throughput-baseline-simple',
  'throughput-baseline-nested',
  'throughput-1k-numbers',
  'throughput-10k-numbers',
  'throughput-deep-nesting',
  'throughput-large-single-object',
  'throughput-mixed-types',
  'throughput-nullable-optional',
  'throughput-string-heavy',
  'throughput-wide-object',
  'validation-fail-early-field',
  'validation-fail-mid-array',
  'validation-fail-deep-nested',
  'validation-fail-late',
  'mixed-1k-simple-70pct',
  'mixed-1k-simple-90pct',
  'mixed-1k-nested-70pct',
  'mixed-1k-nested-90pct',
]

// Include both Atchara modes plus all competitors
const validators = ['atchara-deferred', 'atchara', 'zod', 'valibot', 'yup', 'joi']

// Display names for validators
const validatorDisplayNames = {
  'atchara-deferred': 'Atchara (Deferred)',
  atchara: 'Atchara (Full Decode)',
  zod: 'Zod',
  valibot: 'Valibot',
  yup: 'Yup',
  joi: 'Joi',
}

// Create all metrics upfront (k6 requires this at init time)
const metrics = {}
scenarios.forEach((scenario) => {
  validators.forEach((validator) => {
    const key = `${scenario}_${validator}`
    // Use short metric names (k6 has 128 char limit)
    const shortKey = `${scenario.replace(/-/g, '')}_${validator.replace(/-/g, '')}`
    metrics[key] = {
      duration: new Trend(`dur_${shortKey}`, true),
      requests: new Counter(`req_${shortKey}`),
      errors: new Rate(`err_${shortKey}`),
    }
  })
})

function getMetric(scenario, validator) {
  const key = `${scenario}_${validator}`
  return metrics[key]
}

// Scenarios configuration
export const options = {
  scenarios: {},
  thresholds: {
    http_req_failed: ['rate<0.05'], // Less than 5% failure rate
  },
  discardResponseBodies: true, // Discard bodies after checks to prevent memory bloat
}

// Create warmup and test scenarios for each endpoint
let startTime = 0

scenarios.forEach((scenario) => {
  validators.forEach((validator) => {
    const scenarioKey = `${scenario}_${validator.replace(/-/g, '_')}`

    // Warmup phase
    options.scenarios[`warmup_${scenarioKey}`] = {
      executor: 'constant-vus',
      vus: 1,
      duration: '3s',
      startTime: `${startTime}s`,
      exec: 'testEndpoint',
      env: { SCENARIO: scenario, VALIDATOR: validator, PHASE: 'warmup' },
      tags: { scenario, validator, phase: 'warmup' },
    }
    startTime += 3

    // Latency test phase
    options.scenarios[`latency_${scenarioKey}`] = {
      executor: 'constant-vus',
      vus: 1,
      duration: DURATION,
      startTime: `${startTime}s`,
      exec: 'testEndpoint',
      env: { SCENARIO: scenario, VALIDATOR: validator, PHASE: 'latency' },
      tags: { scenario, validator, phase: 'latency' },
    }
    startTime += parseInt(DURATION)
  })
})

// Main test function
export function testEndpoint() {
  const scenario = __ENV.SCENARIO
  const validator = __ENV.VALIDATOR
  const phase = __ENV.PHASE

  // Skip metrics collection during warmup
  if (phase === 'warmup') {
    makeRequest(scenario, validator, false)
    return
  }

  makeRequest(scenario, validator, true)
}

function makeRequest(scenario, validator, collectMetrics) {
  const endpoint = `/validator/${validator}/${scenario}`
  const url = `${BASE_URL}${endpoint}`

  // Get payload - either from pool (mixed scenarios) or single test data
  let payload
  if (payloadPools[scenario]) {
    // Mixed validity scenarios: cycle through payload pool
    const pool = payloadPools[scenario]
    const index = payloadIndices[scenario]
    payload = pool[index]
    payloadIndices[scenario] = (index + 1) % pool.length
  } else {
    // Single payload scenarios
    payload = JSON.stringify(testData[scenario])
  }

  // All validators receive JSON (UTF-8)
  const params = {
    headers: {
      'Content-Type': 'application/json',
    },
    tags: { scenario, validator },
  }

  const res = http.post(url, payload, params)

  // Collect metrics
  if (collectMetrics) {
    const metric = getMetric(scenario, validator)
    metric.duration.add(res.timings.duration)
    metric.requests.add(1)

    const success = check(res, {
      'status is 200': (r) => r.status === 200,
      'has response': (r) => r.body && r.body.length > 0,
    })

    metric.errors.add(!success)
  }
}

function calculateRME(stdDev, mean) {
  if (mean === 0) return 0
  // Relative Margin of Error: (standard error / mean) * 100
  // Using simplified version: (stdDev / mean) * 100
  return (stdDev / mean) * 100
}

// Custom summary handler
export function handleSummary(data) {
  const groups = {}

  // Process metrics by scenario
  scenarios.forEach((scenario) => {
    const groupName = scenario
      .split('-')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ')

    const benchmarks = []

    validators.forEach((validator) => {
      const shortKey = `${scenario.replace(/-/g, '')}_${validator.replace(/-/g, '')}`
      const durationMetric = data.metrics[`dur_${shortKey}`]
      const requestsMetric = data.metrics[`req_${shortKey}`]
      const errorsMetric = data.metrics[`err_${shortKey}`]

      if (!durationMetric || !durationMetric.values) {
        return
      }

      const values = durationMetric.values
      const count = requestsMetric ? requestsMetric.values.count : 0

      if (count === 0) return

      // Convert milliseconds to seconds for consistency with Vitest format
      const mean = values.avg / 1000
      const median = values.med / 1000
      const p99 = values['p(99)'] / 1000
      const min = values.min / 1000
      const max = values.max / 1000

      // Calculate hz (operations per second)
      const hz = mean > 0 ? 1 / mean : 0

      // Estimate RME from the data we have
      // k6 doesn't give us sample-level data, so we estimate from percentiles
      const stdDevEstimate = (values['p(95)'] - values['p(5)']) / (2 * 1.645) / 1000 // Using 90% CI
      const rme = calculateRME(stdDevEstimate, mean)

      benchmarks.push({
        name: validatorDisplayNames[validator] || validator,
        rank: 0, // Will be assigned after sorting
        hz,
        mean,
        median,
        rme,
        p99,
        min,
        max,
        sampleCount: count,
        // Additional fields for analysis
        p95: values['p(95)'] / 1000,
        errorRate: errorsMetric ? errorsMetric.values.rate : 0,
      })
    })

    // Sort by hz (fastest first) and assign ranks
    benchmarks.sort((a, b) => b.hz - a.hz)
    benchmarks.forEach((b, i) => {
      b.rank = i + 1
    })

    if (benchmarks.length > 0) {
      groups[scenario] = {
        fullName: `scripts/k6-load-test.js > ${groupName}`,
        benchmarks,
      }
    }
  })

  // Format in Vitest-compatible structure
  const k6Results = {
    files: [
      {
        filepath: 'scripts/k6-load-test.js',
        groups: Object.values(groups),
      },
    ],
  }

  // Try to merge with existing Vitest results
  let mergedResults = k6Results
  try {
    // k6's open() requires absolute path or is relative to the script location
    const existingFile = open('../benchmark-results.json')
    if (existingFile) {
      const existing = JSON.parse(existingFile)
      // Keep Vitest results, remove old k6 results, add new k6 results
      mergedResults = {
        files: [
          ...existing.files.filter((f) => !f.filepath.includes('k6-load-test')),
          ...k6Results.files,
        ],
      }
    }
  } catch (e) {
    // No existing file or error reading it - just use k6 results
    console.error('Warning: Could not merge with existing Vitest results:', e.message)
  }

  // Return both text summary and merged JSON file
  return {
    stdout: generateTextSummary(data, groups),
    './benchmark-results.json': JSON.stringify(mergedResults, null, 2),
  }
}

function generateTextSummary(data, groups) {
  let summary = '\n'
  summary += '═══════════════════════════════════════════════════════\n'
  summary += '  k6 Load Testing Results - Atchara Benchmark\n'
  summary += '═══════════════════════════════════════════════════════\n\n'

  Object.values(groups).forEach((group) => {
    summary += `${group.fullName.split(' > ')[1]}\n`
    summary += '─────────────────────────────────────────────────────\n'

    group.benchmarks.forEach((b) => {
      const rank = ['🥇', '🥈', '🥉'][b.rank - 1] || `#${b.rank}`
      summary += `${rank} ${b.name.padEnd(22)} `
      summary += `${formatHz(b.hz).padStart(12)} ops/sec  `
      summary += `${(b.mean * 1000).toFixed(3).padStart(8)}ms avg  `
      const p99Display = b.p99 !== null ? `${(b.p99 * 1000).toFixed(3).padStart(8)}ms` : '     N/A'
      summary += `${p99Display} p99\n`
    })
    summary += '\n'
  })

  summary += '═══════════════════════════════════════════════════════\n'
  summary += `Total test duration: ${(data.state.testRunDurationMs / 1000).toFixed(0)}s\n`
  summary += `Total HTTP requests: ${data.metrics.http_reqs.values.count}\n`
  summary += '═══════════════════════════════════════════════════════\n'

  return summary
}

function formatHz(hz) {
  if (hz >= 1e6) return `${(hz / 1e6).toFixed(2)}M`
  if (hz >= 1e3) return `${(hz / 1e3).toFixed(2)}K`
  return hz.toFixed(2)
}
