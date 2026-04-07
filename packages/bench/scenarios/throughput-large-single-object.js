// Parsing large single object (vs many small objects)
// Tests native boundary overhead with single large payload

function createLargeStructure() {
  return {
    metadata: {
      id: 'large-obj-1',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      checksum: 'abc123def456',
    },
    users: Array.from({ length: 500 }, (_, i) => ({
      id: i,
      username: `user_${i}`,
      email: `user${i}@example.com`,
      profile: {
        firstName: `First${i}`,
        lastName: `Last${i}`,
        bio: `User ${i} profile bio with some details`,
        age: 20 + (i % 50),
      },
      settings: {
        notifications: i % 2 === 0,
        theme: i % 2 === 0 ? 'dark' : 'light',
        language: i % 3 === 0 ? 'en' : i % 3 === 1 ? 'es' : 'fr',
      },
      posts: Array.from({ length: 10 }, (_, j) => ({
        id: `post_${i}_${j}`,
        title: `Post ${j} by User ${i}`,
        content: `This is post content for post ${j}. It contains some text about topics.`,
        likes: Math.floor(Math.random() * 1000),
        timestamp: new Date(Date.now() - j * 86400000).toISOString(),
      })),
    })),
    statistics: {
      totalUsers: 500,
      totalPosts: 5000,
      avgPostsPerUser: 10,
      activeUsers: 450,
      regions: Array.from({ length: 50 }, (_, i) => ({
        name: `Region ${i}`,
        userCount: Math.floor(Math.random() * 100),
        postCount: Math.floor(Math.random() * 500),
      })),
    },
  }
}

export const testDataObj = createLargeStructure()
export const testDataStr = JSON.stringify(testDataObj)

