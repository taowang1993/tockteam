---
name: shadcn
description: Manages shadcn components and projects — adding, searching, fixing, debugging, styling, and composing UI. Provides project context, component docs, and usage examples. Applies when working with shadcn/ui, component registries, presets, --preset codes, or any project with a components.json file. Also triggers for "shadcn init", "create an app with --preset", or "switch to --preset".
user-invocable: false
allowed-tools: Bash(npx shadcn@latest *), Bash(pnpm dlx shadcn@latest *), Bash(bunx --bun shadcn@latest *)
---

# shadcn/ui

A framework for building ui, components and design systems. Components are added as source code to the user's project via the CLI.

> **IMPORTANT:** In TockTeam, run the CLI with `pnpm dlx shadcn@latest`. Never initialize the repository root or overwrite files without explicit user approval.

## TockTeam Project Context

TockTeam is a DSH distribution, not a conventional standalone React app. Inspect the repository before using the CLI:

- Treat the project as uninitialized while no `components.json` exists.
- Ask which browser product area should own shared controls before adding the first component. Do not create a root `components/ui` directory by default.
- Keep Host and browser-client code separate. Add React components only to a browser-client package that can bundle their dependencies.
- Keep TUI unchanged; shadcn is browser-only.
- Preserve React 18 compatibility, strict NodeNext TypeScript, and explicit `.ts` import extensions.
- Use `plugins/skins/src/client/tailwind.css` as the only first-party browser stylesheet. Its Tailwind build is owned by `scripts/tailwind.mjs` and injected by the skins client plugin.
- Preserve DSH's `--dsw-*` theme authority and the no-reset Tailwind setup. Map shadcn semantic tokens to DSH tokens instead of installing a second global theme or preflight reset.
- Avoid unresolved `@/` imports. Use paths supported by the owning package and the existing esbuild/TypeScript configuration.

After a `components.json` exists in the approved owner, run `pnpm dlx shadcn@latest info --cwd <owner-directory>` for project config and installed components. Use `pnpm dlx shadcn@latest docs <component>` for current documentation and examples.

## Principles

1. **Use existing components first.** Use `pnpm dlx shadcn@latest search` before writing custom UI. Prefer official components; inspect any user-approved community source first.
2. **Compose, don't reinvent.** Settings page = Tabs + Card + form controls. Dashboard = Sidebar + Card + Chart + Table.
3. **Use built-in variants before custom styles.** `variant="outline"`, `size="sm"`, etc.
4. **Use semantic colors.** `bg-primary`, `text-muted-foreground` — never raw values like `bg-blue-500`.

## TockTeam Integration Rules

1. **Add only what is needed.** Install individual components for a concrete feature; never add the full catalog.
2. **Preview every write.** Use `--dry-run` and `--diff` before adding or updating components. Read generated files before keeping them.
3. **Keep one owner.** Reuse the approved component owner instead of copying a component into several plugins. Add a new shared package only after an explicit architecture decision.
4. **Preserve DSH tokens.** Extend the existing `@theme inline` mapping with the smallest semantic aliases a component needs. Do not replace the stylesheet with generated shadcn defaults.
5. **Preserve lifecycle boundaries.** Render and dispose contributed UI through Cordis effects; do not introduce a second application root or agent loop.
6. **Audit external registries.** Prefer official `@shadcn` items. Preview and inspect any user-requested third-party item before installation, and never execute an untrusted registry URL directly.
7. **Update the build graph when required.** If component ownership adds a dependency or package, update its manifest, `scripts/build.mjs`, Tailwind sources, and focused composition tests as applicable.

## Critical Rules

These rules are **always enforced**. Each links to a file with Incorrect/Correct code pairs.

### Styling & Tailwind → [styling.md](./rules/styling.md)

- **`className` for layout, not styling.** Never override component colors or typography.
- **No `space-x-*` or `space-y-*`.** Use `flex` with `gap-*`. For vertical stacks, `flex flex-col gap-*`.
- **Use `size-*` when width and height are equal.** `size-10` not `w-10 h-10`.
- **Use `truncate` shorthand.** Not `overflow-hidden text-ellipsis whitespace-nowrap`.
- **No manual `dark:` color overrides.** Use semantic tokens (`bg-background`, `text-muted-foreground`).
- **Use `cn()` for conditional classes.** Don't write manual template literal ternaries.
- **No manual `z-index` on overlay components.** Dialog, Sheet, Popover, etc. handle their own stacking.

### Forms & Inputs → [forms.md](./rules/forms.md)

