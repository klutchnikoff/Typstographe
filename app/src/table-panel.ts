import type { MenuExecution, ObjectMenu, ObjectMenuGroup } from './object-menu'
import { focusEditorSelection } from './editor-focus'
import { editingAvailability } from './command-availability'
import { tableCursor } from './table-selection'
import type { Editor } from '@tiptap/core'
import type { Node as PMNode } from '@tiptap/pm/model'
import { contextPanel } from './context-panel'
import type { BandHost } from './band-layout'
import type { Provider, Transport } from './provider'
import type { Registry, Capability, TableAction } from './commands'
import { positionAtPath } from './commands'
import { widgetTarget, widgetContinuation } from './widgets'
import { applyPlannedEdit, executeStructured, type StructuredCommand } from './structured-commands'
import { TextSelection } from '@tiptap/pm/state'
import { tr } from './i18n'
import { nodePath } from './editor-targets'
import {
  bindTableHandles,
  refreshTableHandles,
  selectTableAxis,
  type TableAxis,
  type TableHandleTarget,
} from './table-handles'
import { commandCapabilities } from './command-context'

export function tableContext(editor: Editor) {
  const target = widgetTarget(editor)
  if (target?.node.type.name !== 'tableFigure') return
  const $from = tableCursor(editor)
  let row = 0,
    column = 0
  for (let depth = 1; depth <= $from.depth; depth++) {
    if ($from.node(depth).type.name === 'tableRow') row = $from.index(depth - 1)
    if (['tableCell', 'tableHeader'].includes($from.node(depth).type.name))
      column = $from.index(depth - 1)
  }
  return { ...target, row, column }
}
function tree(path: number[]) {
  return { root: { kind: 'body' }, path }
}
export function tablePanel(
  editor: Editor,
  bands: BandHost,
  provider: Provider,
  transport: Transport,
  capability: Capability,
  menu: ObjectMenu,
) {
  const operations = capability.editor?.actions || []
  const rowSpec = capability.parameters.properties!.rows
  const columnSpec = capability.parameters.properties!.columns
  let opened:
    | {
        pos: number
        node?: PMNode
        row: number
        column: number
      }
    | undefined
  let pending = false
  let availability = ''
  function refresh() {
    const value = `${pending}:${editor.isEditable}:${provider.online}:${!!provider.rejected}:${editor.view.composing}:${provider.composing}:${commandCapabilities(editor)?.available()?.includes('insert.table')}`
    if (value !== availability) {
      availability = value
      refreshTableHandles(editor)
    }
  }
  const cancel = () => {
    if (!pending) bands.close()
  }
  const panel = contextPanel({
    id: 'table-properties',
    closeLabel: tr('Annuler'),
    close: cancel,
    canConfirm: () => !!opened && !pending && !editor.view.composing,
    tabExit: () => focusEditorSelection(editor),
  })
  const dimensions = document.createElement('div')
  dimensions.className = 'table-dimensions'
  const inputs = ['Lignes', 'Colonnes'].map((label, index) => {
    const field = document.createElement('label')
    field.textContent = tr(label)
    const input = document.createElement('input')
    input.type = 'number'
    const spec = index ? columnSpec : rowSpec
    input.min = String(spec.minimum)
    input.max = String(spec.maximum)
    input.value = String(spec.default)
    input.setAttribute('aria-label', tr(label))
    field.append(input)
    dimensions.append(field)
    return input
  })
  const headerOptions = document.createElement('div')
  const headerInputs = ['header', 'row_headers'].map((name) => {
    const label = document.createElement('label')
    label.className = 'table-header-choice'
    const input = document.createElement('input')
    input.type = 'checkbox'
    label.append(
      input,
      document.createTextNode(capability.parameters.properties![name].title || name),
    )
    headerOptions.append(label)
    return input
  })
  const [header, rowHeaders] = headerInputs
  panel.body.append(dimensions, headerOptions)
  panel.action({ label: tr('Annuler'), run: cancel })
  const apply = panel.action({ label: tr('Valider'), primary: true, run: () => panel.submit() })
  function available(operation: TableAction, node: PMNode) {
    const grid = node.firstChild!
    const row = operation.axis === 'row'
    const count = row ? grid.childCount : grid.firstChild!.childCount
    return operation.remove ? count > 1 : count < Number((row ? rowSpec : columnSpec).maximum)
  }
  panel.confirm = () => void confirm()
  async function confirm() {
    if (!opened || pending) return
    const draft = opened,
      anchor = bands.forPanel(panel.element)
    if (!anchor || (draft.node && !editor.state.doc.nodeAt(anchor.from)?.eq(draft.node))) {
      panel.error.textContent = tr(
        'Ce bloc a été modifié ailleurs. Fermez puis rouvrez ses paramètres.',
      )
      return
    }
    const commands: StructuredCommand[] = []
    let path: number[],
      row = draft.row,
      column = draft.column
    if (!draft.node) {
      const rows = Number(inputs[0].value),
        columns = Number(inputs[1].value)
      if (
        !Number.isInteger(rows) ||
        !Number.isInteger(columns) ||
        rows < 1 ||
        rows > Number(rowSpec.maximum) ||
        columns < 1 ||
        columns > Number(columnSpec.maximum)
      ) {
        panel.error.textContent = tr('Dimensions de tableau invalides.')
        return
      }
      const selection = editor.state.doc.resolve(anchor.from)
      if (selection.depth !== 1 || !['paragraph', 'heading'].includes(selection.parent.type.name))
        return
      const index = selection.index(0) + Number(selection.parentOffset > 0)
      if (selection.parentOffset > 0)
        commands.push({
          id: 'block.split',
          params: {
            target: {
              zone: { kind: 'body', path: [selection.index(0)] },
              from: selection.parentOffset,
              to: selection.parentOffset,
            },
          },
        })
      commands.push({
        id: 'insert.table',
        params: {
          parent: tree([]),
          index,
          rows,
          columns,
          header: header.checked,
          row_headers: rowHeaders.checked,
        },
      })
      const continuation = widgetContinuation(
        selection.parent.copy(selection.parent.content.cut(selection.parentOffset)),
      )
      if (continuation)
        commands.push({
          id: 'block.insert',
          params: { parent: tree([]), index: index + 1, node: continuation },
        })
      path = [index]
    } else {
      path = nodePath(editor, anchor.from)
      const target = tree(path)
      commands.push(
        { id: 'table.header', params: { target, axis: 'columns', enabled: header.checked } },
        { id: 'table.header', params: { target, axis: 'rows', enabled: rowHeaders.checked } },
      )
    }
    pending = true
    refresh()
    apply.disabled = true
    // Keep the pending band focused until the owner has committed the guarded batch.
    try {
      const current = () => opened === draft && !!bands.forPanel(panel.element)
      if (draft.node) {
        // Header roles preserve projected positions even when Yrs replaces a
        // cell's identity. Use the same selection restoration as other settings.
        await applyPlannedEdit(editor, editor.state.tr, commands, { focus: false, current })
      } else {
        await executeStructured(editor, provider, transport, commands, current)
      }
      if (!current()) return
      let returned = editor.state.selection.getBookmark()
      const figure = editor.state.doc.nodeAt(positionAtPath(editor, path))
      if (figure?.type.name === 'tableFigure' && !draft.node) {
        const grid = figure.firstChild!
        row = Math.min(row, grid.childCount - 1)
        column = Math.min(column, grid.firstChild!.childCount - 1)
        returned = TextSelection.create(
          editor.state.doc,
          positionAtPath(editor, [...path, 0, row, column, 0]) + 1,
        ).getBookmark()
      }
      panel.committed()
      bands.close(true, returned)
    } catch (error) {
      if (bands.forPanel(panel.element)) bands.close(false)
      provider.onError(error)
    } finally {
      pending = false
      refresh()
      apply.disabled = false
    }
  }
  function open(pos?: number) {
    if (pending || !editingAvailability(editor).enabled) return
    const context = pos === undefined ? undefined : tableContext(editor)
    const node = pos === undefined ? undefined : editor.state.doc.nodeAt(pos)
    if (pos !== undefined && node?.type.name !== 'tableFigure') return
    const selection = editor.state.selection
    if (
      pos === undefined &&
      (!selection.empty ||
        selection.$from.depth !== 1 ||
        !['paragraph', 'heading'].includes(selection.$from.parent.type.name))
    )
      return
    bands.close(false)
    opened = {
      pos: pos ?? selection.from,
      node: node || undefined,
      row: context?.row || 0,
      column: context?.column || 0,
    }
    dimensions.hidden = !!node
    panel.title.textContent = tr(node ? 'Modifier le tableau' : 'Insérer un tableau')
    const grid = node?.firstChild
    header.checked = grid
      ? grid.firstChild!.content.content.every(
          (cell) =>
            cell.type.name === 'tableHeader' &&
            ['column', 'both'].includes(cell.attrs.scope || 'column'),
        )
      : capability.parameters.properties!.header.default === true
    rowHeaders.checked = grid
      ? grid.content.content.every(
          (row) =>
            row.firstChild!.type.name === 'tableHeader' &&
            ['row', 'both'].includes(row.firstChild!.attrs.scope),
        )
      : capability.parameters.properties!.row_headers.default === true
    inputs[0].value = String(rowSpec.default)
    inputs[1].value = String(columnSpec.default)
    panel.error.textContent = ''
    bands.open(
      panel,
      {
        from: pos ?? selection.from,
        to: pos === undefined ? selection.to : pos + node!.nodeSize,
        placement: node ? 'widget-header' : 'text',
      },
      () => {
        opened = undefined
        selectTableAxis(editor, null)
      },
    )
  }
  function canOpen() {
    return (
      !pending &&
      provider.online &&
      editingAvailability(editor, false).enabled &&
      commandCapabilities(editor)?.available()?.includes('insert.table') !== false
    )
  }
  async function changeAxis(
    target: TableHandleTarget,
    operation: TableAction,
    current: () => boolean,
  ) {
    const path = nodePath(editor, target.pos)
    const isRow = operation.axis === 'row'
    const index = (isRow ? target.row : target.column) + operation.offset
    await executeStructured(
      editor,
      provider,
      transport,
      [
        {
          id: operation.command,
          params: { target: tree(path), index },
        },
      ],
      current,
      () => {
        const grid = editor.state.doc.nodeAt(positionAtPath(editor, path))?.firstChild
        if (!grid) return
        const row = Math.min(isRow ? index : target.row, grid.childCount - 1)
        const column = Math.min(isRow ? target.column : index, grid.firstChild!.childCount - 1)
        editor.commands.setTextSelection(positionAtPath(editor, [...path, 0, row, column, 0]) + 1)
      },
    )
  }
  function openMenu(target: TableHandleTarget, mode: TableAxis | 'cell' | 'headers') {
    if (!canOpen()) return false
    const { row, column, pos, node } = target
    const axis = mode === 'row' || mode === 'column' ? mode : undefined
    const index = mode === 'row' ? row : column
    const elementAt = (from: number) => {
      const node = editor.view.nodeDOM(from)
      return node instanceof HTMLElement ? node : null
    }
    const handleAt = (from: number) =>
      elementAt(from)?.querySelector<HTMLElement>(
        `[data-table-axis="${axis}"][data-table-index="${index}"]`,
      ) ?? null
    const headerAt = (from: number) =>
      elementAt(from)?.querySelector<HTMLElement>('.widget-bar button[aria-haspopup="menu"]') ??
      null
    const cellAt = (from: number) => {
      const grid = elementAt(from)?.querySelector('table')
      return grid?.rows[row]?.cells[column] ?? null
    }
    const trigger = axis ? handleAt(pos) : mode === 'headers' ? headerAt(pos) : null
    if (menu.closeFrom(trigger)) return true
    bands.close(false)
    menu.close()
    if (axis) selectTableAxis(editor, { pos, node, axis, index })
    const session = menu.open({
      label: tr('Modifier le tableau'),
      range: { from: pos, to: pos + node.nodeSize },
      anchor: ({ from }) =>
        (axis
          ? handleAt(from)
          : mode === 'cell'
            ? cellAt(from)
            : headerAt(from)
        )?.getBoundingClientRect() ?? null,
      origin: axis
        ? ({ from }) => handleAt(from)
        : mode === 'headers'
          ? ({ from }) => headerAt(from)
          : undefined,
      closed: axis ? () => selectTableAxis(editor, null) : undefined,
    })
    const groups: ObjectMenuGroup[] = []
    if (mode !== 'headers')
      for (const dimension of ['row', 'column'] as const) {
        if (axis && axis !== dimension) continue
        const isRow = dimension === 'row'
        const label = `${tr(isRow ? 'Ligne' : 'Colonne')} ${(isRow ? row : column) + 1}`
        groups.push({
          label,
          actions: operations
            .filter((operation) => operation.axis === dimension)
            .sort((a, b) => Number(a.remove) - Number(b.remove) || a.offset - b.offset)
            .map((operation) => ({
              label: tr(
                operation.remove
                  ? operation.label
                  : isRow
                    ? operation.offset
                      ? 'Insérer en dessous'
                      : 'Insérer au-dessus'
                    : operation.offset
                      ? 'Insérer à droite'
                      : 'Insérer à gauche',
              ),
              disabled: !available(operation, node),
              danger: operation.remove,
              run: ({ range, current }) =>
                changeAxis({ ...target, pos: range.from }, operation, current),
            })),
        })
      }
    const grid = node.firstChild!
    const top = grid.firstChild!.content.content.every(
      (cell) =>
        cell.type.name === 'tableHeader' &&
        ['column', 'both'].includes(cell.attrs.scope || 'column'),
    )
    const left = grid.content.content.every(
      (row) =>
        row.firstChild!.type.name === 'tableHeader' &&
        ['row', 'both'].includes(row.firstChild!.attrs.scope),
    )
    const headerAction = (name: string, axis: 'rows' | 'columns', checked: boolean) => ({
      label: capability.parameters.properties![name].title || name,
      checked,
      async run({ range, current }: MenuExecution) {
        const path = nodePath(editor, range.from)
        const transaction = editor.state.tr
        const { from, to } = transaction.selection
        if (from <= range.from || to >= range.to)
          transaction.setSelection(
            TextSelection.create(
              transaction.doc,
              positionAtPath(editor, [...path, 0, row, column, 0]) + 1,
            ),
          )
        await applyPlannedEdit(
          editor,
          transaction,
          [
            {
              id: 'table.header',
              params: { target: tree(path), axis, enabled: !checked },
            },
          ],
          { focus: false, current },
        )
      },
    })
    groups.push({
      label: tr('En-têtes du tableau'),
      actions: [
        ...(axis === 'column' ? [] : [headerAction('header', 'columns', top)]),
        ...(axis === 'row' ? [] : [headerAction('row_headers', 'rows', left)]),
      ],
    })
    session.show(groups)
    return true
  }
  bindTableHandles(editor, {
    available: canOpen,
    open(target, axis) {
      const context = tableContext(editor)
      const row = axis === 'column' && context?.pos === target.pos ? context.row : target.row
      return openMenu({ ...target, row }, axis)
    },
  })
  panel.recoveryData = () =>
    opened ? { new: !opened.node, row: opened.row, column: opened.column } : null
  return {
    resume(pos: number, data: any) {
      if (data?.axis) return false // Axis menus never carry editable fields.
      open(pos)
      return !!bands.forPanel(panel.element)
    },
    open,
    openHeaders(pos: number) {
      const node = editor.state.doc.nodeAt(pos)
      return (
        node?.type.name === 'tableFigure' && openMenu({ pos, node, row: 0, column: 0 }, 'headers')
      )
    },
    openAtCursor() {
      const target = tableContext(editor)
      const cursor = tableCursor(editor)
      if (
        !target ||
        !Array.from({ length: cursor.depth }, (_, i) => cursor.node(i + 1).type.name).some(
          (kind) => kind === 'tableCell' || kind === 'tableHeader',
        )
      )
        return false
      return openMenu(target, 'cell')
    },
    refresh,
    register(registry: Registry) {
      for (const operation of operations) {
        registry.set(operation.id, {
          id: operation.id,
          label: tr(operation.label),
          enabled: () => {
            const target = tableContext(editor)
            return !!target && canOpen() && available(operation, target.node)
          },
          run: () => {
            const target = tableContext(editor)
            if (!target || !canOpen() || !available(operation, target.node)) return
            void changeAxis(target, operation, () => true)
              .then(() => focusEditorSelection(editor))
              .catch((error: unknown) => provider.onError(error))
          },
        })
      }
    },
  }
}
