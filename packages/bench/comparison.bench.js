/* eslint-disable @typescript-eslint/no-unsafe-assignment */

import { bench, describe } from 'vitest'
import * as v from 'valibot'

// ============================================================================
// THROUGHPUT TESTS: Pure valid data benchmarks measuring parsing speed
// ============================================================================

// Throughput - Baseline Simple
import {
  createSchemas as createThroughputBaselineSimpleSchemas,
  testDataStr as throughputBaselineSimpleTestData,
} from './scenarios/throughput-baseline-simple.js'

// Throughput - Baseline Nested
import {
  createSchemas as createThroughputBaselineNestedSchemas,
  testDataStr as throughputBaselineNestedTestData,
} from './scenarios/throughput-baseline-nested.js'

// Throughput - Scale 1K Numbers
import {
  createSchemas as createThroughput1kNumbersSchemas,
  testDataStr as throughput1kNumbersTestData,
} from './scenarios/throughput-1k-numbers.js'

// Throughput - Scale 10K Numbers
import {
  createSchemas as createThroughput10kNumbersSchemas,
  testDataStr as throughput10kNumbersTestData,
} from './scenarios/throughput-10k-numbers.js'

// Throughput - Complexity: Deep Nesting
import {
  createSchemas as createThroughputDeepNestingSchemas,
  testDataStr as throughputDeepNestingTestData,
} from './scenarios/throughput-deep-nesting.js'

// Throughput - Complexity: Wide Object
import {
  createSchemas as createThroughputWideObjectSchemas,
  testDataStr as throughputWideObjectTestData,
} from './scenarios/throughput-wide-object.js'

// Throughput - Complexity: String Heavy
import {
  createSchemas as createThroughputStringHeavySchemas,
  testDataStr as throughputStringHeavyTestData,
} from './scenarios/throughput-string-heavy.js'

// Throughput - Complexity: Large Single Object
import {
  createSchemas as createThroughputLargeSingleObjectSchemas,
  testDataStr as throughputLargeSingleObjectTestData,
} from './scenarios/throughput-large-single-object.js'

// Throughput - Complexity: Nullable and Optional Fields
import {
  createSchemas as createThroughputNullableOptionalSchemas,
  testDataStr as throughputNullableOptionalTestData,
} from './scenarios/throughput-nullable-optional.js'

// Throughput - Complexity: Mixed Field Types
import {
  createSchemas as createThroughputMixedTypesSchemas,
  testDataStr as throughputMixedTypesTestData,
} from './scenarios/throughput-mixed-types.js'

// ============================================================================
// VALIDATION TESTS: Invalid data benchmarks measuring fail-fast behavior
// ============================================================================

// Validation - Early Field Failure
import {
  createSchemas as createValidationEarlyFieldSchemas,
  testDataStr as validationEarlyFieldTestData,
} from './scenarios/validation-fail-early-field.js'

// Validation - Mid-Array Failure
import {
  createSchemas as createValidationMidArraySchemas,
  testDataStr as validationMidArrayTestData,
} from './scenarios/validation-fail-mid-array.js'

// Validation - Late Invalid Item
import {
  createSchemas as createValidationFailLateSchemas,
  testDataStr as validationFailLateTestData,
} from './scenarios/validation-fail-late.js'

// Validation - Deep Nested Invalid
import {
  createSchemas as createValidationFailDeepNestedSchemas,
  testDataStr as validationFailDeepNestedTestData,
} from './scenarios/validation-fail-deep-nested.js'

// ============================================================================
// MIXED VALIDITY TESTS: Real-world data quality scenarios
// ============================================================================

// Mixed - 1K Simple 70% Valid
import {
  createSchemas as createMixed1kSimple70pctSchemas,
  getNextPayloadStr as getMixed1kSimple70pctPayloadStr,
  getNextPayloadBytes as getMixed1kSimple70pctPayloadBytes,
} from './scenarios/mixed-1k-simple-70pct.js'

// Mixed - 1K Simple 90% Valid
import {
  createSchemas as createMixed1kSimple90pctSchemas,
  getNextPayloadStr as getMixed1kSimple90pctPayloadStr,
  getNextPayloadBytes as getMixed1kSimple90pctPayloadBytes,
} from './scenarios/mixed-1k-simple-90pct.js'

// Mixed - 1K Nested 70% Valid
import {
  createSchemas as createMixed1kNested70pctSchemas,
  getNextPayloadStr as getMixed1kNested70pctPayloadStr,
  getNextPayloadBytes as getMixed1kNested70pctPayloadBytes,
} from './scenarios/mixed-1k-nested-70pct.js'

// Mixed - 1K Nested 90% Valid
import {
  createSchemas as createMixed1kNested90pctSchemas,
  getNextPayloadStr as getMixed1kNested90pctPayloadStr,
  getNextPayloadBytes as getMixed1kNested90pctPayloadBytes,
} from './scenarios/mixed-1k-nested-90pct.js'

// Throughput - Union: Primitives
import {
  createSchemas as createThroughputUnionPrimitivesSchemas,
  testDataStr as throughputUnionPrimitivesTestData,
} from './scenarios/throughput-union-primitives.js'

// Throughput - Union: Discriminated
import {
  createSchemas as createThroughputUnionDiscriminatedSchemas,
  testDataStr as throughputUnionDiscriminatedTestData,
} from './scenarios/throughput-union-discriminated.js'

// Throughput - Union: Objects
import {
  createSchemas as createThroughputUnionObjectsSchemas,
  testDataStr as throughputUnionObjectsTestData,
} from './scenarios/throughput-union-objects.js'

// Constraint Scaling - Array 1K
import {
  createSchemas as createConstrainedArray1kSchemas,
  testDataStr as constrainedArray1kTestData,
} from './scenarios/throughput-constrained-array-1k.js'

// Constraint Scaling - Array 10K
import {
  createSchemas as createConstrainedArray10kSchemas,
  testDataStr as constrainedArray10kTestData,
} from './scenarios/throughput-constrained-array-10k.js'

// Constraint Scaling - Array 50K
import {
  createSchemas as createConstrainedArray50kSchemas,
  testDataStr as constrainedArray50kTestData,
} from './scenarios/throughput-constrained-array-50k.js'

