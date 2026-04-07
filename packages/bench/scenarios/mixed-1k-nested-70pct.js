// Real-world scenario: 1,000 items with complex nested schema, 70% valid / 30% invalid
// 70% of payloads parse successfully, 30% fail at distributed positions (early/mid/late)

import { createPayloadPool, createPayloadIterator } from './common.js'

function createValidItem(i) {
  return {
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
      created: '2024-01-01T00:00:00.000Z',
      lastLogin: '2024-01-15T12:00:00.000Z',
      loginCount: i % 1000,
    },
  }
}

function createInvalidItem(i, errorType) {
  switch (errorType) {
    case 0:
      // Wrong type: id should be number
      return {
        id: `invalid-${i}`,
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
          created: '2024-01-01T00:00:00.000Z',
          lastLogin: '2024-01-15T12:00:00.000Z',
          loginCount: i % 1000,
        },
      }
    case 1:
      // Missing required nested field (profile.firstName)
      return {
        id: i,
        name: `User ${i}`,
        email: `user${i}@example.com`,
        profile: {
          lastName: `Last${i}`,
          preferences: {
            theme: 'dark',
            notifications: true,
            tags: [`tag${i}`, `category${i % 10}`],
          },
        },
        metadata: {
          created: '2024-01-01T00:00:00.000Z',
          lastLogin: '2024-01-15T12:00:00.000Z',
          loginCount: i % 1000,
        },
      }
    case 2:
      // Wrong type in nested object: notifications should be boolean
      return {
        id: i,
        name: `User ${i}`,
        email: `user${i}@example.com`,
        profile: {
          firstName: `First${i}`,
          lastName: `Last${i}`,
          preferences: {
            theme: 'dark',
            notifications: 'yes',
            tags: [`tag${i}`, `category${i % 10}`],
          },
        },
        metadata: {
          created: '2024-01-01T00:00:00.000Z',
          lastLogin: '2024-01-15T12:00:00.000Z',
          loginCount: i % 1000,
        },
      }
    default:
      // Wrong type in array: tags should be array of strings
      return {
        id: i,
        name: `User ${i}`,
        email: `user${i}@example.com`,
        profile: {
          firstName: `First${i}`,
          lastName: `Last${i}`,
          preferences: {
            theme: 'dark',
            notifications: true,
            tags: [123, 456],
          },
        },
        metadata: {
          created: '2024-01-01T00:00:00.000Z',
          lastLogin: '2024-01-15T12:00:00.000Z',
          loginCount: i % 1000,
        },
      }
  }
}

const payloadStrs = createPayloadPool({
  itemCount: 1000,
  validPercent: 70,
  poolSize: 100,
  createValidItem,
  createInvalidItem,
  errorTypeCount: 4,
  wrapItems: (items) => ({ users: items }),
})

let encoder
// Create bytes locally (TextEncoder not available in k6)
if (typeof TextEncoder !== 'undefined') {
  encoder = new TextEncoder()
}

const payloadBytes = encoder && payloadStrs.map((str) => encoder.encode(str))

// Export pool and iterators for benchmarks
export { payloadStrs, payloadBytes }
export const getNextPayloadStr = createPayloadIterator(payloadStrs)
export const getNextPayloadBytes = payloadBytes && createPayloadIterator(payloadBytes)

// Legacy export for backward compatibility (uses first valid payload)
export const testDataStr = payloadStrs[0]
export const testDataObj = JSON.parse(testDataStr)

