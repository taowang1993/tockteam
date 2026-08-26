import assert from 'node:assert/strict'
import test from 'node:test'

import { projectBase } from '@tockteam/tocktutor-workbench'
import { createDeterministicZip } from '../src/archive.ts'
import { ImportExportError } from '../src/core.ts'
import {
  planAppleJournal,
  planBear,
  planCsv,
  planEvernote,
  planGoogleKeep,
  planHtml,
  planRoam,
  planTextbundle,
} from '../src/formats/converters.ts'
import type { InspectedSourceFile } from '../src/formats/markdown.ts'

const encode = (value: string): Uint8Array => new TextEncoder().encode(value)
const text = (bytes: Uint8Array): string => new TextDecoder().decode(bytes)
const file = (path: string, content: string | Uint8Array): InspectedSourceFile => ({
  bytes: typeof content === 'string' ? encode(content) : content,
  fingerprint: `revision:${path}`,
  path,
})

test('converts bounded CSV rows into deterministic Markdown and an inert Base', () => {
  const result = planCsv(encode('Name,Score,Formula\n"Ada, A.",07,"=1+1"\nGrace,10,ok\n'), 'students.csv')
  assert.deepEqual(result.files.map(entry => entry.destination), [
    'Imported/students/Ada, A.md',
    'Imported/students/Grace.md',
    'Imported/students/students.base',
  ])
  const ada = text(result.files[0]!.bytes)
  assert.match(ada, /title: "Ada, A"/u)
  assert.match(ada, /score: "07"/u)
  assert.match(ada, /formula: "=1\+1"/u)
  assert.doesNotMatch(ada, /eval|Function/u)
  assert.equal(projectBase(text(result.files[2]!.bytes)).status, 'ready')
})