export async function createSchemas(onlyAtchara = false) {
  const { initialize, string, number, boolean, object, array } = await import('atchara')

  await initialize()

  const atcharaSchema = object({
    metadata: object({
      id: string(),
      version: string(),
      timestamp: string(),
      checksum: string(),
    }),
    users: array(
      object({
        id: number(),
        username: string(),
        email: string(),
        profile: object({
          firstName: string(),
          lastName: string(),
          bio: string(),
          age: number(),
        }),
        settings: object({
          notifications: boolean(),
          theme: string(),
          language: string(),
        }),
        posts: array(
          object({
            id: string(),
            title: string(),
            content: string(),
            likes: number(),
            timestamp: string(),
          })
        ),
      })
    ),
    statistics: object({
      totalUsers: number(),
      totalPosts: number(),
      avgPostsPerUser: number(),
      activeUsers: number(),
      regions: array(
        object({
          name: string(),
          userCount: number(),
          postCount: number(),
        })
      ),
    }),
  })

  if (onlyAtchara) {
    return { atcharaSchema, zodSchema: null, valibotSchema: null, yupSchema: null, joiSchema: null }
  }

  const { z } = await import('zod')
  const v = await import('valibot')
  const yup = await import('yup')
  const { default: Joi } = await import('joi')

  const zodSchema = z.object({
    metadata: z.object({
      id: z.string(),
      version: z.string(),
      timestamp: z.string(),
      checksum: z.string(),
    }),
    users: z.array(
      z.object({
        id: z.number(),
        username: z.string(),
        email: z.string(),
        profile: z.object({
          firstName: z.string(),
          lastName: z.string(),
          bio: z.string(),
          age: z.number(),
        }),
        settings: z.object({
          notifications: z.boolean(),
          theme: z.string(),
          language: z.string(),
        }),
        posts: z.array(
          z.object({
            id: z.string(),
            title: z.string(),
            content: z.string(),
            likes: z.number(),
            timestamp: z.string(),
          })
        ),
      })
    ),
    statistics: z.object({
      totalUsers: z.number(),
      totalPosts: z.number(),
      avgPostsPerUser: z.number(),
      activeUsers: z.number(),
      regions: z.array(
        z.object({
          name: z.string(),
          userCount: z.number(),
          postCount: z.number(),
        })
      ),
    }),
  })

  const valibotSchema = v.object({
    metadata: v.object({
      id: v.string(),
      version: v.string(),
      timestamp: v.string(),
      checksum: v.string(),
    }),
    users: v.array(
      v.object({
        id: v.number(),
        username: v.string(),
        email: v.string(),
        profile: v.object({
          firstName: v.string(),
          lastName: v.string(),
          bio: v.string(),
          age: v.number(),
        }),
        settings: v.object({
          notifications: v.boolean(),
          theme: v.string(),
          language: v.string(),
        }),
        posts: v.array(
          v.object({
            id: v.string(),
            title: v.string(),
            content: v.string(),
            likes: v.number(),
            timestamp: v.string(),
          })
        ),
      })
    ),
    statistics: v.object({
      totalUsers: v.number(),
      totalPosts: v.number(),
      avgPostsPerUser: v.number(),
      activeUsers: v.number(),
      regions: v.array(
        v.object({
          name: v.string(),
          userCount: v.number(),
          postCount: v.number(),
        })
      ),
    }),
  })

  const yupSchema = yup.object({
    metadata: yup
      .object({
        id: yup.string().required(),
        version: yup.string().required(),
        timestamp: yup.string().required(),
        checksum: yup.string().required(),
      })
      .required(),
    users: yup
      .array()
      .of(
        yup
          .object({
            id: yup.number().required(),
            username: yup.string().required(),
            email: yup.string().required(),
            profile: yup
              .object({
                firstName: yup.string().required(),
                lastName: yup.string().required(),
                bio: yup.string().required(),
                age: yup.number().required(),
              })
              .required(),
            settings: yup
              .object({
                notifications: yup.boolean().required(),
                theme: yup.string().required(),
                language: yup.string().required(),
              })
              .required(),
            posts: yup
              .array()
              .of(
                yup
                  .object({
                    id: yup.string().required(),
                    title: yup.string().required(),
                    content: yup.string().required(),
                    likes: yup.number().required(),
                    timestamp: yup.string().required(),
                  })
                  .required()
              )
              .required(),
          })
          .required()
      )
      .required(),
    statistics: yup
      .object({
        totalUsers: yup.number().required(),
        totalPosts: yup.number().required(),
        avgPostsPerUser: yup.number().required(),
        activeUsers: yup.number().required(),
        regions: yup
          .array()
          .of(
            yup
              .object({
                name: yup.string().required(),
                userCount: yup.number().required(),
                postCount: yup.number().required(),
              })
              .required()
          )
          .required(),
      })
      .required(),
  })

  const joiSchema = Joi.object({
    metadata: Joi.object({
      id: Joi.string().required(),
      version: Joi.string().required(),
      timestamp: Joi.string().required(),
      checksum: Joi.string().required(),
    }).required(),
    users: Joi.array()
      .items(
        Joi.object({
          id: Joi.number().required(),
          username: Joi.string().required(),
          email: Joi.string().required(),
          profile: Joi.object({
            firstName: Joi.string().required(),
            lastName: Joi.string().required(),
            bio: Joi.string().required(),
            age: Joi.number().required(),
          }).required(),
          settings: Joi.object({
            notifications: Joi.boolean().required(),
            theme: Joi.string().required(),
            language: Joi.string().required(),
          }).required(),
          posts: Joi.array()
            .items(
              Joi.object({
                id: Joi.string().required(),
                title: Joi.string().required(),
                content: Joi.string().required(),
                likes: Joi.number().required(),
                timestamp: Joi.string().required(),
              }).required()
            )
            .required(),
        }).required()
      )
      .required(),
    statistics: Joi.object({
      totalUsers: Joi.number().required(),
      totalPosts: Joi.number().required(),
      avgPostsPerUser: Joi.number().required(),
      activeUsers: Joi.number().required(),
      regions: Joi.array()
        .items(
          Joi.object({
            name: Joi.string().required(),
            userCount: Joi.number().required(),
            postCount: Joi.number().required(),
          }).required()
        )
        .required(),
    }).required(),
  })

  return { atcharaSchema, zodSchema, valibotSchema, yupSchema, joiSchema }
}

if (import.meta.main) {
  const { profileScenario } = await import('../profiler.js')

  // PROFILE_ITERATIONS env var controls iteration count (default: 5000)
  const iterations = parseInt(process.env.PROFILE_ITERATIONS || '5000', 10)
  const testDataBytes = new TextEncoder().encode(testDataStr)

  await profileScenario(
    'large-single-object',
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
