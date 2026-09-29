# Raycast Compatibility Baseline — macOS, 2026-09-29

## Provenance and Method

- Selected source: `https://github.com/raycast/extensions` at `1063bfaa34be81528c4e397c91b57c42ec370d79`; local read-only snapshot: `/Users/taowang/research/launcher/raycast-extension-samples`. Root tree and per-file Git blob identities are recorded in that snapshot's `SOURCE.json`. The repository root `LICENSE` says MIT; individual dependencies, native helpers and future redistribution need separate review. No upstream source was copied into TockTeam.
- Reproducible command inventory: `tests/fixtures/raycast-compatibility-matrix.json` (13 upstream command entries and two additionally bundled-only commands). Exact source blobs, declared command modes and current admission are checked with `RAYCAST_EXTENSION_SAMPLES=/Users/taowang/research/launcher/raycast-extension-samples node --test tests/raycast-compatibility-matrix.test.ts` (**2 passed**). Without the optional snapshot, the test still checks the committed pinned matrix structure and current exact descriptor admission.
- `needs` lists are **initial static leads**, from command source and transitive imports where obvious, not complete executed-path/API coverage. This is not a score of working extensions. Preserve `boot`, `render`, `action` and `effect` as separate measurements; **not run** means unverified, not broken.
- Runtime baseline: `node --test tests/trusted-raycast-manager.test.ts tests/trusted-raycast-kaomoji-runtime.test.ts tests/trusted-raycast-can-i-use-runtime.test.ts` yielded **9 passed, 3 skipped**. With `TRUSTED_RAYCAST_ARTIFACT_TAR=$PWD/plugins/trusted-raycast/vendor/google-translate.tar node --test tests/trusted-raycast-manager.test.ts`, **7 passed, 1 failed**: Google Translate preview booted; its live translation assertion saw no translated text within 16 seconds. Network/provider outcome is unverified, **not** a confirmed launcher bug. Both tests clean up child processes via `finally`.

## Measured Admission and Behavioral Status

Each external command below has a pinned source blob in the matrix. For **all 12 non-admitted commands**, boot/render/action/effect are **not run**: the present fixed-ID descriptor rejects their identity or command before source execution. That is an admission limitation, not evidence that each API fails independently.

1. `google-translate/translate` — view; admitted and pinned. Boot: **yes** (isolated preview). Render: **yes** (readiness projection; existing search-input integration). Action: **unverified** for live translation. Effect: **unverified** (translation did not arrive in the 16-second external-provider test). Its pinned unchanged artifact remains the current reviewed pilot.
2. `google-translate/instant-translate-copy` — no-view; **not admitted**: second command is not in the fixed descriptor. Needs selection, network, clipboard, HUD.
3. `color-picker/menu-bar` — menu-bar; **not admitted**. Needs `MenuBarExtra`, refresh and persistent state.
4. `color-picker/pick-color` — no-view; **not admitted**. Needs Swift native helper, clipboard and preference reads; dangerous to claim as generic Node compatibility.
5. `google-chrome/new-window` — no-view; **not admitted**. Needs AppleScript and Chrome installation; no browser automation was attempted.
6. `google-chrome/search-tab` — view; **not admitted**. Needs List, browser-tab data and the extension's SQLite/WASM dependency.
7. `spotify-player/nowPlayingMenuBar` — menu-bar; **not admitted**. Needs refresh, persistent state, Spotify access and network/OAuth.
8. `linear/search-issues` — view; **not admitted**. Needs List, authentication and network.
9. `slack/search` — view; **not admitted**. Needs List, preference reads, authentication and network.
10. `notion/search-page` — view; **not admitted**. Needs List and `withAccessToken` OAuth support. Do not claim Raycast redirect schemes.
11. `brew/services-menu` — menu-bar; **not admitted**. Needs Homebrew processes, menu state and refresh; host execution is trusted account-level access after consent.
12. `visual-studio-code-recent-projects/index` — view; **not admitted**. Needs Grid, recent-project files, AppleScript and external VS Code installation.
13. `kill-process/index` — view; **not admitted**. Needs process enumeration/termination, alert and storage. **Static inventory only**; do not dynamically run against a user's processes.
14. `kaomoji-search/index` — view; pinned bundled-only artifact at `b7845053e3f39dadcf984217be5249fb51ab2ce8`. Boot/render: **yes** in focused existing source-child search-input test; action/effect: not measured here.
15. `can-i-use/index` — view; pinned bundled-only artifact at `186d955eda64f9e956b25a3fdf5566b1d38f57f2`. Source asset and projection checks passed; its rendered runtime test was **skipped**, so boot/render/action/effect are **not measured** in this baseline.

## Priority After the Baseline

1. **General command identity, safe bundle admission and List/Action projection**: 12/15 commands are barred before their APIs can be assessed. Prove an independently selected **real** view command, not merely a custom fixture. Keep existing three immutable and skip dynamic code before approval.
2. **No-view execution, preferences, namespaced storage, feedback, cancellation**: at least three selected no-view commands need this; select a low-risk effect and avoid a kill-process/native picker as the first executable sample.
3. **Chosen-source import/update and reversible trust**: without a user-selected install route, API coverage alone cannot satisfy the request. Source distribution and dependency rights must be rechecked before an online adapter.
4. **Menu refresh and OAuth**: three selected menu commands and several online view commands require them. These are separate bounded slices; a Raycast-only provider callback stays incompatible.
5. **Native/browser/window APIs**: defer until specific command demand and allowed app-scoped proof justify each effect. An installed extension is not guaranteed supported because its imports resolve.

**Stop gate:** This baseline does not certify arbitrary Raycast Store extensions, an account sandbox, or any universal API parity. The planned installer and post-consent execution remain unimplemented at this measurement checkpoint.
