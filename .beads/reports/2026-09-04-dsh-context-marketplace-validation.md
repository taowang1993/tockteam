# dsh-context Marketplace Validation

## Result

- Package: `dsh-context` `0.41.0`
- Exact revision: `3179715f57404b4429436685526674659b5e86e9`
- Result: **Blocked before preview; the raw repository revision is not installable.**
- TockTeam source/profile changes: none
- Live Marketplace/profile/credential mutations: none

## Reproduction

```sh
git -C /tmp/tockteam-dsh-context-audit rev-parse HEAD
# 3179715f57404b4429436685526674659b5e86e9

jq '{name,version,main,exports,scripts,peerDependencies,dependencies}' \
  /tmp/tockteam-dsh-context-audit/package.json

test -d /tmp/tockteam-dsh-context-audit/lib
# exits 1
```

The pinned manifest resolves the Host entry to `lib/index.js`, types to `lib/index.d.ts`, and the browser entry to `lib/client.js`. The checkout has no `lib/` directory. It declares `build: tsdown`, but no Marketplace-allowed lifecycle hook such as `prepare` or `prepack`.

TockTeam Marketplace intentionally forwards only the reviewed lifecycle keys `preinstall`, `install`, `postinstall`, `prepare`, and `prepack`. Candidate preparation therefore clones the raw source, runs no build, and reaches DSH add/load with missing exported files. That failure occurs before meaningful isolated preview or React-singleton verification.

## Authority and Recovery Assessment

Marketplace's lifecycle allowlist and prepare → pinned candidate → isolated preview → explicit apply flow are behaving as designed. Broadening the policy to execute arbitrary `build` scripts solely for this plugin would expand trusted Host-code execution and is not justified by this validation.

No apply was attempted, so current/previous Profile state was not changed and required no recovery. No source was vendored, no submodule or protected ID was added, and the plugin remains third-party.

## Reconsideration Gate

Retry the exact transaction only when upstream supplies either:

- a pinned prebuilt release containing every declared `lib/` export, or
- an explicit allowed lifecycle hook that reproducibly creates those exports.

A separate policy decision is required before changing Marketplace build authority. Do not patch or vendor the third-party source downstream.
