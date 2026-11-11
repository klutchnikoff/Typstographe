import './form-section.css'

/** Native disclosure with one heading style and view-local fold state. */
export function formSection(
  parent: HTMLElement,
  id: string,
  label: string,
  expanded: Map<string, boolean>,
) {
  const element = document.createElement('details')
  element.className = 'form-section'
  element.dataset.section = id
  element.open = expanded.get(id) ?? true
  const summary = document.createElement('summary')
  summary.id = `form-section-${id}-title`
  summary.textContent = label
  element.setAttribute('role', 'group')
  element.setAttribute('aria-labelledby', summary.id)
  const content = document.createElement('div')
  content.className = 'form-section-fields'
  element.append(summary, content)
  element.addEventListener('toggle', () => {
    if (element.isConnected) expanded.set(id, element.open)
  })
  parent.append(element)
  return content
}
