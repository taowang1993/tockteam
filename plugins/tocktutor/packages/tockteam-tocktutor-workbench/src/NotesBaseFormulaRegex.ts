const MAX_NOTES_BASE_REGEXP_PATTERN_LENGTH = 1_000;
const MAX_NOTES_BASE_REGEXP_INPUT_LENGTH = 100_000;
const MAX_NOTES_BASE_REGEXP_MATCH_WORK = 1_000_000;
const MAX_NOTES_BASE_REGEXP_CAPTURE_GROUPS = 9;
const NOTES_BASE_REGEXP_FLAGS = /^[dgimsuvy]*$/u;
const NOTES_BASE_UNSAFE_REGEXP_TOKEN = /[()|*+?{}]/u;

type NotesBaseFormulaResult = { supported: true; value: unknown } | { supported: false };
type NotesBaseFormulaResolver = (property: string) => unknown;

function parseNotesBaseRegexpLiteralPrefix(
  value: string,
  allowedFlags = NOTES_BASE_REGEXP_FLAGS,
  maxCaptureGroups = 0,
) {
  if (!value.startsWith("/")) return null;

  let escaped = false;
  let inCharacterClass = false;
  let captureGroupDepth = 0;
  let captureGroupCount = 0;
  let captureGroupStart = -1;
  let closingSlash = -1;
  let escapedAtom = false;
  for (
    let index = 1;
    index < value.length && index <= MAX_NOTES_BASE_REGEXP_PATTERN_LENGTH + 1;
    index += 1
  ) {
    const character = value[index] ?? "";
    if (escaped) {
      if (/[1-9]/u.test(character)) return null;
      escaped = false;
      escapedAtom = true;
      continue;
    }
    if (character === "\\") {
      escaped = true;
      escapedAtom = false;
      continue;
    }
    if (character === "[" && !inCharacterClass) {
      inCharacterClass = true;
      escapedAtom = false;
      continue;
    }
    if (character === "]" && inCharacterClass) {
      inCharacterClass = false;
      escapedAtom = false;
      continue;
    }
    if (!inCharacterClass && character === "(") {
      if (captureGroupDepth > 0 || captureGroupCount >= maxCaptureGroups) return null;
      captureGroupDepth = 1;
      captureGroupCount += 1;
      captureGroupStart = index;
      escapedAtom = false;
      continue;
    }
    if (!inCharacterClass && character === ")") {
      if (captureGroupDepth !== 1 || index === captureGroupStart + 1) return null;
      captureGroupDepth = 0;
      captureGroupStart = -1;
      escapedAtom = false;
      continue;
    }
    if (!inCharacterClass && character === "+") {
      if (!escapedAtom) return null;
      escapedAtom = false;
      continue;
    }
    if (character === "/" && !inCharacterClass) {
      if (captureGroupDepth !== 0) return null;
      closingSlash = index;
      break;
    }
    if (!inCharacterClass && NOTES_BASE_UNSAFE_REGEXP_TOKEN.test(character)) return null;
    if (/[\n\r\u2028\u2029]/u.test(character)) return null;
    escapedAtom = false;
  }

  if (closingSlash < 1 || escaped || inCharacterClass) return null;
  const source = value.slice(1, closingSlash);
  let flagEnd = closingSlash + 1;
  while (/[A-Za-z]/u.test(value[flagEnd] ?? "")) flagEnd += 1;
  const flags = value.slice(closingSlash + 1, flagEnd);
  if (
    source.length > MAX_NOTES_BASE_REGEXP_PATTERN_LENGTH
    || !allowedFlags.test(flags)
    || new Set(flags).size !== flags.length
  ) {
    return null;
  }

  try {
    return {
      captureGroupCount,
      expression: new RegExp(source, flags),
      length: flagEnd,
      source,
    };
  } catch {
    return null;
  }
}

function tokenizeNotesBaseCaptureReplacement(replacement: string, captureGroupCount: number) {
  const tokens: Array<string | number> = [];
  let literalStart = 0;
  for (let index = 0; index < replacement.length; index += 1) {
    const character = replacement[index] ?? "";
    const captureDigit = replacement[index + 1] ?? "";
    const followingCharacter = replacement[index + 2] ?? "";
    const captureIndex = character === "$"
      && captureDigit >= "1"
      && captureDigit <= "9"
      && (followingCharacter < "0" || followingCharacter > "9")
      ? Number(captureDigit)
      : 0;
    if (captureIndex >= 1 && captureIndex <= captureGroupCount) {
      if (literalStart < index) tokens.push(replacement.slice(literalStart, index));
      tokens.push(captureIndex);
      index += 1;
      literalStart = index + 1;
    }
  }
  if (literalStart < replacement.length) tokens.push(replacement.slice(literalStart));
  return tokens;
}

