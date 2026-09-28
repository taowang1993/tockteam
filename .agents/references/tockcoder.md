# TockCoder Implementation

TockCoder is the coding workspace at `/tockcoder` in TockTeam Desktop and TockTeam Web. It composes the pinned DSH conversation, workspace, and session services with TockTeam's Files/Review panel, terminal dock, and pinned summary. It is not another agent loop, session database, or plugin loader. The legacy `/` entrance canonicalizes to `/tockcoder`.

The runtime contract is the revision in `dsh-source.json` (`0.1.2-rc.1` at this review). Read that pin and its declarations before changing adapters; older DSH service shapes are not compatible merely because a local TypeScript interface accepts them.

## Ownership

| Owner | Responsibility |
| --- | --- |
| Pinned DSH | Agent execution, session persistence and event windows, workspace records, composer input, chat projection, layout, locale, theme, Profile and Loader |
| `src/client.ts` | Desktop branding and dispatch from the restricted preload bridge into browser services; no Host filesystem authority |
| `plugins/sidebar/src/client/plugin.tsx` | App rail and route integration, workspace/Review/Files composition, input history, service registration and lifecycle |
| `plugins/sidebar/src/client/sidebar-service.ts`, `SideToolsPanel.tsx` | Extensible tab/viewer registry, per-session tabs, activation, restoration and preference saves |
| `plugins/sidebar/src/client/runtime-settings.ts` | Revision-guarded Better Sidebar settings load/update; keeps the upstream Host settings separate from `sidebar.json` |
| `plugins/sidebar/src/client/better-sidebar-api.ts` | Typed browser adapter for Better Sidebar requests and platform-aware file navigation/interception paths |
| `plugins/sidebar/src/client/review-diff.ts`, `review-comments.ts` | Commit-patch parsing, line-addressable review, persisted comments and composer-chip delivery |
| `plugins/sidebar/src/index.ts`, `git-workspace.ts`, `preferences-server.ts` | TockTeam workspace facts, branch creation/push, and durable sidebar preferences |
| `upstream/DSH-better-sidebar/src/` | Pinned Host implementation for Files, Git, PTY, history and commit patches |
| `scripts/better-sidebar-upstream-adapter.mjs` | Checked downstream transformations of that Host; do not edit the upstream submodule |
| `plugins/panel-controls/src/terminal/` | Session-scoped terminal dock, xterm rendering, browser socket protocol and tab lifecycle |
| `plugins/pinned-summary/src/client.ts` | Read-only summary projection and layout-reserving summary panel |
| `plugins/skins/src/client/tailwind.css`, `plugins/ui/` | Shared semantic styling and React controls; no feature-local palette or component system |

## Composition and Surface Boundaries

`scripts/build.mjs` bundles the adapted upstream Host as `@tockteam/better-sidebar-runtime` and builds the separate first-party Host/client entries. Desktop's `cordis.patch.yml`, Web's `web/cordis.patch.yml`, package `dsh.client.inject` metadata, and `src/profile.ts` own composition. `scripts/stage-dsh.mjs` assembles the pinned runtime and built bundles; source edits alone do not update staged code.

Both Desktop and Web include Better Sidebar, sidebar, panel controls and pinned summary. They consume `plugins/shared/surface.ts`; DSH owns `ctx.web`. Only Desktop has `window.dshDesktop`, native menus, pickers, draggable titlebar/window controls, TockLauncher, marketplace, the embedded Browser tab and the TockTutor route implementation. Web does not register the Browser tab or intercept external links into a webview; it must not fabricate those capabilities. TUI retains its pinned renderer and does not mount TockCoder's browser plugins.

TockCoder and TockTutor share route coordination through `plugins/sidebar/src/client/tocktutor-route.ts`. Route changes preserve remembered TockTutor locations and keep hidden terminal/conversation controls from taking editor focus.

## Pinned Runtime Contracts

