import { Hono } from 'hono'
import * as v from 'valibot'

import * as throughputBaselineSimple from './scenarios/throughput-baseline-simple.js'
import * as throughputBaselineNested from './scenarios/throughput-baseline-nested.js'
import * as throughput1kNumbers from './scenarios/throughput-1k-numbers.js'
import * as throughput10kNumbers from './scenarios/throughput-10k-numbers.js'
import * as validationEarlyField from './scenarios/validation-fail-early-field.js'
import * as validationMidArray from './scenarios/validation-fail-mid-array.js'
import * as mixed1kSimple70pct from './scenarios/mixed-1k-simple-70pct.js'
import * as mixed1kSimple90pct from './scenarios/mixed-1k-simple-90pct.js'
import * as mixed1kNested70pct from './scenarios/mixed-1k-nested-70pct.js'
import * as mixed1kNested90pct from './scenarios/mixed-1k-nested-90pct.js'
import * as throughputDeepNesting from './scenarios/throughput-deep-nesting.js'
import * as throughputLargeSingleObject from './scenarios/throughput-large-single-object.js'
import * as throughputMixedTypes from './scenarios/throughput-mixed-types.js'
import * as throughputNullableOptional from './scenarios/throughput-nullable-optional.js'
import * as throughputStringHeavy from './scenarios/throughput-string-heavy.js'
import * as throughputWideObject from './scenarios/throughput-wide-object.js'
import * as validationFailDeepNested from './scenarios/validation-fail-deep-nested.js'
import * as validationFailLate from './scenarios/validation-fail-late.js'

const app = new Hono()

// Helper to create atchara handler with full decode (fair comparison with competitors)
async function createAtcharaHandler(createSchemas) {
  const schemas = await createSchemas()
  if (!schemas.atcharaSchema) {
    throw new Error('No schema found for atchara')
  }

  const schema = schemas.atcharaSchema

  return async (c) => {
    try {
      const body = await c.req.arrayBuffer()
      const data = new Uint8Array(body)

      try {
        schema.parse(data).toValue()
        return c.json({ success: true })
      } catch (error) {
        return c.json({ success: false, errors: error.message || String(error) })
      }
    } catch (error) {
      return c.json({ success: false, errors: error.message || 'Internal server error' }, 500)
    }
  }
}

// Helper to create atchara handler with deferred evaluation (no .toValue())
async function createAtcharaDeferredHandler(createSchemas) {
  const schemas = await createSchemas()
  if (!schemas.atcharaSchema) {
    throw new Error('No schema found for atchara')
  }

  const schema = schemas.atcharaSchema

  return async (c) => {
    try {
      const body = await c.req.arrayBuffer()
      const data = new Uint8Array(body)

      try {
        schema.parse(data)
        return c.json({ success: true })
      } catch (error) {
        return c.json({ success: false, errors: error.message || String(error) })
      }
    } catch (error) {
      return c.json({ success: false, errors: error.message || 'Internal server error' }, 500)
    }
  }
}

// Helper to create zod handler (JSON)
async function createZodHandler(createSchemas) {
  const schemas = await createSchemas()
  if (!schemas.zodSchema) {
    throw new Error('No schema found for zod')
  }

  const schema = schemas.zodSchema

  return async (c) => {
    try {
      let data
      try {
        data = await c.req.json()
      } catch (e) {
        return c.json({ success: false, errors: 'Invalid JSON in request body' }, 400)
      }

      try {
        schema.parse(data)
        return c.json({ success: true })
      } catch (error) {
        return c.json({ success: false, errors: error.message || String(error) })
      }
    } catch (error) {
      return c.json({ success: false, errors: error.message || 'Internal server error' }, 500)
    }
  }
}

// Helper to create valibot handler (JSON)
async function createValibotHandler(createSchemas) {
  const schemas = await createSchemas()
  if (!schemas.valibotSchema) {
    throw new Error('No schema found for valibot')
  }

  const schema = schemas.valibotSchema

  return async (c) => {
    try {
      let data
      try {
        data = await c.req.json()
      } catch (e) {
        return c.json({ success: false, errors: 'Invalid JSON in request body' }, 400)
      }

      try {
        v.parse(schema, data)
        return c.json({ success: true })
      } catch (error) {
        return c.json({ success: false, errors: error.message || String(error) })
      }
    } catch (error) {
      return c.json({ success: false, errors: error.message || 'Internal server error' }, 500)
    }
  }
}

