# Audit Gap Verification

Code checkpoint: `4729ec49`. The four audited fixes and their consumer artifacts are unchanged from `de76d9e8`; subsequent commits add only the separate process-owner foundation. No push or Windows execution occurred.

## Verified Fixes

| Issue | Evidence and Closure Scope |
| --- | --- |
| `3pg` | Real React 18 browser consumers resolve `Input` and `DialogOverlay` refs to native elements. Input focus/editing, Radix autofocus, Escape, and trigger-focus restoration pass without React warnings. |
| `q6h` | A real Cordis/DSH `ToolRuntime` invokes `notes_search` with a padded query against Markdown, Canvas, and Base fixtures. The result is normalized, Markdown-only, and bounded before pagination; four inventory entries and two document reads yield one citation and a result-limit cursor. |
| `dve` | Real managers validate all three current built artifacts. Actual macOS availability projects runnable commands; simulated Linux availability projects management rows instead. This is platform-gating proof, not native Linux/Windows support. |
| `g82` | The real registered Web Viewer runs in a sandboxed Electron WebView. Delayed native readiness preserves the external intent, empty tabs visibly clear the guest, and superseded work does not replace the latest page. Mounted tests additionally cover capacity and deferred authorization; real Host/client round trips cover maximum Reader limits. |

The browser and Electron evidence uses **1512 × 949 CSS pixels, DPR 2, 3024 × 1898 PNGs, dark theme, and no skin**. No runtime/console errors or surviving owned processes were reported. Electron remained unfocused and used `--use-mock-keychain` with isolated data. These are focused component/native-surface proofs, not an installed full-product or LLM-driven acceptance run.

## Process-Owner Checkpoint

`1b50a906` adds a Node-only POSIX process-owner leaf. `4729ec49` fixes an independent-review P1: failed shutdown previously left inherited output pipes or a live child handle keeping the Host alive. Two real subprocess regressions fail before the fix and pass after releasing only Host stream/event-loop resources.

Failed verification **still rejects both completion and repeated termination**; closing streams or calling `unref()` never counts as process-exit proof. Successful settlement requires root exit, stream closure, and process-group disappearance. Linux zombie-only groups deliberately remain unverified; Linux diagnostics are test-only, and no Linux-native acceptance is claimed.

This helper is **not integrated** into the existing workflow runner or search index. Windows explicitly rejects. The final read-only reviewer verdict is **OK for this foundation only** (run `553d8be3-f153-4c42-816a-cdefd4dff5cd`).

## Checks

| Command | Result |
| --- | --- |
| `node --test --test-concurrency=1 tests/*.test.ts` | 1,291 passed, 14 conditional skips |
| `node --test plugins/tocktutor/packages/tockbot-note-runtime/tests/*.test.ts` | 100 passed |
| `node --test plugins/tocktutor/packages/tockbot-note-runtime/tests/owned-process.test.ts` | 9 passed; includes two real failed-verification leak fixtures |
| `node --test tests/trusted-raycast-composition.test.ts plugins/tocktutor/packages/tockbot-note-vault/test/inspection.test.js` | 34 passed |
| `pnpm -C plugins/tocktutor/packages/tockteam-note-vault-tools test` | 15 passed |
| `pnpm -C plugins/tocktutor/packages/tockteam-tocktutor-workbench exec vitest run tests/shared-ui-ref-forwarding.test.tsx tests/web-clip-lifecycle.test.tsx --environment jsdom` | 6 passed |
| `pnpm -C plugins/tocktutor/packages/tockbot-web-clip test` | 60 passed |
| `pnpm exec tsc --noEmit --pretty false` | Passed |
| `pnpm run build` | Passed |
| `pnpm -C plugins/tocktutor/packages/tockbot-note-runtime typecheck` | Passed |
| `pnpm -C plugins/tocktutor/packages/tockbot-note-runtime build` | Passed; generated outputs and manifest refreshed |

Node package self-resolution succeeds; a browser bundle rejects the Host-only export. Root manifest/workflow focused checks pass 16/16.

## Evidence

The [allowlisted evidence directory](audit-gap-verification-2026-09-15/proof.json) was published exclusively with `proof.json` last as the completion marker. It contains screenshot hashes, exact geometry, cleanup PID evidence, real Notes/platform results, and ownership RED/GREEN logs.

- [Ref and Focus Proof](audit-gap-verification-2026-09-15/ref-focus.png)
- [Empty Native WebView](audit-gap-verification-2026-09-15/viewer-empty.png)
- [Latest Native WebView](audit-gap-verification-2026-09-15/viewer-latest.png)

Runnable local harnesses: `/tmp/tockteam-eight/continuation-verification/3pg-real-ui/run.mjs`, `q6h-real-consumer.mjs`, `dve-real-consumer.mjs`, and `/tmp/tockteam-eight/g82-native/run.mjs`. Full local logs remain under `/tmp/tockteam-eight/continuation-*.log` and `owned-process-*.log`.

## Remaining Scope

`bon` and `fsq` remain in progress: integrate owned index execution, add creation-time Windows Job ownership, and verify native/packaged behavior. The original Windows cancellation cause is still unproven. `snz` still needs fresh installed acceptance covering all three automatically enabled bundled extensions and preserved user disablement. The foundation and four focused verifications do not close those three issues.
