import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Badge } from '@tockteam/ui/badge'
import { Input } from '@tockteam/ui/input'
import { Switch } from '@tockteam/ui/switch'
import { LAUNCHER_TERMINALS, isLauncherTerminalIds, isLauncherTerminalPrefix, launcherTerminalDefaults, type LauncherTerminalPlatform } from './launcher-terminal-config.ts'
import type { LauncherSettingsSnapshot } from './launcher-settings-contract.ts'
import { launcherFixedText } from './launcher-i18n.ts'

export type LauncherTerminalSettingsProps = Readonly<{
  busy: boolean
  save: (key: string, value: unknown) => Promise<boolean>
  snapshot: LauncherSettingsSnapshot
}>

function currentPlatform(): LauncherTerminalPlatform {
  const value = typeof navigator === 'undefined' ? '' : `${navigator.platform} ${navigator.userAgent}`
  if (/Windows/iu.test(value)) return 'Windows'
  if (/Macintosh|Mac OS|darwin/iu.test(value)) return 'macOS'
  return 'Linux'
}

function value<T>(snapshot: LauncherSettingsSnapshot, key: string, fallback: T): T {
  return Object.hasOwn(snapshot.values, key) ? snapshot.values[key] as T : fallback
}

export function LauncherTerminalSettings({ busy, save, snapshot }: LauncherTerminalSettingsProps): ReactNode {
  const platform = currentPlatform()
  const definitions = LAUNCHER_TERMINALS[platform]
  const defaultIds = useMemo(() => launcherTerminalDefaults(platform), [platform])
  const [prefix, setPrefix] = useState(() => value(snapshot, 'extension[TerminalLauncher].prefix', '>'))
  const [terminalIds, setTerminalIds] = useState<readonly string[]>(() => {
    const configured = value<unknown>(snapshot, 'extension[TerminalLauncher].terminalIds', defaultIds)
    return isLauncherTerminalIds(configured) ? configured : defaultIds
  })
  const terminalIdsRef = useRef<readonly string[]>(terminalIds)
  const [error, setError] = useState<string | undefined>()

  useEffect(() => {
    setPrefix(value(snapshot, 'extension[TerminalLauncher].prefix', '>'))
    const configured = value<unknown>(snapshot, 'extension[TerminalLauncher].terminalIds', defaultIds)
    const next = isLauncherTerminalIds(configured) ? configured : defaultIds
    terminalIdsRef.current = next
    setTerminalIds(next)
    setError(undefined)
  }, [defaultIds, snapshot])

  if (platform === 'Linux') {
    return <div data-testid="tocklauncher-terminal-settings"><Badge variant="outline">Terminal Launcher is unavailable on Linux.</Badge></div>
  }

  const savePrefix = (): void => {
    const next = prefix.trim()
    if (!isLauncherTerminalPrefix(prefix) || next !== prefix) {
      setError('Use a nonempty prefix up to 32 characters without line breaks.')
      return
    }
    void save('extension[TerminalLauncher].prefix', prefix).then(saved => { if (saved) setError(undefined) })
  }

  const toggle = (id: string, checked: boolean): void => {
    const previous = terminalIdsRef.current
    const next = definitions.filter(definition => checked ? definition.id === id || previous.includes(definition.id) : definition.id !== id && previous.includes(definition.id)).map(definition => definition.id)
    terminalIdsRef.current = next
    setTerminalIds(next)
    void save('extension[TerminalLauncher].terminalIds', next).then(saved => {
      if (!saved && terminalIdsRef.current === next) {
        terminalIdsRef.current = previous
        setTerminalIds(previous)
      }
    })
  }

  return (
    <div className="space-y-2" data-testid="tocklauncher-terminal-settings">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-3 border-b border-border/60 py-3">
        <div>
          <div className="text-sm font-medium text-foreground">{launcherFixedText('Command prefix')}</div>
          <div className="mt-1 text-xs text-muted-foreground">Type the prefix followed by a command. Every command requires native approval.</div>
        </div>
        <Input aria-describedby={error ? 'tocklauncher-terminal-prefix-help tocklauncher-terminal-prefix-error' : 'tocklauncher-terminal-prefix-help'} aria-invalid={error !== undefined} aria-label="Terminal Launcher command prefix" className="w-24" disabled={busy} maxLength={32} value={prefix} onChange={event => setPrefix(event.target.value)} onBlur={savePrefix} />
      </div>
      <p className="text-xs text-muted-foreground" id="tocklauncher-terminal-prefix-help">The command runs in the main-owned home directory through the selected terminal.</p>
      {definitions.map(definition => (
        <div className="flex items-center justify-between border-b border-border/60 py-3 last:border-b-0" key={definition.id}>
          <span className="text-sm text-foreground">{definition.name}</span>
          <Switch aria-label={`Enable Terminal Launcher ${definition.name}`} checked={terminalIds.includes(definition.id)} disabled={busy} onCheckedChange={checked => toggle(definition.id, checked)} />
        </div>
      ))}
      {error ? <p aria-live="polite" className="text-xs text-destructive" id="tocklauncher-terminal-prefix-error">{error}</p> : null}
    </div>
  )
}
