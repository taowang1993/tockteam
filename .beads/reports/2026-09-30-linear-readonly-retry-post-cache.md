# Linear Read-Only Retry After Offline Repairs

Date: 2026-09-30. Attempt task: `tockteam-qwzg.6.4`. Primary pilot: `tockteam-qwzg.6`, still open.

## Outcome

**The attempt did not succeed.** The sign-in helper's two-minute deadline expired before a completed issue list was observed. Sanitized result:

- `errorCategory: timeout`
- `loadingObserved: false`
- `loadedList: false`
- `issueRows: 0`
- `cleanupError: false`

The row count is a projection measurement, **not** evidence that the account has zero issues. No completed sign-in/query or provider-side revocation is proven. This timeout does not confirm a new compatibility defect; **new confirmed product findings: 0**.

## Authorization and Scope

The owner supplied the existing app's public Client ID, then explicitly selected **Start One Read-Only Sign-In** immediately before execution. Exactly one fresh disposable child ran the previously reviewed, unchanged `linear/search-issues` candidate. Its validated authorization link requested `read`, actor `user`, PKCE `S256`, and the previously registered loopback callback. The owner was instructed to open it personally and continue only for TockTeam Linear Test with read-only access.

No browser or Electron window was launched or attached. No issue-write action, CLI/account command, new API key, Keychain operation, Conductor disconnection, or app-registration change occurred. No automatic second attempt ran. The public Client ID, sign-in URL, codes, tokens, provider response bodies, and issue content are omitted from this report.

The progress prompt returned canceled/no confirmation. At the subsequent check, the harness had already finished through its own sign-in deadline; no parent cancellation signal was needed.

## Reviewed Bytes and First-Party Host

The two-file candidate was re-hashed without execution before consent, and its installer digest was checked again before activation:

```text
Candidate digest: c2df04834b38c356524d003b125cfd14ab6ae2487e9863e70d4a946b70615489
JavaScript SHA-256: d1ca909e106e277f6d708048fb86ae141f6b252d47d779c2a5135ad260d0552f
```

The first-party child/API were built only into the disposable proof directory from source HEAD `2cb179b2833ce0eeddc2af7f994567f5b55cc65f`, including the committed Cache and cleanup fixes. Their hashes were checked again immediately before launch:

```text
api.mjs: 72da9680501f54063876bb9f070d1a406f7520c76410cc4180b28edb5fae291f
child.mjs: 19644a21d405aaba942a9439d33b679731e2c4b698499ef40a62fd47253c5f41
```

The fresh harness reuses the earlier proof's manager/install flow, retaining only status and counts. It requires an observed loading list followed by a non-loading list after the validated link; an empty initial projection, loading screen, error detail, or failure toast cannot satisfy its success gate. The first-party sign-in helper expires at 120 seconds; the harness also has a 135-second overall deadline and shared process-group cleanup. The reviewed third-party bundle was not patched for this attempt.

## Local Cleanup Evidence

- Root PID/process group: `99121`; child PID/process group: `99125`.
- Started: `2026-09-30T09:46:07.111Z`; finished: `2026-09-30T09:48:07.393Z`.
- Independent cleanup check: `2026-09-30T09:50:13.312Z`.
- Both recorded PIDs and both process groups were absent (`ESRCH`).
- A connection to `127.0.0.1:38437` was refused.
- The expired link file was absent.
- The owned private-state and child-workspace directories were absent; temporary extension state was removed.

`cleanupError: false` means this run reported no cleanup error. It is **not** evidence that a Linear grant was revoked: no authenticated outcome or current grant listing was observed. The historical provider-cleanup uncertainty remains unresolved. If the owner approved access, they should check **Security & access → Authorized applications** and revoke only **TockTeam Linear Test** if it appears. Leave Conductor and the separate registration untouched.

## Checks and Evidence Limits

Both checks passed before launch and again after shutdown; the `--check` branch does not execute the selected extension:

```bash
node --check /tmp/tockteam-linear-authorized.wurVHg/live.mjs
node /tmp/tockteam-linear-authorized.wurVHg/live.mjs --check
```

Additional assertions verified both candidate hashes, the prepared first-party bundle hashes, the sanitized timeout/count result, and complete local cleanup. Temporary sanitized evidence (`prepared.json`, `launch.json`, `pids.json`, `result.json`, `cleanup.json`) and the first-party harness reside at:

```text
/tmp/tockteam-linear-authorized.wurVHg
```

These are inert evidence, not permission to run an old harness again. Its launch record rejects reuse. No public Client ID is embedded in those proof files.

No production code changed in this follow-up. The earlier 42 passing offline tests/typecheck/build remain separate evidence and were not relabeled as a successful account or installed-Desktop proof. No root build/stage/installed smoke ran, and no installed app was replaced. The primary pilot and dependent release-evidence work remain open; another live attempt requires fresh explicit consent and a fresh harness/link.
