// Real-world scenario: 1,000 items with simple 4-field schema, 70% valid / 30% invalid
// 70% of payloads parse successfully, 30% fail at distributed positions (early/mid/late)

import { createPayloadPool, createPayloadIterator } from './common.js'

function createValidItem(i) {
  return {
    id: i,
    name: `User ${i}`,
    email: `user${i}@example.com`,
    active: true,
  }
}

function createInvalidItem(i, errorType) {
  switch (errorType) {
    case 0:
      // Wrong type: id should be number
      return {
        id: `invalid-${i}`,
        name: `User ${i}`,
        email: `user${i}@example.com`,
        active: true,
      }
    case 1:
      // Missing required field
      return {
        id: i,
        name: `User ${i}`,
        // email missing
        active: true,
      }
    default:
      // Wrong type: active should be boolean
      return {
        id: i,
        name: `User ${i}`,
        email: `user${i}@example.com`,
        active: 'yes',
      }
  }
}

const payloadStrs = createPayloadPool({
  itemCount: 1000,
  validPercent: 70,
  poolSize: 100,
  createValidItem,
  createInvalidItem,
  errorTypeCount: 3,
  wrapItems: (items) => ({ items }),
})

let encoder
// Create bytes locally (TextEncoder not available in k6)
if (typeof TextEncoder !== 'undefined') {
  encoder = new TextEncoder()
}

const payloadBytes = encoder && payloadStrs.map((str) => encoder.encode(str))

// Export pool and iterators for benchmarks
export { payloadStrs, payloadBytes }
export const getNextPayloadStr = createPayloadIterator(payloadStrs)
export const getNextPayloadBytes = payloadBytes && createPayloadIterator(payloadBytes)

// Legacy export for backward compatibility (uses first valid payload)
export const testDataStr = payloadStrs[0]
export const testDataObj = JSON.parse(testDataStr)

export async function createSchemas(onlyAtchara = false) {
  const { initialize, string, number, boolean, object, array } = await import('atchara')

  await initialize()

  const atcharaSchema = object({
    items: array(
      object({
        id: number().min(0),
        name: string().min(1).max(100),
        email: string().min(5).max(254).pattern(/@/),
        active: boolean(),
      })
    ),
  })

  if (onlyAtchara) {
    return { atcharaSchema, zodSchema: null, valibotSchema: null, yupSchema: null, joiSchema: null }
  }

  const { z } = await import('zod')
  const v = await import('valibot')
  const yup = await import('yup')
  const { default: Joi } = await import('joi')

  const zodSchema = z.object({
    items: z.array(
      z.object({
        id: z.number().min(0),
        name: z.string().min(1).max(100),
        email: z.string().min(5).max(254).regex(/@/),
        active: z.boolean(),
      })
    ),
  })

  const valibotSchema = v.object({
    items: v.array(
      v.object({
        id: v.number([v.minValue(0)]),
        name: v.string([v.minLength(1), v.maxLength(100)]),
        email: v.string([v.minLength(5), v.maxLength(254), v.regex(/@/)]),
        active: v.boolean(),
      })
    ),
  })

  const yupSchema = yup.object({
    items: yup
      .array()
      .of(
        yup.object({
          id: yup.number().min(0).required(),
          name: yup.string().min(1).max(100).required(),
          email: yup.string().min(5).max(254).matches(/@/).required(),
          active: yup.boolean().required(),
        })
      )
      .required(),
  })

  const joiSchema = Joi.object({
    items: Joi.array()
      .items(
        Joi.object({
          id: Joi.number().min(0).required(),
          name: Joi.string().min(1).max(100).required(),
          email: Joi.string().min(5).max(254).pattern(/@/).required(),
          active: Joi.boolean().required(),
        })
      )
      .required(),
  })

  return { atcharaSchema, zodSchema, valibotSchema, yupSchema, joiSchema }
}

// CLI entry point - only runs when file is executed directly
if (import.meta.main) {
  const { profileScenario } = await import('../profiler.js')

  // PROFILE_ITERATIONS env var controls iteration count (default: 5000)
  const iterations = parseInt(process.env.PROFILE_ITERATIONS || '5000', 10)

  await profileScenario(
    '1000-simple-objects-70-30-valid',
    async () => {
      const { atcharaSchema } = await createSchemas(true)
      return atcharaSchema
    },
    (schema) => {
      try {
        schema.parse(getNextPayloadBytes())
      } catch {
        // Expected to fail with invalid data
      }
    },
    iterations
  )
}
