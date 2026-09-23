// Isolated proof fixture. Launch only through extended_display; never call an OS app.
const { app, clipboard, shell } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const repo = '/Users/taowang/projects/worktrees/tutor';
if (!app.commandLine.hasSwitch('use-mock-keychain')) throw new Error('Mock Keychain required');
const root = app.getPath('appData'), data = app.getPath('userData');
const vault = path.join(root, 'Comparison Vault');
const put = (file, value) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, typeof value === 'string' ? value : JSON.stringify(value, null, 2)); };
fs.cpSync(path.join(repo, 'plugins/tocktutor/parity/fixtures/vault'), vault, { recursive: true });
put(path.join(vault, 'Notes/中文 #Open.md'), '# Default App Proof\n\nInitial content.\n');
put(path.join(vault, 'Notes/Other.md'), '# Other\n\nDo not save my separate draft.\n');
put(path.join(data, 'skins.json'), { activeId: null, fallbackTheme: 'dark' });
put(path.join(data, 'tocktutor/vault-state/selection.json'), { activeRoot: vault, recents: [] });
app.commandLine.appendSwitch('user-data-dir', data);
app.setAppPath(repo);
process.argv = [process.execPath, repo, '--use-mock-keychain'];
process.env.TOCKTEAM_RESOURCES_ROOT = path.join(repo, '.stage');
process.env.TOCKTEAM_SOURCE_ROOT = repo;
process.env.TOCKTEAM_TRUSTED_RAYCAST_DENY_EFFECTS_PROOF = '1';
for (const key of Object.keys(process.env)) if (/TOKEN|API_KEY|SECRET/.test(key)) delete process.env[key];
clipboard.writeText = (text, type) => fs.appendFileSync(path.join(root, 'clipboard.jsonl'), JSON.stringify({ text, type: type ?? 'clipboard' }) + '\n');
// Pure terminal sink only: do not call, retain, or fall back to the OS function.
const interceptedOpen = async target => {
  if (!target.startsWith(fs.realpathSync(vault) + path.sep)) throw new Error('Unexpected proof target');
  const failed = fs.existsSync(path.join(root, 'fail-open'));
  const record = { target, savedContent: fs.readFileSync(target, 'utf8'), failed, boundary: 'OS association intercepted; no app launched' };
  fs.appendFileSync(path.join(root, 'open-path.jsonl'), JSON.stringify(record) + '\n');
  return failed ? 'No associated application (injected)' : '';
};
shell.openPath = interceptedOpen;
if (shell.openPath !== interceptedOpen) throw new Error('Safe effect interception unavailable; do not bypass the guard');
put(path.join(root, 'fixture.json'), { repo, root, data, vault, note: 'Notes/中文 #Open.md', boundaries: ['OS association intercepted', 'Clipboard intercepted', 'Other external effects guard-denied'] });
import(pathToFileURL(path.join(repo, 'dist/main.js')).href).catch(error => { console.error(error); app.exit(1); });
