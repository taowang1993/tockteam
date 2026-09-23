import { createRequire } from 'node:module'
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises'
import { buildTailwindCss } from '/Users/taowang/projects/worktrees/tutor/scripts/tailwind.mjs'
const root = '/Users/taowang/projects/worktrees/tutor'
const require = createRequire(root + '/package.json')
const { build } = require('esbuild')
const out = '/tmp/tutor-merge-ui-proof'
const ui = root + '/plugins/tocktutor/packages/tockteam-tocktutor-workbench/src'
await mkdir(out + '/vault/Archive', { recursive: true })
await mkdir(out + '/vault/Other', { recursive: true })
for (const [path, text] of [['Source.md', '---\nstatus: draft\n---\n# Source\n\n[Diagram](assets/diagram.png)\n'], ['Archive/Dest.md', '---\nstatus: published\n---\n# Destination\n'], ['Other/Dest.markdown', '# Another destination\n'], ['Ref.md', '[[Source]]\n[[Missing]]\n'], [' Note.md', '# Leading-space destination\n'], ['Note.md', '# Plain destination\n']]) await writeFile(out + '/vault/' + path, text)
await writeFile(out + '/skins.json', '{"activeId":null,"fallbackTheme":"dark"}')
const themePackage = (await readdir(root + '/node_modules/.pnpm')).find(name => name.startsWith('@deepseek-ai+dsh-client-ui-theme@0.1.2-rc.1'))
const theme = await readFile(root + '/node_modules/.pnpm/' + themePackage + '/node_modules/@deepseek-ai/dsh-client-ui-theme/lib/client.js', 'utf8')
const css = ['base_css_default', 'design_platform_css_default'].map(name => JSON.parse(theme.match(new RegExp('var ' + name + ' = ("[^\\n]*");'))[1])).join('\n')
await writeFile(out + '/theme.css', css + '\n' + await buildTailwindCss(root))
await build({ stdin: { resolveDir: ui, loader: 'tsx', contents: `
import React, { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { NoteMergeReview } from '${ui}/merge-review.tsx'
import { previewNoteMerge } from '${ui}/merge-preview.ts'
import { Button } from '@tockteam/ui/button'
document.documentElement.style.colorScheme = 'dark'
document.body.setAttribute('data-ds-dark-theme', '')
async function request(path, data, signal) {
 const response = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data), signal })
 const value = await response.json(); if (!response.ok) throw new Error(value.error); return value
}
function App() {
 const [open, setOpen] = useState(false)
 return <main className="min-h-screen bg-background p-8 text-foreground"><h1>Merge Review Component Verification</h1><p>Isolated fixture. No apply endpoint or production menu entry.</p><Button variant="secondary" onClick={() => setOpen(true)}>Review Merge</Button>{open && <NoteMergeReview sourcePath="Source.md" paths={['Source.md','Archive/Dest.md','Other/Dest.markdown','Ref.md','Board.canvas',' Note.md','Note.md']} onClose={() => setOpen(false)} onPrepare={async (path, signal) => {
 const [source, destination] = await Promise.all(['Source.md', path].map(path => request('/document', { path }, signal)))
 return { source, destination, signal, preview: (options, previewSignal) => previewNoteMerge({ ...options, source, destination, expectedVault: { id: 'vault:'+'a'.repeat(64), generation: 1 } }, (body, signal) => request('/preview', body, signal), previewSignal) }
 }} />}</main>
}
createRoot(document.getElementById('root')).render(<App />)
` }, bundle: true, outfile: out + '/ui.js', platform: 'browser', format: 'iife', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"' } })
await writeFile(out + '/index.html', '<!doctype html><html><head><meta charset="utf-8"><title>Merge Review Proof</title><meta http-equiv="Content-Security-Policy" content="default-src \'self\'; style-src \'self\' \'unsafe-inline\'; script-src \'self\'; connect-src \'self\'"><link rel="stylesheet" href="/theme.css"></head><body style="margin:0;font-family:var(--dsw-font-family)"><div id="root"></div><script src="/ui.js"></script></body></html>')
