# Can I Use — Approved R2 Fixture Consistency

**Fixture consistency only.** This records one completed attempt and its independently approved evidence. It is not an upstream oracle, data/runtime admission, a replay recipe, or permission for another read or execution.

## Authority and Result

- Authorization: parent message `f09584df-7a42-4a72-ac91-1f4ab5c2f16b`, 2026-09-10T06:11:26.176Z.
- Consumption marker: 06:17:07.393Z, before capsule preflight at 06:17:38.428Z. Fresh exclusive evidence directory and new output `ENOENT` were verified; exactly one execution, no retry.
- Reviewed source checkpoint: `d5febd6496be1bb4bf2d4f15777a22b99f8509e2`, branch `launcher`, repository `/Users/taowang/projects/worktrees/launcher`; clean before and after.
- Node v24.20.0 at `/opt/homebrew/opt/node@24/bin/node`; exact `/usr/bin/env -i` invocation, `PATH=/usr/bin:/bin`, `TZ=UTC`, `LANG=C`, `LC_ALL=C`, `__CF_USER_TEXT_ENCODING=0x1F5:0x0:0x52`.
- Ignored stdin; each captured stream bounded to 65,536 bytes; 150-second hard timeout with SIGKILL. PID 95335 exited 0, signal/error null; stdout 207 bytes, stderr 0, no overflow; host duration 2,902 ms. Independent inspection verified PID absent. The reviewed harness creates no descendants; this is not an OS sandbox claim.

| Matrix Observation | Count |
| --- | ---: |
| Singleton Comparisons | 377,069 |
| Matched Unavailable Responses | 120 |
| Aggregate Rows | 8,715 |
| Status Bindings | 581 |
| Explicit 36/35-Target Cases | 1,162 |
| Details | 581 |
| Searches | 584 |
| Semantic Vectors | 13 |
| Copy Checks | 2 |
| Failures | 0 |

Matrix duration: **2,721 ms**. Retained failures: `[]`.

Matrix digest: `4ac7c2b21554f954ffde41f29c8c408ec105dcbe7bef13a8f0fa7be935a05ac4`.

The 120 missing raw-target responses were correctly compared with `DATA_UNAVAILABLE`, not fabricated unsupported data. Missing scoped tables remain absent; only validated empty aggregate flags are accepted. Literal `defaults` and workspace capability remain unavailable.

```json
{
  "fixtureConsistencyVerified": true,
  "independentUpstreamOracle": false,
  "runtimeAdmitted": false,
  "dataAdmissionAuthorized": false,
  "packageAdmissionAuthorized": false
}
```

## Receipt and Input Identities

Receipt: `/private/tmp/tockteam-can-i-use-fixture-consistency-r2.noindex`.

- Canonical schema 1, kind `fixture-consistency`, status `complete`; 6,118 bytes.
- SHA-256 `6eddbfc90a53917d730ed68e9a8ab220c1b7d78073e8dca68b39f4c5eed84924`, matching stdout's declared receipt SHA.
- Device 16777233, inode 146227361, regular mode 0600, uid 501, gid 0, nlink 1.
- mtimeNs = ctimeNs = `1789021061314987102`.

Input: `/private/tmp/tockteam-can-i-use-inert-capsule-r1.noindex`, 11,301,166 bytes, SHA-256 `09a21a4f83e27fe07d4b71ac5b8e531ac1fb8f4713ca0f7305b8cf07d5d49035`. Canonical complete schema-1 inert capsule, 14 exact ordered assets, 8,473,611 decoded bytes; four provenance hashes and all asset path/size/SHA/base64 bindings checked. Held read-only/no-follow inspection confirmed unchanged capsule and source identities/hashes, with final fd/path metadata checks. Full metadata is retained in the pinned inspection below.

The old failed `fixture-consistency-r1` output and both generator fixtures were not opened, statted, replaced, repaired, deleted or reused. The old failed output remains permanently unavailable as a destination.

## Reviewed Source and Tool Pins

Proposal root: `/private/tmp/tockteam-can-i-use-fixture-consistency-proposal-r2/`.

