import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { test } from 'node:test'
import { buildSync } from 'esbuild'
import { DESKTOP_SKINS_MESSAGES } from '../plugins/skins/src/client/i18n.ts'
import { TOCKTEAM_SKINS } from '../plugins/skins/src/skins.ts'

const requireFromUi = createRequire(new URL('../plugins/ui/package.json', import.meta.url))
const react = requireFromUi('react')
const render = requireFromUi('react-dom/server').renderToStaticMarkup
const bundle = buildSync({
  entryPoints: [new URL('../plugins/skins/src/client/plugin.tsx', import.meta.url).pathname],
  bundle: true,
  external: ['react', 'react/*', '@tockteam/ui/*', '@deepseek-ai/dsh-client-store', 'lucide-react'],
  format: 'cjs',
  jsx: 'automatic',
  platform: 'node',
  write: false,
}).outputFiles[0]!.text
const module = { exports: {} as { apply?: (ctx: unknown) => void } }
new Function('module', 'exports', 'require', bundle)(module, module.exports, (name: string) => {
  if (name === '@deepseek-ai/dsh-client-store') return { defineStore: (store: unknown) => store }
  if (name === '@tockteam/ui/toggle-group') {
    return {
      ToggleGroup: ({ children, unstyled: _unstyled, ...props }: any) => react.createElement('div', props, children),
      ToggleGroupItem: ({ children, unstyled: _unstyled, ...props }: any) => react.createElement('button', props, children),
    }
  }
  if (name === 'lucide-react') return { Check: () => null }
  return requireFromUi(name)
})
let row: unknown
module.exports.apply!({
  get: (service: string) => service === 'slots' ? {
    inject: (_name: string, register: () => void) => register(),
    register: (options: { id: string }, component: unknown) => { if (options.id === 'tockteam-skins') row = component },
  } : service === 'theme' ? { getTheme: () => ({ active: { colorScheme: 'light' } }) } : {},
  effect: () => undefined,
})

test('every skin card shows its Light palette on the left and Dark palette on the right in either Appearance mode', () => {
  assert.ok(row)
  const choices = [
    ['Default', '#fafafa', '#30343b'],
    ...TOCKTEAM_SKINS.map(skin => [skin.displayName, skin.palettes.light.preview, skin.palettes.dark.preview]),
  ]
  for (const mode of ['light', 'dark']) {
    const markup = render(react.createElement(row, {
      setSkin: () => undefined,
      t: (key: keyof typeof DESKTOP_SKINS_MESSAGES.en) => DESKTOP_SKINS_MESSAGES.en[key],
      useStore: (select: (state: unknown) => unknown) => select({ activeId: '', ready: true, mode }),
    })) as string
    for (const [label, light, dark] of choices) {
      const card = markup.split(`aria-label="${label}"`)[1]?.split('</button>')[0]
      assert.ok(card, `${label}: ${mode} card is visible`)
      const halves = [...card.matchAll(/data-tockteam-skin-preview="(light|dark)"[^>]*style="background:([^"]+)"/gu)]
      assert.deepEqual(halves.map(([, side, background]) => [side, background]), [['light', light], ['dark', dark]], `${label}: ${mode} preview`)
    }
  }
})
