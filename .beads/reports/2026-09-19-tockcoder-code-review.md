# TockCoder snapshot review — 2026-09-19

Beads: `tockteam-46f`. Automation: `review-tockcoder-code`.

Reviewed TockCoder-owned routes and launcher integration, sidebar composition and persistence, workspace Git Host/API adapter, review diff/comment flow, composer history, file/browser views, terminal adapter/lifecycle, and shared request trust. Related summary, surface, layout, and composition contracts were checked with their tests. This is a source snapshot review, not a fresh audit of every vendored DSH implementation or the entire Electron application.

Applied all three mandatory review references: code simplification, security/hardening, and performance. Re-reviewed the final patches with all three perspectives. Changes retain Host session/path validation, origin checks, sandboxed HTML previews, bounded rendered change lists, and the pinned DSH composition. No dependencies or runtime pins changed.

## Fixed findings

1. **[P2] Preserve filenames in Git patch headers.** Git appends a literal tab separator to ambiguous `---`/`+++` paths. The parser included it in names and failed to decode quoted Unicode names followed by it. Strip the separator before decoding, preserving real spaces and escaped tabs. A real temporary Git repository reproduces the failure and verifies the fix.
2. **[P2] Expose both sides of partially staged files.** An `MM` status produced only a staged entry, hiding working-tree edits. Map index and working-tree statuses separately and identify selected rows by both path and stage. Conflicts remain one unstaged entry. Unit tests and real React browser interaction cover both rows and ensure only the selected diff renders.
3. **[P2] Serialize settings startup with writes.** Reset could save before the initial revision arrived, then have its UI state overwritten by the older load. The initial read now shares the existing update queue. A delayed-load test verifies that reset waits and uses the loaded revision.
4. **[P2] Ignore stale directory results.** Directory-list success callbacks lacked the abort check used by error handling and file previews. A late response after a session change could replace the active listing. Added the guard; the browser test delays one session's result until the next session is visible.
5. **[P2] Detach terminal callbacks on disposal.** Parking/closing retained `onopen` and `onmessage`, allowing late events to invoke a disposed terminal view. Close now marks the adapter closed and clears all handlers. Protocol tests cover parked and removed tabs, late output/readiness/exit, and preservation of close-versus-park messages.

Each defect was reproduced with a failing check before its fix, then passed after the fix.

## Fresh verification

All commands exited 0 after the final implementation change:

```sh
node --test tests/workspace-tools.test.ts tests/review-diff.test.ts tests/sidebar*.test.ts tests/composer*.test.ts tests/input-history.test.ts tests/tocktutor-route.test.ts tests/desktop-settings-navigation.test.ts tests/launcher-workbench-navigation.test.ts tests/right-panel-layout.test.ts tests/request-trust.test.ts tests/surface.test.ts tests/plugin.test.ts tests/pinned-summary*.test.ts tests/terminal-panel-store.test.ts tests/terminal-protocol.test.ts tests/terminal-style.test.ts tests/smoke-client.test.ts tests/tockcoder-panel.test.mjs
pnpm typecheck
pnpm build
git diff --check
```

112 tests passed, zero failed/skipped. Browser proof uses the real sidebar plugin and React UI with fixture DSH services/HTTP responses. It checks `/tockcoder`, stale workspace/diff/directory responses, staged-versus-unstaged selection, and zero page/console errors. Geometry was verified as 1512 × 949 CSS pixels at DPR 2, with an in-memory PNG of 3024 × 1898 pixels; explicit dark color scheme and no skin. No screenshots were published. Browser root PID 58770 and its process group were stopped using the existing `stopChildProcess`/`assertProcessTreeGone` cleanup; the loopback server was closed. A subsequent PID check found no live root process.

React Doctor commands:

```sh
npx -y react-doctor@latest . --verbose --diff
npx -y react-doctor@latest . --verbose --scope changed --base HEAD
```

The default branch comparison reports two existing diagnostic kinds: `WorkspacePanel` complexity and a loading-reset warning. The latter is a false positive at the abort-guarded reset inside `finally`; rejection already reaches that block. The large component remains a maintainability limitation. The initial six-file scan scored 76/100; the expanded final nine-file scan scored 69/100 with the same two diagnostics. The explicit HEAD comparison reports only complexity and also scores 69/100. No score-nonregression claim is made; these are not clean React Doctor results. No broad refactor or lint suppression was introduced to change the score.

## Scope and handoff

Production edits are confined to six files: sidebar `better-sidebar-api.ts`, `plugin.tsx`, `review-diff.ts`, `runtime-settings.ts`, `SideToolsPanel.tsx`, and panel-controls `terminal-socket.ts`. Five test files and one browser fixture were updated.

Preserved pre-existing edits in sidebar `i18n.ts`, the settings UI portions of `plugin.tsx`, shared `switch.tsx`, and the untracked `sidebar-settings-browser-proof.mjs`. No commit or push was made.

Electron/installed packaging smokes and a full repository test run were not run: fixes affect browser adapters and pure state/protocol behavior, not Electron/IPC/packaging. The browser harness does not prove live PTY server reconnection or a packaged Desktop end-to-end flow. Existing vendored runtime limitations remain outside this patch.

Verdict: the five reproduced defects are fixed with passing focused verification; the existing large-component maintainability warning still needs attention if a clean React Doctor gate is required.

## Follow-up automation review — 2026-09-19 03:29 UTC

Beads: `tockteam-ln5`. Preserved every edit present at the start of this run. Reviewed the prior repairs and remaining TockCoder Host Git operations, request/session authorization, sidebar persistence and runtime settings, review parsing/comments, composer history, terminal adapters, file/browser views, and route integration. Applied all three review references again: simplification, security/hardening, and performance. This covers TockTeam-owned integrations; it is not a claim to audit every pinned upstream runtime implementation.

### Additional fixes

- **[P1] Keep workspace path identity exact.** Trimming an authorized path such as `/parent/project ` collapsed it onto the separate `/parent/project` directory. The session authorization helper accepted the sibling and Git actions could execute there. Preserve the supplied filesystem path and strip only Git's final output newline from `rev-parse --show-toplevel`. Real temporary repositories prove authorization rejects the sibling and branch creation changes only the intended repository. Additional coverage preserves trailing tabs, newlines, and carriage returns on POSIX. These filename tests explicitly skip Windows, where these names are unsupported or normalized.
- **[P1] Honor the configured first-push destination.** With no upstream, the Host hardcoded `origin`, even when `remote.pushDefault` or `branch.<name>.pushRemote` selected another destination. This could publish code to the wrong remote. Let Git select the destination using a command-local `push.default=current` and `push --set-upstream`. Existing upstream pushes retain their existing behavior. Local bare repositories verify configured-remote precedence, a sole non-origin remote, subsequent pushes, missing-remote rejection, and detached-HEAD rejection. The command-local default does not overwrite repository configuration. Git's user-owned push refspecs and remote configuration remain authoritative.

Both findings were reproduced with failing `node --test tests/workspace-paths.test.ts` runs before repair. A further edge test caught carriage-return stripping in the initial path remedy; the final implementation removes only one LF.

### Final verification

All final commands exited 0:

