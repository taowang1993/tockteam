# Customization & Theming

## TockTeam Theme Authority

Extend `plugins/skins/src/client/tailwind.css`; do not create `globals.css` or another browser stylesheet. Keep Tailwind preflight disabled and preserve the `--dsw-*` variables supplied by the pinned DSH runtime.

Map shadcn semantic utilities directly to DSH tokens inside the existing `@theme inline` block. Add only tokens required by installed components. Typical mappings include:

| shadcn utility token | DSH source |
| --- | --- |
| `background` / `foreground` | Base background / primary label |
| `card` / `card-foreground` | Layer-one background / primary label |
| `popover` / `popover-foreground` | Raised or overlay background / primary label |
| `primary` / `primary-foreground` | Brand primary / brand inverse |
| `secondary` / `secondary-foreground` | Layer-two background / primary label |
| `muted` / `muted-foreground` | Layer-two background / secondary label |
| `accent` / `accent-foreground` | Layer-three background / primary label |
| `destructive` | Error-state primary |
| `border` / `input` | Level-two border |
| `ring` | Brand primary |

Confirm the exact `--dsw-*` variables against the pinned DSH source before editing. Do not copy a generated standalone `:root` and `.dark` palette into TockTeam.

## Dark Mode

Let DSH own light and dark mode. Its semantic variables change with the active DSH theme, so shadcn mappings should update automatically. Do not add `next-themes`, a separate `.dark` toggle, or manual `dark:` color overrides.

## Adding a Semantic Token

Add the smallest mapping to the existing Tailwind block:

```css
@theme inline {
  --color-primary: var(--dsw-alias-brand-primary);
  --color-primary-foreground: var(--dsw-alias-brand-primary-invert);
}
```

Use the mapped utility in components:

```tsx
<div className="bg-primary text-primary-foreground">Branded Surface</div>
```

Prefer a built-in component variant when it already provides the intended appearance.

## Border Radius

Add or map radius tokens only when an installed component requires them. Preserve TockTeam's existing shape language rather than accepting preset defaults blindly.

## Customizing Components

Use these approaches in order:

1. Use an existing variant such as `variant="outline"` or `size="sm"`.
2. Use `className` for layout only.
3. Add a semantic DSH-backed token when the design needs a missing role.
4. Add a component variant when the behavior repeats.
5. Compose a local wrapper only when several call sites share the same behavior.

Do not fork a component merely to adjust one call site.

## Checking for Updates

Preview upstream changes before touching local source:

```bash
pnpm dlx shadcn@latest add button --cwd <owner-directory> --dry-run
pnpm dlx shadcn@latest add button --cwd <owner-directory> --diff button.tsx
```

Merge upstream changes into customized files manually. Use `--overwrite` only after explicit user approval.
