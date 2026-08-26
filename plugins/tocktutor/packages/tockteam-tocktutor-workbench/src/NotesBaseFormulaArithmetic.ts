import { notesBaseLinkPath } from './NotesBaseFormulaLink.ts'
import { isNotesBaseFormulaQuoteEscaped } from './NotesBaseFormulaSyntax.ts'

type NotesBaseFormulaResult = { supported: true; value: unknown } | { supported: false };
type NotesBaseFormulaResolver = (property: string) => unknown;
type NotesBaseFormulaCall = { receiver: string; args: string };
type NotesBaseFormulaOperandEvaluator = (
  operand: string,
  resolveProperty: NotesBaseFormulaResolver,
) => NotesBaseFormulaResult;
type NotesBaseFormulaDateTimestamp = (value: unknown, operand: string) => number | null;
type NotesBaseFormulaFileOperandPath = (value: unknown, operand: string) => string | null;
type NotesBaseFormulaDateOffset = (
  timestamp: number,
  value: unknown,
  operand: string,
  operator: "+" | "-",
) => number | null;
type NotesBaseFormulaOperandSafety = (operand: string) => boolean;

const MAX_NOTES_BASE_TOP_LEVEL_OPERANDS = 10_000;
const MAX_NOTES_BASE_STRING_LENGTH = 100_000;
type NotesBaseFormulaOperator = "+" | "-" | "*" | "/" | "%" | "==" | "!=" | "<" | "<=" | ">" | ">=" | "&&" | "||";
type NotesBaseAdditiveScalar = string | number | boolean | null | undefined;

function isAdditiveScalar(value: unknown): value is NotesBaseAdditiveScalar {
  return value == null
    || typeof value === "string"
    || typeof value === "boolean"
    || (typeof value === "number" && Number.isFinite(value));
}

function additiveScalarText(value: NotesBaseAdditiveScalar) {
  if (value == null) return "null";
  return String(value);
}

function isBoundedComparisonScalar(value: unknown) {
  return value == null
    || typeof value === "boolean"
    || (typeof value === "number" && Number.isFinite(value))
    || (typeof value === "string" && value.length <= MAX_NOTES_BASE_STRING_LENGTH);
}

function splitTopLevelOperators(
  expression: string,
  acceptedOperators: readonly NotesBaseFormulaOperator[],
): {
  operands: string[];
  operators: NotesBaseFormulaOperator[];
} | null | undefined {
  const operands: string[] = [];
  const operators: NotesBaseFormulaOperator[] = [];
  let current = "";
  let quote = "";
  let depth = 0;

  for (let index = 0; index < expression.length; index += 1) {
    const char = expression[index] ?? "";
    if ((char === "\"" || char === "'") && !isNotesBaseFormulaQuoteEscaped(expression, index)) {
      if (!quote) quote = char;
      else if (char === quote) quote = "";
    }
    if (quote || char === "\"" || char === "'") {
      current += char;
      continue;
    }
    if (char === "(") depth += 1;
    if (char === ")") depth -= 1;
    if (depth < 0) return null;
    const operator = depth === 0
      ? acceptedOperators.find((candidate) => expression.startsWith(candidate, index))
      : undefined;
    if (operator) {
      if (current.trim().length === 0) {
        if (
          (operator === "+" && operators.at(-1) === "+" && current.length === 0)
          || (operator === "-" && operators.at(-1) === "-" && current.length === 0)
        ) return null;
        current += operator;
        index += operator.length - 1;
        continue;
      }
      if (operator === "-" && /[*/%]$/u.test(current.trimEnd())) {
        current += char;
        continue;
      }
      operands.push(current.trim());
      operators.push(operator);
      current = "";
      index += operator.length - 1;
      if (operands.length >= MAX_NOTES_BASE_TOP_LEVEL_OPERANDS) return null;
      continue;
    }
    current += char;
  }

  if (operators.length === 0) return undefined;
  operands.push(current.trim());
  return quote || depth !== 0 || operands.some((operand) => operand.length === 0)
    ? null
    : { operands, operators };
}

