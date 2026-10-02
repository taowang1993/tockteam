# TockTutor Right Titlebar Divider

Issue: `tockteam-wsi8`. Source checkpoint: `f0a1da2b`, over the peer-owned Native source checkpoint `c6d2569a`.

## Confirmed Findings

Total: **1**, fixed.

1. **P3 — Missing right titlebar divider.** Assistant and Properties shared a titlebar wrapper without the vertical border already present on the left sidebar. The pane boundary stopped below the titlebar. Affected path: `plugins/tocktutor/packages/tockteam-tocktutor-workbench/src/route.tsx`. Fixed with the existing `border-l border-[var(--tt-border)]` utilities; no new stylesheet, component, palette, handler, or authority. The public rendered check failed in both views before the fix (left: 1px solid; right: 0px none), then passed after rebuilding.

## Rendered Verification

- Real source-built/staged Desktop, isolated profile and fixture, generic Electron through the guarded extended display 19. App-scoped Playwright attached only to the owned CDP endpoint. No user app/profile, foreground automation, prompt, or native dialog.
- Exact 1512 × 949 CSS pixels at DPR 2; both screenshots are unscaled 3024 × 1898 PNGs. Canonical built-in dark theme, no skin on the document or body.
- All eight appearances pass with opposite system appearance, in both Assistant and Properties: identical left/right 1px solid divider color; full 40px titlebar height; header/body boundary aligned; no width change or overflow. Both views also pass at the 240px minimum sidebar width.
- Keyboard view switching and close/reopen view retention pass. Closing the pane removes its titlebar choices from keyboard access. The existing two-pixel composer gap, 28px footer-safe area, and right-anchored footer remain unchanged.
- Properties retains the 1,413-byte `comparison.md`, nine rows and unchanged values; Assistant retains the original 1,324-byte `UIUX Comparison.md`, empty composer and four suggestions. The 170-byte registry remains unchanged. No prompt sent, renderer errors, failed requests, or external requests.
- Both full-size screenshots were opened for visual review. Only the TockTutor Assistant and Imported Properties captures are eligible for publication. Every other capture and both installed/historical references are preserved.
- Inspector, RED Desktop and initial GREEN Desktop: all 44 recorded PIDs stopped. Final current-tree capture root 29525 and all 19 recorded PIDs stopped with no descendants; Playwright detached. All owned CDP/app-server ports are closed.

Reusable check, after opening either right-sidebar view in an owned Desktop session:

```sh
playwright-cli -s=<owned-session> run-code --filename=/Users/taowang/projects/tockteam/.beads/reports/2026-10-02-tocktutor-titlebar-divider-check.js
```

## Checks

- Focused sidebar components: 120/120 pass.
- Root and TockTutor typechecks; source builds; quick staging; build-manifest check: pass.
- `pnpm run test:tocktutor`: the existing five-second capped Replace All test timed out under the default full component fanout. Unchanged focused rerun passes; full bounded four-worker Workbench component rerun passes 790/790. Earlier package/node checks and remaining Assistant, Import/Export and Web Clip suites pass. No timeout, test or editor source was weakened.
- Final `pnpm test`: 1,788 pass, 18 intentional opt-in skips, zero failures (1,806 total). Final root/TockTutor typechecks, `pnpm run build:tocktutor`, `pnpm run build`, `node scripts/stage-dsh.mjs --quick`, and `node scripts/tocktutor-build-manifest.mjs --check`: pass. All 137 recorded fixture process groups stopped. Final `node --test tests/tocktutor-gallery.test.ts tests/tocktutor-content-alignment.test.ts`: 22/22 pass. Transactional publication replaced only the two allowlisted TockTutor PNGs; all 71 other captures and both references remain byte-identical. The guarded gallery decoded both updated pairs and, after scrolling each image into view, all 67 image elements (66 unique images); 29 surfaces, exact viewport/DPR, and no runtime/request/HTTP errors. Gallery root 43333 plus its three descendants stopped, static server 43311 stopped, and ports 61479/61475 are closed.

## Limitations and Separate Work

- React Doctor reported no issues in its bounded offline changed-file scan, but maintainability analysis failed and the score was disabled; no full health-score comparison is claimed. The earlier unbounded attempt timed out. These are incomplete tooling checks, not confirmed product bugs.
- The initial eight-appearance matrix preserved peer checkpoint `c6d2569a`. During the long user wait, external work changed the compat API (09:44 UTC), manager (07:12 UTC), and other app sources. The user explicitly authorized finishing checks with those edits present and generated builds refreshed. Final screenshots were recaptured at 11:32 UTC from that approved working tree; exact artifact hashes are in `titlebarDividerRefresh`. The external source/test/doc changes were not edited, reverted, staged or committed by this task. The three remaining Native presentation-owned files/report and all three protected user files retain their initial hashes. Native Desktop proof and issue closure remain separate; this check does not certify Native forms, date popups, or third-party extensions.
- User-owned `AGENTS.md`, both protected tests and existing Playwright artifacts are not part of this change. No push.

Restart Electron to load the divider.