```sh
node --test tests/workspace-paths.test.ts tests/workspace-tools.test.ts tests/review-diff.test.ts tests/sidebar*.test.ts tests/composer*.test.ts tests/input-history.test.ts tests/tocktutor-route.test.ts tests/desktop-settings-navigation.test.ts tests/launcher-workbench-navigation.test.ts tests/right-panel-layout.test.ts tests/request-trust.test.ts tests/surface.test.ts tests/plugin.test.ts tests/pinned-summary*.test.ts tests/terminal-panel-store.test.ts tests/terminal-protocol.test.ts tests/terminal-style.test.ts tests/smoke-client.test.ts
pnpm typecheck
pnpm build
git diff --check
```

115 tests passed, zero failed/skipped on this macOS run. All Git push tests target temporary local bare repositories; no external push occurred. Temporary repositories were removed in `finally`. No app, browser, or persistent server was launched.

Only `plugins/sidebar/src/git-workspace.ts` and the new `tests/workspace-paths.test.ts` are code/test changes from this follow-up. No dependency, runtime pin, UI, IPC, packaging, or composition changes. No commit or push. Proposed commit: `fix(sidebar): preserve workspace paths and configured push remotes`.

Browser/Electron/installed smokes, React Doctor, and the full repository suite were not rerun for this Host-only patch. Earlier browser evidence and React Doctor limitations above remain historical, not fresh evidence. CodeGraph was used for structural exploration; its final status reports pending index changes, so later structural queries should sync first. Re-review of the final patch found no additional material issue in the touched behavior. The existing oversized WorkspacePanel warning remains outside this bounded fix.

## Retention audit — 2026-09-19 03:43 UTC

Beads: `tockteam-7u5`. Continued the TockCoder snapshot review against the prior audit and preserved all existing uncommitted work. Reviewed Host/session authorization and Git mutations, review parsing and composer bridge, sidebar persistence/settings, composer history, terminal lifecycle, and the route/panel integration. Applied simplification, security/hardening, and performance references to the review and final patch.

### Fixed finding

**[P2] Remove evicted review comments from outgoing composer requests.** `ReviewCommentsService.add()` capped the visible/persisted list at 200, but the composer retained older request text, including requests parked under another session. Those invisible comments could still be sent as actionable code-change requests and had no remaining UI entry to remove them. The retention path now removes evicted IDs through the existing bridge removal operation before publishing the bounded list. No new dependency, storage schema, privilege, or composition change.

`node --test tests/review-comments.test.ts` first failed both scenarios: outgoing text still contained the evicted comment in the active session and after returning to a parked session. Both pass after the five-line repair. Tests exercise the public service and registered composer codec with fixture DSH observables and Storage, covering persisted/visible/outgoing agreement, reference count, session isolation, retained comments, and deleting all retained comments without leaving an invisible request.

### Fresh verification

All exited 0:

```sh
node --test tests/review-comments.test.ts tests/workspace-paths.test.ts tests/workspace-tools.test.ts tests/review-diff.test.ts tests/sidebar*.test.ts tests/composer*.test.ts tests/input-history.test.ts tests/tocktutor-route.test.ts tests/desktop-settings-navigation.test.ts tests/launcher-workbench-navigation.test.ts tests/right-panel-layout.test.ts tests/request-trust.test.ts tests/surface.test.ts tests/plugin.test.ts tests/pinned-summary*.test.ts tests/terminal-panel-store.test.ts tests/terminal-protocol.test.ts tests/terminal-style.test.ts tests/smoke-client.test.ts
node --test tests/tockcoder-panel.test.mjs
pnpm typecheck
pnpm build
git diff --check
```

117 focused tests plus one existing browser regression passed (118 total, zero failures/skips). Browser check verified `/tockcoder`, workspace/diff/directory selection, 1512×949 CSS pixels at DPR 2, 3024×1898 in-memory PNG, explicit dark theme, no skin, and no page/console errors. This browser test is regression evidence for the surrounding panels; the new retention behavior is proved through the service/codec tests rather than a live DSH composer submission. No screenshot was published. Chromium root PID/process group 78211 and the loopback server were cleaned up; subsequent `ps` and `pgrep` found no surviving root/group.

This run changed only `plugins/sidebar/src/client/review-comments.ts` and added `tests/review-comments.test.ts`, plus this report and the automation memory. No commit or push. No full repository suite, packaged Electron/installed smoke, or React Doctor rerun: the patch changes a framework-independent state service, not React components, Electron, IPC, or packaging. The prior WorkspacePanel complexity warning remains historical and unresolved. Verdict: the reproduced retention defect is fixed; focused checks pass, with the stated integration limits.

## Files navigation audit — 2026-09-19 03:58 UTC

Beads: `tockteam-2i4`. Preserved all earlier uncommitted changes. Revisited the TockCoder-owned sidebar Host/session/Git flow, Files and Browser adapters, review parser/composer state, preferences, composer history, terminal lifecycle, and route integration. Used CodeGraph after syncing its pending changes. Applied all three review references (simplification, security/hardening, performance), including a final review of this patch.

