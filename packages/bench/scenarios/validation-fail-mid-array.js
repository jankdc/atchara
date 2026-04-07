// Invalid in array: 1000 users with invalid email at index 500
export const testDataObj = {
  users: Array.from({ length: 1000 }, (_, i) => ({
    id: i,
    name: `User ${i}`,
    email: i === 500 ? 999 : `user${i}@example.com`,
    metadata: {
      created: new Date().toISOString(),
      tags: Array.from({ length: 100 }, (_, j) => `tag${j}`),
    },
  })),
}

export const testDataStr = JSON.stringify(testDataObj)

export async function createSchemas(onlyAtchara = false) {
  const { initialize, string, number, object, array } = await import('atchara')

  await initialize()

  const atcharaUserSchema = object({
    id: number(),
    name: string(),
    email: string(),
  })

  const atcharaSchema = object({
    users: array(atcharaUserSchema),
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

  const zodUserSchema = z.object({
    id: z.number(),
    name: z.string(),
    email: z.string(),
  })

  const valibotUserSchema = v.object({
    id: v.number(),
    name: v.string(),
    email: v.string(),
  })

  const zodSchema = z.object({
    users: z.array(zodUserSchema),
  })

  const valibotSchema = v.object({
    users: v.array(valibotUserSchema),
  })

  const yupUserSchema = yup.object({
    id: yup.number().required(),
    name: yup.string().required(),
    email: yup.string().strict().required(),
  })

  const joiUserSchema = Joi.object({
    id: Joi.number().required(),
    name: Joi.string().required(),
    email: Joi.string().required(),
  })

  const yupSchema = yup.object({
    users: yup.array().of(yupUserSchema).required(),
  })

  const joiSchema = Joi.object({
    users: Joi.array().items(joiUserSchema).required(),
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

  // Invalid field in array
  // PROFILE_ITERATIONS env var controls iteration count (default: 500)
  const iterations = parseInt(process.env.PROFILE_ITERATIONS || '500', 10)
  const testDataBytes = new TextEncoder().encode(testDataStr)

  await profileScenario(
    '1000-user-objects-fail-fast',
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
