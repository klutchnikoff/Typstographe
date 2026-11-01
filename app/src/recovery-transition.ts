import type { Provider, Transport } from './provider'
import { tr } from './i18n'
import { errorText } from './command-error'
interface Transition {
  id: string
  generation: string
  revision: number
  windows: string[]
  acknowledged: string[]
  errors: Record<string, string>
}
/** One transition barrier for new/open/recover/close/quit. All UI replicas conserve first. */
export async function recoveryTransitions(provider: Provider, transport: Transport) {
  let frozen: string | undefined,
    previous: HTMLElement | null = null,
    composing = 0,
    blocker: HTMLElement | undefined,
    releaseProgress: (() => void) | undefined
  const app = document.querySelector<HTMLElement>('#app')!
  const start = () => composing++,
    end = () => (composing = Math.max(0, composing - 1))
  document.addEventListener('compositionstart', start, true)
  document.addEventListener('compositionend', end, true)
  const unfreeze = () => {
    provider.retainRecovery = false
    releaseProgress?.()
    releaseProgress = undefined
    if (blocker) {
      if (blocker instanceof HTMLDialogElement) blocker.close()
      blocker.remove()
      blocker = undefined
    }
    app.inert = false
    frozen = undefined
    if (previous?.isConnected) previous.focus({ preventScroll: true })
    previous = null
  }
  const cancel = await transport.listen<string>('recovery:end-transition', (id) => {
    if (frozen === id) unfreeze()
  })
  const prepare = await transport.listen<Transition>('recovery:prepare-transition', (value) => {
    if (value.generation !== provider.generation) return
    if (frozen && frozen !== value.id) return
    frozen = value.id
    previous = document.activeElement as HTMLElement
    if (!composing && !provider.composing) {
      const cancelButton = document.createElement('button')
      cancelButton.textContent = tr('Annuler')
      const cancelTransition = () => {
        void transport
          .invoke('transition_ack', { ack: { id: value.id, error: tr('Opération annulée.') } })
          .catch(provider.onError)
      }
      cancelButton.onclick = cancelTransition
      const welcome = app.querySelector<HTMLElement>('.welcome:not([hidden]) .welcome-card')
      if (welcome) {
        blocker = document.createElement('section')
        blocker.className = 'welcome-progress'
        const spinner = document.createElement('span')
        spinner.className = 'loading-spinner'
        spinner.role = 'status'
        spinner.setAttribute('aria-label', tr('Chargement…'))
        blocker.append(spinner, cancelButton)
        welcome.append(blocker)
        // Keep the indicator accessible while protecting every other control.
        // Unlike a modal, it neither takes focus nor interrupts the home screen.
        const disabled: { element: HTMLElement; inert: boolean }[] = []
        for (let branch = blocker; branch !== app; branch = branch.parentElement!)
          for (const sibling of branch.parentElement!.children)
            if (sibling !== branch && sibling instanceof HTMLElement) {
              disabled.push({ element: sibling, inert: sibling.inert })
              sibling.inert = true
            }
        const escape = (event: KeyboardEvent) => {
          if (event.key !== 'Escape') return
          event.preventDefault()
          event.stopImmediatePropagation()
          cancelTransition()
        }
        document.addEventListener('keydown', escape, true)
        releaseProgress = () => {
          document.removeEventListener('keydown', escape, true)
          for (const { element, inert } of disabled) element.inert = inert
        }
      } else {
        app.inert = true
        const dialog = document.createElement('dialog')
        blocker = dialog
        dialog.className = 'app-dialog recovery-progress'
        dialog.tabIndex = -1
        const text = document.createElement('p')
        text.textContent = tr('Conservation du travail dans les autres fenêtres…')
        text.role = 'status'
        dialog.addEventListener('cancel', (event) => {
          event.preventDefault()
          cancelTransition()
        })
        dialog.append(text, cancelButton)
        document.body.append(dialog)
        dialog.showModal()
        dialog.focus()
      }
    }
    provider.retainRecovery = true
    void (async () => {
      let error: string | undefined
      try {
        if (composing || provider.composing)
          throw new Error(tr('Terminez la saisie en cours avant de décider.'))
        await provider.privateRecovery?.force()
      } catch (reason) {
        error = errorText(reason)
      }
      await transport.invoke('transition_ack', { ack: { id: value.id, error: error || null } })
    })().catch(provider.onError)
  })
  return {
    async run<T>(action: (revision: number) => Promise<T>, abandon = false) {
      const value = await transport.invoke<Transition>('transition_begin', {
        generation: provider.generation,
      })
      try {
        const deadline = Date.now() + 15000
        for (;;) {
          const status = await transport.invoke<Transition>('transition_status', { id: value.id })
          const errors = Object.values(status.errors)
          if (errors.length) throw new Error(errors.join('\n'))
          if (status.windows.every((w) => status.acknowledged.includes(w))) break
          if (Date.now() > deadline)
            throw new Error(tr('Une autre fenêtre n’a pas pu conserver son travail. Réessayez.'))
          await new Promise((resolve) => setTimeout(resolve, 30))
        }
        if (abandon)
          await transport.invoke('transition_ack', {
            ack: { id: value.id, error: null, abandon: true },
          })
        return await action(value.revision)
      } finally {
        await transport.invoke('transition_end', { id: value.id }).catch(() => {})
        unfreeze()
      }
    },
    release() {
      cancel()
      prepare()
      unfreeze()
      document.removeEventListener('compositionstart', start, true)
      document.removeEventListener('compositionend', end, true)
    },
  }
}
