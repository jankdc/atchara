/**
 * Tagged template literal to create Uint8Array from string
 * @example const bytes = toBytes`hello there`
 */
export function toBytes(strings: TemplateStringsArray, ...values: unknown[]): Uint8Array {
  let result = strings[0]
  for (let i = 0; i < values.length; i++) {
    result += String(values[i]) + strings[i + 1]
  }
  return new TextEncoder().encode(result)
}