// Constraint Scaling - Record 1K
import {
  createSchemas as createConstrainedRecord1kSchemas,
  testDataStr as constrainedRecord1kTestData,
} from './scenarios/throughput-constrained-record-1k.js'

// Constraint Scaling - Record 10K
import {
  createSchemas as createConstrainedRecord10kSchemas,
  testDataStr as constrainedRecord10kTestData,
} from './scenarios/throughput-constrained-record-10k.js'

// Constraint Scaling - Record 50K
import {
  createSchemas as createConstrainedRecord50kSchemas,
  testDataStr as constrainedRecord50kTestData,
} from './scenarios/throughput-constrained-record-50k.js'

// Validation - Union Failure
import {
  createSchemas as createValidationFailUnionSchemas,
  testDataStr as validationFailUnionTestData,
} from './scenarios/validation-fail-union.js'

const textEncoder = new TextEncoder()
const throughputBaselineSimpleTestBytes = textEncoder.encode(throughputBaselineSimpleTestData)
const throughputBaselineNestedTestBytes = textEncoder.encode(throughputBaselineNestedTestData)
const throughput1kNumbersTestBytes = textEncoder.encode(throughput1kNumbersTestData)
const throughput10kNumbersTestBytes = textEncoder.encode(throughput10kNumbersTestData)
const validationEarlyFieldTestBytes = textEncoder.encode(validationEarlyFieldTestData)
const validationMidArrayTestBytes = textEncoder.encode(validationMidArrayTestData)
const throughputDeepNestingTestBytes = textEncoder.encode(throughputDeepNestingTestData)
const throughputWideObjectTestBytes = textEncoder.encode(throughputWideObjectTestData)
const throughputStringHeavyTestBytes = textEncoder.encode(throughputStringHeavyTestData)
const throughputLargeSingleObjectTestBytes = textEncoder.encode(throughputLargeSingleObjectTestData)
const validationFailLateTestBytes = textEncoder.encode(validationFailLateTestData)
const validationFailDeepNestedTestBytes = textEncoder.encode(validationFailDeepNestedTestData)
const throughputNullableOptionalTestBytes = textEncoder.encode(throughputNullableOptionalTestData)
const throughputMixedTypesTestBytes = textEncoder.encode(throughputMixedTypesTestData)
const throughputUnionPrimitivesTestBytes = textEncoder.encode(throughputUnionPrimitivesTestData)
const throughputUnionDiscriminatedTestBytes = textEncoder.encode(
  throughputUnionDiscriminatedTestData
)
const throughputUnionObjectsTestBytes = textEncoder.encode(throughputUnionObjectsTestData)
const validationFailUnionTestBytes = textEncoder.encode(validationFailUnionTestData)
const constrainedArray1kTestBytes = textEncoder.encode(constrainedArray1kTestData)
const constrainedArray10kTestBytes = textEncoder.encode(constrainedArray10kTestData)
const constrainedArray50kTestBytes = textEncoder.encode(constrainedArray50kTestData)
const constrainedRecord1kTestBytes = textEncoder.encode(constrainedRecord1kTestData)
const constrainedRecord10kTestBytes = textEncoder.encode(constrainedRecord10kTestData)
const constrainedRecord50kTestBytes = textEncoder.encode(constrainedRecord50kTestData)

