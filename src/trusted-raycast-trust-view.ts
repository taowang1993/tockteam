import { trustedRaycastAssetUrl, trustedRaycastCommands } from './trusted-raycast-catalog.ts'
import type { LauncherPreloadBridge } from './launcher-preload-bridge.ts'
import type { TrustedRaycastTrustAction, TrustedRaycastTrustState } from './trusted-raycast-contract.ts'
import type { TrustedRaycastExtensionId } from './trusted-raycast-descriptors.ts'

const COPY = Object.freeze({
  en: Object.freeze({
    back: 'Back to Results',
    capabilityInactive: 'Capability Inactive',
    title: 'Extensions',
    intro: 'Reviewed trusted extensions execute third-party code with account-level authority outside the launcher renderer. Installation verifies the reviewed archive digest before anything loads.',
    name: 'Google Translate',
    kaomojiName: 'Kaomoji Search',
    canIUseName: 'Can I Use',
    notInstalled: 'Not Installed',
    installedDisabled: 'Installed · Disabled',
    installedEnabled: 'Installed · Enabled',
    recoveryRequired: 'Recovery Required',
    reviewedDigest: 'Reviewed digest',
    install: 'Install Reviewed Extension',
    approveInstall: 'Approve & Install',
    cancel: 'Cancel',
    enable: 'Enable Extension',
    disable: 'Disable Extension',
    remove: 'Remove Extension',
    confirmRemove: 'Confirm Remove',
    recover: 'Recover Installation',
    actionFailed: 'Action failed',
    previousRetained: 'Previous install retained for recovery.',
    reviewBeforeOpen: 'Review Before You Open',
    securityNote: 'Security Note',
    backHint: 'Back',
    loading: 'Loading…',
    preparing: 'Preparing…',
    installedLead: 'This extension is installed and ready to run.',
    disabledLead: 'This extension is installed but disabled. Enable it to open.',
    recoveryLead: 'This extension needs recovery before it can open.',
    unavailableLead: 'The reviewed candidate is currently unavailable.',
    inactiveLead: 'This capability is unavailable right now.',
  }),
  zh: Object.freeze({
    back: '返回结果',
    capabilityInactive: '能力未激活',
    title: '扩展',
    intro: '经审核的可信扩展会在启动器渲染器之外以账户级权限执行第三方代码。安装会在任何代码加载前校验已审核归档的摘要。',
    name: 'Google 翻译',
    kaomojiName: 'Kaomoji Search',
    canIUseName: 'Can I Use',
    notInstalled: '未安装',
    installedDisabled: '已安装 · 已停用',
    installedEnabled: '已安装 · 已启用',
    recoveryRequired: '需要恢复',
    reviewedDigest: '已审核摘要',
    install: '安装已审核扩展',
    approveInstall: '批准并安装',
    cancel: '取消',
    enable: '启用扩展',
    disable: '停用扩展',
    remove: '移除扩展',
    confirmRemove: '确认移除',
    recover: '恢复安装',
    actionFailed: '操作失败',
    previousRetained: '已保留上一次安装以用于恢复。',
    reviewBeforeOpen: '打开前查看',
    securityNote: '安全提示',
    backHint: '返回',
    loading: '正在读取…',
    preparing: '正在准备…',
    installedLead: '此扩展已安装，可以运行。',
    disabledLead: '此扩展已安装但已停用。启用后即可打开。',
    recoveryLead: '此扩展需要恢复后才能打开。',
    unavailableLead: '当前无法使用已审核候选版本。',
    inactiveLead: '此能力当前不可用。',
  }),
})

const SHORT_DIGEST = 16

