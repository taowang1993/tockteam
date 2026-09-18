import { notesBaseObjectKeys } from './NotesBaseFormulaObject.ts'

const MAX_UNIQUE_STRING_LENGTH = 100_000;
const MAX_UNIQUE_COLLECTION_ENTRIES = 10_000;
const MAX_UNIQUE_DEPTH = 64;
const MAX_UNIQUE_WORK = 1_000_000;

type UniqueIdentityState = {
  active: Set<object>;
  work: number;
};

function uniqueValueIdentity(
  value: unknown,
  state: UniqueIdentityState,
  depth = 0,
): string | null {
  if (depth > MAX_UNIQUE_DEPTH) return null;
  state.work += 1;
  if (state.work > MAX_UNIQUE_WORK) return null;
  if (value == null) return "z";
  if (typeof value === "boolean") return value ? "b1" : "b0";
  if (typeof value === "number") return Number.isFinite(value) ? `n${Object.is(value, -0) ? 0 : value};` : null;
  if (typeof value === "string") {
    state.work += value.length;
    return value.length <= MAX_UNIQUE_STRING_LENGTH && state.work <= MAX_UNIQUE_WORK
      ? `s${value.length}:${value}`
      : null;
  }
  if (typeof value !== "object" || state.active.has(value)) return null;

  if (Array.isArray(value)) {
    try {
      const length = value.length;
      if (!Number.isSafeInteger(length) || length < 0 || length > MAX_UNIQUE_COLLECTION_ENTRIES) return null;
      state.work += length;
      if (state.work > MAX_UNIQUE_WORK) return null;
      state.active.add(value);
      const identities: string[] = [];
      for (let index = 0; index < length; index += 1) {
        const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
        if (descriptor && !("value" in descriptor)) return null;
        const identity = uniqueValueIdentity(descriptor?.value, state, depth + 1);
        if (identity === null) return null;
        identities.push(identity);
      }
      return `a${length}[${identities.join("")}]`;
    } catch {
      return null;
    } finally {
      state.active.delete(value);
    }
  }

  const keys = notesBaseObjectKeys(value);
  if (keys === null) return null;
  state.work += keys.length;
  if (state.work > MAX_UNIQUE_WORK) return null;
  state.active.add(value);
  try {
    const identities: string[] = [];
    for (const key of keys.sort()) {
      state.work += key.length;
      if (key.length > MAX_UNIQUE_STRING_LENGTH || state.work > MAX_UNIQUE_WORK) return null;
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !("value" in descriptor)) return null;
      const identity = uniqueValueIdentity(descriptor.value, state, depth + 1);
      if (identity === null) return null;
      identities.push(`k${key.length}:${key}${identity}`);
    }
    return `o${keys.length}{${identities.join("")}}`;
  } catch {
    return null;
  } finally {
    state.active.delete(value);
  }
}

export function countNotesBaseUniqueValues<Row>(rows: Row[], resolveValue: (row: Row) => unknown) {
  const identities = new Set<string>();
  const state: UniqueIdentityState = { active: new Set(), work: 0 };
  for (const row of rows) {
    const identity = uniqueValueIdentity(resolveValue(row), state);
    if (identity === null) return null;
    identities.add(identity);
  }
  return identities.size;
}
