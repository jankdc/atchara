// Constrained array scaling: 1,000 items with min/max constraints on every field
// Measures how constraint checking overhead scales with payload size

export const testDataObj = Array.from({ length: 1000 }, (_, i) => ({
  id: i,
  value: i % 10000,
  label: `Item ${i}`,
}))

export const testDataStr = JSON.stringify(testDataObj)

export async function createSchemas(onlyAtchara = false) {
  const { initialize, string, number, object, array } = await import('atchara')

  await initialize()

  const atcharaSchema = array(
    object({
      id: number().min(0),
      value: number().min(0).max(10000),
      label: string().min(1).max(100),
    })
  )
    .min(1)
    .max(100000)

  if (onlyAtchara) {
    return { atcharaSchema, zodSchema: null, valibotSchema: null, yupSchema: null, joiSchema: null }
  }

  const { z } = await import('zod')
  const v = await import('valibot')
  const yup = await import('yup')
  const { default: Joi } = await import('joi')

  const zodSchema = z
    .array(
      z.object({
        id: z.number().min(0),
        value: z.number().min(0).max(10000),
        label: z.string().min(1).max(100),
      })
    )
    .min(1)
    .max(100000)

  const valibotSchema = v.array(
    v.object({
      id: v.number([v.minValue(0)]),
      value: v.number([v.minValue(0), v.maxValue(10000)]),
      label: v.string([v.minLength(1), v.maxLength(100)]),
    }),
    [v.minLength(1), v.maxLength(100000)]
  )

  const yupSchema = yup
    .array()
    .of(
      yup.object({
        id: yup.number().min(0).required(),
        value: yup.number().min(0).max(10000).required(),
        label: yup.string().min(1).max(100).required(),
      })
    )
    .min(1)
    .max(100000)
    .required()

  const joiSchema = Joi.array()
    .items(
      Joi.object({
        id: Joi.number().min(0).required(),
        value: Joi.number().min(0).max(10000).required(),
        label: Joi.string().min(1).max(100).required(),
      })
    )
    .min(1)
    .max(100000)
    .required()

  return { atcharaSchema, zodSchema, valibotSchema, yupSchema, joiSchema }
}

if (import.meta.main) {
  const { profileScenario } = await import('../profiler.js')

  const iterations = parseInt(process.env.PROFILE_ITERATIONS || '5000', 10)
  const testDataBytes = new TextEncoder().encode(testDataStr)

  await profileScenario(
    'constrained-array-1k',
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
