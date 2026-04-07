// Constrained record scaling: 50,000 entries with min/max constraints on every value field
// Measures how constraint checking overhead scales with payload size

export const testDataObj = Object.fromEntries(
  Array.from({ length: 50000 }, (_, i) => [`key_${i}`, { score: i % 100, tag: `tag_${i}` }])
)

export const testDataStr = JSON.stringify(testDataObj)

export async function createSchemas(onlyAtchara = false) {
  const { initialize, string, number, object, record } = await import('atchara')

  await initialize()

  const atcharaSchema = record(
    object({
      score: number().min(0).max(100),
      tag: string().min(1).max(50),
    })
  )
    .min(1)
    .max(100000)

  if (onlyAtchara) {
    return { atcharaSchema, zodSchema: null, valibotSchema: null, joiSchema: null }
  }

  const { z } = await import('zod')
  const v = await import('valibot')
  const { default: Joi } = await import('joi')

  const zodSchema = z.record(
    z.object({
      score: z.number().min(0).max(100),
      tag: z.string().min(1).max(50),
    })
  )

  const valibotSchema = v.record(
    v.string(),
    v.object({
      score: v.number([v.minValue(0), v.maxValue(100)]),
      tag: v.string([v.minLength(1), v.maxLength(50)]),
    })
  )

  const joiSchema = Joi.object()
    .pattern(
      Joi.string(),
      Joi.object({
        score: Joi.number().min(0).max(100).required(),
        tag: Joi.string().min(1).max(50).required(),
      })
    )
    .min(1)
    .max(100000)

  return { atcharaSchema, zodSchema, valibotSchema, joiSchema }
}

if (import.meta.main) {
  const { profileScenario } = await import('../profiler.js')

  const iterations = parseInt(process.env.PROFILE_ITERATIONS || '200', 10)
  const testDataBytes = new TextEncoder().encode(testDataStr)

  await profileScenario(
    'constrained-record-50k',
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