export function isNotesBaseDateOffsetExpression(
  expression: string,
  isDateOperand: (operand: string) => boolean,
) {
  const additive = splitTopLevelOperators(expression, ["+", "-"]);
  return Boolean(additive && isDateOperand(additive.operands[0] ?? ""));
}

export function isNotesBaseDurationScaleExpression(
  expression: string,
  isDurationOperand: (operand: string) => boolean,
) {
  const multiplicative = splitTopLevelOperators(expression, ["*", "/", "%"]);
  if (!multiplicative || !isDurationOperand(multiplicative.operands[0] ?? "")) return false;
  for (let index = 0; index < multiplicative.operators.length; index += 1) {
    const operator = multiplicative.operators[index];
    if (operator !== "*" && operator !== "/") return false;
    if (isDurationOperand(multiplicative.operands[index + 1] ?? "")) return false;
  }
  return true;
}

export function evaluateNotesBaseComparison(
  expression: string,
  resolveProperty: NotesBaseFormulaResolver,
  evaluateOperand: NotesBaseFormulaOperandEvaluator,
  dateTimestamp?: NotesBaseFormulaDateTimestamp,
  fileOperandPath?: NotesBaseFormulaFileOperandPath,
): NotesBaseFormulaResult | null {
  const comparison = splitTopLevelOperators(expression, ["==", "!=", ">=", "<=", "<", ">"]);
  if (comparison === undefined) return null;
  if (comparison === null || comparison.operators.length !== 1) return { supported: false };

  const left = evaluateOperand(comparison.operands[0] ?? "", resolveProperty);
  const right = evaluateOperand(comparison.operands[1] ?? "", resolveProperty);
  if (!left.supported || !right.supported) return { supported: false };
  const operator = comparison.operators[0];
  if (operator === "==" || operator === "!=") {
    const leftLinkPath = notesBaseLinkPath(left.value);
    const rightLinkPath = notesBaseLinkPath(right.value);
    if (leftLinkPath !== null || rightLinkPath !== null) {
      const leftPath = leftLinkPath ?? fileOperandPath?.(left.value, comparison.operands[0] ?? "") ?? null;
      const rightPath = rightLinkPath ?? fileOperandPath?.(right.value, comparison.operands[1] ?? "") ?? null;
      if (leftPath === null || rightPath === null) return { supported: false };
      const equal = leftPath === rightPath;
      return { supported: true, value: operator === "==" ? equal : !equal };
    }
    if (!isBoundedComparisonScalar(left.value) || !isBoundedComparisonScalar(right.value)) {
      return { supported: false };
    }
    const equal = (left.value ?? null) === (right.value ?? null);
    return { supported: true, value: operator === "==" ? equal : !equal };
  }
  let leftValue: number;
  let rightValue: number;
  if (
    typeof left.value === "number"
    && Number.isFinite(left.value)
    && typeof right.value === "number"
    && Number.isFinite(right.value)
  ) {
    leftValue = left.value;
    rightValue = right.value;
  } else {
    const leftTimestamp = dateTimestamp?.(left.value, comparison.operands[0] ?? "") ?? null;
    const rightTimestamp = dateTimestamp?.(right.value, comparison.operands[1] ?? "") ?? null;
    if (
      leftTimestamp === null
      || !Number.isFinite(leftTimestamp)
      || rightTimestamp === null
      || !Number.isFinite(rightTimestamp)
    ) {
      return { supported: false };
    }
    leftValue = leftTimestamp;
    rightValue = rightTimestamp;
  }
  if (operator === "<") return { supported: true, value: leftValue < rightValue };
  if (operator === "<=") return { supported: true, value: leftValue <= rightValue };
  if (operator === ">") return { supported: true, value: leftValue > rightValue };
  if (operator === ">=") return { supported: true, value: leftValue >= rightValue };
  return { supported: false };
}

