---
name: pennivo-update
description: Update and audit TockTeam's pinned @pennivo/mcp-server dependency and Pennivo-derived TockTutor contracts. Use this skill whenever work mentions updating Pennivo, @pennivo/mcp-server, the Pennivo MCP baseline, Pennivo tool changes, or reviewing a new Pennivo release for TockTeam.
---

# Pennivo Update Workflow

Update TockTeam's packaged Pennivo MCP child without importing Pennivo's application, filesystem authority, or agent loop. Review upstream changes from a temporary checkout, preserve TockTeam's stricter DSH and Desktop boundaries, and delete the checkout after verification.

## Read First

1. Read `AGENTS.md` and `.agents/references/tocktutor.md` completely.
2. Read `plugins/tocktutor/packages/tockteam-tocktutor-assistant/PENNIVO_PROVENANCE.md`.
3. Read [references/file-mapping.md](references/file-mapping.md) before classifying upstream changes.
4. Read the full source and tests for every TockTeam file you might edit.
5. Run repository commands with Node 24:

```sh
mise exec node@24 -- env -u PNPM_CONFIG_LOGLEVEL <command>
```

## Preserve the Current Boundary

- Pin one stable `X.Y.Z` package version exactly; do not ship a branch, prerelease, range, runtime download, or `npx` fallback.
- Launch only the installed `@pennivo/mcp-server` entry through the DSH subprocess service.
- Keep the child in its empty temporary workspace with its scrubbed environment, bounded JSON-RPC surface, timeouts, restart limit, and complete cleanup.
- Keep Pennivo `tools/call` unavailable. Use the child only for initialization and bounded `tools/list` verification.
- Route vault reads through TockTeam's DSH tools and `tockbot-note-runtime`.
- Stage writes as TockTeam proposals requiring explicit approval; never give Pennivo direct vault mutation authority.
- Keep TockTutor Desktop-only and preserve Electron, preload, picker, and native-path authority in TockTeam Desktop.
- Rebuild tracked `lib/`, `dist/`, and `plugins/tocktutor/build-manifest.json`; never hand-edit generated payloads.
- Add the smallest failing regression test before changing behavior.

## 1. Select and Confirm the Release

Derive the current baseline from the package manifest, confirm its reviewed tag and commit in `PENNIVO_PROVENANCE.md`, and set the requested stable tag explicitly:

```sh
ASSISTANT_MANIFEST="plugins/tocktutor/packages/tockteam-tocktutor-assistant/package.json"
OLD_VERSION="$(mise exec node@24 -- node -p \
  "JSON.parse(require('node:fs').readFileSync('${ASSISTANT_MANIFEST}', 'utf8')).dependencies['@pennivo/mcp-server']")"
OLD_TAG="v${OLD_VERSION}"
NEW_TAG="v1.5.0"
NEW_VERSION="${NEW_TAG#v}"
git ls-remote --tags https://github.com/Payaeb/pennivo.git \
  "refs/tags/${OLD_TAG}" "refs/tags/${NEW_TAG}"
mise exec node@24 -- npm view \
  "@pennivo/mcp-server@${NEW_VERSION}" version dist.integrity
```

Stop if the Git tag or published exact package is missing, if their versions disagree, or if the user requested an unstable source without explicitly accepting that release risk.

## 2. Create a Temporary Review Checkout

Create one shallow checkout outside the repository and retain its printed path until cleanup:

```sh
PENNIVO_TMP="$(mktemp -d "${TMPDIR:-/tmp}/tockteam-pennivo.XXXXXX")"
printf 'PENNIVO_TMP=%s\n' "$PENNIVO_TMP"
git -C "$PENNIVO_TMP" init -q
git -C "$PENNIVO_TMP" remote add origin https://github.com/Payaeb/pennivo.git
git -C "$PENNIVO_TMP" fetch --depth=1 origin \
  "refs/tags/${OLD_TAG}:refs/tags/${OLD_TAG}" \
  "refs/tags/${NEW_TAG}:refs/tags/${NEW_TAG}"
git -C "$PENNIVO_TMP" rev-parse "${NEW_TAG}^{commit}"
git -C "$PENNIVO_TMP" diff --name-only "${OLD_TAG}..${NEW_TAG}" | sort > \
  "$PENNIVO_TMP/changed-files.txt"
```

Do not add a Pennivo submodule, vendor directory, permanent checkout, or exit trap that removes the checkout before inspection finishes.

## 3. Classify Every Changed File

Create `$PENNIVO_TMP/checklist.md` and list every path from `changed-files.txt` exactly once. Use one disposition per path:

| Disposition                  | Required response                                                                                |
| ---------------------------- | ------------------------------------------------------------------------------------------------ |
| `MCP`                        | Inspect protocol, binary, arguments, transport, tool catalog, permissions, and lifecycle impact. |
| `Contract`                   | Inspect TockTeam adapters, schemas, parsers, result projections, and tests.                      |
| `Package`                    | Update exact pins, both lockfiles, licensing, staging, or packaged-consumer evidence.            |
| `Port`                       | Change TockTeam-owned behavior with a focused failing test first.                                |
| `Test/Tooling`               | Decide whether TockTeam's focused or release evidence must change.                               |
| `Docs`                       | Update provenance or the TockTutor reference when product behavior changed.                      |
| `Skip — App UI`              | Record why Pennivo application chrome does not belong in TockTutor.                              |
| `Skip — Accepted Divergence` | Record the exact TockTeam boundary that justifies divergence.                                    |

Read each `MCP`, `Contract`, `Package`, and `Port` file completely, including its relevant imports and tests. Do not use a skip disposition for a file you did not inspect.

## 4. Trace Relevant Changes into TockTeam

