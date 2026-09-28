import { ExternalLink, X, createElement } from 'lucide'
import type { DesktopBridge } from './contracts.ts'

type CredentialInfo = Readonly<{ configured: boolean; writable: boolean }>
type CredentialResult<T> = Readonly<{ ok: true; value: T } | { ok: false; error: { message: string } }>

export interface DesktopOnboardingCredentials {
  describe(refs: string[]): Promise<CredentialResult<Record<string, CredentialInfo>>>
  set(ref: string, value: string): Promise<CredentialResult<unknown>>
}

type SetupOptions = Readonly<{
  bridge: Pick<DesktopBridge, 'chooseWorkspace' | 'onboarding'>
  credentials: DesktopOnboardingCredentials
  openPaths(paths: readonly string[]): Promise<void>
}>

const KEY_REF = 'OPENROUTER_API_KEY'
const primary = 'h-9 cursor-pointer rounded-full border-0 bg-foreground px-5 text-sm font-medium text-background hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-default disabled:opacity-50'
const secondary = 'h-9 cursor-pointer rounded-full border border-border bg-transparent px-4 text-sm font-medium text-foreground hover:bg-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-default disabled:opacity-50'
const quiet = 'h-9 cursor-pointer rounded-full border-0 bg-transparent px-2 text-sm text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-default disabled:opacity-50'
const option = 'w-full cursor-pointer rounded-xl border border-border bg-surface px-5 py-4 text-left text-foreground hover:border-border-strong hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-default disabled:opacity-50'

