const MAX_NOTES_BASE_FORMULA_OBJECT_KEYS = 10_000;
export function notesBaseObjectKeys(value) {
    if (value == null || typeof value !== "object" || Array.isArray(value))
        return null;
    try {
        const prototype = Object.getPrototypeOf(value);
        if (prototype !== Object.prototype && prototype !== null)
            return null;
        const keys = Object.keys(value);
        return keys.length <= MAX_NOTES_BASE_FORMULA_OBJECT_KEYS ? keys : null;
    }
    catch {
        return null;
    }
}
export function notesBaseObjectSnapshot(value) {
    const keys = notesBaseObjectKeys(value);
    if (keys === null)
        return null;
    try {
        const snapshot = Object.create(null);
        for (const key of keys) {
            const descriptor = Object.getOwnPropertyDescriptor(value, key);
            if (!descriptor || !("value" in descriptor))
                return null;
            Object.defineProperty(snapshot, key, {
                configurable: true,
                enumerable: true,
                value: descriptor.value,
                writable: true,
            });
        }
        const stableKeys = notesBaseObjectKeys(value);
        return stableKeys?.length === keys.length && stableKeys.every((key, index) => key === keys[index])
            ? snapshot
            : null;
    }
    catch {
        return null;
    }
}
export function notesBaseObjectValues(value) {
    if (value == null || typeof value !== "object")
        return null;
    const keys = notesBaseObjectKeys(value);
    if (keys === null)
        return null;
    try {
        const values = [];
        for (const key of keys) {
            const descriptor = Object.getOwnPropertyDescriptor(value, key);
            if (!descriptor || !("value" in descriptor))
                return null;
            values.push(descriptor.value);
        }
        return values;
    }
    catch {
        return null;
    }
}
export function notesBaseObjectValue(value, key) {
    const keys = notesBaseObjectKeys(value);
    if (keys === null)
        return null;
    try {
        const descriptor = keys.includes(key) ? Object.getOwnPropertyDescriptor(value, key) : undefined;
        if (descriptor && !("value" in descriptor))
            return null;
        const stableKeys = notesBaseObjectKeys(value);
        return stableKeys?.length === keys.length && stableKeys.every((stableKey, index) => stableKey === keys[index])
            ? { keyCount: keys.length, value: descriptor?.value }
            : null;
    }
    catch {
        return null;
    }
}
export function notesBaseObjectHasProperty(value, name) {
    const keys = notesBaseObjectKeys(value);
    return keys === null ? null : keys.includes(name);
}
//# sourceMappingURL=NotesBaseFormulaObject.js.map