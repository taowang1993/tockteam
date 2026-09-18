export interface TailwindSource {
  base: string
  negated: boolean
  pattern: string
}

export function buildTailwindCss(
  root?: string,
  sources?: TailwindSource[],
): Promise<string>
