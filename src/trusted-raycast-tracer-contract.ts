export type TrustedRaycastTranslationResult = Readonly<{ input: string; translated: string; target: 'zh-CN' }>

export function parseTrustedRaycastResult(output: string, expectedInput?: string): TrustedRaycastTranslationResult {
  const line = output.split('\n').find(entry => entry.startsWith('RESULT '))
  if (!line) throw new Error('trusted Raycast child emitted no result')
  const value: unknown = JSON.parse(line.slice('RESULT '.length))
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('trusted Raycast result is not an object')
  const result = value as Record<string, unknown>
  if (Object.keys(result).sort().join(',') !== 'input,target,translated' || typeof result.input !== 'string' || typeof result.translated !== 'string' || result.target !== 'zh-CN') throw new Error('trusted Raycast result shape is invalid')
  if (expectedInput !== undefined && result.input !== expectedInput) throw new Error('trusted Raycast result input does not match the request')
  if (!result.translated || result.translated === result.input || !/[\u3400-\u9fff]/u.test(result.translated)) throw new Error('trusted Raycast result is not a cross-language translation')
  return result as TrustedRaycastTranslationResult
}
