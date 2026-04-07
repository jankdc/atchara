/**
 * Encode path as string key - faster than JSON.stringify
 * Appends delimiter after each element to avoid collisions
 */
export function encodePath(path: string[]): string {
  // Append delimiter after each element to distinguish [] from [""]
  // [] -> ""
  // [""] -> "\x00"
  // ["a"] -> "a\x00"
  // ["a", "b"] -> "a\x00b\x00"
  return path.map((p) => p + '\x00').join('')
}
