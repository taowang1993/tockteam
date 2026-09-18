import { normalizeNotesBaseFilePath } from './NotesBaseFormulaPath.ts'
import { isNotesBaseImagePath } from './NotesBaseFormulaMedia.ts'

const MAX_NOTES_BASE_IMAGE_URL_LENGTH = 4_096;

type NotesBaseImageSource =
  | { kind: "remote"; value: string }
  | { kind: "local"; value: string };

class NotesBaseImageValue {
  readonly #source: NotesBaseImageSource;

  constructor(source: NotesBaseImageSource) {
    this.#source = source;
    Object.freeze(this);
  }

  source() {
    return this.#source;
  }
}

const notesBaseImageValues = new WeakSet<NotesBaseImageValue>();

/** Normalize one bounded absolute HTTP(S) image URL without creating an evaluator-owned value. */
export function normalizeNotesBaseImageUrl(input: string) {
  if (
    input.length === 0
    || input.length > MAX_NOTES_BASE_IMAGE_URL_LENGTH
    || input !== input.trim()
    || /[\u0000-\u001F\u007F]/u.test(input)
    || !/^https?:\/\//iu.test(input)
  ) return null;
  try {
    const url = new URL(input);
    if (
      (url.protocol !== "http:" && url.protocol !== "https:")
      || url.username.length > 0
      || url.password.length > 0
      || url.hash.length > 0
    ) return null;
    const normalized = url.toString();
    return normalized.length <= MAX_NOTES_BASE_IMAGE_URL_LENGTH ? normalized : null;
  } catch {
    return null;
  }
}

function notesBaseImageValue(value: unknown) {
  return typeof value === "object" && value !== null && notesBaseImageValues.has(value as NotesBaseImageValue)
    ? value as NotesBaseImageValue
    : null;
}

/** Create an evaluator-owned image value from one bounded remote URL or safe local image path. */
export function createNotesBaseImageValue(input: string) {
  const remoteUrl = normalizeNotesBaseImageUrl(input);
  const localPath = remoteUrl === null ? normalizeNotesBaseFilePath(input) : null;
  const source: NotesBaseImageSource | null = remoteUrl !== null
    ? { kind: "remote", value: remoteUrl }
    : localPath !== null && isNotesBaseImagePath(localPath)
      ? { kind: "local", value: localPath }
      : null;
  if (source === null) return null;
  const value = new NotesBaseImageValue(source);
  notesBaseImageValues.add(value);
  return value;
}

/** Return the normalized remote URL only for evaluator-owned remote image values. */
export function notesBaseImageUrl(value: unknown) {
  const source = notesBaseImageValue(value)?.source();
  return source?.kind === "remote" ? source.value : null;
}

/** Return the normalized vault-relative path only for evaluator-owned local image values. */
export function notesBaseImagePath(value: unknown) {
  const source = notesBaseImageValue(value)?.source();
  return source?.kind === "local" ? source.value : null;
}

/** Return the inert URL/path projection only for evaluator-owned image values. */
export function notesBaseImageText(value: unknown) {
  return notesBaseImageValue(value)?.source().value ?? null;
}