// ============================================================================
// THROUGHPUT TESTS
// ============================================================================
describe('Throughput Tests', () => {
  describe('Baseline - Simple Object', async () => {
    const { atcharaSchema, zodSchema, valibotSchema, yupSchema, joiSchema } =
      await createThroughputBaselineSimpleSchemas(false)

    bench('Atchara (Deferred)', () => {
      atcharaSchema.parse(throughputBaselineSimpleTestBytes)
    })

    bench('Atchara (Full Decode)', async () => {
      await atcharaSchema.parse(throughputBaselineSimpleTestBytes).toValue()
    })

    if (zodSchema) {
      bench('Zod', () => {
        const data = JSON.parse(throughputBaselineSimpleTestData)
        zodSchema.parse(data)
      })
    }

    if (valibotSchema) {
      bench('Valibot', () => {
        const data = JSON.parse(throughputBaselineSimpleTestData)
        v.parse(valibotSchema, data)
      })
    }

    if (yupSchema) {
      bench('Yup', () => {
        const data = JSON.parse(throughputBaselineSimpleTestData)
        yupSchema.validateSync(data)
      })
    }

    if (joiSchema) {
      bench('Joi', () => {
        const data = JSON.parse(throughputBaselineSimpleTestData)
        joiSchema.validate(data, { cache: false })
      })
    }
  })

  describe('Baseline - Nested Objects', async () => {
    const { atcharaSchema, zodSchema, valibotSchema, yupSchema, joiSchema } =
      await createThroughputBaselineNestedSchemas(false)

    bench('Atchara (Deferred)', () => {
      atcharaSchema.parse(throughputBaselineNestedTestBytes)
    })

    bench('Atchara (Full Decode)', async () => {
      await atcharaSchema.parse(throughputBaselineNestedTestBytes).toValue()
    })

    if (zodSchema) {
      bench('Zod', () => {
        const data = JSON.parse(throughputBaselineNestedTestData)
        zodSchema.parse(data)
      })
    }

    if (valibotSchema) {
      bench('Valibot', () => {
        const data = JSON.parse(throughputBaselineNestedTestData)
        v.parse(valibotSchema, data)
      })
    }

    if (yupSchema) {
      bench('Yup', () => {
        const data = JSON.parse(throughputBaselineNestedTestData)
        yupSchema.validateSync(data)
      })
    }

    if (joiSchema) {
      bench('Joi', () => {
        const data = JSON.parse(throughputBaselineNestedTestData)
        joiSchema.validate(data, { cache: false })
      })
    }
  })

  describe('Scale - 1K Number Objects', async () => {
    const { atcharaSchema, zodSchema, valibotSchema, yupSchema, joiSchema } =
      await createThroughput1kNumbersSchemas(false)

    bench('Atchara (Deferred)', () => {
      atcharaSchema.parse(throughput1kNumbersTestBytes)
    })

    bench('Atchara (Full Decode)', async () => {
      await atcharaSchema.parse(throughput1kNumbersTestBytes).toValue()
    })

    if (zodSchema) {
      bench('Zod', () => {
        const data = JSON.parse(throughput1kNumbersTestData)
        zodSchema.parse(data)
      })
    }

    if (valibotSchema) {
      bench('Valibot', () => {
        const data = JSON.parse(throughput1kNumbersTestData)
        v.parse(valibotSchema, data)
      })
    }

    if (yupSchema) {
      bench('Yup', () => {
        const data = JSON.parse(throughput1kNumbersTestData)
        yupSchema.validateSync(data)
      })
    }

    if (joiSchema) {
      bench('Joi', () => {
        const data = JSON.parse(throughput1kNumbersTestData)
        joiSchema.validate(data, { cache: false })
      })
    }
  })

  describe('Scale - 10K Number Objects', async () => {
    const { atcharaSchema, zodSchema, valibotSchema, yupSchema, joiSchema } =
      await createThroughput10kNumbersSchemas(false)

    bench('Atchara (Deferred)', () => {
      atcharaSchema.parse(throughput10kNumbersTestBytes)
    })

    bench('Atchara (Full Decode)', async () => {
      await atcharaSchema.parse(throughput10kNumbersTestBytes).toValue()
    })

    if (zodSchema) {
      bench('Zod', () => {
        const data = JSON.parse(throughput10kNumbersTestData)
        zodSchema.parse(data)
      })
    }

    if (valibotSchema) {
      bench('Valibot', () => {
        const data = JSON.parse(throughput10kNumbersTestData)
        v.parse(valibotSchema, data)
      })
    }

    if (yupSchema) {
      bench('Yup', () => {
        const data = JSON.parse(throughput10kNumbersTestData)
        yupSchema.validateSync(data)
      })
    }

    if (joiSchema) {
      bench('Joi', () => {
        const data = JSON.parse(throughput10kNumbersTestData)
        joiSchema.validate(data, { cache: false })
      })
    }
  })

  describe('Overhead Analysis', async () => {
    const { atcharaSchema, zodSchema, valibotSchema, yupSchema, joiSchema } =
      await createThroughputBaselineNestedSchemas(false)

    describe('Many Iterations', () => {
      bench('Atchara (Deferred)', () => {
        for (let i = 0; i < 1000; i++) {
          atcharaSchema.parse(throughputBaselineNestedTestBytes)
        }
      })

      bench('Atchara (Full Decode)', async () => {
        for (let i = 0; i < 1000; i++) {
          await atcharaSchema.parse(throughputBaselineNestedTestBytes).toValue()
        }
      })

      if (zodSchema) {
        bench('Zod', () => {
          for (let i = 0; i < 1000; i++) {
            const data = JSON.parse(throughputBaselineNestedTestData)
            zodSchema.parse(data)
          }
        })
      }

      if (valibotSchema) {
        bench('Valibot', () => {
          for (let i = 0; i < 1000; i++) {
            const data = JSON.parse(throughputBaselineNestedTestData)
            v.parse(valibotSchema, data)
          }
        })
      }

      if (yupSchema) {
        bench('Yup', () => {
          for (let i = 0; i < 1000; i++) {
            const data = JSON.parse(throughputBaselineNestedTestData)
            yupSchema.validateSync(data)
          }
        })
      }

      if (joiSchema) {
        bench('Joi', () => {
          for (let i = 0; i < 1000; i++) {
            const data = JSON.parse(throughputBaselineNestedTestData)
            joiSchema.validate(data, { cache: false })
          }
        })
      }
    })

    describe('Large Payload', () => {
      bench('Atchara (Deferred)', () => {
        atcharaSchema.parse(throughputBaselineNestedTestBytes)
      })

      bench('Atchara (Full Decode)', async () => {
        await atcharaSchema.parse(throughputBaselineNestedTestBytes).toValue()
      })

      if (zodSchema) {
        bench('Zod', () => {
          const data = JSON.parse(throughputBaselineNestedTestData)
          zodSchema.parse(data)
        })
      }

      if (valibotSchema) {
        bench('Valibot', () => {
          const data = JSON.parse(throughputBaselineNestedTestData)
          v.parse(valibotSchema, data)
        })
      }

      if (yupSchema) {
        bench('Yup', () => {
          const data = JSON.parse(throughputBaselineNestedTestData)
          yupSchema.validateSync(data)
        })
      }

      if (joiSchema) {
        bench('Joi', () => {
          const data = JSON.parse(throughputBaselineNestedTestData)
          joiSchema.validate(data, { cache: false })
        })
      }
    })
  })

  describe('Complexity - Deep Nesting (10 levels)', async () => {
    const { atcharaSchema, zodSchema, valibotSchema, yupSchema, joiSchema } =
      await createThroughputDeepNestingSchemas(false)

    bench('Atchara (Deferred)', () => {
      atcharaSchema.parse(throughputDeepNestingTestBytes)
    })

    bench('Atchara (Full Decode)', async () => {
      await atcharaSchema.parse(throughputDeepNestingTestBytes).toValue()
    })

    if (zodSchema) {
      bench('Zod', () => {
        const data = JSON.parse(throughputDeepNestingTestData)
        zodSchema.parse(data)
      })
    }

    if (valibotSchema) {
      bench('Valibot', () => {
        const data = JSON.parse(throughputDeepNestingTestData)
        v.parse(valibotSchema, data)
      })
    }

    if (yupSchema) {
      bench('Yup', () => {
        const data = JSON.parse(throughputDeepNestingTestData)
        yupSchema.validateSync(data)
      })
    }

    if (joiSchema) {
      bench('Joi', () => {
        const data = JSON.parse(throughputDeepNestingTestData)
        joiSchema.validate(data, { cache: false })
      })
    }
  })

  describe('Complexity - Wide Object (100 fields)', async () => {
    const { atcharaSchema, zodSchema, valibotSchema, yupSchema, joiSchema } =
      await createThroughputWideObjectSchemas(false)

    bench('Atchara (Deferred)', () => {
      atcharaSchema.parse(throughputWideObjectTestBytes)
    })

    bench('Atchara (Full Decode)', async () => {
      await atcharaSchema.parse(throughputWideObjectTestBytes).toValue()
    })

    if (zodSchema) {
      bench('Zod', () => {
        const data = JSON.parse(throughputWideObjectTestData)
        zodSchema.parse(data)
      })
    }

    if (valibotSchema) {
      bench('Valibot', () => {
        const data = JSON.parse(throughputWideObjectTestData)
        v.parse(valibotSchema, data)
      })
    }

    if (yupSchema) {
      bench('Yup', () => {
        const data = JSON.parse(throughputWideObjectTestData)
        yupSchema.validateSync(data)
      })
    }

    if (joiSchema) {
      bench('Joi', () => {
        const data = JSON.parse(throughputWideObjectTestData)
        joiSchema.validate(data, { cache: false })
      })
    }
  })

  describe('Complexity - String-Heavy', async () => {
    const { atcharaSchema, zodSchema, valibotSchema, yupSchema, joiSchema } =
      await createThroughputStringHeavySchemas(false)

    bench('Atchara (Deferred)', () => {
      atcharaSchema.parse(throughputStringHeavyTestBytes)
    })

    bench('Atchara (Full Decode)', async () => {
      await atcharaSchema.parse(throughputStringHeavyTestBytes).toValue()
    })

    if (zodSchema) {
      bench('Zod', () => {
        const data = JSON.parse(throughputStringHeavyTestData)
        zodSchema.parse(data)
      })
    }

    if (valibotSchema) {
      bench('Valibot', () => {
        const data = JSON.parse(throughputStringHeavyTestData)
        v.parse(valibotSchema, data)
      })
    }

    if (yupSchema) {
      bench('Yup', () => {
        const data = JSON.parse(throughputStringHeavyTestData)
        yupSchema.validateSync(data)
      })
    }

    if (joiSchema) {
      bench('Joi', () => {
        const data = JSON.parse(throughputStringHeavyTestData)
        joiSchema.validate(data, { cache: false })
      })
    }
  })

  describe('Complexity - Large Single Object', async () => {
    const { atcharaSchema, zodSchema, valibotSchema, yupSchema, joiSchema } =
      await createThroughputLargeSingleObjectSchemas(false)

    bench('Atchara (Deferred)', () => {
      atcharaSchema.parse(throughputLargeSingleObjectTestBytes)
    })

    bench('Atchara (Full Decode)', async () => {
      await atcharaSchema.parse(throughputLargeSingleObjectTestBytes).toValue()
    })

    if (zodSchema) {
      bench('Zod', () => {
        const data = JSON.parse(throughputLargeSingleObjectTestData)
        zodSchema.parse(data)
      })
    }

    if (valibotSchema) {
      bench('Valibot', () => {
        const data = JSON.parse(throughputLargeSingleObjectTestData)
        v.parse(valibotSchema, data)
      })
    }

    if (yupSchema) {
      bench('Yup', () => {
        const data = JSON.parse(throughputLargeSingleObjectTestData)
        yupSchema.validateSync(data)
      })
    }

    if (joiSchema) {
      bench('Joi', () => {
        const data = JSON.parse(throughputLargeSingleObjectTestData)
        joiSchema.validate(data, { cache: false })
      })
    }
  })

  describe('Complexity - Nullable and Optional Fields', async () => {
    const { atcharaSchema, zodSchema, valibotSchema, yupSchema, joiSchema } =
      await createThroughputNullableOptionalSchemas(false)

    bench('Atchara (Deferred)', () => {
      atcharaSchema.parse(throughputNullableOptionalTestBytes)
    })

    bench('Atchara (Full Decode)', async () => {
      await atcharaSchema.parse(throughputNullableOptionalTestBytes).toValue()
    })

    if (zodSchema) {
      bench('Zod', () => {
        const data = JSON.parse(throughputNullableOptionalTestData)
        zodSchema.parse(data)
      })
    }

    if (valibotSchema) {
      bench('Valibot', () => {
        const data = JSON.parse(throughputNullableOptionalTestData)
        v.parse(valibotSchema, data)
      })
    }

    if (yupSchema) {
      bench('Yup', () => {
        const data = JSON.parse(throughputNullableOptionalTestData)
        yupSchema.validateSync(data)
      })
    }

    if (joiSchema) {
      bench('Joi', () => {
        const data = JSON.parse(throughputNullableOptionalTestData)
        joiSchema.validate(data, { cache: false })
      })
    }
  })

  describe('Complexity - Mixed Field Types', async () => {
    const { atcharaSchema, zodSchema, valibotSchema, yupSchema, joiSchema } =
      await createThroughputMixedTypesSchemas(false)

    bench('Atchara (Deferred)', () => {
      atcharaSchema.parse(throughputMixedTypesTestBytes)
    })

    bench('Atchara (Full Decode)', async () => {
      await atcharaSchema.parse(throughputMixedTypesTestBytes).toValue()
    })

    if (zodSchema) {
      bench('Zod', () => {
        const data = JSON.parse(throughputMixedTypesTestData)
        zodSchema.parse(data)
      })
    }

    if (valibotSchema) {
      bench('Valibot', () => {
        const data = JSON.parse(throughputMixedTypesTestData)
        v.parse(valibotSchema, data)
      })
    }

    if (yupSchema) {
      bench('Yup', () => {
        const data = JSON.parse(throughputMixedTypesTestData)
        yupSchema.validateSync(data)
      })
    }

    if (joiSchema) {
      bench('Joi', () => {
        const data = JSON.parse(throughputMixedTypesTestData)
        joiSchema.validate(data, { cache: false })
      })
    }
  })

  describe('Union - Primitives (1K items)', async () => {
    const { atcharaSchema, zodSchema, valibotSchema, yupSchema, joiSchema } =
      await createThroughputUnionPrimitivesSchemas(false)

    bench('Atchara (Deferred)', () => {
      atcharaSchema.parse(throughputUnionPrimitivesTestBytes)
    })

    bench('Atchara (Full Decode)', async () => {
      await atcharaSchema.parse(throughputUnionPrimitivesTestBytes).toValue()
    })

    if (zodSchema) {
      bench('Zod', () => {
        const data = JSON.parse(throughputUnionPrimitivesTestData)
        zodSchema.parse(data)
      })
    }

    if (valibotSchema) {
      bench('Valibot', () => {
        const data = JSON.parse(throughputUnionPrimitivesTestData)
        v.parse(valibotSchema, data)
      })
    }

    if (yupSchema) {
      bench('Yup', () => {
        const data = JSON.parse(throughputUnionPrimitivesTestData)
        yupSchema.validateSync(data)
      })
    }

    if (joiSchema) {
      bench('Joi', () => {
        const data = JSON.parse(throughputUnionPrimitivesTestData)
        joiSchema.validate(data, { cache: false })
      })
    }
  })

  describe('Union - Discriminated (1K items)', async () => {
    const { atcharaSchema, zodSchema, valibotSchema, yupSchema, joiSchema } =
      await createThroughputUnionDiscriminatedSchemas(false)

    bench('Atchara (Deferred)', () => {
      atcharaSchema.parse(throughputUnionDiscriminatedTestBytes)
    })

    bench('Atchara (Full Decode)', async () => {
      await atcharaSchema.parse(throughputUnionDiscriminatedTestBytes).toValue()
    })

    if (zodSchema) {
      bench('Zod', () => {
        const data = JSON.parse(throughputUnionDiscriminatedTestData)
        zodSchema.parse(data)
      })
    }

    if (valibotSchema) {
      bench('Valibot', () => {
        const data = JSON.parse(throughputUnionDiscriminatedTestData)
        v.parse(valibotSchema, data)
      })
    }

    if (yupSchema) {
      bench('Yup', () => {
        const data = JSON.parse(throughputUnionDiscriminatedTestData)
        yupSchema.validateSync(data)
      })
    }

    if (joiSchema) {
      bench('Joi', () => {
        const data = JSON.parse(throughputUnionDiscriminatedTestData)
        joiSchema.validate(data, { cache: false })
      })
    }
  })

  describe('Union - Objects (1K items)', async () => {
    const { atcharaSchema, zodSchema, valibotSchema, yupSchema, joiSchema } =
      await createThroughputUnionObjectsSchemas(false)

    bench('Atchara (Deferred)', () => {
      atcharaSchema.parse(throughputUnionObjectsTestBytes)
    })

    bench('Atchara (Full Decode)', async () => {
      await atcharaSchema.parse(throughputUnionObjectsTestBytes).toValue()
    })

    if (zodSchema) {
      bench('Zod', () => {
        const data = JSON.parse(throughputUnionObjectsTestData)
        zodSchema.parse(data)
      })
    }

    if (valibotSchema) {
      bench('Valibot', () => {
        const data = JSON.parse(throughputUnionObjectsTestData)
        v.parse(valibotSchema, data)
      })
    }

    if (yupSchema) {
      bench('Yup', () => {
        const data = JSON.parse(throughputUnionObjectsTestData)
        yupSchema.validateSync(data)
      })
    }

    if (joiSchema) {
      bench('Joi', () => {
        const data = JSON.parse(throughputUnionObjectsTestData)
        joiSchema.validate(data, { cache: false })
      })
    }
  })
})

