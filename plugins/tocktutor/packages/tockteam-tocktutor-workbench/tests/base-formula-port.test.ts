import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import {
  evaluateNotesBaseFormula,
  evaluateNotesBaseSummary,
} from '../src/NotesBaseFormula.ts'
import {
  NOTES_BASE_ICON_NAMES,
  createNotesBaseIconValue,
  notesBaseIconName,
} from '../src/NotesBaseFormulaIcon.ts'
import {
  evaluateNotesBaseFilterTree,
  parseNotesBaseFilterBlock,
} from '../src/NotesBaseFilterTree.ts'
import { TOCKBOT_BASE_EVALUATOR_PROVENANCE } from '../src/base-evaluator-provenance.ts'

const resolve = (property: string): unknown => ({
  effort: 2,
  impact: 3,
  status: 'Open',
  tags: ['urgent', 'project/review'],
}[property])

test('ports the bounded Tockbot Base evaluator contract', () => {
  assert.deepEqual(evaluateNotesBaseFormula('(impact * 2) / effort', resolve), {
    supported: true,
    value: 3,
  })
  assert.deepEqual(evaluateNotesBaseFormula('tags.contains("urgent")', resolve), {
    supported: true,
    value: true,
  })
  assert.deepEqual(evaluateNotesBaseSummary('sum(score)', [{ score: 2 }, { score: 3 }], (row, key) => row[key as 'score']), {
    supported: true,
    value: 5,
  })

  const icon = createNotesBaseIconValue('arrow-right')
  assert.equal(notesBaseIconName(icon), 'arrow-right')
  assert.equal(NOTES_BASE_ICON_NAMES.length, 189)
  assert.equal(TOCKBOT_BASE_EVALUATOR_PROVENANCE.revision, 'af214b2d1a5df8ca23bf99fad9f0408a07c2e4ba')
})

test('evaluates only the bounded nested Base filter grammar', () => {
  const tree = parseNotesBaseFilterBlock([
    'and:',
    '  - status == active',
    '  - or:',
    '    - score > 2',
    '    - not:',
    '      - archived == true',
  ])
  const matched = new Map([
    ['status == active', true],
    ['score > 2', false],
    ['archived == true', false],
  ])
  assert.deepEqual(evaluateNotesBaseFilterTree(tree, statement => ({
    supported: true,
    matched: matched.get(statement) ?? false,
  })), { supported: true, matched: true })

  const nested = (levels: number): string[] => [
    'and:',
    ...Array.from({ length: levels }, (_, index) => `${'  '.repeat(index + 1)}- and:`),
    `${'  '.repeat(levels + 1)}- status == active`,
  ]
  assert.equal(parseNotesBaseFilterBlock(nested(7)).kind, 'and')
  assert.equal(parseNotesBaseFilterBlock(nested(8)).kind, 'unsupported')
  assert.equal(parseNotesBaseFilterBlock([
    'and:',
    ...Array.from({ length: 63 }, (_, index) => `  - note.value == ${String(index)}`),
  ]).kind, 'and')
  assert.equal(parseNotesBaseFilterBlock([
    'and:',
    ...Array.from({ length: 64 }, (_, index) => `  - note.value == ${String(index)}`),
  ]).kind, 'unsupported')
  assert.equal(parseNotesBaseFilterBlock(['and:', '  - xor:', '    - status == active']).kind, 'unsupported')
})

test('fails closed when a later conjunction child is unsupported', () => {
  const statement = (expression: string) => expression === 'unsupported'
    ? { supported: false as const, kind: 'formula' as const, expression }
    : { supported: true as const, matched: expression === 'true' }

  for (const tree of [
    { kind: 'and' as const, children: [
      { kind: 'statement' as const, statement: 'false' },
      { kind: 'statement' as const, statement: 'unsupported' },
    ] },
    { kind: 'or' as const, children: [
      { kind: 'statement' as const, statement: 'true' },
      { kind: 'statement' as const, statement: 'unsupported' },
    ] },
    { kind: 'not' as const, children: [
      { kind: 'statement' as const, statement: 'true' },
      { kind: 'statement' as const, statement: 'unsupported' },
    ] },
  ]) {
    assert.deepEqual(evaluateNotesBaseFilterTree(tree, statement), {
      supported: false,
      kind: 'formula',
      expression: 'unsupported',
    })
  }
})

test('fails closed for hostile expressions and excessive filter trees', () => {
  for (const expression of [
    'eval("1 + 1")',
    'Function("return 1")()',
    'import("node:fs")',
    'fetch("https://example.com")',
    'globalThis.process.exit()',
    '({}).constructor.constructor("return process")()',
  ]) {
    assert.deepEqual(evaluateNotesBaseFormula(expression, resolve), { supported: false })
  }

  const tree = parseNotesBaseFilterBlock([
    'and:',
    ...Array.from({ length: 65 }, (_, index) => `  - note.value == ${String(index)}`),
  ])
  assert.equal(tree.kind, 'unsupported')
  const outcome = evaluateNotesBaseFilterTree(tree, () => ({ supported: true, matched: true }))
  assert.equal(outcome.supported, false)
  if (!outcome.supported) assert.equal(outcome.kind, 'filter')
})

test('ships no filesystem, network, import, or JavaScript evaluation path', async () => {
  const modules = [
    'NotesBaseFilterTree.ts',
    'NotesBaseFormula.ts',
    'NotesBaseFormulaArithmetic.ts',
    'NotesBaseFormulaDate.ts',
    'NotesBaseFormulaHtml.ts',
    'NotesBaseFormulaIcon.ts',
    'NotesBaseFormulaImage.ts',
    'NotesBaseFormulaLink.ts',
    'NotesBaseFormulaMedia.ts',
    'NotesBaseFormulaObject.ts',
    'NotesBaseFormulaPath.ts',
    'NotesBaseFormulaRegex.ts',
    'NotesBaseFormulaSyntax.ts',
    'NotesBaseFormulaTags.ts',
    'NotesBaseFormulaTagsMatch.ts',
    'NotesBaseFormulaValue.ts',
    'NotesBaseSummaryUnique.ts',
  ]
  for (const module of modules) {
    const source = await readFile(new URL(`../src/${module}`, import.meta.url), 'utf8')
    assert.doesNotMatch(source, /\beval\s*\(|new Function|import\s*\(|node:fs|fetch\s*\(/u, module)
  }
})