function notesBaseCaptureReplacementLength(
  tokens: Array<string | number>,
  match: RegExpMatchArray,
) {
  let length = 0;
  for (const token of tokens) {
    length += typeof token === "number" ? (match[token] ?? "").length : token.length;
  }
  return length;
}

function expandNotesBaseCaptureReplacement(
  tokens: Array<string | number>,
  captures: unknown[],
) {
  let expanded = "";
  for (const token of tokens) {
    if (typeof token === "string") {
      expanded += token;
      continue;
    }
    const capture = captures[token - 1];
    if (typeof capture === "string") expanded += capture;
  }
  return expanded;
}

export function evaluateNotesBaseRegexpReplaceCall(
  call: { receiver: string; args: string },
  resolveProperty: NotesBaseFormulaResolver,
  splitArgs: (args: string) => string[] | null,
  evaluateArg: (arg: string, resolveProperty: NotesBaseFormulaResolver) => NotesBaseFormulaResult,
  maxOutputLength: number,
): NotesBaseFormulaResult {
  const argsSource = call.args.trim();
  const parsed = parseNotesBaseRegexpLiteralPrefix(
    argsSource,
    NOTES_BASE_REGEXP_FLAGS,
    MAX_NOTES_BASE_REGEXP_CAPTURE_GROUPS,
  );
  if (!parsed || parsed.source.length === 0) return { supported: false };

  const remainder = argsSource.slice(parsed.length).trim();
  if (!remainder.startsWith(",")) return { supported: false };
  const replacementSource = remainder.slice(1).trim();
  const replacementArgs = splitArgs(replacementSource);
  if (!replacementArgs || replacementArgs.length !== 1 || /,\s*$/u.test(replacementSource)) {
    return { supported: false };
  }

  const receiver = evaluateArg(call.receiver, resolveProperty);
  const replacement = evaluateArg(replacementArgs[0] ?? "", resolveProperty);
  if (
    !receiver.supported
    || typeof receiver.value !== "string"
    || receiver.value.length > MAX_NOTES_BASE_REGEXP_INPUT_LENGTH
    || !replacement.supported
    || typeof replacement.value !== "string"
    || replacement.value.length > maxOutputLength
    || parsed.source.length * receiver.value.length > MAX_NOTES_BASE_REGEXP_MATCH_WORK
  ) {
    return { supported: false };
  }
  const replacementText = replacement.value;
  const replacementTokens = tokenizeNotesBaseCaptureReplacement(
    replacementText,
    parsed.captureGroupCount,
  );

  let projectedLength = receiver.value.length;
  let captureExpansionWork = 0;
  const projectMatch = (match: RegExpMatchArray) => {
    captureExpansionWork += replacementTokens.length;
    if (captureExpansionWork > MAX_NOTES_BASE_REGEXP_MATCH_WORK) return false;
    projectedLength += notesBaseCaptureReplacementLength(replacementTokens, match) - match[0].length;
    return projectedLength <= maxOutputLength;
  };
  if (parsed.expression.global) {
    for (const match of receiver.value.matchAll(parsed.expression)) {
      if (!projectMatch(match)) return { supported: false };
    }
  } else {
    const match = parsed.expression.exec(receiver.value);
    if (match && !projectMatch(match)) return { supported: false };
  }
  if (projectedLength > maxOutputLength) return { supported: false };
  parsed.expression.lastIndex = 0;

  return {
    supported: true,
    value: receiver.value.replace(parsed.expression, (_match, ...captures) => (
      expandNotesBaseCaptureReplacement(replacementTokens, captures)
    )),
  };
}

function parseNotesBaseRegexpLiteral(value: string, maxCaptureGroups = 0) {
  const parsed = parseNotesBaseRegexpLiteralPrefix(
    value,
    NOTES_BASE_REGEXP_FLAGS,
    maxCaptureGroups,
  );
  return parsed?.length === value.length ? parsed.expression : null;
}

