// Record parsing and key lookup performance
// Tests hash-indexed O(log n) binary search vs full decode

export const testDataObj = {
  // Large record with many keys
  settings: Object.fromEntries(Array.from({ length: 100 }, (_, i) => [`setting_${i}`, i * 1.5])),
  // Nested records
  users: Object.fromEntries(
    Array.from({ length: 50 }, (_, i) => [
      `user_${i}`,
      {
        name: `User ${i}`,
        score: i * 10,
        active: i % 2 === 0,
      },
    ])
  ),
  // Record with string values
  translations: Object.fromEntries(
    Array.from({ length: 200 }, (_, i) => [
      `key_${i}`,
      `Translation value for key ${i} with some additional text`,
    ])
  ),
}

export const testDataStr = JSON.stringify(testDataObj)

export async function createSchemas(onlyAtchara = false) {
  const { initialize, string, number, boolean, object, record } = await import('atchara')

  await initialize()

  const atcharaSchema = object({
    settings: record(number()),
    users: record(
      object({
        name: string(),
        score: number(),
        active: boolean(),
      })
    ),
    translations: record(string()),
  })

  if (onlyAtchara) {
    return { atcharaSchema, zodSchema: null, valibotSchema: null, yupSchema: null, joiSchema: null }
  }

  const { z } = await import('zod')
  const v = await import('valibot')
  const yup = await import('yup')
  const { default: Joi } = await import('joi')

  const zodSchema = z.object({
    settings: z.record(z.number()),
    users: z.record(
      z.object({
        name: z.string(),
        score: z.number(),
        active: z.boolean(),
      })
    ),
    translations: z.record(z.string()),
  })

  const valibotSchema = v.object({
    settings: v.record(v.string(), v.number()),
    users: v.record(
      v.string(),
      v.object({
        name: v.string(),
        score: v.number(),
        active: v.boolean(),
      })
    ),
    translations: v.record(v.string(), v.string()),
  })

  const yupSchema = yup.object({
    settings: yup.lazy(() => yup.object()),
    users: yup.lazy(() => yup.object()),
    translations: yup.lazy(() => yup.object()),
  })

  const joiSchema = Joi.object({
    settings: Joi.object().pattern(Joi.string(), Joi.number()),
    users: Joi.object().pattern(
      Joi.string(),
      Joi.object({
        name: Joi.string().required(),
        score: Joi.number().required(),
        active: Joi.boolean().required(),
      })
    ),
    translations: Joi.object().pattern(Joi.string(), Joi.string()),
  })

  return { atcharaSchema, zodSchema, valibotSchema, yupSchema, joiSchema }
}

if (import.meta.main) {
  const { profileScenario } = await import('../profiler.js')

  const iterations = parseInt(process.env.PROFILE_ITERATIONS || '5000', 10)
  const testDataBytes = new TextEncoder().encode(testDataStr)

  await profileScenario(
    'record',
    async () => {
      const { atcharaSchema } = await createSchemas(true)
      return atcharaSchema
    },
    (schema) => {
      schema.parse(testDataBytes)
    },
    iterations
  )
}
