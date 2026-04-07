// Parsing a simple 4-field user object
export const testDataObj = {
  id: 1,
  name: 'John Doe',
  email: 'john@example.com',
  active: true,
}

export const testDataStr = JSON.stringify(testDataObj)

export async function createSchemas(onlyAtchara = false) {
  const { initialize, string, number, boolean, object } = await import('atchara')

  await initialize()

  const atcharaSchema = object({
    id: number(),
    name: string(),
    email: string(),
    active: boolean(),
  })

  if (onlyAtchara) {
    return { atcharaSchema, zodSchema: null, valibotSchema: null, yupSchema: null, joiSchema: null }
  }

  const { z } = await import('zod')
  const v = await import('valibot')
  const yup = await import('yup')
  const { default: Joi } = await import('joi')

  const zodSchema = z.object({
    id: z.number(),
    name: z.string(),
    email: z.string(),
    active: z.boolean(),
  })

  const valibotSchema = v.object({
    id: v.number(),
    name: v.string(),
    email: v.string(),
    active: v.boolean(),
  })

  const yupSchema = yup.object({
    id: yup.number().required(),
    name: yup.string().required(),
    email: yup.string().required(),
    active: yup.boolean().required(),
  })

  const joiSchema = Joi.object({
    id: Joi.number().required(),
    name: Joi.string().required(),
    email: Joi.string().required(),
    active: Joi.boolean().required(),
  })

  return { atcharaSchema, zodSchema, valibotSchema, yupSchema, joiSchema }
}

// CLI entry point - only runs when file is executed directly
if (import.meta.main) {
  const { profileScenario } = await import('../profiler.js')

  // PROFILE_ITERATIONS env var controls iteration count (default: 50000)
  const iterations = parseInt(process.env.PROFILE_ITERATIONS || '50000', 10)
  const testDataBytes = new TextEncoder().encode(testDataStr)

  await profileScenario(
    'simple-object',
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
