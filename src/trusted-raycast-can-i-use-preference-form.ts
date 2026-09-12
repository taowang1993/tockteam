import type { TrustedRaycastCanIUsePreferences } from './trusted-raycast-can-i-use-preferences.ts'
import type { TrustedRaycastViewNode } from './trusted-raycast-contract.ts'

type PreferenceField = 'defaultQuery' | 'showReleaseDate' | 'showPartialSupport' | 'briefMode'

const booleanOptions = (): readonly TrustedRaycastViewNode[] => [
  { type: 'raycast-form-dropdown-item', props: { title: 'Yes', value: 'true' }, children: [] },
  { type: 'raycast-form-dropdown-item', props: { title: 'No', value: 'false' }, children: [] },
]

export function createTrustedRaycastCanIUsePreferenceForm(
  values: TrustedRaycastCanIUsePreferences,
  fieldIds: Readonly<Record<PreferenceField, string>>,
  submitId: string,
): TrustedRaycastViewNode {
  const dropdown = (field: Exclude<PreferenceField, 'defaultQuery'>, title: string): TrustedRaycastViewNode => ({
    type: 'raycast-form-dropdown',
    props: { title, value: String(values[field]), fieldEventId: fieldIds[field] },
    children: booleanOptions(),
  })
  return {
    type: 'root',
    props: { preferenceSetup: true, navigationDepth: 0, searchable: false, querySequence: 0 },
    children: [{
      type: 'raycast-form',
      props: {},
      children: [
        { type: 'raycast-text-field', props: { title: 'Browser Targets', value: values.defaultQuery, fieldEventId: fieldIds.defaultQuery }, children: [] },
        dropdown('showReleaseDate', 'Show Release Dates'),
        dropdown('showPartialSupport', 'Show Partial Support'),
        dropdown('briefMode', 'Brief Mode'),
        { type: 'raycast-action-panel', props: {}, children: [{ type: 'raycast-action', props: { title: 'Continue', actionEventId: submitId }, children: [] }] },
      ],
    }],
  }
}