- `sessions.list` owns current selection and session summaries. `sessions.scope(id)` supplies the agent-scoped context; `sessions.binding(id).session` exposes lifecycle state, not rendered messages or running-tool lists.
- `workspaces.create({ path })` creates/adopts a workspace. **`uiWorkspace.startSession(workspaceId?)`** owns interactive session creation and navigation. Both Desktop menu/path dispatch and sidebar actions must use that owner, not the removed `workspaces.startSession` method.
- `uiConversation.binding(id).target('chat')` owns the rendered chat projection. Background processes come from its `legacy.runningCalls`; the pinned summary also consumes this target. Do not read those fields from the session lifecycle snapshot.
- `conversation.input.for(sessionScope)` owns each session's composer. Input-history navigation and review comments must not rewrite another session's draft.
- `sessions.binding(id).eventSource` supplies the durable event window. `composer-input-history.ts` selects durable user-source text messages; assistant messages and transient input are not submitted history.

These dependencies must appear in both Cordis service injection and the owning browser package graph. Local structural interfaces describe the narrow consumed face; they do not verify an upstream API migration by themselves.

## Workspace, Files and Review

The sidebar registry supplies Files, Review and Side Tools, with file viewers selected by priority/type and persisted tabs restored per session. HTML previews use a sandboxed `srcDoc` iframe; binary files offer the surface-owned external opener. The Desktop Browser tab uses the hardened Electron webview, not a Web-surface substitute. Side Chat forks the selected DSH session, or starts a new session through `uiWorkspace` when none is selected. Async workspace, diff and directory results remain attached to the selection that requested them; late responses cannot replace a newer workspace or file.

The `workspaces.openPath` browser interception is preference-controlled and only opens an active-workspace file in the panel. Its platform-aware path check preserves literal POSIX backslashes and rejects parent traversal; otherwise it calls the original DSH opener. This browser decision is not filesystem authorization: Better Sidebar still validates every requested file against the Host session. Desktop can also intercept ordinary external HTTP(S) link clicks into its Browser tab when enabled.

Review combines status, staged/unstaged diffs, commit history, commit patches, branch operations and running calls. While visible it refreshes every four seconds and on window focus. The display bounds changes to 200 entries, history to 30 commits and each rendered commit file to 400 diff lines; it does not silently assert that these are all repository changes. Failed branch creation keeps the typed name for retry, and a successful Git action does not hide a subsequent refresh error. A partially staged file has separate staged and unstaged entries. Patch parsing preserves quoted/escaped Unicode names, rename paths, binary entries and old/new line numbers. Repository identity and filenames must preserve literal POSIX backslashes and trailing whitespace.

Comments are scoped to the active session/workspace/branch and retained up to 200 entries. One `tockteam-review` reference represents the selected comments in the composer:

1. Format the repository, branch, commit, location and comment text into a review request.
2. Insert/update the reference through agent-scoped `slash/input-insert-reference` events. RC.1 edits use detect-coordinate spans, where each reference occupies one character; reported occurrence offsets instead refer to clipboard text. Convert coordinates before replacing or removing a chip.
3. Preserve unrelated text and references; removing one comment updates the same chip rather than duplicating the request.
4. A cleared composer is only a pending delivery. Retire comments after a newer durable user message contains that request, including when it arrives while another session is selected. Failed sends that restore the reference retain comments for retry.

## Host Authority and HTTP Boundaries

| Endpoint | Owner and authority |
| --- | --- |
| `/sidebar/api/<method>` | Adapted Better Sidebar Host: Files, Git, revision-guarded `settings.get`/`settings.update` and related operations |
| `/sidebar/ws/terminal` | Same Host's session/tab-scoped PTY connection |
| `/tockteam/workspace` | TockTeam workspace facts and mutations; requested canonical cwd must equal the live Host session's cwd |
| `/tockteam/sidebar/preferences` | Validated, bounded sidebar preference envelope under the surface data root |

Host/origin checks, body limits, path validation and session authorization remain server-side. Browser cwd values are hints, not authority. Better Sidebar resolves the live Host session or its persisted metadata; missing/invalid session workspace authority fails closed rather than falling back to browser input or process cwd. The TockTeam workspace endpoint deliberately requires a live Host session.

The downstream adapter additionally preserves these boundaries:

