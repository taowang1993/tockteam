import assert from 'node:assert/strict'
import { test } from 'node:test'
import { launcherCalculatorCaptions, launcherCalculatorDisplayAnswer } from '../src/launcher-calculator-caption.ts'

test('calculator display groups digits without rounding or changing non-scalar answers', () => {
  for (const [answer, displayed] of [
    ['18887', '18,887'],
    ['-1234567.0123456789', '-1,234,567.0123456789'],
    ['1000000 cm', '1,000,000 cm'],
    ['999.25', '999.25'],
    ['18887,5', '18887,5'],
    ['[1000, 2000]', '[1000, 2000]'],
    ['1.2e+20', '1.2e+20'],
    ['2i', '2i'],
  ] as const) assert.equal(launcherCalculatorDisplayAnswer(answer), displayed, answer)
})

test('calculator captions follow the operation and spelled-out answer', () => {
  for (const [expression, answer, operation, answerWords] of [
    ['5+10', '15', 'Sum', 'Fifteen'],
    ['3 * 4', '12', 'Product', 'Twelve'],
    ['12 - 20', '-8', 'Difference', 'Minus Eight'],
    ['8 / 2', '4', 'Quotient', 'Four'],
    ['2^3', '8', 'Power', 'Eight'],
    ['1/4', '0.25', 'Quotient', 'Zero Point Two Five'],
    ['1+999', '1000', 'Sum', 'One Thousand'],
    ['99+2', '101', 'Sum', 'One Hundred One'],
    ['9*9', '81', 'Product', 'Eighty-One'],
    ['1,5+0,5', '2', 'Sum', 'Two'],
    ['1/3', '0,333', 'Quotient', 'Zero Point Three Three Three'],
    ['sqrt(4)', '2', undefined, 'Two'],
    ['(1000m in km)/3', '0.33 km', undefined, undefined],
    ['2+2', '2i', 'Sum', undefined],
  ] as const) {
    assert.deepEqual(launcherCalculatorCaptions(expression, answer), { operation, answerWords }, `${expression} → ${answer}`)
  }
})
