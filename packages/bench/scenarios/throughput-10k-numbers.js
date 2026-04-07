// Parsing 10000 items with id, value, and timestamp fields
export const testDataObj = {
  items: Array.from({ length: 10000 }, (_, i) => ({
    id: i,
    value: Math.random() * 1000,
    timestamp: Date.now() + i,
  })),
}

export const testDataStr = JSON.stringify(testDataObj)

export async function createSchemas(onlyAtchara = false) {
  const { initialize, number, object, array } = await import('atchara')

  await initialize()

  const atcharaSchema = object({
    items: array(
      object({
        id: number(),
        value: number(),
        timestamp: number(),
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
        id: z.number(),
        value: z.number(),
        timestamp: z.number(),
      })
    ),
  })

  const valibotSchema = v.object({
    items: v.array(
      v.object({
        id: v.number(),
        value: v.number(),
        timestamp: v.number(),
      })
    ),
  })

  const yupSchema = yup.object({
    items: yup
      .array()
      .of(
        yup.object({
          id: yup.number().required(),
          value: yup.number().required(),
          timestamp: yup.number().required(),
        })
      )
      .required(),
  })

  const joiSchema = Joi.object({
    items: Joi.array()
      .items(
        Joi.object({
          id: Joi.number().required(),
          value: Joi.number().required(),
          timestamp: Joi.number().required(),
        })
      )
      .required(),
  })

  return { atcharaSchema, zodSchema, valibotSchema, yupSchema, joiSchema }
}

if (import.meta.main) {
  const { profileScenario } = await import('../profiler.js')

  // PROFILE_ITERATIONS env var controls iteration count (default: 1000)
  const iterations = parseInt(process.env.PROFILE_ITERATIONS || '1000', 10)
  const testDataBytes = new TextEncoder().encode(testDataStr)

  await profileScenario(
    '10000-number-objects',
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
