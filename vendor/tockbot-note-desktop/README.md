# TockTutor Desktop Composition Guard

`tockbot-note-desktop` is the installable Desktop-only DSH composition guard for Phase 11. It does not implement another native bridge. Immutable TockTeam Desktop 0.1.6 already owns dialogs, reveal transport, menu and protocol dispatch, pop-outs, microphone permission, print/export, restricted IPC, and trusted-window policy. Runtime 0.1.2 remains the only vault authority, and Workbench 0.1.4 remains the TockTutor route owner.

The single Host row waits for the complete upstream owner set and then requires `tockTeamSurface.kind === 'desktop'`. Its true DSH client bundle performs the same explicit surface check. Neither half registers a capability, imports Electron or filesystem APIs, accepts a path, or creates a Web/TUI fallback.

## Injected Owner Set

- `tockTeamSurface`
- `tockTeamDesktopPicker`
- `tockTeamDesktopDispatch`
- `tockTeamDesktopPopOut`
- `tockTeamDesktopMicrophone`
- `tockTeamDesktopPrintExport`
- `tockTeamDesktopVaultSelection`
- `tockTeamDesktopReveal`
- `noteVault`

## Residual Workbench Consumer Seam

Workbench 0.1.4 does not yet call the native owners. Do not expose them through a new DSH Remote: the current HTTP RPC trust fence binds an origin, while Desktop pop-outs share that origin, so it cannot prove that a request came from the current trusted main window.

The minimal upstream fix belongs in `@tockteam/desktop`, not this package:

1. Add a typed `tockTutor` facade to `@tockteam/desktop/client` and the existing isolated preload bridge.
2. Route each method through one Electron main IPC handler that derives, rather than accepts, the current main `webContents`, top-frame origin, runtime-child session, operation/request IDs, and active vault ID/generation.
3. Reject preview, pop-out, loading, destroyed, stale, file-origin, foreign-origin, and non-top-frame callers before contacting any owner.
4. Allow only bounded methods for vault activation, runtime-authorized reveal, dispatch subscription/completion, pop-out open/close, microphone permission, print, and HTML/PDF export. Renderer input stays vault-relative or opaque; no absolute path, canonical path, native handle, arbitrary channel, source-tree read, or destination write primitive crosses preload.
5. Tie pending calls, dispatch leases, permission grants, and opened pop-outs to the exact caller/runtime session and abort or settle them before window close, runtime replacement, provider loss, or plugin unload completes.

Acceptance requires real Electron tests for trusted-main success and negative preview/pop-out/loading/destroyed/file/foreign/subframe callers; renderer-forged identity rejection; stale window/session/vault generation; response-loss idempotence; unload cancellation and cleanup; mixed audio/video denial; print/export subresource rejection; and complete Web/TUI absence.
