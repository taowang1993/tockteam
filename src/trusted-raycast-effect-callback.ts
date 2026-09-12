export async function afterSucceededEffect<T>(effect: () => Promise<void>, callback: unknown, value: T): Promise<void> {
  await effect()
  if (typeof callback === 'function') await callback(value)
}