export async function createSchemas(onlyAtchara = false) {
  const { initialize, string, number, boolean, object, array } = await import('atchara')

  await initialize()

  const atcharaSchema = object({
    users: array(
      object({
        id: number().min(0),
        name: string().min(1).max(100),
        email: string().min(5).max(254).pattern(/@/),
        profile: object({
          firstName: string().min(1).max(50),
          lastName: string().min(1).max(50),
          preferences: object({
            theme: string().min(1).max(20),
            notifications: boolean(),
            tags: array(string().min(1).max(50)).min(1).max(10),
          }),
        }),
        metadata: object({
          created: string().pattern(/^\d{4}-/),
          lastLogin: string().pattern(/^\d{4}-/),
          loginCount: number().min(0),
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
        id: z.number().min(0),
        name: z.string().min(1).max(100),
        email: z.string().min(5).max(254).regex(/@/),
        profile: z.object({
          firstName: z.string().min(1).max(50),
          lastName: z.string().min(1).max(50),
          preferences: z.object({
            theme: z.string().min(1).max(20),
            notifications: z.boolean(),
            tags: z.array(z.string().min(1).max(50)).min(1).max(10),
          }),
        }),
        metadata: z.object({
          created: z.string().regex(/^\d{4}-/),
          lastLogin: z.string().regex(/^\d{4}-/),
          loginCount: z.number().min(0),
        }),
      })
    ),
  })

  const valibotSchema = v.object({
    users: v.array(
      v.object({
        id: v.number([v.minValue(0)]),
        name: v.string([v.minLength(1), v.maxLength(100)]),
        email: v.string([v.minLength(5), v.maxLength(254), v.regex(/@/)]),
        profile: v.object({
          firstName: v.string([v.minLength(1), v.maxLength(50)]),
          lastName: v.string([v.minLength(1), v.maxLength(50)]),
          preferences: v.object({
            theme: v.string([v.minLength(1), v.maxLength(20)]),
            notifications: v.boolean(),
            tags: v.array(v.string([v.minLength(1), v.maxLength(50)]), [
              v.minLength(1),
              v.maxLength(10),
            ]),
          }),
        }),
        metadata: v.object({
          created: v.string([v.regex(/^\d{4}-/)]),
          lastLogin: v.string([v.regex(/^\d{4}-/)]),
          loginCount: v.number([v.minValue(0)]),
        }),
      })
    ),
  })

  const yupSchema = yup.object({
    users: yup
      .array()
      .of(
        yup
          .object({
            id: yup.number().min(0).required(),
            name: yup.string().min(1).max(100).required(),
            email: yup.string().min(5).max(254).matches(/@/).required(),
            profile: yup
              .object({
                firstName: yup.string().min(1).max(50).required(),
                lastName: yup.string().min(1).max(50).required(),
                preferences: yup
                  .object({
                    theme: yup.string().min(1).max(20).required(),
                    notifications: yup.boolean().required(),
                    tags: yup
                      .array()
                      .of(yup.string().min(1).max(50).required())
                      .min(1)
                      .max(10)
                      .strict()
                      .required(),
                  })
                  .required(),
              })
              .required(),
            metadata: yup
              .object({
                created: yup
                  .string()
                  .matches(/^\d{4}-/)
                  .required(),
                lastLogin: yup
                  .string()
                  .matches(/^\d{4}-/)
                  .required(),
                loginCount: yup.number().min(0).required(),
              })
              .required(),
          })
          .required()
      )
      .required(),
  })

  const joiSchema = Joi.object({
    users: Joi.array()
      .items(
        Joi.object({
          id: Joi.number().min(0).required(),
          name: Joi.string().min(1).max(100).required(),
          email: Joi.string().min(5).max(254).pattern(/@/).required(),
          profile: Joi.object({
            firstName: Joi.string().min(1).max(50).required(),
            lastName: Joi.string().min(1).max(50).required(),
            preferences: Joi.object({
              theme: Joi.string().min(1).max(20).required(),
              notifications: Joi.boolean().required(),
              tags: Joi.array()
                .items(Joi.string().min(1).max(50).required())
                .min(1)
                .max(10)
                .required(),
            }).required(),
          }).required(),
          metadata: Joi.object({
            created: Joi.string()
              .pattern(/^\d{4}-/)
              .required(),
            lastLogin: Joi.string()
              .pattern(/^\d{4}-/)
              .required(),
            loginCount: Joi.number().min(0).required(),
          }).required(),
        }).required()
      )
      .required(),
  })

  return { atcharaSchema, zodSchema, valibotSchema, yupSchema, joiSchema }
}

// CLI entry point - only runs when file is executed directly
if (import.meta.main) {
  const { profileScenario } = await import('../profiler.js')

  // PROFILE_ITERATIONS env var controls iteration count (default: 1000)
  const iterations = parseInt(process.env.PROFILE_ITERATIONS || '1000', 10)

  await profileScenario(
    '1000-nested-user-objects-70-30-valid',
    async () => {
      const { atcharaSchema } = await createSchemas(true)
      return atcharaSchema
    },
    (schema) => {
      try {
        schema.parse(getNextPayloadBytes())
      } catch {
        // Expected to fail with invalid data
      }
    },
    iterations
  )
}
