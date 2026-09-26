# Rounded Sidebar Note Actions

The existing 24 × 24px, 4px-radius button now mixes 8% semantic foreground into its selected-row fill. This distinguishes the rounded square from the sidebar and hovered row in every appearance without changing geometry, focus, or note actions. The user explicitly declined the +/nested-page feature; Files and Folders remain unchanged.

## Verification

- `cd plugins/tocktutor/packages/tockteam-tocktutor-workbench && ./node_modules/.bin/vitest run tests/route-note-context-menu.test.tsx --environment jsdom`: 2 passed.
- `pnpm run typecheck`, `pnpm run typecheck:tocktutor`, `pnpm --filter @tockteam/ui run typecheck`: passed using the pinned local pnpm executable.
- `pnpm test`: 1,450 passed, 17 environment-guarded skips. `pnpm run build`: passed. Workbench generated outputs were rebuilt via its generator, TypeScript compiler, and client build script; manifest validation passed.
- Six guarded Electron runs: 16 assertions passed per appearance, covering contrasting rounded geometry, long-title overlay, no layout shift, hover/focus/open states, menu targeting, draft preservation, keyboard navigation, dismissal and focus restoration. Minimum icon contrast: 8.21:1. No runtime errors. All owned process trees stopped with no remaining descendants.
- `proof.json` records exact geometry, appearance, route/content/mode, colors, and cleanup. All captures verified at 1512 × 949 CSS pixels / 3024 × 1898 PNG pixels with reduced motion and opposite system appearance. Only `dark.png` is published; canonical dark mode with no document/body skin was verified.

## Limits

`pnpm run test:tocktutor` hit the existing environment restriction (`spawn EPERM` in `search-index-host-death.test.ts` process inventory). React Doctor found no issues on changed lines but its maintainability analysis was incomplete. Neither check is claimed as fully passing. The root pnpm invocation automatically normalized the lockfile; only that self-generated delta was restored.
