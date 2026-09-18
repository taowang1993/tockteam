import { normalizeNotesBaseFilePath } from './NotesBaseFormulaPath.ts'
import { noteHasTag } from './NotesBaseFormulaTagsMatch.ts'

const MAX_NOTES_BASE_TAG_VALUES = 10_000;
const MAX_NOTES_BASE_TAG_TEXT_LENGTH = 100_000;
const MAX_NOTES_BASE_TAG_MATCHES = 100_000;

type NotesBaseFormulaResult = { supported: true; value: unknown } | { supported: false };
type NotesBaseFormulaResolver = (property: string) => unknown;

export function notesBaseTagsSnapshot(value: unknown) {
  try {
    if (!Array.isArray(value)) return null;
    const lengthDescriptor = Object.getOwnPropertyDescriptor(value, "length");
    const length = lengthDescriptor && "value" in lengthDescriptor
      ? lengthDescriptor.value
      : null;
    if (
      typeof length !== "number"
      || !Number.isSafeInteger(length)
      || length < 0
      || length > MAX_NOTES_BASE_TAG_VALUES
      || value.length !== length
    ) return null;
    let textLength = 0;
    const tags: string[] = [];
    for (let index = 0; index < length; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      const entry = descriptor && "value" in descriptor ? descriptor.value : null;
      if (typeof entry !== "string" || value[index] !== entry) return null;
      textLength += entry.length;
      if (textLength > MAX_NOTES_BASE_TAG_TEXT_LENGTH) return null;
      tags.push(entry);
    }
    return tags;
  } catch {
    return null;
  }
}

export function evaluateNotesBaseFileHasTagCall(
  call: { receiver: string; args: string },
  resolveProperty: NotesBaseFormulaResolver,
  splitArgs: (args: string) => string[] | null,
  evaluateArg: (arg: string, resolveProperty: NotesBaseFormulaResolver) => NotesBaseFormulaResult,
  fileTagsFor?: (normalizedPath: string) => unknown | null,
): NotesBaseFormulaResult {
  const args = splitArgs(call.args);
  if (
    (
      call.receiver !== "file"
      && call.receiver !== "this.file"
      && !/^file\([\s\S]*\)$/u.test(call.receiver)
    )
    || !args
    || args.length === 0
    || args.length > MAX_NOTES_BASE_TAG_VALUES
    || /,\s*$/u.test(call.args)
  ) {
    return { supported: false };
  }

  let tagValue: unknown;
  if (call.receiver === "file") {
    tagValue = resolveProperty("file.tags");
  } else {
    const projectedFile = evaluateArg(call.receiver, resolveProperty);
    const path = projectedFile.supported && typeof projectedFile.value === "string"
      ? normalizeNotesBaseFilePath(projectedFile.value)
      : null;
    if (!path || !fileTagsFor) return { supported: false };
    try {
      tagValue = fileTagsFor(path);
    } catch {
      return { supported: false };
    }
  }

  const tags = notesBaseTagsSnapshot(tagValue);
  if (!tags || tags.length * args.length > MAX_NOTES_BASE_TAG_MATCHES) return { supported: false };

  const queries: string[] = [];
  let queryLength = 0;
  for (const arg of args) {
    const query = evaluateArg(arg, resolveProperty);
    if (!query.supported || typeof query.value !== "string") return { supported: false };
    queryLength += query.value.length;
    if (queryLength > MAX_NOTES_BASE_TAG_TEXT_LENGTH) return { supported: false };
    queries.push(query.value);
  }

  return { supported: true, value: queries.some((query) => noteHasTag(tags, query)) };
}
