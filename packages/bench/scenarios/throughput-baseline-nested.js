// Parsing 100 users with nested profile and metadata objects
export const testDataObj = {
  users: Array.from({ length: 100 }, (_, i) => ({
    id: i,
    name: `User ${i}`,
    email: `user${i}@example.com`,
    profile: {
      firstName: `First${i}`,
      lastName: `Last${i}`,
      preferences: {
        theme: 'dark',
        notifications: true,
        tags: [`tag${i}`, `category${i % 10}`],
      },
    },
    metadata: {
      created: new Date().toISOString(),
      lastLogin: new Date().toISOString(),
      loginCount: Math.floor(Math.random() * 1000),
    },
  })),
}

export const testDataStr = JSON.stringify(testDataObj)

export async function createSchemas(onlyAtchara = false) {
  const { initialize, string, number, boolean, object, array } = await import('atchara')

  await initialize()

  const atcharaSchema = object({
    users: array(
      object({
        id: number(),
        name: string(),
        email: string(),
        profile: object({
          firstName: string(),
          lastName: string(),
          preferences: object({
            theme: string(),
            notifications: boolean(),
            tags: array(string()),
          }),
        }),
        metadata: object({
          created: string(),
          lastLogin: string(),
          loginCount: number(),
        }),
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
        profile: z.object({
          firstName: z.string(),
          lastName: z.string(),
          preferences: z.object({
            theme: z.string(),
            notifications: z.boolean(),
            tags: z.array(z.string()),
          }),
        }),
        metadata: z.object({
          created: z.string(),
          lastLogin: z.string(),
          loginCount: z.number(),
        }),
      })
    ),
  })

  const valibotSchema = v.object({
    users: v.array(
      v.object({
        id: v.number(),
        name: v.string(),
        email: v.string(),
        profile: v.object({
          firstName: v.string(),
          lastName: v.string(),
          preferences: v.object({
            theme: v.string(),
            notifications: v.boolean(),
            tags: v.array(v.string()),
          }),
        }),
        metadata: v.object({
          created: v.string(),
          lastLogin: v.string(),
          loginCount: v.number(),
        }),
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
          profile: yup
            .object({
              firstName: yup.string().required(),
              lastName: yup.string().required(),
              preferences: yup
                .object({
                  theme: yup.string().required(),
                  notifications: yup.boolean().required(),
                  tags: yup.array().of(yup.string().required()).required(),
                })
                .required(),
            })
            .required(),
          metadata: yup
            .object({
              created: yup.string().required(),
              lastLogin: yup.string().required(),
              loginCount: yup.number().required(),
            })
            .required(),
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
          profile: Joi.object({
            firstName: Joi.string().required(),
            lastName: Joi.string().required(),
            preferences: Joi.object({
              theme: Joi.string().required(),
              notifications: Joi.boolean().required(),
              tags: Joi.array().items(Joi.string().required()).required(),
            }).required(),
          }).required(),
          metadata: Joi.object({
            created: Joi.string().required(),
            lastLogin: Joi.string().required(),
            loginCount: Joi.number().required(),
          }).required(),
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
    'complex-object',
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
