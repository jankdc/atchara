// Parsing string-dominated payloads
// Tests SIMD string scanning and processing performance

export const testDataObj = {
  items: Array.from({ length: 1000 }, (_, i) => ({
    id: i,
    title: `Item Title ${i} - This is a longer string to test string processing overhead and performance`,
    description: `This is a detailed description for item ${i}. Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore.`,
    author: `Author Name ${i % 100}`,
    category: `Category ${i % 50}`,
    tags: `tag-${i % 20},tag-${(i + 1) % 20},tag-${(i + 2) % 20}`,
  })),
}

export const testDataStr = JSON.stringify(testDataObj)

export async function createSchemas(onlyAtchara = false) {
  const { initialize, string, number, object, array } = await import('atchara')

  await initialize()

  const atcharaSchema = object({
    items: array(
      object({
        id: number(),
        title: string(),
        description: string(),
        author: string(),
        category: string(),
        tags: string(),
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
        title: z.string(),
        description: z.string(),
        author: z.string(),
        category: z.string(),
        tags: z.string(),
      })
    ),
  })

  const valibotSchema = v.object({
    items: v.array(
      v.object({
        id: v.number(),
        title: v.string(),
        description: v.string(),
        author: v.string(),
        category: v.string(),
        tags: v.string(),
      })
    ),
  })

  const yupSchema = yup.object({
    items: yup
      .array()
      .of(
        yup.object({
          id: yup.number().required(),
          title: yup.string().required(),
          description: yup.string().required(),
          author: yup.string().required(),
          category: yup.string().required(),
          tags: yup.string().required(),
        })
      )
      .required(),
  })

  const joiSchema = Joi.object({
    items: Joi.array()
      .items(
        Joi.object({
          id: Joi.number().required(),
          title: Joi.string().required(),
          description: Joi.string().required(),
          author: Joi.string().required(),
          category: Joi.string().required(),
          tags: Joi.string().required(),
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
    'string-heavy',
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