/** First-party trust surface over the existing launcher local-tool pattern. */
export function createTrustedRaycastTrustView(document: Document, bridge: LauncherPreloadBridge, onClose: () => void, locale = 'en-US'): { element: HTMLElement; dispose: () => void; focus: () => void } {
  const zh = locale.startsWith('zh')
  const copy = zh ? COPY.zh : COPY.en
  let state: TrustedRaycastTrustState | undefined
  let selected: TrustedRaycastExtensionId = 'google-translate'
  let requestSequence = 0
  let disposed = false
  let busy = false
  let confirmStep: 'remove' | undefined

  const element = document.createElement('section')
  element.className = 'launcher-local-tool text-sm'
  element.setAttribute('aria-label', copy.title)
  const header = document.createElement('header'); header.className = 'launcher-command-header justify-between'
  const title = document.createElement('h2'); title.textContent = copy.title; title.className = 'm-0 text-sm font-semibold'
  const close = document.createElement('button'); close.type = 'button'; close.className = 'launcher-command-footer-action'; close.textContent = copy.back; close.addEventListener('click', onClose)
  header.append(title, close)
  const content = document.createElement('div'); content.className = 'launcher-command-content'
  const intro = document.createElement('p'); intro.className = 'launcher-command-status'; intro.textContent = copy.intro
  const tabs = document.createElement('div'); tabs.className = 'flex flex-col gap-1'; tabs.setAttribute('role', 'tablist'); tabs.setAttribute('aria-label', copy.title); tabs.setAttribute('aria-orientation', 'vertical')
  const status = document.createElement('p'); status.className = 'launcher-command-status'; status.setAttribute('role', 'status')
  const digestLine = document.createElement('p'); digestLine.className = 'launcher-command-status [overflow-wrap:anywhere]'; digestLine.hidden = true
  const previous = document.createElement('p'); previous.className = 'launcher-command-status'; previous.hidden = true
  const error = document.createElement('p'); error.className = 'launcher-command-error'; error.setAttribute('role', 'alert'); error.hidden = true
  const buttons = document.createElement('div'); buttons.className = 'flex flex-wrap items-start gap-2 py-2'
  content.append(intro, tabs, status, digestLine, previous, error, buttons)
  element.append(header, content)

  const buttonClass = 'launcher-command-footer-action bg-[var(--dsw-alias-bg-layer-2,Canvas)] disabled:opacity-50'
  const renderButton = (label: string, run: () => void): HTMLButtonElement => {
    const button = document.createElement('button'); button.type = 'button'; button.className = buttonClass; button.textContent = label; button.disabled = busy
    button.addEventListener('click', run); buttons.append(button)
    return button
  }

  const runAction = (action: TrustedRaycastTrustAction): void => {
    if (busy || disposed || state === undefined) return
    busy = true
    error.hidden = true
    for (const button of buttons.querySelectorAll('button')) button.disabled = true
    const extensionId = selected
    const sequence = requestSequence
    void bridge.trustedRaycastTrustAction(extensionId, action).then(result => {
      if (disposed || sequence !== requestSequence || selected !== extensionId || result.extensionId !== extensionId) return
      render(result.state)
      if (!result.ok) { error.textContent = `${copy.actionFailed}: ${result.error}`; error.hidden = false }
    }).catch(failure => {
      if (disposed || sequence !== requestSequence) return
      error.textContent = `${copy.actionFailed}: ${failure instanceof Error ? failure.message : 'Unavailable'}`; error.hidden = false
      if (state) render(state)
    }).finally(() => { if (disposed || sequence !== requestSequence) return; busy = false; if (state) render(state); buttons.querySelectorAll<HTMLButtonElement>('button')[0]?.focus() })
  }

  const render = (next: TrustedRaycastTrustState): void => {
    if (disposed) return
    state = next
    status.textContent = !next.active ? copy.capabilityInactive
      : next.recovery !== '' ? copy.recoveryRequired
      : next.installed ? next.enabled ? copy.installedEnabled : copy.installedDisabled
      : copy.notInstalled
    digestLine.hidden = next.digest.length === 0
    if (next.digest.length > 0) digestLine.textContent = `${copy.reviewedDigest}: ${next.digest.slice(0, SHORT_DIGEST)}…${next.digest.slice(-8)}`
    previous.hidden = !next.hasPrevious
    if (next.hasPrevious) previous.textContent = copy.previousRetained
    buttons.replaceChildren()
    if (!next.active) return
    if (next.recovery !== '') { renderButton(copy.recover, () => runAction('recover')); return }
    if (next.installed) {
      renderButton(next.enabled ? copy.disable : copy.enable, () => runAction(next.enabled ? 'disable' : 'enable'))
      if (confirmStep === 'remove') renderButton(copy.confirmRemove, () => { confirmStep = undefined; runAction('remove') })
      else renderButton(copy.remove, () => { confirmStep = 'remove'; if (state) render(state) })
      return
    }
    if (!next.candidateAvailable) return
    if (next.staged && next.previewed) renderButton(copy.approveInstall, () => runAction('apply'))
    else renderButton(copy.install, () => runAction('prepare'))
  }

  const load = (extensionId: TrustedRaycastExtensionId): void => {
    selected = extensionId; state = undefined; confirmStep = undefined; busy = true; error.hidden = true; status.textContent = ''
    digestLine.hidden = true; previous.hidden = true; buttons.replaceChildren()
    const sequence = ++requestSequence
    for (const tab of tabs.querySelectorAll('button')) { tab.setAttribute('aria-selected', String(tab.getAttribute('data-extension-id') === extensionId)); tab.tabIndex = tab.getAttribute('data-extension-id') === extensionId ? 0 : -1 }
    void bridge.getTrustedRaycastTrust(extensionId).then(next => { if (!disposed && sequence === requestSequence && selected === extensionId) render(next) }).catch(failure => {
      if (disposed || sequence !== requestSequence || selected !== extensionId) return
      status.setAttribute('data-state', 'unavailable')
      status.textContent = copy.capabilityInactive
      error.textContent = `${copy.actionFailed}: ${failure instanceof Error ? failure.message : 'Unavailable'}`; error.hidden = false
    }).finally(() => { if (!disposed && sequence === requestSequence) { busy = false; if (state) render(state) } })
  }
  for (const [extensionId, label] of [['google-translate', copy.name], ['kaomoji-search', copy.kaomojiName], ['can-i-use', copy.canIUseName]] as const) {
    const tab = document.createElement('button'); tab.type = 'button'; tab.className = 'launcher-command-row'; tab.textContent = label; tab.setAttribute('role', 'tab'); tab.setAttribute('data-extension-id', extensionId); tab.addEventListener('click', () => load(extensionId))
    const image = document.createElement('img'); image.className = 'launcher-command-row-icon'; image.alt = ''; image.src = trustedRaycastAssetUrl(trustedRaycastCommands.find(command => command.extensionId === extensionId)!.imageKey)!
    const labelNode = document.createElement('span'); labelNode.textContent = label; tab.textContent = ''; tab.append(image, labelNode); tabs.append(tab)
  }
  tabs.addEventListener('keydown', event => {
    const rows = [...tabs.querySelectorAll<HTMLButtonElement>('button')]
    const index = rows.findIndex(row => row.getAttribute('data-extension-id') === selected)
    const next = event.key === 'ArrowDown' ? (index + 1) % rows.length : event.key === 'ArrowUp' ? (index + rows.length - 1) % rows.length : event.key === 'Home' ? 0 : event.key === 'End' ? rows.length - 1 : undefined
    if (next === undefined) return
    event.preventDefault(); event.stopPropagation()
    load(rows[next]!.getAttribute('data-extension-id') as TrustedRaycastExtensionId); rows[next]!.focus()
  })
  load('google-translate')
  const focus = (): void => { tabs.querySelectorAll<HTMLButtonElement>('button')[0]?.focus() }
  return { element, focus, dispose: () => { disposed = true; requestSequence++ } }
}

