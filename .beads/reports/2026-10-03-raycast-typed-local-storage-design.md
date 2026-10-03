# Typed LocalStorage Preservation Decision

## Decision and Authority

Beads: `tockteam-qwzg.8.2.6`, under the already approved documented Tinycast macOS SDK plan. Conductor `01a101f6` approved this separate recoverable test-first slice on 2026-10-03, with the correction below. This is design approval, not runtime, account, native-effect, test or completion evidence. Source remains untouched until the current TockTutor writer/artifact lease is explicitly returned.

The existing strict string-only state file combines legacy LocalStorage and default Cache public keys. Generated named Cache keys are outside the public-key length range, but the old membership predicate was too broad: it accepted a valid public prefix-shaped key. The pre-slice conductor probe confirmed one P2 isolation/data-preservation finding. Named-mutation exemption is valid only after restricting membership to its matching prefix plus exactly 64 lowercase hex suffix characters (135 total), shared by clear and isEmpty; no pre-fix universal isolation is accepted. Relaxing that raw parser to accept numbers/booleans would reinterpret previously invalid files and let Cache return non-string values. Converting saved strings to guessed types is also prohibited. Neither approach is approved.

## Minimal Revised Behavior

1. Add one versioned, bounded LocalStorage-only sidecar inside the existing owned state folder. Values are strings, finite numbers or booleans. Keep the existing raw file and Cache parsing strictly string-only.
2. Reads, imports and startup create nothing. While the sidecar is truly absent, LocalStorage reads and enumeration return the exact existing public string values. A corrupt, unreadable, oversized or dangling-link sidecar is not absence and must fail visibly rather than fall back or overwrite it.
3. Before the first mutation of **either** shared default Cache or LocalStorage, preserve every previously visible legacy public string in the new LocalStorage namespace. Validate incoming values, requested result and both relevant quotas before publishing anything. Preserve legacy string types, special keys and cold-read values; never silently drop a value that cannot fit.
4. For a default Cache mutation, atomically publish and verify the safety snapshot **before** changing the raw Cache file. A failed snapshot blocks the raw mutation and notifications. A successful snapshot followed by a failed Cache mutation may retain that harmless snapshot but must report the actual Cache failure. This is not a multi-file atomic transaction.
5. For a LocalStorage mutation, apply the explicit requested change to the validated legacy snapshot and publish one atomic sidecar result. Subsequent LocalStorage reads/writes use its own namespace. Cache remains string-only and independent; LocalStorage no longer leaks changes into Cache or its subscribers. Named Cache operations do not trigger a snapshot only after the exact encoded-key membership check guarantees they cannot affect public legacy keys.
6. Reuse the existing bounded no-follow reader, atomic write pattern, private folder and extension identity. Keep 64 KiB/256-entry limits **per file** and the existing incoming-key/value bounds. The extra bounded file increases the total possible stored bytes; do not claim the old total extension quota remains unchanged. Existing install removal owns the state folder and therefore this sidecar too.

The original raw file is never retyped, deleted or eagerly migrated. Explicit Cache mutations still change their own raw values normally, but only after preservation. Original LocalStorage strings remain recoverable in the safety snapshot and any unmodified raw bytes. No generic persistence framework, new dependency, trust/install permission, renderer/IPC authority or credentials store is introduced.

## Required Failing-First Proof

- Legacy reads/all-items remain detached strings, byte-identical and write-free; prototypes and empty strings stay safe. First typed writes persist exact false/zero/string values across cold opens and independent extensions.
- Cache-first clear, overwrite and remove cannot erase the legacy LocalStorage snapshot. LocalStorage-first set/remove/clear cannot change Cache values or subscriber notifications. Named Cache remains isolated.
- Invalid types, non-finite numbers, invalid keys and oversized results publish no sidecar. Existing malformed/non-string raw state is not newly accepted.
- Distinguish absence from corrupt/unreadable/link/dangling-link/growing/oversized sidecars. Preserve original bytes and fail without falling back or rewriting.
- Inject failures before safety publication, after safety publication and during raw mutation; assert exact outcomes, notifications, no lost data and retry/cold recovery. Validate atomic temporary-file cleanup and existing-file protections.
- Old provider capabilities must reject typed operations explicitly rather than report success; aliases match canonical APIs. Real private-child fixtures exercise current source, install/approval, namespace/cold lifecycle and full group teardown.
- Focused existing SDK/Form/bundled/lifecycle tests, typecheck, whitespace and fresh source/data-boundary review pass before an exact-path checkpoint. Update the finite compatibility ledger without claiming full Desktop, installed, native-effect or universal compatibility.

Any newly discovered preservation edge is reviewed before widening this design. Unsupported or unverified behavior stays explicit; no sensitive external proof follows from this approval.
