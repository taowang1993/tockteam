const CHROME_LAYER_ID = 'tockteam-chrome-layer'

/** Mount a body-level surface into the shared viewport layer. */
export function mountChromeSurface(surface: HTMLElement): () => void {
  const existing = document.getElementById(CHROME_LAYER_ID)
  if (existing !== null && !(existing instanceof HTMLElement)) {
    throw new Error(`${CHROME_LAYER_ID} must be an HTML element`)
  }
  if (existing !== null && existing.dataset.tockteamChromeLayer !== 'true') {
    throw new Error(`${CHROME_LAYER_ID} must be owned by TockTeam`)
  }
  const layer = existing ?? document.createElement('div')
  layer.id = CHROME_LAYER_ID
  layer.dataset.tockteamChromeLayer = 'true'
  if (existing === null) document.body.append(layer)
  layer.append(surface)

  let mounted = true
  return () => {
    if (!mounted) return
    mounted = false
    surface.remove()
    if (layer.childElementCount === 0) layer.remove()
  }
}
