# TockTutor Desktop Adapter

`tockbot-note-desktop` is the Desktop-only Phase 11 adapter between TockTutor Workbench and TockTeam's native owners. Version 0.1.2 mounts:

- one caller-bound Host Remote for vault selection, reveal, note pop-outs, microphone permission, printing, and HTML/PDF export;
- one accessible contribution in Workbench's **Native Actions** seat; and
- one trusted-main dispatch loop for TockTutor menu and protocol requests.

TockTeam Desktop remains the native authority. Its isolated preload issues opaque, one-operation authorizations only to the current trusted main frame. The Host atomically claims each authorization to obtain main-derived window, runtime-session, and active-vault identity; browser input never supplies those facts. Runtime 0.1.2 remains the only vault filesystem authority, and Workbench 0.1.7 owns route, dirty-save, create, daily-note, capture, search, and ordinary protocol behavior.

## Native Actions

The Workbench contribution provides keyboard-native controls for:

- **Choose Vault**
- **Reveal Entry**
- **Open Pop-Out** and **Close Pop-Out**
- **Close All Pop-Outs**
- **Request Microphone**
- **Print Note**
- **Export HTML** and **Export PDF**

Controls are disabled without their required active vault/note. Completion is reported through a polite status region. Microphone handoff rechecks the exact source note and vault before requesting audio-only media, then releases the verification stream.

## Trust and Lifecycle

- Both Host and client refuse every surface except `tockTeamSurface.kind === 'desktop'`.
- Every native call uses an opaque authorization minted by `window.dshDesktop.tockTutor.authorize(operation)` and claimed by the injected `tockTeamDesktopCaller` owner.
- Browser payloads remain bounded and vault-relative. No absolute path, canonical path, Electron object, native handle, unrestricted IPC channel, source-tree primitive, or destination writer crosses the client boundary.
- The Host rechecks the exact active vault generation before and after every owner await. Bounded recovery ledgers prevent response loss from repeating reveal, activation, or pop-out close effects.
- Dispatch delivery keeps Desktop's private `deliveryId` attempt fence out of Workbench input and returns it only with exact completion. Response-loss retries reuse the same authorization or delivery fence.
- Unload cancels the trusted dispatch consumer, disposes the slot and Remote, aborts pending Host work, and closes pop-outs opened by this adapter.
- Desktop's print/export owner re-sanitizes bounded HTML and blocks network, local-file, blob, and unreviewed subresources.

## Composition

The package contributes one Host row through `cordis.patch.yml` and one real `window.__ModuleLoader__.load` client bundle. It belongs only in the TockTeam Desktop profile; Web and TUI must not contain or mount it.

Pinned release dependencies:

- `@tockteam/desktop >=0.1.11 <0.2.0`
- `@tockteam/tocktutor-workbench 0.1.7`
- `tockbot-note-runtime 0.1.2`
- DSH `0.1.1-rc.2` at revision `b150a551b8d465e31e418e1b2eaf5e79bbb7d28e`

## Verification

```sh
pnpm run typecheck
pnpm test
pnpm run build
pnpm pack
test ! -e .agents/skills
bd lint
git diff --check
git status --short --branch
```

Release acceptance additionally requires the fresh packed Loader lifecycle and a disposable real TockTeam Desktop run proving trusted-main success, ineligible-window rejection, dispatch completion/redelivery, pop-out cleanup, microphone denial/stale-note handling, and print/export isolation.
