import { createRequire } from 'node:module'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const defaultRoot = join(dirname(fileURLToPath(import.meta.url)), '..')

async function tailwindModules(root) {
  const require = createRequire(join(root, 'plugins', 'skins', 'package.json'))
  const [{ compile, optimize }, { Scanner }] = await Promise.all([
    import(pathToFileURL(require.resolve('@tailwindcss/node')).href),
    import(pathToFileURL(require.resolve('@tailwindcss/oxide')).href),
  ])
  return { compile, optimize, Scanner }
}

export async function buildTailwindCss(root = defaultRoot) {
  const input = join(root, 'plugins', 'skins', 'src', 'client', 'tailwind.css')
  const { compile, optimize, Scanner } = await tailwindModules(root)
  const compiler = await compile(await readFile(input, 'utf8'), {
    base: dirname(input),
    from: input,
    onDependency: () => {},
  })
  const scanner = new Scanner({ sources: compiler.sources })
  return optimize(compiler.build(scanner.scan()), { file: input, minify: true }).code
}
