// Parsing objects with mixed field types
// Tests type checking overhead across varied primitives

export const testDataObj = {
  records: Array.from({ length: 1000 }, (_, i) => ({
    id: i,
    name: `Record ${i}`,
    score: Math.random() * 1000,
    active: i % 2 === 0,
    description: `This is a description for record ${i} with some text content`,
    count: Math.floor(Math.random() * 10000),
    enabled: i % 3 === 0,
    label: `label-${i % 100}`,
    ratio: Math.random(),
    visible: i % 4 === 0,
    title: `Title for Record ${i}`,
    timestamp: new Date(Date.now() - i * 1000).toISOString(),
    index: i,
    status: i % 5 === 0 ? 'active' : i % 5 === 1 ? 'pending' : 'inactive',
  })),
}

export const testDataStr = JSON.stringify(testDataObj)

export async function createSchemas(onlyAtchara = false) {
  const { initialize, string, number, boolean, object, array } = await import('atchara')

  await initialize()

  const atcharaSchema = object({
    records: array(
      object({
        id: number(),
        name: string(),
        score: number(),
        active: boolean(),
        description: string(),
        count: number(),
        enabled: boolean(),
        label: string(),
        ratio: number(),
        visible: boolean(),
        title: string(),
        timestamp: string(),
        index: number(),
        status: string(),
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
    records: z.array(
      z.object({
        id: z.number(),
        name: z.string(),
        score: z.number(),
        active: z.boolean(),
        description: z.string(),
        count: z.number(),
        enabled: z.boolean(),
        label: z.string(),
        ratio: z.number(),
        visible: z.boolean(),
        title: z.string(),
        timestamp: z.string(),
        index: z.number(),
        status: z.string(),
      })
    ),
  })

  const valibotSchema = v.object({
    records: v.array(
      v.object({
        id: v.number(),
        name: v.string(),
        score: v.number(),
        active: v.boolean(),
        description: v.string(),
        count: v.number(),
        enabled: v.boolean(),
        label: v.string(),
        ratio: v.number(),
        visible: v.boolean(),
        title: v.string(),
        timestamp: v.string(),
        index: v.number(),
        status: v.string(),
      })
    ),
  })

  const yupSchema = yup.object({
    records: yup
      .array()
      .of(
        yup.object({
          id: yup.number().required(),
          name: yup.string().required(),
          score: yup.number().required(),
          active: yup.boolean().required(),
          description: yup.string().required(),
          count: yup.number().required(),
          enabled: yup.boolean().required(),
          label: yup.string().required(),
          ratio: yup.number().required(),
          visible: yup.boolean().required(),
          title: yup.string().required(),
          timestamp: yup.string().required(),
          index: yup.number().required(),
          status: yup.string().required(),
        })
      )
      .required(),
  })

  const joiSchema = Joi.object({
    records: Joi.array()
      .items(
        Joi.object({
          id: Joi.number().required(),
          name: Joi.string().required(),
          score: Joi.number().required(),
          active: Joi.boolean().required(),
          description: Joi.string().required(),
          count: Joi.number().required(),
          enabled: Joi.boolean().required(),
          label: Joi.string().required(),
          ratio: Joi.number().required(),
          visible: Joi.boolean().required(),
          title: Joi.string().required(),
          timestamp: Joi.string().required(),
          index: Joi.number().required(),
          status: Joi.string().required(),
        })
      )
      .required(),
  })

  return { atcharaSchema, zodSchema, valibotSchema, yupSchema, joiSchema }
}

if (import.meta.main) {
  const { profileScenario } = await import('../profiler.js')

  // PROFILE_ITERATIONS env var controls iteration count (default: 5000)
  const iterations = parseInt(process.env.PROFILE_ITERATIONS || '5000', 10)
  const testDataBytes = new TextEncoder().encode(testDataStr)

  await profileScenario(
    'mixed-types',
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
