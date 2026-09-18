# Windows Native Clock and Host Recovery Result

## Accepted Scope

The user separately authorized publishing reviewed commit `396b2844ed0e30b64c2e9e73b6e67e8c0ff95823` only to `verify/windows-owned-process-20260916` and running one bounded Windows workflow. [Run 35127983115](https://github.com/taowang1993/tockteam/actions/runs/35127983115), **attempt 1**, passed in **3m10s** on Windows x64, Node **24.20.0**, with loaded Koffi **3.1.6**.

This establishes the prepared native Windows clock and Host-death recovery checks, not historical stall causation or Windows Desktop acceptance. No retry, main push, merge, release, or foreground Desktop run occurred. Remote `main` remained `c7e630e1ce20143acaa93414c8dfd5b7bb5a8760` before and after publication.

## Native Clock Evidence

Freshly installed JavaScript used the shared callback fixture and assertion body:

| Case | Index PID | Result |
| --- | --- | --- |
| Progress | 6356 | One logical commit plus drain lasted **7266.7 ms** and succeeded; late callback/follow-on checks passed. |
| Held Commit | 1448 | Stalled **5048.1 ms** after its last own progress, despite seven unrelated native completions and 27 child-observed invalidations. |
| Held Drain | 8480 | Commit resolved, then its real drain callback was held; the same logical operation stalled after **5033.5 ms**. |

Every case verified its retained process handle was already signaled when `close()` returned. Close durations were approximately **11.3, 9.7, and 14.5 ms**. The fixture delayed genuine successful callback delivery; production clocks and SQL results were not substituted.

## Host-Death Recovery

- Nested Host **2596** initialized real index child **9040**. The child then blocked its JavaScript event loop, excluding cooperative peer-close exit.
- Contender **8628** received real **`SQLITE_BUSY` at `PRAGMA journal_mode`** during lease acquisition, read zero documents, and was already signaled when closed.
- Both retained Host/child handles were non-inheritable and returned `WAIT_TIMEOUT` immediately before **Host-only `TerminateProcess`**.
- Host and child were both observed signaled **within 29 ms after termination** (a sampled upper bound, not an exact death timestamp). The monotonic blocked-marker-observation-to-child-signal interval was **157.6 ms**, far below the 60-second block duration; no expiry marker existed.
- The **81,920-byte** main database retained SHA-256 `26fc1f2c34b2dee027ba06baf27ae4b8aac45c24eae817062c02c51a890328fd` and exact bigint identity `{dev:"1995562750", ino:"3096224743910687"}` across contention and Host/child death.
- Only after verified death did replacement **6556** open. It performed **zero document rereads**, preserved file identity, returned indexed `Alpha.md`, and was already signaled when closed.

This is Windows Job-bound descendant death and subsequent lease recovery—not the macOS surviving-orphan scenario.

## Regressions and Cleanup

The same workflow also passed the existing gates:

- **Six owner cases and 13 launcher cases**; all launcher retained identities were signaled immediately at return.
- Three complete eight-handle ledgers; failed creation **212 → 212**, and the deliberate one-handle sensitivity control detected **212 → 213 → 212**.
- **Six installed index cases**, with eight verified stopped index processes.
- Both installed index gates recorded eleven runtime module hashes; the parent independently recomputed every hash against the current compiled source bytes.
- All **three** outer process inventories were empty. No gate used emergency cleanup. All copied-executable scratch roots were removed; the workflow's package/evidence-root cleanup step also passed.

The only workflow annotation concerned the pinned setup/upload actions' Node 20 deprecation while GitHub forced them onto Node 24. It was not a test failure; action upgrades are outside this verification slice.

## Durable Evidence

Only these allowlisted receipts were copied transactionally into the report directory:

- [Recovery](windows-recovery-2026-09-16/35127983115-recovery.json)
- [Existing Index Gate](windows-recovery-2026-09-16/35127983115-index.json)
- [Owner and Launcher Gates](windows-recovery-2026-09-16/35127983115-proof.json)
- [SDK Layout](windows-recovery-2026-09-16/35127983115-sdk.json)
- [Run and Step Metadata](windows-recovery-2026-09-16/35127983115-run.json)
- [Parent Assertion/Hash Audit](windows-recovery-2026-09-16/35127983115-audit.json)
- [Artifact Hash Manifest](windows-recovery-2026-09-16/manifest.json)

The parent validated exact commit/attempt/platform, installed module hashes, clock measurements, recovery waits and identity, owner ledgers, case counts, inventories and removal fields. [Preparation and local verification](2026-09-16-windows-index-recovery-preparation.md) preserve the separate local proof, harness failures and corrections.

Independent read-only artifact audit `e912d94c-fc64-4b9e-bea7-12ac5e6126c3`: **no issues found; scoped native Windows acceptance**. The reviewer inspected all four raw artifacts, run metadata and parent audit; executable assertions and hash recomputation were performed by the parent. The code review applied all three review references.

## Remaining Boundary

`tockteam-bon` stays open because the intermittent historical Windows startup stall is still unattributed. The additional native Windows clock/recovery coverage is now established; it must no longer be described as unexecuted. This run does not establish full installed Desktop UI acceptance on Windows or change the earlier macOS workflow UI limitation.
