/** Validate complete Base64 quartets without a repeated-group RegExp stack. */
export function isBase64(value: unknown): value is string {
  return typeof value === 'string'
    && value.length % 4 === 0
    && /^[A-Za-z0-9+/]*={0,2}$/u.test(value)
}
