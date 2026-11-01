import { tr } from './i18n'
import { icon } from './icons'
import { imagePreview } from './image-preview'
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

export type CreationCatalogue = Pick<Catalogue, 'types' | 'typeGroups' | 'typeCards'>
export type ModelThumbnail = (model: Model) => Promise<string>

/** Discovery and creation share the real catalogue. Group filters form a union. */
export function documentTypePicker(
  catalogue: CreationCatalogue,
  changed: (choice: { type: DocumentType; model: Model } | null) => void,
  thumbnail?: ModelThumbnail,
) {
  const root = document.createElement('section')
  root.className = 'document-type-picker'
  const filters = document.createElement('div')
  filters.className = 'type-group-filters'
  filters.setAttribute('role', 'group')
  filters.setAttribute('aria-label', tr('Groupe de documents'))
  const groups = new Set<string>()
  const cards = document.createElement('div')
  cards.className = 'type-card-grid'
  cards.setAttribute('role', 'group')
  cards.setAttribute('aria-label', tr('Type de document'))
  const scroller = document.createElement('div')
  scroller.className = 'type-card-scroller'
  scroller.append(cards)
  const band = document.createElement('section')
  band.className = 'type-model-band'
  const description = document.createElement('p')
  description.className = 'type-choice-description'
  description.setAttribute('aria-live', 'polite')
  const models = document.createElement('div')
  models.className = 'model-card-gallery'
  models.setAttribute('role', 'group')
  models.setAttribute('aria-label', tr('Modèle'))
  band.append(description, models)

  let selected: TypeCard | undefined = catalogue.typeCards.find((card) => card.canCreate)
  let modelId: string | undefined
  const rememberedModels = new Map<string, string>()
  const currentType = () => catalogue.types.find((type) => type.id === selected?.runtimeType)
  const notify = () => {
    const type = currentType()
    const model = type?.models.find((model) => model.id === modelId)
    changed(selected?.canCreate && type && model ? { type, model } : null)
  }
  function chooseModel(model: Model) {
    modelId = model.id
    if (selected) rememberedModels.set(selected.id, model.id)
    for (const button of models.querySelectorAll<HTMLButtonElement>('[data-model]'))
      button.setAttribute('aria-pressed', String(button.dataset.model === modelId))
    notify()
  }
  function renderModels() {
    enlargement.reset()
    models.replaceChildren()
    const available = selected?.canCreate ? currentType()?.models || [] : []
    modelId =
      available.find((model) => model.id === rememberedModels.get(selected!.id))?.id ||
      available[0]?.id
    description.textContent = !selected
      ? tr('Choisissez un type de document.')
      : selected.canCreate
        ? ''
        : `${selected.description} ${tr('Ce type est prévu mais ne peut pas encore être créé.')}`
    description.hidden = !description.textContent
    models.hidden = available.length === 0
    for (const model of available) {
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'model-card'
      button.dataset.model = model.id
      button.setAttribute('aria-label', model.label)
      button.setAttribute('aria-pressed', String(model.id === modelId))
      const preview = document.createElement('span')
      preview.className = 'model-thumbnail'
      preview.setAttribute('aria-hidden', 'true')
      const status = document.createElement('span')
      status.className = 'model-thumbnail-status'
      status.textContent = tr('Chargement…')
      const check = document.createElement('span')
      check.className = 'model-selected'
      check.innerHTML = icon('check')
      preview.append(status, check)
      const name = document.createElement('span')
      name.className = 'model-card-name'
      name.textContent = model.label
      button.append(preview, name)
      button.onclick = () => chooseModel(model)
      models.append(button)
      // Late results update only their own card, never a subsequent selection.
      if (thumbnail)
        void thumbnail(model)
          .then((url) => {
            const image = document.createElement('img')
            image.alt = ''
            image.onload = () => status.remove()
            image.onerror = () => {
              status.textContent = tr('Aperçu indisponible')
              image.remove()
            }
            image.src = url
            preview.prepend(image)
          })
          .catch(() => {
            status.textContent = tr('Aperçu indisponible')
          })
      else status.textContent = tr('Aperçu indisponible')
    }
    modelNavigation.refresh(true)
  }
  function select(card: TypeCard) {
    selected = card
    for (const button of cards.querySelectorAll<HTMLButtonElement>('[data-type]'))
      button.setAttribute('aria-pressed', String(button.dataset.type === card.id))
    renderModels()
    notify()
  }
  function render() {
    for (const button of filters.querySelectorAll<HTMLButtonElement>('[data-group]'))
      button.setAttribute(
        'aria-pressed',
        String(button.dataset.group ? groups.has(button.dataset.group) : groups.size === 0),
      )
    const visible = catalogue.typeCards.filter(
      (card) => !groups.size || card.groups.some((group) => groups.has(group)),
    )
    // A filtered-out choice must not create a document behind the active filter.
    if (!visible.some((card) => card.id === selected?.id)) selected = undefined
    cards.replaceChildren()
    for (const card of visible) {
      const button = document.createElement('button')
      button.type = 'button'
      button.className = `type-card${card.canCreate ? '' : ' planned'}`
      button.dataset.type = card.id
      button.setAttribute('aria-label', card.label)
      button.setAttribute('aria-pressed', String(card.id === selected?.id))
      const title = document.createElement('strong')
      title.textContent = card.label
      const detail = document.createElement('span')
      detail.className = 'type-card-description'
      detail.id = `type-card-${card.id}-description`
      detail.textContent = card.description
      const status = document.createElement('small')
      status.textContent = tr(card.canCreate ? 'Disponible' : 'À venir')
      status.id = `type-card-${card.id}-status`
      button.setAttribute('aria-describedby', `${detail.id} ${status.id}`)
      button.append(title, detail, status)
      button.onclick = () => select(card)
      cards.append(button)
    }
    scroller.scrollTop = 0
    navigation.refresh(true)
    renderModels()
    notify()
  }
  for (const group of [{ id: '', label: tr('Tous les types') }, ...catalogue.typeGroups]) {
    const button = document.createElement('button')
    button.type = 'button'
    button.dataset.group = group.id
    button.textContent = group.label
    button.onclick = () => {
      if (!group.id) groups.clear()
      else if (groups.has(group.id)) groups.delete(group.id)
      else groups.add(group.id)
      render()
    }
    filters.append(button)
  }
  const filterNavigation = navigationGroup(filters, { axis: 'horizontal', roving: true })
  const navigation = navigationGroup(cards, {
    axis: 'both',
    roving: true,
    columns: () => getComputedStyle(cards).gridTemplateColumns.split(' ').length,
  })
  const modelNavigation = navigationGroup(models, { axis: 'horizontal', roving: true })
  root.append(filters, scroller, band)
  const enlargement = imagePreview(models, root, {
    trigger: '.model-card',
    frame: '.model-thumbnail',
  })
  render()
  return Object.assign(root, {
    destroy() {
      enlargement.destroy()
      filterNavigation.destroy()
      navigation.destroy()
      modelNavigation.destroy()
    },
  })
}
