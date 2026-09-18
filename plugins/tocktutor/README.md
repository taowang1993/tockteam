# TockTutor Plugin Workspace

This workspace owns the TockTutor aggregate bundle and its component plugins. Package names and versions remain compatibility contracts; only their source location moved from separate local repositories into TockTeam.

The workspace installs the exact published DSH version pinned by the repository. From the TockTeam root:

```sh
pnpm run install:tocktutor
pnpm run typecheck:tocktutor
pnpm run test:tocktutor
pnpm run build:tocktutor
```

TockTeam staging copies package outputs from `packages/*/lib` or `packages/*/dist`. Rebuild a changed package before staging.
