// Parsing wide objects with many fields (100 fields)
// Tests field index encoding scaling vs HashMap-based field lookup

export const testDataObj = {
  data: Array.from({ length: 100 }, (_, i) => {
    const obj = {}
    for (let j = 0; j < 100; j++) {
      const fieldType = j % 3
      if (fieldType === 0) {
        obj[`field_${j}`] = `value-${i}-${j}`
      } else if (fieldType === 1) {
        obj[`field_${j}`] = Math.random() * 1000
      } else {
        obj[`field_${j}`] = j % 2 === 0
      }
    }
    return obj
  }),
}

export const testDataStr = JSON.stringify(testDataObj)

export async function createSchemas(onlyAtchara = false) {
  const { initialize, string, number, boolean, object, array } = await import('atchara')

  await initialize()

  // Create schema with 100 fields
  const fieldSchema = {}
  for (let j = 0; j < 100; j++) {
    const fieldType = j % 3
    if (fieldType === 0) {
      fieldSchema[`field_${j}`] = string()
    } else if (fieldType === 1) {
      fieldSchema[`field_${j}`] = number()
    } else {
      fieldSchema[`field_${j}`] = boolean()
    }
  }

  const atcharaSchema = object({
    data: array(object(fieldSchema)),
  })

  if (onlyAtchara) {
    return { atcharaSchema, zodSchema: null, valibotSchema: null, yupSchema: null, joiSchema: null }
  }

  const { z } = await import('zod')
  const v = await import('valibot')
  const yup = await import('yup')
  const { default: Joi } = await import('joi')

  // Create Zod schema with 100 fields
  const zodFieldSchema = {}
  for (let j = 0; j < 100; j++) {
    const fieldType = j % 3
    if (fieldType === 0) {
      zodFieldSchema[`field_${j}`] = z.string()
    } else if (fieldType === 1) {
      zodFieldSchema[`field_${j}`] = z.number()
    } else {
      zodFieldSchema[`field_${j}`] = z.boolean()
    }
  }

  const zodSchema = z.object({
    data: z.array(z.object(zodFieldSchema)),
  })

  // Create Valibot schema with 100 fields
  const valibotFieldSchema = {}
  for (let j = 0; j < 100; j++) {
    const fieldType = j % 3
    if (fieldType === 0) {
      valibotFieldSchema[`field_${j}`] = v.string()
    } else if (fieldType === 1) {
      valibotFieldSchema[`field_${j}`] = v.number()
    } else {
      valibotFieldSchema[`field_${j}`] = v.boolean()
    }
  }

  const valibotSchema = v.object({
    data: v.array(v.object(valibotFieldSchema)),
  })

  // Create Yup schema with 100 fields
  const yupFieldSchema = {}
  for (let j = 0; j < 100; j++) {
    const fieldType = j % 3
    if (fieldType === 0) {
      yupFieldSchema[`field_${j}`] = yup.string().required()
    } else if (fieldType === 1) {
      yupFieldSchema[`field_${j}`] = yup.number().required()
    } else {
      yupFieldSchema[`field_${j}`] = yup.boolean().required()
    }
  }

  const yupSchema = yup.object({
    data: yup.array().of(yup.object(yupFieldSchema)).required(),
  })

  // Create Joi schema with 100 fields
  const joiFieldSchema = {}
  for (let j = 0; j < 100; j++) {
    const fieldType = j % 3
    if (fieldType === 0) {
      joiFieldSchema[`field_${j}`] = Joi.string().required()
    } else if (fieldType === 1) {
      joiFieldSchema[`field_${j}`] = Joi.number().required()
    } else {
      joiFieldSchema[`field_${j}`] = Joi.boolean().required()
    }
  }

  const joiSchema = Joi.object({
    data: Joi.array().items(Joi.object(joiFieldSchema)).required(),
  })

  return { atcharaSchema, zodSchema, valibotSchema, yupSchema, joiSchema }
}

if (import.meta.main) {
  const { profileScenario } = await import('../profiler.js')

  // PROFILE_ITERATIONS env var controls iteration count (default: 5000)
  const iterations = parseInt(process.env.PROFILE_ITERATIONS || '5000', 10)
  const testDataBytes = new TextEncoder().encode(testDataStr)

  await profileScenario(
    'wide-object',
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
