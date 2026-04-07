// Parsing deeply nested structures (10 levels deep)
// Tests native recursion overhead vs JavaScript stack pressure

function createDeepObject(depth = 10, index = 0) {
  if (depth === 0) {
    return {
      id: index,
      value: Math.random() * 1000,
      name: `level-${index}`,
    }
  }
  return {
    id: index,
    level: depth,
    nested: createDeepObject(depth - 1, index + 1),
  }
}

export const testDataObj = {
  data: Array.from({ length: 100 }, (_, i) => createDeepObject(10, i)),
}

export const testDataStr = JSON.stringify(testDataObj)

export async function createSchemas(onlyAtchara = false) {
  const { initialize, string, number, object, array } = await import('atchara')

  await initialize()

  // Define the deep object schema recursively
  let deepSchema = object({
    id: number(),
    value: number(),
    name: string(),
  })

  for (let i = 0; i < 10; i++) {
    deepSchema = object({
      id: number(),
      level: number(),
      nested: deepSchema,
    })
  }

  const atcharaSchema = object({
    data: array(deepSchema),
  })

  if (onlyAtchara) {
    return { atcharaSchema, zodSchema: null, valibotSchema: null, yupSchema: null, joiSchema: null }
  }

  const { z } = await import('zod')
  const v = await import('valibot')
  const yup = await import('yup')
  const { default: Joi } = await import('joi')

  // Define Zod schema recursively
  let zodDeepSchema = z.object({
    id: z.number(),
    value: z.number(),
    name: z.string(),
  })

  for (let i = 0; i < 10; i++) {
    zodDeepSchema = z.object({
      id: z.number(),
      level: z.number(),
      nested: zodDeepSchema,
    })
  }

  const zodSchema = z.object({
    data: z.array(zodDeepSchema),
  })

  // Define Valibot schema recursively
  let valibotDeepSchema = v.object({
    id: v.number(),
    value: v.number(),
    name: v.string(),
  })

  for (let i = 0; i < 10; i++) {
    valibotDeepSchema = v.object({
      id: v.number(),
      level: v.number(),
      nested: valibotDeepSchema,
    })
  }

  const valibotSchema = v.object({
    data: v.array(valibotDeepSchema),
  })

  // Define Yup schema recursively
  let yupDeepSchema = yup.object({
    id: yup.number().required(),
    value: yup.number().required(),
    name: yup.string().required(),
  })

  for (let i = 0; i < 10; i++) {
    yupDeepSchema = yup.object({
      id: yup.number().required(),
      level: yup.number().required(),
      nested: yupDeepSchema.required(),
    })
  }

  const yupSchema = yup.object({
    data: yup.array().of(yupDeepSchema).required(),
  })

  // Define Joi schema recursively
  let joiDeepSchema = Joi.object({
    id: Joi.number().required(),
    value: Joi.number().required(),
    name: Joi.string().required(),
  })

  for (let i = 0; i < 10; i++) {
    joiDeepSchema = Joi.object({
      id: Joi.number().required(),
      level: Joi.number().required(),
      nested: joiDeepSchema.required(),
    })
  }

  const joiSchema = Joi.object({
    data: Joi.array().items(joiDeepSchema).required(),
  })

  return { atcharaSchema, zodSchema, valibotSchema, yupSchema, joiSchema }
}

if (import.meta.main) {
  const { profileScenario } = await import('../profiler.js')

  // PROFILE_ITERATIONS env var controls iteration count (default: 5000)
  const iterations = parseInt(process.env.PROFILE_ITERATIONS || '5000', 10)
  const testDataBytes = new TextEncoder().encode(testDataStr)

  await profileScenario(
    'deep-nesting',
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