test('keeps HTML inert, rewrites accepted local notes, and copies reviewed local assets', () => {
  const result = planHtml([
    file('index.html', '<h1>Hello</h1><script>steal()</script>&lt;script&gt;encoded()&lt;/script&gt;<a href="next.html">Next</a><img src="image.png"><img src="https://bad.example/x.png">'),
    file('next.html', '<p>World</p>'),
    file('image.png', new Uint8Array([1, 2, 3])),
  ], 'Site')
  assert.deepEqual(result.files.map(entry => entry.destination), [
    'Imported/Site/image.png',
    'Imported/Site/index.md',
    'Imported/Site/next.md',
  ])
  const index = text(result.files.find(entry => entry.destination.endsWith('index.md'))!.bytes)
  assert.match(index, /# Hello/u)
  assert.match(index, /\[Next\]\(next\.md\)/u)
  assert.match(index, /!\[\]\(image\.png\)/u)
  assert.doesNotMatch(index, /script|steal|encoded|https:|<img/iu)
  assert.deepEqual(result.skipped, [{ label: 'https://bad.example/x.png', reason: 'remote-resource' }])
})

test('copies local HTML audio, video, and PDF resources without fetching remote references', () => {
  const result = planHtml([
    file('index.html', '<audio src="Media/clip%20one.mp3"></audio><video><source src="Media/demo.mp4"></video><a href="Media/Brief%20v1.pdf#page=2">Brief</a><audio src="https://bad.example/remote.mp3"></audio>'),
    file('Media/clip one.mp3', new Uint8Array([1])),
    file('Media/demo.mp4', new Uint8Array([2])),
    file('Media/Brief v1.pdf', new Uint8Array([3])),
  ], 'Media Site')
  assert.deepEqual(result.files.map(entry => entry.destination), [
    'Imported/Media Site/index.md',
    'Imported/Media Site/Media/Brief v1.pdf',
    'Imported/Media Site/Media/clip one.mp3',
    'Imported/Media Site/Media/demo.mp4',
  ])
  const markdown = text(result.files[0]!.bytes)
  assert.match(markdown, /!\[\[Media\/clip one\.mp3\]\]/u)
  assert.match(markdown, /!\[\[Media\/demo\.mp4\]\]/u)
  assert.match(markdown, /\[Brief\]\(Media\/Brief%20v1\.pdf#page=2\)/u)
  assert.deepEqual(result.skipped, [{ label: 'https://bad.example/remote.mp3', reason: 'remote-resource' }])
})

test('converts Apple Journal HTML while making ignored media visible', () => {
  const result = planAppleJournal([
    file('Day One.html', '<div class="pageHeader">2026-08-20</div><div class="reflectionPrompt">Gratitude</div><p class="p2">A &amp; B &lt;script&gt;encoded()&lt;/script&gt;</p><div data-asset-type="photo"></div>'),
  ])
  assert.deepEqual(result.files.map(entry => entry.destination), ['Journal/Day One.md'])
  assert.match(text(result.files[0]!.bytes), /date: 2026-08-20/u)
  assert.match(text(result.files[0]!.bytes), /A & B/u)
  assert.doesNotMatch(text(result.files[0]!.bytes), /script|encoded/u)
  assert.deepEqual(result.skipped, [{ label: 'Day One.html media', reason: 'unsupported-media' }])
})

test('converts real-shaped Apple Journal dates, metadata, and bounded rich text', () => {
  const result = planAppleJournal([
    file('Real Entry.html', [
      '<div class="pageHeader">Monday, 27 April 2026</div>',
      '<div class="reflectionPrompt">Notice this</div>',
      '<p class="p2"><strong>Bold</strong> and <a href="https://example.com">linked</a></p>',
      '<div class="assetGrid"><div class="gridItem assetType_activity"><span class="activityType">Running</span><span aria-label="5 km, Outdoors"></span></div><div class="gridItem assetType_genericMap"><span title="London"></span></div></div>',
    ].join('')),
  ])
  const markdown = text(result.files[0]!.bytes)
  assert.match(markdown, /date: 2026-04-27/u)
  assert.match(markdown, /activity:\n  - "Running"\n  - "5 km"\n  - "Outdoors"/u)
  assert.match(markdown, /location:\n  - "London"/u)
  assert.match(markdown, /Notice this\n\n\*\*Bold\*\* and \[linked\]\(https:\/\/example\.com\)/u)
})

test('does not silently drop Apple Journal entries after the first 500', () => {
  const files = Array.from({ length: 501 }, (_, index) => (
    file(`Journal ${String(index).padStart(3, '0')}.html`, '<p class="p2">Entry</p>')
  ))
  const result = planAppleJournal(files)
  assert.equal(result.files.length, files.length)
  assert.equal(result.sourceEntries, files.length)
})

test('converts Roam pages and rejects excessive block depth', () => {
  const source = [{ title: 'Project', children: [{ string: '{{[[TODO]]}} Ship #[[Now]]', children: [{ string: 'Nested' }] }] }]
  const result = planRoam(encode(JSON.stringify(source)))
  assert.deepEqual(result.files.map(entry => entry.destination), ['Imported/Roam Research/Project.md'])
  assert.match(text(result.files[0]!.bytes), /- \[ \] Ship #Now\n  - Nested/u)

  let node: Record<string, unknown> = { string: 'leaf' }
  for (let depth = 0; depth < 65; depth += 1) node = { string: 'node', children: [node] }
  assert.throws(
    () => planRoam(encode(JSON.stringify([{ title: 'Too Deep', children: [node] }]))),
    (error: unknown) => error instanceof ImportExportError && error.code === 'limit-exceeded',
  )
})

test('converts Google Keep JSON and only referenced supported attachments', () => {
  const archive = createDeterministicZip([
    { path: 'Takeout/Keep/note.json', bytes: encode(JSON.stringify({ title: 'Keep Note', textContent: 'Body', labels: [{ name: 'work' }], attachments: [{ filePath: 'photo.png' }] })) },
    { path: 'Takeout/Keep/photo.png', bytes: new Uint8Array([4, 5]) },
    { path: 'Takeout/Keep/unused.exe', bytes: new Uint8Array([6]) },
  ])
  const result = planGoogleKeep(archive)
  assert.deepEqual(result.files.map(entry => entry.destination), [
    'Imported/Google Keep/Attachments/photo.png',
    'Imported/Google Keep/Keep Note.md',
  ])
  assert.match(text(result.files[1]!.bytes), /tags:\n  - work/u)
  assert.deepEqual(result.skipped, [{ label: 'Takeout/Keep/unused.exe', reason: 'unsupported-type' }])
})

test('preserves mixed Google Keep text, tasks, timestamps, and color', () => {
  const archive = createDeterministicZip([
    { path: 'Takeout/Keep/mixed.json', bytes: encode(JSON.stringify({
      title: 'Mixed Keep',
      textContent: 'Opening text',
      listContent: [{ text: 'First task', isChecked: false }, { text: 'Done task', isChecked: true }],
      createdTimestampUsec: String(Date.parse('2026-08-20T12:00:00.000Z') * 1_000),
      userEditedTimestampUsec: String(Date.parse('2026-08-21T13:30:00.000Z') * 1_000),
      color: 'Cerulean',
    })) },
  ])
  const result = planGoogleKeep(archive)
  const markdown = text(result.files[0]!.bytes)
  assert.match(markdown, /created: "2026-08-20T12:00:00\.000Z"/u)
  assert.match(markdown, /updated: "2026-08-21T13:30:00\.000Z"/u)
  assert.match(markdown, /keep-color: cerulean/u)
  assert.match(markdown, /Opening text\n\n- \[ \] First task\n- \[x\] Done task/u)
})

test('preserves Markdown Textbundle source and accepted assets', () => {
  const result = planTextbundle([
    file('Course.textbundle/info.json', JSON.stringify({ type: 'net.daringfireball.markdown' })),
    file('Course.textbundle/text.md', '# Course\n![Image](./assets/photo.png)'),
    file('Course.textbundle/assets/photo.png', new Uint8Array([8, 9])),
    file('Course.textbundle/assets/run.js', encode('bad()')),
  ])
  assert.deepEqual(result.files.map(entry => entry.destination), [
    'Imported/Course/assets/photo.png',
    'Imported/Course/Course.md',
  ])
  assert.match(text(result.files[1]!.bytes), /\]\(assets\/photo\.png\)\n$/u)
  assert.deepEqual(result.skipped, [{ label: 'assets/run.js', reason: 'unsupported-type' }])
})

test('converts inert ENEX notes/resources and rejects entity declarations', () => {
  const enex = `<?xml version="1.0"?><en-export><note><title>Ever Note</title><created>20260820T120000Z</created><tag>work</tag><content><![CDATA[<en-note><div>Hello &lt;script&gt;encoded()&lt;/script&gt;</div><en-media hash="0cb988d042a7f28dd5fe2b55b3f5ac7a" type="image/png"/></en-note>]]></content><resource><data encoding="base64">AQI=</data><mime>image/png</mime><resource-attributes><file-name>photo.png</file-name></resource-attributes></resource></note></en-export>`
  const result = planEvernote(encode(enex), 'Notebook.enex')
  assert.deepEqual(result.files.map(entry => entry.destination), [
    'Imported/Evernote/Notebook/Attachments/Ever Note/photo.png',
    'Imported/Evernote/Notebook/Ever Note.md',
  ])
  assert.match(text(result.files[1]!.bytes), /Hello/u)
  assert.doesNotMatch(text(result.files[1]!.bytes), /script|encoded/u)
  for (const malformed of [
    '<!DOCTYPE x [<!ENTITY y SYSTEM "file:///etc/passwd">]><en-export/>',
    '<en-export><note><title>Broken</note></en-export>',
  ]) {
    assert.throws(
      () => planEvernote(encode(malformed), 'bad.enex'),
      (error: unknown) => error instanceof ImportExportError && error.code === 'unsupported-type',
    )
  }
})

test('preserves Evernote dates, source URL, and Stack@@@Notebook hierarchy', () => {
  const enex = '<en-export><note><title>Source Note</title><created>20260820T120000Z</created><updated>20260821T133000Z</updated><note-attributes><source-url>https://example.com/source?a=1&amp;b=2</source-url></note-attributes><content><![CDATA[<en-note><div>Body</div></en-note>]]></content></note></en-export>'
  const result = planEvernote(encode(enex), 'Stack@@@Notebook.enex')
  assert.deepEqual(result.files.map(entry => entry.destination), ['Imported/Evernote/Stack/Notebook/Source Note.md'])
  const markdown = text(result.files[0]!.bytes)
  assert.match(markdown, /created: "2026-08-20T12:00:00\.000Z"/u)
  assert.match(markdown, /updated: "2026-08-21T13:30:00\.000Z"/u)
  assert.match(markdown, /source-url: "https:\/\/example\.com\/source\?a=1&b=2"/u)
})

test('imports normal Bear Markdown and assets while surfacing unknown records', () => {
  const archive = createDeterministicZip([
    { path: 'notes/one/text.md', bytes: encode('# Bear Note\nBody\n') },
    { path: 'notes/one/info.json', bytes: encode(JSON.stringify({ title: 'Bear Note', tags: ['tag'], archived: false })) },
    { path: 'notes/one/assets/photo.jpg', bytes: new Uint8Array([3, 2, 1]) },
    { path: 'notes/one/state.bin', bytes: new Uint8Array([0]) },
  ])
  const result = planBear(archive)
  assert.deepEqual(result.files.map(entry => entry.destination), [
    'Imported/Bear/Attachments/Bear Note/photo.jpg',
    'Imported/Bear/Bear Note.md',
  ])
  assert.match(text(result.files[1]!.bytes), /tags:\n  - tag/u)
  assert.deepEqual(result.skipped, [{ label: 'notes/one/state.bin', reason: 'unsupported-record' }])
})

test('reads real Bear metadata and rewrites only resolvable note ID links', () => {
  const archive = createDeterministicZip([
    { path: 'notes/one/text.md', bytes: encode('# First\n[Second](bear://x-callback-url/open-note?id=ID-TWO)\n`bear://x-callback-url/open-note?id=ID-TWO`\n') },
    { path: 'notes/one/info.json', bytes: encode(JSON.stringify({ 'net.shinyfrog.bear': { uniqueIdentifier: 'ID-ONE', creationDate: '2026-08-20T12:00:00Z', modificationDate: '2026-08-21T13:30:00Z' } })) },
    { path: 'notes/two/text.md', bytes: encode('# Second\nBack to bear://x-callback-url/open-note?id=ID-ONE\n') },
    { path: 'notes/two/info.json', bytes: encode(JSON.stringify({ 'net.shinyfrog.bear': { uniqueIdentifier: 'ID-TWO', creationDate: '2026-08-19T10:00:00Z', modificationDate: '2026-08-20T11:00:00Z' } })) },
  ])
  const result = planBear(archive)
  const first = text(result.files.find(entry => entry.destination === 'Imported/Bear/First.md')!.bytes)
  const second = text(result.files.find(entry => entry.destination === 'Imported/Bear/Second.md')!.bytes)
  assert.match(first, /created: "2026-08-20T12:00:00\.000Z"/u)
  assert.match(first, /updated: "2026-08-21T13:30:00\.000Z"/u)
  assert.match(first, /\[\[Second\|Second\]\]/u)
  assert.match(first, /`bear:\/\/x-callback-url\/open-note\?id=ID-TWO`/u)
  assert.match(second, /\[\[First\]\]/u)
})
