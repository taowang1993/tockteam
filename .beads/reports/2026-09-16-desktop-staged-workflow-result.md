# Desktop Staged Workflow Verification

## Scoped Result

The macOS arm64 source-Electron workflow fixture and separate staged POSIX owner check passed against `2067bf952bf354a2e5d66133603550ab1e82740c`. Parent verification independently checked the final receipt, module hash, geometry, admission/replay/cancellation results, error arrays, removed temporary root, and absence of the recorded owner, Electron, and Playwright daemon PIDs.

[Allowlisted Proof](2026-09-16-desktop-staged-workflow-proof.json)

- Actual Playwright CLI 0.1.20 session attached to Electron; 1512 × 949 CSS pixels, DPR 2, dark theme, no skin. No screenshot was taken.
- Authenticated inactive-mode checkpoints both recorded zero focused windows. Mock Keychain and isolated application/home data were used; no foreground automation or user credentials.
- Accepted, declined, canceled, and replayed workflow actions crossed actual Desktop settings/launcher IPC. All three settings updates succeeded; replay was rejected; forbidden effects and metadata leaks were absent.
- **Workflow effects and confirmations were fixtures.** This does not prove a real command invoked through Desktop. A separate command used the staged owner successfully, with stdout 12 bytes and verified process-group settlement.
- Electron PID 58128, staged owner PID 58122, and Playwright daemon PID 58276 were stopped. Receipt reports no process residue and removal of the temporary root.
- Runtime page-error arrays and unexpected browser warning/error arrays were empty. Host logs still contained isolated ApplicationSearch failures, superseded searches, expected negative-action errors, and teardown diagnostics. This is not whole-app error-free acceptance.

## Commands and Retained Evidence

The verifier refreshed existing outputs with `pnpm run build:tocktutor && pnpm run build && node scripts/stage-dsh.mjs --quick`, then ran the bounded harness. Final corrected command: `node /tmp/tockteam-desktop-check-playwright.mjs` (11.9 seconds, exit 0). The harness uses `playwright-cli attach`, two `run-code` scripts, and `detach` with cleanup in `finally`.

Original raw-CDP and intermediate harness-correction failures remain separately under `/tmp/tockteam-desktop-check-*`; they are not additional product acceptance claims. Raw logs remain private because they contain expired runtime capability URLs. Only explicitly selected non-secret facts were copied into the proof above.

## Remaining Boundaries

This is not packaged/installed-distribution acceptance, Windows Electron acceptance, an external hotkey test, or native workflow side-effect acceptance. Windows x64 runner-level ownership remains supported by its separate native report. Indexed-search child integration is still pending, and historical Windows cancellation causation remains unproven.
