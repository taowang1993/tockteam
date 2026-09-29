type Node = { type: string; props: Record<string, unknown>; children: Node[] }
type MenuItem = { label?: string; enabled?: boolean; type?: 'separator'; submenu?: MenuItem[]; click?: () => void }

export function validMenuIcon(bytes: Buffer | undefined): bytes is Buffer {
  return !!bytes && bytes.length >= 24 && bytes.length <= 1024 * 1024
    && bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))
    && bytes.readUInt32BE(16) > 0 && bytes.readUInt32BE(16) <= 1024
    && bytes.readUInt32BE(20) > 0 && bytes.readUInt32BE(20) <= 1024
}

/** Only the pinned saved-color actions are exposed; Pick Color needs a native helper we do not support. */
export function colorPickerMenu(root: unknown, invoke: (eventId: string) => void): MenuItem[] {
  const menu = (root as Node | undefined)?.children?.find(node => node.type === 'raycast-menu-bar')
  const items: MenuItem[] = [{ label: 'Pick Color (Unsupported)', enabled: false }]
  for (const title of ['Favorites', 'Recent Colors']) {
    const section = menu?.children?.find(node => node.type === 'raycast-menu-section' && node.props.title === title)
    const saved = (section?.children ?? []).slice(0, 9).flatMap(node => {
      const label = node.props.title, eventId = node.props.actionEventId
      return node.type === 'raycast-menu-item' && typeof label === 'string' && /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6,8})$/i.test(label)
        && typeof eventId === 'string' && eventId.length > 0 && eventId.length <= 128
        ? [{ label, click: () => invoke(eventId) }] : []
    })
    items.push({ label: title, submenu: saved.length ? saved : [{ label: 'No Saved Colors', enabled: false }] })
  }
  return items
}
