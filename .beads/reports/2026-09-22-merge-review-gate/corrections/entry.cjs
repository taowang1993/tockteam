// Launch only through extended_display. Read-only, allowlisted fixture service.
const { app, BrowserWindow } = require('electron')
const { createServer } = require('node:http')
const { readFile } = require('node:fs/promises')
const { createHash } = require('node:crypto')
const root = '/tmp/tutor-merge-ui-proof'
const paths = [' Note.md', 'Archive/Dest.md', 'Note.md', 'Other/Dest.markdown', 'Ref.md', 'Source.md']
const digest = text => createHash('sha256').update(text).digest('hex')
async function document(path) {
  if (!paths.includes(path)) throw new Error('Unknown fixture path')
  const content = await readFile(root + '/vault/' + path, 'utf8')
  return { path, content, revision: 'file:' + digest(content), digest: 'sha256:' + digest(content), generation: 1 }
}
app.whenReady().then(async () => {
  const { createVaultInspection } = await import('/Users/taowang/projects/worktrees/tutor/plugins/tocktutor/packages/tockbot-note-vault/inspection.js')
  const inspection = createVaultInspection({
    async list() {
      const entries = await Promise.all(paths.map(async path => { const doc = await document(path); return { path, kind: 'document', revision: doc.revision, size: Buffer.byteLength(doc.content), createdMs: 1, modifiedMs: 1 } }))
      return { entries, complete: true, cursor: null, truncated: false, truncationReason: null, warnings: [] }
    }, read: document,
  }, { maxReadBytes: 2000000, maxSearchFileBytes: 2000000, maxSearchBytes: 67108864, maxSearchEntries: 100, maxSearchResults: 1 })
  const assets = { '/': ['index.html', 'text/html'], '/theme.css': ['theme.css', 'text/css'], '/ui.js': ['ui.js', 'text/javascript'] }
  const server = createServer(async (request, response) => {
    try {
      if (request.method === 'GET' && assets[request.url]) { const [path, type] = assets[request.url]; response.setHeader('Content-Type', type); return response.end(await readFile(root + '/' + path)) }
      if (request.method !== 'POST' || !['/document','/preview'].includes(request.url)) { response.writeHead(404); return response.end() }
      let body = ''; for await (const chunk of request) { body += chunk; if (body.length > 2000000) throw new Error('Oversized fixture request') }
      const data = JSON.parse(body)
      const value = request.url === '/document' ? await document(data.path) : { ...await inspection.planMergeLinks(data), generation: 1 }
      response.setHeader('Content-Type', 'application/json'); response.end(JSON.stringify(value))
    } catch (error) { response.writeHead(400, { 'Content-Type': 'application/json' }); response.end(JSON.stringify({ error: error.message })) }
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  app.once('before-quit', () => server.close())
  const win = new BrowserWindow({ width: 1512, height: 949, useContentSize: true, show: false, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } })
  win.once('ready-to-show', () => win.showInactive())
  await win.loadURL('http://127.0.0.1:' + server.address().port + '/')
})
app.on('window-all-closed', () => app.quit())
