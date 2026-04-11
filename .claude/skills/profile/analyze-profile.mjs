#!/usr/bin/env node

/**
 * CPU Profile Analyzer for Atchara
 *
 * Analyzes .cpuprofile files to understand time distribution between:
 * - Native parsing (NAPI call)
 * - TypeScript decoding
 * - Garbage collection
 * - Other overhead
 *
 * Usage:
 *   node analyze-profile.mjs <profile.cpuprofile> [options]
 *
 * Options:
 *   --top <n>          Show top N functions (default: 15)
 *   --json             Output as JSON instead of formatted text
 */

import { readFileSync, existsSync } from 'fs'

const DEFAULT_TOP_N = 15

class ProfileAnalyzer {
  constructor(profilePath, options = {}) {
    this.profilePath = profilePath
    this.options = {
      topN: options.topN || DEFAULT_TOP_N,
      json: options.json || false,
    }

    this.profile = null
    this.analysis = null
  }

  load() {
    if (!existsSync(this.profilePath)) {
      throw new Error(`Profile not found: ${this.profilePath}`)
    }

    this.profile = JSON.parse(readFileSync(this.profilePath, 'utf-8'))
  }

  analyze() {
    const { nodes, samples, timeDeltas, startTime, endTime } = this.profile

    // Calculate sample counts per node
    const sampleCounts = new Map()
    for (const nodeId of samples) {
      sampleCounts.set(nodeId, (sampleCounts.get(nodeId) || 0) + 1)
    }

    // Calculate total time
    const totalTime = endTime - startTime
    const totalSamples = samples.length
    const avgTimeDelta = timeDeltas.reduce((a, b) => a + b, 0) / timeDeltas.length

    // Analyze each node
    const nodeAnalysis = nodes.map((node) => {
      const sampleCount = sampleCounts.get(node.id) || 0
      const cpuTime = sampleCount * avgTimeDelta
      const cpuPercent = (cpuTime / totalTime) * 100

      const phase = this.categorizePhase(node)
      const functionName = node.callFrame.functionName || '(anonymous)'

      return {
        id: node.id,
        functionName,
        url: node.callFrame.url || '',
        sampleCount,
        cpuTime,
        cpuPercent,
        phase,
      }
    })

    // Sort by CPU time
    nodeAnalysis.sort((a, b) => b.cpuTime - a.cpuTime)

    // Group by phase
    const phases = {
      native_parsing: nodeAnalysis.filter((n) => n.phase === 'native_parsing'),
      decoding: nodeAnalysis.filter((n) => n.phase === 'decoding'),
      gc: nodeAnalysis.filter((n) => n.phase === 'gc'),
      profiler: nodeAnalysis.filter((n) => n.phase === 'profiler'),
      profiler_overhead: nodeAnalysis.filter((n) => n.phase === 'profiler_overhead'),
      other: nodeAnalysis.filter((n) => n.phase === 'other'),
    }

    // Calculate phase totals
    const phaseTotals = {}
    for (const [phase, funcs] of Object.entries(phases)) {
      const total = funcs.reduce((sum, f) => sum + f.cpuTime, 0)
      phaseTotals[phase] = {
        cpuTime: total,
        cpuPercent: (total / totalTime) * 100,
        count: funcs.length,
        functions: funcs.slice(0, 5).map((f) => ({
          name: f.functionName,
          percent: f.cpuPercent,
        })),
      }
    }

    this.analysis = {
      summary: {
        profilePath: this.profilePath,
        totalTimeMs: totalTime / 1000,
        totalSamples,
        avgSampleIntervalUs: avgTimeDelta,
      },
      phases: phaseTotals,
      topFunctions: nodeAnalysis.slice(0, this.options.topN),
    }

    return this.analysis
  }

  categorizePhase(node) {
    const name = node.callFrame.functionName || ''
    const url = node.callFrame.url || ''

    // Garbage collection
    // Note: 'custom_gc' appears to be V8 profiler overhead, not actual GC
    // We categorize it separately for transparency
    if (name === 'custom_gc') {
      return 'profiler_overhead'
    }

    if (
      name.includes('GC') ||
      name.includes('Scavenge') ||
      name.includes('Mark') ||
      name.includes('Sweep') ||
      name.includes('garbage collector')
    ) {
      return 'gc'
    }

    // Profiler overhead
    if (
      url.includes('profiler.js') ||
      url.includes('node:inspector') ||
      name === 'profileScenario' ||
      name === 'profileOperation'
    ) {
      return 'profiler'
    }

    // Native parsing (the NAPI call) - the parse function in atchara package
    if (name === 'parse' && url.includes('atchara') && url.includes('index.js')) {
      return 'native_parsing'
    }

    // Decoding phase (TypeScript decoder in core package)
    if (
      url.includes('@atcharajs/core') ||
      url.includes('core/dist') ||
      name === 'readObject' ||
      name === 'readString' ||
      name === 'readNumber' ||
      name === 'readBoolean' ||
      name === 'readArray' ||
      name === 'readTuple' ||
      name === 'readNullable' ||
      name === 'readOptional' ||
      name === 'readRecord' ||
      name === 'readUnion' ||
      name === 'read' ||
      name === 'reset' ||
      name === 'decode' ||
      name === 'decodeUTF8'
    ) {
      return 'decoding'
    }

    // String operations often part of decoding
    if (url.includes('node:internal/encoding') || url.includes('node:buffer')) {
      return 'decoding'
    }

    return 'other'
  }

