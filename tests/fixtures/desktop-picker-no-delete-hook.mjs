import fs from 'node:fs'
import { syncBuiltinESMExports } from 'node:module'

const mode = process.env.TOCKTEAM_HOOK_MODE
const foreign = process.env.TOCKTEAM_HOOK_FOREIGN ?? 'foreign-occupant'
let attacked = false

const original = {
  linkSync: fs.linkSync.bind(fs),
  open: fs.promises.open.bind(fs.promises),
  renameSync: fs.renameSync.bind(fs),
  writeFileSync: fs.writeFileSync.bind(fs),
}

if (mode === 'link-source-swap' || mode === 'link-destination-occupy') {
  fs.linkSync = (source, destination) => {
    if (!attacked) {
      attacked = true
      if (mode === 'link-source-swap') {
        original.renameSync(source, `${String(source)}-recorded-owner`)
        original.writeFileSync(source, foreign, { mode: 0o600 })
      } else {
        original.writeFileSync(destination, foreign, { mode: 0o600 })
      }
    }
    return original.linkSync(source, destination)
  }
}

if (mode === 'startup-stage-swap' || mode === 'startup-journal-open-swap') {
  fs.promises.open = async (path, ...args) => {
    const stage = process.env.TOCKTEAM_HOOK_STAGE
    if (mode === 'startup-stage-swap' && !attacked && stage !== undefined && String(path).includes('destination-') && String(path).endsWith('.json')) {
      attacked = true
      original.renameSync(stage, `${stage}-recorded-owner`)
      original.writeFileSync(stage, foreign, { mode: 0o600 })
    }
    const handle = await original.open(path, ...args)
    if (mode === 'startup-journal-open-swap' && !attacked && String(path).includes('destination-') && String(path).endsWith('.json')) {
      attacked = true
      original.renameSync(path, `${String(path)}-recorded-owner`)
      original.writeFileSync(path, foreign, { mode: 0o600 })
    }
    return handle
  }
}

if (mode === 'forbid-destructive') {
  const forbidden = name => () => { throw new Error(`forbidden managed path operation: ${name}`) }
  fs.unlinkSync = forbidden('unlinkSync')
  fs.rmSync = forbidden('rmSync')
  fs.rmdirSync = forbidden('rmdirSync')
  fs.renameSync = forbidden('renameSync')
  fs.promises.unlink = forbidden('unlink')
  fs.promises.rm = forbidden('rm')
  fs.promises.rmdir = forbidden('rmdir')
  fs.promises.rename = forbidden('rename')
}

syncBuiltinESMExports()
