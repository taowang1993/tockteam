# Pennivo Update File Mapping

Use this routing table after generating the complete upstream changed-file list. Inspect an unmapped file before deciding whether to add a durable row here or record one release-specific checklist disposition.

## MCP Server and Process Boundary

| Pennivo upstream                       | TockTeam counterpart                                                                                                        |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `packages/mcp-server/package.json`     | `plugins/tocktutor/packages/tockteam-tocktutor-assistant/package.json`, both lockfiles, root `package.json`                 |
| MCP binary entry and CLI parsing       | `src/pennivo-child.ts` executable resolution and `--workspace` arguments; `tests/pennivo-child.test.ts`; packed Loader test |
| MCP stdio transport and initialization | `src/pennivo-child.ts` protocol version, framing, limits, request tracking, version handshake, stop/restart lifecycle       |
| MCP tool registry and `tools/list`     | `src/pennivo-child.ts`, `src/read-tools.ts`, `tests/read-tools.test.ts`, `tests/pennivo-child.test.ts`                      |
| MCP permissions or workspace handling  | Empty child scratch workspace, scrubbed environment, absence of `tools/call`, DSH subprocess runtime, staged-write boundary |
| MCP package exports or files           | `resolvePennivoArgv()`, packed Loader test, `scripts/stage-dsh.mjs`, package `files`, build manifest                        |

Treat any upstream `tools/call`, filesystem-root, environment, network, credential, or write-capability change as a security-boundary review. Preserve TockTeam's narrower behavior unless the user explicitly approves a wider product contract.

## Tool Contracts and Note Semantics

| Pennivo upstream                     | TockTeam counterpart                                                                                   |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| read-tool names and schemas          | `src/read-tools.ts`, `src/read-tool-registration.ts`, `src/turn-bindings.ts`, matching assistant tests |
| write-tool names and schemas         | `src/write-tool-registration.ts`, `src/proposals.ts`, `src/approval.ts`, proposal and approval tests   |
| file listing and workspace semantics | `src/read-tools.ts`, `tockbot-note-runtime/src/index.ts`, runtime tests                                |
| Markdown read behavior               | `src/read-tools.ts`, `tockbot-note-vault/inspection.js`, runtime and read-tool tests                   |
| search behavior                      | `src/read-tools.ts`, `tockbot-note-vault/inspection.js`, search and vault tests                        |
| backlinks and link syntax            | `src/read-tools.ts`, `tockbot-note-vault/inspection.js`, backlink and vault tests                      |
| outline behavior                     | `src/read-tools.ts`, `tockbot-note-vault/inspection.js`, outline and vault tests                       |
| snapshots or trash contracts         | `src/read-tools.ts`, `tockbot-note-runtime/src/index.ts`, snapshot/trash tests                         |

Do not port an upstream core behavior mechanically. First confirm that TockTeam exposes the same contract, then preserve TockTeam's vault-generation checks, path confinement, result bounds, redaction, and abort propagation.

## Assistant Ownership and Approval

| Upstream concern        | TockTeam owner                                                     |
| ----------------------- | ------------------------------------------------------------------ |
| child instance identity | `src/pennivo-child.ts`, `src/index.ts`                             |
| model-turn tool scope   | `src/turn-bindings.ts`, `src/production-turns.ts`                  |
| runtime-backed reads    | `src/read-tools.ts`, `src/read-tool-registration.ts`               |
| proposed writes         | `src/write-tool-registration.ts`, `src/proposals.ts`               |
| approval and mutation   | `src/approval.ts`, `src/proposal-state.ts`, `tockbot-note-runtime` |
| browser review UI       | `src/assistant-panel.tsx`, `src/remote.ts`, `src/remote-types.ts`  |

Keep these TockTeam-owned layers independent of Pennivo's application architecture. Review upstream changes for contract implications, not as a reason to replace DSH composition or TockTeam approval.

## Package, License, and Release Evidence

| Change                  | Update or verify                                                                                         |
| ----------------------- | -------------------------------------------------------------------------------------------------------- |
| exact package version   | assistant `package.json`, root `package.json`, `plugins/tocktutor/pnpm-lock.yaml`, root `pnpm-lock.yaml` |
| expected server version | `src/pennivo-child.ts`, `tests/pennivo-child.test.ts`                                                    |
| upstream tag or commit  | `PENNIVO_PROVENANCE.md`                                                                                  |
| license or notices      | `THIRD_PARTY_NOTICES/Pennivo.txt`, package `files`, provenance test                                      |
| built source            | assistant `lib/`, `plugins/tocktutor/build-manifest.json`                                                |
| packaged runtime        | packed Loader test, `scripts/stage-dsh.mjs`, `stage:dsh`, `smoke:runtime`                                |

## Default Dispositions

| Upstream area                       | Default disposition          | Action                                                                             |
| ----------------------------------- | ---------------------------- | ---------------------------------------------------------------------------------- |
| `packages/mcp-server/**`            | `MCP`                        | Inspect every changed file and trace protocol, tool, package, or security effects. |
| note/core helpers used by MCP tools | `Contract`                   | Compare behavior with TockTeam's runtime-backed adapter and inspection library.    |
| root manifests and lockfiles        | `Package`                    | Check whether published MCP contents, executable shape, license, or build changed. |
| MCP tests and fixtures              | `Test/Tooling`               | Add or adjust TockTeam evidence when the tested contract applies.                  |
| Pennivo applications and routes     | `Skip — App UI`              | Keep TockTutor on its DSH Web client and Desktop route.                            |
| Pennivo UI components and styles    | `Skip — App UI`              | Follow TockTeam design rules; port only behavior-critical nonvisual logic.         |
| Pennivo direct filesystem writes    | `Skip — Accepted Divergence` | Keep mutation in TockTeam's staged proposal and note-runtime authority.            |
| Pennivo workspace/vault ownership   | `Skip — Accepted Divergence` | Keep the child on an empty scratch workspace without the active vault root.        |
| docs and release notes              | `Docs`                       | Update provenance or maintenance instructions when contracts or setup changed.     |
| CI and release infrastructure       | `Test/Tooling`               | Port only evidence required by TockTeam's supported package and runtime gate.      |
