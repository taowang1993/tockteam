import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { applySettingsTitleCase } from '../scripts/settings-title-case.mjs'
import { WORKSPACE_MESSAGES } from '../plugins/sidebar/src/client/i18n.ts'
import { DESKTOP_SKINS_MESSAGES } from '../plugins/skins/src/client/i18n.ts'
import { TERMINAL_MESSAGES } from '../plugins/panel-controls/src/terminal/i18n.ts'
import { MARKETPLACE_MESSAGES } from '../plugins/plugin-marketplace/src/client/i18n.ts'
import { launcherFixedText, launcherText } from '../src/launcher-i18n.ts'

const dictionaries = {
  'dsh-client-ui-agent-preset': {
    nav: ['Agent presets', 'Agent Presets'],
    presetStandardName: ['Standard mode', 'Standard Mode'],
    presetPtcName: ['PTC mode', 'PTC Mode'],
    presetMinimalName: ['Minimal mode', 'Minimal Mode'],
    presetCordisName: ['Creator mode', 'Creator Mode'],
  },
  'dsh-client-ui-settings-plugins': {
    configurableTab: ['Plugin configuration', 'Plugin Config'],
    agentLoopTitle: ['Agent loop', 'Agent Loop'],
    webSearchTitle: ['Web search', 'Web Search'],
  },
  'dsh-client-ui-settings-plugin-inventory': { tab: ['Plugin list', 'Plugin List'] },
  'dsh-client-ui-theme': { '"fontSize.title"': ['Font size', 'Font Size'] },
  'dsh-client-ui-chat': { '"settings.transcript.title"': ['Conversation display', 'Conversation Display'] },
}

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'tockteam-settings-copy-'))
  const files = Object.entries(dictionaries).map(([name, entries]) => {
    const path = join(root, 'node_modules', '@deepseek-ai', name, 'lib', 'client.js')
    mkdirSync(dirname(path), { recursive: true })
    const source = [
      'const en = {',
      ...Object.entries(entries).map(([key, [before]]) => `${key}: ${JSON.stringify(before)},`),
      'description: "Built with Standard mode capabilities.",',
      '}; const zh = { nav: "预设", tab: "插件列表" };',
    ].join('\n')
    writeFileSync(path, source)
    return { path, source, entries }
  })
  return { root, files }
}

test('pinned settings copy changes only requested labels and is idempotent', () => {
  const { root, files } = fixture()
  try {
    applySettingsTitleCase(root)
    for (const { path, source, entries } of files) {
      let expected = source
      for (const [key, [before, after]] of Object.entries(entries)) {
        expected = expected.replace(`${key}: ${JSON.stringify(before)}`, `${key}: ${JSON.stringify(after)}`)
      }
      assert.equal(readFileSync(path, 'utf8'), expected)
    }
    const once = files.map(({ path }) => readFileSync(path, 'utf8'))
    applySettingsTitleCase(root)
    assert.deepEqual(files.map(({ path }) => readFileSync(path, 'utf8')), once)
  } finally { rmSync(root, { recursive: true, force: true }) }
})

test('unexpected or ambiguous upstream copy aborts before any files change', () => {
  for (const drift of ['const en = {};', 'const en = { "settings.transcript.title": "Conversation display", "settings.transcript.title": "Conversation display" };']) {
    const { root, files } = fixture()
    try {
      writeFileSync(files.at(-1)!.path, drift)
      assert.throws(() => applySettingsTitleCase(root), /settings title-case anchor/u)
      for (const { path, source } of files.slice(0, -1)) assert.equal(readFileSync(path, 'utf8'), source)
    } finally { rmSync(root, { recursive: true, force: true }) }
  }
})

test('first-party settings use the requested title case', () => {
  assert.equal(WORKSPACE_MESSAGES.en['side.title'], 'Side Panel')
  assert.equal(WORKSPACE_MESSAGES.en['settings.title'], 'Side Panel')
  assert.equal(WORKSPACE_MESSAGES.en['settings.width'], 'Default Width')
  assert.equal(DESKTOP_SKINS_MESSAGES.en['skins.title'], 'TockTeam Skin')
  assert.equal(TERMINAL_MESSAGES.en['terminal.font-size'], 'Font Size')
})

test('audited first-party labels use title case without changing sentence copy', () => {
  for (const [messages, expected] of [
    [WORKSPACE_MESSAGES.en, {
      'settings.open-by-default': 'Open at Launch',
      'settings.viewers': 'File Previews',
      'settings.runtime': 'Agent Access',
      'workspace.execution-environment': 'Execution Environment',
      'workspace.current-branch': 'Current Branch',
      'workspace.review-history': 'Commit History',
    }],
    [MARKETPLACE_MESSAGES.en, {
      'update-available': 'Update Available',
      'not-installed': 'Not Installed',
      trust: 'Source Trust',
      'risk-level': 'Risk Level',
      'open-repository': 'Open Repository',
      'preview.launch': 'Launch Isolated Preview',
      'reset-and-reload': 'Reset and Reload',
    }],
    [TERMINAL_MESSAGES.en, {
      'terminal.new-shell': 'New Shell',
      'terminal.font-settings': 'Terminal Font Settings',
      'terminal.font-family': 'Font Family',
      'terminal.close-settings': 'Close Settings',
    }],
    [DESKTOP_SKINS_MESSAGES.en, { 'skins.mode.system': 'Follow Appearance' }],
  ] as const) {
    for (const [key, value] of Object.entries(expected)) {
      assert.equal((messages as Record<string, string>)[key], value, key)
    }
  }
  assert.equal(WORKSPACE_MESSAGES.en['settings.open-by-default-description'], 'Restore the side panel automatically when the desktop starts.')
  assert.equal(launcherText('en-US', 'searchTerm', ''), 'Search Term')
  assert.equal(launcherText('en-US', 'textToTranslate', ''), 'Text to Translate')
  assert.equal(launcherText('zh-CN', 'searchTerm', ''), '搜索词')
  assert.equal(launcherText('zh-CN', 'textToTranslate', ''), '要翻译的文本')
  assert.equal(launcherFixedText('Search Files', 'zh-CN'), '搜索文件')
})

test('full, quick, and Nix staging apply the settings copy patch', () => {
  const stage = readFileSync(new URL('../scripts/stage-dsh.mjs', import.meta.url), 'utf8')
  const nix = readFileSync(new URL('../nix/dsh-runtime-pinned.nix', import.meta.url), 'utf8')
  assert.equal(stage.split('applySettingsTitleCase(runtime)').length - 1, 2)
  assert.ok(nix.includes('node ${../scripts/settings-title-case.mjs} "$PWD"'))
})
