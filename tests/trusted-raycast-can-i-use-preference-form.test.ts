import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { TrustedRaycastCanIUsePreferences } from '../src/trusted-raycast-can-i-use-preferences.ts'
import { createTrustedRaycastCanIUsePreferenceForm } from '../src/trusted-raycast-can-i-use-preference-form.ts'
import { inspectTrustedRaycastProjection, type TrustedRaycastViewNode } from '../src/trusted-raycast-contract.ts'

const values: TrustedRaycastCanIUsePreferences = {
  defaultQuery: '  exact, query  ', showReleaseDate: true, showPartialSupport: false, briefMode: true,
  path: '/unavailable-to-form', environment: 'unavailable-to-form',
}
const fieldIds = { defaultQuery: 'field-query', showReleaseDate: 'field-release', showPartialSupport: 'field-partial', briefMode: 'field-brief' } as const

function nodes(root: TrustedRaycastViewNode): TrustedRaycastViewNode[] {
  return root.children.flatMap(child => typeof child === 'string' ? [] : [child, ...nodes(child)])
}

test('projects Can I Use preferences into a finite preference form', () => {
  const root = createTrustedRaycastCanIUsePreferenceForm(values, fieldIds, 'action-submit')
  assert.deepEqual(root.props, { preferenceSetup: true, navigationDepth: 0, searchable: false, querySequence: 0 })
  const form = root.children[0]
  if (form === undefined || typeof form === 'string') throw new Error('Expected form node')
  assert.equal(form.type, 'raycast-form')
  const fields = form.children.filter((child): child is TrustedRaycastViewNode => typeof child !== 'string')
  assert.deepEqual(fields.map(field => field.type), ['raycast-text-field', 'raycast-form-dropdown', 'raycast-form-dropdown', 'raycast-form-dropdown', 'raycast-action-panel'])
  assert.deepEqual(fields[0]?.props, { title: 'Browser Targets', value: values.defaultQuery, fieldEventId: fieldIds.defaultQuery })
  assert.deepEqual(fields.slice(1, 4).map(field => field.props), [
    { title: 'Show Release Dates', value: 'true', fieldEventId: fieldIds.showReleaseDate },
    { title: 'Show Partial Support', value: 'false', fieldEventId: fieldIds.showPartialSupport },
    { title: 'Brief Mode', value: 'true', fieldEventId: fieldIds.briefMode },
  ])
  for (const dropdown of fields.slice(1, 4)) {
    assert.deepEqual(dropdown.children.map(child => typeof child === 'string' ? child : child.props), [
      { title: 'Yes', value: 'true' }, { title: 'No', value: 'false' },
    ])
  }
  const panel = fields[4]!
  assert.deepEqual(panel.children, [{ type: 'raycast-action', props: { title: 'Continue', actionEventId: 'action-submit' }, children: [] }])
  assert.equal(nodes(root).some(node => Object.values(node.props).includes(values.path) || Object.values(node.props).includes(values.environment)), false)
  assert.equal(inspectTrustedRaycastProjection(root).nodeCount, 14)
  assert.ok(inspectTrustedRaycastProjection(root).nodeCount < 32)
})
