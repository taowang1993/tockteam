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

export async function buildTailwindCss(root = defaultRoot, sources) {
  const input = join(root, 'plugins', 'skins', 'src', 'client', 'tailwind.css')
  const { compile, optimize, Scanner } = await tailwindModules(root)
  const compiler = await compile(await readFile(input, 'utf8'), {
    base: dirname(input),
    from: input,
    onDependency: () => {},
  })
  const scanner = new Scanner({ sources: sources ?? compiler.sources })
  const css = optimize(compiler.build(scanner.scan()), { file: input, minify: true }).code
  const resolve = createRequire(join(root, 'plugins', 'tocktutor', 'packages', 'tockteam-tocktutor-workbench', 'package.json')).resolve
  const fontRoot = join(dirname(createRequire(resolve('@milkdown/crepe')).resolve('katex/package.json')), 'dist', 'fonts')
  const fonts = [...css.matchAll(/url\((?:\.\/)?fonts\/(KaTeX_[\w-]+\.(?:woff2?|ttf))\)/gu)]
  const encoded = await Promise.all(fonts.map(async ([, name, ext]) => [name, `url(data:font/${ext};base64,${(await readFile(join(fontRoot, name))).toString('base64')})`]))
  const data = new Map(encoded)
  return css.replace(/url\((?:\.\/)?fonts\/(KaTeX_[\w-]+\.(?:woff2?|ttf))\)/gu, (_url, name) => data.get(name))
}
