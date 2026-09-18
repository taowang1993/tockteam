const PNG_DATA_URL = /^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/u

export function isLauncherImageUrl(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 1_000_000 && PNG_DATA_URL.test(value)
}
