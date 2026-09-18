import { formatNotesTemplateDate } from "./NotesBaseFormulaDate.js";
import { evaluateNotesBaseBooleanAnd, evaluateNotesBaseBooleanNot, evaluateNotesBaseBooleanOr, evaluateNotesBaseComparison, evaluateNotesBaseUnaryNumeric, isNotesBaseDateOffsetExpression, isNotesBaseDurationScaleExpression, evaluateNotesBaseNumberTransform, evaluateNotesBaseMultiplicative, evaluateNotesBaseAdditive, } from "./NotesBaseFormulaArithmetic.js";
import { notesBaseObjectHasProperty, notesBaseObjectKeys, notesBaseObjectSnapshot, notesBaseObjectValue, notesBaseObjectValues, } from "./NotesBaseFormulaObject.js";
import { evaluateNotesBaseFileHasLinkCall, evaluateNotesBaseFileInFolderCall, evaluateNotesBaseLinkLinksToCall, normalizeNotesBaseFilePath, normalizeNotesBaseLinkPath, notesBaseFileLinksSnapshot, notesBaseFilePathField, } from "./NotesBaseFormulaPath.js";
import { createNotesBaseLinkValue, notesBaseLinkPath, notesBaseLinkText, } from "./NotesBaseFormulaLink.js";
import { createNotesBaseIconValue, notesBaseIconName } from "./NotesBaseFormulaIcon.js";
import { createNotesBaseImageValue, notesBaseImageText } from "./NotesBaseFormulaImage.js";
import { createNotesBaseHtmlValue, notesBaseHtmlText } from "./NotesBaseFormulaHtml.js";
import { evaluateNotesBaseRegexpAnyValueCall, evaluateNotesBaseRegexpMatchesCall, evaluateNotesBaseRegexpReplaceCall, evaluateNotesBaseRegexpSplitCall, splitNotesBaseRegexpIsTypeCall, } from "./NotesBaseFormulaRegex.js";
import { evaluateNotesBaseFileHasTagCall, notesBaseTagsSnapshot, } from "./NotesBaseFormulaTags.js";
import { countNotesBaseUniqueValues } from "./NotesBaseSummaryUnique.js";
import { isNotesBaseFormulaQuoteEscaped } from "./NotesBaseFormulaSyntax.js";
export const NOTES_BASE_UNSUPPORTED_FORMULA_VALUE = Symbol("notes-base-unsupported-formula-value");
const MAX_NOTES_BASE_FORMULA_STRING_LENGTH = 100_000;
const MAX_NOTES_BASE_FORMULA_EXPRESSION_LENGTH = 200_000;
const MAX_NOTES_BASE_FORMULA_LIST_ELEMENTS = 10_000;
const MAX_NOTES_BASE_FORMULA_LIST_CALLBACK_WORK = 1_000_000;
const MAX_NOTES_BASE_FORMULA_GROUP_DEPTH = 64;
const NOTES_BASE_FORMULA_LIST_CALLBACK_FORBIDDEN_METHODS = ["filter", "map", "matches", "reduce"];
const NOTES_BASE_HTML_ESCAPE_BY_CHARACTER = new Map(Object.entries({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
}));
const NOTES_BASE_LIST_INDEX_EXPRESSION = /^([\s\S]+)\[(0|[1-9]\d{0,4})\]$/u;
const NOTES_BASE_FIXED_DURATION_MULTIPLIERS = {
    ms: 1,
    s: 1_000,
    second: 1_000,
    seconds: 1_000,
    m: 60_000,
    minute: 60_000,
    minutes: 60_000,
    h: 3_600_000,
    hour: 3_600_000,
    hours: 3_600_000,
    d: 86_400_000,
    day: 86_400_000,
    days: 86_400_000,
    w: 604_800_000,
    week: 604_800_000,
    weeks: 604_800_000,
};
const NOTES_BASE_FORMULA_LIST_COLLATOR = new Intl.Collator(undefined, { usage: "sort", sensitivity: "base", numeric: true });
export function notesBaseFileTimestamp(timestamp) {
    if (typeof timestamp !== "number" || !Number.isFinite(timestamp))
        return undefined;
    const date = new Date(timestamp);
    return Number.isFinite(date.getTime()) ? date.toISOString() : undefined;
}
export function notesBaseFormulaExpression(value) {
    return /^formula\((['"])([\s\S]*)\1\)$/u.exec(value.trim())?.[2] ?? null;
}
function evaluateNotesBaseValueEmptiness(value) {
    if (value == null)
        return { supported: true, value: true };
    if (Array.isArray(value))
        return { supported: true, value: value.length === 0 };
    if (notesBaseIconName(value) !== null)
        return { supported: true, value: false };
    if (notesBaseImageText(value) !== null)
        return { supported: true, value: false };
    if (notesBaseHtmlText(value) !== null)
        return { supported: true, value: false };
    if (typeof value === "object") {
        const keys = notesBaseObjectKeys(value);
        return keys === null ? { supported: false } : { supported: true, value: keys.length === 0 };
    }
    if (typeof value === "number") {
        return Number.isFinite(value) ? { supported: true, value: false } : { supported: false };
    }
    if (typeof value === "string")
        return { supported: true, value: value.length === 0 };
    if (typeof value === "boolean")
        return { supported: true, value: false };
    return { supported: false };
}
function splitFormulaArgs(value) {
    const args = [];
    let current = "";
    let quote = "";
    let depth = 0;
    for (let index = 0; index < value.length; index += 1) {
        const char = value[index] ?? "";
        if ((char === "\"" || char === "'") && !isNotesBaseFormulaQuoteEscaped(value, index)) {
            if (!quote)
                quote = char;
            else if (char === quote)
                quote = "";
        }
        if (quote || char === "\"" || char === "'") {
            current += char;
            continue;
        }
        if (char === "(" || char === "[" || char === "{")
            depth += 1;
        if (char === ")" || char === "]" || char === "}")
            depth -= 1;
        if (depth < 0)
            return null;
        if (char === "," && !quote && depth === 0) {
            args.push(current.trim());
            current = "";
            continue;
        }
        current += char;
    }
    if (quote || depth !== 0)
        return null;
    if (current.trim())
        args.push(current.trim());
    return args;
}
function projectedFilePath(receiverSource, resolveProperty, evaluateReceiver) {
    if (!receiverSource.startsWith("file(") || !receiverSource.endsWith(")"))
        return null;
    const receiverArgs = splitFormulaArgs(receiverSource.slice("file(".length, -1));
    if (!receiverArgs || receiverArgs.length !== 1 || /,\s*\)$/u.test(receiverSource))
        return null;
    const receiver = evaluateReceiver(receiverSource, resolveProperty);
    return receiver.supported && typeof receiver.value === "string"
        ? normalizeNotesBaseFilePath(receiver.value)
        : null;
}
function splitMemberCall(value, method) {
    const marker = `.${method}(`;
    let quote = "";
    let depth = 0;
    let markerIndex = -1;
    let lastMemberCallIndex = -1;
    for (let index = 0; index < value.length; index += 1) {
        const char = value[index] ?? "";
        if ((char === "\"" || char === "'") && !isNotesBaseFormulaQuoteEscaped(value, index)) {
            if (!quote)
                quote = char;
            else if (char === quote)
                quote = "";
        }
        if (quote || char === "\"" || char === "'") {
            continue;
        }
        if (depth === 0 && char === ".") {
            const memberCall = /^\.([A-Za-z_][\w]*)\(/u.exec(value.slice(index));
            if (memberCall)
                lastMemberCallIndex = index;
            if (value.startsWith(marker, index))
                markerIndex = index;
        }
        if (char === "(")
            depth += 1;
        if (char === ")")
            depth -= 1;
        if (depth < 0)
            return null;
    }
    if (quote
        || depth !== 0
        || markerIndex < 1
        || markerIndex !== lastMemberCallIndex
        || !value.endsWith(")"))
        return null;
    return {
        receiver: value.slice(0, markerIndex).trim(),
        args: value.slice(markerIndex + marker.length, -1),
    };
}
function unwrapBoundedFormulaGroup(value) {
    if (value.length > MAX_NOTES_BASE_FORMULA_EXPRESSION_LENGTH)
        return null;
    let quote = "";
    let depth = 0;
    let outerClose = -1;
    for (let index = 0; index < value.length; index += 1) {
        const char = value[index] ?? "";
        if ((char === "\"" || char === "'") && !isNotesBaseFormulaQuoteEscaped(value, index)) {
            if (!quote)
                quote = char;
            else if (char === quote)
                quote = "";
        }
        if (quote || char === "\"" || char === "'") {
            continue;
        }
        if (char === "(") {
            depth += 1;
            if (depth > MAX_NOTES_BASE_FORMULA_GROUP_DEPTH)
                return null;
        }
        else if (char === ")") {
            depth -= 1;
            if (depth < 0)
                return null;
            if (depth === 0 && outerClose < 0)
                outerClose = index;
        }
    }
    if (quote !== "" || depth !== 0)
        return null;
    return value.startsWith("(") && outerClose === value.length - 1
        ? value.slice(1, -1).trim()
        : value;
}
function unwrapNotesBaseOperand(value) {
    let current = value.trim();
    for (let depth = 0; depth <= MAX_NOTES_BASE_FORMULA_GROUP_DEPTH; depth += 1) {
        const unwrapped = unwrapBoundedFormulaGroup(current);
        if (unwrapped === null)
            return null;
        if (unwrapped === current)
            return current;
        current = unwrapped;
    }
    return current;
}
function isNotesBaseDateOperand(value) {
    const current = unwrapNotesBaseOperand(value);
    if (current === null)
        return false;
    if (/^[\w.-]+$/u.test(current) || current === "today()" || current === "now()")
        return true;
    if (!current.startsWith("date(") || !current.endsWith(")"))
        return false;
    const argsSource = current.slice("date(".length, -1);
    const args = splitFormulaArgs(argsSource);
    return args?.length === 1 && !/,\s*$/u.test(argsSource);
}
function isNotesBaseDateOffsetOperand(value) {
    const current = unwrapNotesBaseOperand(value);
    return current !== null && isNotesBaseDateOffsetExpression(current, isNotesBaseDateOperand);
}
function isDirectNotesBaseDurationOperand(value) {
    const current = unwrapNotesBaseOperand(value);
    if (current === null || !current.startsWith("duration(") || !current.endsWith(")"))
        return false;
    const argsSource = current.slice("duration(".length, -1);
    const args = splitFormulaArgs(argsSource);
    return args?.length === 1 && !/,\s*$/u.test(argsSource);
}
function isNotesBaseDurationOperand(value) {
    const current = unwrapNotesBaseOperand(value);
    return current !== null && (isDirectNotesBaseDurationOperand(current)
        || isNotesBaseDurationScaleExpression(current, isDirectNotesBaseDurationOperand));
}
function rejectNotesBaseUnaryNumericOperand(operator, operand) {
    return operator === "-" && isNotesBaseDurationOperand(operand);
}
function containsMemberCall(value, methods) {
    let quote = "";
    for (let index = 0; index < value.length; index += 1) {
        const char = value[index] ?? "";
        if ((char === "\"" || char === "'") && !isNotesBaseFormulaQuoteEscaped(value, index)) {
            if (!quote)
                quote = char;
            else if (char === quote)
                quote = "";
        }
        if (quote || char === "\"" || char === "'") {
            continue;
        }
        if (methods.some((method) => value.startsWith(`.${method}(`, index)))
            return true;
    }
    return false;
}
function isNotesBaseSafeShortCircuitOperand(value) {
    const trimmed = value.trim();
    if (!trimmed
        || trimmed.length > MAX_NOTES_BASE_FORMULA_EXPRESSION_LENGTH
        || unwrapBoundedFormulaGroup(trimmed) === null
        || /[;`]|=>|(?:^|[\s(])(?:process|globalThis|window|document|require|eval|Function|fetch|XMLHttpRequest)\b|\.(?:constructor|prototype)\b|__proto__/u.test(trimmed)) {
        return false;
    }
    return true;
}
function text(value) {
    if (Array.isArray(value))
        return value.join(", ");
    if (value == null)
        return "";
    const linkText = notesBaseLinkText(value);
    if (linkText !== null)
        return linkText;
    return String(value);
}
function escapeNotesBaseHtml(value) {
    if (value.length > MAX_NOTES_BASE_FORMULA_STRING_LENGTH)
        return null;
    let projectedLength = value.length;
    for (let index = 0; index < value.length; index += 1) {
        const escaped = NOTES_BASE_HTML_ESCAPE_BY_CHARACTER.get(value.charAt(index));
        if (escaped !== undefined)
            projectedLength += escaped.length - 1;
        if (projectedLength > MAX_NOTES_BASE_FORMULA_STRING_LENGTH)
            return null;
    }
    return value.replace(/[&<>"]/gu, (character) => NOTES_BASE_HTML_ESCAPE_BY_CHARACTER.get(character) ?? character);
}
function notesBaseNumberValue(value, operand) {
    if (isNotesBaseDateOperand(operand)) {
        const date = notesBaseDateValue(value);
        if (date)
            return date.getTime();
    }
    if (typeof value === "boolean")
        return value ? 1 : 0;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}
function localCalendarDate(now = new Date()) {
    const year = String(now.getFullYear()).padStart(4, "0");
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}
function localClockTime(now) {
    const hour = String(now.getHours()).padStart(2, "0");
    const minute = String(now.getMinutes()).padStart(2, "0");
    const second = String(now.getSeconds()).padStart(2, "0");
    return `${hour}:${minute}:${second}`;
}
function parseLocalDate(value) {
    const match = /^(\d{4})-(\d{2})-(\d{2})(?:(?:T| )(\d{2}):(\d{2})(?::(\d{2}))?)?$/u.exec(value);
    if (!match)
        return null;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const hour = Number(match[4] ?? 0);
    const minute = Number(match[5] ?? 0);
    const second = Number(match[6] ?? 0);
    const parsed = new Date(0);
    parsed.setFullYear(year, month - 1, day);
    parsed.setHours(hour, minute, second, 0);
    return parsed.getFullYear() === year
        && parsed.getMonth() === month - 1
        && parsed.getDate() === day
        && parsed.getHours() === hour
        && parsed.getMinutes() === minute
        && parsed.getSeconds() === second
        ? parsed.toISOString()
        : null;
}
function parseTimezoneOffsetDate(value) {
    const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(?:Z|([+-])(\d{2}):(\d{2}))$/u
        .exec(value);
    if (!match)
        return null;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const hour = Number(match[4]);
    const minute = Number(match[5]);
    const second = Number(match[6]);
    const millisecond = Number((match[7] ?? "").padEnd(3, "0"));
    const offsetHour = Number(match[9] ?? 0);
    const offsetMinute = Number(match[10] ?? 0);
    if (offsetHour > 23 || offsetMinute > 59)
        return null;
    const calendar = new Date(0);
    calendar.setUTCFullYear(year, month - 1, day);
    calendar.setUTCHours(hour, minute, second, millisecond);
    if (calendar.getUTCFullYear() !== year
        || calendar.getUTCMonth() !== month - 1
        || calendar.getUTCDate() !== day
        || calendar.getUTCHours() !== hour
        || calendar.getUTCMinutes() !== minute
        || calendar.getUTCSeconds() !== second
        || calendar.getUTCMilliseconds() !== millisecond) {
        return null;
    }
    const offsetDirection = match[8] === "-" ? -1 : 1;
    const timestamp = calendar.getTime() - offsetDirection * (offsetHour * 60 + offsetMinute) * 60_000;
    const parsed = new Date(timestamp);
    return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
}
function parseFixedDuration(value) {
    if (value.length > MAX_NOTES_BASE_FORMULA_STRING_LENGTH)
        return null;
    const match = /^([+-]?(?:\d+(?:\.\d+)?|\.\d+))\s*(ms|s|seconds?|m|minutes?|h|hours?|d|days?|w|weeks?)$/u.exec(value.trim());
    if (!match)
        return null;
    const magnitude = Number(match[1]);
    const unit = match[2];
    const milliseconds = magnitude * NOTES_BASE_FIXED_DURATION_MULTIPLIERS[unit];
    return Number.isSafeInteger(milliseconds) ? milliseconds : null;
}
function parseFixedDateDuration(value, operand) {
    if (typeof value === "number") {
        return isNotesBaseDurationOperand(operand) && Number.isSafeInteger(value) ? value : null;
    }
    if (typeof value !== "string" || value.length > MAX_NOTES_BASE_FORMULA_STRING_LENGTH)
        return null;
    const match = /^([+-]?(?:\d+(?:\.\d+)?|\.\d+))\s*(d|days?|w|weeks?|h|hours?|m|minutes?|s|seconds?)$/u.exec(value.trim());
    if (!match)
        return null;
    const magnitude = Number(match[1]);
    const unit = match[2];
    const milliseconds = magnitude * NOTES_BASE_FIXED_DURATION_MULTIPLIERS[unit];
    return Number.isSafeInteger(milliseconds) ? milliseconds : null;
}
function offsetLocalCalendarMonths(timestamp, months) {
    if (!Number.isFinite(timestamp) || !Number.isSafeInteger(months))
        return null;
    const date = new Date(timestamp);
    if (!Number.isFinite(date.getTime()))
        return null;
    const day = date.getDate();
    date.setDate(1);
    date.setMonth(date.getMonth() + months);
    if (!Number.isFinite(date.getTime()))
        return null;
    const lastDay = new Date(date.getTime());
    lastDay.setMonth(lastDay.getMonth() + 1, 0);
    if (!Number.isFinite(lastDay.getTime()))
        return null;
    date.setDate(Math.min(day, lastDay.getDate()));
    return Number.isFinite(date.getTime()) ? date.getTime() : null;
}
function offsetNotesBaseDate(timestamp, value, operand, operator) {
    const fixedDuration = parseFixedDateDuration(value, operand);
    if (fixedDuration !== null) {
        const result = operator === "+" ? timestamp + fixedDuration : timestamp - fixedDuration;
        return Number.isFinite(result) ? result : null;
    }
    if (typeof value !== "string" || value.length > MAX_NOTES_BASE_FORMULA_STRING_LENGTH)
        return null;
    const match = /^([+-]?\d+)\s*(M|months?|y|years?)$/u.exec(value.trim());
    if (!match)
        return null;
    const magnitude = Number(match[1]);
    const monthsPerUnit = match[2] === "y" || match[2]?.startsWith("year") ? 12 : 1;
    const months = magnitude * monthsPerUnit * (operator === "+" ? 1 : -1);
    return Number.isSafeInteger(magnitude) && Number.isSafeInteger(months)
        ? offsetLocalCalendarMonths(timestamp, months)
        : null;
}
const NOTES_BASE_DATE_FIELD_ACCESSORS = {
    year: (date) => date.getFullYear(),
    month: (date) => date.getMonth() + 1,
    day: (date) => date.getDate(),
    hour: (date) => date.getHours(),
    minute: (date) => date.getMinutes(),
    second: (date) => date.getSeconds(),
    millisecond: (date) => date.getMilliseconds(),
};
function notesBaseDateValue(value) {
    if (typeof value !== "string")
        return null;
    const parsedInstant = parseLocalDate(value) ?? parseTimezoneOffsetDate(value);
    if (parsedInstant)
        return new Date(parsedInstant);
    if (!/^(?:\d{4}|[+-]\d{6})-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value))
        return null;
    const instant = new Date(value);
    return Number.isFinite(instant.getTime()) && instant.toISOString() === value
        ? instant
        : null;
}
function notesBaseDateTimestamp(value, operand) {
    return isNotesBaseDateOperand(operand) || isNotesBaseDateOffsetOperand(operand)
        ? notesBaseDateValue(value)?.getTime() ?? null
        : null;
}
function notesBaseFileOperandPath(value, operand) {
    const source = operand.trim();
    const hasFileProvenance = source === "file.file"
        || source === "this"
        || source === "this.file"
        || /^file\([\s\S]*\)$/u.test(source)
        || /\.asFile\(\s*\)$/u.test(source);
    return hasFileProvenance && typeof value === "string"
        ? normalizeNotesBaseFilePath(value)
        : null;
}
function isNotesBaseFileOperand(value, operand) {
    return notesBaseFileOperandPath(value, operand) !== null;
}
function notesBaseRelativeTime(date, now = new Date()) {
    const difference = date.getTime() - now.getTime();
    const absoluteMilliseconds = Math.abs(difference);
    const seconds = Math.round(absoluteMilliseconds / 1_000);
    const minutes = Math.round(absoluteMilliseconds / 60_000);
    const hours = Math.round(absoluteMilliseconds / 3_600_000);
    const days = Math.round(absoluteMilliseconds / 86_400_000);
    const months = Math.round(days * 4_800 / 146_097);
    const years = Math.round(days * 400 / 146_097);
    let value;
    if (seconds <= 44)
        value = "a few seconds";
    else if (minutes <= 1)
        value = "a minute";
    else if (minutes < 45)
        value = `${minutes} minutes`;
    else if (hours <= 1)
        value = "an hour";
    else if (hours < 22)
        value = `${hours} hours`;
    else if (days <= 1)
        value = "a day";
    else if (days < 26)
        value = `${days} days`;
    else if (months <= 1)
        value = "a month";
    else if (months < 11)
        value = `${months} months`;
    else if (years <= 1)
        value = "a year";
    else
        value = `${years} years`;
    return difference > 0 ? `in ${value}` : `${value} ago`;
}
function isNotesBaseValueType(value, expectedType, receiverSource) {
    const normalizedType = expectedType.toLowerCase();
    if (normalizedType === "any")
        return true;
    if (value == null)
        return normalizedType === "null";
    if (notesBaseLinkPath(value) !== null)
        return normalizedType === "link";
    if (normalizedType === "link")
        return false;
    if (notesBaseImageText(value) !== null)
        return normalizedType === "image";
    if (normalizedType === "image")
        return false;
    if (notesBaseIconName(value) !== null)
        return normalizedType === "icon";
    if (normalizedType === "icon")
        return false;
    if (notesBaseHtmlText(value) !== null)
        return normalizedType === "html";
    if (normalizedType === "html")
        return false;
    if (normalizedType === "regexp")
        return false;
    if (Array.isArray(value))
        return normalizedType === "list";
    if (isNotesBaseFileOperand(value, receiverSource))
        return normalizedType === "file";
    if (normalizedType === "file")
        return false;
    if (typeof value === "number" && Number.isSafeInteger(value) && isNotesBaseDurationOperand(receiverSource)) {
        return normalizedType === "duration";
    }
    if (normalizedType === "duration")
        return false;
    if (notesBaseDateTimestamp(value, receiverSource) !== null)
        return normalizedType === "date";
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
        return normalizedType === typeof value;
    }
    if (typeof value === "object") {
        const prototype = Object.getPrototypeOf(value);
        return normalizedType === "object" && (prototype === Object.prototype || prototype === null);
    }
    return false;
}
function evaluateNotesBaseIsTypeCall(call, resolveProperty, evaluateReceiver, sourceType) {
    const args = splitFormulaArgs(call.args);
    if (!args || args.length !== 1)
        return { supported: false };
    const typeLiteral = /^(['"])([\s\S]*)\1$/u.exec(args[0] ?? "");
    if (!typeLiteral)
        return { supported: false };
    const normalizedType = (typeLiteral[2] ?? "").toLowerCase();
    if (sourceType) {
        return { supported: true, value: normalizedType === sourceType || normalizedType === "any" };
    }
    const receiver = evaluateReceiver(call.receiver, resolveProperty);
    return receiver.supported
        ? { supported: true, value: isNotesBaseValueType(receiver.value, typeLiteral[2] ?? "", call.receiver) }
        : { supported: false };
}
function stringifyNotesBaseValue(value, listElement = false) {
    if (value == null)
        return listElement ? "" : "null";
    const linkText = notesBaseLinkText(value);
    if (linkText !== null)
        return linkText;
    const iconName = notesBaseIconName(value);
    if (iconName !== null)
        return iconName;
    const imageText = notesBaseImageText(value);
    if (imageText !== null)
        return imageText;
    const htmlText = notesBaseHtmlText(value);
    if (htmlText !== null)
        return htmlText;
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
        return String(value);
    }
    if (Array.isArray(value)) {
        const elements = value.map((element) => stringifyNotesBaseValue(element, true));
        return elements.some((element) => element === undefined) ? undefined : elements.join(",");
    }
    if (typeof value === "object") {
        try {
            const prototype = Object.getPrototypeOf(value);
            if (prototype === Object.prototype || prototype === null) {
                return "[object Object]";
            }
        }
        catch {
            return undefined;
        }
    }
    return undefined;
}
function notesBaseQuotedNotePropertyReference(value) {
    if (!value.startsWith("note["))
        return null;
    const match = /^note\[(['"])([\s\S]+)\1\]$/u.exec(value);
    const quote = match?.[1] ?? "";
    const name = match?.[2] ?? "";
    return (name.length > 0
        && name.length <= MAX_NOTES_BASE_FORMULA_STRING_LENGTH
        && !name.includes(quote)
        && !/[\u0000-\u001F\u007F\\]/u.test(name))
        ? `note.${name}`
        : null;
}
function notesBasePropertyReference(value) {
    return (/^[A-Za-z_][\w-]*$/u.test(value)
        || /^(?:file|formula|note)\.[A-Za-z_][\w-]*$/u.test(value)) ? value : notesBaseQuotedNotePropertyReference(value);
}
function evaluateNotesBaseThisFile(expression, context) {
    const match = /^(?:this|this\.file(?:\.(path|name|basename|folder|ext|size|properties|ctime|mtime|tags|backlinks|links|embeds))?)$/u.exec(expression);
    if (!match)
        return null;
    const path = context?.thisFile?.relativePath;
    const field = expression === "this" ? "" : match[1] ?? "";
    const normalizedPath = typeof path === "string"
        ? notesBaseFilePathField(path, "path")
        : null;
    if (normalizedPath === null) {
        return { supported: false };
    }
    if (field === "")
        return { supported: true, value: normalizedPath };
    if (field === "size") {
        const size = context?.thisFile?.sizeBytes;
        return typeof size === "number" && Number.isSafeInteger(size) && size >= 0
            ? { supported: true, value: size }
            : { supported: false };
    }
    if (field === "properties") {
        try {
            const properties = context?.filePropertiesFor
                ? notesBaseObjectSnapshot(context.filePropertiesFor(normalizedPath))
                : null;
            return properties === null
                ? { supported: false }
                : { supported: true, value: properties };
        }
        catch {
            return { supported: false };
        }
    }
    if (field === "ctime" || field === "mtime") {
        const timestamp = field === "ctime"
            ? context?.thisFile?.createdAt
            : context?.thisFile?.modifiedAt;
        const value = notesBaseFileTimestamp(timestamp);
        return value === undefined
            ? { supported: false }
            : { supported: true, value };
    }
    if (field === "tags") {
        try {
            const tags = context?.fileTagsFor
                ? notesBaseTagsSnapshot(context.fileTagsFor(normalizedPath))
                : null;
            return tags === null
                ? { supported: false }
                : { supported: true, value: tags };
        }
        catch {
            return { supported: false };
        }
    }
    if (field === "backlinks" || field === "links" || field === "embeds") {
        try {
            const lookup = field === "backlinks"
                ? context?.fileBacklinksFor
                : field === "links"
                    ? context?.fileLinksFor
                    : context?.fileEmbedsFor;
            const paths = lookup
                ? notesBaseFileLinksSnapshot(lookup(normalizedPath))
                : null;
            return paths === null
                ? { supported: false }
                : { supported: true, value: paths };
        }
        catch {
            return { supported: false };
        }
    }
    const value = notesBaseFilePathField(normalizedPath, field);
    return value === null
        ? { supported: false }
        : { supported: true, value };
}
function splitNotesBaseQuotedBracketMember(expression) {
    if (!expression.endsWith("]"))
        return null;
    const quote = expression[expression.length - 2] ?? "";
    if (quote !== "\"" && quote !== "'")
        return null;
    const openingIndex = expression.lastIndexOf(`[${quote}`, expression.length - 3);
    if (openingIndex < 1)
        return null;
    const receiver = expression.slice(0, openingIndex).trim();
    const encodedKey = expression.slice(openingIndex + 2, -2);
    if (!receiver || !encodedKey || encodedKey.length > MAX_NOTES_BASE_FORMULA_STRING_LENGTH) {
        return null;
    }
    let key = "";
    for (let index = 0; index < encodedKey.length; index += 1) {
        const character = encodedKey[index] ?? "";
        if (character !== "\\") {
            if (character === quote || /[\u0000-\u001F\u007F]/u.test(character))
                return null;
            key += character;
            continue;
        }
        const escaped = encodedKey[index + 1] ?? "";
        if (escaped !== quote && escaped !== "\\")
            return null;
        key += escaped;
        index += 1;
    }
    return key ? { key, receiver } : null;
}
function isNotesBaseFilePropertiesReceiver(expression) {
    return expression === "this.file.properties"
        || /^file\([\s\S]*\)\.properties$/u.test(expression);
}
function splitNotesBaseObjectMemberAccess(expression) {
    if (expression.length > MAX_NOTES_BASE_FORMULA_EXPRESSION_LENGTH)
        return null;
    const keys = [];
    let receiver = expression;
    while (keys.length <= MAX_NOTES_BASE_FORMULA_GROUP_DEPTH) {
        if (keys.length > 0 && isNotesBaseFilePropertiesReceiver(receiver))
            break;
        const bracket = splitNotesBaseQuotedBracketMember(receiver);
        const dot = bracket ? null : /^([\s\S]+)\.([A-Za-z_][\w]*)$/u.exec(receiver);
        if (!bracket && !dot)
            break;
        const nextReceiver = (bracket?.receiver ?? dot?.[1] ?? "").trim();
        if (nextReceiver === "note" || nextReceiver === "file" || nextReceiver === "formula")
            break;
        const key = bracket?.key ?? dot?.[2] ?? "";
        if (!nextReceiver
            || !key
            || key.length > MAX_NOTES_BASE_FORMULA_STRING_LENGTH
            || /[\u0000-\u001F\u007F]/u.test(key))
            return null;
        keys.push(key);
        receiver = nextReceiver;
    }
    const receiverIsSupported = (notesBasePropertyReference(receiver) !== null
        || (receiver.startsWith("{") && receiver.endsWith("}"))
        || isNotesBaseFilePropertiesReceiver(receiver));
    return keys.length > 0
        && keys.length <= MAX_NOTES_BASE_FORMULA_GROUP_DEPTH
        && receiverIsSupported
        ? { keys: keys.reverse(), receiver }
        : null;
}
function evaluateNotesBaseObjectMemberAccess(expression, resolveProperty, context) {
    const access = splitNotesBaseObjectMemberAccess(expression);
    if (!access)
        return null;
    const receiver = evaluateArg(access.receiver, resolveProperty, context);
    if (!receiver.supported)
        return { supported: false };
    let value = receiver.value;
    let objectKeyWork = 0;
    for (const key of access.keys) {
        const member = notesBaseObjectValue(value, key);
        if (member === null)
            return { supported: false };
        objectKeyWork += member.keyCount;
        if (objectKeyWork > MAX_NOTES_BASE_FORMULA_LIST_ELEMENTS)
            return { supported: false };
        value = member.value;
    }
    return { supported: true, value };
}
function evaluateArg(arg, resolveProperty, context) {
    const literal = /^(['"])([\s\S]*)\1$/u.exec(arg);
    if (literal) {
        const quote = literal[1] ?? "";
        const value = literal[2] ?? "";
        return value.includes(`\\${quote}`)
            ? { supported: false }
            : { supported: true, value };
    }
    if (/^-?\d+(?:\.\d+)?$/u.test(arg))
        return { supported: true, value: Number(arg) };
    if (arg === "true" || arg === "false")
        return { supported: true, value: arg === "true" };
    if (arg === "null")
        return { supported: true, value: null };
    const thisFile = evaluateNotesBaseThisFile(arg, context);
    if (thisFile)
        return thisFile;
    const objectMember = evaluateNotesBaseObjectMemberAccess(arg, resolveProperty, context);
    if (objectMember)
        return objectMember;
    if (arg === "this"
        || (arg.startsWith("this.") && !arg.startsWith("this.file.")))
        return { supported: false };
    const propertyReference = notesBasePropertyReference(arg);
    if (propertyReference !== null) {
        const value = resolveProperty(propertyReference);
        return value === NOTES_BASE_UNSUPPORTED_FORMULA_VALUE
            ? { supported: false }
            : { supported: true, value };
    }
    return evaluateNotesBaseFormula(arg, resolveProperty, context);
}
function evaluateNumericExtremum(args, source, resolveProperty, initialValue, combine, context) {
    if (args.length === 0
        || args.length > MAX_NOTES_BASE_FORMULA_LIST_ELEMENTS
        || /,\s*$/u.test(source)) {
        return { supported: false };
    }
    let result = initialValue;
    for (const arg of args) {
        const value = evaluateArg(arg, resolveProperty, context);
        if (!value.supported || typeof value.value !== "number" || !Number.isFinite(value.value)) {
            return { supported: false };
        }
        result = combine(result, value.value);
    }
    return { supported: true, value: result };
}
function evaluateStringQuery(call, resolveProperty, matches, context) {
    const args = splitFormulaArgs(call.args);
    if (!args || args.length !== 1 || /,\s*$/u.test(call.args))
        return { supported: false };
    const receiver = evaluateArg(call.receiver, resolveProperty, context);
    const query = evaluateArg(args[0] ?? "", resolveProperty, context);
    return receiver.supported && query.supported
        && typeof receiver.value === "string" && typeof query.value === "string"
        ? { supported: true, value: matches(receiver.value, query.value) }
        : { supported: false };
}
function isNotesBaseScalar(value) {
    return value == null
        || typeof value === "string"
        || typeof value === "boolean"
        || (typeof value === "number" && Number.isFinite(value));
}
function isBoundedNotesBaseScalar(value) {
    return isNotesBaseScalar(value)
        && (typeof value !== "string" || value.length <= MAX_NOTES_BASE_FORMULA_STRING_LENGTH);
}
function evaluateNotesBaseCompositeLiteralValue(expression, resolveProperty, context, depth, budget) {
    if (expression.startsWith("[") && expression.endsWith("]")) {
        return evaluateNotesBaseListLiteral(expression, resolveProperty, context, depth, budget)
            ?? { supported: false };
    }
    if (expression.startsWith("{") && expression.endsWith("}")) {
        return evaluateNotesBaseObjectLiteral(expression, resolveProperty, context, depth, budget)
            ?? { supported: false };
    }
    const result = evaluateArg(expression, resolveProperty, context);
    return result.supported && isBoundedNotesBaseScalar(result.value)
        ? result
        : { supported: false };
}
function evaluateNotesBaseListIndex(expression, resolveProperty, context) {
    const match = NOTES_BASE_LIST_INDEX_EXPRESSION.exec(expression);
    if (!match)
        return null;
    const receiverSource = (match[1] ?? "").trim();
    if (!receiverSource || NOTES_BASE_LIST_INDEX_EXPRESSION.test(receiverSource)) {
        return { supported: false };
    }
    const index = Number(match[2]);
    if (!Number.isSafeInteger(index) || index >= MAX_NOTES_BASE_FORMULA_LIST_ELEMENTS) {
        return { supported: false };
    }
    const receiver = evaluateArg(receiverSource, resolveProperty, context);
    if (!receiver.supported || !Array.isArray(receiver.value))
        return { supported: false };
    try {
        const lengthDescriptor = Object.getOwnPropertyDescriptor(receiver.value, "length");
        const elementDescriptor = Object.getOwnPropertyDescriptor(receiver.value, String(index));
        if (!lengthDescriptor
            || !("value" in lengthDescriptor)
            || typeof lengthDescriptor.value !== "number"
            || !Number.isSafeInteger(lengthDescriptor.value)
            || lengthDescriptor.value > MAX_NOTES_BASE_FORMULA_LIST_ELEMENTS
            || index >= lengthDescriptor.value
            || !elementDescriptor
            || !("value" in elementDescriptor)
            || !(Array.isArray(elementDescriptor.value)
                ? receiverSource.startsWith("[")
                    && receiverSource.endsWith("]")
                : isBoundedNotesBaseScalar(elementDescriptor.value))) {
            return { supported: false };
        }
        return { supported: true, value: elementDescriptor.value };
    }
    catch {
        return { supported: false };
    }
}
function evaluateNotesBaseListLiteral(expression, resolveProperty, context, depth = 1, budget = { valueCount: 0, stringLength: 0 }) {
    if (!expression.startsWith("[") || !expression.endsWith("]"))
        return null;
    if (depth > MAX_NOTES_BASE_FORMULA_GROUP_DEPTH)
        return { supported: false };
    const source = expression.slice(1, -1);
    if (!source.trim())
        return { supported: true, value: [] };
    const elements = splitFormulaArgs(source);
    if (!elements
        || elements.length > MAX_NOTES_BASE_FORMULA_LIST_ELEMENTS
        || elements.some((element) => !element)
        || /,\s*$/u.test(source)) {
        return { supported: false };
    }
    const value = [];
    for (const element of elements) {
        budget.valueCount += 1;
        if (budget.valueCount > MAX_NOTES_BASE_FORMULA_LIST_ELEMENTS)
            return { supported: false };
        const result = evaluateNotesBaseCompositeLiteralValue(element, resolveProperty, context, depth + 1, budget);
        if (!result.supported)
            return { supported: false };
        if (typeof result.value === "string") {
            budget.stringLength += result.value.length;
            if (budget.stringLength > MAX_NOTES_BASE_FORMULA_STRING_LENGTH)
                return { supported: false };
        }
        value.push(result.value);
    }
    return { supported: true, value };
}
function splitNotesBaseObjectEntry(source) {
    let quote = "";
    let depth = 0;
    let separatorIndex = -1;
    for (let index = 0; index < source.length; index += 1) {
        const char = source[index] ?? "";
        if ((char === "\"" || char === "'") && !isNotesBaseFormulaQuoteEscaped(source, index)) {
            if (!quote)
                quote = char;
            else if (char === quote)
                quote = "";
        }
        if (quote || char === "\"" || char === "'") {
            continue;
        }
        if (char === "(" || char === "[" || char === "{")
            depth += 1;
        if (char === ")" || char === "]" || char === "}")
            depth -= 1;
        if (depth < 0)
            return null;
        if (char === ":" && depth === 0) {
            if (separatorIndex >= 0)
                return null;
            separatorIndex = index;
        }
    }
    if (quote || depth !== 0 || separatorIndex < 0)
        return null;
    return {
        key: source.slice(0, separatorIndex).trim(),
        value: source.slice(separatorIndex + 1).trim(),
    };
}
function evaluateNotesBaseObjectLiteral(expression, resolveProperty, context, depth = 1, budget = { valueCount: 0, stringLength: 0 }) {
    if (!expression.startsWith("{") || !expression.endsWith("}"))
        return null;
    if (depth > MAX_NOTES_BASE_FORMULA_GROUP_DEPTH)
        return { supported: false };
    const source = expression.slice(1, -1);
    const value = {};
    if (!source.trim())
        return { supported: true, value };
    const entries = splitFormulaArgs(source);
    if (!entries
        || entries.length > MAX_NOTES_BASE_FORMULA_LIST_ELEMENTS
        || entries.some((entry) => !entry)
        || /,\s*$/u.test(source)) {
        return { supported: false };
    }
    const keys = new Set();
    for (const entrySource of entries) {
        budget.valueCount += 1;
        if (budget.valueCount > MAX_NOTES_BASE_FORMULA_LIST_ELEMENTS)
            return { supported: false };
        const entry = splitNotesBaseObjectEntry(entrySource);
        const keyLiteral = entry ? /^(['"])([\s\S]*)\1$/u.exec(entry.key) : null;
        const quote = keyLiteral?.[1] ?? "";
        const key = keyLiteral?.[2] ?? "";
        if (!entry
            || !key
            || key.length > MAX_NOTES_BASE_FORMULA_STRING_LENGTH
            || key.includes(quote)
            || /[\u0000-\u001F\u007F\\]/u.test(key)
            || keys.has(key)) {
            return { supported: false };
        }
        budget.stringLength += key.length;
        if (budget.stringLength > MAX_NOTES_BASE_FORMULA_STRING_LENGTH)
            return { supported: false };
        const result = evaluateNotesBaseCompositeLiteralValue(entry.value, resolveProperty, context, depth + 1, budget);
        if (!result.supported)
            return { supported: false };
        if (typeof result.value === "string") {
            budget.stringLength += result.value.length;
            if (budget.stringLength > MAX_NOTES_BASE_FORMULA_STRING_LENGTH)
                return { supported: false };
        }
        keys.add(key);
        Object.defineProperty(value, key, {
            configurable: true,
            enumerable: true,
            value: result.value,
            writable: true,
        });
    }
    return { supported: true, value };
}
function evaluateListJoin(call, resolveProperty, context) {
    const args = splitFormulaArgs(call.args);
    if (!args || args.length !== 1 || /,\s*$/u.test(call.args))
        return { supported: false };
    const receiver = evaluateArg(call.receiver, resolveProperty, context);
    const separator = evaluateArg(args[0] ?? "", resolveProperty, context);
    if (!receiver.supported
        || !Array.isArray(receiver.value)
        || receiver.value.length > MAX_NOTES_BASE_FORMULA_LIST_ELEMENTS
        || !separator.supported
        || typeof separator.value !== "string") {
        return { supported: false };
    }
    const values = [];
    let projectedLength = separator.value.length * Math.max(0, receiver.value.length - 1);
    if (projectedLength > MAX_NOTES_BASE_FORMULA_STRING_LENGTH)
        return { supported: false };
    for (const value of receiver.value) {
        if (!isNotesBaseScalar(value))
            return { supported: false };
        const text = value == null ? "" : String(value);
        projectedLength += text.length;
        if (projectedLength > MAX_NOTES_BASE_FORMULA_STRING_LENGTH)
            return { supported: false };
        values.push(text);
    }
    return { supported: true, value: values.join(separator.value) };
}
function evaluateListUnique(call, resolveProperty, context) {
    const args = splitFormulaArgs(call.args);
    if (!args || args.length !== 0)
        return { supported: false };
    const receiver = evaluateArg(call.receiver, resolveProperty, context);
    if (!receiver.supported
        || !Array.isArray(receiver.value)
        || receiver.value.length > MAX_NOTES_BASE_FORMULA_LIST_ELEMENTS
        || !receiver.value.every(isNotesBaseScalar)) {
        return { supported: false };
    }
    return { supported: true, value: [...new Set(receiver.value)] };
}
function evaluateListSort(call, resolveProperty, context) {
    const args = splitFormulaArgs(call.args);
    if (!args || args.length !== 0)
        return { supported: false };
    const receiver = evaluateArg(call.receiver, resolveProperty, context);
    if (!receiver.supported
        || !Array.isArray(receiver.value)
        || receiver.value.length > MAX_NOTES_BASE_FORMULA_LIST_ELEMENTS
        || !receiver.value.every(isNotesBaseScalar)) {
        return { supported: false };
    }
    return {
        supported: true,
        value: [...receiver.value].sort((left, right) => (typeof left === "number" && typeof right === "number"
            ? left - right
            : NOTES_BASE_FORMULA_LIST_COLLATOR.compare(String(left), String(right)))),
    };
}
function evaluateListFlat(call, resolveProperty, context) {
    const args = splitFormulaArgs(call.args);
    if (!args || args.length !== 0)
        return { supported: false };
    const receiver = evaluateArg(call.receiver, resolveProperty, context);
    if (!receiver.supported
        || !Array.isArray(receiver.value)
        || receiver.value.length > MAX_NOTES_BASE_FORMULA_LIST_ELEMENTS) {
        return { supported: false };
    }
    const flattened = [];
    const pending = [{ type: "leave", value: receiver.value }];
    for (let index = receiver.value.length - 1; index >= 0; index -= 1) {
        pending.push({ type: "value", value: receiver.value[index] });
    }
    const activeArrays = new WeakSet([receiver.value]);
    let nestedArrayCount = 0;
    while (pending.length > 0) {
        const entry = pending.pop();
        if (!entry)
            break;
        if (entry.type === "leave") {
            activeArrays.delete(entry.value);
            continue;
        }
        const { value } = entry;
        if (Array.isArray(value)) {
            if (value.length > MAX_NOTES_BASE_FORMULA_LIST_ELEMENTS)
                return { supported: false };
            if (activeArrays.has(value))
                return { supported: false };
            activeArrays.add(value);
            nestedArrayCount += 1;
            if (nestedArrayCount > MAX_NOTES_BASE_FORMULA_LIST_ELEMENTS)
                return { supported: false };
            pending.push({ type: "leave", value });
            for (let index = value.length - 1; index >= 0; index -= 1) {
                pending.push({ type: "value", value: value[index] });
            }
            continue;
        }
        if (!isNotesBaseScalar(value))
            return { supported: false };
        flattened.push(value);
        if (flattened.length > MAX_NOTES_BASE_FORMULA_LIST_ELEMENTS)
            return { supported: false };
    }
    return { supported: true, value: flattened };
}
function evaluateListCallback(call, resolveProperty, mode, context) {
    const args = splitFormulaArgs(call.args);
    if (!args || args.length !== 1 || /,\s*$/u.test(call.args))
        return { supported: false };
    const receiver = evaluateArg(call.receiver, resolveProperty, context);
    if (!receiver.supported
        || !Array.isArray(receiver.value)
        || receiver.value.length > MAX_NOTES_BASE_FORMULA_LIST_ELEMENTS) {
        return { supported: false };
    }
    const expression = args[0] ?? "";
    if (expression.length > MAX_NOTES_BASE_FORMULA_STRING_LENGTH
        || expression.length * receiver.value.length > MAX_NOTES_BASE_FORMULA_LIST_CALLBACK_WORK
        || containsMemberCall(expression, NOTES_BASE_FORMULA_LIST_CALLBACK_FORBIDDEN_METHODS)) {
        return { supported: false };
    }
    const resultValues = [];
    let sourceStringLength = 0;
    let resultStringLength = 0;
    for (let index = 0; index < receiver.value.length; index += 1) {
        const value = receiver.value[index];
        if (!isBoundedNotesBaseScalar(value))
            return { supported: false };
        if (typeof value === "string") {
            sourceStringLength += value.length;
            if (sourceStringLength > MAX_NOTES_BASE_FORMULA_STRING_LENGTH)
                return { supported: false };
        }
        const result = evaluateArg(expression, (property) => {
            if (property === "value")
                return value;
            if (property === "index")
                return index;
            return resolveProperty(property);
        }, context);
        if (!result.supported)
            return { supported: false };
        if (mode === "filter") {
            if (typeof result.value !== "boolean")
                return { supported: false };
            if (result.value)
                resultValues.push(value);
            continue;
        }
        if (!isBoundedNotesBaseScalar(result.value))
            return { supported: false };
        if (typeof result.value === "string") {
            resultStringLength += result.value.length;
            if (resultStringLength > MAX_NOTES_BASE_FORMULA_STRING_LENGTH)
                return { supported: false };
        }
        resultValues.push(result.value);
    }
    return { supported: true, value: resultValues };
}
function evaluateListFilter(call, resolveProperty, context) {
    return evaluateListCallback(call, resolveProperty, "filter", context);
}
function evaluateListMap(call, resolveProperty, context) {
    return evaluateListCallback(call, resolveProperty, "map", context);
}
function evaluateListReduce(call, resolveProperty, context) {
    const args = splitFormulaArgs(call.args);
    if (!args || args.length !== 2 || /,\s*$/u.test(call.args))
        return { supported: false };
    const expression = args[0] ?? "";
    const initialExpression = args[1] ?? "";
    if (expression.length > MAX_NOTES_BASE_FORMULA_STRING_LENGTH
        || initialExpression.length > MAX_NOTES_BASE_FORMULA_STRING_LENGTH
        || containsMemberCall(expression, NOTES_BASE_FORMULA_LIST_CALLBACK_FORBIDDEN_METHODS)
        || containsMemberCall(initialExpression, NOTES_BASE_FORMULA_LIST_CALLBACK_FORBIDDEN_METHODS)) {
        return { supported: false };
    }
    const receiver = evaluateArg(call.receiver, resolveProperty, context);
    if (!receiver.supported
        || !Array.isArray(receiver.value)
        || receiver.value.length > MAX_NOTES_BASE_FORMULA_LIST_ELEMENTS
        || expression.length * receiver.value.length > MAX_NOTES_BASE_FORMULA_LIST_CALLBACK_WORK) {
        return { supported: false };
    }
    const initial = evaluateArg(initialExpression, resolveProperty, context);
    if (!initial.supported || !isBoundedNotesBaseScalar(initial.value))
        return { supported: false };
    let accumulator = initial.value;
    let sourceStringLength = 0;
    let accumulatorStringWork = 0;
    for (let index = 0; index < receiver.value.length; index += 1) {
        const value = receiver.value[index];
        if (!isBoundedNotesBaseScalar(value))
            return { supported: false };
        if (typeof value === "string") {
            sourceStringLength += value.length;
            if (sourceStringLength > MAX_NOTES_BASE_FORMULA_STRING_LENGTH)
                return { supported: false };
        }
        const result = evaluateArg(expression, (property) => {
            if (property === "value")
                return value;
            if (property === "index")
                return index;
            if (property === "acc")
                return accumulator;
            return resolveProperty(property);
        }, context);
        if (!result.supported || !isBoundedNotesBaseScalar(result.value))
            return { supported: false };
        if (typeof result.value === "string") {
            accumulatorStringWork += result.value.length;
            if (accumulatorStringWork > MAX_NOTES_BASE_FORMULA_LIST_CALLBACK_WORK)
                return { supported: false };
        }
        accumulator = result.value;
    }
    return { supported: true, value: accumulator };
}
function evaluateContains(call, resolveProperty, arity = "one", quantifier = "all", context) {
    const args = splitFormulaArgs(call.args);
    if (!args
        || (arity === "one" ? args.length !== 1 : args.length === 0)
        || /,\s*$/u.test(call.args)) {
        return { supported: false };
    }
    const receiver = evaluateArg(call.receiver, resolveProperty, context);
    if (!receiver.supported)
        return { supported: false };
    if (typeof receiver.value === "string") {
        const source = receiver.value;
        const queries = [];
        for (const arg of args) {
            const query = evaluateArg(arg, resolveProperty, context);
            if (!query.supported || typeof query.value !== "string")
                return { supported: false };
            queries.push(query.value);
        }
        return {
            supported: true,
            value: quantifier === "all"
                ? queries.every((query) => source.includes(query))
                : queries.some((query) => source.includes(query)),
        };
    }
    if (!Array.isArray(receiver.value)
        || receiver.value.length > MAX_NOTES_BASE_FORMULA_LIST_ELEMENTS
        || args.length > MAX_NOTES_BASE_FORMULA_LIST_ELEMENTS) {
        return { supported: false };
    }
    const scalarValues = new Set();
    const linkPaths = new Set();
    for (const value of receiver.value) {
        const path = notesBaseLinkPath(value);
        if (path !== null) {
            linkPaths.add(path);
            continue;
        }
        scalarValues.add(value);
        if (typeof value === "string") {
            const normalizedPath = normalizeNotesBaseFilePath(value);
            if (normalizedPath !== null)
                linkPaths.add(normalizedPath);
        }
    }
    let matches = quantifier === "all";
    for (const arg of args) {
        const query = evaluateArg(arg, resolveProperty, context);
        if (!query.supported)
            return { supported: false };
        const path = notesBaseLinkPath(query.value) ?? notesBaseFileOperandPath(query.value, arg);
        let matched;
        if (path !== null) {
            matched = linkPaths.has(path);
        }
        else {
            if (!isNotesBaseScalar(query.value))
                return { supported: false };
            matched = scalarValues.has(query.value);
        }
        matches = quantifier === "all"
            ? matches && matched
            : matches || matched;
    }
    return {
        supported: true,
        value: matches,
    };
}
function evaluateStringTransform(call, resolveProperty, transform, context) {
    const args = splitFormulaArgs(call.args);
    if (!args || args.length !== 0)
        return { supported: false };
    const receiver = evaluateArg(call.receiver, resolveProperty, context);
    if (!receiver.supported || typeof receiver.value !== "string" || receiver.value.length > MAX_NOTES_BASE_FORMULA_STRING_LENGTH) {
        return { supported: false };
    }
    const value = transform(receiver.value);
    return value.length <= MAX_NOTES_BASE_FORMULA_STRING_LENGTH
        ? { supported: true, value }
        : { supported: false };
}
function evaluateReverse(call, resolveProperty, context) {
    const args = splitFormulaArgs(call.args);
    if (!args || args.length !== 0)
        return { supported: false };
    const receiver = evaluateArg(call.receiver, resolveProperty, context);
    if (!receiver.supported)
        return { supported: false };
    if (typeof receiver.value === "string") {
        if (receiver.value.length > MAX_NOTES_BASE_FORMULA_STRING_LENGTH)
            return { supported: false };
        return { supported: true, value: Array.from(receiver.value).reverse().join("") };
    }
    if (!Array.isArray(receiver.value)
        || receiver.value.length > MAX_NOTES_BASE_FORMULA_LIST_ELEMENTS
        || !receiver.value.every(isNotesBaseScalar)) {
        return { supported: false };
    }
    return { supported: true, value: [...receiver.value].reverse() };
}
function evaluateNumberRound(call, resolveProperty, context) {
    const args = splitFormulaArgs(call.args);
    if (!args || args.length > 1 || /,\s*$/u.test(call.args))
        return { supported: false };
    const receiver = evaluateArg(call.receiver, resolveProperty, context);
    if (!receiver.supported || typeof receiver.value !== "number" || !Number.isFinite(receiver.value)) {
        return { supported: false };
    }
    if (args.length === 0)
        return { supported: true, value: Math.round(receiver.value) };
    const digits = evaluateArg(args[0] ?? "", resolveProperty, context);
    if (!digits.supported || typeof digits.value !== "number" || !Number.isFinite(digits.value)) {
        return { supported: false };
    }
    if (digits.value <= 0)
        return { supported: true, value: Math.round(receiver.value) };
    const factor = 10 ** digits.value;
    if (!Number.isFinite(factor))
        return { supported: false };
    const scaled = receiver.value * factor;
    if (!Number.isFinite(scaled))
        return { supported: false };
    const value = Math.round(scaled) / factor;
    return Number.isFinite(value) ? { supported: true, value } : { supported: false };
}
function evaluateNumberToFixed(call, resolveProperty, context) {
    const args = splitFormulaArgs(call.args);
    if (!args || args.length !== 1 || /,\s*$/u.test(call.args))
        return { supported: false };
    const receiver = evaluateArg(call.receiver, resolveProperty, context);
    const precision = evaluateArg(args[0] ?? "", resolveProperty, context);
    if (!receiver.supported || typeof receiver.value !== "number" || !Number.isFinite(receiver.value)
        || !precision.supported || typeof precision.value !== "number" || !Number.isFinite(precision.value)) {
        return { supported: false };
    }
    const normalizedPrecision = Math.trunc(precision.value);
    return normalizedPrecision >= 0 && normalizedPrecision <= 100
        ? { supported: true, value: receiver.value.toFixed(normalizedPrecision) }
        : { supported: false };
}
function titleCaseNotesBaseString(source) {
    return source.replace(/[\p{L}\p{M}\p{N}]+/gu, (word) => word.replace(/\p{L}/u, (letter) => letter.toUpperCase()));
}
function evaluateStringRepeat(call, resolveProperty, context) {
    const args = splitFormulaArgs(call.args);
    if (!args || args.length !== 1 || /,\s*$/u.test(call.args))
        return { supported: false };
    const receiver = evaluateArg(call.receiver, resolveProperty, context);
    const count = evaluateArg(args[0] ?? "", resolveProperty, context);
    if (!receiver.supported || typeof receiver.value !== "string" || !count.supported || typeof count.value !== "number" || !Number.isFinite(count.value)) {
        return { supported: false };
    }
    const repetitions = Math.trunc(count.value);
    if (repetitions < 0 || receiver.value.length * repetitions > MAX_NOTES_BASE_FORMULA_STRING_LENGTH) {
        return { supported: false };
    }
    return { supported: true, value: receiver.value.repeat(repetitions) };
}
function evaluateStringReplace(call, resolveProperty, context) {
    const evaluateNestedArg = (arg, resolver) => (evaluateArg(arg, resolver, context));
    if (call.args.trimStart().startsWith("/")) {
        return evaluateNotesBaseRegexpReplaceCall(call, resolveProperty, splitFormulaArgs, evaluateNestedArg, MAX_NOTES_BASE_FORMULA_STRING_LENGTH);
    }
    const args = splitFormulaArgs(call.args);
    if (!args || args.length !== 2 || /,\s*$/u.test(call.args))
        return { supported: false };
    const receiver = evaluateNestedArg(call.receiver, resolveProperty);
    const pattern = evaluateNestedArg(args[0] ?? "", resolveProperty);
    const replacement = evaluateNestedArg(args[1] ?? "", resolveProperty);
    if (!receiver.supported || typeof receiver.value !== "string"
        || !pattern.supported || typeof pattern.value !== "string"
        || !replacement.supported || typeof replacement.value !== "string") {
        return { supported: false };
    }
    if (pattern.value === "") {
        const replacementText = replacement.value;
        const projectedLength = receiver.value.length
            + (receiver.value.length + 1) * replacementText.length;
        return projectedLength <= MAX_NOTES_BASE_FORMULA_STRING_LENGTH
            ? { supported: true, value: receiver.value.replaceAll("", () => replacementText) }
            : { supported: false };
    }
    const lengthDelta = replacement.value.length - pattern.value.length;
    let projectedLength = receiver.value.length;
    let matchIndex = receiver.value.indexOf(pattern.value);
    while (matchIndex >= 0) {
        projectedLength += lengthDelta;
        if (lengthDelta >= 0 && projectedLength > MAX_NOTES_BASE_FORMULA_STRING_LENGTH) {
            return { supported: false };
        }
        matchIndex = receiver.value.indexOf(pattern.value, matchIndex + pattern.value.length);
    }
    if (projectedLength > MAX_NOTES_BASE_FORMULA_STRING_LENGTH)
        return { supported: false };
    return { supported: true, value: receiver.value.split(pattern.value).join(replacement.value) };
}
function evaluateSlice(call, resolveProperty, context) {
    const args = splitFormulaArgs(call.args);
    if (!args || args.length < 1 || args.length > 2 || /,\s*$/u.test(call.args))
        return { supported: false };
    const receiver = evaluateArg(call.receiver, resolveProperty, context);
    if (!receiver.supported || (typeof receiver.value !== "string" && !Array.isArray(receiver.value))) {
        return { supported: false };
    }
    if (typeof receiver.value === "string" && receiver.value.length > MAX_NOTES_BASE_FORMULA_STRING_LENGTH) {
        return { supported: false };
    }
    if (Array.isArray(receiver.value)
        && (receiver.value.length > MAX_NOTES_BASE_FORMULA_LIST_ELEMENTS
            || !receiver.value.every(isNotesBaseScalar))) {
        return { supported: false };
    }
    const start = evaluateArg(args[0] ?? "", resolveProperty, context);
    if (!start.supported || typeof start.value !== "number" || !Number.isFinite(start.value)) {
        return { supported: false };
    }
    if (args.length === 1)
        return { supported: true, value: receiver.value.slice(start.value) };
    const end = evaluateArg(args[1] ?? "", resolveProperty, context);
    if (!end.supported || typeof end.value !== "number" || !Number.isFinite(end.value)) {
        return { supported: false };
    }
    return { supported: true, value: receiver.value.slice(start.value, end.value) };
}
function evaluateStringSplit(call, resolveProperty, context) {
    const evaluateNestedArg = (arg, resolver) => (evaluateArg(arg, resolver, context));
    if (call.args.trimStart().startsWith("/")) {
        return evaluateNotesBaseRegexpSplitCall(call, resolveProperty, splitFormulaArgs, evaluateNestedArg, MAX_NOTES_BASE_FORMULA_LIST_ELEMENTS);
    }
    const args = splitFormulaArgs(call.args);
    if (!args || args.length < 1 || args.length > 2 || /,\s*$/u.test(call.args))
        return { supported: false };
    const receiver = evaluateNestedArg(call.receiver, resolveProperty);
    const separator = evaluateNestedArg(args[0] ?? "", resolveProperty);
    if (!receiver.supported || typeof receiver.value !== "string" || !separator.supported || typeof separator.value !== "string") {
        return { supported: false };
    }
    let limit = MAX_NOTES_BASE_FORMULA_LIST_ELEMENTS + 1;
    if (args.length === 2) {
        const requestedLimit = evaluateNestedArg(args[1] ?? "", resolveProperty);
        if (!requestedLimit.supported || typeof requestedLimit.value !== "number" || !Number.isFinite(requestedLimit.value)) {
            return { supported: false };
        }
        limit = Math.min(requestedLimit.value >>> 0, limit);
    }
    const value = receiver.value.split(separator.value, limit);
    return value.length <= MAX_NOTES_BASE_FORMULA_LIST_ELEMENTS
        ? { supported: true, value }
        : { supported: false };
}
export function evaluateNotesBaseFormula(expression, resolveProperty, context) {
    const evaluateNestedArg = (arg, resolver) => (evaluateArg(arg, resolver, context));
    const trimmed = expression.trim();
    const regexpAnyValueCall = trimmed.startsWith("/")
        ? evaluateNotesBaseRegexpAnyValueCall(trimmed)
        : null;
    if (regexpAnyValueCall)
        return regexpAnyValueCall;
    const regexpTypeCall = trimmed.startsWith("/") ? splitNotesBaseRegexpIsTypeCall(trimmed) : null;
    if (regexpTypeCall) {
        return evaluateNotesBaseIsTypeCall(regexpTypeCall, resolveProperty, evaluateNestedArg, "regexp");
    }
    const unwrapped = unwrapBoundedFormulaGroup(trimmed);
    if (unwrapped === null)
        return { supported: false };
    if (unwrapped !== trimmed) {
        return unwrapped.length > 0
            ? evaluateNestedArg(unwrapped, resolveProperty)
            : { supported: false };
    }
    const listIndex = evaluateNotesBaseListIndex(trimmed, resolveProperty, context);
    if (listIndex)
        return listIndex;
    const listLiteral = evaluateNotesBaseListLiteral(trimmed, resolveProperty, context);
    if (listLiteral)
        return listLiteral;
    const objectLiteral = evaluateNotesBaseObjectLiteral(trimmed, resolveProperty, context);
    if (objectLiteral)
        return objectLiteral;
    const matchesCall = splitMemberCall(trimmed, "matches");
    if (matchesCall) {
        return evaluateNotesBaseRegexpMatchesCall(matchesCall, resolveProperty, splitFormulaArgs, evaluateNestedArg);
    }
    const booleanOr = evaluateNotesBaseBooleanOr(trimmed, resolveProperty, evaluateNestedArg, isNotesBaseSafeShortCircuitOperand);
    if (booleanOr)
        return booleanOr;
    const booleanAnd = evaluateNotesBaseBooleanAnd(trimmed, resolveProperty, evaluateNestedArg, isNotesBaseSafeShortCircuitOperand);
    if (booleanAnd)
        return booleanAnd;
    const comparison = evaluateNotesBaseComparison(trimmed, resolveProperty, evaluateNestedArg, notesBaseDateTimestamp, notesBaseFileOperandPath);
    if (comparison)
        return comparison;
    const booleanNot = evaluateNotesBaseBooleanNot(trimmed, resolveProperty, evaluateNestedArg);
    if (booleanNot)
        return booleanNot;
    const additive = evaluateNotesBaseAdditive(trimmed, resolveProperty, evaluateNestedArg, notesBaseDateTimestamp, offsetNotesBaseDate);
    if (additive)
        return additive;
    const multiplicative = evaluateNotesBaseMultiplicative(trimmed, resolveProperty, evaluateNestedArg);
    if (multiplicative)
        return multiplicative;
    const unaryNumeric = evaluateNotesBaseUnaryNumeric(trimmed, resolveProperty, evaluateNestedArg, rejectNotesBaseUnaryNumericOperand);
    if (unaryNumeric)
        return unaryNumeric;
    const dateField = /^(.*)\.(year|month|day|hour|minute|second|millisecond)$/u.exec(trimmed);
    if (dateField) {
        const receiver = evaluateNestedArg((dateField[1] ?? "").trim(), resolveProperty);
        const date = receiver.supported ? notesBaseDateValue(receiver.value) : null;
        if (!date)
            return { supported: false };
        const field = dateField[2];
        return { supported: true, value: NOTES_BASE_DATE_FIELD_ACCESSORS[field](date) };
    }
    const projectedFileSize = /^(file\([\s\S]*\))\.size$/u.exec(trimmed);
    if (projectedFileSize) {
        const path = projectedFilePath(projectedFileSize[1] ?? "", resolveProperty, evaluateNestedArg);
        if (!path || !context?.fileSizeFor)
            return { supported: false };
        try {
            const size = context.fileSizeFor(path);
            return typeof size === "number" && Number.isSafeInteger(size) && size >= 0
                ? { supported: true, value: size }
                : { supported: false };
        }
        catch {
            return { supported: false };
        }
    }
    const projectedFileTimestamp = /^(file\([\s\S]*\))\.(ctime|mtime)$/u.exec(trimmed);
    if (projectedFileTimestamp) {
        const path = projectedFilePath(projectedFileTimestamp[1] ?? "", resolveProperty, evaluateNestedArg);
        const lookup = projectedFileTimestamp[2] === "ctime"
            ? context?.fileCreatedAtFor
            : context?.fileModifiedAtFor;
        if (!path || !lookup)
            return { supported: false };
        try {
            const timestamp = lookup(path);
            const value = notesBaseFileTimestamp(timestamp);
            return value !== undefined
                ? { supported: true, value }
                : { supported: false };
        }
        catch {
            return { supported: false };
        }
    }
    const projectedFileProperties = /^(file\([\s\S]*\))\.properties$/u.exec(trimmed);
    if (projectedFileProperties) {
        const receiverSource = projectedFileProperties[1] ?? "";
        const path = projectedFilePath(receiverSource, resolveProperty, evaluateNestedArg);
        if (!path || !context?.filePropertiesFor)
            return { supported: false };
        try {
            const properties = notesBaseObjectSnapshot(context.filePropertiesFor(path));
            return properties === null
                ? { supported: false }
                : { supported: true, value: properties };
        }
        catch {
            return { supported: false };
        }
    }
    const projectedFilePathList = /^(file\([\s\S]*\))\.(backlinks|embeds|links)$/u.exec(trimmed);
    if (projectedFilePathList) {
        const receiverSource = projectedFilePathList[1] ?? "";
        const lookup = projectedFilePathList[2] === "backlinks"
            ? context?.fileBacklinksFor
            : projectedFilePathList[2] === "embeds"
                ? context?.fileEmbedsFor
                : context?.fileLinksFor;
        const path = projectedFilePath(receiverSource, resolveProperty, evaluateNestedArg);
        if (!path || !lookup)
            return { supported: false };
        try {
            const paths = notesBaseFileLinksSnapshot(lookup(path));
            return paths === null
                ? { supported: false }
                : { supported: true, value: paths };
        }
        catch {
            return { supported: false };
        }
    }
    const projectedFileTags = /^(file\([\s\S]*\))\.tags$/u.exec(trimmed);
    if (projectedFileTags) {
        const receiverSource = projectedFileTags[1] ?? "";
        const path = projectedFilePath(receiverSource, resolveProperty, evaluateNestedArg);
        if (!path || !context?.fileTagsFor)
            return { supported: false };
        try {
            const tags = notesBaseTagsSnapshot(context.fileTagsFor(path));
            return tags === null
                ? { supported: false }
                : { supported: true, value: tags };
        }
        catch {
            return { supported: false };
        }
    }
    const filePathField = /^(file\([\s\S]*\))\.(path|name|basename|folder|ext)$/u.exec(trimmed);
    if (filePathField) {
        const path = projectedFilePath(filePathField[1] ?? "", resolveProperty, evaluateNestedArg);
        const value = path === null ? null : notesBaseFilePathField(path, filePathField[2] ?? "");
        return value === null
            ? { supported: false }
            : { supported: true, value };
    }
    const dateCall = splitMemberCall(trimmed, "date");
    if (dateCall) {
        const args = splitFormulaArgs(dateCall.args);
        if (!args || args.length !== 0)
            return { supported: false };
        const receiver = evaluateNestedArg(dateCall.receiver, resolveProperty);
        const date = receiver.supported ? notesBaseDateValue(receiver.value) : null;
        return date
            ? { supported: true, value: localCalendarDate(date) }
            : { supported: false };
    }
    const timeCall = splitMemberCall(trimmed, "time");
    if (timeCall) {
        const args = splitFormulaArgs(timeCall.args);
        if (!args || args.length !== 0)
            return { supported: false };
        const receiver = evaluateNestedArg(timeCall.receiver, resolveProperty);
        const date = receiver.supported ? notesBaseDateValue(receiver.value) : null;
        return date
            ? { supported: true, value: localClockTime(date) }
            : { supported: false };
    }
    const relativeCall = splitMemberCall(trimmed, "relative");
    if (relativeCall) {
        const args = splitFormulaArgs(relativeCall.args);
        if (!args || args.length !== 0)
            return { supported: false };
        const receiver = evaluateNestedArg(relativeCall.receiver, resolveProperty);
        const date = receiver.supported ? notesBaseDateValue(receiver.value) : null;
        return date
            ? { supported: true, value: notesBaseRelativeTime(date) }
            : { supported: false };
    }
    const formatCall = splitMemberCall(trimmed, "format");
    if (formatCall) {
        const args = splitFormulaArgs(formatCall.args);
        if (!args || args.length !== 1 || /,\s*$/u.test(formatCall.args))
            return { supported: false };
        const receiver = evaluateNestedArg(formatCall.receiver, resolveProperty);
        const pattern = evaluateNestedArg(args[0] ?? "", resolveProperty);
        const date = receiver.supported ? notesBaseDateValue(receiver.value) : null;
        if (!date
            || !pattern.supported
            || typeof pattern.value !== "string"
            || pattern.value.length > MAX_NOTES_BASE_FORMULA_STRING_LENGTH) {
            return { supported: false };
        }
        const value = formatNotesTemplateDate(date, pattern.value);
        return value.length <= MAX_NOTES_BASE_FORMULA_STRING_LENGTH
            ? { supported: true, value }
            : { supported: false };
    }
    const lengthReceiver = trimmed.endsWith(".length")
        ? trimmed.slice(0, trimmed.length - ".length".length).trim()
        : "";
    if (lengthReceiver) {
        const receiver = evaluateNestedArg(lengthReceiver, resolveProperty);
        return receiver.supported && (typeof receiver.value === "string" || Array.isArray(receiver.value))
            ? { supported: true, value: receiver.value.length }
            : { supported: false };
    }
    const absCall = splitMemberCall(trimmed, "abs");
    if (absCall) {
        return evaluateNotesBaseNumberTransform(absCall, resolveProperty, splitFormulaArgs, evaluateNestedArg, Math.abs);
    }
    const ceilCall = splitMemberCall(trimmed, "ceil");
    if (ceilCall) {
        return evaluateNotesBaseNumberTransform(ceilCall, resolveProperty, splitFormulaArgs, evaluateNestedArg, Math.ceil);
    }
    const floorCall = splitMemberCall(trimmed, "floor");
    if (floorCall) {
        return evaluateNotesBaseNumberTransform(floorCall, resolveProperty, splitFormulaArgs, evaluateNestedArg, Math.floor);
    }
    const roundCall = splitMemberCall(trimmed, "round");
    if (roundCall) {
        return evaluateNumberRound(roundCall, resolveProperty, context);
    }
    const toFixedCall = splitMemberCall(trimmed, "toFixed");
    if (toFixedCall) {
        return evaluateNumberToFixed(toFixedCall, resolveProperty, context);
    }
    const emptyCall = splitMemberCall(trimmed, "isEmpty");
    if (emptyCall) {
        const args = splitFormulaArgs(emptyCall.args);
        if (!args || args.length !== 0)
            return { supported: false };
        const receiver = evaluateNestedArg(emptyCall.receiver, resolveProperty);
        if (!receiver.supported || typeof receiver.value === "boolean")
            return { supported: false };
        return evaluateNotesBaseValueEmptiness(receiver.value);
    }
    const titleCall = splitMemberCall(trimmed, "title");
    if (titleCall) {
        return evaluateStringTransform(titleCall, resolveProperty, titleCaseNotesBaseString, context);
    }
    const trimCall = splitMemberCall(trimmed, "trim");
    if (trimCall) {
        return evaluateStringTransform(trimCall, resolveProperty, (source) => source.trim(), context);
    }
    const reverseCall = splitMemberCall(trimmed, "reverse");
    if (reverseCall) {
        return evaluateReverse(reverseCall, resolveProperty, context);
    }
    const repeatCall = splitMemberCall(trimmed, "repeat");
    if (repeatCall) {
        return evaluateStringRepeat(repeatCall, resolveProperty, context);
    }
    const replaceCall = splitMemberCall(trimmed, "replace");
    if (replaceCall) {
        return evaluateStringReplace(replaceCall, resolveProperty, context);
    }
    const sliceCall = splitMemberCall(trimmed, "slice");
    if (sliceCall) {
        return evaluateSlice(sliceCall, resolveProperty, context);
    }
    const splitCall = splitMemberCall(trimmed, "split");
    if (splitCall) {
        return evaluateStringSplit(splitCall, resolveProperty, context);
    }
    const lowerCall = splitMemberCall(trimmed, "lower");
    if (lowerCall) {
        return evaluateStringTransform(lowerCall, resolveProperty, (source) => source.toLowerCase(), context);
    }
    const startsWithCall = splitMemberCall(trimmed, "startsWith");
    if (startsWithCall) {
        return evaluateStringQuery(startsWithCall, resolveProperty, (source, query) => source.startsWith(query), context);
    }
    const endsWithCall = splitMemberCall(trimmed, "endsWith");
    if (endsWithCall) {
        return evaluateStringQuery(endsWithCall, resolveProperty, (source, query) => source.endsWith(query), context);
    }
    const containsAnyCall = splitMemberCall(trimmed, "containsAny");
    if (containsAnyCall) {
        return evaluateContains(containsAnyCall, resolveProperty, "one-or-more", "any", context);
    }
    const joinCall = splitMemberCall(trimmed, "join");
    if (joinCall) {
        return evaluateListJoin(joinCall, resolveProperty, context);
    }
    const flatCall = splitMemberCall(trimmed, "flat");
    if (flatCall) {
        return evaluateListFlat(flatCall, resolveProperty, context);
    }
    const mapCall = splitMemberCall(trimmed, "map");
    if (mapCall) {
        return evaluateListMap(mapCall, resolveProperty, context);
    }
    const filterCall = splitMemberCall(trimmed, "filter");
    if (filterCall) {
        return evaluateListFilter(filterCall, resolveProperty, context);
    }
    const reduceCall = splitMemberCall(trimmed, "reduce");
    if (reduceCall) {
        return evaluateListReduce(reduceCall, resolveProperty, context);
    }
    const uniqueCall = splitMemberCall(trimmed, "unique");
    if (uniqueCall) {
        return evaluateListUnique(uniqueCall, resolveProperty, context);
    }
    const sortCall = splitMemberCall(trimmed, "sort");
    if (sortCall) {
        return evaluateListSort(sortCall, resolveProperty, context);
    }
    const containsAllCall = splitMemberCall(trimmed, "containsAll");
    if (containsAllCall) {
        return evaluateContains(containsAllCall, resolveProperty, "one-or-more", "all", context);
    }
    const containsCall = splitMemberCall(trimmed, "contains");
    if (containsCall) {
        return evaluateContains(containsCall, resolveProperty, "one", "all", context);
    }
    const inFolderCall = splitMemberCall(trimmed, "inFolder");
    if (inFolderCall) {
        return evaluateNotesBaseFileInFolderCall(inFolderCall, resolveProperty, splitFormulaArgs, evaluateNestedArg);
    }
    const hasLinkCall = splitMemberCall(trimmed, "hasLink");
    if (hasLinkCall)
        return evaluateNotesBaseFileHasLinkCall(hasLinkCall, resolveProperty, context?.fileLinksContain, splitFormulaArgs, evaluateNestedArg);
    const linksToCall = splitMemberCall(trimmed, "linksTo");
    if (linksToCall)
        return evaluateNotesBaseLinkLinksToCall(linksToCall, resolveProperty, context?.fileLinksContain, splitFormulaArgs, evaluateNestedArg);
    const asFileTypeCall = splitMemberCall(trimmed, "isType");
    if (asFileTypeCall && /\.asFile\(\s*\)$/u.test(asFileTypeCall.receiver)) {
        return evaluateNotesBaseIsTypeCall(asFileTypeCall, resolveProperty, evaluateNestedArg);
    }
    const asFileCall = splitMemberCall(trimmed, "asFile");
    if (asFileCall) {
        const args = splitFormulaArgs(asFileCall.args);
        if (!args || args.length !== 0)
            return { supported: false };
        const receiver = evaluateNestedArg(asFileCall.receiver, resolveProperty);
        if (!receiver.supported)
            return { supported: false };
        const path = notesBaseLinkPath(receiver.value);
        return path === null ? { supported: false } : { supported: true, value: path };
    }
    const asLinkCall = splitMemberCall(trimmed, "asLink");
    if (asLinkCall) {
        const args = splitFormulaArgs(asLinkCall.args);
        let activeFileProperty = null;
        if (asLinkCall.receiver === "file")
            activeFileProperty = "file.path";
        else if (asLinkCall.receiver === "file.file")
            activeFileProperty = "file.file";
        if ((!activeFileProperty
            && asLinkCall.receiver !== "this.file"
            && !/^file\([\s\S]*\)$/u.test(asLinkCall.receiver))
            || !args
            || args.length > 1
            || /,\s*$/u.test(asLinkCall.args))
            return { supported: false };
        const projectedFile = activeFileProperty
            ? { supported: true, value: resolveProperty(activeFileProperty) }
            : evaluateNestedArg(asLinkCall.receiver, resolveProperty);
        const normalizedPath = projectedFile.supported && typeof projectedFile.value === "string"
            ? normalizeNotesBaseFilePath(projectedFile.value)
            : null;
        if (!normalizedPath)
            return { supported: false };
        let display = null;
        if (args.length === 1) {
            const result = evaluateNestedArg(args[0] ?? "", resolveProperty);
            if (!result.supported
                || typeof result.value !== "string"
                || result.value.length > MAX_NOTES_BASE_FORMULA_STRING_LENGTH)
                return { supported: false };
            display = result.value;
        }
        return {
            supported: true,
            value: createNotesBaseLinkValue(normalizedPath, display),
        };
    }
    const hasTagCall = splitMemberCall(trimmed, "hasTag");
    if (hasTagCall) {
        return evaluateNotesBaseFileHasTagCall(hasTagCall, resolveProperty, splitFormulaArgs, evaluateNestedArg, context?.fileTagsFor);
    }
    const hasPropertyCall = splitMemberCall(trimmed, "hasProperty");
    if (hasPropertyCall) {
        const args = splitFormulaArgs(hasPropertyCall.args);
        if ((hasPropertyCall.receiver !== "file"
            && hasPropertyCall.receiver !== "this.file"
            && !/^file\([\s\S]*\)$/u.test(hasPropertyCall.receiver))
            || !args
            || args.length !== 1
            || /,\s*$/u.test(hasPropertyCall.args)) {
            return { supported: false };
        }
        const name = evaluateNestedArg(args[0] ?? "", resolveProperty);
        if (!name.supported || typeof name.value !== "string")
            return { supported: false };
        if (hasPropertyCall.receiver === "file") {
            const hasProperty = notesBaseObjectHasProperty(resolveProperty("file.properties"), name.value);
            return hasProperty === null
                ? { supported: false }
                : { supported: true, value: hasProperty };
        }
        if (hasPropertyCall.receiver === "this.file") {
            const ownerProperties = evaluateNestedArg("this.file.properties", resolveProperty);
            const hasProperty = ownerProperties.supported
                ? notesBaseObjectHasProperty(ownerProperties.value, name.value)
                : null;
            return hasProperty === null
                ? { supported: false }
                : { supported: true, value: hasProperty };
        }
        const projectedFile = evaluateNestedArg(hasPropertyCall.receiver, resolveProperty);
        const path = projectedFile.supported && typeof projectedFile.value === "string"
            ? normalizeNotesBaseFilePath(projectedFile.value)
            : null;
        if (!path || !context?.filePropertiesHas)
            return { supported: false };
        try {
            const hasProperty = context.filePropertiesHas(path, name.value);
            return hasProperty === null
                ? { supported: false }
                : { supported: true, value: hasProperty };
        }
        catch {
            return { supported: false };
        }
    }
    const keysCall = splitMemberCall(trimmed, "keys");
    if (keysCall) {
        const args = splitFormulaArgs(keysCall.args);
        if (!args || args.length !== 0)
            return { supported: false };
        const receiver = evaluateNestedArg(keysCall.receiver, resolveProperty);
        if (!receiver.supported)
            return { supported: false };
        const keys = notesBaseObjectKeys(receiver.value);
        return keys === null ? { supported: false } : { supported: true, value: keys };
    }
    const valuesCall = splitMemberCall(trimmed, "values");
    if (valuesCall) {
        const args = splitFormulaArgs(valuesCall.args);
        if (!args || args.length !== 0)
            return { supported: false };
        const receiver = evaluateNestedArg(valuesCall.receiver, resolveProperty);
        if (!receiver.supported)
            return { supported: false };
        const values = notesBaseObjectValues(receiver.value);
        return values === null ? { supported: false } : { supported: true, value: values };
    }
    const truthyCall = splitMemberCall(trimmed, "isTruthy");
    if (truthyCall) {
        const args = splitFormulaArgs(truthyCall.args);
        if (!args || args.length !== 0)
            return { supported: false };
        const receiver = evaluateNestedArg(truthyCall.receiver, resolveProperty);
        return receiver.supported ? { supported: true, value: Boolean(receiver.value) } : { supported: false };
    }
    const typeCall = splitMemberCall(trimmed, "isType");
    if (typeCall) {
        return evaluateNotesBaseIsTypeCall(typeCall, resolveProperty, evaluateNestedArg);
    }
    const toStringCall = splitMemberCall(trimmed, "toString");
    if (toStringCall) {
        const args = splitFormulaArgs(toStringCall.args);
        if (!args || args.length !== 0)
            return { supported: false };
        const receiver = evaluateNestedArg(toStringCall.receiver, resolveProperty);
        if (!receiver.supported)
            return { supported: false };
        const value = stringifyNotesBaseValue(receiver.value);
        return value === undefined ? { supported: false } : { supported: true, value };
    }
    const thisFile = evaluateNotesBaseThisFile(trimmed, context);
    if (thisFile)
        return thisFile;
    const objectMember = evaluateNotesBaseObjectMemberAccess(trimmed, resolveProperty, context);
    if (objectMember)
        return objectMember;
    if (trimmed === "this" || trimmed.startsWith("this."))
        return { supported: false };
    const propertyReference = notesBasePropertyReference(trimmed);
    if (propertyReference !== null) {
        const value = resolveProperty(propertyReference);
        return value === NOTES_BASE_UNSUPPORTED_FORMULA_VALUE
            ? { supported: false }
            : { supported: true, value };
    }
    const call = /^([A-Za-z][\w]*)\((.*)\)$/u.exec(trimmed);
    if (!call)
        return { supported: false };
    const name = (call[1] ?? "").toLowerCase();
    const args = splitFormulaArgs(call[2] ?? "");
    if (!args)
        return { supported: false };
    if (name === "if") {
        if (args.length < 2 || args.length > 3 || /,\s*$/u.test(call[2] ?? ""))
            return { supported: false };
        const condition = evaluateNestedArg(args[0] ?? "", resolveProperty);
        if (!condition.supported)
            return { supported: false };
        const selected = condition.value ? args[1] : args[2];
        return selected === undefined
            ? { supported: true, value: null }
            : evaluateNestedArg(selected, resolveProperty);
    }
    if (name === "min" || name === "max") {
        return evaluateNumericExtremum(args, call[2] ?? "", resolveProperty, name === "min" ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY, name === "min" ? Math.min : Math.max, context);
    }
    const values = args.map((arg) => evaluateNestedArg(arg, resolveProperty));
    if (values.some((value) => !value.supported))
        return { supported: false };
    const resolved = values.map((value) => value.supported ? value.value : "");
    if (name === "upper" && resolved.length === 1)
        return { supported: true, value: text(resolved[0]).toUpperCase() };
    if (name === "lower" && resolved.length === 1)
        return { supported: true, value: text(resolved[0]).toLowerCase() };
    if (name === "escapehtml" && resolved.length === 1 && typeof resolved[0] === "string" && !/,\s*$/u.test(call[2] ?? "")) {
        const value = escapeNotesBaseHtml(resolved[0]);
        return value === null ? { supported: false } : { supported: true, value };
    }
    if (name === "html" && resolved.length === 1 && typeof resolved[0] === "string" && !/,\s*$/u.test(call[2] ?? "")) {
        const value = createNotesBaseHtmlValue(resolved[0]);
        return value === null ? { supported: false } : { supported: true, value };
    }
    if (name === "image" && resolved.length === 1 && typeof resolved[0] === "string" && !/,\s*$/u.test(call[2] ?? "")) {
        const value = createNotesBaseImageValue(resolved[0]);
        return value === null ? { supported: false } : { supported: true, value };
    }
    if (name === "random" && resolved.length === 0)
        return { supported: true, value: Math.random() };
    if (name === "today" && resolved.length === 0)
        return { supported: true, value: localCalendarDate() };
    if (name === "now" && resolved.length === 0)
        return { supported: true, value: new Date().toISOString() };
    if (name === "icon" && resolved.length === 1 && typeof resolved[0] === "string" && !/,\s*$/u.test(call[2] ?? "")) {
        const value = createNotesBaseIconValue(resolved[0]);
        return value === null ? { supported: false } : { supported: true, value };
    }
    if (name === "link" && resolved.length >= 1 && resolved.length <= 2 && !/,\s*$/u.test(call[2] ?? "")) {
        const [path, display] = resolved;
        if (typeof path !== "string")
            return { supported: false };
        let displayValue = display ?? null;
        if ((typeof displayValue === "number" && Number.isFinite(displayValue))
            || typeof displayValue === "boolean") {
            displayValue = String(displayValue);
        }
        if (typeof displayValue === "string" && displayValue.length > MAX_NOTES_BASE_FORMULA_STRING_LENGTH) {
            return { supported: false };
        }
        const normalizedPath = normalizeNotesBaseLinkPath(path);
        const value = normalizedPath === null ? null : createNotesBaseLinkValue(normalizedPath, displayValue);
        return value === null ? { supported: false } : { supported: true, value };
    }
    if (name === "file" && resolved.length === 1 && !/,\s*$/u.test(call[2] ?? "")) {
        const value = typeof resolved[0] === "string"
            ? normalizeNotesBaseFilePath(resolved[0])
            : notesBaseLinkPath(resolved[0]);
        return value === null ? { supported: false } : { supported: true, value };
    }
    if (name === "date" && resolved.length === 1 && typeof resolved[0] === "string" && !/,\s*$/u.test(call[2] ?? "")) {
        const value = parseLocalDate(resolved[0]) ?? parseTimezoneOffsetDate(resolved[0]);
        return value === null ? { supported: false } : { supported: true, value };
    }
    if (name === "duration" && resolved.length === 1 && typeof resolved[0] === "string" && !/,\s*$/u.test(call[2] ?? "")) {
        const value = parseFixedDuration(resolved[0]);
        return value === null ? { supported: false } : { supported: true, value };
    }
    if (name === "length" && resolved.length === 1)
        return { supported: true, value: Array.isArray(resolved[0]) ? resolved[0].length : text(resolved[0]).length };
    if (name === "concat")
        return { supported: true, value: resolved.map(text).join("") };
    if (name === "list" && resolved.length === 1) {
        return { supported: true, value: Array.isArray(resolved[0]) ? resolved[0] : [resolved[0]] };
    }
    if (name === "contains" && resolved.length === 2) {
        const [source, needle] = resolved;
        return { supported: true, value: Array.isArray(source) ? source.map(text).includes(text(needle)) : text(source).includes(text(needle)) };
    }
    if (name === "number" && resolved.length === 1) {
        const value = notesBaseNumberValue(resolved[0], args[0] ?? "");
        return value == null ? { supported: false } : { supported: true, value };
    }
    return { supported: false };
}
function numericValues(rows, property, resolveProperty) {
    const values = [];
    for (const row of rows) {
        const value = Number(resolveProperty(row, property));
        if (Number.isFinite(value))
            values.push(value);
    }
    return values;
}
export function evaluateNotesBaseSummary(expression, rows, resolveProperty) {
    const trimmed = expression.trim();
    if (trimmed === "count()")
        return { supported: true, value: rows.length };
    const call = /^(sum|average|min|max|range|median|stddev|earliest|latest|checked|unchecked|empty|filled|unique)\(([\w.-]+)\)$/u.exec(trimmed);
    if (!call)
        return { supported: false };
    if (call[1] === "unique") {
        const count = countNotesBaseUniqueValues(rows, (row) => resolveProperty(row, call[2] ?? ""));
        return count === null ? { supported: false } : { supported: true, value: count };
    }
    if (call[1] === "empty" || call[1] === "filled") {
        const expectedEmpty = call[1] === "empty";
        let count = 0;
        for (const row of rows) {
            const result = evaluateNotesBaseValueEmptiness(resolveProperty(row, call[2] ?? ""));
            if (!result.supported)
                return { supported: false };
            if (result.value === expectedEmpty)
                count += 1;
        }
        return { supported: true, value: count };
    }
    if (call[1] === "checked" || call[1] === "unchecked") {
        const expected = call[1] === "checked";
        let count = 0;
        for (const row of rows) {
            if (resolveProperty(row, call[2] ?? "") === expected)
                count += 1;
        }
        return { supported: true, value: count };
    }
    if (call[1] === "range") {
        let dateMinimum = Number.POSITIVE_INFINITY;
        let dateMaximum = Number.NEGATIVE_INFINITY;
        let dateCount = 0;
        let numericMinimum = Number.POSITIVE_INFINITY;
        let numericMaximum = Number.NEGATIVE_INFINITY;
        let numericCount = 0;
        for (const row of rows) {
            const value = resolveProperty(row, call[2] ?? "");
            const date = notesBaseDateValue(value);
            if (date) {
                const timestamp = date.getTime();
                dateMinimum = Math.min(dateMinimum, timestamp);
                dateMaximum = Math.max(dateMaximum, timestamp);
                dateCount += 1;
                continue;
            }
            const numericValue = Number(value);
            if (Number.isFinite(numericValue)) {
                numericMinimum = Math.min(numericMinimum, numericValue);
                numericMaximum = Math.max(numericMaximum, numericValue);
                numericCount += 1;
            }
        }
        let range = 0;
        if (dateCount >= 2)
            range = dateMaximum - dateMinimum;
        else if (numericCount >= 2)
            range = numericMaximum - numericMinimum;
        return Number.isFinite(range) ? { supported: true, value: range } : { supported: false };
    }
    if (call[1] === "earliest" || call[1] === "latest") {
        const findEarliest = call[1] === "earliest";
        let timestamp = findEarliest ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY;
        for (const row of rows) {
            const date = notesBaseDateValue(resolveProperty(row, call[2] ?? ""));
            if (date)
                timestamp = findEarliest ? Math.min(timestamp, date.getTime()) : Math.max(timestamp, date.getTime());
        }
        return { supported: true, value: Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : 0 };
    }
    const values = numericValues(rows, call[2] ?? "", resolveProperty);
    if (call[1] === "sum")
        return { supported: true, value: values.reduce((sum, value) => sum + value, 0) };
    if (call[1] === "min")
        return { supported: true, value: values.length > 0 ? values.reduce((minimum, value) => Math.min(minimum, value)) : 0 };
    if (call[1] === "max")
        return { supported: true, value: values.length > 0 ? values.reduce((maximum, value) => Math.max(maximum, value)) : 0 };
    if (call[1] === "median") {
        if (values.length === 0)
            return { supported: true, value: 0 };
        values.sort((left, right) => left - right);
        const middle = Math.floor(values.length / 2);
        if (values.length % 2 === 1)
            return { supported: true, value: values[middle] };
        const lower = values[middle - 1] ?? 0;
        const upper = values[middle] ?? 0;
        const median = Math.sign(lower) === Math.sign(upper) ? lower + (upper - lower) / 2 : (lower + upper) / 2;
        return Number.isFinite(median) ? { supported: true, value: median } : { supported: false };
    }
    if (call[1] === "stddev") {
        if (values.length === 0)
            return { supported: true, value: 0 };
        const scale = values.reduce((maximum, value) => Math.max(maximum, Math.abs(value)), 0);
        if (scale === 0)
            return { supported: true, value: 0 };
        const mean = values.reduce((sum, value) => sum + value / scale, 0) / values.length;
        const variance = values.reduce((sum, value) => sum + (value / scale - mean) ** 2, 0) / values.length;
        const standardDeviation = Math.sqrt(variance) * scale;
        return Number.isFinite(standardDeviation) ? { supported: true, value: standardDeviation } : { supported: false };
    }
    return { supported: true, value: values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : 0 };
}
//# sourceMappingURL=NotesBaseFormula.js.map