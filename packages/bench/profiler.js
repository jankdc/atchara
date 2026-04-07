import { join } from 'node:path'
import { Session } from 'node:inspector'
import { writeFileSync, mkdirSync } from 'node:fs'

export class Profiler {
  session = null
  outputDir
  scenarioName

  constructor(options) {
    this.outputDir = options.outputDir || 'profiles'
    this.scenarioName = options.scenarioName
  }

  start() {
    this.session = new Session()
    this.session.connect()

    this.session.post('Profiler.enable', () => {
      this.session.post('Profiler.start')
    })
  }

  stop(phase) {
    if (!this.session) {
      console.warn('Profiler was not started')
      return
    }

    this.session.post('Profiler.stop', (err, { profile }) => {
      if (err) {
        console.error('Error stopping profiler:', err)
        return
      }

      // Ensure output directory exists
      mkdirSync(this.outputDir, { recursive: true })

      // Generate filename with timestamp and phase
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
      const filename = `${this.scenarioName}-${phase}-${timestamp}.cpuprofile`
      const filepath = join(this.outputDir, filename)

      // Write the profile to disk
      writeFileSync(filepath, JSON.stringify(profile))
      console.log(`Profile saved to: ${filepath}`)
    })

    this.session.disconnect()
    this.session = null
  }
}

/**
 * Helper function to profile a specific operation
 */
export async function profileOperation(name, phase, operation) {
  const profiler = new Profiler({ scenarioName: name })

  profiler.start()
  const result = await operation()
  profiler.stop(phase)

  return result
}

/**
 * Helper function to run profiling for both schema building and parsing phases
 */
export async function profileScenario(scenarioName, schemaBuilder, parseOperation, iterations) {
  console.log(`Profiling scenario: ${scenarioName}`)
  console.log(`Iterations: ${iterations}`)

  // Profile schema building
  console.log('\n=== Profiling schema building phase ===')
  const schema = await profileOperation(scenarioName, 'schema-building', schemaBuilder)

  // Profile parsing
  console.log('\n=== Profiling parsing phase ===')
  await profileOperation(scenarioName, 'parsing', () => {
    for (let i = 0; i < iterations; i++) {
      parseOperation(schema)
    }
  })

  console.log('\nProfiling complete!')
}
