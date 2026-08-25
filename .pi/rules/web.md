---
paths:
  - src/client.ts
  - cordis.patch.yml
  - web/**
  - plugins/**/src/**/*.css
  - plugins/**/src/**/*.tsx
  - plugins/**/src/client.ts
  - plugins/**/src/client/**
---

# TockTeam Web Design System

This document is the canonical local design guidance for browser-rendered TockTeam UI. It governs both **TockTeam Desktop** and **TockTeam Web**, because Desktop renders the Web UI inside Electron. It does not replace DSH's base UI system or define TUI rendering rules.

## Agent Quick Rules

- Read the owning surface and its callers before changing UI. Reuse the closest existing DSH component, semantic token, and TockTeam recipe before adding local styling.
- DSH owns the base browser shell, ThemeService, typography, and `--dsw-*` semantic token contract. Verify inherited APIs against the revision pinned by `dsh-source.json`.
- `plugins/skins/src/skins.ts` is the only TockTeam skin catalog. Do not create another palette or theme loader.
- Use `--dsw-alias-*` and `--dsw-specific-*` tokens for ordinary UI color. TockTeam aliases such as `--tockteam-*` and TockTutor aliases such as `--tt-*` must derive from those semantic tokens.
- Use Lucide for interface icons. Product marks are the only routine custom-SVG exception.
- Use semantic HTML, preserve keyboard behavior, label icon-only controls, show keyboard focus, and honor `prefers-reduced-motion`.
- Keep Host, browser-client, Electron, and TUI ownership separate. A visual change must not widen IPC, filesystem, process, workspace, or plugin authority.
- Keep styling with its current owner. Tailwind CSS v4 is the shared browser utility layer, not a component library or a replacement for DSH semantics. Existing feature CSS remains valid and should migrate only when touched.
- Run the smallest visual regression test first, then `pnpm run typecheck`, `pnpm test`, and `pnpm run build`.

## 1. Authority and Ownership

Use this precedence when sources disagree:

1. `AGENTS.md` for product, security, copy, architecture, and verification contracts.
2. The pinned DSH checkout for inherited ThemeService, layout, component, and token behavior.
3. `plugins/skins/src/skins.ts` for TockTeam-owned skin values and cross-surface palette identity.
4. The existing shared owner for the affected shell or feature.
5. This document for local design decisions and contribution rules.

### Surface Boundaries

| Surface                                                     | Owner                                                        |
| ----------------------------------------------------------- | ------------------------------------------------------------ |
| Base Web application, ThemeService, and DSH UI primitives   | Pinned DSH runtime                                           |
| Electron windows, titlebar bridge, preload/IPC, permissions | `src/main.ts`, `src/preload.ts`, `src/client.ts`             |
| Desktop/Web composition                                     | `cordis.patch.yml`, `web/cordis.patch.yml`, `src/profile.ts` |
| Rail, sidebar, shared titlebar, workspace panel             | `plugins/sidebar/src/client/`                                |
| Terminal dock and panel controls                            | `plugins/panel-controls/src/terminal/`                       |
| Pinned summary                                              | `plugins/pinned-summary/src/client.ts`                       |
| Plugin marketplace                                          | `plugins/plugin-marketplace/src/client/` on Desktop only     |
| Skin catalog and picker                                     | `plugins/skins/src/`                                         |
| TockTutor workbench and assistant                           | `plugins/tocktutor/packages/*/src/`                          |
| TUI rendering                                               | Pinned `dsh-TUI`; outside this document                      |

Web must not emulate Electron authority. `web/cordis.patch.yml` intentionally omits Electron-only behavior, including the Desktop marketplace bridge.

## 2. Theme and Color

### Sources of Truth

- `plugins/skins/src/skins.ts` defines the official Deep Current, Jade Circuit, Porcelain, and Ember Dusk skins.
- The injected DSH ThemeService applies the active theme.
- `plugins/skins/src/client/skin-dom.ts` owns only `data-tockteam-skin` and optional skin atmosphere CSS.
- `plugins/skins/src/tui-adapter.ts` projects the same catalog into TUI semantic colors; it is not a second palette.

### Semantic Tokens

Prefer these existing DSH roles:

| Role                 | Tokens                                                                                                                                  |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Backgrounds          | `--dsw-alias-bg-base`, `--dsw-alias-bg-layer-1`, `--dsw-alias-bg-layer-2`, `--dsw-alias-bg-layer-3`, `--dsw-alias-bg-overlay`           |
| Borders              | `--dsw-alias-border-l1`, `--dsw-alias-border-l2`, `--dsw-alias-border-l3`                                                               |
| Text                 | `--dsw-alias-label-primary`, `--dsw-alias-label-secondary`, `--dsw-alias-label-tertiary`, inherited dimmed-label tokens where available |
| Brand and actions    | `--dsw-alias-brand-primary`, `--dsw-alias-brand-primary-invert`, `--dsw-alias-brand-text`, `--dsw-alias-button-primary-*`               |
| Interaction          | `--dsw-alias-interactive-bg-hover`, `--dsw-alias-interactive-bg-active`, inherited focus tokens                                         |
| Status               | `--dsw-alias-state-success-primary`, `--dsw-alias-state-warn-primary`, `--dsw-alias-state-error-primary`                                |
| Content              | `--dsw-alias-markdown-code-block`, `--dsw-alias-markdown-inline-code`                                                                   |
| Specialized surfaces | `--dsw-specific-sidebar-*`, `--dsw-specific-bubble`, `--dsw-specific-input-major`, `--dsw-specific-menu`                                |

Use semantic purpose, not a token that merely has the desired current color. Tailwind exposes these roles as `background`, `surface`, `surface-muted`, `surface-raised`, `overlay`, `foreground`, `muted-foreground`, `subtle-foreground`, `border`, `border-strong`, `brand`, `brand-foreground`, `success`, `warning`, `destructive`, `code-block`, and `inline-code`; combine them with utilities such as `bg-surface` or `text-foreground`. Do not promote feature aliases such as `--tt-*` into a second global token system.

Raw colors are allowed only when they are intrinsic data or a documented boundary: skin catalog values and previews, terminal ANSI fallbacks, product marks, syntax/diff data, or a pinned upstream compatibility seam. Existing raw values are not automatically reusable tokens.

Every change must remain legible in the built-in light and dark themes and all four TockTeam skins. Do not assume a white background or a purple accent.

## 3. Typography and Copy

DSH owns the base browser font stack and global type behavior. TockTeam currently has no separate global typography scale.

- Inherit the surrounding DSH font for ordinary controls and copy.
- Reuse the sizes and hierarchy of the nearest shared surface; do not establish a new global scale from one feature.
- Use the inherited code-font token or `ui-monospace` only for code, diffs, paths, and terminal content.
- Keep terminal font family and size preferences scoped to the terminal.
- Truncate or wrap user-controlled text intentionally. Shrinkable flex/grid children need `min-width: 0`.
- Use tabular numerals for aligned counts, durations, timestamps, and diff totals.
- Use Title Case for standalone UI labels and sentence case for descriptions and full sentences, as required by `AGENTS.md`.
- Preserve the exact product names **TockTeam Desktop**, **TockTeam Web**, and **TockTeam TUI**.

## 4. Icons

- Use `lucide-react` in React code and `lucide` in imperative DOM code.
- Standard shell and toolbar icons are 18px. Dense subcontrols may use the smaller size already established by their owning feature.
- Use `currentColor`; let state and theme tokens color the control.
- Icon-only buttons require an `aria-label`.
- Decorative icons require `aria-hidden="true"`.
- Custom SVG is reserved for product marks or unavoidable third-party/protocol identity. Do not use emoji, text glyphs, or hand-drawn SVG as interface-icon substitutes.
- Keep `tests/icons.test.ts` and `tests/dsh-lucide-icons.test.ts` green.

## 5. Components and Feature CSS

TockTeam deliberately composes DSH instead of shipping a second Web component system. Tailwind provides browser utilities only; `plugins/skins/src/client/tailwind.css` maps its semantic color utilities to the inherited `--dsw-*` contract and `@tockteam/skins` owns lifecycle injection on Desktop and Web. Tailwind does not apply to TockTeam TUI.

1. Reuse an inherited DSH component when it preserves the required behavior.
2. Reuse the closest TockTeam feature recipe or component.
3. Use Tailwind utilities for new or touched browser layout and styling when existing feature CSS is not the clearer owner.
4. Use native HTML/CSS when it fully solves the interaction.
5. Add the smallest namespaced feature rule only when utilities cannot express the behavior clearly.

Rules:

- Prefix local classes with `tockteam-` or the established feature namespace such as `tocktutor-`.
- Keep CSS in the existing owner: Tailwind classes in feature markup, a feature stylesheet, its lifecycle-owned inline stylesheet, or its downstream bundle adapter.
- Keep Tailwind class names statically discoverable. Add new browser source roots to `plugins/skins/src/client/tailwind.css`; do not scan Host or TUI source and do not construct utility names dynamically.
- Do not add another CSS framework, component library, token layer, or styling runtime. Do not add shadcn merely because Tailwind is available.
- Host-only packages must not acquire browser-client styling accidentally. Browser UI remains in client exports and client bundle metadata.
- Register injected styles, slots, listeners, and DOM effects through Cordis lifecycle ownership so unload removes them.
- Do not edit `upstream/*` for TockTeam styling. Use the existing downstream adapter or bundle layer.

### Controls

- Use `<button>` for actions and `<a>` for navigation.
- Form controls need visible labels or `aria-label`.
- Keep disabled, loading, selected, hover, active, and focus-visible states distinct.
- Use concise action labels. Destructive actions need confirmation or a recoverable transaction.
- Do not block paste or browser zoom.

### Lists and Dense Workspaces

- Keep row titles visually primary and metadata quieter.
- Constrain long names, paths, and generated content with truncation, wrapping, or clamping.
- Avoid card wrappers when rows, separators, or plain grouping communicate the hierarchy.
- Large repeated collections must use the containment or virtualization strategy already owned by that surface.

## 6. Shell and Layout

The shared Desktop/Web shell uses these established metrics:

| Metric                             | Value | Owner                                    |
| ---------------------------------- | ----- | ---------------------------------------- |
| Titlebar height                    | 40px  | `src/client.ts`, sidebar shell           |
| App rail width                     | 40px  | `plugins/sidebar/src/client/sidebar.css` |
| Primary sidebar width              | 280px | `plugins/sidebar/src/client/sidebar.css` |
| Expanded sidebar composition width | 300px | `plugins/sidebar/src/client/sidebar.css` |
| Standard shell icon                | 18px  | shared titlebar/rail rules               |

Treat these as compatibility metrics, not a general spacing scale.

- Preserve titlebar drag regions and mark interactive controls `-webkit-app-region: no-drag`.
- Keep rail, sidebar, main content, terminal, and right panel as one coherent grid. Prefer CSS grid/flex over JavaScript measurement.
- Resizers need a clear hit target, correct cursor and touch behavior, keyboard semantics where supported, and a visible hover/focus state.
- Avoid unwanted nested scrollbars. Each pane should have one obvious scroll owner.
- Overlays must respect the titlebar, active route, portals, and existing z-index ownership. Do not solve stacking bugs by choosing a larger arbitrary number locally.
- TockTutor owns keyboard focus while its route is active; do not let hidden DSH or terminal controls intercept it.

## 7. Motion

- Motion must explain state, continuity, or spatial origin. Frequent controls should feel immediate.
- Prefer `transform` and `opacity`. List transitioned properties instead of using unbounded `transition: all`.
- Existing shell transitions generally use roughly 120–180ms for local state and longer, explicitly scoped transitions for large TockTutor panels.
- Opening and closing behavior must remain interruptible and must not leave hidden content interactive.
- Honor `prefers-reduced-motion: reduce` by removing nonessential transitions and animation.
- Do not animate layout continuously during pointer resizing.

## 8. Accessibility

- Preserve native semantics before adding ARIA.
- Show a visible tokenized `:focus-visible` state; never remove focus indication without an equivalent replacement.
- Icon-only controls require accessible names. Decorative icons stay hidden from assistive technology.
- Tabs use `tablist`/`tab`, selection state, and the established keyboard model.
- Resizers expose separator orientation and value bounds when implemented as accessibility widgets.
- Async status and errors use an appropriate live region without stealing focus unnecessarily.
- Color is never the only status cue.
- Maintain readable contrast across every supported theme and skin.
- Preserve `aria-hidden`, `inert`, pointer-event, and visibility behavior together for closed animated panels.

## 9. Compatibility Zones

These exceptions remain scoped; they are not general design precedent.

- **Pinned DSH UI:** imperative selectors and downstream patches may be necessary where the pinned runtime exposes no component seam. Keep selectors exact, tested, reversible, and revision-bound.
- **Better Sidebar:** TockTeam owns its adapter and CSS, while upstream owns Host behavior. Do not edit the submodule for TockTeam presentation.
- **Terminal:** xterm owns terminal rendering. ANSI colors, monospace preferences, and viewport synchronization stay inside the terminal adapter.
- **TockTutor:** its workbench and assistant may carry precise parity geometry and local `--tt-*` aliases, but those aliases must resolve to DSH semantics and must not leak into other products.
- **Marketplace:** trusted plugin execution and prepare → preview → approve/apply behavior are security contracts. Visual simplification must not merge or hide those states.
- **Product marks and previews:** logos, skin preview gradients, and user/data-driven previews may use intrinsic colors. Surrounding controls still use semantic tokens.

## 10. Verification

Run the smallest relevant check first. Useful focused checks include:

```sh
node --test tests/icons.test.ts tests/skins.test.ts
node --test tests/right-panel-layout.test.ts tests/terminal-style.test.ts
node --test tests/sidebar.test.ts tests/terminal-panel-store.test.ts
```

For TockTutor UI changes, run the focused package test and rebuild tracked outputs through the package scripts; never hand-edit `lib/` or `dist/`.

Finish with the repository gate:

```sh
pnpm run typecheck
pnpm test
pnpm run build
```

Use rendered browser or Electron verification for nontrivial visual changes when the user has not requested source-only review. Check keyboard focus, reduced motion, narrow layouts, long content, and every affected theme. Do not add screenshot baselines or visual tooling unless the repository needs repeatable regression evidence.

## 11. Do and Don't

### Do

- Start with the active surface owner and its tests.
- Derive colors from DSH semantic tokens.
- Keep one TockTeam skin catalog across Desktop, Web, and TUI.
- Reuse Lucide, native semantics, and existing feature recipes.
- Preserve lifecycle disposal, security boundaries, keyboard behavior, and theme support.
- Add one focused regression check for nontrivial visual logic.

### Don't

- Don't create a second agent loop, plugin system, theme loader, or browser authority layer.
- Don't invent a global component, typography, spacing, radius, shadow, or motion scale for one feature.
- Don't hardcode ordinary UI colors or assume one skin.
- Don't patch generated output, installed dependencies, the pinned DSH checkout, or `upstream/*` directly.
- Don't suppress focus, reduced-motion behavior, zoom, paste, or semantic controls.
- Don't copy Tockbot's shadcn, route-template, or product-specific recipes into this repository; TockTeam's Tailwind setup remains a thin utility layer over DSH and its existing downstream plugins.
