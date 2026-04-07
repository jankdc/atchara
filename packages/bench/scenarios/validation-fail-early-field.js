// Invalid early: string id (should be number) with 10K items of extra data
export const testDataObj = {
  id: 'should-be-number',
  name: 'John Doe',
  email: 'john@example.com',
  extraData: Array.from({ length: 10000 }, (_, i) => ({
    field1: `value${i}`,
    field2: i,
    field3: { nested: true },
  })),
}

export const testDataStr = JSON.stringify(testDataObj)

export async function createSchemas(onlyAtchara = false) {
  const { initialize, string, number, object } = await import('atchara')

  await initialize()

  const atcharaSchema = object({
    id: number(),
    name: string(),
    email: string(),
  })

  if (onlyAtchara) {
    return {
      atcharaSchema,
      zodSchema: null,
      valibotSchema: null,
      yupSchema: null,
      joiSchema: null,
    }
  }

  const { z } = await import('zod')
  const v = await import('valibot')
  const yup = await import('yup')
  const { default: Joi } = await import('joi')

  const zodSchema = z.object({
    id: z.number(),
    name: z.string(),
    email: z.string(),
  })

  const valibotSchema = v.object({
    id: v.number(),
    name: v.string(),
    email: v.string(),
  })

  const yupSchema = yup.object({
    id: yup.number().required(),
    name: yup.string().required(),
    email: yup.string().required(),
  })

  const joiSchema = Joi.object({
    id: Joi.number().required(),
    name: Joi.string().required(),
    email: Joi.string().required(),
  })

  return {
    atcharaSchema,
    zodSchema,
    valibotSchema,
    yupSchema,
    joiSchema,
  }
}

if (import.meta.main) {
  const { profileScenario } = await import('../profiler.js')

  // PROFILE_ITERATIONS env var controls iteration count (default: 5000)
  const iterations = parseInt(process.env.PROFILE_ITERATIONS || '5000', 10)
  const testDataBytes = new TextEncoder().encode(testDataStr)

  // Profile invalid field (early)
  await profileScenario(
    'fail-fast-user',
    async () => {
      const { atcharaSchema } = await createSchemas(true)
      return atcharaSchema
    },
    (schema) => {
      try {
        schema.parse(testDataBytes)
      } catch {
        // Expected to fail
      }
    },
    iterations
  )
}