// Helper to create yup handler (JSON)
async function createYupHandler(createSchemas) {
  const schemas = await createSchemas()
  if (!schemas.yupSchema) {
    throw new Error('No schema found for yup')
  }

  const schema = schemas.yupSchema

  return async (c) => {
    try {
      let data
      try {
        data = await c.req.json()
      } catch (e) {
        return c.json({ success: false, errors: 'Invalid JSON in request body' }, 400)
      }

      try {
        schema.validateSync(data)
        return c.json({ success: true })
      } catch (error) {
        return c.json({ success: false, errors: error.message || String(error) })
      }
    } catch (error) {
      return c.json({ success: false, errors: error.message || 'Internal server error' }, 500)
    }
  }
}

// Helper to create joi handler (JSON)
async function createJoiHandler(createSchemas) {
  const schemas = await createSchemas()
  if (!schemas.joiSchema) {
    throw new Error('No schema found for joi')
  }

  const schema = schemas.joiSchema

  return async (c) => {
    try {
      let data
      try {
        data = await c.req.json()
      } catch (e) {
        return c.json({ success: false, errors: 'Invalid JSON in request body' }, 400)
      }

      const { error } = schema.validate(data, { cache: false })
      if (error) {
        return c.json({ success: false, errors: error.message || String(error) })
      }
      return c.json({ success: true })
    } catch (error) {
      return c.json({ success: false, errors: error.message || 'Internal server error' }, 500)
    }
  }
}

