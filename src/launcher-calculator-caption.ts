const SMALL = ['Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'] as const
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'] as const
const SCALES = [[1e15, 'Quadrillion'], [1e12, 'Trillion'], [1e9, 'Billion'], [1e6, 'Million'], [1000, 'Thousand']] as const
const NUMBER = String.raw`[+-]?(?:\d+(?:[.,]\d+)?|[.,]\d+)`
const SIMPLE_ARITHMETIC = new RegExp(String.raw`^\s*${NUMBER}\s*([+\-*/^×÷])\s*${NUMBER}\s*$`, 'u')
const OPERATION_NAMES: Readonly<Record<string, string>> = Object.freeze({ '+': 'Sum', '-': 'Difference', '*': 'Product', '×': 'Product', '/': 'Quotient', '÷': 'Quotient', '^': 'Power' })

function integerWords(value: number): string {
  if (value < 20) return SMALL[value]!
  if (value < 100) return `${TENS[Math.floor(value / 10)]}${value % 10 ? `-${integerWords(value % 10)}` : ''}`
  if (value < 1000) return `${integerWords(Math.floor(value / 100))} Hundred${value % 100 ? ` ${integerWords(value % 100)}` : ''}`
  const [size, name] = SCALES.find(([size]) => value >= size)!
  return `${integerWords(Math.floor(value / size))} ${name}${value % size ? ` ${integerWords(value % size)}` : ''}`
}

export function launcherCalculatorCaptions(expression: string, answer: string): Readonly<{ operation: string | undefined; answerWords: string | undefined }> {
  const operation = OPERATION_NAMES[SIMPLE_ARITHMETIC.exec(expression)?.[1] ?? '']
  const numeric = /^(-?)(\d+)(?:[.,](\d+))?$/u.exec(answer)
  const whole = Number(numeric?.[2])
  const answerWords = numeric && Number.isSafeInteger(whole)
    ? `${numeric[1] ? 'Minus ' : ''}${integerWords(whole)}${numeric[3] ? ` Point ${[...numeric[3]].map(digit => SMALL[Number(digit)]).join(' ')}` : ''}`
    : undefined
  return { operation, answerWords }
}
