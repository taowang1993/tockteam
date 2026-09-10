# Independent Can I Use inert-selection review R1

**Verdict: APPROVE** — this approves only the single evidence-only inert-selection run, not runtime/package admission.

## Findings

- **Authorization / command:** The checkout is clean at `launcher` HEAD `2cee9a348502b0a54dbfac559613ef95114c687c`. `preflight.json` records Node `v24.20.0`, selector `scripts/can-i-use-select-inert.mjs` (29,704 bytes), SHA-256 `05842cbfcf3f9a49a6fc2beb0e754a7ad74db2367d6eb30ecd7defb7fda7f9d7`, and the exact `/usr/bin/env -i` environment: `PATH=/usr/bin:/bin`, `TZ=UTC`, `LANG=C`, `LC_ALL=C`, `__CF_USER_TEXT_ENCODING=0x1F5:0x0:0x52`. The recorded args are the approved `--execute-approved <selector-sha> <capsule-path>` invocation.
- **One-shot result:** The evidence root has exactly one `ATTEMPT-CONSUMED` file and no second attempt marker. `status.json` records PID `41103`, exit/status `0`, null signal/error, stdout `285` bytes, stderr `0` bytes. `stdout.txt` is the single receipt; `stderr.txt` is empty; both are within the recorded 65,536-byte per-stream bound.
- **Capsule identity / integrity:** The capsule is a regular file, mode `0600`, uid `501`, gid `0`, link count `1`, size `11,301,166`. Its SHA-256 is exactly `09a21a4f83e27fe07d4b71ac5b8e531ac1fb8f4713ca0f7305b8cf07d5d49035`. I independently used a one-off Node stdlib-only read-only check: `lstat` → `O_RDONLY|O_NOFOLLOW` held descriptor → `fstat`/bounded read/hash → descriptor and named-path identity checks. Capsule identity was unchanged before/after the read.
- **Capsule schema / receipt:** The capsule is canonical JSON with the exact schema, `schemaVersion: 1`, `kind: can-i-use-inert-assets`, `status: complete`, exact source pins, and `runtimeAdmitted: false`. Receipt values agree with the capsule: output path, capsule SHA-256, selector SHA-256, `status: complete`, and `runtimeAdmitted: false`.
- **Entries / decoded content:** Exactly these ordered 14 entries are present: `CAN_I_USE_ATTRIBUTION.md`, `THIRD_PARTY_NOTICES.md`, `agents.json`, `canonical-targets.json`, `catalog.json`, `defaults.json`, `licenses/baseline-browser-mapping.txt`, `licenses/browserslist.txt`, `licenses/caniuse-api.txt`, `licenses/caniuse-lite.txt`, `licenses/electron-to-chromium.txt`, `licenses/node-releases.txt`, `licenses/raycast-extensions.txt`, `support.json`. Every descriptor, strict canonical base64 value, decoded length, and decoded SHA-256 matches. Decoded total is `8,473,611` bytes. Counts are defaults `36`, canonical targets `649`, features `581`, agents `19`, support-scope agents `15`, licenses `7`, support features `581`, and stats features `581`. Embedded JSON is canonical and independently checked for exact schema, source-index/order, uniqueness, target/default subset, support/stats key parity, and scope/count relationships.
- **Legal / notices:** All seven license assets, `THIRD_PARTY_NOTICES.md`, and `CAN_I_USE_ATTRIBUTION.md` are included as separate pinned entries. The attribution includes `caniuse.com` / `https://caniuse.com/`, caniuse-lite `1.0.30001761`, source/author information, CC BY 4.0, and the local `licenses/caniuse-lite.txt` reference. The third-party notice also contains the caniuse.com credit and CC BY 4.0 reference. No executable asset is selected.
- **Source pins / provenance:** Independent reads confirm the capsule pins: fixture/R2 `3e2e16d1b9764f9df605f666c590e5ac86997259a5b480a75e7a59dc680e2d55`; generator `f42b9935b3e3b2dc6b43ed6c5fe7a1a27ca03578add9b219da5f85afb35d2767`; notice `791f9758d274b29ee450352421702dd1b855790f2b2fe3416d7b90e6a9f95bc1`; supplement `4afcc353b08ab365fb8464202aa58dd63653766fc7ffa03b5ae80475fe0bbe2a`. The R2 envelope independently validates as canonical/complete, two identical 615-row trees, runtime-admitted false; provenance binds Node `v24.20.0`, source commit `186d955eda64f9e956b25a3fdf5566b1d38f57f2`, source artifact `cd79b55c49f36836970b56d9f7ecef39f89a4855bb5d20aca5576299edb2837c`, 599-module manifest, 600 requests, zero denials, and zero config calls.
- **Fixture preservation:** R1 remains 248 bytes, SHA-256 `3236c3f254ab2aec74aa09103eba653511422c6d6db9e71f75ef8480e845500a`; R2 remains 27,679,242 bytes, SHA-256 `3e2e16d1b9764f9df605f666c590e5ac86997259a5b480a75e7a59dc680e2d55`. Held-descriptor identity/metadata checks passed for both.
- **Evidence artifact hashes (independent SHA-256):**

  | Artifact | SHA-256 |
  |---|---|
  | `ATTEMPT-CONSUMED` | `6c874058f4e5b8e07176308de0f1de2d7b0244318fd680365e335d9e984e9855` |
  | `execute-once.mjs` | `fa49876d824405ccdb2ae5423c272039f1c1569e73a33d7214ad304a1f9aa38e` |
  | `inspect-readonly.mjs` | `5652635e30bcdefa9eb349c7e1864c6fd940960d99c9da4b0a505093f4b6a1ed` |
  | `inspection.json` | `628c3260b0bc5fbfb06fb29d1f327c06c940ec06e3e0c972096bbcc95025fee3` |
  | `preflight.json` | `09b97fda9d13cd7d37c9bc813253ae9e8bc2e5ce8ec0b7429b9f04941bd7539a` |
  | `repo-after.txt` | `7a4fc387122b239dc570d8a8a0c7b3f5d7c45b19868998c89b73fc544cdc2ba2` |
  | `status.json` | `6a54a5b05668e9b8a2c656fec795cd88f85ffb00a416adf5fd359c4f33a0785b` |
  | `stderr.txt` | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
  | `stdout.txt` | `011f6a67c39c9110237c46dbe11e9dd667a5dd6ccc44709498fc9cd6ae0ce945` |

- **Process / repository / scope:** PID `41103` is gone (`ESRCH`). Current `git status --porcelain=v1` is empty at the expected HEAD. The expected HEAD commit changes only `scripts/can-i-use-select-inert.mjs` and `tests/can-i-use-select-inert.test.mjs`; no runtime, defaults, build, profile, package, or Electron files are changed by this approved commit.

## Residual risks

The capsule and fixtures are ordinary filesystem objects rather than immutable storage; every consumer must reverify path identity, schema, and SHA-256 immediately before use. Retained upstream registry metadata states that its `gitHead` is registry-declared and not independently signature-attested. No future extraction, runtime enablement, package admission, distribution approval, or production selector/API/package execution is implied.