// ============================================================================
// VALIDATION TESTS
// ============================================================================
describe('Validation Tests', async () => {
  const {
    atcharaSchema: atcharaEarlySchema,
    zodSchema: zodEarlySchema,
    valibotSchema: valibotEarlySchema,
    yupSchema: yupEarlySchema,
    joiSchema: joiEarlySchema,
  } = await createValidationEarlyFieldSchemas(false)

  const {
    atcharaSchema: atcharaMidSchema,
    zodSchema: zodMidSchema,
    valibotSchema: valibotMidSchema,
    yupSchema: yupMidSchema,
    joiSchema: joiMidSchema,
  } = await createValidationMidArraySchemas(false)

  const {
    atcharaSchema: atcharaLateSchema,
    zodSchema: zodLateSchema,
    valibotSchema: valibotLateSchema,
    yupSchema: yupLateSchema,
    joiSchema: joiLateSchema,
  } = await createValidationFailLateSchemas(false)

  const {
    atcharaSchema: atcharaDeepSchema,
    zodSchema: zodDeepSchema,
    valibotSchema: valibotDeepSchema,
    yupSchema: yupDeepSchema,
    joiSchema: joiDeepSchema,
  } = await createValidationFailDeepNestedSchemas(false)

  const {
    atcharaSchema: atcharaUnionSchema,
    zodSchema: zodUnionSchema,
    valibotSchema: valibotUnionSchema,
    yupSchema: yupUnionSchema,
    joiSchema: joiUnionSchema,
  } = await createValidationFailUnionSchemas(false)

  describe('Fail-Fast - Early Invalid Field', () => {
    bench('Atchara (Deferred)', () => {
      try {
        atcharaEarlySchema.parse(validationEarlyFieldTestBytes)
      } catch {
        // Expected to fail
      }
    })

    bench('Atchara (Full Decode)', async () => {
      try {
        await atcharaEarlySchema.parse(validationEarlyFieldTestBytes).toValue()
      } catch {
        // Expected to fail
      }
    })

    if (zodEarlySchema) {
      bench('Zod', () => {
        try {
          const data = JSON.parse(validationEarlyFieldTestData)
          zodEarlySchema.parse(data)
        } catch {
          // Expected to fail
        }
      })
    }

    if (valibotEarlySchema) {
      bench('Valibot', () => {
        try {
          const data = JSON.parse(validationEarlyFieldTestData)
          v.parse(valibotEarlySchema, data)
        } catch {
          // Expected to fail
        }
      })
    }

    if (yupEarlySchema) {
      bench('Yup', () => {
        try {
          const data = JSON.parse(validationEarlyFieldTestData)
          yupEarlySchema.validateSync(data)
        } catch {
          // Expected to fail
        }
      })
    }

    if (joiEarlySchema) {
      bench('Joi', () => {
        try {
          const data = JSON.parse(validationEarlyFieldTestData)
          joiEarlySchema.validate(data)
        } catch {
          // Expected to fail
        }
      })
    }
  })

  describe('Fail-Fast - Mid-Array Invalid', () => {
    bench('Atchara (Deferred)', () => {
      try {
        atcharaMidSchema.parse(validationMidArrayTestBytes)
      } catch {
        // Expected to fail
      }
    })

    bench('Atchara (Full Decode)', async () => {
      try {
        await atcharaMidSchema.parse(validationMidArrayTestBytes).toValue()
      } catch {
        // Expected to fail
      }
    })

    if (zodMidSchema) {
      bench('Zod', () => {
        try {
          const data = JSON.parse(validationMidArrayTestData)
          zodMidSchema.parse(data)
        } catch {
          // Expected to fail
        }
      })
    }

    if (valibotMidSchema) {
      bench('Valibot', () => {
        try {
          const data = JSON.parse(validationMidArrayTestData)
          v.parse(valibotMidSchema, data)
        } catch {
          // Expected to fail
        }
      })
    }

    if (yupMidSchema) {
      bench('Yup', () => {
        try {
          const data = JSON.parse(validationMidArrayTestData)
          yupMidSchema.validateSync(data)
        } catch {
          // Expected to fail
        }
      })
    }

    if (joiMidSchema) {
      bench('Joi', () => {
        try {
          const data = JSON.parse(validationMidArrayTestData)
          joiMidSchema.validate(data)
        } catch {
          // Expected to fail
        }
      })
    }
  })

  describe('Fail-Fast - Late Invalid Item (index 999/1000)', () => {
    bench('Atchara (Deferred)', () => {
      try {
        atcharaLateSchema.parse(validationFailLateTestBytes)
      } catch {
        // Expected to fail
      }
    })

    bench('Atchara (Full Decode)', async () => {
      try {
        await atcharaLateSchema.parse(validationFailLateTestBytes).toValue()
      } catch {
        // Expected to fail
      }
    })

    if (zodLateSchema) {
      bench('Zod', () => {
        try {
          const data = JSON.parse(validationFailLateTestData)
          zodLateSchema.parse(data)
        } catch {
          // Expected to fail
        }
      })
    }

    if (valibotLateSchema) {
      bench('Valibot', () => {
        try {
          const data = JSON.parse(validationFailLateTestData)
          v.parse(valibotLateSchema, data)
        } catch {
          // Expected to fail
        }
      })
    }

    if (yupLateSchema) {
      bench('Yup', () => {
        try {
          const data = JSON.parse(validationFailLateTestData)
          yupLateSchema.validateSync(data)
        } catch {
          // Expected to fail
        }
      })
    }

    if (joiLateSchema) {
      bench('Joi', () => {
        try {
          const data = JSON.parse(validationFailLateTestData)
          joiLateSchema.validate(data)
        } catch {
          // Expected to fail
        }
      })
    }
  })

  describe('Fail-Fast - Deep Nested Invalid (10 levels deep)', () => {
    bench('Atchara (Deferred)', () => {
      try {
        atcharaDeepSchema.parse(validationFailDeepNestedTestBytes)
      } catch {
        // Expected to fail
      }
    })

    bench('Atchara (Full Decode)', async () => {
      try {
        await atcharaDeepSchema.parse(validationFailDeepNestedTestBytes).toValue()
      } catch {
        // Expected to fail
      }
    })

    if (zodDeepSchema) {
      bench('Zod', () => {
        try {
          const data = JSON.parse(validationFailDeepNestedTestData)
          zodDeepSchema.parse(data)
        } catch {
          // Expected to fail
        }
      })
    }

    if (valibotDeepSchema) {
      bench('Valibot', () => {
        try {
          const data = JSON.parse(validationFailDeepNestedTestData)
          v.parse(valibotDeepSchema, data)
        } catch {
          // Expected to fail
        }
      })
    }

    if (yupDeepSchema) {
      bench('Yup', () => {
        try {
          const data = JSON.parse(validationFailDeepNestedTestData)
          yupDeepSchema.validateSync(data)
        } catch {
          // Expected to fail
        }
      })
    }

    if (joiDeepSchema) {
      bench('Joi', () => {
        try {
          const data = JSON.parse(validationFailDeepNestedTestData)
          joiDeepSchema.validate(data)
        } catch {
          // Expected to fail
        }
      })
    }
  })

  describe('Fail-Fast - Union No Match', () => {
    bench('Atchara (Deferred)', () => {
      try {
        atcharaUnionSchema.parse(validationFailUnionTestBytes)
      } catch {
        // Expected to fail
      }
    })

    bench('Atchara (Full Decode)', async () => {
      try {
        await atcharaUnionSchema.parse(validationFailUnionTestBytes).toValue()
      } catch {
        // Expected to fail
      }
    })

    if (zodUnionSchema) {
      bench('Zod', () => {
        try {
          const data = JSON.parse(validationFailUnionTestData)
          zodUnionSchema.parse(data)
        } catch {
          // Expected to fail
        }
      })
    }

    if (valibotUnionSchema) {
      bench('Valibot', () => {
        try {
          const data = JSON.parse(validationFailUnionTestData)
          v.parse(valibotUnionSchema, data)
        } catch {
          // Expected to fail
        }
      })
    }

    if (yupUnionSchema) {
      bench('Yup', () => {
        try {
          const data = JSON.parse(validationFailUnionTestData)
          yupUnionSchema.validateSync(data)
        } catch {
          // Expected to fail
        }
      })
    }

    if (joiUnionSchema) {
      bench('Joi', () => {
        try {
          const data = JSON.parse(validationFailUnionTestData)
          joiUnionSchema.validate(data)
        } catch {
          // Expected to fail
        }
      })
    }
  })
})