export function splitNotesBaseRegexpIsTypeCall(value: string) {
  const parsed = parseNotesBaseRegexpLiteralPrefix(
    value,
    NOTES_BASE_REGEXP_FLAGS,
    MAX_NOTES_BASE_REGEXP_CAPTURE_GROUPS,
  );
  const marker = ".isType(";
  if (!parsed || !value.startsWith(marker, parsed.length) || !value.endsWith(")")) return null;
  return {
    args: value.slice(parsed.length + marker.length, -1),
    receiver: value.slice(0, parsed.length),
  };
}

export function evaluateNotesBaseRegexpAnyValueCall(value: string): NotesBaseFormulaResult | null {
  const parsed = parseNotesBaseRegexpLiteralPrefix(
    value,
    NOTES_BASE_REGEXP_FLAGS,
    MAX_NOTES_BASE_REGEXP_CAPTURE_GROUPS,
  );
  if (!parsed) return null;
  const isTruthy = value.startsWith(".isTruthy(", parsed.length);
  const isString = value.startsWith(".toString(", parsed.length);
  if ((!isTruthy && !isString) || !value.endsWith(")")) return null;
  const marker = isTruthy ? ".isTruthy(" : ".toString(";
  const args = value.slice(parsed.length + marker.length, -1).trim();
  return args.length === 0
    ? { supported: true, value: isTruthy ? true : parsed.expression.toString() }
    : { supported: false };
}

export function evaluateNotesBaseRegexpMatchesCall(
  call: { receiver: string; args: string },
  resolveProperty: NotesBaseFormulaResolver,
  splitArgs: (args: string) => string[] | null,
  evaluateArg: (arg: string, resolveProperty: NotesBaseFormulaResolver) => NotesBaseFormulaResult,
): NotesBaseFormulaResult {
  const args = splitArgs(call.args);
  if (!args || args.length !== 1 || /,\s*$/u.test(call.args)) return { supported: false };

  const expression = parseNotesBaseRegexpLiteral(
    call.receiver,
    MAX_NOTES_BASE_REGEXP_CAPTURE_GROUPS,
  );
  const candidate = evaluateArg(args[0] ?? "", resolveProperty);
  if (
    !expression
    || !candidate.supported
    || typeof candidate.value !== "string"
    || candidate.value.length > MAX_NOTES_BASE_REGEXP_INPUT_LENGTH
    || expression.source.length * candidate.value.length > MAX_NOTES_BASE_REGEXP_MATCH_WORK
  ) {
    return { supported: false };
  }

  return { supported: true, value: expression.test(candidate.value) };
}

export function evaluateNotesBaseRegexpSplitCall(
  call: { receiver: string; args: string },
  resolveProperty: NotesBaseFormulaResolver,
  splitArgs: (args: string) => string[] | null,
  evaluateArg: (arg: string, resolveProperty: NotesBaseFormulaResolver) => NotesBaseFormulaResult,
  maxElements: number,
): NotesBaseFormulaResult {
  const argsSource = call.args.trim();
  const parsed = parseNotesBaseRegexpLiteralPrefix(
    argsSource,
    NOTES_BASE_REGEXP_FLAGS,
    MAX_NOTES_BASE_REGEXP_CAPTURE_GROUPS,
  );
  if (!parsed) return { supported: false };

  const remainder = argsSource.slice(parsed.length).trim();
  let limit = maxElements + 1;
  if (remainder.length > 0) {
    if (!remainder.startsWith(",")) return { supported: false };
    const limitSource = remainder.slice(1).trim();
    const limitArgs = splitArgs(limitSource);
    if (!limitArgs || limitArgs.length !== 1 || /,\s*$/u.test(limitSource)) {
      return { supported: false };
    }
    const requestedLimit = evaluateArg(limitArgs[0] ?? "", resolveProperty);
    if (
      !requestedLimit.supported
      || typeof requestedLimit.value !== "number"
      || !Number.isFinite(requestedLimit.value)
    ) {
      return { supported: false };
    }
    limit = Math.min(requestedLimit.value >>> 0, limit);
  }

  const receiver = evaluateArg(call.receiver, resolveProperty);
  if (
    !receiver.supported
    || typeof receiver.value !== "string"
    || receiver.value.length > MAX_NOTES_BASE_REGEXP_INPUT_LENGTH
    || parsed.expression.source.length * receiver.value.length > MAX_NOTES_BASE_REGEXP_MATCH_WORK
  ) {
    return { supported: false };
  }

  const value = receiver.value.split(parsed.expression, limit);
  return value.length <= maxElements ? { supported: true, value } : { supported: false };
}