  report() {
    if (!this.analysis) {
      this.analyze()
    }

    if (this.options.json) {
      return JSON.stringify(this.analysis, null, 2)
    }

    const lines = []
    const { summary, phases, topFunctions } = this.analysis

    // Header
    lines.push('')
    lines.push('═══════════════════════════════════════════════════════════════')
    lines.push('  Atchara CPU Profile Analysis')
    lines.push('═══════════════════════════════════════════════════════════════')
    lines.push('')

    // Summary
    lines.push('SUMMARY')
    lines.push('───────────────────────────────────────────────────────────────')
    lines.push(`Profile: ${summary.profilePath.split('/').pop()}`)
    lines.push(`Total Time: ${summary.totalTimeMs.toFixed(2)}ms`)
    lines.push(`Samples: ${summary.totalSamples}`)
    lines.push('')

    // Phase Breakdown - the main focus
    lines.push('PHASE BREAKDOWN')
    lines.push('───────────────────────────────────────────────────────────────')

    const phaseOrder = ['native_parsing', 'decoding', 'gc', 'other']
    const phaseLabels = {
      native_parsing: 'Native Parsing (NAPI)',
      decoding: 'TypeScript Decoding',
      gc: 'Garbage Collection',
      profiler: 'Profiler Code',
      profiler_overhead: 'Profiler Overhead (custom_gc)',
      other: 'Other',
    }

    // Calculate non-profiler total for cleaner percentages
    const profilerTime = (phases.profiler?.cpuPercent || 0) + (phases.profiler_overhead?.cpuPercent || 0)
    const adjustedTotal = 100 - profilerTime

    for (const phase of phaseOrder) {
      const stats = phases[phase]
      if (stats && stats.cpuPercent > 0.1) {
        // Adjust percentage to exclude profiler overhead
        const adjustedPercent = (stats.cpuPercent / adjustedTotal) * 100
        const bar = '█'.repeat(Math.round(adjustedPercent / 2.5))
        lines.push('')
        lines.push(`${phaseLabels[phase]}`)
        lines.push(`  ${adjustedPercent.toFixed(1).padStart(5)}% ${bar}`)
        lines.push(`  ${(stats.cpuTime / 1000).toFixed(2)}ms`)

        // Show top functions in this phase
        if (stats.functions.length > 0) {
          const topInPhase = stats.functions.filter((f) => f.percent > 0.5).slice(0, 3)
          if (topInPhase.length > 0) {
            lines.push(`  Top: ${topInPhase.map((f) => f.name).join(', ')}`)
          }
        }
      }
    }

    // Show profiler overhead separately if significant
    if (profilerTime > 5) {
      lines.push('')
      const profilerOverhead = phases.profiler_overhead?.cpuPercent || 0
      const profilerCode = phases.profiler?.cpuPercent || 0
      if (profilerOverhead > 5) {
        lines.push(`Note: ${profilerOverhead.toFixed(1)}% V8 profiler overhead (custom_gc) excluded`)
      }
      if (profilerCode > 1) {
        lines.push(`Note: ${profilerCode.toFixed(1)}% profiler code excluded`)
      }
    }

    // Excluding GC ratio
    const nativePct = (phases.native_parsing?.cpuPercent || 0) / adjustedTotal * 100
    const decodingPct = (phases.decoding?.cpuPercent || 0) / adjustedTotal * 100
    const nonGcTotal = nativePct + decodingPct
    if (nonGcTotal > 0) {
      const nativeRatio = (nativePct / nonGcTotal) * 100
      const decodingRatio = (decodingPct / nonGcTotal) * 100
      lines.push('')
      lines.push(`Excluding GC: ${nativeRatio.toFixed(0)}% native / ${decodingRatio.toFixed(0)}% decoding`)
    }

    lines.push('')
    lines.push('═══════════════════════════════════════════════════════════════')
    lines.push('')

    return lines.join('\n')
  }
}

// CLI
function main() {
  const args = process.argv.slice(2)

  if (args.length === 0 || args.includes('--help')) {
    console.log(`
Atchara CPU Profile Analyzer

Analyzes time distribution between native parsing, decoding, and GC.

Usage:
  node analyze-profile.mjs <profile.cpuprofile> [options]

Options:
  --top <n>          Show top N functions (default: 15)
  --json             Output as JSON
  --help             Show this help

Examples:
  node analyze-profile.mjs profiles/simple-object-parsing-*.cpuprofile
  node analyze-profile.mjs profiles/simple-object-parsing-*.cpuprofile --json
`)
    process.exit(0)
  }

  const profilePath = args[0]
  const options = {
    topN: DEFAULT_TOP_N,
    json: false,
  }

  for (let i = 1; i < args.length; i++) {
    switch (args[i]) {
      case '--top':
        options.topN = parseInt(args[++i])
        break
      case '--json':
        options.json = true
        break
    }
  }

  try {
    const analyzer = new ProfileAnalyzer(profilePath, options)
    analyzer.load()
    console.log(analyzer.report())
  } catch (error) {
    console.error('Error:', error.message)
    process.exit(1)
  }
}

if (process.argv[1] === import.meta.filename) {
  main()
}

export { ProfileAnalyzer }
