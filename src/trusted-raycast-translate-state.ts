import { lstatSync } from 'node:fs'
import { atomicWrite } from './launcher-persistence.ts'
import { readBoundedRegularFile } from './trusted-raycast-bounded-file.ts'

export const MAX_TRANSLATE_STATE_BYTES = 512 * 1024
export const MAX_TRANSLATE_SAVED_SETS = 128

export type TranslateLanguageSet = Readonly<{
  langFrom: string
  langTo: string | readonly string[]
}>
export type TranslateState = Readonly<{
  languages?: readonly TranslateLanguageSet[]
  selectedLanguageSet?: TranslateLanguageSet
}>

export const EMPTY_TRANSLATE_STATE: TranslateState = Object.freeze({})

const STATE_KEYS = ['languages', 'selectedLanguageSet'] as const
const LANGUAGE_SET_KEYS = ['langFrom', 'langTo'] as const
const byteLength = (value: string): number => new TextEncoder().encode(value).byteLength
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const exactKeys = (value: object, expected: readonly string[]): boolean => JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...expected].sort())

function hasCatalogCode(catalog: Readonly<Record<string, unknown>>, code: unknown): code is string {
  return typeof code === 'string' && Object.hasOwn(catalog, code)
}

function isTranslateLanguageSet(value: unknown, catalog: Readonly<Record<string, unknown>>): value is TranslateLanguageSet {
  if (!isRecord(value) || !exactKeys(value, LANGUAGE_SET_KEYS) || !hasCatalogCode(catalog, value.langFrom)) return false
  if (typeof value.langTo === 'string') return hasCatalogCode(catalog, value.langTo)
  if (!Array.isArray(value.langTo)) return false
  for (const target of value.langTo) if (!hasCatalogCode(catalog, target)) return false
  return true
}

function serializedState(value: unknown): string | undefined {
  try {
    const serialized = JSON.stringify(value)
    return serialized !== undefined && byteLength(`${serialized}\n`) <= MAX_TRANSLATE_STATE_BYTES ? serialized : undefined
  } catch {
    return undefined
  }
}

export function isTranslateState(value: unknown, catalog: Readonly<Record<string, unknown>>): value is TranslateState {
  if (!isRecord(value) || Object.keys(value).some(key => !(STATE_KEYS as readonly string[]).includes(key))) return false
  if (Object.hasOwn(value, 'selectedLanguageSet') && !isTranslateLanguageSet(value.selectedLanguageSet, catalog)) return false
  if (Object.hasOwn(value, 'languages')) {
    if (!Array.isArray(value.languages) || value.languages.length > MAX_TRANSLATE_SAVED_SETS) return false
    for (const languageSet of value.languages) if (!isTranslateLanguageSet(languageSet, catalog)) return false
  }
  return serializedState(value) !== undefined
}

export function loadTranslateState(path: string, catalog: Readonly<Record<string, unknown>>): TranslateState {
  try {
    const parsed: unknown = JSON.parse(readBoundedRegularFile(path, MAX_TRANSLATE_STATE_BYTES))
    if (!isTranslateState(parsed, catalog)) throw new Error('Invalid Translate state')
    return parsed
  } catch {
    return EMPTY_TRANSLATE_STATE
  }
}

export async function saveTranslateState(path: string, value: unknown, catalog: Readonly<Record<string, unknown>>): Promise<void> {
  if (!isTranslateState(value, catalog)) throw new Error('Invalid Translate state')
  try {
    const selected = lstatSync(path)
    if (selected.isSymbolicLink()) throw new Error('Translate state path is a symlink')
    if (!selected.isFile()) throw new Error('Translate state path is not a regular file')
  } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error
  }
  const serialized = serializedState(value)
  if (serialized === undefined) throw new Error('Invalid Translate state')
  await atomicWrite(path, `${serialized}\n`, { backup: false })
}
