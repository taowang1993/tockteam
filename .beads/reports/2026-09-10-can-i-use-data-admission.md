# Can I Use Inert Data Admission

## Decision

**Admit the exact inert data snapshot below for first-party, filesystem-free decoding and finite compatibility operations. Do not admit a command, executable package, descriptor, profile, build layer, or native effect.**

This is the Launcher owner's separate evidence-backed decision under independent-work directive `5a7d2047-515a-4116-ad61-68529aa963dc`, reaffirmed by `4307e3e4-8a0a-4d07-8178-0a4626593e9a`. Tracking: `tockteam-3l3.4.1`; integration and Electron acceptance remain separate dependent issues. The immutable upstream receipt retains its original false admission flags; this document does not rewrite past evidence.

## Exact Identity and Custody

| Item | Bytes | SHA-256 |
| --- | ---: | --- |
| Retained `plugins/trusted-raycast/vendor/can-i-use-data.json.gz` | 793106 | `6e919a283fcb9d940b129cf2796b6e2b1355630c24309db70177dde45d55a7bb` |
| Original, Decompressed Capsule | 11301166 | `09a21a4f83e27fe07d4b71ac5b8e531ac1fb8f4713ca0f7305b8cf07d5d49035` |
| Independent Upstream Receipt | 2014 | `0a218e11a662f852d8043e11f775c78ba59be2aa9ad1049be9c3c67c186b2788` |

The [independent upstream report](2026-09-10-can-i-use-upstream-oracle-r3/README.md) and [unaltered receipt](2026-09-10-can-i-use-upstream-oracle-r3/receipt.json) establish 581 features, 19 agents, 649 canonical targets, 8715 scoped aggregate rows, and 376949 raw status cells. Expected-row SHA-256: `a7494799545e5589fe255d8f1d656ae68f0894c006268c67dc222938f12d7839`. The [fixture-consistency report](2026-09-10-can-i-use-fixture-consistency-r2.md) is separate shared-provenance evidence, not a substitute for that comparison.

One exact retention attempt used `/private/tmp/tockteam-can-i-use-data-retention-r1.gLE1Nc/retain.mjs`, SHA-256 `7d04a01854c41dbc806a19c80ffb54c0adb61c9cc2d032c0042b369ee0405a7b`. An exclusive `ATTEMPT-CONSUMED` marker preceded the original capsule read. The existing pinned reader verified no-follow/nonblocking held-fd regular-file identity, owner, single link, mode, exact size/hash, EOF and unchanged metadata. Original dev/inode/timestamps also matched the oracle custody record. The existing inert validator checked all 14 entry identities and data shapes. Node 24.20.0 gzip level 9 changed only storage encoding; bounded decompression reproduced the exact original hash. Output publication used exclusive creation and a held readback. `receipt.json` in that evidence directory records the entry manifest. No prior failed output was opened, no corpus oracle was rerun, and no package code was evaluated.

## Admitted and Excluded Semantics

Admitted: fixed feature titles/statuses and identities, canonical targets, browser metadata needed for validation, raw support states, and the already implemented scoped aggregate projection. The existing immutable adapter remains the semantic validator; missing or altered bytes must produce only `DATA_UNAVAILABLE` before returning data. No generic import, resolver, query evaluator, callback or filesystem capability is represented by these bytes.

The 36 generated default targets are retained as historical snapshot data only. This does **not** prove independent Browserslist default-selection semantics or enable the public `defaults` token. Unsupported selectors, literal `defaults`, and workspace discovery remain fail-closed. Do not silently replace an invalid user query with the retained target list. Registry ordering, usage/prefix/shown UI parity, live/current coverage, native effects and command execution remain outside this decision.

## Verification

`src/trusted-raycast-can-i-use-assets.ts` accepts only the exact compressed size/digest, caps decompression at the exact capsule size, checks its original digest before JSON parsing, then reuses the immutable data adapter. It accepts bytes, not paths, performs no filesystem access, exposes no pin override, and does not register a command. The caller must bound any future file read separately; this decoder is not an anchored filesystem reader.

A genuine stub red failed with `DATA_UNAVAILABLE`; the implemented decoder passed real snapshot support checks, immutable/caller-buffer separation, missing/path-shaped/truncated/appended/tampered/alternately encoded inputs, unchanged default/query rejection, and all 14 data/legal byte checks. Final checks on Node 24.20.0:

```sh
/opt/homebrew/opt/node@24/bin/node --test --test-isolation=none \
  tests/trusted-raycast-can-i-use-data.test.mjs
PATH=/opt/homebrew/opt/node@24/bin:$PATH ./node_modules/.bin/tsx --test \
  tests/trusted-raycast-can-i-use-assets.test.ts \
  tests/trusted-raycast-can-i-use-{actions,aliases,catalog,query,workspace}.test.ts
PATH=/opt/homebrew/opt/node@24/bin:$PATH ./node_modules/.bin/tsx --test \
  --test-name-pattern='owning package|descriptor' \
  tests/trusted-raycast-package-contract.test.ts tests/trusted-raycast-descriptors.test.ts
PATH=/opt/homebrew/opt/node@24/bin:$PATH ./node_modules/.bin/tsc --noEmit
git diff --check
```

Results: 107 guarded synthetic adapter checks, 34 contract/data checks and three descriptor/package-scope checks passed; typecheck and diff checks passed. All five adapter forbidden-operation counters remained zero. An initial combined tsx invocation correctly tripped the adapter's filesystem guard on tsx configuration discovery; running that existing guarded suite through its intended direct-Node entrypoint passed without changing its guards. A test-only unchecked-index type error was corrected before the final typecheck.

New decoder coverage: 94.87% lines, 91.67% branches, 100% functions. The unexercised decompressed-identity rejection is defense in depth behind the exact compressed hash, not an invitation to add a production pin override. No app, browser, native helper or package code was launched; the bounded retention process exited and was confirmed gone. Detailed red/green, test and coverage outputs remain in the retention evidence directory above.

## Legal Bytes and Distribution Gate

All 14 capsule entries survive unchanged: five JSON assets, seven original license texts, `THIRD_PARTY_NOTICES.md`, and `CAN_I_USE_ATTRIBUTION.md`. Original legal bytes are encoded, not edited or summarized. The [attribution supplement](2026-09-09-can-i-use-attribution-supplement/README.md) records the separately obtained caniuse.com attribution statement and CC-BY-4.0 provenance limits.

The compressed snapshot is repository retention, **not application-package admission**. Before distribution, the surviving legal texts and data-source/change notices must be materialized readably in the exact artifact and verified by the package gate. Source-only audit archives must remain excluded. Runtime admission additionally requires unchanged pinned source, bounded pre-materialization, authenticated lifecycle/actions, managed preferences, renderer security, real UI proof, and owned-process teardown. Translate and Kaomoji remain the only runtime descriptors at this checkpoint.
