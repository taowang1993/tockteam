/** Exact child runtime pairing selected for the reviewed translate artifact. */
export const TRUSTED_RAYCAST_RUNTIME = Object.freeze({
  react: '19.0.0',
  reconciler: '0.31.0',
  reconcilerPeerReact: '^19.0.0',
})

/** Upstream runtime overrides that must remain byte-for-byte pinned in the child closure. */
export const TRUSTED_RAYCAST_UPSTREAM_LOCK = Object.freeze({
  axios: Object.freeze({
    version: '0.31.1',
    integrity: 'sha512-Ef8DUZSZQP6igY48mjGaoEjwhely97lserep0IFJifBH4YdKvwH5eMLniy3kig2HQoBNR8EkZpDjowxwTJcmbg==',
  }),
})

function majorMinor(version: string): string {
  const match = /^(\d+\.\d+)/.exec(version)
  if (!match) throw new Error(`invalid React version: ${version}`)
  return match[1]!
}

/** Rejects a renderer pairing whose published reconciler peer range cannot accept React. */
export function assertTrustedRaycastReactPair(
  reactVersion: string = TRUSTED_RAYCAST_RUNTIME.react,
  peerRange: string = TRUSTED_RAYCAST_RUNTIME.reconcilerPeerReact,
): void {
  const reactMajorMinor = majorMinor(reactVersion)
  const peerMajor = /^\^(\d+)\.\d+\.\d+$/.exec(peerRange)?.[1]
  if (reactVersion !== TRUSTED_RAYCAST_RUNTIME.react || peerRange !== TRUSTED_RAYCAST_RUNTIME.reconcilerPeerReact || !peerMajor || peerMajor !== reactMajorMinor.split('.')[0]) {
    throw new Error(`react ${reactVersion} is incompatible with reconciler peer ${peerRange}`)
  }
}