export function evaluateNotesBaseBooleanNot(
  expression: string,
  resolveProperty: NotesBaseFormulaResolver,
  evaluateOperand: NotesBaseFormulaOperandEvaluator,
): NotesBaseFormulaResult | null {
  if (!expression.startsWith("!") || expression.startsWith("!=")) return null;
  const operand = expression.slice(1).trim();
  if (!operand || operand.startsWith("!")) return { supported: false };
  const result = evaluateOperand(operand, resolveProperty);
  return result.supported
    ? { supported: true, value: !result.value }
    : { supported: false };
}

export function evaluateNotesBaseUnaryNumeric(
  expression: string,
  resolveProperty: NotesBaseFormulaResolver,
  evaluateOperand: NotesBaseFormulaOperandEvaluator,
  rejectOperand: (operator: "+" | "-", operand: string) => boolean,
): NotesBaseFormulaResult | null {
  const operator = expression[0];
  if (operator !== "+" && operator !== "-") return null;
  if (expression.length > MAX_NOTES_BASE_STRING_LENGTH) return { supported: false };
  const operand = expression.slice(1).trim();
  if (
    !operand
    || operand.startsWith(operator)
    || rejectOperand(operator, operand)
  ) {
    return { supported: false };
  }
  const result = evaluateOperand(operand, resolveProperty);
  return result.supported
    && typeof result.value === "number"
    && Number.isFinite(result.value)
    ? { supported: true, value: operator === "-" ? -result.value : result.value }
    : { supported: false };
}

function evaluateNotesBaseBooleanOperands(
  operands: readonly string[],
  resolveProperty: NotesBaseFormulaResolver,
  evaluateOperand: NotesBaseFormulaOperandEvaluator,
  operator: "&&" | "||",
  isOperandSafe?: NotesBaseFormulaOperandSafety,
): NotesBaseFormulaResult {
  let value = operator === "&&";
  for (const operand of operands) {
    const shortCircuited = operator === "&&" ? !value : value;
    if (shortCircuited) {
      if (!isOperandSafe?.(operand)) return { supported: false };
      continue;
    }
    const result = evaluateOperand(operand, resolveProperty);
    if (!result.supported) return { supported: false };
    value = operator === "&&"
      ? value && Boolean(result.value)
      : value || Boolean(result.value);
  }
  return { supported: true, value };
}

export function evaluateNotesBaseBooleanAnd(
  expression: string,
  resolveProperty: NotesBaseFormulaResolver,
  evaluateOperand: NotesBaseFormulaOperandEvaluator,
  isOperandSafe?: NotesBaseFormulaOperandSafety,
): NotesBaseFormulaResult | null {
  const conjunction = splitTopLevelOperators(expression, ["&&"]);
  if (conjunction === undefined) return null;
  if (conjunction === null) return { supported: false };
  return evaluateNotesBaseBooleanOperands(
    conjunction.operands,
    resolveProperty,
    evaluateOperand,
    "&&",
    isOperandSafe,
  );
}

export function evaluateNotesBaseBooleanOr(
  expression: string,
  resolveProperty: NotesBaseFormulaResolver,
  evaluateOperand: NotesBaseFormulaOperandEvaluator,
  isOperandSafe?: NotesBaseFormulaOperandSafety,
): NotesBaseFormulaResult | null {
  const disjunction = splitTopLevelOperators(expression, ["||"]);
  if (disjunction === undefined) return null;
  if (disjunction === null) return { supported: false };
  return evaluateNotesBaseBooleanOperands(
    disjunction.operands,
    resolveProperty,
    evaluateOperand,
    "||",
    isOperandSafe,
  );
}

