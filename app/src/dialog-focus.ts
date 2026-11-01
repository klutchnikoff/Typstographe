/** WebKit releases native modality after close(), so restore focus on that event. */
export function returnFocusOnClose(
  dialog: HTMLDialogElement,
  returnFocus: () => HTMLElement | undefined,
) {
  const restore = () => {
    const target = returnFocus()
    if (
      target?.isConnected &&
      !document.querySelector('dialog[open]') &&
      (document.activeElement === document.body || dialog.contains(document.activeElement))
    )
      target.focus({ preventScroll: true })
  }
  dialog.addEventListener('close', restore)
  return () => dialog.removeEventListener('close', restore)
}
