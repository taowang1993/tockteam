export function isNotesBaseFormulaQuoteEscaped(source: string, quoteIndex: number) {
  let backslashCount = 0;
  for (let index = quoteIndex - 1; index >= 0 && source[index] === "\\"; index -= 1) {
    backslashCount += 1;
  }
  return backslashCount % 2 === 1;
}