| File | Bytes | SHA-256 |
| --- | ---: | --- |
| `harness.mjs` | 39,117 | `9ea3bcbc61a4b10a49548ebff611b3f186a2dc4a9c301ba7dd45e9abf1e536f6` |
| `self-test.mjs` | 20,970 | `32de12851ac9fd9eeb4952d1133a28c4380b7b6120dca12e495d17d5027f9327` |
| `proposal.md` | — | `80c836b8764307bac4ddc3c52c10507a60facdc35abd4b3dbe44ea7e3b5169b1` |
| `src/trusted-raycast-can-i-use-data.ts` | 13,835 | `99dc536c754efa20d43a26ae42d65c99f054d0ca8c7cded4ad90b9c4200760db` |
| `tests/trusted-raycast-can-i-use-data.test.mjs` | 32,614 | `aa3bab5896e5604a113187ae8fc695f981b67f05ffa7ddffa408eed63686e11f` |
| `src/trusted-raycast-can-i-use-catalog.ts` | 12,600 | `19c4f1d7efc7a7fa677b927a75e045f4e436b4f42d230795305dc684d86f764e` |
| `src/trusted-raycast-can-i-use-query.ts` | 5,719 | `b86621aeda146c7e11caa6970ef39e076afb2cb3be012458c6cee75f1b2335f1` |
| `src/trusted-raycast-can-i-use-errors.ts` | 1,203 | `85b6d6b55e8bd40a92ceda12e703d4a947faf931b398d68732cdbf188278c530` |

The harness retains the reviewed held-reader, exclusive one-shot publisher, environment, checked-buffer loader, capsule decoder, receipt validator and execution mechanics. Its separate constructor-invariant checker and own-property raw-table expectations do not establish independence from upstream generation provenance.

## External Evidence Manifest

Original evidence root: `/private/tmp/tockteam-can-i-use-fixture-consistency-execution-r2.Q41eOlCl/`. These are the exact preserved originals, not files to execute again.

| File | SHA-256 |
| --- | --- |
| `ATTEMPT-CONSUMED` | `0ad3989c3f2bfb35f30e9ef7f1592c315017438215e1888a1598b39d870c04f1` |
| `preflight.json` | `3cd1f762afedfa03185e3388ec30f53de94765f182f9f3c1102dd7577946c893` |
| `status.json` | `9f7378f3123dd73118189a065cd3316eab1b74476c1048220fded64080062984` |
| `stdout.txt` | `f4197f20d70167d3651ddb88d9813a5af45bae777d963b155778cd68e0326636` |
| `stderr.txt` | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| `inspection.json` | `3bc8e033d34a423a1f780812a44d75df0a200baab9e172b91fd535dc414fd2a4` |
| `repo-after.txt` | `156bb7eac661c584f445629916e98f530ee57bc19de063683e70ad52be38f03d` |
| `execute-once.mjs` | `fb9424c1db35d6d4d9eeda7b1284c0d952cde8b3b163e13936fefd9ed68be6ce` |
| `independent-io.mjs` | `7bbf8595bdbc48d94cc4cd1dca489fd31122a95a1d9872338d513915ef85b86f` |
| `inspect-after.mjs` | `0262051a54be6efe532c908c1dc1a46a74dc2edc9e6e8fe412037a669cb62f33` |
| `receipt-check.mjs` | `e93a1c3f5f7d43bd2e82be661fea37688eb2fdbc3ffd274af13f3d038b548646` |

## Independent Review

- Artifact: `/tmp/can-i-use-fixture-consistency-r2-execution-independent-review.md`, 2,422 bytes.
- SHA-256: `f45ec61a5081710eaa2697b882772fd1b1ccbe1cf812c260076de32f47b556d9`.
- Reviewer child run: `ed094b59-2bc1-48da-b86f-092b547be0af`.
- Workflow: `c89e7e8b-85b5-44a0-8526-4a5887274877`.
- Verdict: **APPROVE — fixture consistency only.** No P0/P1/P2/P3 findings; no runtime, data, upstream, defaults, package or native admission implied.
- Parent approval/report authority: `4d0d69d9-9ada-4d68-b782-4da5d9ce66cc`; original review reference confirmed by `9e4979aa-7a4e-4e53-a4f8-426b5321cabe`.

## Limits and Next Boundary

The independent inspection validated canonical receipt bytes, exact schemas/counts/pins/metadata, digest format and stdout SHA binding; it did **not** rerun the matrix or independently recompute its digest. The unavailable count is a bounded validated receipt observation, not a separate upstream-derived oracle.

This report is a concise durable snapshot and index, not a replacement for the original evidence, corpus, capsule or receipt. Ordinary files/hashes provide point-in-time evidence, not immutable storage; missing or changed originals make a future gate fail closed. No real artifact was reread to write this report.

The next separately reviewed gate must derive expectations from original inert upstream corpus bytes, not generated support flags or reused adapter logic. Preparation/synthetic checks confer no execution authority. Candidate/package execution, defaults/workspace/native capabilities, and profile/build/runtime/data/descriptor/package/Electron integration remain closed. Only two existing descriptors remain admitted; `tockteam-3l3.4` stays open. No push is authorized.
