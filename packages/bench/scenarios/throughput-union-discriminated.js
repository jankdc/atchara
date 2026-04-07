// Parsing 1000 items with discriminated union (user | company)
export const testDataObj = {
  items: Array.from({ length: 1000 }, (_, i) => {
    if (i % 2 === 0) {
      return { type: 'user', name: `User ${i}`, age: 20 + (i % 50) }
    }
    return { type: 'company', name: `Company ${i}`, employees: 10 + i }
  }),
}

export const testDataStr = JSON.stringify(testDataObj)

export async function createSchemas(onlyAtchara = false) {
  const { initialize, string, number, object, array, union, literal } = await import('atchara')

  await initialize()

  const atcharaSchema = object({
    items: array(
      union([
        object({ type: literal('user'), name: string(), age: number() }),
        object({ type: literal('company'), name: string(), employees: number() }),
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

  // Zod has optimized discriminatedUnion
  const zodSchema = z.object({
    items: z.array(
      z.discriminatedUnion('type', [
        z.object({ type: z.literal('user'), name: z.string(), age: z.number() }),
        z.object({ type: z.literal('company'), name: z.string(), employees: z.number() }),
      ])
    ),
  })

  // Valibot has variant for discriminated unions
  const valibotSchema = v.object({
    items: v.array(
      v.variant('type', [
        v.object({ type: v.literal('user'), name: v.string(), age: v.number() }),
        v.object({ type: v.literal('company'), name: v.string(), employees: v.number() }),
      ])
    ),
  })

  const yupSchema = yup.object({
    items: yup
      .array()
      .of(
        yup.lazy((value) => {
          if (value && value.type === 'user') {
            return yup.object({
              type: yup.string().oneOf(['user']).required(),
              name: yup.string().required(),
              age: yup.number().required(),
            })
          }
          return yup.object({
            type: yup.string().oneOf(['company']).required(),
            name: yup.string().required(),
            employees: yup.number().required(),
          })
        })
      )
      .required(),
  })

  const joiSchema = Joi.object({
    items: Joi.array()
      .items(
        Joi.alternatives().conditional('.type', {
          switch: [
            {
              is: 'user',
              then: Joi.object({
                type: Joi.string().valid('user').required(),
                name: Joi.string().required(),
                age: Joi.number().required(),
              }),
            },
            {
              is: 'company',
              then: Joi.object({
                type: Joi.string().valid('company').required(),
                name: Joi.string().required(),
                employees: Joi.number().required(),
              }),
            },
          ],
        })
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
    'union-discriminated',
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