- **Forms use `FieldGroup` + `Field`.** Never use raw `div` with `space-y-*` or `grid gap-*` for form layout.
- **`InputGroup` uses `InputGroupInput`/`InputGroupTextarea`.** Never raw `Input`/`Textarea` inside `InputGroup`.
- **Buttons inside inputs use `InputGroup` + `InputGroupAddon`.**
- **Option sets (2–7 choices) use `ToggleGroup`.** Don't loop `Button` with manual active state.
- **`FieldSet` + `FieldLegend` for grouping related checkboxes/radios.** Don't use a `div` with a heading.
- **Field validation uses `data-invalid` + `aria-invalid`.** `data-invalid` on `Field`, `aria-invalid` on the control. For disabled: `data-disabled` on `Field`, `disabled` on the control.

### Component Structure → [composition.md](./rules/composition.md)

- **Items always inside their Group.** `SelectItem` → `SelectGroup`. `DropdownMenuItem` → `DropdownMenuGroup`. `CommandItem` → `CommandGroup`.
- **Use `asChild` (radix) or `render` (base) for custom triggers.** Check `base` from `pnpm dlx shadcn@latest info`. → [base-vs-radix.md](./rules/base-vs-radix.md)
- **Dialog, Sheet, and Drawer always need a Title.** `DialogTitle`, `SheetTitle`, `DrawerTitle` required for accessibility. Use `className="sr-only"` if visually hidden.
- **Use full Card composition.** `CardHeader`/`CardTitle`/`CardDescription`/`CardContent`/`CardFooter`. Don't dump everything in `CardContent`.
- **Button has no `isPending`/`isLoading`.** Compose with `Spinner` + `data-icon` + `disabled`.
- **`TabsTrigger` must be inside `TabsList`.** Never render triggers directly in `Tabs`.
- **`Avatar` always needs `AvatarFallback`.** For when the image fails to load.

### Use Components, Not Custom Markup → [composition.md](./rules/composition.md)

- **Use existing components before custom markup.** Check if a component exists before writing a styled `div`.
- **Callouts use `Alert`.** Don't build custom styled divs.
- **Empty states use `Empty`.** Don't build custom empty state markup.
- **Toast via `sonner`.** Use `toast()` from `sonner`.
- **Use `Separator`** instead of `<hr>` or `<div className="border-t">`.
- **Use `Skeleton`** for loading placeholders. No custom `animate-pulse` divs.
- **Use `Badge`** instead of custom styled spans.

### Icons → [icons.md](./rules/icons.md)

- **Icons in `Button` use `data-icon`.** `data-icon="inline-start"` or `data-icon="inline-end"` on the icon.
- **No sizing classes on icons inside components.** Components handle icon sizing via CSS. No `size-4` or `w-4 h-4`.
- **Pass icons as objects, not string keys.** `icon={CheckIcon}`, not a string lookup.

### CLI

- **Never decode preset codes or build preset URLs manually.** Use `pnpm dlx shadcn@latest preset decode <code>`, `preset url <code>`, or `preset open <code>`. For project-aware preset detection, use `pnpm dlx shadcn@latest preset resolve`.
- **Never apply a preset to TockTeam's root.** Preview preset output in the approved component owner and merge only reviewed changes.

## Key Patterns

These are the most common patterns that differentiate correct shadcn/ui code. For edge cases, see the linked rule files above.

```tsx
// Form layout: FieldGroup + Field, not div + Label.
<FieldGroup>
  <Field>
    <FieldLabel htmlFor="email">Email</FieldLabel>
    <Input id="email" />
  </Field>
</FieldGroup>

// Validation: data-invalid on Field, aria-invalid on the control.
<Field data-invalid>
  <FieldLabel>Email</FieldLabel>
  <Input aria-invalid />
  <FieldDescription>Invalid email.</FieldDescription>
</Field>

// Icons in buttons: data-icon, no sizing classes.
<Button>
  <SearchIcon data-icon="inline-start" />
  Search
</Button>

// Spacing: gap-*, not space-y-*.
<div className="flex flex-col gap-4">  // correct
<div className="space-y-4">           // wrong

// Equal dimensions: size-*, not w-* h-*.
<Avatar className="size-10">   // correct
<Avatar className="w-10 h-10"> // wrong

// Status colors: Badge variants or semantic tokens, not raw colors.
<Badge variant="secondary">+20.1%</Badge>    // correct
<span className="text-emerald-600">+20.1%</span> // wrong
```

## Component Selection

