# Ready-Now Linear Read-Only Sign-In

Date: 2026-09-30. Attempt: `tockteam-qwzg.6.5`. Primary pilot: `tockteam-qwzg.6`, still open.

## Result

**The read-only sign-in and issue-list load worked. Automatic cleanup reported a problem.**

The owner clarified that the earlier expired link was never opened, then explicitly said **Start now**. A fresh disposable harness ran exactly one unchanged reviewed candidate. The owner opened the new link personally and reported **Sign-In Finished**. Sanitized runtime evidence:

```text
linkIssued: true
linkedClientIdMatched: true
loadingObserved: true
loadedList: true
issueRows: 4
errorScreen: false
errorCategory: null
cleanupError: true
groupStopped: true
interrupted: false
timedOut: false
```

The four rows are a measured issue-list projection, not an account-wide issue count. This is real read-only access evidence, not merely a successful browser redirect, mock test, or loading screen. No issue content, account details, codes, tokens, provider response bodies, public Client ID, or sign-in URL are retained in this report.

## Cleanup Status

The cleanup warning remains visible and unresolved. **Do not describe automatic token revocation as verified.** The report does not establish whether the warning was caused by a rejected request, deadline, already-revoked token, or another condition.

After being directed to **Settings → Security & access → Authorized applications**, the owner reported **The Test Isn’t Listed**. This records the owner's observation of no visible TockTeam Linear Test connection to revoke. It does not prove that automatic cleanup completed correctly or resolve the warning. Conductor and the separate app registration were left untouched.

All local execution was independently verified stopped:

- Root PID/process group: `22868`; child PID/process group: `22870`.
- Started: `2026-09-30T10:17:59.081Z`; finished: `2026-09-30T10:18:26.711Z`.
- Independent check: `2026-09-30T10:19:12.656Z`.
- Both PIDs and both groups were absent (`ESRCH`).
- `127.0.0.1:38437` refused a connection.
- The sign-in URL file, private-state directory, and child workspace were absent.
- Public Client ID absence was checked in all retained proof files, including the first-party bundles.

No second attempt ran. Only the approved sign-in, read queries, and attempts to revoke this test's own temporary access occurred; there were no issue writes, new API keys, CLI/account commands, Keychain operations, Conductor changes, or app-registration changes.

## Integrity and Host

The approved two-file candidate was re-hashed before execution, and its installer digest was checked before activation:

```text
Candidate digest: c2df04834b38c356524d003b125cfd14ab6ae2487e9863e70d4a946b70615489
JavaScript SHA-256: d1ca909e106e277f6d708048fb86ae141f6b252d47d779c2a5135ad260d0552f
```

The first-party host was freshly built into the proof directory from source HEAD `8f3bed6955fa3be209a14d0c4000c871439ebaeb`. Both runtime bundles matched the prior committed Cache/cleanup repair build, and their hashes were checked again before launch:

```text
api.mjs: 72da9680501f54063876bb9f070d1a406f7520c76410cc4180b28edb5fae291f
child.mjs: 19644a21d405aaba942a9439d33b679731e2c4b698499ef40a62fd47253c5f41
```

The first-party harness source was copied into a new private directory; no old proof was executed. The selected extension was not modified. The authorization link was validated for the owner-supplied identifier, `read`, actor `user`, PKCE `S256`, and the approved loopback callback. The helper retained its 120-second deadline and the harness its 135-second overall bound. The launch record prevents repeating the recorded launch.

No GUI was launched or attached. No root build/stage, installed smoke, or app replacement occurred. This does not prove the installed Desktop surface. No production code changed in this verification follow-up.

## Checks and Follow-Up

These inert state/syntax checks passed before the run and after shutdown; they do not execute the extension:

```bash
node --check /tmp/tockteam-linear-ready-now.1ftOt2/live.mjs
node /tmp/tockteam-linear-ready-now.1ftOt2/live.mjs --check
```

Independent assertions checked process/group/listener shutdown, temporary-state removal, and identifier absence. Sanitized JSON evidence and the first-party harness remain at:

```text
/tmp/tockteam-linear-ready-now.1ftOt2
```

The primary pilot remains open because clean automatic token cleanup is not proven. Investigate the cleanup warning offline with synthetic data before proposing further live verification. No additional sign-in, token request, account lookup, or revocation retry is authorized by this result.