// ============================================================================
// MIXED VALIDITY TESTS
// ============================================================================
describe('Mixed Validity Tests', () => {
  describe('1K Simple Objects - 70% Valid', async () => {
    const { atcharaSchema, zodSchema, valibotSchema, yupSchema, joiSchema } =
      await createMixed1kSimple70pctSchemas(false)

    bench('Atchara (Deferred)', () => {
      try {
        atcharaSchema.parse(getMixed1kSimple70pctPayloadBytes())
      } catch {
        // Expected for invalid payloads
      }
    })

    bench('Atchara (Full Decode)', async () => {
      try {
        await atcharaSchema.parse(getMixed1kSimple70pctPayloadBytes()).toValue()
      } catch {
        // Expected for invalid payloads
      }
    })

    if (zodSchema) {
      bench('Zod', () => {
        try {
          const data = JSON.parse(getMixed1kSimple70pctPayloadStr())
          zodSchema.parse(data)
        } catch {
          // Expected for invalid payloads
        }
      })
    }

    if (valibotSchema) {
      bench('Valibot', () => {
        try {
          const data = JSON.parse(getMixed1kSimple70pctPayloadStr())
          v.parse(valibotSchema, data)
        } catch {
          // Expected for invalid payloads
        }
      })
    }

    if (yupSchema) {
      bench('Yup', () => {
        try {
          const data = JSON.parse(getMixed1kSimple70pctPayloadStr())
          yupSchema.validateSync(data)
        } catch {
          // Expected for invalid payloads
        }
      })
    }

    if (joiSchema) {
      bench('Joi', () => {
        try {
          const data = JSON.parse(getMixed1kSimple70pctPayloadStr())
          joiSchema.validate(data)
        } catch {
          // Expected for invalid payloads
        }
      })
    }
  })

  describe('1K Simple Objects - 90% Valid', async () => {
    const { atcharaSchema, zodSchema, valibotSchema, yupSchema, joiSchema } =
      await createMixed1kSimple90pctSchemas(false)

    bench('Atchara (Deferred)', () => {
      try {
        atcharaSchema.parse(getMixed1kSimple90pctPayloadBytes())
      } catch {
        // Expected for invalid payloads
      }
    })

    bench('Atchara (Full Decode)', async () => {
      try {
        await atcharaSchema.parse(getMixed1kSimple90pctPayloadBytes()).toValue()
      } catch {
        // Expected for invalid payloads
      }
    })

    if (zodSchema) {
      bench('Zod', () => {
        try {
          const data = JSON.parse(getMixed1kSimple90pctPayloadStr())
          zodSchema.parse(data)
        } catch {
          // Expected for invalid payloads
        }
      })
    }

    if (valibotSchema) {
      bench('Valibot', () => {
        try {
          const data = JSON.parse(getMixed1kSimple90pctPayloadStr())
          v.parse(valibotSchema, data)
        } catch {
          // Expected for invalid payloads
        }
      })
    }

    if (yupSchema) {
      bench('Yup', () => {
        try {
          const data = JSON.parse(getMixed1kSimple90pctPayloadStr())
          yupSchema.validateSync(data)
        } catch {
          // Expected for invalid payloads
        }
      })
    }

    if (joiSchema) {
      bench('Joi', () => {
        try {
          const data = JSON.parse(getMixed1kSimple90pctPayloadStr())
          joiSchema.validate(data)
        } catch {
          // Expected for invalid payloads
        }
      })
    }
  })

  describe('1K Nested Objects - 70% Valid', async () => {
    const { atcharaSchema, zodSchema, valibotSchema, yupSchema, joiSchema } =
      await createMixed1kNested70pctSchemas(false)

    bench('Atchara (Deferred)', () => {
      try {
        atcharaSchema.parse(getMixed1kNested70pctPayloadBytes())
      } catch {
        // Expected for invalid payloads
      }
    })

    bench('Atchara (Full Decode)', async () => {
      try {
        await atcharaSchema.parse(getMixed1kNested70pctPayloadBytes()).toValue()
      } catch {
        // Expected for invalid payloads
      }
    })

    if (zodSchema) {
      bench('Zod', () => {
        try {
          const data = JSON.parse(getMixed1kNested70pctPayloadStr())
          zodSchema.parse(data)
        } catch {
          // Expected for invalid payloads
        }
      })
    }

    if (valibotSchema) {
      bench('Valibot', () => {
        try {
          const data = JSON.parse(getMixed1kNested70pctPayloadStr())
          v.parse(valibotSchema, data)
        } catch {
          // Expected for invalid payloads
        }
      })
    }

    if (yupSchema) {
      bench('Yup', () => {
        try {
          const data = JSON.parse(getMixed1kNested70pctPayloadStr())
          yupSchema.validateSync(data)
        } catch {
          // Expected for invalid payloads
        }
      })
    }

    if (joiSchema) {
      bench('Joi', () => {
        try {
          const data = JSON.parse(getMixed1kNested70pctPayloadStr())
          joiSchema.validate(data)
        } catch {
          // Expected for invalid payloads
        }
      })
    }
  })

  describe('1K Nested Objects - 90% Valid', async () => {
    const { atcharaSchema, zodSchema, valibotSchema, yupSchema, joiSchema } =
      await createMixed1kNested90pctSchemas(false)

    bench('Atchara (Deferred)', () => {
      try {
        atcharaSchema.parse(getMixed1kNested90pctPayloadBytes())
      } catch {
        // Expected for invalid payloads
      }
    })

    bench('Atchara (Full Decode)', async () => {
      try {
        await atcharaSchema.parse(getMixed1kNested90pctPayloadBytes()).toValue()
      } catch {
        // Expected for invalid payloads
      }
    })

    if (zodSchema) {
      bench('Zod', () => {
        try {
          const data = JSON.parse(getMixed1kNested90pctPayloadStr())
          zodSchema.parse(data)
        } catch {
          // Expected for invalid payloads
        }
      })
    }

    if (valibotSchema) {
      bench('Valibot', () => {
        try {
          const data = JSON.parse(getMixed1kNested90pctPayloadStr())
          v.parse(valibotSchema, data)
        } catch {
          // Expected for invalid payloads
        }
      })
    }

    if (yupSchema) {
      bench('Yup', () => {
        try {
          const data = JSON.parse(getMixed1kNested90pctPayloadStr())
          yupSchema.validateSync(data)
        } catch {
          // Expected for invalid payloads
        }
      })
    }

    if (joiSchema) {
      bench('Joi', () => {
        try {
          const data = JSON.parse(getMixed1kNested90pctPayloadStr())
          joiSchema.validate(data)
        } catch {
          // Expected for invalid payloads
        }
      })
    }
  })
})

