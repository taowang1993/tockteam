# Can I Use Local Admission and Electron Proof

## Scope

After the preference/detail slice passed, the user explicitly selected **Finish the App Checks**, authorizing local development admission for final verification. Can I Use is now a reviewed, explicitly installed command under **Trusted Extensions**; it is not automatically installed or enabled. Nothing was pushed or published. Mole remains excluded.

The normal Desktop integration now owns a separate trust/install/preference namespace, stages the exact candidate, validates preferences against held targets before saving/importing source, and reconstructs browser destinations in main. Can I Use cannot send child-native Copy, Paste, selection, preference-save, or arbitrary browser requests. Translate and Kaomoji keep their original paths and approvals.

## Artifact and Package Custody

- Source revision: `186d955eda64f9e956b25a3fdf5566b1d38f57f2`.
- Artifact: `plugins/trusted-raycast/vendor/can-i-use.tar`, 5,954,048 bytes.
- SHA-256: `0e23b06703ad85e91f9c6793c5de689204e9fe3bdb0fed3106a1324406bf3858`.
- Root build and both package file inventories include `dist/trusted-raycast-can-i-use/**`.
- Tests verify pinned bytes, source provenance, the surviving license inventory and notices, derived identity, and isolated stage → preview → apply → enable → disable → remove.
- Preference writes revalidate the exact held target set, use private atomic writes, and reject non-regular paths. Bounded reads now use `O_NONBLOCK` as well as `O_NOFOLLOW`; the FIFO regression test genuinely failed before that fix.

Candidate **assembly** remains a macOS/BSD-tar maintenance operation. Distribution builds consume the committed archive instead of reassembling it. Can I Use admission is explicitly disabled on Windows while the runtime requires `/usr/bin/tar`. This report claims macOS verification, not Linux runtime parity.

## Fresh Verification

With `/opt/homebrew/opt/node@24/bin` prepended to `PATH`:

```sh
node --test --test-concurrency=4 tests/trusted-raycast-*.test.ts tests/trusted-raycast-*.test.mjs tests/launcher-preload-bridge.test.ts tests/launcher-installed.test.ts
./node_modules/.bin/tsc --noEmit
git diff --check
node scripts/trusted-raycast-can-i-use-electron-proof.mts
```

Regression result: **372 tests, 365 passed, 7 explicitly skipped, zero failed**. Typecheck and diff check passed. Regression log: `/tmp/can-i-use-final-regression.txt`.

The Electron harness rebuilds the actual app and stages its pinned DSH runtime. It uses a disposable profile, the real launcher/preload/main/child path, and Playwright CLI attached to the gate-owned Electron process. It installs Can I Use through the actual two-step UI and separately enables it.

Verified in Electron:

- First-run preferences, invalid `defaults` rejection, keyboard Continue, persistence, and editing.
- All 581 features searchable with at most 64 root rows.
- Search → detail → keyboard Back, 14 support rows, and honest browser-denial feedback without losing the view.
- Dark/light theme replacement preserves the root query.
- Empty results and fresh-child preference replacement.
- Correct green support colors under the **unchanged** strict launcher CSP; no Can I Use CSP violations.
- Real Translate and Kaomoji commands still open; their disposable data and protected live profile trees remain unchanged.

Browser opening was deliberately denied in the native gate. Earlier manager/browser tests cover reconstructed exact URLs and success/failure callbacks; this is **not** a claim that the user's default browser was opened.

## Evidence and Cleanup

Durable evidence: [`tocklauncher-can-i-use-electron/`](tocklauncher-can-i-use-electron/), containing the exact passing `proof.json` and four screenshots. Setup-dark and detail-light captures were visually inspected.

Passing raw evidence: `/var/folders/fv/18g6fp8n0xnbycsgy4zsj7f40000gn/T/can-i-use-electron-evidence-qJlgy6/`. Runner PID: 86684. The receipt records the Electron root and observed descendants, seven zero-focus checkpoints, no focus events, unchanged legacy/live data, and no cleanup errors. All recorded owned processes stopped, the attached CLI session was detached and closed, and the disposable profile was removed.

Earlier attempts were not counted as passing. They uncovered fixture timing/copy assumptions, an inactive-window focus event, and missing support colors caused by forbidden inline style attributes. The focus guard failed closed; no attempt was made to restore the user's active application. Test-only windows are now non-focusable and avoid implicit maximization; screenshots use direct read-only CDP capture, and a focus event immediately aborts interaction. Colors use finite first-party CSSOM properties rather than relaxing CSP. All failed-run owned processes were cleaned up; their temporary receipts remain available.

## Review and Remaining Gate

Self-review applied the simplification, security/hardening, and performance references. The implementation reuses the existing trust transaction, finite renderer, profile namespaces, and atomic writer. No dependency was added. There is no claimed performance improvement; existing row, action, input, and message bounds remain enforced.

Remaining limitations: details have no browser-search field; a theme change returns details to the preserved root search; dynamic Browserslist selectors and project configuration are unsupported. The separate installed-application smoke is still required for `.4.4`. It now also drives Can I Use installation, preferences, search, details, and Back from the actual packaged app and checks the installed identity and legacy preference preservation. Its existing macOS launch flow can take foreground focus, unlike this background-only proof; it must not run without fresh permission. Consult the issue's final verification receipt for that gate's outcome.

## Installed Gate Attempt at `dfa76704`

The user subsequently authorized the final installation check, including foreground activation. Ran `pnpm test:launcher:installed` with Node 24 and `TOCKTEAM_INSTALLED_SMOKE_TEMP_ROOT=$HOME/Library/Caches/tockteam-smoke.noindex`.

**Failed before packaging or app launch:** `scripts/ueli/check-package-feasibility.mjs` reported `npm package files differ from the release contract` and `Builder application files differ from the release contract`. Both lists in `scripts/ueli/desktop-release-contract.json` omit `dist/trusted-raycast-can-i-use/**`, which is present in both package manifest lists. Installed behavior remains unverified; `.4.4` remains open.

Log: `/tmp/can-i-use-final-installed-dfa76704.log`. Diagnostic receipt: `$HOME/Library/Caches/tockteam-smoke.noindex/tockteam-installed-smoke-95165-diagnostics.json`. Runner PID 95165 exited; process inspection found no remaining installed-test processes. No Electron app was launched.

The pnpm invocation also performed automatic dependency installation and rewrote `pnpm-lock.yaml` (775 additions, 919 deletions). No peer session was active in this checkout. The diff is preserved at `/tmp/can-i-use-installed-lockfile.patch`; the lockfile is left unstaged and unchanged pending ownership/cleanup approval. The installed gate was not rerun at this commit.
