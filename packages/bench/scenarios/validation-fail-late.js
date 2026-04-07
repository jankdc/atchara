// Validation failure at end of large array (index 999/1000)
// Tests how much unnecessary work is done before detecting late errors

export const testDataObj = {
  items: Array.from({ length: 1000 }, (_, i) => ({
    id: i,
    name: `Item ${i}`,
    value: i * 100,
    active: i % 2 === 0,
  })).map((item, idx) => {
    // Make last item invalid
    if (idx === 999) {
      return {
        ...item,
        id: 'not-a-number', // Invalid: should be number
      }
    }
    return item
  }),
}

export const testDataStr = JSON.stringify(testDataObj)

export async function createSchemas(onlyAtchara = false) {
  const { initialize, string, number, boolean, object, array } = await import('atchara')

  await initialize()

  const atcharaSchema = object({
    items: array(
      object({
        id: number(),
        name: string(),
        value: number(),
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
        id: z.number(),
        name: z.string(),
        value: z.number(),
        active: z.boolean(),
      })
    ),
  })

  const valibotSchema = v.object({
    items: v.array(
      v.object({
        id: v.number(),
        name: v.string(),
        value: v.number(),
        active: v.boolean(),
      })
    ),
  })

  const yupSchema = yup.object({
    items: yup
      .array()
      .of(
        yup.object({
          id: yup.number().required(),
          name: yup.string().required(),
          value: yup.number().required(),
          active: yup.boolean().required(),
        })
      )
      .required(),
  })

  const joiSchema = Joi.object({
    items: Joi.array()
      .items(
        Joi.object({
          id: Joi.number().required(),
          name: Joi.string().required(),
          value: Joi.number().required(),
          active: Joi.boolean().required(),
        })
      )
      .required(),
  })

  return { atcharaSchema, zodSchema, valibotSchema, yupSchema, joiSchema }
}

if (import.meta.main) {
  const { profileScenario } = await import('../profiler.js')

  // PROFILE_ITERATIONS env var controls iteration count (default: 5000)
  const iterations = parseInt(process.env.PROFILE_ITERATIONS || '500', 10)
  const testDataBytes = new TextEncoder().encode(testDataStr)

  await profileScenario(
    'fail-late',
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