Use the mapping reference to check only the affected seams. Always inspect these release anchors:

- `plugins/tocktutor/packages/tockteam-tocktutor-assistant/package.json`
- `plugins/tocktutor/packages/tockteam-tocktutor-assistant/src/pennivo-child.ts`
- `plugins/tocktutor/packages/tockteam-tocktutor-assistant/src/read-tools.ts`
- `plugins/tocktutor/packages/tockteam-tocktutor-assistant/src/read-tool-registration.ts`
- `plugins/tocktutor/packages/tockteam-tocktutor-assistant/src/write-tool-registration.ts`
- `plugins/tocktutor/packages/tockteam-tocktutor-assistant/tests/pennivo-child.test.ts`
- `plugins/tocktutor/packages/tockteam-tocktutor-assistant/tests/read-tools.test.ts`
- `plugins/tocktutor/packages/tockteam-tocktutor-assistant/PENNIVO_PROVENANCE.md`
- `plugins/tocktutor/packages/tockteam-tocktutor-assistant/THIRD_PARTY_NOTICES/Pennivo.txt`
- root and TockTutor `package.json`/`pnpm-lock.yaml` files

Compare the new upstream tool names and schemas with `READ_TOOLS` from the installed package and TockTeam's reviewed read catalog. Keep unsupported tools unavailable instead of silently widening authority.

## 5. Update Exact Pins and Reviewed Behavior

Update the TockTutor package pin and its lockfile:

```sh
mise exec node@24 -- env -u PNPM_CONFIG_LOGLEVEL \
  pnpm -C plugins/tocktutor --filter @tockteam/tocktutor-assistant \
  add --save-exact "@pennivo/mcp-server=${NEW_VERSION}"
```

Update the root development pin and root lockfile used by staging and packaging:

```sh
mise exec node@24 -- env -u PNPM_CONFIG_LOGLEVEL \
  pnpm add --save-dev --save-exact "@pennivo/mcp-server=${NEW_VERSION}"
```

Then:

1. Update `PENNIVO_VERSION` and protocol expectations only when the reviewed release requires it.
2. Update fake server versions and exact-pin assertions in focused tests.
3. Update `PENNIVO_PROVENANCE.md` with the package, tag, commit, license, reviewed change count, affected contracts, and intentional divergences.
4. Update `THIRD_PARTY_NOTICES/Pennivo.txt` only from the reviewed release's license and notices.
5. Port only checklist-backed behavior; preserve stricter TockTeam validation and approval semantics.

Reject unrelated lockfile drift before continuing.

## 6. Verify the Dependency and Package

Run the focused package first:

```sh
mise exec node@24 -- env -u PNPM_CONFIG_LOGLEVEL \
  pnpm -C plugins/tocktutor --filter @tockteam/tocktutor-assistant test
plugins/tocktutor/packages/tockteam-tocktutor-assistant/node_modules/.bin/pennivo-mcp --version
```

Confirm that the package tests exercise the real installed child, exact version handshake, reviewed tool catalog, packed Loader consumer, environment scrubbing, bounded protocol, restart/stop behavior, staged writes, and provenance notice.

Run dependency audits and workspace gates:

```sh
mise exec node@24 -- env -u PNPM_CONFIG_LOGLEVEL pnpm audit --prod --audit-level high
mise exec node@24 -- env -u PNPM_CONFIG_LOGLEVEL pnpm -C plugins/tocktutor audit --prod --audit-level high
mise exec node@24 -- env -u PNPM_CONFIG_LOGLEVEL pnpm run typecheck:tocktutor
mise exec node@24 -- env -u PNPM_CONFIG_LOGLEVEL pnpm run test:tocktutor
mise exec node@24 -- env -u PNPM_CONFIG_LOGLEVEL pnpm run build:tocktutor
mise exec node@24 -- node scripts/tocktutor-build-manifest.mjs
mise exec node@24 -- env -u PNPM_CONFIG_LOGLEVEL pnpm run typecheck
mise exec node@24 -- env -u PNPM_CONFIG_LOGLEVEL pnpm test
mise exec node@24 -- env -u PNPM_CONFIG_LOGLEVEL pnpm run build
```

Run staging and real runtime verification because the executable dependency crosses the packaged-process boundary:

```sh
mise exec node@24 -- env -u PNPM_CONFIG_LOGLEVEL pnpm run build:dsh
mise exec node@24 -- env -u PNPM_CONFIG_LOGLEVEL pnpm run stage:dsh
mise exec node@24 -- env -u PNPM_CONFIG_LOGLEVEL pnpm run smoke:runtime
```

Run `smoke:web` only if profile composition or browser-client behavior changed. Run the applicable packaged Desktop smoke when staging, executable resolution, or release packaging changed.

## 7. Finish and Clean Up

Before committing:

1. Compare `git diff -- package.json pnpm-lock.yaml plugins/tocktutor` and remove unrelated dependency drift.
2. Verify that every upstream changed path appears once in `$PENNIVO_TMP/checklist.md`.
3. Verify that provenance records the new tag and commit plus every accepted divergence.
4. Verify `git diff --check` and inspect `git status --short --branch`.
5. Remove the exact temporary checkout only after evidence is recorded:

```sh
rm -rf -- "$PENNIVO_TMP"
```

6. Commit source, tests, generated payloads, manifest, provenance, and dependency metadata in small coherent commits. Push only with explicit authorization.

## Completion Criteria

Complete the update only when both manifests and lockfiles pin the same reviewed stable package, the child accepts the exact reviewed server version, the tool catalog has not widened silently, packed and staged runtime checks pass, provenance and notices are current, the temporary checkout is gone, and the working tree contains only intended changes.
