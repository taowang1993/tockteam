# Can I Use Notice and Provenance Supplement

Version 1 is **evidence only**. Independent attribution and proposed-notice approval was relayed by the parent on 2026-09-09. It does not admit runtime data, enable `defaults`, add a descriptor, or authorize packaging.

`supplement.json` binds the unchanged 27,679,242-byte generated fixture (`3e2e16d1…e2d55`) to the exact approved notice (`791f9758…f95bc1`), retrieval manifest, findings, immutable upstream README and license, and registry metadata. Full SHA-256 values, source URLs, retained-file hashes, and approval provenance are recorded there.

- `THIRD_PARTY_NOTICES.proposed.md`: exact independently approved 910-byte notice section; retain its historical filename without changing its bytes.
- `request-1.body`: exact npm version metadata; `metadata-identity.json` records its match to the previously pinned tar and lock integrity.
- `request-2.body`: complete upstream README at the registry-declared commit. Its License section says: “For attribution just mention somewhere that the source is caniuse.com.”
- `request-3.body`: full CC BY 4.0 license, identical to the archived/generated license.
- `request-1.json` through `request-3.json`: HTTP status, retrieval times, byte counts, hashes, and redirect records; three requests, 23,760 bytes, no redirects.
- `manifest.json` and `findings.md`: original retrieval evidence, retained verbatim. Their pre-approval status wording is historical; `supplement.json` records the later approval.

The verbatim upstream license (`request-3.body`, line 52) includes one trailing space. Git's whitespace check reports it; it is intentionally preserved to keep the approved source hash, not reformatted or treated as product code.

The original retrieval manifest also records a hash for `retrieve.mjs`. That mechanical retrieval script is intentionally omitted: all authoritative response bytes and receipts are retained, and no network replay or executable tool is needed to verify this supplement. All other files referenced by its artifact inventory are present. No attribution verification depends on an ephemeral `/tmp` file.

The full fixture itself is **not** committed here. Its digest is an identity commitment, not a claim that these reports reproduce its data or make it available in a clean checkout. A future extraction gate must obtain and verify the exact original envelope bytes; it must not regenerate or substitute data from these reports. The r1 failure envelope and r2 approved fixture remain unchanged external generation evidence.

The eventual data bundle must retain the full license and all other dependency/Raycast/adaptation notices, include this approved section or a linked local supplement in its notice index, and bind the selected notice bytes in its own manifest. That is a separate reviewed step. `runtimeAdmitted` remains `false`.
