import { createRequire } from 'node:module'

const localReact = createRequire(import.meta.url)('react')
const uiReact = createRequire(new URL('../../../../ui/package.json', import.meta.url))('react')
const internals = '__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED'

Object.assign(uiReact[internals], localReact[internals])