// ============================================================================
// CONSTRAINT SCALING TESTS
// ============================================================================
describe('Constraint Scaling Tests', () => {
  describe('Constrained Array - 1K Items', async () => {
    const { atcharaSchema, zodSchema, valibotSchema, yupSchema, joiSchema } =
      await createConstrainedArray1kSchemas(false)

    bench('Atchara (Deferred)', () => {
      atcharaSchema.parse(constrainedArray1kTestBytes)
    })

    bench('Atchara (Full Decode)', async () => {
      await atcharaSchema.parse(constrainedArray1kTestBytes).toValue()
    })

    if (zodSchema) {
      bench('Zod', () => {
        const data = JSON.parse(constrainedArray1kTestData)
        zodSchema.parse(data)
      })
    }

    if (valibotSchema) {
      bench('Valibot', () => {
        const data = JSON.parse(constrainedArray1kTestData)
        v.parse(valibotSchema, data)
      })
    }

    if (yupSchema) {
      bench('Yup', () => {
        const data = JSON.parse(constrainedArray1kTestData)
        yupSchema.validateSync(data)
      })
    }

    if (joiSchema) {
      bench('Joi', () => {
        const data = JSON.parse(constrainedArray1kTestData)
        joiSchema.validate(data, { cache: false })
      })
    }
  })

  describe('Constrained Array - 10K Items', async () => {
    const { atcharaSchema, zodSchema, valibotSchema, yupSchema, joiSchema } =
      await createConstrainedArray10kSchemas(false)

    bench('Atchara (Deferred)', () => {
      atcharaSchema.parse(constrainedArray10kTestBytes)
    })

    bench('Atchara (Full Decode)', async () => {
      await atcharaSchema.parse(constrainedArray10kTestBytes).toValue()
    })

    if (zodSchema) {
      bench('Zod', () => {
        const data = JSON.parse(constrainedArray10kTestData)
        zodSchema.parse(data)
      })
    }

    if (valibotSchema) {
      bench('Valibot', () => {
        const data = JSON.parse(constrainedArray10kTestData)
        v.parse(valibotSchema, data)
      })
    }

    if (yupSchema) {
      bench('Yup', () => {
        const data = JSON.parse(constrainedArray10kTestData)
        yupSchema.validateSync(data)
      })
    }

    if (joiSchema) {
      bench('Joi', () => {
        const data = JSON.parse(constrainedArray10kTestData)
        joiSchema.validate(data, { cache: false })
      })
    }
  })

  describe('Constrained Array - 50K Items', async () => {
    const { atcharaSchema, zodSchema, valibotSchema, yupSchema, joiSchema } =
      await createConstrainedArray50kSchemas(false)

    bench('Atchara (Deferred)', () => {
      atcharaSchema.parse(constrainedArray50kTestBytes)
    })

    bench('Atchara (Full Decode)', async () => {
      await atcharaSchema.parse(constrainedArray50kTestBytes).toValue()
    })

    if (zodSchema) {
      bench('Zod', () => {
        const data = JSON.parse(constrainedArray50kTestData)
        zodSchema.parse(data)
      })
    }

    if (valibotSchema) {
      bench('Valibot', () => {
        const data = JSON.parse(constrainedArray50kTestData)
        v.parse(valibotSchema, data)
      })
    }

    if (yupSchema) {
      bench('Yup', () => {
        const data = JSON.parse(constrainedArray50kTestData)
        yupSchema.validateSync(data)
      })
    }

    if (joiSchema) {
      bench('Joi', () => {
        const data = JSON.parse(constrainedArray50kTestData)
        joiSchema.validate(data, { cache: false })
      })
    }
  })

  describe('Constrained Record - 1K Entries', async () => {
    const { atcharaSchema, zodSchema, valibotSchema, joiSchema } =
      await createConstrainedRecord1kSchemas(false)

    bench('Atchara (Deferred)', () => {
      atcharaSchema.parse(constrainedRecord1kTestBytes)
    })

    bench('Atchara (Full Decode)', async () => {
      await atcharaSchema.parse(constrainedRecord1kTestBytes).toValue()
    })

    if (zodSchema) {
      bench('Zod', () => {
        const data = JSON.parse(constrainedRecord1kTestData)
        zodSchema.parse(data)
      })
    }

    if (valibotSchema) {
      bench('Valibot', () => {
        const data = JSON.parse(constrainedRecord1kTestData)
        v.parse(valibotSchema, data)
      })
    }

    if (joiSchema) {
      bench('Joi', () => {
        const data = JSON.parse(constrainedRecord1kTestData)
        joiSchema.validate(data, { cache: false })
      })
    }
  })

  describe('Constrained Record - 10K Entries', async () => {
    const { atcharaSchema, zodSchema, valibotSchema, joiSchema } =
      await createConstrainedRecord10kSchemas(false)

    bench('Atchara (Deferred)', () => {
      atcharaSchema.parse(constrainedRecord10kTestBytes)
    })

    bench('Atchara (Full Decode)', async () => {
      await atcharaSchema.parse(constrainedRecord10kTestBytes).toValue()
    })

    if (zodSchema) {
      bench('Zod', () => {
        const data = JSON.parse(constrainedRecord10kTestData)
        zodSchema.parse(data)
      })
    }

    if (valibotSchema) {
      bench('Valibot', () => {
        const data = JSON.parse(constrainedRecord10kTestData)
        v.parse(valibotSchema, data)
      })
    }

    if (joiSchema) {
      bench('Joi', () => {
        const data = JSON.parse(constrainedRecord10kTestData)
        joiSchema.validate(data, { cache: false })
      })
    }
  })

  describe('Constrained Record - 50K Entries', async () => {
    const { atcharaSchema, zodSchema, valibotSchema, joiSchema } =
      await createConstrainedRecord50kSchemas(false)

    bench('Atchara (Deferred)', () => {
      atcharaSchema.parse(constrainedRecord50kTestBytes)
    })

    bench('Atchara (Full Decode)', async () => {
      await atcharaSchema.parse(constrainedRecord50kTestBytes).toValue()
    })

    if (zodSchema) {
      bench('Zod', () => {
        const data = JSON.parse(constrainedRecord50kTestData)
        zodSchema.parse(data)
      })
    }

    if (valibotSchema) {
      bench('Valibot', () => {
        const data = JSON.parse(constrainedRecord50kTestData)
        v.parse(valibotSchema, data)
      })
    }

    if (joiSchema) {
      bench('Joi', () => {
        const data = JSON.parse(constrainedRecord50kTestData)
        joiSchema.validate(data, { cache: false })
      })
    }
  })
})