| Need                       | Use                                                                                                 |
| -------------------------- | --------------------------------------------------------------------------------------------------- |
| Button/action              | `Button` with appropriate variant                                                                   |
| Form inputs                | `Input`, `Select`, `Combobox`, `Switch`, `Checkbox`, `RadioGroup`, `Textarea`, `InputOTP`, `Slider` |
| Toggle between 2–5 options | `ToggleGroup` + `ToggleGroupItem`                                                                   |
| Data display               | `Table`, `Card`, `Badge`, `Avatar`                                                                  |
| Navigation                 | `Sidebar`, `NavigationMenu`, `Breadcrumb`, `Tabs`, `Pagination`                                     |
| Overlays                   | `Dialog` (modal), `Sheet` (side panel), `Drawer` (bottom sheet), `AlertDialog` (confirmation)       |
| Feedback                   | `sonner` (toast), `Alert`, `Progress`, `Skeleton`, `Spinner`                                        |
| Command palette            | `Command` inside `Dialog`                                                                           |
| Charts                     | `Chart` (wraps Recharts)                                                                            |
| Layout                     | `Card`, `Separator`, `Resizable`, `ScrollArea`, `Accordion`, `Collapsible`                          |
| Empty states               | `Empty`                                                                                             |
| Menus                      | `DropdownMenu`, `ContextMenu`, `Menubar`                                                            |
| Tooltips/info              | `Tooltip`, `HoverCard`, `Popover`                                                                   |

## Key Fields

The injected project context contains these key fields:

- **`aliases`** → use the actual alias prefix for imports (e.g. `@/`, `~/`), never hardcode.
- **`isRSC`** → when `true`, components using `useState`, `useEffect`, event handlers, or browser APIs need `"use client"` at the top of the file. Always reference this field when advising on the directive.
- **`tailwindVersion`** → `"v4"` uses `@theme inline` blocks; `"v3"` uses `tailwind.config.js`.
- **`tailwindCssFile`** → the global CSS file where custom CSS variables are defined. Always edit this file, never create a new one.
- **`style`** → component visual treatment (e.g. `nova`, `vega`).
- **`base`** → primitive library (`radix` or `base`). Affects component APIs and available props.
- **`iconLibrary`** → determines icon imports. Use `lucide-react` for `lucide`, `@tabler/icons-react` for `tabler`, etc. Never assume `lucide-react`.
- **`resolvedPaths`** → exact file-system destinations for components, utils, hooks, etc.
- **`framework`** → routing and file conventions (e.g. Next.js App Router vs Vite SPA).
- **`packageManager`** → use this for any non-shadcn dependency installs (e.g. `pnpm add date-fns` vs `npm install date-fns`).
- **`preset`** → resolved preset code and values for the current project. Use `pnpm dlx shadcn@latest preset resolve --json` when you only need preset information.

See [cli.md — `info` command](./cli.md) for the full field reference.

## Component Docs, Examples, and Usage

Run `pnpm dlx shadcn@latest docs <component>` to get the URLs for a component's documentation, examples, and API reference. Fetch these URLs to get the actual content.

```bash
pnpm dlx shadcn@latest docs button dialog select
```

**When creating, fixing, debugging, or using a component, always run `pnpm dlx shadcn@latest docs` and fetch the URLs first.** This ensures you're working with the correct API and usage patterns rather than guessing.

## Workflow

