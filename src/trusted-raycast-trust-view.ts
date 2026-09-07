import type { LauncherPreloadBridge } from './launcher-preload-bridge.ts'
import type { TrustedRaycastTrustAction, TrustedRaycastTrustState } from './trusted-raycast-contract.ts'

const COPY = Object.freeze({
  en: Object.freeze({
    back: 'Back to Results',
    capabilityInactive: 'Capability Inactive',
    title: 'Trusted Extensions',
    intro: 'Reviewed trusted extensions execute third-party code with account-level authority outside the launcher renderer. Installation verifies the reviewed archive digest before anything loads.',
    name: 'Google Translate · Trusted Raycast',
    notInstalled: 'Not Installed',
    installedDisabled: 'Installed · Disabled',
    installedEnabled: 'Installed · Enabled',
    recoveryRequired: 'Recovery Required',
    reviewedDigest: 'Reviewed digest',
    install: 'Install Reviewed Extension',
    approveInstall: 'Approve & Install',
    cancel: 'Cancel',
    enable: 'Enable Translate',
    disable: 'Disable Translate',
    remove: 'Remove Extension',
    confirmRemove: 'Confirm Remove',
    recover: 'Recover Installation',
    actionFailed: 'Action failed',
    previousRetained: 'Previous install retained for recovery.',
  }),
  zh: Object.freeze({
    back: '返回结果',
    capabilityInactive: '能力未激活',
    title: '可信扩展',
    intro: '经审核的可信扩展会在启动器渲染器之外以账户级权限执行第三方代码。安装会在任何代码加载前校验已审核归档的摘要。',
    name: 'Google 翻译 · 可信 Raycast',
    notInstalled: '未安装',
    installedDisabled: '已安装 · 已停用',
    installedEnabled: '已安装 · 已启用',
    recoveryRequired: '需要恢复',
    reviewedDigest: '已审核摘要',
    install: '安装已审核扩展',
    approveInstall: '批准并安装',
    cancel: '取消',
    enable: '启用翻译',
    disable: '停用翻译',
    remove: '移除扩展',
    confirmRemove: '确认移除',
    recover: '恢复安装',
    actionFailed: '操作失败',
    previousRetained: '已保留上一次安装以用于恢复。',
  }),
})

const SHORT_DIGEST = 16

/** First-party trust surface over the existing launcher local-tool pattern. */
export function createTrustedRaycastTrustView(document: Document, bridge: LauncherPreloadBridge, onClose: () => void, locale = 'en-US'): { element: HTMLElement } {
  const zh = locale.startsWith('zh')
  const copy = zh ? COPY.zh : COPY.en
  let state: TrustedRaycastTrustState | undefined
  let busy = false
  let confirmStep: 'remove' | undefined

  const element = document.createElement('section')
  element.className = 'launcher-local-tool p-4 text-sm'
  element.setAttribute('aria-label', copy.title)
  const header = document.createElement('header'); header.className = 'launcher-local-tool-header'
  const title = document.createElement('h2'); title.textContent = copy.title; title.className = 'm-0 text-sm font-semibold'
  const close = document.createElement('button'); close.type = 'button'; close.className = 'launcher-secondary-button bg-transparent text-xs focus-visible:outline-2 focus-visible:outline-[var(--dsw-alias-brand-primary,CanvasText)]'; close.textContent = copy.back; close.addEventListener('click', onClose)
  header.append(title, close)
  const content = document.createElement('div'); content.className = 'launcher-local-tool-content min-w-0 overflow-auto'
  const intro = document.createElement('p'); intro.className = 'launcher-local-tool-status'; intro.textContent = copy.intro
  const status = document.createElement('p'); status.className = 'launcher-local-tool-status'; status.setAttribute('role', 'status')
  const digestLine = document.createElement('p'); digestLine.className = 'launcher-local-tool-status text-xs [overflow-wrap:anywhere]'; digestLine.hidden = true
  const previous = document.createElement('p'); previous.className = 'launcher-local-tool-status text-xs'; previous.hidden = true
  const error = document.createElement('p'); error.className = 'launcher-local-tool-error'; error.setAttribute('role', 'alert'); error.hidden = true
  const buttons = document.createElement('div'); buttons.className = 'flex flex-wrap items-start gap-2 py-2'
  content.append(intro, status, digestLine, previous, error, buttons)
  element.append(header, content)

  const buttonClass = 'launcher-secondary-button bg-transparent text-xs focus-visible:outline-2 focus-visible:outline-[var(--dsw-alias-brand-primary,CanvasText)] disabled:opacity-50'
  const renderButton = (label: string, run: () => void): HTMLButtonElement => {
    const button = document.createElement('button'); button.type = 'button'; button.className = buttonClass; button.textContent = label; button.disabled = busy
    button.addEventListener('click', run); buttons.append(button)
    return button
  }

  const runAction = (action: TrustedRaycastTrustAction): void => {
    if (busy) return
    busy = true
    error.hidden = true
    for (const button of buttons.querySelectorAll('button')) button.disabled = true
    void bridge.trustedRaycastTrustAction(action).then(result => {
      render(result.state)
      if (!result.ok) { error.textContent = `${copy.actionFailed}: ${result.error}`; error.hidden = false }
    }).catch(failure => {
      error.textContent = `${copy.actionFailed}: ${failure instanceof Error ? failure.message : 'Unavailable'}`; error.hidden = false
      if (state) render(state)
    }).finally(() => { busy = false; if (state) render(state) })
  }

  const render = (next: TrustedRaycastTrustState): void => {
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

  void bridge.getTrustedRaycastTrust().then(render).catch(failure => {
    status.textContent = copy.capabilityInactive
    error.textContent = `${copy.actionFailed}: ${failure instanceof Error ? failure.message : 'Unavailable'}`; error.hidden = false
  })
  return { element }
}