**[P2] Preserve path identity when navigating to a parent directory.** The Files adapter converted literal backslashes in absolute POSIX paths into separators. Navigating up from `/workspace/folder\name/child` therefore targeted `/workspace/folder/name`, which may be missing or a different directory. It also returned an empty string for a child of `/`, and drive-relative `C:` for a child of `C:\`. The browser-only path helper now preserves POSIX backslashes and keeps POSIX/Windows drive roots absolute while retaining Windows separator normalization. Prefix checks still reject sibling/outside paths; Host authorization and filesystem containment remain authoritative and unchanged. No new dependency, privilege, runtime pin, or composition change.

Two red/green cycles with `node --test tests/workspace-tools.test.ts` reproduced the literal-backslash and drive-root failures before their respective fixes. Unit cases cover text/binary file adapters and directory listings, POSIX root, trailing separators, Windows drive root, nested Windows paths, UNC shares, and sibling/outside/different-drive paths. The existing browser fixture now rejects nonexistent directory paths and verifies entering a literal-backslash directory, opening its child, then navigating up twice and stopping at the workspace root.

Fresh verification, all exit 0:

```sh
node --test tests/review-comments.test.ts tests/workspace-paths.test.ts tests/workspace-tools.test.ts tests/review-diff.test.ts tests/sidebar*.test.ts tests/composer*.test.ts tests/input-history.test.ts tests/tocktutor-route.test.ts tests/desktop-settings-navigation.test.ts tests/launcher-workbench-navigation.test.ts tests/right-panel-layout.test.ts tests/request-trust.test.ts tests/surface.test.ts tests/plugin.test.ts tests/pinned-summary*.test.ts tests/terminal-panel-store.test.ts tests/terminal-protocol.test.ts tests/terminal-style.test.ts tests/smoke-client.test.ts
node --test tests/tockcoder-panel.test.mjs
pnpm typecheck
pnpm build
git diff --check
```

119 focused tests plus one browser test passed (120 total). Browser proof: real sidebar plugin/React components, fixture DSH services and HTTP responses, `/tockcoder`, 1512×949 CSS pixels, DPR 2, 3024×1898 in-memory PNG, explicit dark theme, no skin, zero page/console errors. No screenshot published. Browser root/process group 88908 and loopback server were stopped in `finally`; independent `ps`/`pgrep` checks found no surviving root/group.

This run changes the parent-path helper in `plugins/sidebar/src/client/better-sidebar-api.ts`, adds two cases in `tests/workspace-tools.test.ts`, and extends `tests/fixtures/tockcoder-panel.ts` plus `tests/tockcoder-panel.test.mjs`. No React component changes. No commit/push. Proposed commit: `fix(sidebar): preserve parent paths in workspace file navigation`.

Limitations: Windows behavior is tested as portable path strings on macOS, not on a Windows Host. Browser HTTP/session services are fixtures, not live DSH. Full repository suite, Electron/installed smokes, and React Doctor were not rerun for this pure path-adapter change; the prior WorkspacePanel complexity warning remains unresolved. This is a review of TockCoder-owned integrations, not every pinned dependency. Verdict: the reproduced navigation defect is corrected with focused verification; no other new high-confidence finding from this pass.

## Ambiguous Git header audit — 2026-09-19 04:12 UTC

Beads: tockteam-sal. Reviewed TockCoder Host/session/Git authorization, preferences and tab persistence, review/composer state, history, files adapters, terminal lifecycle, route/launcher contracts, and the accumulated fixes. Applied all three review references: simplification, security/hardening, and performance. Preserved all prior edits.

Fixed one P2 parser issue with two demonstrated manifestations: filenames containing ` b/` are ambiguous in Git's unquoted `diff --git` header. A real rename-only patch incorrectly yielded `old b/file.md b/new` as its source path; a real binary patch reduced `assets b/file.bin` to `file.bin`. Rename metadata now supplies the authoritative source path, and equal old/new names are matched as a whole before the general header split. No dependencies or runtime boundaries changed.

Red/green command: `node --test tests/review-diff.test.ts`. Each new real-Git regression failed before its corresponding fix; final result 8/8 passed. Temporary repositories were removed in finally blocks. New production changes are restricted to `plugins/sidebar/src/client/review-diff.ts`; tests to `tests/review-diff.test.ts`.

Fresh verification (all exit 0):

- `node --test tests/sidebar.test.ts tests/sidebar-runtime-settings.test.ts tests/sidebar-browser-url.test.ts tests/workspace-tools.test.ts tests/workspace-paths.test.ts tests/review-diff.test.ts tests/review-comments.test.ts tests/input-history.test.ts tests/composer-input-history.test.ts tests/composer-history-bridge.test.ts tests/composer-history-dom.test.ts tests/composer-history-keyboard.test.ts tests/terminal-panel-store.test.ts tests/terminal-protocol.test.ts tests/terminal-style.test.ts`: 63 passed.
- `node --test tests/request-trust.test.ts tests/tocktutor-route.test.ts tests/desktop-settings-navigation.test.ts tests/surface.test.ts tests/settings-boundary.test.ts tests/plugin.test.ts`: 24 passed.
- `node --test tests/tockcoder-panel.test.mjs`: 1 passed. Existing regression uses real React panel code with DSH/HTTP fixtures. Verified route `/tockcoder`, Files view and selection/response isolation, 1512x949 CSS viewport, 2x scale, 3024x1898 PNG, explicit dark scheme, no skin, and zero console/page errors. Screenshot remained in memory; none published. Browser root/group 99826 and loopback server stopped; independent process-table check found no root, children, or process-group survivors.
- `pnpm typecheck`, `pnpm build`, `git diff --check`: passed.

Verdict: corrected for the reproduced parser cases; no other new actionable finding in this pass. Full repository, native Windows, Electron and installed smokes were not run for this pure browser parser patch. React Doctor was not rerun because no React implementation changed; previous WorkspacePanel warning remains. Browser regression verifies panel behavior, while the new filename cases are proven at the public parser boundary using real Git output. No commit, push, or external Git mutation.

## Settings revision recovery audit — 2026-09-19T04:27:44.108Z

Reviewed the existing TockCoder repairs plus sidebar persistence/settings, workspace Git authorization, file/browser adapters, review/composer state, terminal protocol, and route/launcher integration. Applied all three review references (simplification, security, performance) and re-reviewed the patch with each perspective. Preserved prior work.

Fixed P2: another window's settings update left SidebarRuntimeSettingsService permanently using the stale revision after a rejected save. The failure path now fetches authoritative preferences/revision before releasing the serialized queue. It retains the save error and never automatically retries the rejected patch. If refresh also fails, the last confirmed values remain. This also handles a server commit followed by a lost response.

Production change this run: plugins/sidebar/src/client/runtime-settings.ts, only the update() failure path. Three new tests in tests/sidebar-runtime-settings.test.ts cover revision conflicts, offline refresh failure, and a lost save response followed by a queued edit. The conflict regression failed first (revision 4 rather than 5), then passed after the fix.

Fresh verification, all exit 0:
- node --test tests/sidebar-runtime-settings.test.ts tests/sidebar.test.ts tests/sidebar-browser-url.test.ts tests/workspace-tools.test.ts tests/workspace-paths.test.ts tests/review-diff.test.ts tests/review-comments.test.ts tests/composer-input-history.test.ts tests/composer-history-bridge.test.ts tests/composer-history-keyboard.test.ts tests/composer-history-dom.test.ts tests/terminal-protocol.test.ts tests/terminal-panel-store.test.ts — 57 passed.
- node --test tests/tocktutor-route.test.ts tests/launcher-workbench-navigation.test.ts tests/right-panel-layout.test.ts tests/launcher-specialists.test.ts tests/launcher-integration.test.ts tests/web-trust.test.ts — 31 passed.
- pnpm typecheck; pnpm build; git diff --check.
- node /tmp/tockcoder-settings-conflict-proof.mjs — actual rendered SidebarSettingsRow and runtime service, isolated settings API fixture, Playwright CLI. Conflict leaves the attempted switch unchanged, refreshes the other setting, and explicit retry succeeds without losing that other setting. Also verifies keyboard, label, busy, failure, reset, reduced motion and narrow layout. First disposable harness run failed from rewritten imports before browser launch; corrected imports and reran successfully. Existing untracked proof script unchanged.

Browser proof: loopback fixture route /, settings content, 1512x949 CSS at 2x; both PNGs 3024x1898; canonical dark/no-skin verified, separate labeled light capture. Zero runtime/console errors. Evidence /var/folders/fv/18g6fp8n0xnbycsgy4zsj7f40000gn/T/sidebar-settings-proof-a1YhqY. No screenshots published. Root 11020 and observed processes 11053,11065,11106,11107,11108,11110,11111,11112 stopped; cleanup.json confirms no residue and closed server; independent ps confirmed root absent.

Limits: no real multi-window DSH server test (API is a revision-checking fixture), full repository suite, native Windows, Electron/installed smoke, or React Doctor rerun. This is a non-React state-service fix; previous WorkspacePanel complexity warning remains. No dependency/pin changes, commit or push. Beads tockteam-vvo. Verdict: fix correct within checked scope.


## Host trust and session authority audit — 2026-09-19T04:49:12.001Z

Beads: tockteam-95m. Snapshot review of TockCoder route/composition, workspace Git and Files adapters, upstream Host scope resolution, sidebar preferences/runtime settings, review/parser/composer, input history, and terminal state/protocol. Preserved all prior uncommitted work. Applied the simplification, security/hardening, and performance references, including re-review of this run's changes.

Fixed two material findings:

- [P1] Sidebar preference reads skipped the browser trust fence although they return persisted file paths and browser URLs. Moved the existing shared request check ahead of method dispatch in plugins/sidebar/src/preferences-server.ts. Real node:http regression first returned 200 for attacker Host/Origin instead of 403. Final regression covers DNS rebinding-shaped headers, mismatched/null origins, cross-site reads/writes, unchanged persisted data, local reads without Origin, and configured trusted hosts. Pinned DSH host-webserver delegates directly to route handlers; actual Web runtime confirms the fix.
- [P1] Better Sidebar sessionCwdOf accepted browser cwd before persisted session metadata and fell back to process.cwd when authority was absent. Added a narrowly anchored adaptation in scripts/better-sidebar-upstream-adapter.mjs; upstream submodule/pin unchanged. Host scope now resolves live or persisted session metadata only. Missing authority and failed persistence lookup return 403 without internal error text. tests/better-sidebar-session-scope.test.mjs compiles and mounts the actual adapted Host with staged dependencies and boundary fixtures; cold-session override reproduced red, then passed. Real Web smoke found a thrown not-found lookup returned 500; added that red regression and corrected it before the final successful smoke.

Verification, all fresh and exit 0:

- node --test tests/sidebar.test.ts tests/sidebar-preferences-http.test.ts tests/sidebar-runtime-settings.test.ts tests/sidebar-browser-url.test.ts tests/workspace-tools.test.ts tests/workspace-paths.test.ts tests/review-diff.test.ts tests/review-comments.test.ts tests/request-trust.test.ts tests/input-history.test.ts tests/composer-input-history.test.ts tests/composer-history-bridge.test.ts tests/composer-history-dom.test.ts tests/composer-history-keyboard.test.ts tests/terminal-protocol.test.ts tests/terminal-panel-store.test.ts tests/terminal-style.test.ts tests/surface.test.ts tests/profile.test.ts tests/web-profile.test.ts tests/better-sidebar-session-scope.test.mjs — 88 passed.
- pnpm typecheck; pnpm build; node scripts/stage-dsh.mjs --quick; git diff --check.
- node /tmp/tockcoder-web-security-proof.mjs — temporary derivative of scripts/smoke-web.mjs with detached process-group cleanup and new trust assertions. Fresh staged pinned DSH 0.1.2-rc.1 Web profile: 541 composition lines, actual preferences persistence and read denial, actual unknown-session denial for session.cwd/fs.tree/git.status, normal session/Files/Git, and real terminal PTY command execution. No model request or credential access needed for these Host capabilities.
- Runtime root/process groups 24163 (intermediate failing assertion) and 26126 (final pass) stopped by finally cleanup; independent pgrep verifies both absent. In-process HTTP fixture closes all connections/listener in finally. No screenshots published.

Limits: staged dependencies are required for the new .mjs integration test; cold/restored session metadata uses boundary fixtures, while the final Web check uses a real created session and real missing-session errors. No browser rendering, Electron/installed smoke, full repository suite, native Windows run, or React Doctor rerun for these Host-only repairs. Prior WorkspacePanel complexity warning remains; no new performance claim or dependency was introduced. An initial temporary proof syntax collision failed before launch and was corrected. No commit/push.

Verdict: these two repairs are correct within the verified Host scope; this is not a blanket certification of every transitive upstream package.

## Long tab title persistence audit — 2026-09-19 04:57 UTC

Applied the simplification, security/hardening, and performance references to the TockCoder snapshot: sidebar persistence and registration, workspace/Git boundaries, files/browser adapters, review parsing/composer bridge, history, terminal state/protocol, and route/profile/build composition. Preserved all previous uncommitted repairs and unrelated edits.

Fixed one new P2: opening a file whose name exceeds 240 characters stored that full name as its tab title, although the durable envelope rejects titles over 240 characters. Consequently the tab and subsequent sidebar preference writes failed validation. `DesktopSidebarService.openTab()` now applies the same 240-character presentation limit as `patchTab()`, after deduplication and before persistence. The full resource path and tab identity remain intact; descriptor-created tabs pass through the same boundary. No dependency, surface authority, or runtime composition change.

Red evidence: `node --test --test-name-pattern='opening long file titles' tests/sidebar.test.ts` failed because `parseSidebarPreferences(storage.value)` returned undefined. The new regression verifies the complete persisted envelope, restored title, exact resource, and subsequent width preference. The browser fixture now validates PUT envelopes and exercises clicking a 249-character filename, rendering file contents, and persisting its bounded title with the full path.

Fresh final verification (all exit 0):

- `node --test tests/sidebar.test.ts tests/sidebar-preferences-http.test.ts tests/sidebar-runtime-settings.test.ts tests/sidebar-browser-url.test.ts tests/workspace-tools.test.ts tests/workspace-paths.test.ts tests/review-diff.test.ts tests/review-comments.test.ts tests/input-history.test.ts tests/composer-input-history.test.ts tests/composer-history-bridge.test.ts tests/composer-history-dom.test.ts tests/composer-history-keyboard.test.ts tests/terminal-protocol.test.ts tests/terminal-panel-store.test.ts tests/terminal-style.test.ts tests/better-sidebar-session-scope.test.mjs` — 69 passed.
- `node --test tests/tocktutor-route.test.ts tests/surface.test.ts tests/web-profile.test.ts tests/profile.test.ts` — 25 passed.
- `node --test tests/tockcoder-panel.test.mjs` — 1 passed; actual sidebar plugin and React UI with DSH/HTTP fixtures. `/tockcoder`, Files/file-content mode, 1512×949 CSS, device scale 2, PNG 3024×1898, explicit dark color scheme, no skin, no runtime errors. Screenshot checked in memory only, not published. Browser root/process group 29833 stopped; independent ps/pgrep found no survivors; loopback server closed in finally.
- `pnpm typecheck`, `pnpm build`, `git diff --check` passed.

95 tests total. No full repository suite, real DSH file persistence smoke, native Windows, Electron/installed smoke, or React Doctor rerun for this one-line non-React state-service repair. Existing WorkspacePanel complexity warning remains. Re-reviewed the final change through all three references; no additional verified findings. Beads: tockteam-gev. No commit or push.

## Bundled Git workspace identity audit — 2026-09-19 05:14 UTC

Reviewed TockCoder Host/session authorization, Git operations, sidebar persistence/registration, review parsing and composer delivery, input history, terminal lifecycle, Files/browser adapters, and route/profile/build wiring. Applied all three review references (simplification, security/hardening, performance), including a final pass over the repair. Preserved previous uncommitted work.

Fixed P1: the pinned Better Sidebar Git helper still used `trim()` on `git rev-parse --show-toplevel`, bypassing the earlier TockTeam workspace-path repair. A session rooted at `project ` could read or stage files in sibling `project`. Added a fail-closed Git source adapter that removes only Git's final newline and wired it into the existing Host bundle build. The pinned upstream submodule, package IDs, composition, and dependencies remain unchanged. New files this run: `tests/better-sidebar-git-paths.test.mjs`; production edits: the adapter, its declaration, and `scripts/build.mjs`.

Red/green: `node --test tests/better-sidebar-git-paths.test.mjs` failed on the wrong root before adaptation and passed afterward. It uses real temporary repositories with paths ending in space, tab, LF and CR; verifies status, staging in the owning repository, and unchanged sibling indexes/worktrees.

Fresh verification, all exit 0:

- `node --test tests/better-sidebar-git-paths.test.mjs tests/better-sidebar-session-scope.test.mjs tests/workspace-paths.test.ts tests/workspace-tools.test.ts tests/sidebar.test.ts tests/sidebar-preferences-http.test.ts tests/sidebar-runtime-settings.test.ts tests/sidebar-browser-url.test.ts tests/review-comments.test.ts tests/review-diff.test.ts tests/input-history.test.ts tests/composer-input-history.test.ts tests/terminal-protocol.test.ts` — 56 passed.
- `node --test tests/composer-history-keyboard.test.ts tests/composer-history-bridge.test.ts tests/composer-history-dom.test.ts tests/terminal-panel-store.test.ts tests/tocktutor-route.test.ts tests/surface.test.ts tests/web-profile.test.ts tests/profile.test.ts` — 36 passed (92 total).
- `pnpm typecheck`, `pnpm build`, `node scripts/stage-dsh.mjs --quick`, `git diff --check`, and syntax checks for both changed build scripts passed.
- `node /tmp/tockcoder-web-git-path-proof.mjs` — real pinned DSH 0.1.2-rc.1 Web profile, fresh staged Host artifact, real session creation and authenticated HTTP. All four whitespace path cases preserved status/staging identity and sibling isolation. Also verified profile/client composition, preference trust, unknown-session rejection, normal Files/Git, and PTY execution. No model call was needed for these Host HTTP APIs.
- Root/process group 44169 stopped in finally; independent process/group listing found no survivors and no listener remained on port 58523. No browser or screenshot was produced.

Limits: POSIX filenames were exercised on macOS; Windows-native, full repository suite, Electron/installed smoke, browser rendering, and React Doctor were not rerun for this Host Git adapter repair. Prior WorkspacePanel complexity warning remains. No new performance claim. Verdict: repair correct within the verified Host scope. Beads: tockteam-d73. No commit or push.

## Literal Git filename audit — 2026-09-19T05:29:00.885Z

Reviewed TockCoder Host Git/session boundaries, sidebar preferences and runtime settings, review/composer/history, terminal lifecycle, Files/browser adapters, and route/profile/build integration. Applied simplification, security/hardening, and performance references, including a final repair review. Preserved all earlier changes.

Fixed P1: single-file Git actions interpreted filenames as pathspec patterns. For example, discarding [ab].txt also discarded edits in a.txt and b.txt. The existing build adapter now passes --literal-pathspecs to Git and fails closed if the upstream command seam changes. No upstream submodule, dependencies, public contracts, or UI source changed. This run edited only scripts/better-sidebar-upstream-adapter.mjs and tests/better-sidebar-git-paths.test.mjs, plus this report and automation memory.

Red/green command: node --test tests/better-sidebar-git-paths.test.mjs. All 12 pattern cases failed before the fix; all 14 tests passed afterward. Tests use real temporary repositories and cover diff/stage/unstage/discard for bracket, wildcard, and Git-magic filenames, sibling contents/index preservation, and all-file operations when the path is omitted.

Fresh final verification (exit 0):

- node --test tests/sidebar.test.ts tests/sidebar-runtime-settings.test.ts tests/sidebar-preferences-http.test.ts tests/workspace-tools.test.ts tests/workspace-paths.test.ts tests/better-sidebar-git-paths.test.mjs tests/better-sidebar-session-scope.test.mjs tests/review-diff.test.ts tests/review-comments.test.ts tests/composer-*.test.ts tests/sidebar-browser-url.test.ts tests/terminal-protocol.test.ts tests/terminal-panel-store.test.ts — 74 passed.
- node --test tests/profile.test.ts tests/web-profile.test.ts tests/tocktutor-route.test.ts — 23 passed (97 total).
- pnpm typecheck; pnpm build; node scripts/stage-dsh.mjs --quick; node --check scripts/better-sidebar-upstream-adapter.mjs; git diff --check.
- node /tmp/tockcoder-web-literal-proof.mjs — actual pinned DSH 0.1.2-rc.1 Web profile with freshly staged Host plugin; authenticated HTTP diff/stage/unstage/discard for all three filenames preserves unrelated files. Also checked previous exact-workspace paths, session authorization, preference trust, Files/Git, composition and PTY execution.

The first live smoke was inadvertently started before quick staging completed, used the previous artifact, and failed the new assertion. After staging completed, verified --literal-pathspecs in both built/staged artifacts and reran successfully. Both runtime roots/groups 57665 and 58416 stopped in finally; independent process inspection found no roots, direct children or group survivors, and listener 59609 was absent. No browser or screenshot was produced.

Limits: native Windows, full repository suite, browser rendering, Electron/installed smoke, and React Doctor were not rerun for this Host-only adapter repair. Previous WorkspacePanel complexity warning remains. No performance claim or new dependency. Verdict: repair correct within the verified Host scope. Beads tockteam-lbz. No commit or push.

## Branch selection safety audit — 2026-09-19T05:43:46.671Z

Applied all three review references (simplification, security/hardening, performance) to TockCoder Host Git/session boundaries, sidebar/preferences, review/composer, history, terminal and route/build integration. Preserved existing uncommitted edits; no dependency or pin changes.

Fixed P1: branch selection used git checkout and could silently restore a same-named tracked file when the selected branch had disappeared. Option-like input such as --detach also changed checkout mode. The owned Better Sidebar build adapter now maps branch checkout to git switch -- <branch>, retaining upstream source and exact file-discard behavior. The existing fail-closed build check now includes the branch seam.

New tests/better-sidebar-git-actions.test.mjs exercises the adapted module and real disposable Git repositories. RED confirmed lost unsaved content and detached HEAD. GREEN verifies both rejections and successful normal switching, preserving files/index state.

Fresh verification (all exit 0):
- node --test tests/better-sidebar-git-actions.test.mjs tests/better-sidebar-git-paths.test.mjs tests/better-sidebar-session-scope.test.mjs tests/workspace-paths.test.ts tests/workspace-tools.test.ts tests/sidebar.test.ts tests/sidebar-runtime-settings.test.ts tests/sidebar-preferences-http.test.ts tests/review-comments.test.ts tests/review-diff.test.ts tests/terminal-protocol.test.ts tests/terminal-panel-store.test.ts tests/composer-input-history.test.ts tests/input-history.test.ts tests/tocktutor-route.test.ts tests/right-panel-layout.test.ts tests/plugin.test.ts tests/profile.test.ts — 93 passed.
- pnpm typecheck; pnpm build; node scripts/stage-dsh.mjs --quick; syntax checks; git diff --check.
- node /tmp/tockcoder-web-branch-proof.mjs — actual pinned DSH 0.1.2-rc.1 Web profile and authenticated git.checkout requests. Invalid selections preserved working content and current branch; valid switching to feature and back succeeded. Existing preference trust/session scope/exact Git paths/literal filenames/Files/Git/PTY checks also passed.

Root/process group 69659 stopped in finally. Independent process-table and lsof checks confirmed no group survivors or listener on port 60863. No browser or screenshots. Full repository suite, browser UI, native Windows, Electron/installed smoke and React Doctor were not rerun for this Host-only change; the prior WorkspacePanel complexity warning remains. Reviewed repair verdict: correct within tested scope; no whole-repository correctness claim.

Beads: tockteam-zpv. No commit/push. This run changed only the adapter, new branch-action test and this report.


## Revision option and historical-path audit — 2026-09-19T06:02:46.213Z

Beads: tockteam-a3n. Preserved all previous edits; this run changes only scripts/better-sidebar-upstream-adapter.mjs and tests/better-sidebar-git-actions.test.mjs in code/tests. Snapshot review used simplification, security/hardening, and performance references. Revisited Host Git/session/request trust, history and composer state, review comments, browser URL/preferences, terminal state, route and profile/build integration, with prior-run evidence used as context rather than fresh proof.

### Findings repaired

- P1: commit-diff and file-at-revision inputs were parsed as git show options. A real-Git regression overwrote a sentinel with --output. Revert and cherry-pick likewise accepted --abort as a hash and discarded an active conflict. The pinned-source adapter now ends option parsing for all four actions; no upstream submodule changes. Trust boundary is authenticated browser payload -> Host Git argv; assets include files writable by the Host and in-progress conflict resolutions. This is an argv-option injection, not shell interpolation. Authentication/session fences remain intact.
- P2: actual Web API git.show passed absolute paths into Git revision syntax and returned null for existing historical content. Convert paths relative to the selected repository, accounting for the authoritative cwd's symlink spelling without requiring a deleted file to exist. Reject paths outside the repository. Tests cover relative and absolute paths, nested cwd, missing/deleted files, a symlinked workspace, canonical aliases, and normal revisions.

Red/green: node --test tests/better-sidebar-git-actions.test.mjs reproduced each option flaw before repair. The first actual Web smoke then exposed the historical absolute-path defect; a focused regression failed before the path conversion was completed. Final targeted file has 8 passing tests (including subtests).

Fresh verification (all exit 0):

- node --test tests/better-sidebar-git-actions.test.mjs tests/better-sidebar-git-paths.test.mjs tests/better-sidebar-session-scope.test.mjs tests/workspace-paths.test.ts tests/workspace-tools.test.ts tests/sidebar-preferences-http.test.ts tests/sidebar-runtime-settings.test.ts tests/sidebar.test.ts tests/review-comments.test.ts tests/review-diff.test.ts tests/input-history.test.ts tests/composer-history-bridge.test.ts tests/composer-history-dom.test.ts tests/composer-history-keyboard.test.ts tests/composer-input-history.test.ts tests/terminal-protocol.test.ts tests/terminal-panel-store.test.ts tests/sidebar-browser-url.test.ts tests/profile.test.ts tests/web-profile.test.ts tests/surface.test.ts tests/tocktutor-route.test.ts — 113 passed.
- pnpm typecheck; pnpm build; node scripts/stage-dsh.mjs --quick.
- node --check scripts/better-sidebar-upstream-adapter.mjs; git diff --check.
- node /tmp/tockcoder-web-revision-proof.mjs — actual pinned DSH 0.1.2-rc.1 Web runtime, authenticated HTTP validates option rejections, conflict preservation, working normal preview/read calls, prior branch/path/literal fixes, trust/session boundaries, Files/Git, and PTY command execution.

Runtime root/groups 79599 (first failed proof) and 84434 (successful final proof) stopped in finally; independent ps/pgrep confirmed absence and lsof confirmed port 62097 has no listener. No browser/screenshots launched. No full repository suite, native Windows run, Electron/installed smoke, or React Doctor rerun: production changes are Host-only. POSIX colon filename/symlink checks are platform-gated; existing WorkspacePanel complexity warning remains from earlier runs. No dependencies/pins changed, commit, push, or PR.

Re-review: all three reference perspectives applied to final changes; no performance improvement claimed. Verdict: repaired behavior is correct within the fresh unit/integration and actual Web coverage above.


## Explicit repository selection audit — 2026-09-19T06:14:02.753Z

Applied all three review references (simplification, security/hardening, performance), preserving all previous edits. Revisited Host Git/session and preferences boundaries, sidebar state, review/composer, files/browser and terminal lifecycle, with route/profile/composition checks.

Fixed [P1] silent repository fallback. An explicit unavailable repoRoot previously returned the first discovered repository, so a stale selection could stage/commit the wrong project. The existing pinned-source Git adapter now throws before running an operation when the explicit selection does not match. Omitted selections still choose the first discovered repository; valid explicit selections still work. No runtime pin, submodule, dependency, or composition changes.

Production edit this run: scripts/better-sidebar-upstream-adapter.mjs only. Regression added to tests/better-sidebar-git-actions.test.mjs. RED: node --test --test-name-pattern='unavailable repository selection' tests/better-sidebar-git-actions.test.mjs failed because pending.txt was staged in the first repository. GREEN: node --test tests/better-sidebar-git-actions.test.mjs passed 9 tests.

Fresh final checks:

- node --test tests/better-sidebar-git-actions.test.mjs tests/better-sidebar-git-paths.test.mjs tests/better-sidebar-session-scope.test.mjs tests/sidebar-preferences-http.test.ts tests/workspace-paths.test.ts tests/workspace-tools.test.ts tests/sidebar.test.ts tests/sidebar-runtime-settings.test.ts tests/review-diff.test.ts tests/review-comments.test.ts tests/input-history.test.ts tests/composer-history-bridge.test.ts tests/composer-history-dom.test.ts tests/composer-history-keyboard.test.ts tests/composer-input-history.test.ts tests/terminal-protocol.test.ts tests/terminal-panel-store.test.ts tests/sidebar-browser-url.test.ts — 89 passed.
- node --test tests/tocktutor-route.test.ts tests/surface.test.ts tests/web-profile.test.ts tests/profile.test.ts — 25 passed.
- pnpm typecheck; pnpm build; node scripts/stage-dsh.mjs --quick; node --check scripts/better-sidebar-upstream-adapter.mjs; git diff --check — all exit 0.
- node /tmp/tockcoder-web-repository-proof.mjs — actual pinned DSH 0.1.2-rc.1 Web profile, authenticated HTTP rejects invalid repository selections for stage/unstage/commit/checkout/status without changing files/index/history. Valid second-repository staging/unstaging and omitted default pass. Previous revision/branch/literal filename/exact path/trust/session/Files/Git/PTY smoke checks also pass.

The first runtime proof failed on its assumed error code: upstream wire.ts maps GitCommandError to internal/500, preserving its message. Corrected the harness to verify failed HTTP response, exact error message and unchanged repositories; production behavior did not change for this harness correction. Final runtime passed. Both root/groups 93457 and 93952 stopped in finally; independent ps found no survivors and lsof found no listener on final port 63139. Temporary profiles/repositories removed.

Verdict: correct for the repaired selection boundary. No browser/React/UI edits this run, so browser screenshots, React Doctor, Electron/installed smokes were not rerun; no full repository suite or native Windows run. The earlier WorkspacePanel complexity warning remains. No performance optimization claim. All previous uncommitted edits preserved; no commit/push. Beads tockteam-hs2.


## Unicode Git stream audit — 2026-09-19T06:29:18.173Z

Snapshot review revisited TockCoder Host/session/Git, preferences/settings, review/composer, history, Files/browser, terminal state and route/profile wiring. Applied the review skill's simplification, security/hardening and performance references. Preserved previous uncommitted repairs and user edits.

Fixed [P2] UTF-8 stream chunk corruption in the bundled Git adapter. Decoding each Buffer separately inserted replacement characters when Chinese/emoji bytes crossed output boundaries, corrupting historical content, patches and hook errors. The existing pinned-source adapter now uses Node stream setEncoding for stdout/stderr with fail-closed source seam checks. No pin, dependency or upstream submodule changes. Production edit: scripts/better-sidebar-upstream-adapter.mjs (stream handlers around lines 34–54); regression: tests/better-sidebar-git-actions.test.mjs.

RED: node --test --test-name-pattern='Git output preserves Unicode' tests/better-sidebar-git-actions.test.mjs failed for both real Git historical content and hook stderr. GREEN: node --test tests/better-sidebar-git-actions.test.mjs passed 12 tests, including exact 1.3 MB Unicode content, 100,000 patch lines, hook error preservation and unchanged staged work after hook rejection.

Fresh broad command (118 passed):
node --test tests/better-sidebar-git-actions.test.mjs tests/better-sidebar-git-paths.test.mjs tests/better-sidebar-session-scope.test.mjs tests/sidebar*.test.ts tests/workspace*.test.ts tests/review*.test.ts tests/input-history.test.ts tests/composer*.test.ts tests/terminal-protocol.test.ts tests/terminal-panel-store.test.ts tests/tocktutor-route.test.ts tests/launcher-specialists.test.ts tests/profile.test.ts tests/web-profile.test.ts

pnpm typecheck, pnpm build, node scripts/stage-dsh.mjs --quick, node --check scripts/better-sidebar-upstream-adapter.mjs, and git diff --check passed. Final narrow suite rerun passed after comment cleanup.

Actual pinned DSH 0.1.2-rc.1 Web proof: node /tmp/tockcoder-web-unicode-proof.mjs verified authenticated historical content and patches exactly, plus previous trust/session/repository/branch/literal-path/Files/Git/PTY checks. First attempt launched before staging completed and reproduced corruption in the old artifact; rerun after confirming both setEncoding calls in staged Host passed. Runtime groups 6447 and 7010 stopped; independent ps inspection found no roots, direct descendants or group members, and lsof found no listener at final port 64495. No browser or screenshots launched/published.

Verdict: correct within verified scope; no remaining new material finding. Full repository suite, native Windows, browser/Electron/installed smoke and React Doctor were not rerun for this Host-only stream repair. Previous WorkspacePanel complexity warning remains. Hook behavior uses a temporary local Git hook; no external remote operations. Beads tockteam-611 closed. All changes remain uncommitted/unpushed.


## Repository-relative Git path audit — 2026-09-19T08:31:46.203Z

Snapshot review of TockCoder Host/session/Git integration, sidebar persistence/settings, review parser and composer bridge, input history, terminal callbacks, file/browser views, route ownership and build/profile wiring. Applied all three mandatory review references: simplification, security/hardening, performance. Preserved prior uncommitted repairs.

### Fixed P1: nested sessions could discard the wrong file

When a repository contains both same.txt and nested/same.txt and the session cwd is nested, Git status reports same.txt relative to the repository. The bundled Host resolveGitPath preferred an existing session-relative file. Consequently git.diff and git.show returned nested/same.txt, and git.discard erased that file's edits while leaving the selected root file untouched. A selected repository inside a container had the same ambiguity.

Changed only scripts/better-sidebar-upstream-adapter.mjs in production: adaptBetterSidebarHost replaces the existence-dependent resolver with repository-relative resolution and a fail-closed upstream seam check. Explicit absolute paths retain their meaning. No upstream submodule, runtime pin, plugin metadata, trust policy or client component changes. The simpler resolver removes a filesystem probe and silent cwd fallback; no performance benchmark claim.

Extended tests/better-sidebar-session-scope.test.mjs using the real adapted Host route and real temporary Git repositories. All three original regression cases failed before the implementation. Final cases cover diff, history, discard, selected containers, absolute/nested paths, deleted historical paths, invalid selections, outside-repository mutation rejection and unchanged Files confinement. Fixture sessions and HTTP response objects are mocked in this focused suite; Git and Host routing are real. Initial selected-container extension needed canonical macOS temporary paths; corrected fixture uses realpath.

### Fresh verification

- node --test tests/better-sidebar-session-scope.test.mjs — 9/9 passed after RED failures for the original three cases.
- node --test tests/better-sidebar-*.test.mjs tests/sidebar*.test.ts tests/workspace*.test.ts tests/review*.test.ts tests/composer*.test.ts tests/input-history.test.ts tests/terminal-protocol.test.ts tests/terminal-panel-store.test.ts tests/surface.test.ts tests/profile.test.ts tests/web-profile.test.ts — 120/120 passed; /tmp/tockcoder-review-tests.log.
- pnpm typecheck and pnpm build — passed; logs /tmp/tockcoder-review-typecheck.log and /tmp/tockcoder-review-build.log.
- node scripts/stage-dsh.mjs --quick — exited 0 before smoke launch; confirmed the staged resolver contains the fix.
- node /tmp/tockcoder-web-nested-path-proof.mjs — exited 0 against actual pinned DSH 0.1.2-rc.1 Web surface. Authenticated HTTP verified exact diff/history/discard, absolute and deleted paths, Files denial, plus existing preference trust/session/Git/PTY regressions. /tmp/tockcoder-review-web.log.
- First smoke failed because the fixture had deleted the outside file before expecting Files 403 (missing file returns 400). Restored the fixture before the denial check; rerun passed without production changes.
- Runtime roots/process groups 37920 and 38048 independently verified absent; final loopback port 52927 has no listener. Temporary runtime directories removed. No browser or screenshots launched/published.
- node --check scripts/better-sidebar-upstream-adapter.mjs, git diff --check, and CodeGraph sync — passed.

Verdict: the scoped repair is correct against fresh Host/Git and real Web evidence. Full repository suite, native Windows, browser UI, Electron/installed smoke and React Doctor were not rerun for this Host-only change; previous WorkspacePanel complexity warning remains. No push or commit. Beads tockteam-d9r.


## File-save temporary ownership audit — 2026-09-19T08:45:14.741Z

Applied the simplification, security/hardening, and performance references. Revisited TockCoder Host workspace/Git/Files routes, source adapters, sidebar state/preferences, review/comments, composer history, terminal lifecycle, and profile/build wiring. Preserved prior uncommitted edits. No additional material finding established outside the repair below.

### Fixed P1: predictable save temporaries bypassed workspace containment

The bundled fs.write route wrote to a predictable destination-plus-PID path. A pre-existing symlink at that path redirected content into an outside-workspace file even though the destination passed authorization. Concurrent saves also shared the same temporary file. Only production edit this run: scripts/better-sidebar-upstream-adapter.mjs, adaptBetterSidebarHost. Each save now creates its own private mkdtemp directory beside the destination, writes with exclusive creation, atomically renames into place, and cleans its own directory in finally. The pinned upstream source remains unchanged and the adapter fails closed if its source seam changes.

Regression in tests/better-sidebar-session-scope.test.mjs reproduced the outside sentinel changing from private data to submitted content before the fix. The same test passes after the fix. Added real-filesystem route checks for 12 simultaneous saves (every response succeeds, final file is a whole submitted version), subsequent saves, and replacement failure preserving an existing directory and removing temporary state.

### Fresh verification

- RED then GREEN: node --test tests/better-sidebar-session-scope.test.mjs (12 tests green).
- node --test tests/better-sidebar-session-scope.test.mjs tests/better-sidebar-git-actions.test.mjs tests/better-sidebar-git-paths.test.mjs tests/sidebar.test.ts tests/sidebar-runtime-settings.test.ts tests/sidebar-preferences-http.test.ts tests/sidebar-browser-url.test.ts tests/workspace-tools.test.ts tests/workspace-paths.test.ts tests/review-diff.test.ts tests/review-comments.test.ts tests/terminal-protocol.test.ts tests/terminal-panel-store.test.ts — 84 passed.
- node --test tests/profile.test.ts tests/web-profile.test.ts tests/input-history.test.ts tests/composer-input-history.test.ts — 28 passed; combined 112 tests.
- pnpm typecheck; pnpm build; node scripts/stage-dsh.mjs --quick; node --check scripts/better-sidebar-upstream-adapter.mjs; git diff --check — passed. Staging completed before smoke launch.
- node /tmp/tockcoder-web-file-save-proof.mjs — actual pinned DSH 0.1.2-rc.1 Web profile and authenticated API, confirming planted temporary symlink isolation, 12 simultaneous full-content saves, failed replacement cleanup, and previous trust/session/Git/Files/PTY regressions.
- Runtime root/group 48793 stopped in finally; independent process-group, PID and direct-descendant checks found no survivors; port 54128 has no listener. No browser or screenshot capture.
- CodeGraph synced. Final change reviewed with all three references: bounded per-request temporary state, no new dependency or loop/composition changes, existing trust/path checks retained.

No full repository suite, native Windows, Electron/installed smoke or React Doctor rerun: this repair is Host-only. The previous WorkspacePanel complexity warning remains. Verdict: repaired behavior is correct based on focused and live API evidence; broader platform coverage is not claimed. Beads tockteam-k7bk closed. Changes remain uncommitted and unpushed.


## Atomic save permission review — 2026-09-19T08:58:07.363Z

Applied all three review references (simplification, security/hardening, performance) to TockCoder Host/files/Git boundaries and current integration/state repairs. Inspected profile/build wiring, workspace authority, file path guards, runtime settings/storage, composer history and terminal lifecycle; exercised the related regression suites. Preserved all earlier uncommitted changes.

Fixed **[P1] editor saves reset private/executable file permissions** in scripts/better-sidebar-upstream-adapter.mjs. The atomic replacement created a new inode using default permissions: a 0600 private file became 0644 and executable scripts lost their executable bits. The adapted Host now reads existing ordinary permission bits, writes in its private temporary directory, applies those bits before atomic rename, and propagates metadata failures other than a missing target. New files retain existing creation behavior. No new dependencies, runtime pin changes, or composition changes. ACLs, ownership and extended attributes are outside this permission-bit repair.

Regression in tests/better-sidebar-session-scope.test.mjs reproduced 0600 -> 0644 before implementation. GREEN verifies modes 0600, 0755, 0640 and 0751, exact saved content, prior concurrent-save/symlink-isolation/failure-cleanup regressions. The same suite also passed under umask 077, proving existing bits are restored despite a restrictive creation mask.

Fresh verification (all exit 0):
- node --test tests/better-sidebar-session-scope.test.mjs tests/better-sidebar-git-actions.test.mjs tests/better-sidebar-git-paths.test.mjs tests/sidebar-preferences-http.test.ts tests/workspace-paths.test.ts tests/workspace-tools.test.ts tests/sidebar.test.ts tests/sidebar-runtime-settings.test.ts tests/review-comments.test.ts tests/review-diff.test.ts tests/terminal-protocol.test.ts tests/sidebar-browser-url.test.ts — 83 passed.
- node --test tests/input-history.test.ts tests/composer-input-history.test.ts tests/composer-history-bridge.test.ts tests/composer-history-dom.test.ts tests/composer-history-keyboard.test.ts tests/profile.test.ts tests/web-profile.test.ts tests/tocktutor-route.test.ts tests/right-panel-layout.test.ts tests/terminal-panel-store.test.ts — 48 passed.
- umask 077; node --test tests/better-sidebar-session-scope.test.mjs — 13 passed (repeat under different mask).
- pnpm typecheck; pnpm build; node scripts/stage-dsh.mjs --quick; node --check scripts/better-sidebar-upstream-adapter.mjs; git diff --check.
- node /tmp/tockcoder-web-permissions-proof.mjs — actual pinned DSH 0.1.2-rc.1 Web profile; authenticated fs.write preserves all four modes. Existing save safety, trust/session, Files/Git and PTY checks pass. Runtime root/group 58454 stopped in finally; independent process listing found no group or direct-child survivors and lsof found no listener on port 55019.
- CodeGraph synced after edits.

Verdict: repaired behavior is correct on the tested macOS/POSIX path. Native Windows, full repository suite, browser rendering, Electron/installed smokes and React Doctor were not rerun: this change is confined to the Host atomic-write adapter with no React or Desktop/packaging behavior changes. Existing WorkspacePanel complexity warning remains. No screenshots or browser were launched. No commit or push. Beads: tockteam-31hb.


## Empty file save review — 2026-09-19T09:13:55.333Z

Continued the TockCoder snapshot audit using the simplification, security/hardening and performance references. Read previous automation evidence to avoid repeating repairs. Inspected sidebar/Host integration, preferences and runtime settings, Git adapters and path authority, file and browser views, review/composer history, terminal lifecycle, route/composition references, and relevant regression coverage. Preserved all prior uncommitted changes.

Fixed **[P2] file-save API rejects valid empty content**. The pinned Host used requireString for content, which rejects an empty string. Clearing an existing file or creating an empty file returned HTTP 400. The existing adaptBetterSidebarHost adapter now validates content by string type, including empty text. Path/session validation and atomic replacement remain in place; no upstream checkout, dependencies or runtime pins changed. Production edit this run is limited to scripts/better-sidebar-upstream-adapter.mjs; regression additions are in tests/better-sidebar-session-scope.test.mjs.

RED: node --test tests/better-sidebar-session-scope.test.mjs reproduced HTTP 400 with missing or invalid content before the fix. GREEN: the same command passed 15 tests, covering clearing existing content, creating a nested empty file, reading empty content back, rejecting missing/null/boolean/number/array/object payloads without modification, and existing save/path/session regressions.

Fresh verification (all exit 0):
- node --test tests/better-sidebar-session-scope.test.mjs tests/better-sidebar-git-paths.test.mjs tests/better-sidebar-git-actions.test.mjs tests/sidebar*.test.ts tests/workspace*.test.ts tests/review*.test.ts tests/input-history.test.ts tests/composer*.test.ts tests/terminal-protocol.test.ts tests/terminal-panel-store.test.ts tests/tocktutor-route.test.ts tests/web-profile.test.ts tests/surface.test.ts — 129 passed.
- pnpm typecheck; pnpm build; node scripts/stage-dsh.mjs --quick; node --check scripts/better-sidebar-upstream-adapter.mjs; git diff --check.
- node /tmp/tockcoder-web-empty-save-proof.mjs — actual pinned DSH 0.1.2-rc.1 Web runtime. Authenticated HTTP proves empty existing/new files, readback, existing permission retention and invalid-content rejection. Prior trust/session, concurrent-save/symlink safety, Git and PTY regressions also passed.
- Runtime root/group 73610 stopped in finally. Independent ps check found no root, group members or direct children; lsof confirmed port 56131 closed. No browser or screenshot launched.
- CodeGraph synced after edits; final git status inspected. Beads tockteam-c9n4 closed.

Verdict: the repaired API behavior is correct based on failing-before/passing-after tests and live runtime evidence. Full repository suite, browser rendering, native Windows, Electron/installed smokes and React Doctor were not rerun for this Host-only validation repair. Existing WorkspacePanel complexity warning remains. Changes remain uncommitted and unpushed.
