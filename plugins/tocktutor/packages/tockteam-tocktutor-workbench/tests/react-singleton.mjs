import { createRequire } from 'node:module'

const localReact = createRequire(import.meta.url)('react')
const uiRequire = createRequire(new URL('../../../../ui/package.json', import.meta.url))
const uiReact = uiRequire('react')
const radixReact = createRequire(uiRequire.resolve('@radix-ui/react-tooltip'))('react')
Object.assign(uiReact, localReact)
Object.assign(radixReact, localReact)