1. **Resolve ownership first** — inspect `components.json`, package manifests, `scripts/build.mjs`, and the relevant browser-client entry point. If TockTeam is still uninitialized, ask which product area should own shared controls before creating configuration or files.
2. **Get project context** — after ownership is configured, run `pnpm dlx shadcn@latest info --cwd <owner-directory>`.
3. **Check installed components first** — before running `add`, check the `components` list from project context or list the `resolvedPaths.ui` directory. Don't import components that haven't been added, and don't re-add ones already installed.
4. **Find components** — `pnpm dlx shadcn@latest search`.
5. **Get docs and examples** — run `pnpm dlx shadcn@latest docs <component>` to get URLs, then fetch them. Use `pnpm dlx shadcn@latest view` to browse registry items you haven't installed. To preview changes to installed components, use `pnpm dlx shadcn@latest add --diff`.
6. **Install or update** — `pnpm dlx shadcn@latest add`. When updating existing components, use `--dry-run` and `--diff` to preview changes first (see [Updating Components](#updating-components) below).
7. **Fix generated imports** — Check added files for `@/components/ui/...` and other aliases unsupported by TockTeam's current TypeScript/esbuild setup. Rewrite them to resolvable imports with explicit `.ts` extensions while preserving the approved component owner.
8. **Review added components** — Read every added file and verify imports, dependencies, composition, accessibility, React 18 compatibility, and the [Critical Rules](#critical-rules). Keep the configured `lucide-react` version unless the user explicitly approves an icon-library change.
9. **Registry must be explicit** — Use official `@shadcn` for named core components. If the user asks for a block or third-party component without naming its source, ask which source to use rather than guessing.
10. **Switching presets** — Ask the user first: **overwrite**, **partial**, **merge**, or **skip**?
   - **Inspect current preset**: `pnpm dlx shadcn@latest preset resolve`. Use `--json` when you need structured values.
   - **Inspect incoming preset**: `pnpm dlx shadcn@latest preset decode <code>`. Use `preset url <code>` or `preset open <code>` to share or open the preset builder.
   - **Overwrite**: `pnpm dlx shadcn@latest apply <code>`. Overwrites detected components, fonts, CSS variables, and is inappropriate for TockTeam without explicit approval.
   - **Partial**: `pnpm dlx shadcn@latest apply <code> --only theme,font`. Preview first and preserve DSH token mappings.
   - **Merge**: `pnpm dlx shadcn@latest init --preset <code> --force --no-reinstall`, then run `pnpm dlx shadcn@latest info` and smart-merge each installed component.
   - **Skip**: `pnpm dlx shadcn@latest init --preset <code> --force --no-reinstall`. Only update config and CSS after confirming the generated CSS preserves TockTeam's theme authority.
   - **Important**: Run preset commands only inside the approved component owner. Never apply a preset at the TockTeam repository root.

## Updating Components

When the user asks to update a component from upstream while keeping local changes, use `--dry-run` and `--diff` to intelligently merge. Never fetch raw files manually.

1. Run `pnpm dlx shadcn@latest add <component> --dry-run` to see every affected file.
2. For each file, run `pnpm dlx shadcn@latest add <component> --diff <file>` to compare upstream with the local version.
3. Decide per file based on the diff:
   - No local changes → safe to overwrite.
   - Has local changes → read the local file, analyze the diff, and apply upstream updates while preserving local modifications.
   - User says "just update everything" → use `--overwrite`, but confirm first.
4. **Never use `--overwrite` without the user's explicit approval.**

## Verification

1. Run the smallest focused component or composition test first.
2. Run `pnpm run typecheck`, `pnpm test`, and `pnpm run build`.
3. Run `pnpm run smoke:web` when browser composition or runtime loading changes.
4. Inspect `git status`, keep only intended tracked source, and make a small commit.

## Quick Reference

```bash
# Inspect the approved owner.
pnpm dlx shadcn@latest info --cwd <owner-directory>

# Preview official components before adding or updating.
pnpm dlx shadcn@latest add button card dialog --cwd <owner-directory> --dry-run
pnpm dlx shadcn@latest add button --cwd <owner-directory> --diff button.tsx

# Search and read current documentation.
pnpm dlx shadcn@latest search @shadcn -q "dialog" --cwd <owner-directory>
pnpm dlx shadcn@latest docs button dialog select --cwd <owner-directory>
pnpm dlx shadcn@latest view @shadcn/button --cwd <owner-directory>

# Add only reviewed components.
pnpm dlx shadcn@latest add button --cwd <owner-directory>
```

**Named presets:** `nova`, `vega`, `maia`, `lyra`, `mira`, `luma`
**Templates:** `next`, `vite`, `start`, `react-router`, `astro` (all support `--monorepo`) and `laravel` (not supported for monorepo)
**Preset codes:** Version-prefixed base62 strings (e.g. `a2r6bw` or `b0`), from [ui.shadcn.com](https://ui.shadcn.com).

## Detailed References

- [rules/forms.md](./rules/forms.md) — FieldGroup, Field, InputGroup, ToggleGroup, FieldSet, validation states
- [rules/composition.md](./rules/composition.md) — Groups, overlays, Card, Tabs, Avatar, Alert, Empty, Toast, Separator, Skeleton, Badge, Button loading
- [rules/icons.md](./rules/icons.md) — data-icon, icon sizing, passing icons as objects
- [rules/styling.md](./rules/styling.md) — Semantic colors, variants, className, spacing, size, truncate, dark mode, cn(), z-index
- [rules/base-vs-radix.md](./rules/base-vs-radix.md) — asChild vs render, Select, ToggleGroup, Slider, Accordion
- [cli.md](./cli.md) — Commands, flags, presets, templates
- [registry.md](./registry.md) — Authoring source registries, `include`, item definitions, dependencies, GitHub registry rules
- [customization.md](./customization.md) — Theming, CSS variables, extending components
- [mcp.md](./mcp.md) — Optional read-only registry discovery through an already configured MCP server
- [agents/openai.yml](./agents/openai.yml) — Interface metadata using the [small](./assets/shadcn-small.png) and [large](./assets/shadcn.png) shadcn icons
