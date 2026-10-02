// Run with playwright-cli run-code --filename against an owned, guarded Desktop
// displaying comparison.md and its Properties sidebar. Reads native shadow bounds;
// never changes styles, date values, authority or the system clipboard.
async page => {
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('DOM.enable')
  const { root } = await cdp.send('DOM.getDocument', { depth: -1, pierce: true })
  const attributes = node => Object.fromEntries(Array.from({ length: (node.attributes ?? []).length / 2 }, (_, i) => [node.attributes[2 * i], node.attributes[2 * i + 1]]))
  const fields = []
  for (const key of ['due', 'meeting']) {
    const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector: '[data-linked-kind="properties"] input[aria-label="Property ' + key + '"]' })
    if (!nodeId) throw Error('Missing date input ' + key)
    const { node: input } = await cdp.send('DOM.describeNode', { nodeId, depth: -1, pierce: true })
    const shadow = [], walk = node => { shadow.push(node); for (const child of node.children ?? []) walk(child) }
    for (const node of input.shadowRoots ?? []) walk(node)
    const picker = shadow.find(node => attributes(node).pseudo === '-webkit-calendar-picker-indicator')
    const date = shadow.find(node => attributes(node).pseudo === '-webkit-datetime-edit')
    if (!picker || !date) throw Error('Missing native date shadow nodes for ' + key)
    const bounds = async node => {
      const { model } = await cdp.send('DOM.getBoxModel', { backendNodeId: node.backendNodeId })
      return { x: model.border[0], y: model.border[1], width: model.width, height: model.height }
    }
    fields.push({ key, picker: await bounds(picker), date: await bounds(date), value: await page.locator('[data-linked-kind="properties"]').getByLabel('Property ' + key, { exact: true }).inputValue() })
  }
  for (const field of fields) if (field.picker.x + field.picker.width > field.date.x + 1) throw Error('Calendar must precede date: ' + JSON.stringify(fields))
  return { nativePicker: true, fields, geometry: await page.evaluate(() => [innerWidth, innerHeight, devicePixelRatio]) }
}
