const MAX_URL_LENGTH = 4_096

function ipv4Parts(value: string): readonly [number, number, number, number] | undefined {
  const parts = value.split('.')
  if (parts.length !== 4 || parts.some(part => !/^\d{1,3}$/u.test(part))) return undefined
  const numbers = parts.map(Number)
  if (numbers.some(part => !Number.isSafeInteger(part) || part < 0 || part > 255)) return undefined
  return numbers as [number, number, number, number]
}

function publicIpv4(parts: readonly [number, number, number, number]): boolean {
  const [a, b, c] = parts
  if (a === 0 || a === 10 || a === 127 || a >= 224) return false
  if (a === 100 && b >= 64 && b <= 127) return false
  if (a === 169 && b === 254) return false
  if (a === 172 && b >= 16 && b <= 31) return false
  if (a === 192 && b === 0 && (c === 0 || c === 2)) return false
  if (a === 192 && b === 31 && c === 196) return false
  if (a === 192 && b === 52 && c === 193) return false
  if (a === 192 && b === 88 && c === 99) return false
  if (a === 192 && b === 168) return false
  if (a === 192 && b === 175 && c === 48) return false
  if (a === 198 && (b === 18 || b === 19)) return false
  if (a === 198 && b === 51 && c === 100) return false
  if (a === 203 && b === 0 && c === 113) return false
  return true
}

function ipv6Words(value: string): number[] | undefined {
  const address = value.toLocaleLowerCase('en-US').split('%', 1)[0] ?? ''
  if (address.length === 0 || value.includes('%')) return undefined
  const halves = address.split('::')
  if (halves.length > 2) return undefined
  const parse = (part: string): number[] | undefined => {
    if (part.length === 0) return []
    const pieces = part.split(':')
    const output: number[] = []
    for (const piece of pieces) {
      if (piece.includes('.')) {
        const ipv4 = ipv4Parts(piece)
        if (ipv4 === undefined) return undefined
        output.push((ipv4[0] << 8) | ipv4[1], (ipv4[2] << 8) | ipv4[3])
      } else {
        if (!/^[0-9a-f]{1,4}$/u.test(piece)) return undefined
        output.push(Number.parseInt(piece, 16))
      }
    }
    return output
  }
  const left = parse(halves[0] ?? '')
  const right = parse(halves.length === 2 ? halves[1] ?? '' : '')
  if (left === undefined || right === undefined) return undefined
  if (halves.length === 1) return left.length === 8 ? left : undefined
  const missing = 8 - left.length - right.length
  if (missing < 1) return undefined
  return [...left, ...Array.from({ length: missing }, () => 0), ...right]
}

function hasIpv6Prefix(words: readonly number[], prefix: readonly number[], bits: number): boolean {
  let remaining = bits
  for (let index = 0; remaining > 0; index += 1) {
    const width = Math.min(remaining, 16)
    const mask = width === 16 ? 0xffff : (0xffff << (16 - width)) & 0xffff
    if (((words[index] ?? -1) & mask) !== ((prefix[index] ?? -1) & mask)) return false
    remaining -= width
  }
  return true
}

const NON_GLOBAL_IPV6_PREFIXES: readonly Readonly<{ bits: number; words: readonly number[] }>[] = Object.freeze([
  Object.freeze({ bits: 64, words: [0x0100, 0, 0, 0] }), // discard-only 100::/64
  Object.freeze({ bits: 23, words: [0x2001, 0] }), // IETF protocol assignments, including Teredo and benchmarking
  Object.freeze({ bits: 32, words: [0x2001, 0x0db8] }), // documentation
  Object.freeze({ bits: 16, words: [0x2002] }), // deprecated 6to4
  Object.freeze({ bits: 96, words: [0x0064, 0xff9b, 0, 0, 0, 0] }), // NAT64 well-known prefix
  Object.freeze({ bits: 48, words: [0x0064, 0xff9b, 0x0001] }), // NAT64 local-use prefix
  Object.freeze({ bits: 20, words: [0x3fff, 0] }), // documentation
])

function ipv4FromWords(words: readonly number[]): readonly [number, number, number, number] {
  return [words[0]! >> 8, words[0]! & 255, words[1]! >> 8, words[1]! & 255]
}

/** Returns false for non-global addresses, including private, special, and mapped values. */
export function isPublicLauncherNetworkAddress(value: string): boolean {
  if (typeof value !== 'string' || value.length === 0 || value.includes('%')) return false
  const ipv4 = ipv4Parts(value)
  if (ipv4 !== undefined) return publicIpv4(ipv4)
  if (/^\d+(?:\.\d+){3}$/u.test(value)) return false
  const words = ipv6Words(value)
  if (words === undefined) return false
  const mapped = words.slice(0, 5).every(word => word === 0) && words[5] === 0xffff
  if (mapped) return publicIpv4(ipv4FromWords(words.slice(6)))
  // IPv4-compatible addresses are deprecated, but retain the reviewed policy:
  // only their embedded globally routable IPv4 value is acceptable.
  if (words.slice(0, 6).every(word => word === 0)) return publicIpv4(ipv4FromWords(words.slice(6)))
  if (NON_GLOBAL_IPV6_PREFIXES.some(prefix => hasIpv6Prefix(words, prefix.words, prefix.bits))) return false
  const first = words[0]!
  // This intentionally permits only global-unicast 2000::/3; unspecified,
  // loopback, ULA, link-local, multicast, site-local, and other special ranges
  // therefore fail closed without an ever-growing deny list.
  return first >= 0x2000 && first <= 0x3fff
}

function isPublicLauncherHost(hostname: string): boolean {
  const host = hostname.toLocaleLowerCase('en-US').replace(/\.$/u, '')
  if (host.length === 0 || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) return false
  if (host.startsWith('[') || host.endsWith(']')) {
    if (!host.startsWith('[') || !host.endsWith(']')) return false
    return isPublicLauncherNetworkAddress(host.slice(1, -1))
  }
  if (host.includes(':') || host.includes('%')) return false
  const ipv4 = ipv4Parts(host)
  if (ipv4 !== undefined) return publicIpv4(ipv4)
  if (/^\d+(?:\.\d+){3}$/u.test(host)) return false
  return /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/u.test(host)
}

/** Parse a URL allowed for a browser or fixed provider request. */
export function parseLauncherExternalUrl(value: string): URL {
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_URL_LENGTH || /[\0\r\n]/u.test(value)) {
    throw new Error('Invalid external URL')
  }
  let url: URL
  try { url = new URL(value) } catch { throw new Error('Invalid external URL') }
  if (url.protocol !== 'https:' || url.username.length > 0 || url.password.length > 0 || (url.port !== '' && url.port !== '443') || !isPublicLauncherHost(url.hostname)) {
    throw new Error('External URL is outside the HTTPS public-host policy')
  }
  return url
}

export function validateLauncherNetworkUrl(value: string): boolean {
  try { parseLauncherExternalUrl(value); return true } catch { return false }
}

export function validateLauncherNetworkTemplate(value: string): boolean {
  const placeholder = '{{query}}'
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_URL_LENGTH || /[\0\r\n]/u.test(value)
    || value.indexOf(placeholder) < 0 || value.indexOf(placeholder) !== value.lastIndexOf(placeholder)) return false
  try {
    const parsed = parseLauncherExternalUrl(value.replace(placeholder, 'tockteam-query-placeholder'))
    return !parsed.hostname.includes('tockteam-query-placeholder')
  } catch { return false }
}
