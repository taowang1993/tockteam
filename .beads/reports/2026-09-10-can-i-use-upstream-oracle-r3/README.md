# Can I Use Independent Upstream Oracle

## Result

The exact R3 oracle passed one real-input attempt from clean `launcher` HEAD `1e215562d2c6b689e665686b868390433ef0c5c1`, under independent-work directive `5a7d2047-515a-4116-ad61-68529aa963dc`. This establishes scoped independent upstream corpus evidence, **not data, package or runtime admission**. All three admission flags in the immutable receipt remain false.

| Comparison | Count |
| --- | ---: |
| Features | 581 |
| Agents | 19 |
| Canonical Targets | 649 |
| Scoped Aggregate Rows | 8715 |
| Raw Status Cells | 376949 |

Expected-row SHA-256: `a7494799545e5589fe255d8f1d656ae68f0894c006268c67dc222938f12d7839`.

PID/process group 33064 exited 0. Oracle duration 447 ms; host duration 486 ms. Stdout 2014 bytes; stderr empty. No timeout, stream overflow, signal or spawn error. Held pre/postflight checks verified original archive/capsule/R2 receipt, source/test, tool/core/proposal, config and host hashes/metadata unchanged, clean repository, and root/full process group gone. No package evaluation, network, workspace/native or application runtime action.

[`receipt.json`](receipt.json) is an exact byte copy of the captured stdout: 2014 bytes, SHA-256 `0a218e11a662f852d8043e11f775c78ba59be2aa9ad1049be9c3c67c186b2788`. Copying verified held no-follow identity/hash; it did not rerun the oracle or recompute the semantic digest. The copy indexes and preserves the result, not a substitute for original custody evidence.

## Root Cause and Repair

The original synthetic suite missed two valid corpus shapes. Filename sorting did not preserve bare-slug order for prefix pairs; R2 corrected the set comparison by sorting mapped slugs. The remaining failure was `FEATURE` index 73 with an unsupported value. Bounded R2–R5 diagnostics narrowed this to the exact undefined sentinel in top-level D at depth 1, without publishing feature names or payloads.

A separately authorized static held read verified the pinned 1365-byte feature-unpacker source, SHA `0967c504c9a35a8c8316a2bb04151a234cf765c732f6b98e64fd871d04c3a0ab`: D is projected as `shown: packed.D`, whereas required support objects and strings are consumed strictly. Shown is outside this oracle's scope and generated capsule.

R3 adds only the fixed undefined token and allows undefined alongside boolean for optional D. Own undefined values remain distinct from null/absence; required A/B/C/support values and extra fields stay strict. No generic identifiers, calls, alias resolver, void/nonfinite values or other syntax expansion entered the oracle. Genuine parser and optional-field/corpus red→green regressions preceded the repair. All 11 standalone synthetic tests and syntax checks passed with forbidden artifact/evaluation/process/network counters zero. Prior descriptor/prototype, bounds, malformed input and semantic-tampering checks remain covered.

## Exact Tooling

Original proposal root: `/private/tmp/tockteam-can-i-use-upstream-oracle-proposal-r3/`.

| Artifact | SHA-256 |
| --- | --- |
| `oracle.mjs` (27010 Bytes) | `1ec88a70d76ac21500f3558f9368002732f7d508feff63047db17eec7dcbb634` |
| `self-test.mjs` (17303 Bytes) | `0ba787650108d480c8acce98ddb24551ea9d783f1c4223a121798b8176ae0f28` |
| `core.mjs` | `160edbeab2eff501fc441d305e26b77a316581e6c2787e56fbe10226ee6b8341` |
| `proposal.md` | `04ce8a4fb06d2d62438d78cf0588e211e381f479fbaad15241830693c2ff1e84` |
| `undefined-red.txt` | `be35d682bf4ceeca8d76a7c8d9d1d7102daa4c48b0c3ac8517ed2b4c4b450b1c` |
| `undefined-green.txt` | `e1ea373e7118dec285a8deac40628cfef201bb2b768cf93c6567b80d50cc104f` |
| `shown-red.txt` | `098136f99e584e951a8472b98891973ab88268d9a0c513b0de03e85d8215c2ef` |
| `shown-green.txt` | `3efc8b193346f52b0449a612856c095b2e2b16fadc057c678aea247d7db29028` |
| `final-checks.txt` | `0f17eff13f3cf329205f42238fdad5a328e18da807b6a18596dc24a9c54e4867` |

Verification command:

```sh
/opt/homebrew/opt/node@24/bin/node --test --test-isolation=none \
  /private/tmp/tockteam-can-i-use-upstream-oracle-proposal-r3/self-test.mjs
```

## Original Execution Evidence

Root: `/private/tmp/tockteam-can-i-use-upstream-oracle-execution-r3.PylOos/`.

| Artifact | SHA-256 |
| --- | --- |
| `ATTEMPT-CONSUMED` | `870ce182807ed6bf14c9c6011eb61eab37c933eb5c0a40402c5960952ae684eb` |
| `config.json` | `a8a17ce2339c25d9c01955247200121da92d947d69e7b2eccb89b22c1348d9e9` |
| `preflight.json` | `21c15c935e07f27795f94627aaf06a119a372352d07bba90a81205e6925ccd16` |
| `spawn.json` | `8830332bee096044819a2fa06f1a8c7867feba4e18c3bb128520ed934c9f9af6` |
| `status.json` | `f209bf57697955dee6751ad2e662e87982d1a5a8970b2101cdd087d6382ff945` |
| `stdout.txt` | `0a218e11a662f852d8043e11f775c78ba59be2aa9ad1049be9c3c67c186b2788` |
| `stderr.txt` | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| `postflight.json` | `6a7fd86b82174d1141aa5f4cccf2314dcc9351f6aef719737d49e166fdd0bd7a` |
| `inspection.json` | `11f607ec77ac2c1f6d6f516191c19061450a46326cb108831d157b3d40135431` |

Host `/private/tmp/tockteam-can-i-use-held-host-v1.mjs`: SHA `d8c7d3163a301e4fac7782ac8a70385955c4681b542a9efcc24c9259aa5b9b95`. Fresh exclusive marker preceded real reads; ignored stdin, exact env-i Node 24.20.0 argv/env, 65536-byte stream caps, 4096-byte result cap, 120-second cooperative and 150-second hard process-group deadlines. This is not OS confinement. All earlier consumed tools and failures remain preserved; none was reused as a diagnostic input.

## Scope Limits

Compared: independently decoded raw statuses, scoped aggregate thresholds, title/status, agent labels/order/versions/releases and canonical targets from the original pinned corpus. Excluded: Browserslist defaults/query language/config discovery, registry ordering, usage/prefix/shown UI behavior, workspace/native effects, candidate/package API execution and runtime/profile/build/descriptor/package admission. The prior [R2 fixture report](../2026-09-10-can-i-use-fixture-consistency-r2.md) remains separate shared-provenance consistency evidence. Admission requires a separate recorded decision and integration proof.
