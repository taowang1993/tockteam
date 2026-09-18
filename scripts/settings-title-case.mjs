import { readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

// Exact dictionary entries in the pinned DSH 0.1.2-rc.1 browser bundles.
// Patch the distribution copy only; never rewrite prose or user preset names.
const LABELS = {
  'dsh-client-ui-agent-preset': [
    ['nav', 'Agent presets', 'Agent Presets'],
    ['presetStandardName', 'Standard mode', 'Standard Mode'],
    ['presetPtcName', 'PTC mode', 'PTC Mode'],
    ['presetMinimalName', 'Minimal mode', 'Minimal Mode'],
    ['presetCordisName', 'Creator mode', 'Creator Mode'],
  ],
  'dsh-client-ui-settings-plugins': [
    ['configurableTab', 'Plugin configuration', 'Plugin Config'],
    ['agentLoopTitle', 'Agent loop', 'Agent Loop'],
    ['webSearchTitle', 'Web search', 'Web Search'],
  ],
  'dsh-client-ui-settings-plugin-inventory': [['tab', 'Plugin list', 'Plugin List']],
  'dsh-client-ui-theme': [['"fontSize.title"', 'Font size', 'Font Size']],
  'dsh-client-ui-chat': [['"settings.transcript.title"', 'Conversation display', 'Conversation Display']],
}

/** Apply reviewed copy changes after staging exposes the runtime packages. */
export function applySettingsTitleCase(runtimeRoot) {
  const updates = Object.entries(LABELS).map(([name, labels]) => {
    const path = join(runtimeRoot, 'node_modules', '@deepseek-ai', name, 'lib', 'client.js')
    const original = readFileSync(path, 'utf8')
    let source = original
    for (const [key, before, after] of labels) {
      const anchor = `${key}: ${JSON.stringify(before)}`
      const replacement = `${key}: ${JSON.stringify(after)}`
      const oldCount = source.split(anchor).length - 1
      const newCount = source.split(replacement).length - 1
      if (oldCount === 0 && newCount === 1) continue
      if (oldCount !== 1 || newCount !== 0) throw new Error(`${name}: settings title-case anchor changed or ambiguous: ${key}`)
      source = source.replace(anchor, replacement)
    }
    return { path, original, source }
  })
  // Validate every bundle before modifying any of them.
  for (const { path, original, source } of updates) if (source !== original) writeFileSync(path, source)
}

if (process.argv[1] !== undefined && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  if (process.argv.length !== 3) throw new Error('usage: node scripts/settings-title-case.mjs <runtime-root>')
  applySettingsTitleCase(resolve(process.argv[2]))
}