/** Desktop-only setup; DSH still owns model credentials, sessions, and workspaces. */
export function installDesktopOnboarding({ bridge, credentials, openPaths }: SetupOptions): () => void {
  const dialog = document.createElement('dialog')
  dialog.className = 'box-border w-[min(800px,calc(100%-48px))] max-h-[calc(100dvh-64px)] overflow-y-auto rounded-2xl border border-border bg-background p-0 text-foreground shadow-2xl backdrop:bg-[rgba(0,0,0,0.85)] [-webkit-app-region:no-drag]'
  dialog.setAttribute('aria-labelledby', 'tockteam-onboarding-title')
  dialog.setAttribute('aria-describedby', 'tockteam-onboarding-description')
  dialog.dataset.tockteamOnboarding = 'true'
  document.body.append(dialog)

  let disposed = false
  let busy = false
  let step: 'workspace' | 'model' = 'workspace'
  let credential: CredentialInfo | 'loading' | 'error' = 'loading'
  let draft = ''

  const element = <T extends Element>(selector: string): T => dialog.querySelector<T>(selector)!
  const showError = (message: string): void => {
    const error = element<HTMLElement>('#tockteam-onboarding-error')
    error.textContent = message
    error.hidden = message.length === 0
  }
  const setBusy = (value: boolean): void => {
    busy = value
    for (const control of dialog.querySelectorAll<HTMLButtonElement | HTMLInputElement>('button, input')) {
      if (value) {
        control.dataset.wasDisabled = String(control.disabled)
        control.disabled = true
      } else if (control.dataset.wasDisabled !== undefined) {
        control.disabled = control.dataset.wasDisabled === 'true'
        delete control.dataset.wasDisabled
      }
    }
  }
  const focusTitle = (): void => { element<HTMLElement>('#tockteam-onboarding-title').focus() }
  const finish = async (): Promise<void> => {
    if (busy) return
    setBusy(true)
    try {
      await bridge.onboarding.complete()
      if (!disposed) dialog.close()
    } catch {
      if (!disposed) showError('Could not save setup progress. Try again.')
    } finally {
      if (!disposed) setBusy(false)
    }
  }

  const render = (): void => {
    const workspace = step === 'workspace'
    dialog.innerHTML = `
      <div class="box-border flex min-h-[520px] flex-col gap-6 p-8 sm:p-9">
        <header class="relative flex flex-col gap-2 pr-10">
          <p class="m-0 text-xs font-medium tracking-wide text-subtle-foreground">Step ${workspace ? '1' : '2'} of 2</p>
          <button id="tockteam-onboarding-close" type="button" aria-label="Close Setup" class="absolute -right-1 -top-1 flex size-8 cursor-pointer items-center justify-center rounded-full border-0 bg-transparent text-muted-foreground hover:bg-surface hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"></button>
          <h2 id="tockteam-onboarding-title" tabindex="-1" class="m-0 text-[22px] font-semibold leading-[1.2] tracking-tight text-foreground outline-none">${workspace ? 'Choose a Workspace' : 'Add a Model'}</h2>
          <p id="tockteam-onboarding-description" class="m-0 max-w-[65ch] text-sm leading-6 text-muted-foreground">${workspace
            ? 'Choose a folder for your first session, or continue and choose one later.'
            : 'Connect OpenRouter to start with a free model. You can change models later in Settings → Models.'}</p>
        </header>
        ${workspace ? `
          <div class="flex flex-1 flex-col gap-3 pt-1">
            <button id="tockteam-onboarding-choose" type="button" aria-label="Choose Folder" class="${option}">
              <span class="block text-sm font-medium">Choose Folder</span>
              <span class="mt-1 block text-xs leading-5 text-muted-foreground">Pick a folder for your first session.</span>
            </button>
          </div>
        ` : `<div id="tockteam-onboarding-model" class="flex flex-1 flex-col gap-3 pt-1"></div>`}
        <p id="tockteam-onboarding-error" role="alert" hidden class="m-0 text-sm text-destructive"></p>
        <footer class="mt-auto flex flex-wrap items-center justify-between gap-3 pt-5">
          <div class="flex items-center gap-4">
            <span aria-hidden="true" class="flex items-center gap-1.5">
              <span class="size-1.5 rounded-full ${workspace ? 'bg-foreground' : 'bg-muted-foreground/40'}"></span>
              <span class="size-1.5 rounded-full ${workspace ? 'bg-muted-foreground/40' : 'bg-foreground'}"></span>
            </span>
            ${workspace ? `<button id="tockteam-onboarding-skip" type="button" class="${quiet}">Skip Onboarding</button>` : `<button id="tockteam-onboarding-later" type="button" class="${quiet}">Set Up Later</button>`}
          </div>
          <div class="flex items-center gap-2">
            ${workspace ? '' : `<button id="tockteam-onboarding-back" type="button" class="${quiet}">Back</button>`}
            <button id="${workspace ? 'tockteam-onboarding-next' : 'tockteam-onboarding-finish'}" type="button" class="${primary}">${workspace ? 'Continue' : 'Finish Setup'}</button>
          </div>
        </footer>
      </div>`
    const close = element<HTMLButtonElement>('#tockteam-onboarding-close')
    const icon = createElement(X) as SVGSVGElement
    icon.setAttribute('width', '18')
    icon.setAttribute('height', '18')
    icon.setAttribute('aria-hidden', 'true')
    close.append(icon)
    close.addEventListener('click', () => { if (!busy) dialog.close() })
    if (workspace) {
      element<HTMLButtonElement>('#tockteam-onboarding-skip').addEventListener('click', () => { void finish() })
      element<HTMLButtonElement>('#tockteam-onboarding-next').addEventListener('click', () => {
        step = 'model'
        render()
        focusTitle()
      })
      element<HTMLButtonElement>('#tockteam-onboarding-choose').addEventListener('click', async () => {
        if (busy) return
        setBusy(true)
        try {
          const paths = await bridge.chooseWorkspace()
          if (paths.length > 0) {
            await openPaths(paths)
            if (disposed) return
            step = 'model'
            render()
            focusTitle()
          }
        } catch {
          if (!disposed) showError('Could not open that folder. Choose another or continue with your current workspace.')
        } finally {
          if (!disposed) setBusy(false)
        }
      })
      return
    }

    const body = element<HTMLElement>('#tockteam-onboarding-model')
    const later = element<HTMLButtonElement>('#tockteam-onboarding-later')
    const save = element<HTMLButtonElement>('#tockteam-onboarding-finish')
    if (credential === 'loading') {
      body.innerHTML = '<div class="rounded-xl border border-border bg-surface px-5 py-5"><p role="status" class="m-0 text-sm text-muted-foreground">Checking your model connection…</p></div>'
      save.disabled = true
    } else if (credential === 'error') {
      body.innerHTML = '<div class="rounded-xl border border-border bg-surface px-5 py-5"><p role="status" class="m-0 text-sm text-muted-foreground">Could not check your model connection. Try again or set it up later in Settings → Models.</p></div>'
      save.disabled = true
      const retry = document.createElement('button')
      retry.type = 'button'
      retry.className = secondary
      retry.textContent = 'Try Again'
      retry.addEventListener('click', () => { void loadCredential() })
      body.append(retry)
    } else if (credential.configured) {
      body.innerHTML = '<div class="rounded-xl border border-border bg-surface px-5 py-5"><div class="flex items-center justify-between gap-3"><p class="m-0 text-sm font-medium text-foreground">OpenRouter</p><span class="text-xs font-medium text-success">Connected</span></div><p role="status" class="m-0 mt-2 text-sm leading-6 text-muted-foreground">OpenRouter is already connected. Your saved API key stays private and unchanged.</p></div>'
      later.hidden = true
    } else if (!credential.writable) {
      body.innerHTML = '<div class="rounded-xl border border-border bg-surface px-5 py-5"><p class="m-0 text-sm font-medium text-foreground">OpenRouter</p><p role="status" class="m-0 mt-2 text-sm leading-6 text-muted-foreground">This key cannot be changed here. You can set up a model in Settings → Models later.</p></div>'
      save.disabled = true
    } else {
      body.innerHTML = '<div class="flex flex-col gap-3 rounded-xl border border-border bg-surface px-5 py-5"><p class="m-0 text-sm font-medium text-foreground">OpenRouter</p><input id="tockteam-onboarding-key" type="password" autocomplete="off" autocapitalize="none" spellcheck="false" maxlength="4096" aria-label="OpenRouter API Key" aria-describedby="tockteam-onboarding-error" placeholder="OPENROUTER_API_KEY" class="box-border h-10 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground placeholder:text-subtle-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"><a href="https://openrouter.ai/settings/keys" target="_blank" rel="noopener noreferrer" class="inline-flex w-fit items-center gap-1.5 text-sm font-medium text-foreground underline underline-offset-4 hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">Get API Key</a></div>'
      const input = element<HTMLInputElement>('#tockteam-onboarding-key')
      const externalIcon = createElement(ExternalLink) as SVGSVGElement
      externalIcon.setAttribute('width', '16')
      externalIcon.setAttribute('height', '16')
      externalIcon.setAttribute('aria-hidden', 'true')
      body.querySelector('a')!.append(externalIcon)
      input.value = draft
      save.textContent = 'Save and Finish'
      save.disabled = draft.trim().length === 0
      input.addEventListener('input', () => {
        draft = input.value
        save.disabled = draft.trim().length === 0
        input.removeAttribute('aria-invalid')
        showError('')
      })
      input.addEventListener('keydown', event => {
        if (event.key === 'Enter' && !save.disabled) {
          event.preventDefault()
          save.click()
        }
      })
    }
    element<HTMLButtonElement>('#tockteam-onboarding-back').addEventListener('click', () => {
      if (busy) return
      step = 'workspace'
      render()
      focusTitle()
    })
    later.addEventListener('click', () => { void finish() })
    save.addEventListener('click', async () => {
      if (busy || credential === 'loading' || credential === 'error') return
      if (credential.configured) { await finish(); return }
      const key = draft.trim()
      const quoted = (key[0] === '"' || key[0] === "'" || key[0] === '`') && key.length > 1 && key.endsWith(key[0]!)
      if (!/^[\x21-\x7e]+$/u.test(key) || /^[A-Z][A-Z0-9_]*=[^=]/u.test(key) || quoted || key.length > 4_096) {
        element<HTMLInputElement>('#tockteam-onboarding-key').setAttribute('aria-invalid', 'true')
        showError('Enter an API key without spaces, quotes, or a NAME=value prefix.')
        return
      }
      setBusy(true)
      try {
        const stored = await credentials.set(KEY_REF, key)
        if (!stored.ok) throw new Error('Credential store refused the key')
        draft = ''
        credential = { configured: true, writable: true }
      } catch {
        if (!disposed) showError('Could not save the API key. Try again or set it up later.')
        if (!disposed) setBusy(false)
        return
      }
      if (!disposed) setBusy(false)
      await finish()
    })
  }

  const loadCredential = async (): Promise<void> => {
    credential = 'loading'
    if (step === 'model') render()
    try {
      const response = await credentials.describe([KEY_REF])
      const info = response.ok ? response.value[KEY_REF] : undefined
      credential = info !== undefined && typeof info.configured === 'boolean' && typeof info.writable === 'boolean' ? info : 'error'
    } catch {
      credential = 'error'
    }
    if (!disposed && step === 'model') render()
  }
  const cancel = (event: Event): void => {
    // Escape closes the view but does not count as completing or skipping setup.
    if (busy) event.preventDefault()
  }
  dialog.addEventListener('cancel', cancel)
  void bridge.onboarding.status().then(done => {
    if (disposed) return
    if (done) { dialog.remove(); return }
    render()
    dialog.showModal()
    focusTitle()
    void loadCredential()
  }).catch(() => {
    if (disposed) return
    // A failed read must not silently mark onboarding as complete.
    render()
    dialog.showModal()
    focusTitle()
    showError('Could not read setup progress. Restart TockTeam and try again.')
  })
  return () => {
    disposed = true
    dialog.removeEventListener('cancel', cancel)
    if (dialog.open) dialog.close()
    dialog.remove()
  }
}