export function evaluateNotesBaseAdditive(
  expression: string,
  resolveProperty: NotesBaseFormulaResolver,
  evaluateOperand: NotesBaseFormulaOperandEvaluator,
  dateTimestamp?: NotesBaseFormulaDateTimestamp,
  dateOffset?: NotesBaseFormulaDateOffset,
): NotesBaseFormulaResult | null {
  const additive = splitTopLevelOperators(expression, ["+", "-"]);
  if (additive === undefined) return null;
  if (additive === null) return { supported: false };

  let value: NotesBaseAdditiveScalar;
  let hasValue = false;
  let currentDateTimestamp: number | null = null;
  for (let index = 0; index < additive.operands.length; index += 1) {
    const operand = additive.operands[index] ?? "";
    const result = evaluateOperand(operand, resolveProperty);
    if (!result.supported) return { supported: false };
    if (!hasValue) {
      if (!isAdditiveScalar(result.value)) return { supported: false };
      value = result.value;
      hasValue = true;
      currentDateTimestamp = typeof result.value === "string"
        ? dateTimestamp?.(result.value, operand) ?? null
        : null;
    } else {
      const operator = additive.operators[index - 1];
      if (operator !== "+" && operator !== "-") return { supported: false };
      if (currentDateTimestamp !== null && dateTimestamp && dateOffset) {
        if (operator === "-" && additive.operators.length === 1) {
          const secondDateTimestamp = dateTimestamp(result.value, operand);
          if (secondDateTimestamp !== null) {
            const difference = currentDateTimestamp - secondDateTimestamp;
            return Number.isFinite(difference)
              ? { supported: true, value: difference }
              : { supported: false };
          }
        }
        const nextTimestamp = dateOffset(currentDateTimestamp, result.value, operand, operator);
        if (nextTimestamp === null || !Number.isFinite(nextTimestamp)) return { supported: false };
        const nextDate = new Date(nextTimestamp);
        if (!Number.isFinite(nextDate.getTime())) {
          return { supported: false };
        }
        currentDateTimestamp = nextTimestamp;
        value = nextDate.toISOString();
      } else if (
        typeof value === "number"
        && typeof result.value === "number"
        && Number.isFinite(result.value)
      ) {
        value = operator === "+" ? value + result.value : value - result.value;
        if (!Number.isFinite(value)) return { supported: false };
      } else {
        if (
          operator !== "+"
          || (typeof value !== "string" && typeof result.value !== "string")
          || !isAdditiveScalar(result.value)
        ) {
          return { supported: false };
        }
        const valueText = additiveScalarText(value);
        const resultText = additiveScalarText(result.value);
        if (resultText.length > MAX_NOTES_BASE_STRING_LENGTH - valueText.length) {
          return { supported: false };
        }
        value = valueText + resultText;
      }
    }
  }
  return !hasValue
    ? { supported: false }
    : { supported: true, value };
}

export function evaluateNotesBaseMultiplicative(
  expression: string,
  resolveProperty: NotesBaseFormulaResolver,
  evaluateOperand: NotesBaseFormulaOperandEvaluator,
): NotesBaseFormulaResult | null {
  const multiplicative = splitTopLevelOperators(expression, ["*", "/", "%"]);
  if (multiplicative === undefined) return null;
  if (multiplicative === null) return { supported: false };

  let value: number | undefined;
  for (let index = 0; index < multiplicative.operands.length; index += 1) {
    const operand = multiplicative.operands[index] ?? "";
    const result = evaluateOperand(operand, resolveProperty);
    if (!result.supported || typeof result.value !== "number" || !Number.isFinite(result.value)) {
      return { supported: false };
    }
    if (value === undefined) {
      value = result.value;
    } else {
      const operator = multiplicative.operators[index - 1];
      if (operator === "*") value *= result.value;
      else if (operator === "/") value /= result.value;
      else if (operator === "%") value %= result.value;
      else return { supported: false };
    }
    if (!Number.isFinite(value)) return { supported: false };
  }
  return value === undefined
    ? { supported: false }
    : { supported: true, value };
}

export function evaluateNotesBaseNumberTransform(
  call: NotesBaseFormulaCall,
  resolveProperty: NotesBaseFormulaResolver,
  splitArgs: (args: string) => string[] | null,
  evaluateOperand: NotesBaseFormulaOperandEvaluator,
  transform: (source: number) => number,
): NotesBaseFormulaResult {
  const args = splitArgs(call.args);
  if (!args || args.length !== 0) return { supported: false };
  const receiver = evaluateOperand(call.receiver, resolveProperty);
  return receiver.supported && typeof receiver.value === "number" && Number.isFinite(receiver.value)
    ? { supported: true, value: transform(receiver.value) }
    : { supported: false };
}