// Initialize handlers asynchronously and register routes
async function setupRoutes() {
  // ============================================================================
  // THROUGHPUT TESTS
  // ============================================================================

  // Baseline Simple Routes
  const throughputBaselineSimpleAtcharaHandler = await createAtcharaHandler(
    throughputBaselineSimple.createSchemas
  )
  const throughputBaselineSimpleZodHandler = await createZodHandler(
    throughputBaselineSimple.createSchemas
  )
  const throughputBaselineSimpleValibotHandler = await createValibotHandler(
    throughputBaselineSimple.createSchemas
  )
  const throughputBaselineSimpleYupHandler = await createYupHandler(
    throughputBaselineSimple.createSchemas
  )
  const throughputBaselineSimpleJoiHandler = await createJoiHandler(
    throughputBaselineSimple.createSchemas
  )
  app.post('/validator/atchara/throughput-baseline-simple', throughputBaselineSimpleAtcharaHandler)
  app.post('/validator/zod/throughput-baseline-simple', throughputBaselineSimpleZodHandler)
  app.post('/validator/valibot/throughput-baseline-simple', throughputBaselineSimpleValibotHandler)
  app.post('/validator/yup/throughput-baseline-simple', throughputBaselineSimpleYupHandler)
  app.post('/validator/joi/throughput-baseline-simple', throughputBaselineSimpleJoiHandler)

  // Baseline Nested Routes
  const throughputBaselineNestedAtcharaHandler = await createAtcharaHandler(
    throughputBaselineNested.createSchemas
  )
  const throughputBaselineNestedZodHandler = await createZodHandler(
    throughputBaselineNested.createSchemas
  )
  const throughputBaselineNestedValibotHandler = await createValibotHandler(
    throughputBaselineNested.createSchemas
  )
  const throughputBaselineNestedYupHandler = await createYupHandler(
    throughputBaselineNested.createSchemas
  )
  const throughputBaselineNestedJoiHandler = await createJoiHandler(
    throughputBaselineNested.createSchemas
  )
  app.post('/validator/atchara/throughput-baseline-nested', throughputBaselineNestedAtcharaHandler)
  app.post('/validator/zod/throughput-baseline-nested', throughputBaselineNestedZodHandler)
  app.post('/validator/valibot/throughput-baseline-nested', throughputBaselineNestedValibotHandler)
  app.post('/validator/yup/throughput-baseline-nested', throughputBaselineNestedYupHandler)
  app.post('/validator/joi/throughput-baseline-nested', throughputBaselineNestedJoiHandler)

  // Scale 1K Numbers Routes
  const throughput1kNumbersAtcharaHandler = await createAtcharaHandler(
    throughput1kNumbers.createSchemas
  )
  const throughput1kNumbersZodHandler = await createZodHandler(throughput1kNumbers.createSchemas)
  const throughput1kNumbersValibotHandler = await createValibotHandler(
    throughput1kNumbers.createSchemas
  )
  const throughput1kNumbersYupHandler = await createYupHandler(throughput1kNumbers.createSchemas)
  const throughput1kNumbersJoiHandler = await createJoiHandler(throughput1kNumbers.createSchemas)
  app.post('/validator/atchara/throughput-1k-numbers', throughput1kNumbersAtcharaHandler)
  app.post('/validator/zod/throughput-1k-numbers', throughput1kNumbersZodHandler)
  app.post('/validator/valibot/throughput-1k-numbers', throughput1kNumbersValibotHandler)
  app.post('/validator/yup/throughput-1k-numbers', throughput1kNumbersYupHandler)
  app.post('/validator/joi/throughput-1k-numbers', throughput1kNumbersJoiHandler)

  // Scale 10K Numbers Routes
  const throughput10kNumbersAtcharaHandler = await createAtcharaHandler(
    throughput10kNumbers.createSchemas
  )
  const throughput10kNumbersZodHandler = await createZodHandler(throughput10kNumbers.createSchemas)
  const throughput10kNumbersValibotHandler = await createValibotHandler(
    throughput10kNumbers.createSchemas
  )
  const throughput10kNumbersYupHandler = await createYupHandler(throughput10kNumbers.createSchemas)
  const throughput10kNumbersJoiHandler = await createJoiHandler(throughput10kNumbers.createSchemas)
  app.post('/validator/atchara/throughput-10k-numbers', throughput10kNumbersAtcharaHandler)
  app.post('/validator/zod/throughput-10k-numbers', throughput10kNumbersZodHandler)
  app.post('/validator/valibot/throughput-10k-numbers', throughput10kNumbersValibotHandler)
  app.post('/validator/yup/throughput-10k-numbers', throughput10kNumbersYupHandler)
  app.post('/validator/joi/throughput-10k-numbers', throughput10kNumbersJoiHandler)

  // Deep Nesting Routes
  const throughputDeepNestingAtcharaHandler = await createAtcharaHandler(
    throughputDeepNesting.createSchemas
  )
  const throughputDeepNestingZodHandler = await createZodHandler(
    throughputDeepNesting.createSchemas
  )
  const throughputDeepNestingValibotHandler = await createValibotHandler(
    throughputDeepNesting.createSchemas
  )
  const throughputDeepNestingYupHandler = await createYupHandler(
    throughputDeepNesting.createSchemas
  )
  const throughputDeepNestingJoiHandler = await createJoiHandler(
    throughputDeepNesting.createSchemas
  )
  app.post('/validator/atchara/throughput-deep-nesting', throughputDeepNestingAtcharaHandler)
  app.post('/validator/zod/throughput-deep-nesting', throughputDeepNestingZodHandler)
  app.post('/validator/valibot/throughput-deep-nesting', throughputDeepNestingValibotHandler)
  app.post('/validator/yup/throughput-deep-nesting', throughputDeepNestingYupHandler)
  app.post('/validator/joi/throughput-deep-nesting', throughputDeepNestingJoiHandler)

  // Large Single Object Routes
  const throughputLargeSingleObjectAtcharaHandler = await createAtcharaHandler(
    throughputLargeSingleObject.createSchemas
  )
  const throughputLargeSingleObjectZodHandler = await createZodHandler(
    throughputLargeSingleObject.createSchemas
  )
  const throughputLargeSingleObjectValibotHandler = await createValibotHandler(
    throughputLargeSingleObject.createSchemas
  )
  const throughputLargeSingleObjectYupHandler = await createYupHandler(
    throughputLargeSingleObject.createSchemas
  )
  const throughputLargeSingleObjectJoiHandler = await createJoiHandler(
    throughputLargeSingleObject.createSchemas
  )
  app.post(
    '/validator/atchara/throughput-large-single-object',
    throughputLargeSingleObjectAtcharaHandler
  )
  app.post('/validator/zod/throughput-large-single-object', throughputLargeSingleObjectZodHandler)
  app.post(
    '/validator/valibot/throughput-large-single-object',
    throughputLargeSingleObjectValibotHandler
  )
  app.post('/validator/yup/throughput-large-single-object', throughputLargeSingleObjectYupHandler)
  app.post('/validator/joi/throughput-large-single-object', throughputLargeSingleObjectJoiHandler)

  // Mixed Types Routes
  const throughputMixedTypesAtcharaHandler = await createAtcharaHandler(
    throughputMixedTypes.createSchemas
  )
  const throughputMixedTypesZodHandler = await createZodHandler(throughputMixedTypes.createSchemas)
  const throughputMixedTypesValibotHandler = await createValibotHandler(
    throughputMixedTypes.createSchemas
  )
  const throughputMixedTypesYupHandler = await createYupHandler(throughputMixedTypes.createSchemas)
  const throughputMixedTypesJoiHandler = await createJoiHandler(throughputMixedTypes.createSchemas)
  app.post('/validator/atchara/throughput-mixed-types', throughputMixedTypesAtcharaHandler)
  app.post('/validator/zod/throughput-mixed-types', throughputMixedTypesZodHandler)
  app.post('/validator/valibot/throughput-mixed-types', throughputMixedTypesValibotHandler)
  app.post('/validator/yup/throughput-mixed-types', throughputMixedTypesYupHandler)
  app.post('/validator/joi/throughput-mixed-types', throughputMixedTypesJoiHandler)

  // Nullable Optional Routes
  const throughputNullableOptionalAtcharaHandler = await createAtcharaHandler(
    throughputNullableOptional.createSchemas
  )
  const throughputNullableOptionalZodHandler = await createZodHandler(
    throughputNullableOptional.createSchemas
  )
  const throughputNullableOptionalValibotHandler = await createValibotHandler(
    throughputNullableOptional.createSchemas
  )
  const throughputNullableOptionalYupHandler = await createYupHandler(
    throughputNullableOptional.createSchemas
  )
  const throughputNullableOptionalJoiHandler = await createJoiHandler(
    throughputNullableOptional.createSchemas
  )
  app.post(
    '/validator/atchara/throughput-nullable-optional',
    throughputNullableOptionalAtcharaHandler
  )
  app.post('/validator/zod/throughput-nullable-optional', throughputNullableOptionalZodHandler)
  app.post(
    '/validator/valibot/throughput-nullable-optional',
    throughputNullableOptionalValibotHandler
  )
  app.post('/validator/yup/throughput-nullable-optional', throughputNullableOptionalYupHandler)
  app.post('/validator/joi/throughput-nullable-optional', throughputNullableOptionalJoiHandler)

  // String Heavy Routes
  const throughputStringHeavyAtcharaHandler = await createAtcharaHandler(
    throughputStringHeavy.createSchemas
  )
  const throughputStringHeavyZodHandler = await createZodHandler(
    throughputStringHeavy.createSchemas
  )
  const throughputStringHeavyValibotHandler = await createValibotHandler(
    throughputStringHeavy.createSchemas
  )
  const throughputStringHeavyYupHandler = await createYupHandler(
    throughputStringHeavy.createSchemas
  )
  const throughputStringHeavyJoiHandler = await createJoiHandler(
    throughputStringHeavy.createSchemas
  )
  app.post('/validator/atchara/throughput-string-heavy', throughputStringHeavyAtcharaHandler)
  app.post('/validator/zod/throughput-string-heavy', throughputStringHeavyZodHandler)
  app.post('/validator/valibot/throughput-string-heavy', throughputStringHeavyValibotHandler)
  app.post('/validator/yup/throughput-string-heavy', throughputStringHeavyYupHandler)
  app.post('/validator/joi/throughput-string-heavy', throughputStringHeavyJoiHandler)

  // Wide Object Routes
  const throughputWideObjectAtcharaHandler = await createAtcharaHandler(
    throughputWideObject.createSchemas
  )
  const throughputWideObjectZodHandler = await createZodHandler(throughputWideObject.createSchemas)
  const throughputWideObjectValibotHandler = await createValibotHandler(
    throughputWideObject.createSchemas
  )
  const throughputWideObjectYupHandler = await createYupHandler(throughputWideObject.createSchemas)
  const throughputWideObjectJoiHandler = await createJoiHandler(throughputWideObject.createSchemas)
  app.post('/validator/atchara/throughput-wide-object', throughputWideObjectAtcharaHandler)
  app.post('/validator/zod/throughput-wide-object', throughputWideObjectZodHandler)
  app.post('/validator/valibot/throughput-wide-object', throughputWideObjectValibotHandler)
  app.post('/validator/yup/throughput-wide-object', throughputWideObjectYupHandler)
  app.post('/validator/joi/throughput-wide-object', throughputWideObjectJoiHandler)

  // ============================================================================
  // VALIDATION TESTS
  // ============================================================================

  // Early Field Failure Routes
  const validationEarlyFieldAtcharaHandler = await createAtcharaHandler(
    validationEarlyField.createSchemas
  )
  const validationEarlyFieldZodHandler = await createZodHandler(validationEarlyField.createSchemas)
  const validationEarlyFieldValibotHandler = await createValibotHandler(
    validationEarlyField.createSchemas
  )
  const validationEarlyFieldYupHandler = await createYupHandler(validationEarlyField.createSchemas)
  const validationEarlyFieldJoiHandler = await createJoiHandler(validationEarlyField.createSchemas)
  app.post('/validator/atchara/validation-fail-early-field', validationEarlyFieldAtcharaHandler)
  app.post('/validator/zod/validation-fail-early-field', validationEarlyFieldZodHandler)
  app.post('/validator/valibot/validation-fail-early-field', validationEarlyFieldValibotHandler)
  app.post('/validator/yup/validation-fail-early-field', validationEarlyFieldYupHandler)
  app.post('/validator/joi/validation-fail-early-field', validationEarlyFieldJoiHandler)

  // Mid-Array Failure Routes
  const validationMidArrayAtcharaHandler = await createAtcharaHandler(
    validationMidArray.createSchemas
  )
  const validationMidArrayZodHandler = await createZodHandler(validationMidArray.createSchemas)
  const validationMidArrayValibotHandler = await createValibotHandler(
    validationMidArray.createSchemas
  )
  const validationMidArrayYupHandler = await createYupHandler(validationMidArray.createSchemas)
  const validationMidArrayJoiHandler = await createJoiHandler(validationMidArray.createSchemas)
  app.post('/validator/atchara/validation-fail-mid-array', validationMidArrayAtcharaHandler)
  app.post('/validator/zod/validation-fail-mid-array', validationMidArrayZodHandler)
  app.post('/validator/valibot/validation-fail-mid-array', validationMidArrayValibotHandler)
  app.post('/validator/yup/validation-fail-mid-array', validationMidArrayYupHandler)
  app.post('/validator/joi/validation-fail-mid-array', validationMidArrayJoiHandler)

  // Deep Nested Failure Routes
  const validationFailDeepNestedAtcharaHandler = await createAtcharaHandler(
    validationFailDeepNested.createSchemas
  )
  const validationFailDeepNestedZodHandler = await createZodHandler(
    validationFailDeepNested.createSchemas
  )
  const validationFailDeepNestedValibotHandler = await createValibotHandler(
    validationFailDeepNested.createSchemas
  )
  const validationFailDeepNestedYupHandler = await createYupHandler(
    validationFailDeepNested.createSchemas
  )
  const validationFailDeepNestedJoiHandler = await createJoiHandler(
    validationFailDeepNested.createSchemas
  )
  app.post('/validator/atchara/validation-fail-deep-nested', validationFailDeepNestedAtcharaHandler)
  app.post('/validator/zod/validation-fail-deep-nested', validationFailDeepNestedZodHandler)
  app.post('/validator/valibot/validation-fail-deep-nested', validationFailDeepNestedValibotHandler)
  app.post('/validator/yup/validation-fail-deep-nested', validationFailDeepNestedYupHandler)
  app.post('/validator/joi/validation-fail-deep-nested', validationFailDeepNestedJoiHandler)

  // Late Failure Routes
  const validationFailLateAtcharaHandler = await createAtcharaHandler(
    validationFailLate.createSchemas
  )
  const validationFailLateZodHandler = await createZodHandler(validationFailLate.createSchemas)
  const validationFailLateValibotHandler = await createValibotHandler(
    validationFailLate.createSchemas
  )
  const validationFailLateYupHandler = await createYupHandler(validationFailLate.createSchemas)
  const validationFailLateJoiHandler = await createJoiHandler(validationFailLate.createSchemas)
  app.post('/validator/atchara/validation-fail-late', validationFailLateAtcharaHandler)
  app.post('/validator/zod/validation-fail-late', validationFailLateZodHandler)
  app.post('/validator/valibot/validation-fail-late', validationFailLateValibotHandler)
  app.post('/validator/yup/validation-fail-late', validationFailLateYupHandler)
  app.post('/validator/joi/validation-fail-late', validationFailLateJoiHandler)

  // ============================================================================
  // MIXED VALIDITY TESTS
  // ============================================================================

  // 1K Simple 70% Valid Routes
  const mixed1kSimple70pctAtcharaHandler = await createAtcharaHandler(
    mixed1kSimple70pct.createSchemas
  )
  const mixed1kSimple70pctZodHandler = await createZodHandler(mixed1kSimple70pct.createSchemas)
  const mixed1kSimple70pctValibotHandler = await createValibotHandler(
    mixed1kSimple70pct.createSchemas
  )
  const mixed1kSimple70pctYupHandler = await createYupHandler(mixed1kSimple70pct.createSchemas)
  const mixed1kSimple70pctJoiHandler = await createJoiHandler(mixed1kSimple70pct.createSchemas)
  app.post('/validator/atchara/mixed-1k-simple-70pct', mixed1kSimple70pctAtcharaHandler)
  app.post('/validator/zod/mixed-1k-simple-70pct', mixed1kSimple70pctZodHandler)
  app.post('/validator/valibot/mixed-1k-simple-70pct', mixed1kSimple70pctValibotHandler)
  app.post('/validator/yup/mixed-1k-simple-70pct', mixed1kSimple70pctYupHandler)
  app.post('/validator/joi/mixed-1k-simple-70pct', mixed1kSimple70pctJoiHandler)

  // 1K Simple 90% Valid Routes
  const mixed1kSimple90pctAtcharaHandler = await createAtcharaHandler(
    mixed1kSimple90pct.createSchemas
  )
  const mixed1kSimple90pctZodHandler = await createZodHandler(mixed1kSimple90pct.createSchemas)
  const mixed1kSimple90pctValibotHandler = await createValibotHandler(
    mixed1kSimple90pct.createSchemas
  )
  const mixed1kSimple90pctYupHandler = await createYupHandler(mixed1kSimple90pct.createSchemas)
  const mixed1kSimple90pctJoiHandler = await createJoiHandler(mixed1kSimple90pct.createSchemas)
  app.post('/validator/atchara/mixed-1k-simple-90pct', mixed1kSimple90pctAtcharaHandler)
  app.post('/validator/zod/mixed-1k-simple-90pct', mixed1kSimple90pctZodHandler)
  app.post('/validator/valibot/mixed-1k-simple-90pct', mixed1kSimple90pctValibotHandler)
  app.post('/validator/yup/mixed-1k-simple-90pct', mixed1kSimple90pctYupHandler)
  app.post('/validator/joi/mixed-1k-simple-90pct', mixed1kSimple90pctJoiHandler)

  // 1K Nested 70% Valid Routes
  const mixed1kNested70pctAtcharaHandler = await createAtcharaHandler(
    mixed1kNested70pct.createSchemas
  )
  const mixed1kNested70pctZodHandler = await createZodHandler(mixed1kNested70pct.createSchemas)
  const mixed1kNested70pctValibotHandler = await createValibotHandler(
    mixed1kNested70pct.createSchemas
  )
  const mixed1kNested70pctYupHandler = await createYupHandler(mixed1kNested70pct.createSchemas)
  const mixed1kNested70pctJoiHandler = await createJoiHandler(mixed1kNested70pct.createSchemas)
  app.post('/validator/atchara/mixed-1k-nested-70pct', mixed1kNested70pctAtcharaHandler)
  app.post('/validator/zod/mixed-1k-nested-70pct', mixed1kNested70pctZodHandler)
  app.post('/validator/valibot/mixed-1k-nested-70pct', mixed1kNested70pctValibotHandler)
  app.post('/validator/yup/mixed-1k-nested-70pct', mixed1kNested70pctYupHandler)
  app.post('/validator/joi/mixed-1k-nested-70pct', mixed1kNested70pctJoiHandler)

  // 1K Nested 90% Valid Routes
  const mixed1kNested90pctAtcharaHandler = await createAtcharaHandler(
    mixed1kNested90pct.createSchemas
  )
  const mixed1kNested90pctZodHandler = await createZodHandler(mixed1kNested90pct.createSchemas)
  const mixed1kNested90pctValibotHandler = await createValibotHandler(
    mixed1kNested90pct.createSchemas
  )
  const mixed1kNested90pctYupHandler = await createYupHandler(mixed1kNested90pct.createSchemas)
  const mixed1kNested90pctJoiHandler = await createJoiHandler(mixed1kNested90pct.createSchemas)
  app.post('/validator/atchara/mixed-1k-nested-90pct', mixed1kNested90pctAtcharaHandler)
  app.post('/validator/zod/mixed-1k-nested-90pct', mixed1kNested90pctZodHandler)
  app.post('/validator/valibot/mixed-1k-nested-90pct', mixed1kNested90pctValibotHandler)
  app.post('/validator/yup/mixed-1k-nested-90pct', mixed1kNested90pctYupHandler)
  app.post('/validator/joi/mixed-1k-nested-90pct', mixed1kNested90pctJoiHandler)

  // ============================================================================
  // DEFERRED EVALUATION ROUTES (Atchara only, no .toValue())
  // ============================================================================

  // Baseline Simple Deferred
  const throughputBaselineSimpleDeferredHandler = await createAtcharaDeferredHandler(
    throughputBaselineSimple.createSchemas
  )
  app.post(
    '/validator/atchara-deferred/throughput-baseline-simple',
    throughputBaselineSimpleDeferredHandler
  )

  // Baseline Nested Deferred
  const throughputBaselineNestedDeferredHandler = await createAtcharaDeferredHandler(
    throughputBaselineNested.createSchemas
  )
  app.post(
    '/validator/atchara-deferred/throughput-baseline-nested',
    throughputBaselineNestedDeferredHandler
  )

  // Scale 1K Numbers Deferred
  const throughput1kNumbersDeferredHandler = await createAtcharaDeferredHandler(
    throughput1kNumbers.createSchemas
  )
  app.post('/validator/atchara-deferred/throughput-1k-numbers', throughput1kNumbersDeferredHandler)

  // Scale 10K Numbers Deferred
  const throughput10kNumbersDeferredHandler = await createAtcharaDeferredHandler(
    throughput10kNumbers.createSchemas
  )
  app.post(
    '/validator/atchara-deferred/throughput-10k-numbers',
    throughput10kNumbersDeferredHandler
  )

  // Deep Nesting Deferred
  const throughputDeepNestingDeferredHandler = await createAtcharaDeferredHandler(
    throughputDeepNesting.createSchemas
  )
  app.post(
    '/validator/atchara-deferred/throughput-deep-nesting',
    throughputDeepNestingDeferredHandler
  )

  // Large Single Object Deferred
  const throughputLargeSingleObjectDeferredHandler = await createAtcharaDeferredHandler(
    throughputLargeSingleObject.createSchemas
  )
  app.post(
    '/validator/atchara-deferred/throughput-large-single-object',
    throughputLargeSingleObjectDeferredHandler
  )

  // Mixed Types Deferred
  const throughputMixedTypesDeferredHandler = await createAtcharaDeferredHandler(
    throughputMixedTypes.createSchemas
  )
  app.post(
    '/validator/atchara-deferred/throughput-mixed-types',
    throughputMixedTypesDeferredHandler
  )

  // Nullable Optional Deferred
  const throughputNullableOptionalDeferredHandler = await createAtcharaDeferredHandler(
    throughputNullableOptional.createSchemas
  )
  app.post(
    '/validator/atchara-deferred/throughput-nullable-optional',
    throughputNullableOptionalDeferredHandler
  )

  // String Heavy Deferred
  const throughputStringHeavyDeferredHandler = await createAtcharaDeferredHandler(
    throughputStringHeavy.createSchemas
  )
  app.post(
    '/validator/atchara-deferred/throughput-string-heavy',
    throughputStringHeavyDeferredHandler
  )

  // Wide Object Deferred
  const throughputWideObjectDeferredHandler = await createAtcharaDeferredHandler(
    throughputWideObject.createSchemas
  )
  app.post(
    '/validator/atchara-deferred/throughput-wide-object',
    throughputWideObjectDeferredHandler
  )

  // ============================================================================
  // VALIDATION TESTS - DEFERRED
  // ============================================================================

  // Early Field Failure Deferred
  const validationEarlyFieldDeferredHandler = await createAtcharaDeferredHandler(
    validationEarlyField.createSchemas
  )
  app.post(
    '/validator/atchara-deferred/validation-fail-early-field',
    validationEarlyFieldDeferredHandler
  )

  // Mid-Array Failure Deferred
  const validationMidArrayDeferredHandler = await createAtcharaDeferredHandler(
    validationMidArray.createSchemas
  )
  app.post(
    '/validator/atchara-deferred/validation-fail-mid-array',
    validationMidArrayDeferredHandler
  )

  // Deep Nested Failure Deferred
  const validationFailDeepNestedDeferredHandler = await createAtcharaDeferredHandler(
    validationFailDeepNested.createSchemas
  )
  app.post(
    '/validator/atchara-deferred/validation-fail-deep-nested',
    validationFailDeepNestedDeferredHandler
  )

  // Late Failure Deferred
  const validationFailLateDeferredHandler = await createAtcharaDeferredHandler(
    validationFailLate.createSchemas
  )
  app.post('/validator/atchara-deferred/validation-fail-late', validationFailLateDeferredHandler)

  // ============================================================================
  // MIXED VALIDITY TESTS - DEFERRED
  // ============================================================================

  // 1K Simple 70% Valid Deferred
  const mixed1kSimple70pctDeferredHandler = await createAtcharaDeferredHandler(
    mixed1kSimple70pct.createSchemas
  )
  app.post('/validator/atchara-deferred/mixed-1k-simple-70pct', mixed1kSimple70pctDeferredHandler)

  // 1K Simple 90% Valid Deferred
  const mixed1kSimple90pctDeferredHandler = await createAtcharaDeferredHandler(
    mixed1kSimple90pct.createSchemas
  )
  app.post('/validator/atchara-deferred/mixed-1k-simple-90pct', mixed1kSimple90pctDeferredHandler)

  // 1K Nested 70% Valid Deferred
  const mixed1kNested70pctDeferredHandler = await createAtcharaDeferredHandler(
    mixed1kNested70pct.createSchemas
  )
  app.post('/validator/atchara-deferred/mixed-1k-nested-70pct', mixed1kNested70pctDeferredHandler)

  // 1K Nested 90% Valid Deferred
  const mixed1kNested90pctDeferredHandler = await createAtcharaDeferredHandler(
    mixed1kNested90pct.createSchemas
  )
  app.post('/validator/atchara-deferred/mixed-1k-nested-90pct', mixed1kNested90pctDeferredHandler)

  // healthcheck
  app.get('/healthcheck', (c) => c.json('success', 200))
}

// Initialize routes before exporting
await setupRoutes()

// Start server
const port = process.env.PORT ? parseInt(process.env.PORT) : 3000

export default {
  port,
  fetch: app.fetch,
}
