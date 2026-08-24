# Pennivo Provenance

- Package: `@pennivo/mcp-server@1.4.0`
- Upstream: <https://github.com/Payaeb/pennivo>
- Reviewed tag: `v1.4.0`
- Reviewed commit: `eba774ce4e0422c7fcd61a16e4fd4da2dab59d6c`
- License: MIT

The packaged child is launched only from this installed dependency. Runtime downloads are forbidden. TockTutor does not vendor or embed the Pennivo application and does not claim broader Pennivo parity.

The Host gives the child a private scratch workspace and limits its protocol surface to `initialize`, `notifications/initialized`, and bounded `tools/list` catalog verification. There is intentionally no public or internal Pennivo `tools/call` path: Pennivo's native calls would operate on its filesystem workspace and would create a second vault authority. Vault reads instead route through explicit DSH tools backed by `tockbot-note-runtime`; write calls become Host-owned staged proposals. The child never receives the active vault root, provider credentials, filesystem handles, or direct vault mutation authority.
