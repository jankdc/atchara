// Parsing 1000 items with non-discriminated object union (structural difference)
export const testDataObj = {
  items: Array.from({ length: 1000 }, (_, i) => {
    if (i % 2 === 0) {
      return { email: `user${i}@example.com`, verified: i % 4 === 0 }
    }
    return { phone: `+1-555-${String(i).padStart(4, '0')}`, country: 'US' }
  }),
}

export const testDataStr = JSON.stringify(testDataObj)

export async function createSchemas(onlyAtchara = false) {
  const { initialize, string, boolean, object, array, union } = await import('atchara')

  await initialize()

  const atcharaSchema = object({
    items: array(
      union([
        object({ email: string(), verified: boolean() }),
        object({ phone: string(), country: string() }),
      ])
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
      z.union([
        z.object({ email: z.string(), verified: z.boolean() }),
        z.object({ phone: z.string(), country: z.string() }),
      ])
    ),
  })

  const valibotSchema = v.object({
    items: v.array(
      v.union([
        v.object({ email: v.string(), verified: v.boolean() }),
        v.object({ phone: v.string(), country: v.string() }),
      ])
    ),
  })

  const yupSchema = yup.object({
    items: yup
      .array()
      .of(
        yup.lazy((value) => {
          if (value && 'email' in value) {
            return yup.object({
              email: yup.string().required(),
              verified: yup.boolean().required(),
            })
          }
          return yup.object({
            phone: yup.string().required(),
            country: yup.string().required(),
          })
        })
      )
      .required(),
  })

  const joiSchema = Joi.object({
    items: Joi.array()
      .items(
        Joi.alternatives().try(
          Joi.object({ email: Joi.string().required(), verified: Joi.boolean().required() }),
          Joi.object({ phone: Joi.string().required(), country: Joi.string().required() })
        )
      )
      .required(),
  })

  return { atcharaSchema, zodSchema, valibotSchema, yupSchema, joiSchema }
}

if (import.meta.main) {
  const { profileScenario } = await import('../profiler.js')

  const iterations = parseInt(process.env.PROFILE_ITERATIONS || '5000', 10)
  const testDataBytes = new TextEncoder().encode(testDataStr)

  await profileScenario(
    'union-objects',
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