- Files containment follows real filesystem targets and platform separators. On POSIX, a backslash is a filename byte, not a directory separator.
- Git status paths resolve in the selected repository's namespace, including deleted files. A stale explicit repository selection fails instead of mutating a fallback repository.
- Git filenames use literal pathspecs; branches/revisions cannot become command options or sequencer commands. Git output decoding preserves Unicode across stream chunks.
- File saves accept empty content, use a private temporary directory and atomic replacement, preserve existing access/executable bits, and clean up on failure. Predictable sibling temporary files must not follow planted symlinks.
- The upstream external-open handler is removed. Opening outside the panel uses the existing surface-owned workspace capability rather than introducing a second launcher.

These checks do not sandbox trusted plugins or Git hooks. Plugins, configuration, and allowed native processes retain their documented Host trust model.

## Terminal and Summary Lifecycle

Terminal UI state is keyed by DSH session. The dock mounts xterm in the active conversation column; switching sessions parks sockets/PTYs instead of killing a shell, while closing a tab requests termination. Plugin unload releases mounts, listeners and sockets; Host disposal terminates its PTYs.

The terminal endpoint carries the session and tab identity. Resize/park/close messages are controls, text frames are PTY output, and binary `tockteam-terminal-exit` frames carry validated exit codes. Shell output that looks like JSON must never be interpreted as a trusted exit notification.

Pinned summary prefers the latest usable compaction summary, then assistant text. It exposes explicit loading/running/waiting/blank/error states, limits the collapsed preview, renders a restricted safe rich-text subset, and reserves content space instead of covering the conversation. It follows replaced bindings and releases old subscriptions.

## Persistence and Compatibility

- Sidebar tabs, viewer settings and width persist in `<surface data root>/sidebar.json`, with migration from `desktop-sidebar.json`. Validation bounds session/tab counts; state belongs to the active session even during startup or an in-flight save.
- Better Sidebar runtime settings (`agentTerminalTools`, `bottomPanelAutoTerminal`, `interceptOpenPath`, `browserInterceptLinks`) use its Host settings service and revision-guarded updates, not `sidebar.json`. Missing upstream fields keep their defaults; conflicting or failed saves refresh the confirmed values instead of blindly replaying the edit.
- Review comments use browser storage key `tockteam.sidebar.review-comments.v1`, migrating the older `tockteam.desktop-sidebar.review-comments.v1` key. A failed write, including during migration, keeps already-readable comments in memory; an unreadable store cannot be recovered. Browser storage is not Host durability.
- Terminal preferences use the session-scoped `tockteam-desktop.terminal-panel` key family with legacy migration. Pinned-summary visibility retains `tockteam-desktop.pinned-summary.open`.
- Submitted input history derives from DSH's durable event window, with bounded in-memory navigation and older-page loading, not a second transcript store.

Keep internal package IDs, profile names, data roots and legacy keys stable when changing visible names.

## Verification

Focused non-GUI checks:

```sh
node --test tests/tockcoder-navigation.test.ts tests/sidebar*.test.ts tests/workspace*.test.ts tests/review*.test.ts tests/composer*.test.ts tests/input-history.test.ts tests/terminal*.test.ts tests/pinned-summary*.test.ts tests/right-panel-layout.test.ts
node --test tests/better-sidebar-git-actions.test.mjs tests/better-sidebar-git-paths.test.mjs tests/better-sidebar-session-scope.test.mjs
pnpm run typecheck
pnpm test
pnpm run build
```

The root `pnpm test` glob includes `.test.ts`, not the Better Sidebar `.test.mjs` files; run the Host checks explicitly.

For the rendered component regression, launch a disposable generic Electron window through `extended_display` on a non-main display, then pass only its returned owned CDP endpoint:

```sh
TOCKCODER_TEST_CDP_URL=<owned-loopback-endpoint> node --test tests/tockcoder-panel.test.mjs
```

The harness does not launch a browser and skips explicitly without that endpoint. It checks session navigation, running-call updates, stale responses, partially staged files, literal backslashes, long filenames, exact 1512 × 949 CSS geometry at 2×, PNG geometry and runtime errors. The caller must stop the guarded Electron instance and verify its entire process tree has stopped.

A real Desktop check must also use the guarded launch path, isolated application data, mock Keychain and the built/staged runtime. Use the built-in dark theme with no skin for the baseline. Record separately which behavior uses real Host services, a controlled fixture, or model credentials. Component tests and comment-chip manipulation do not prove a successful paid/model-backed submission.