/** Inline review only. The callback delegates consent and all mutations to the Host. */
export function createTrustedRaycastFirstUseView(
  document: Document, bridge: LauncherPreloadBridge, extensionId: import('./trusted-raycast-descriptors.ts').TrustedRaycastRuntimeExtensionId,
  onClose: () => void, onApprove: (digest: string, mode: 'approve' | 'enable') => Promise<void>, onManage: () => void,
  locale = 'en-US',
): { element: HTMLElement; dispose: () => void; focus: () => void } {
  const zh = locale.startsWith('zh')
  const copy = zh ? COPY.zh : COPY.en
  const command = trustedRaycastCommands.find(command => command.extensionId === extensionId)!
  const name = command.extensionName
  let disposed = false
  let busy = false
  let state: TrustedRaycastTrustState | undefined
  const element = document.createElement('section'); element.className = 'launcher-local-tool extension-first-use-view text-sm'; element.setAttribute('aria-label', name); element.setAttribute('data-view', 'extension-first-use')
  const header = document.createElement('header'); header.className = 'launcher-command-header justify-between'
  const title = document.createElement('h2'); title.className = 'm-0 text-sm font-semibold extension-first-use-title'; title.textContent = name
  const back = document.createElement('button'); back.type = 'button'; back.className = 'launcher-command-footer-action extension-first-use-back'; back.textContent = copy.back; back.addEventListener('click', onClose)
  const identity = document.createElement('div'); identity.className = 'flex min-w-0 items-center gap-2'
  const image = document.createElement('img'); image.className = 'launcher-command-row-icon extension-first-use-icon'; image.alt = ''; image.src = trustedRaycastAssetUrl(command.imageKey)!
  identity.append(image, title); header.append(identity, back)
  const content = document.createElement('div'); content.className = 'launcher-command-content extension-first-use-content'
  const review = document.createElement('div'); review.className = 'extension-first-use-review'; review.setAttribute('data-part', 'approval-card')
  const eyebrow = document.createElement('p'); eyebrow.className = 'extension-first-use-eyebrow'; eyebrow.textContent = zh ? '首次使用' : copy.reviewBeforeOpen
  const lead = document.createElement('p'); lead.className = 'extension-first-use-lead'; lead.textContent = zh ? `批准安装、启用并运行 ${name}。` : `Approve to install, enable, and run ${name}.`
  const warning = document.createElement('aside'); warning.className = 'extension-first-use-warning'; warning.setAttribute('role', 'note')
  const warningTitle = document.createElement('strong'); warningTitle.className = 'extension-first-use-warning-title'; warningTitle.textContent = copy.securityNote
  const warningText = document.createElement('p'); warningText.className = 'extension-first-use-warning-text'; warningText.textContent = zh ? '此经审核的第三方本地代码可使用您账户的文件、网络和进程权限；其独立进程不是沙箱。启动前，TockTeam 会校验已审核版本。' : "This reviewed third-party local code can access files, network, and processes with your account's authority. Its separate process is not a sandbox. TockTeam verifies the reviewed version before it starts."
  warning.append(warningTitle, warningText)
  const status = document.createElement('p'); status.className = 'launcher-command-status extension-first-use-status'; status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite'); status.hidden = true
  const error = document.createElement('p'); error.className = 'launcher-command-error extension-first-use-error'; error.setAttribute('role', 'alert'); error.hidden = true
  const footer = document.createElement('footer'); footer.className = 'launcher-command-footer extension-first-use-footer'
  const approve = document.createElement('button'); approve.type = 'button'; approve.className = 'launcher-command-footer-action extension-first-use-primary'; approve.disabled = true
  const escape = document.createElement('span'); escape.className = 'extension-first-use-escape'
  const escapeKey = document.createElement('kbd'); escapeKey.textContent = 'Esc'
  const escapeLabel = document.createElement('span'); escapeLabel.textContent = copy.backHint
  escape.append(escapeKey, escapeLabel)
  footer.append(approve, escape); review.append(eyebrow, lead, warning, status, error); content.append(review); element.append(header, content, footer)
  const render = (): void => {
    if (disposed || !state) return
    const unavailable = !state.active || (!state.recovery && !state.installed && !state.candidateAvailable)
    lead.textContent = !state.active ? copy.inactiveLead : state.recovery ? copy.recoveryLead : state.installed ? state.enabled ? copy.installedLead : copy.disabledLead : unavailable ? copy.unavailableLead : (zh ? `批准安装、启用并运行 ${name}。` : `Approve to install, enable, and run ${name}.`)
    approve.textContent = state.recovery ? (zh ? '扩展' : 'Extensions') : state.installed ? state.enabled ? (zh ? '打开' : 'Open') : (zh ? '启用并打开' : 'Enable and Open') : (zh ? '批准并打开' : 'Approve and Open')
    approve.disabled = busy || unavailable
    const statusState = busy ? 'busy' : state.recovery ? 'recovery' : unavailable ? 'unavailable' : 'ready'
    status.setAttribute('data-state', statusState)
    const statusText = busy ? copy.preparing : state.recovery ? (zh ? '需要恢复。请在扩展中明确恢复安装。' : 'Recovery required. Recover explicitly in Extensions.') : unavailable ? (zh ? '已审核候选不可用。' : 'Reviewed candidate unavailable.') : ''
    status.hidden = statusText === ''
    status.textContent = statusText
  }
  approve.addEventListener('click', () => {
    if (disposed || busy || approve.disabled) return
    if (!state) { load(); return }
    if (state.recovery) { onManage(); return }
    busy = true; error.hidden = true; render(); back.focus()
    void onApprove(state.installed ? state.digest : state.candidateDigest, state.installed ? 'enable' : 'approve').catch(async failure => {
      if (disposed) return
      error.textContent = failure instanceof Error ? failure.message : 'Unavailable'; error.hidden = false
      // Partial commits survive errors. Refresh review, never retry consent automatically.
      try { const next = await bridge.getTrustedRaycastTrust(extensionId); if (!disposed) state = next }
      catch { state = undefined; approve.disabled = false; approve.textContent = zh ? '重试' : 'Retry'; status.hidden = true; status.textContent = '' }
    }).finally(() => { busy = false; render(); if (!disposed) (approve.disabled ? back : approve).focus() })
  })
  element.addEventListener('keydown', event => {
    if (event.key === 'Enter' && (event.repeat || event.isComposing || busy)) { event.preventDefault(); event.stopPropagation() }
  })
  const load = (): void => {
    busy = true; approve.disabled = true; error.hidden = true; status.hidden = false; status.setAttribute('data-state', 'busy'); status.textContent = copy.loading
    void bridge.getTrustedRaycastTrust(extensionId).then(next => {
      if (!disposed) { busy = false; state = next; render(); (approve.disabled ? back : approve).focus() }
    }).catch(failure => {
      if (!disposed) {
        busy = false; state = undefined; status.hidden = true; status.setAttribute('data-state', 'unavailable'); status.textContent = copy.capabilityInactive
        error.textContent = failure instanceof Error ? failure.message : 'Unavailable'; error.hidden = false
        approve.textContent = zh ? '重试' : 'Retry'; approve.disabled = false; approve.focus()
      }
    })
  }
  load()
  return { element, dispose: () => { disposed = true }, focus: () => { (approve.disabled ? back : approve).focus() } }
}
