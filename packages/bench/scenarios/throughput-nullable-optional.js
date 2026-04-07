// Parsing with nullable and optional fields
// Tests handling of missing and null values

export const testDataObj = {
  users: Array.from({ length: 500 }, (_, i) => {
    const user = {
      id: i,
      name: `User ${i}`,
      email: `user${i}@example.com`,
    }

    // Randomly omit optional fields or set them to null
    if (i % 3 !== 0) {
      user.phone = null // 66% of users have null phone
    } else {
      user.phone = `+1-555-${String(i).padStart(4, '0')}` // 33% have actual value
    }

    if (i % 2 === 0) {
      user.middleName = `Middle${i}` // 50% have middle name
    }

    if (i % 4 === 0) {
      user.bio = `User ${i} bio information` // 25% have bio
    }

    if (i % 5 !== 0) {
      user.avatar = null // 80% have null avatar
    } else {
      user.avatar = `https://example.com/avatar/${i}.jpg`
    }

    return user
  }),
}

export const testDataStr = JSON.stringify(testDataObj)

export async function createSchemas(onlyAtchara = false) {
  const { initialize, string, number, object, array, nullable, optional } = await import('atchara')

  await initialize()

  const atcharaSchema = object({
    users: array(
      object({
        id: number(),
        name: string(),
        email: string(),
        phone: nullable(string()),
        middleName: optional(string()),
        bio: optional(string()),
        avatar: nullable(string()),
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
    users: z.array(
      z.object({
        id: z.number(),
        name: z.string(),
        email: z.string(),
        phone: z.string().nullable(),
        middleName: z.string().optional(),
        bio: z.string().optional(),
        avatar: z.string().nullable(),
      })
    ),
  })

  const valibotSchema = v.object({
    users: v.array(
      v.object({
        id: v.number(),
        name: v.string(),
        email: v.string(),
        phone: v.nullable(v.string()),
        middleName: v.optional(v.string()),
        bio: v.optional(v.string()),
        avatar: v.nullable(v.string()),
      })
    ),
  })

  const yupSchema = yup.object({
    users: yup
      .array()
      .of(
        yup.object({
          id: yup.number().required(),
          name: yup.string().required(),
          email: yup.string().required(),
          phone: yup.string().nullable().defined(),
          middleName: yup.string().optional(),
          bio: yup.string().optional(),
          avatar: yup.string().nullable().defined(),
        })
      )
      .required(),
  })

  const joiSchema = Joi.object({
    users: Joi.array()
      .items(
        Joi.object({
          id: Joi.number().required(),
          name: Joi.string().required(),
          email: Joi.string().required(),
          phone: Joi.string().allow(null).required(),
          middleName: Joi.string(),
          bio: Joi.string(),
          avatar: Joi.string().allow(null).required(),
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
    'nullable-optional',
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
