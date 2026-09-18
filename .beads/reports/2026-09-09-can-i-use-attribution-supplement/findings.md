# Pinned Can I Use Attribution Evidence

## Finding for Independent Review

The missing full README at the npm-declared immutable source revision explicitly specifies the attribution form:

> The data in this repo is available for use under a CC BY 4.0 license
> (http://creativecommons.org/licenses/by/4.0/). For attribution just mention
> somewhere that the source is caniuse.com. If you have any questions about using
> the data for your project please contact me here: http://a.deveria.com/contact

Source: `browserslist/caniuse-lite` at commit `59e2d41ee743d54efec1bb8ce067957b9766ca50`, `README.md`, **License** section. Exact body SHA-256: `d668423e1ae99542c8974c99275b2455c349b496f8195f77ffe020e5b15e4fd3`.

This resolves the previously missing **upstream-requested credit form**: identify the source as **caniuse.com**. The proposed notice does so explicitly and links it, while retaining Ben Briggs's separately supplied package-author identification. No original creator's personal name is inferred from the contact URL. No exhaustive creator roster, current-site authorship, copyright year, or attribution waiver is invented. The package's full README requests source attribution rather than naming a roster in that section; CC BY 4.0 Section 3(a)(2) permits reasonable contextual attribution including links.

**Recommendation:** submit the exact proposed notice and pinned README evidence to the independent attribution/distribution reviewer. This is not a self-issued distribution clearance. If the reviewer still requires a separate original-creator identity beyond the explicitly requested source credit, stop for clarification rather than inferring it. Runtime and packaging remain unauthorized.

## Package-to-Source Identity

Request 1 fetched only exact npm version metadata for `caniuse-lite@1.0.30001761`, not an archive. It identifies:

- Repository: `git+https://github.com/browserslist/caniuse-lite.git`.
- `gitHead`: `59e2d41ee743d54efec1bb8ce067957b9766ca50`.
- `dist.fileCount`: 837, agreeing with the retained archive inventory.
- `dist.shasum`: `4ca4c6e3792b24e8e2214baa568fc0e43de28191`.
- `dist.integrity`: `sha512-JF9ptu1vP2coz98+5051jZ4PwQgd2ni8A+gYSN7EA7dPKIMf0pDlSUxhdmVOaV3/fYK5uWBkgSXJaRLr4+3A6g==`.

The SHA-1 and SHA-512 were independently recomputed from the retained tar; SHA-512 also equals the pinned extension lock entry. The retained tar's SHA-256 remains `dad057386ae3d0178226ca938355312c16e94b6680627ec297ce1b1dcf55e2d1`. Assertions and results are retained in `metadata-identity.json`.

`gitHead` is the exact package registry's source-revision declaration; npm/SLSA provenance signatures were **not** independently verified, and no additional provenance endpoint was fetched. No tag guessing, newest-release substitution, or mutable default-branch README was used.

Request 2 fetched the full README at that exact revision. It explains the previous compacting/reduction of original Can I Use data, documents retained feature fields, and supplies the explicit source-credit instruction quoted above. This is the full source document linked by the 164-byte README in the retained npm tar.

Request 3 fetched `LICENSE` at the same revision. Its 18,651 bytes hash to `fd3a263fe19ed8faa9068b43abaebafc02c77897b0c6fc09abc04bb592e5f16e`, exactly matching the full license already retained in the audited archive and approved generated fixture.

## Request Ledger and Scope

Exactly **3 HTTP GET requests**, all status **200**, **23,760 response-body bytes total**, maximum response **18,651 bytes**, **zero redirects**. No authentication, cookies, broad search, package/archive download, assets, package manager, or package/source execution. The retrieval stopped after finding the explicit pinned instruction; unused budget is not treated as permission for broader research.

| Request | URL | Retrieved (UTC) | Bytes | Body SHA-256 |
| --- | --- | --- | ---: | --- |
| 1 | `https://registry.npmjs.org/caniuse-lite/1.0.30001761` | 2026-09-09T23:03:16.697Z | 1,977 | `951884e9734e31a0f9e951444f95b0cd61329e653168c8ee9ab12024f0dd41c7` |
| 2 | `https://raw.githubusercontent.com/browserslist/caniuse-lite/59e2d41ee743d54efec1bb8ce067957b9766ca50/README.md` | 2026-09-09T23:03:46.183Z | 3,132 | `d668423e1ae99542c8974c99275b2455c349b496f8195f77ffe020e5b15e4fd3` |
| 3 | `https://raw.githubusercontent.com/browserslist/caniuse-lite/59e2d41ee743d54efec1bb8ce067957b9766ca50/LICENSE` | 2026-09-09T23:03:46.394Z | 18,651 | `fd3a263fe19ed8faa9068b43abaebafc02c77897b0c6fc09abc04bb592e5f16e` |

Each `request-N.json` records URL, method, response status, relevant headers, start/finish times, exact body size/SHA, credential and manual-redirect policy, and cumulative bytes; corresponding `request-N.body` retains exact response bytes. `retrieve.mjs` enforces the approved request/response/total bounds without automatic redirect following.

The registry response is a retrieval-time metadata observation. README and LICENSE URLs are immutable-commit addressed. **No mutable current Can I Use website/about page was fetched or relied on.** The website/contact links in the source README were read as attribution text only, not followed. No claim is made that hypothetical `NOTICE`/`CREDITS` paths are absent; they were not guessed or requested. The supplied README's explicit requested form is the affirmative evidence, not absence of other files.

## Exact Proposed Notice and Location

`THIRD_PARTY_NOTICES.proposed.md` contains the exact candidate section, with no placeholders. It includes:

- Explicit source credit to `caniuse.com` and its hyperlink, matching the pinned instruction.
- The exact `caniuse-lite` version, package author Ben Briggs with supplied author URL, and immutable package source URL.
- CC BY 4.0 name/link, reference to the retained full license and disclaimer, and no implied endorsement.
- Previous caniuse-lite reduction/packing and TockTeam's concrete data transformations.

Proposed eventual location: the data bundle's `THIRD_PARTY_NOTICES.md`, adjacent to its inert JSON, with full license at `licenses/caniuse-lite.txt`; the distribution's third-party notice/index must include this section or link to that shipped local notice. Keep all other existing dependency/Raycast/adaptation notices and seven full licenses. This proposal does not authorize editing a repository-root file, generating a package, or modifying the approved immutable evidence envelope.

The existing fixture notice already identifies `https://caniuse.com/` as the data source. Therefore the smallest remediation may be **evidence-only**: the newly pinned README establishes the requested form for credit already present. The concise proposed section is for an eventual reviewed packaged notice; it is not a reason to rewrite the fixture or rerun generation.

After independent approval only, create a separately versioned notice/provenance supplement binding this evidence and the selected notice hash to the unchanged fixture SHA `3e2e16d1b9764f9df605f666c590e5ac86997259a5b480a75e7a59dc680e2d55`. Preserve the original fixture's historical notice and failure evidence as-is; do not rewrite generation history or claim this notice was present in that run. Any future packaging step must explicitly select the independently approved notice supplement.

## Unchanged Gates

R1 failure envelope and R2 approved fixture remain unchanged. Repository stays clean at `d41351a513ef57a90d4df0878366a0a00e0a7087`; no runtime/profile/build/Electron/packaging mutation or issue closure. Distribution remains blocked pending independent review of this new evidence and exact notice.
