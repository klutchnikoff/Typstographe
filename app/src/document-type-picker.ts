import { tr } from './i18n'
import { navigationGroup } from './keyboard-navigation'
import type { Catalogue, DocumentType, Model } from './shell'

export interface TypeCard {
  id: string
  label: string
  description: string
  groups: string[]
  runtimeType: string | null
  canCreate: boolean
}

/** Discovery cards may be inspected before their executable type is implemented. */
export function documentTypePicker(
  catalogue: Catalogue,
  changed: (choice: { type: DocumentType; model: Model } | null) => void,
) {
  const root = document.createElement('section')
  root.className = 'document-type-picker'
  const filterLabel = document.createElement('label')
  filterLabel.textContent = tr('Groupe de documents')
  const filter = document.createElement('select')
  filter.setAttribute('aria-label', tr('Groupe de documents'))
  filter.add(new Option(tr('Tous les types'), ''))
  for (const group of catalogue.typeGroups) filter.add(new Option(group.label, group.id))
  filterLabel.append(filter)
  const cards = document.createElement('div')
  cards.className = 'type-card-grid'
  cards.setAttribute('role', 'group')
  cards.setAttribute('aria-label', tr('Type de document'))
  const description = document.createElement('p')
  description.className = 'type-choice-description'
  description.setAttribute('aria-live', 'polite')
  const modelLabel = document.createElement('label')
  modelLabel.textContent = tr('Modèle')
  const models = document.createElement('select')
  models.setAttribute('aria-label', tr('Modèle'))
  modelLabel.append(models)
  let selected = catalogue.typeCards.find((card) => card.canCreate)!
  const currentType = () => catalogue.types.find((type) => type.id === selected.runtimeType)
  const notify = () => {
    const type = currentType()
    const model = type?.models.find((model) => model.id === models.value)
    changed(selected.canCreate && type && model ? { type, model } : null)
  }
  function select(card: TypeCard) {
    selected = card
    for (const button of cards.querySelectorAll<HTMLButtonElement>('[data-type]'))
      button.setAttribute('aria-pressed', String(button.dataset.type === card.id))
    description.textContent = card.canCreate
      ? card.description
      : `${card.description} ${tr('Ce type est prévu mais ne peut pas encore être créé.')}`
    models.replaceChildren()
    for (const model of currentType()?.models || []) models.add(new Option(model.label, model.id))
    modelLabel.hidden = !card.canCreate
    notify()
  }
  function render() {
    cards.replaceChildren()
    for (const card of catalogue.typeCards.filter(
      (card) => !filter.value || card.groups.includes(filter.value),
    )) {
      const button = document.createElement('button')
      button.type = 'button'
      button.className = `type-card${card.canCreate ? '' : ' planned'}`
      button.dataset.type = card.id
      button.setAttribute('aria-label', card.label)
      button.setAttribute('aria-pressed', String(card.id === selected.id))
      const title = document.createElement('strong')
      title.textContent = card.label
      const detail = document.createElement('span')
      detail.id = `type-card-${card.id}-description`
      detail.textContent = card.description
      button.setAttribute('aria-describedby', detail.id)
      button.append(title, detail)
      if (!card.canCreate) {
        const status = document.createElement('small')
        status.textContent = tr('À venir')
        status.id = `type-card-${card.id}-status`
        button.setAttribute('aria-describedby', `${detail.id} ${status.id}`)
        button.append(status)
      }
      button.onclick = () => select(card)
      cards.append(button)
    }
    // Keep the active choice visible and unambiguous when changing groups.
    const first = cards.querySelector<HTMLButtonElement>('[data-type]')
    if (!cards.querySelector('[aria-pressed="true"]') && first)
      select(catalogue.typeCards.find((card) => card.id === first.dataset.type)!)
    navigation.refresh()
  }
  const navigation = navigationGroup(cards, { axis: 'both', roving: true })
  filter.onchange = render
  models.onchange = notify
  root.append(filterLabel, cards, description, modelLabel)
  render()
  select(selected)
  return root
}
