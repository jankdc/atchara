// Parsing 1000 items with union of primitive types (string | number | boolean)
export const testDataObj = {
  items: Array.from({ length: 1000 }, (_, i) => {
    const variant = i % 3
    if (variant === 0) return `string-value-${i}`
    if (variant === 1) return i * 1.5
    return i % 2 === 0
  }),
}

export const testDataStr = JSON.stringify(testDataObj)

export async function createSchemas(onlyAtchara = false) {
  const { initialize, string, number, boolean, object, array, union } = await import('atchara')

  await initialize()

  const atcharaSchema = object({
    items: array(union([string(), number(), boolean()])),
  })

  if (onlyAtchara) {
    return { atcharaSchema, zodSchema: null, valibotSchema: null, yupSchema: null, joiSchema: null }
  }

  const { z } = await import('zod')
  const v = await import('valibot')
  const yup = await import('yup')
  const { default: Joi } = await import('joi')

  const zodSchema = z.object({
    items: z.array(z.union([z.string(), z.number(), z.boolean()])),
  })

  const valibotSchema = v.object({
    items: v.array(v.union([v.string(), v.number(), v.boolean()])),
  })

  const yupSchema = yup.object({
    items: yup
      .array()
      .of(
        yup.mixed().test('union', 'Must be string, number, or boolean', (value) => {
          return (
            typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
          )
        })
      )
      .required(),
  })

  const joiSchema = Joi.object({
    items: Joi.array()
      .items(Joi.alternatives().try(Joi.string(), Joi.number(), Joi.boolean()))
      .required(),
  })

  return { atcharaSchema, zodSchema, valibotSchema, yupSchema, joiSchema }
}

if (import.meta.main) {
  const { profileScenario } = await import('../profiler.js')

  const iterations = parseInt(process.env.PROFILE_ITERATIONS || '5000', 10)
  const testDataBytes = new TextEncoder().encode(testDataStr)

  await profileScenario(
    'union-primitives',
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
